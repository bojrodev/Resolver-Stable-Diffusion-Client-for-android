/* =========================================
   RESOLVER COMFY ENGINE (SPA INTEGRATED)
   ========================================= */

// Renamed globals to avoid conflict with main app
let comfyHost = "127.0.0.1:8188";
let comfySocket = null;
let comfyClientId = crypto.randomUUID();
let comfyLoadedWorkflow = null; 
let comfyInputMap = {}; 
// Find this line at the top
let comfyServerLists = { checkpoints: [], loras: [], vaes: [], clips: [], unets: [], samplers: [], schedulers: [] };

// Sanitises workflow node ids/fields (untrusted JSON) into deterministic DOM-safe ids.
function safeId(s) {
    return String(s).replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Unique ids for dynamically built switches so each label's for= points at its own switch.
let comfySwitchSeq = 0;
function nextComfySwitchId() { return 'comfy_sw_' + (++comfySwitchSeq); }

let comfyRunBuffer = [];        // Stores all images from the current run
let isComfySelectionMode = false; // Tracks if we are selecting images
let selectedComfyImages = new Map(); // Stores DOM Element -> URL

let isComfyGenerating = false;

let selectedTemplates = new Set();
let isTmplSelectionMode = false;

let originalInpHtml = null;

let comfyReconnectAttempts = 0;
let comfyReconnectTimer = null;
const MAX_RECONNECT_DELAY = 30000; // Cap delay at 30 seconds

// --- COMFY EDITOR STATE ---
var isComfyMaskingMode = false;
var comfyMaskTargetNodeId = null;



// --- 1. CONNECTION & SETUP ---

function connectToComfy() {
    // 1. Try to use Centralized Config first
    let host = "";
    if(typeof buildComfyUrl === 'function') {
        host = buildComfyUrl().replace('http://', '').replace('https://', '').replace('/', '');
    } 
    
    // 2. Fallback to manual input or default
    if(!host) {
        const hostInput = document.getElementById('comfyHostInput');
        if(hostInput && hostInput.value) {
            host = hostInput.value.replace('http://', '').replace('https://', '').replace('/', '');
        } else {
            host = "127.0.0.1:8188";
        }
    }

    comfyHost = host;
    updateComfyStatus('connecting');

    try {
        if (comfySocket) {
            // Remove old listeners to prevent duplicate triggers
            comfySocket.onclose = null; 
            comfySocket.close();
        }
        
        comfySocket = new WebSocket(`ws://${comfyHost}/ws?clientId=${comfyClientId}`);

        comfySocket.onopen = async () => {
            console.log("[ComfyUI] Connected!");
            updateComfyStatus('connected');
            
            // RESET BACKOFF ON SUCCESS (Crucial for stability)
            comfyReconnectAttempts = 0; 
            if (comfyReconnectTimer) clearTimeout(comfyReconnectTimer);

            // Fetch all resource lists in parallel
            await Promise.all([
                fetchComfyList('CheckpointLoaderSimple', 'ckpt_name', 'checkpoints'),
                fetchComfyList('LoraLoader', 'lora_name', 'loras'),
                fetchComfyList('VAELoader', 'vae_name', 'vaes'),
                fetchComfyList('CLIPLoader', 'clip_name', 'clips'),
                fetchComfyList('UNETLoader', 'unet_name', 'unets'),
                fetchComfyList('KSampler', 'sampler_name', 'samplers'),
                fetchComfyList('KSampler', 'scheduler', 'schedulers')
            ]);
            
            // Re-build UI if workflow exists to populate dropdowns
            if(comfyLoadedWorkflow) buildComfyUI(comfyLoadedWorkflow);
        };

        comfySocket.onclose = (e) => {
            updateComfyStatus('disconnected');
            
            // EXPONENTIAL BACKOFF LOGIC
            // Tries to reconnect in 1s, then 2s, then 4s, etc.
            const delay = Math.min(1000 * Math.pow(2, comfyReconnectAttempts), MAX_RECONNECT_DELAY);
            console.warn(`[ComfyUI] Disconnected. Reconnecting in ${delay}ms...`);
            
            comfyReconnectTimer = setTimeout(() => {
                comfyReconnectAttempts++;
                connectToComfy();
            }, delay);
        };

        comfySocket.onmessage = (event) => {
            handleComfyMessage(event);
        };
    } catch (e) {
        updateComfyStatus('disconnected');
    }
}

function updateComfyStatus(status) {
    const btn = document.getElementById('comfyConnectBtn');
    if(!btn) return;

    // Reset classes
    btn.classList.remove('connecting', 'active');

    if (status === 'connected') {
        // Connected: Purple Neon Glow
        btn.classList.add('active');
        btn.innerHTML = `<i data-lucide="zap"></i> CONNECTED`;
        if(comfyLoadedWorkflow && !isComfyGenerating) {
            document.getElementById('comfyQueueBtn').disabled = false;
        }
    } else if (status === 'connecting') {
        // Connecting: Green Pulse
        btn.classList.add('connecting');
        btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> CONNECTING...`;
    } else {
        // Disconnected: Standard Grey
        btn.innerHTML = `<i data-lucide="plug"></i> CONNECT`;
        if(document.getElementById('comfyQueueBtn')) document.getElementById('comfyQueueBtn').disabled = true;
    }
    
    if(window.lucide) lucide.createIcons();
}

async function fetchComfyList(nodeType, inputName, targetList) {
    try {
        const res = await fetch(`http://${comfyHost}/object_info/${nodeType}`);
        const data = await res.json();
        const inputs = data[nodeType].input.required;
        
        if (inputs[inputName] && Array.isArray(inputs[inputName][0])) {
            comfyServerLists[targetList] = inputs[inputName][0];
        }
    } catch (e) {
        // console.warn(`Skipping ${nodeType} fetch`);
    }
}

// --- 2. WORKFLOW PARSER & PERSISTENCE ---

function loadWorkflowFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const jsonStr = e.target.result;
            comfyLoadedWorkflow = JSON.parse(jsonStr);
            const fileName = file.name.toUpperCase();
            
            // Update UI
            document.getElementById('comfyLoadedFileName').innerText = fileName;
            buildComfyUI(comfyLoadedWorkflow);
            
            // 1. Save Base Template
            saveComfySession(fileName, jsonStr);
            saveTemplateToDB(fileName, jsonStr);
            
            // 2. FORCE SAVE SNAPSHOT (Fixes the issue)
            // This ensures restoreComfySession() finds this exact state immediately
            localStorage.setItem('bojro_comfy_snapshot', jsonStr);
            localStorage.setItem('bojro_comfy_snapshot_name', fileName);
            
            if (comfySocket && comfySocket.readyState === WebSocket.OPEN) {
                document.getElementById('comfyQueueBtn').disabled = false;
            }
        } catch (err) {
            await window.appAlert("Invalid JSON: " + err.message, { title: 'Invalid JSON', danger: true });
        }
    };
    reader.readAsText(file);
}

function saveComfySession(filename, jsonStr) {
    localStorage.setItem('bojro_comfy_template_name', filename);
    localStorage.setItem('bojro_comfy_template_json', jsonStr);
}

function restoreComfySession() {
    const snapshot = localStorage.getItem('bojro_comfy_snapshot');
    const snapshotName = localStorage.getItem('bojro_comfy_snapshot_name');

    if (snapshot && snapshotName) {
        try {
            comfyLoadedWorkflow = JSON.parse(snapshot);
            const label = document.getElementById('comfyLoadedFileName');
            if(label) label.innerText = snapshotName;
            
            buildComfyUI(comfyLoadedWorkflow);
            console.log("Restored Snapshot:", snapshotName);
            return;
        } catch(e) {
            console.warn("Snapshot corrupted, ignoring...");
        }
    }

    const savedName = localStorage.getItem('bojro_comfy_template_name');
    const savedJson = localStorage.getItem('bojro_comfy_template_json');
    
    if (savedName && savedJson) {
        try {
            comfyLoadedWorkflow = JSON.parse(savedJson);
            const label = document.getElementById('comfyLoadedFileName');
            if(label) label.innerText = savedName;
            buildComfyUI(comfyLoadedWorkflow);
        } catch(e) { console.warn(e); }
    }
}

async function unloadComfyTemplate() {
    if (await window.appConfirm("Unload current template?", { title: 'Unload Template', okText: 'UNLOAD' })) {
        localStorage.removeItem('bojro_comfy_template_name');
        localStorage.removeItem('bojro_comfy_template_json');
        localStorage.removeItem('bojro_comfy_snapshot');
        localStorage.removeItem('bojro_comfy_snapshot_name');
        
        comfyLoadedWorkflow = null;
        comfyInputMap = {};
        
        const container = document.getElementById('comfy-dynamic-controls');
        if(container) container.innerHTML = '';
        
        const label = document.getElementById('comfyLoadedFileName');
        if(label) label.innerText = "NO TEMPLATE LOADED";
        
        const btn = document.getElementById('comfyQueueBtn');
        if(btn) btn.disabled = true;
    }
}

function buildComfyUI(workflow) {
    const container = document.getElementById('comfy-dynamic-controls');
    if(!container) return;
    
    container.innerHTML = ''; 
    comfyInputMap = {}; 

    // 1. Create the "Resources" box (Persistent State)
    const resState = getCollapseClass('resources'); 
    let resourceBox = document.createElement('div');
    resourceBox.className = 'glass-box';
    resourceBox.style.borderLeft = '4px solid var(--accent-secondary)';
    resourceBox.innerHTML = `
        <div class="row" onclick="toggleCollapse(this, 'resources')" style="cursor:pointer; justify-content:space-between; margin-bottom:10px;">
            <label style="font-size:12px; color:var(--accent-secondary); font-weight:900;">💾 MODELS & RESOURCES</label>
            <i data-lucide="chevron-down" size="14"></i>
        </div>
        <div id="comfy-resource-content" class="col ${resState}" style="gap:15px;"></div>
    `;
    let resourceContent = resourceBox.querySelector('#comfy-resource-content');
    let hasResources = false;

    // 2. Create the "Extra Nodes" box (Always Collapsed by Default)
    // We hardcode 'hidden' and the rotation (-90deg) so it starts closed.
    // The onclick toggles it visually but does NOT save to localStorage.
    let extrasBox = document.createElement('div');
    extrasBox.className = 'glass-box';
    extrasBox.style.marginTop = '15px';
    extrasBox.style.borderLeft = '4px solid #777';
    extrasBox.innerHTML = `
        <div class="row" onclick="const c=this.nextElementSibling; c.classList.toggle('hidden'); const i=this.querySelector('svg'); if(i) i.style.transform = c.classList.contains('hidden') ? 'rotate(-90deg)' : 'rotate(0deg)';" style="cursor:pointer; justify-content:space-between; margin-bottom:10px;">
            <label style="font-size:12px; color:#ccc; font-weight:900;">🔧 EXTRA NODES</label>
            <i data-lucide="chevron-down" size="14" style="transition: transform 0.2s; transform: rotate(-90deg);"></i>
        </div>
        <div id="comfy-extras-content" class="col hidden" style="gap:15px;"></div>
    `;
    let extrasContent = extrasBox.querySelector('#comfy-extras-content');
    let hasExtras = false;

    // Sort nodes to keep order consistent
    const nodeIds = Object.keys(workflow).sort((a,b) => parseInt(a) - parseInt(b));

    for (const nodeId of nodeIds) {
        const node = workflow[nodeId];
        const type = node.class_type;
        const title = node._meta ? node._meta.title : type;

        // --- SPECIAL: Power Lora Loader (rgthree) ---
        if (type === 'Power Lora Loader (rgthree)') {
            createPowerLora(container, nodeId, node.inputs, title);
        }

        // --- A. RESOURCE NODES ---
        else if (type.includes('CheckpointLoader')) {
            addComfyDropdown(resourceContent, nodeId, 'ckpt_name', 'CHECKPOINT', comfyServerLists.checkpoints, node.inputs.ckpt_name);
            hasResources = true;
        }
        else if (type.includes('LoraLoader')) {
            addComfyLora(resourceContent, nodeId, title, node.inputs);
            hasResources = true;
        }
        else if (type.includes('VAELoader')) {
            addComfyDropdown(resourceContent, nodeId, 'vae_name', 'VAE', comfyServerLists.vaes, node.inputs.vae_name);
            hasResources = true;
        }
        else if (type.includes('CLIPLoader')) {
            addComfyDropdown(resourceContent, nodeId, 'clip_name', 'CLIP / TE', comfyServerLists.clips, node.inputs.clip_name);
            hasResources = true;
        }
        else if (type.includes('UNETLoader')) {
            addComfyDropdown(resourceContent, nodeId, 'unet_name', 'UNET', comfyServerLists.unets, node.inputs.unet_name);
            hasResources = true;
        }
        
        // --- B. STANDARD NODES (Main UI) ---
        else if (type === 'KSampler' || type === 'KSamplerAdvanced') {
            createComfySampler(container, nodeId, node.inputs, title);
        }
        else if (type === 'CLIPTextEncode') {
            createComfyText(container, nodeId, node.inputs, title);
        }
        else if (type === 'LoadImage') {
            createComfyImageUpload(container, nodeId, node.inputs, title);
        }
        else if (type === 'EmptyLatentImage' || type === 'EmptySD3LatentImage') {
            createComfyResolution(container, nodeId, node.inputs, title);
        }
        
        // --- C. GENERIC FALLBACK (To Extras Box) ---
        else {
            // We append to extrasContent, not the main container
            createGenericNode(extrasContent, nodeId, node.inputs, title);
            hasExtras = true;
        }
    }

    // Insert Boxes at the top or bottom
    if (hasResources) container.insertBefore(resourceBox, container.firstChild);
    
    // Append the Extras box at the very end
    if (hasExtras) container.appendChild(extrasBox);
    
    if(window.lucide) lucide.createIcons();
}

// --- 3. UI GENERATORS (Namespaced & Collapsible) ---

function addComfyDropdown(parent, nodeId, fieldName, label, listData, currentVal) {
    const uid = `in_${safeId(nodeId)}_${safeId(fieldName)}`;
    const options = listData && listData.length > 0
        ? listData.map(f => `<option value="${escapeHtmlAttr(f)}" ${f === currentVal ? 'selected' : ''}>${escapeHtmlAttr(f)}</option>`).join('')
        : `<option value="${escapeHtmlAttr(currentVal)}">${escapeHtmlAttr(currentVal)}</option>`;

    const div = document.createElement('div');
    div.className = 'col';
    div.innerHTML = `
        <div class="row" style="justify-content:space-between">
            <label>${escapeHtmlAttr(label)} <span style="opacity:0.5; font-weight:400;">#${escapeHtmlAttr(nodeId)}</span></label>
        </div>
        <select id="${uid}" onchange="updateComfyValue('${safeId(nodeId)}', '${safeId(fieldName)}', this.value)" style="border-left: 2px solid var(--accent-secondary);">
            ${options}
        </select>
    `;
    parent.appendChild(div);
    comfyInputMap[uid] = { nodeId, field: fieldName };
}

function addComfyLora(parent, nodeId, title, inputs) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'background:rgba(255,255,255,0.03); padding:8px; border-radius:8px; border:1px solid var(--border-color); margin-bottom:10px;';
    
    const listData = comfyServerLists.loras;
    const currentVal = inputs.lora_name;
    const options = listData && listData.length > 0
        ? listData.map(f => `<option value="${escapeHtmlAttr(f)}" ${f === currentVal ? 'selected' : ''}>${escapeHtmlAttr(f)}</option>`).join('')
        : `<option value="${escapeHtmlAttr(currentVal)}">${escapeHtmlAttr(currentVal)}</option>`;

    // Use model strength as the initial display value
    const initialStrength = inputs.strength_model || 1.0;
    const uid = `in_${safeId(nodeId)}_strength`;

    wrapper.innerHTML = `
        <div class="row" style="justify-content:space-between; margin-bottom:5px;">
            <label style="color:var(--accent-secondary); display:block;">🧩 LORA <span style="opacity:0.5">#${escapeHtmlAttr(nodeId)}</span></label>
            <div class="row" style="gap:5px;">
                <button onclick="window.setComfyLoraStrength('${safeId(nodeId)}', 1.0, this)" title="Max Strength"
                    style="background:rgba(76, 175, 80, 0.2); color:#4CAF50; border:1px solid rgba(76, 175, 80, 0.3); width:24px; height:24px; padding:0; display:flex; align-items:center; justify-content:center; border-radius:4px;">
                    <i data-lucide="check" size="14"></i>
                </button>
                <button onclick="window.setComfyLoraStrength('${safeId(nodeId)}', 0.0, this)" title="Disable"
                    style="background:rgba(244,67,54,0.2); color:#f44336; border:1px solid rgba(244,67,54,0.3); width:24px; height:24px; padding:0; display:flex; align-items:center; justify-content:center; border-radius:4px;">
                    <i data-lucide="x" size="14"></i>
                </button>
            </div>
        </div>

        <select id="in_${safeId(nodeId)}_lora_name" onchange="updateComfyValue('${safeId(nodeId)}', 'lora_name', this.value)" style="margin-bottom:8px;">
            ${options}
        </select>

        <div class="col">
            <div class="row" style="justify-content:space-between">
                <label>Strength</label>
                <span id="val_${uid}" style="font-family:monospace; font-size:10px; color:var(--accent-primary)">${escapeHtmlAttr(initialStrength)}</span>
            </div>
            <input type="range" class="orange-slider" id="${uid}" min="0" max="2" step="0.1" value="${escapeHtmlAttr(initialStrength)}"
                oninput="
                    document.getElementById('val_${uid}').innerText = this.value; 
                    updateComfyValue('${safeId(nodeId)}', 'strength_model', this.value);
                    updateComfyValue('${safeId(nodeId)}', 'strength_clip', this.value);
                ">
        </div>
    `;
    
    comfyInputMap[`in_${safeId(nodeId)}_lora_name`] = { nodeId, field: 'lora_name' };
    parent.appendChild(wrapper);
    if(window.lucide) lucide.createIcons();
}

// --- GENERIC NODE BUILDER (The Catch-All) ---
function createGenericNode(parent, nodeId, inputs, title) {
    const wrapper = document.createElement('div');
    wrapper.className = 'glass-box node-group';
    // Grey border to distinguish "Generic" nodes from "Special" ones
    wrapper.style.borderLeft = '4px solid #777'; 

    // safeId keeps this key consistent with toggleCollapse().
    const collapseKey = 'node_' + safeId(nodeId);
    const state = getCollapseClass(collapseKey);

    wrapper.innerHTML = `
        <div class="row" onclick="toggleCollapse(this, '${collapseKey}')" style="cursor:pointer; justify-content:space-between; margin-bottom:10px;">
            <div class="node-header" style="margin:0; color:#ccc"><span>⚙️ ${escapeHtmlAttr(title)}</span> <span style="opacity:0.5">#${escapeHtmlAttr(nodeId)}</span></div>
            <i data-lucide="chevron-down" size="14"></i>
        </div>
        <div class="col ${state}" style="gap:10px;"></div>
    `;
    
    const content = wrapper.querySelector('.col');

    // Loop through every input in the node
    for (const [key, val] of Object.entries(inputs)) {
        // SKIP CONNECTIONS: If value is an array like ["55", 0], it's a wire, not a user setting.
        if (Array.isArray(val)) continue;

        const uid = `gen_${safeId(nodeId)}_${safeId(key)}`;
        
        // 1. Handle BOOLEANS (Checkboxes)
        if (typeof val === 'boolean') {
            const row = document.createElement('div');
            row.className = 'row';
            row.style.justifyContent = 'space-between';
            const swId = nextComfySwitchId();
            row.innerHTML = `
                <label for="${swId}">${escapeHtmlAttr(key)}</label>
                <input type="checkbox" id="${swId}" class="bojro-switch" ${val ? 'checked' : ''} 
                    onchange="updateComfyValue('${safeId(nodeId)}', '${safeId(key)}', this.checked)">
            `;
            content.appendChild(row);
        }
        
        // 2. Handle NUMBERS & STRINGS
        else {
            const isNumber = typeof val === 'number';
            const inputType = isNumber ? 'number' : 'text';
            const stepAttr = isNumber ? 'step="any"' : ''; // Allow decimals
            
            const div = document.createElement('div');
            div.className = 'col';
            div.innerHTML = `
                <label style="opacity:0.7; font-size:10px; margin-bottom:2px;">${escapeHtmlAttr(key)}</label>
                <input type="${inputType}" ${stepAttr} value="${escapeHtmlAttr(val)}" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid var(--border-color); padding:6px; border-radius:4px; color:white;"
                    onchange="updateComfyValue('${safeId(nodeId)}', '${safeId(key)}', this.value)">
            `;
            content.appendChild(div);
        }
    }

    parent.appendChild(wrapper);
}

// --- NEW: COLLAPSIBLE POWER LORA ---
function createPowerLora(parent, nodeId, inputs, title) {
    const wrapper = document.createElement('div');
    wrapper.className = 'glass-box node-group';
    wrapper.style.borderLeft = '4px solid #ab47bc'; 

    // safeId keeps this key consistent with toggleCollapse().
    const collapseKey = 'node_' + safeId(nodeId);
    const state = getCollapseClass(collapseKey);
    const slotsId = `power_slots_${safeId(nodeId)}`;

    wrapper.innerHTML = `
        <div class="row" onclick="toggleCollapse(this, '${collapseKey}')" style="cursor:pointer; justify-content:space-between; margin-bottom:10px;">
            <div class="node-header" style="margin:0; color:#ab47bc"><span>⚡ ${escapeHtmlAttr(title)}</span> <span style="opacity:0.5">#${escapeHtmlAttr(nodeId)}</span></div>
            <i data-lucide="chevron-down" size="14"></i>
        </div>
        <div id="${slotsId}" class="col ${state}" style="gap:10px;"></div>
    `;
    
    const slotsContainer = wrapper.querySelector(`#${slotsId}`);

    const keys = Object.keys(inputs).filter(k => k.startsWith('lora_')).sort();
    keys.forEach(key => {
        renderPowerLoraSlot(slotsContainer, nodeId, key, inputs[key]);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'btn-small dashed';
    addBtn.innerText = "+ ADD LORA SLOT";
    addBtn.style.marginTop = "5px";
    addBtn.onclick = () => addPowerLoraSlot(nodeId);
    
    slotsContainer.appendChild(addBtn);
    parent.appendChild(wrapper);
}

function renderPowerLoraSlot(container, nodeId, key, data) {
    const div = document.createElement('div');
    div.className = 'col';
    div.style.cssText = "background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; margin-bottom:8px; border:1px solid var(--border-color);";
    
    const loraList = comfyServerLists.loras || [];
    const options = loraList.length > 0 
        ? loraList.map(f => `<option value="${escapeHtmlAttr(f)}" ${f === data.lora ? 'selected' : ''}>${escapeHtmlAttr(f)}</option>`).join('')
        : `<option value="${escapeHtmlAttr(data.lora)}">${escapeHtmlAttr(data.lora)}</option>`;
    const valId = `val_${safeId(nodeId)}_${safeId(key)}`;
    const enabledSwId = nextComfySwitchId();

    div.innerHTML = `
        <div class="row" style="justify-content:space-between; margin-bottom:5px; align-items:center;">
            <label style="color:var(--text-main); font-weight:900; margin:0;">${escapeHtmlAttr(key.toUpperCase().replace('_', ' '))}</label>
            
            <div class="row" style="width:auto; gap:8px; align-items:center;">
                <label for="${enabledSwId}" style="margin:0; font-size:9px;">ENABLED</label>
                <input type="checkbox" id="${enabledSwId}" class="bojro-switch" 
                    ${data.on ? 'checked' : ''} 
                    onchange="updateComfyValue('${safeId(nodeId)}', '${safeId(key)}.on', this.checked)">
                
                <button onclick="removePowerLoraSlot('${safeId(nodeId)}', '${safeId(key)}', this)" 
                    style="background:rgba(244,67,54,0.2); color:#f44336; border:1px solid rgba(244,67,54,0.3); width:24px; height:24px; padding:0; display:flex; align-items:center; justify-content:center; border-radius:4px;">
                    <i data-lucide="trash-2" size="14"></i>
                </button>
            </div>
        </div>

        <select onchange="updateComfyValue('${safeId(nodeId)}', '${safeId(key)}.lora', this.value)" style="margin-bottom:8px;">
            ${options}
        </select>

        <div class="row" style="justify-content:space-between">
            <label>Strength</label>
            <span id="${valId}" style="font-family:monospace; font-size:10px; color:var(--accent-primary)">${escapeHtmlAttr(data.strength)}</span>
        </div>
        <input type="range" class="orange-slider" min="0" max="2" step="0.1" value="${escapeHtmlAttr(data.strength)}"
            oninput="document.getElementById('${valId}').innerText = this.value; updateComfyValue('${safeId(nodeId)}', '${safeId(key)}.strength', this.value)">
    `;
    
    container.appendChild(div);
}

async function removePowerLoraSlot(nodeId, key, btn) {
    if (!(await window.appConfirm("Delete this LoRA slot?", { title: 'Delete LoRA Slot', okText: 'DELETE', danger: true }))) return;
    
    // 1. Update Memory: Remove the key from the node inputs
    const node = comfyLoadedWorkflow[nodeId];
    if(node && node.inputs) {
        delete node.inputs[key];
    }
    
    // 2. Update UI: Remove the visual box instantly
    const slotDiv = btn.closest('.col'); // Finds the wrapper div we created in render
    if(slotDiv) slotDiv.remove();
    
    // 3. Save Persistence (So it stays deleted on reload)
    localStorage.setItem('bojro_comfy_snapshot', JSON.stringify(comfyLoadedWorkflow));
    const currentName = document.getElementById('comfyLoadedFileName').innerText;
    localStorage.setItem('bojro_comfy_snapshot_name', currentName);
    
    // 4. Refresh icons
    if(window.lucide) lucide.createIcons();
}

function addPowerLoraSlot(nodeId) {
    const node = comfyLoadedWorkflow[nodeId];
    if (!node || !node.inputs) return;

    const existingKeys = Object.keys(node.inputs).filter(k => k.startsWith('lora_'));
    let maxIdx = 0;
    existingKeys.forEach(k => {
        const num = parseInt(k.split('_')[1]);
        if (num > maxIdx) maxIdx = num;
    });
    const newKey = `lora_${maxIdx + 1}`;
    const defaultLora = comfyServerLists.loras[0] || "None";
    
    node.inputs[newKey] = { "on": true, "lora": defaultLora, "strength": 1.0 };
    updateComfyValue(nodeId, newKey + ".strength", 1.0); 
    
    // Append to UI without rebuilding everything
    const container = document.getElementById(`power_slots_${nodeId}`);
    if (container) {
        // Insert before the "Add Button" (last child)
        const btn = container.lastElementChild;
        renderPowerLoraSlot(container, nodeId, newKey, node.inputs[newKey]);
        container.appendChild(btn); // Move button to bottom
    }
}

// --- NEW: COLLAPSIBLE SAMPLER ---
function createComfySampler(parent, nodeId, inputs, title) {
    const wrapper = document.createElement('div');
    wrapper.className = 'glass-box node-group';
    
    const collapseKey = 'node_' + safeId(nodeId);
    const state = getCollapseClass(collapseKey);

    wrapper.innerHTML = `
        <div class="row" onclick="toggleCollapse(this, '${collapseKey}')" style="cursor:pointer; justify-content:space-between; margin-bottom:10px;">
            <div class="node-header" style="margin:0;"><span>🎛️ ${escapeHtmlAttr(title)}</span> <span style="opacity:0.5">#${escapeHtmlAttr(nodeId)}</span></div>
            <i data-lucide="chevron-down" size="14"></i>
        </div>
        <div class="col ${state}"></div>
    `;
    const content = wrapper.querySelector('.col');

    if (inputs.sampler_name !== undefined) addComfyDropdown(content, nodeId, 'sampler_name', 'Sampler', comfyServerLists.samplers, inputs.sampler_name);
    if (inputs.scheduler !== undefined) addComfyDropdown(content, nodeId, 'scheduler', 'Schedule', comfyServerLists.schedulers, inputs.scheduler);

    if (inputs.steps !== undefined) addComfySlider(content, nodeId, 'steps', 'Steps', inputs.steps, 1, 100, 1);
    if (inputs.cfg !== undefined) addComfySlider(content, nodeId, 'cfg', 'CFG Scale', inputs.cfg, 1, 20, 0.5);
    if (inputs.denoise !== undefined) addComfySlider(content, nodeId, 'denoise', 'Denoise', inputs.denoise, 0, 1, 0.01);

    if (inputs.seed !== undefined && !Array.isArray(inputs.seed)) addComfySeed(content, nodeId, 'seed', inputs.seed);

    parent.appendChild(wrapper);
}

// --- NEW: COLLAPSIBLE TEXT ---
function createComfyText(parent, nodeId, inputs, title) {
    const isNeg = title.toLowerCase().includes('negative') || title.toLowerCase().includes('neg');
    const color = isNeg ? '#f44336' : 'var(--success)';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'glass-box node-group';
    wrapper.style.borderLeftColor = color;
    
    const collapseKey = 'node_' + safeId(nodeId);
    const state = getCollapseClass(collapseKey);
    const textId = `in_${safeId(nodeId)}_text`;

    wrapper.innerHTML = `
        <div class="row" onclick="toggleCollapse(this, '${collapseKey}')" style="cursor:pointer; justify-content:space-between; margin-bottom:10px;">
            <div class="node-header" style="margin:0; color:${color}">
                <span>${isNeg ? '🛡️ NEGATIVE' : '✨ PROMPT'}</span> <span style="opacity:0.5">#${escapeHtmlAttr(nodeId)}</span>
            </div>
            <i data-lucide="chevron-down" size="14"></i>
        </div>
        <div class="col ${state}">
            <textarea id="${textId}" rows="${isNeg ? 2 : 5}" oninput="updateComfyValue('${safeId(nodeId)}', 'text', this.value)">${escapeHtmlAttr(inputs.text)}</textarea>
        </div>
    `;
    parent.appendChild(wrapper);
    comfyInputMap[textId] = { nodeId, field: 'text' };
}

// --- NEW: COLLAPSIBLE RESOLUTION ---
function createComfyResolution(parent, nodeId, inputs, title) {
    const wrapper = document.createElement('div');
    wrapper.className = 'glass-box node-group';
    
    const collapseKey = 'node_' + safeId(nodeId);
    const state = getCollapseClass(collapseKey);

    wrapper.innerHTML = `
        <div class="row" onclick="toggleCollapse(this, '${collapseKey}')" style="cursor:pointer; justify-content:space-between; margin-bottom:10px;">
            <div class="node-header" style="margin:0;"><span>📐 RESOLUTION</span> <span style="opacity:0.5">#${escapeHtmlAttr(nodeId)}</span></div>
            <i data-lucide="chevron-down" size="14"></i>
        </div>
        <div class="col ${state}"></div>
    `;
    const content = wrapper.querySelector('.col');
    
    addComfySlider(content, nodeId, 'width', 'Width', inputs.width, 512, 2048, 64);
    addComfySlider(content, nodeId, 'height', 'Height', inputs.height, 512, 2048, 64);
    
    parent.appendChild(wrapper);
}

// --- NEW: COLLAPSIBLE IMAGE UPLOAD ---
function createComfyImageUpload(parent, nodeId, inputs, title) {
    const wrapper = document.createElement('div');
    wrapper.className = 'glass-box node-group';
    wrapper.style.padding = '10px';

    const safeNodeId = safeId(nodeId);
    const inputId = `file_${safeNodeId}`;
    const thumbId = `thumb_${safeNodeId}`;
    const labelId = `label_${safeNodeId}`;
    const placeholderId = `placeholder_${safeNodeId}`;
    const statusId = `status_${safeNodeId}`;
    const currentImgName = inputs.image || "No image selected";
    const currentImgUrl = inputs.image ? `http://${comfyHost}/view?filename=${inputs.image}&type=input` : '';
    const displayStyle = currentImgUrl ? 'display:block;' : 'display:none;';

    const collapseKey = 'node_' + safeNodeId;
    const state = getCollapseClass(collapseKey);

    wrapper.innerHTML = `
        <div class="row" onclick="toggleCollapse(this, '${collapseKey}')" style="cursor:pointer; justify-content:space-between; margin-bottom:10px;">
            <div class="node-header" style="margin:0;"><span>🖼️ INPUT IMAGE</span> <span style="opacity:0.5">#${escapeHtmlAttr(nodeId)}</span></div>
            <i data-lucide="chevron-down" size="14"></i>
        </div>
        
        <div class="col ${state}">
            <div style="background:rgba(0,0,0,0.3); border-radius:8px; margin-bottom:10px; overflow:hidden; min-height:120px; display:flex; align-items:center; justify-content:center; border:1px solid var(--border-color);">
                <img id="${thumbId}" src="${escapeHtmlAttr(currentImgUrl)}" style="width:100%; height:auto; max-height:250px; object-fit:contain; ${displayStyle}" onerror="this.style.display='none'">
                <div id="${placeholderId}" style="color:var(--text-muted); font-size:10px; ${currentImgUrl ? 'display:none' : 'display:block'}">
                    <i data-lucide="image" size="24" style="opacity:0.5; margin-bottom:5px;"></i><br>NO IMAGE
                </div>
            </div>

            <input type="file" id="${inputId}" accept="image/*" class="hidden" onchange="uploadComfyImage('${safeNodeId}', '${inputId}')">
            
            <div class="row" style="background:var(--bg-input); padding:8px; border-radius:6px; margin-bottom:8px; align-items:center;">
                <i data-lucide="file" size="12" style="color:var(--text-muted); margin-right:6px;"></i>
                <span id="${labelId}" style="font-size:11px; font-family:monospace; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtmlAttr(currentImgName)}</span>
            </div>

            <div class="row" style="gap:8px;">
                <button class="btn-small" onclick="document.getElementById('${inputId}').click()" style="flex:2; background:rgba(255,255,255,0.1);">
                    <i data-lucide="upload" size="12" style="margin-right:4px;"></i> UPLOAD
                </button>
                <button class="btn-small" onclick="startComfyMasking('${safeNodeId}')" style="flex:1; background:var(--accent-secondary); color:white;" title="Mask/Edit">
                    <i data-lucide="brush" size="12"></i>
                </button>
                <button class="btn-small" onclick="clearComfyImage('${safeNodeId}')" style="flex:0 0 32px; background:rgba(244,67,54,0.2); color:#f44336; padding:0; display:flex; align-items:center; justify-content:center; border:1px solid rgba(244,67,54,0.3);" title="Clear Image">
                    <i data-lucide="x" size="14"></i>
                </button>
            </div>
            <div id="${statusId}" style="font-size:9px; color:var(--text-muted); margin-top:5px; text-align:right;"></div>
        </div>
    `;
    
    parent.appendChild(wrapper);
}

async function clearComfyImage(nodeId) {
    if (!(await window.appConfirm("Clear this image?", { title: 'Clear Image', okText: 'CLEAR', danger: true }))) return;

    // 1. Update Memory (Clear input)
    updateComfyValue(nodeId, 'image', '');

    // 2. Update UI Elements
    const thumbImg = document.getElementById(`thumb_${nodeId}`);
    const placeholder = document.getElementById(`placeholder_${nodeId}`);
    const labelSpan = document.getElementById(`label_${nodeId}`);
    const input = document.getElementById(`file_${nodeId}`);
    const status = document.getElementById(`status_${nodeId}`);

    if(thumbImg) {
        thumbImg.src = '';
        thumbImg.style.display = 'none';
    }
    if(placeholder) placeholder.style.display = 'block';
    if(labelSpan) labelSpan.innerText = "No image selected";
    if(input) input.value = ""; // Reset the file picker
    if(status) status.innerText = "";
}

function addComfySlider(parent, nodeId, field, label, val, min, max, step) {
    const uid = `in_${safeId(nodeId)}_${safeId(field)}`;
    const div = document.createElement('div');
    div.className = 'col';
    div.style.marginBottom = "8px";
    div.innerHTML = `
        <div class="row" style="justify-content:space-between">
            <label>${escapeHtmlAttr(label)}</label>
            <span id="val_${uid}" style="font-family:monospace; font-size:10px; color:var(--accent-primary)">${escapeHtmlAttr(val)}</span>
        </div>
        <input type="range" class="orange-slider" id="${uid}" min="${escapeHtmlAttr(min)}" max="${escapeHtmlAttr(max)}" step="${escapeHtmlAttr(step)}" value="${escapeHtmlAttr(val)}"
            oninput="document.getElementById('val_${uid}').innerText = this.value; updateComfyValue('${safeId(nodeId)}', '${safeId(field)}', this.value)">
    `;
    parent.appendChild(div);
    comfyInputMap[uid] = { nodeId, field };
}

function addComfySeed(parent, nodeId, field, val) {
    const uid = `in_${safeId(nodeId)}_${safeId(field)}`;
    const div = document.createElement('div');
    div.className = 'col';
    div.innerHTML = `
        <div class="row" style="justify-content:space-between">
            <label>SEED</label>
            <button class="btn-icon" style="width:20px; height:20px;" onclick="randomizeComfySeed('${uid}')"><i data-lucide="dices" size="12"></i></button>
        </div>
        <input type="number" id="${uid}" value="${escapeHtmlAttr(val)}" onchange="updateComfyValue('${safeId(nodeId)}', '${safeId(field)}', this.value)">
    `;
    parent.appendChild(div);
    comfyInputMap[uid] = { nodeId, field, type: 'int' };
}

// --- 4. EXECUTION ---

function updateComfyValue(nodeId, fieldPath, value) {
    let finalVal = value;
    const node = comfyLoadedWorkflow[nodeId];
    if (!node || !node.inputs) return;

    // 1. Handle Nested Paths (e.g. "lora_1.strength")
    const parts = fieldPath.split('.');
    const parentKey = parts[0];
    const childKey = parts[1];
    
    // 2. Get the OLD value to detect type
    let originalValue;
    if (parts.length === 1) {
        originalValue = node.inputs[fieldPath];
    } else {
        originalValue = node.inputs[parentKey] ? node.inputs[parentKey][childKey] : null;
    }

    // 3. SMART TYPE DETECTION (The Upgrade)
    // If the original was a number, make sure the new one is too.
    if (typeof originalValue === 'number') {
        finalVal = parseFloat(value);
        // If it's an integer (like steps), round it, unless it looks like a float
        if (Number.isInteger(originalValue) && !String(value).includes('.')) {
             finalVal = parseInt(value);
        }
    } 
    else if (typeof originalValue === 'boolean') {
        finalVal = (value === true || value === "true");
    }

    // 4. Apply Update
    if (parts.length === 1) {
        node.inputs[fieldPath] = finalVal;
    } else {
        if (!node.inputs[parentKey]) node.inputs[parentKey] = {};
        node.inputs[parentKey][childKey] = finalVal;
    }

    // 5. Save Persistence
    localStorage.setItem('bojro_comfy_snapshot', JSON.stringify(comfyLoadedWorkflow));
    const currentName = document.getElementById('comfyLoadedFileName').innerText;
    localStorage.setItem('bojro_comfy_snapshot_name', currentName);
}

function randomizeComfySeed(uid) {
    const random = Math.floor(Math.random() * 1000000000000);
    document.getElementById(uid).value = random;
    updateComfyValue(comfyInputMap[uid].nodeId, 'seed', random);
}

async function uploadComfyImage(nodeId, inputId) {
    const fileInput = document.getElementById(inputId);
    const statusSpan = document.getElementById(`status_${nodeId}`);
    const thumbImg = document.getElementById(`thumb_${nodeId}`);
    const placeholder = document.getElementById(`placeholder_${nodeId}`);
    const labelSpan = document.getElementById(`label_${nodeId}`);
    
    if (fileInput.files.length === 0) return;
    
    const file = fileInput.files[0];
    
    // Immediate UI update (Optimistic)
    if(labelSpan) labelSpan.innerText = file.name;

    const formData = new FormData();
    formData.append("image", file);
    formData.append("overwrite", "true");

    if(statusSpan) statusSpan.innerText = "UPLOADING...";

    try {
        const resp = await fetch(`http://${comfyHost}/upload/image`, {
            method: 'POST',
            body: formData
        });
        const data = await resp.json();
        
        // 1. Update Memory
        updateComfyValue(nodeId, 'image', data.name);
        
        // 2. Update Status
        if(statusSpan) {
            statusSpan.innerText = "DONE";
            statusSpan.style.color = "var(--success)";
            setTimeout(() => statusSpan.innerText = "", 2000);
        }

        // 3. Update Visuals
        if (thumbImg) {
            thumbImg.src = `http://${comfyHost}/view?filename=${data.name}&type=input&t=${Date.now()}`;
            thumbImg.style.display = 'block';
        }
        if (placeholder) placeholder.style.display = 'none';
        if (labelSpan) labelSpan.innerText = data.name;

    } catch (e) {
        await window.appAlert("Upload Failed: " + e, { title: 'Upload Failed', danger: true });
        if(statusSpan) statusSpan.innerText = "ERROR";
    }
}

async function queueComfyPrompt() {
    if (!comfySocket || comfySocket.readyState !== WebSocket.OPEN) {
        await window.appAlert("Not Connected!");
        return;
    }

    isComfyGenerating = true;

    // 1. Clear previous run buffer & selection
    comfyRunBuffer = []; 
    if(isComfySelectionMode) toggleComfySelectionMode(); // Exit selection mode if active

    // 2. UI Updates (Spinning State)
    const btn = document.getElementById('comfyQueueBtn');
    btn.disabled = true;
    
    if (typeof updateBatchNotification === 'function') {
        updateBatchNotification("ComfyUI", true, "Generating...");
        }
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> RUNNING...`; // Keeps spinning!
    
    document.getElementById('comfyProgressBar').style.width = "0%";
    document.getElementById('comfyProgressText').innerText = "QUEUED";
    document.getElementById('comfyLivePreview').style.opacity = 0.3;

    // 3. Send Payload
    const payload = {
        prompt: comfyLoadedWorkflow,
        client_id: comfyClientId
    };

    try {
        const res = await fetch(`http://${comfyHost}/prompt`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        console.log("Job ID:", data.prompt_id);
        
        if(window.lucide) lucide.createIcons();
    } catch (e) {
        await window.appAlert("Failed to queue: " + e, { title: 'Queue Failed', danger: true });
        isComfyGenerating = false;
        // Reset button on error
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="play"></i> GENERATE`;
    }
}

async function interruptComfy() {
    try {
        await fetch(`http://${comfyHost}/interrupt`, { method: 'POST' });
        isComfyGenerating = false;
        document.getElementById('comfyProgressText').innerText = "INTERRUPTED";
        document.getElementById('comfyQueueBtn').disabled = false;
        document.getElementById('comfyQueueBtn').innerText = "GENERATE";
    } catch(e) { console.error(e); }
}

// --- 5. HANDLER & SHARED GALLERY ---

function handleComfyMessage(event) {
    // 1. Handle Binary Preview (Live rendering)
    if (event.data instanceof Blob) {
        const url = URL.createObjectURL(event.data);
        const img = document.getElementById('comfyLivePreview');
        if(img) {
            img.src = url;
            img.style.opacity = 1.0;
        }
        return;
    }

    try {
        const msg = JSON.parse(event.data);
        
        // 2. Progress Bar
        if (msg.type === 'progress') {
            const val = msg.data.value;
            const max = msg.data.max;
            const percent = (val / max) * 100;
            const bar = document.getElementById('comfyProgressBar');
            const txt = document.getElementById('comfyProgressText');
            
            if(bar) bar.style.width = percent + "%";
            if(txt) txt.innerText = `STEP ${val} / ${max}`;
        }

        // 3. EXECUTED: An image (intermediate or final) is ready
        // We DO NOT reset the button here. We just add it to the strip.
        if (msg.type === 'executed') {
            if (msg.data.output && msg.data.output.images) {
                const imgData = msg.data.output.images[0];
                const finalUrl = `http://${comfyHost}/view?filename=${imgData.filename}&subfolder=${imgData.subfolder}&type=${imgData.type}`;
                
                // A. Add to Buffer (For Auto-Save later)
                comfyRunBuffer.push(finalUrl);

                // B. Add to ComfyUI Strip (Visual only)
                const gallery = document.getElementById('comfyGalleryContainer');
                if(gallery) {
                    const div = document.createElement('div');
                    div.className = 'gallery-item';
                    
                    div.innerHTML = `
                        <img src="${escapeHtmlAttr(finalUrl)}">
                        <div class="gallery-tag">OUTPUT ${gallery.children.length + 1}</div>
                    `;
                    
                    // Add Click Handler for Selection Logic
                    div.onclick = (e) => handleComfyItemClick(div, finalUrl);
                    
                    gallery.appendChild(div);
                }

                // Update live preview to show the latest result
                const liveImg = document.getElementById('comfyLivePreview');
                if(liveImg) {
                    liveImg.src = finalUrl;
                    liveImg.style.opacity = 1.0;
                }
            }
        }

        // 4. EXECUTION SUCCESS: The WHOLE workflow is done 
        // This corresponds to the protocol where 'execution_success' marks the end of the prompt_id lifecycle.
        if (msg.type === 'execution_success') {
            isComfyGenerating = false;
            const bar = document.getElementById('comfyProgressBar');
            const txt = document.getElementById('comfyProgressText');
            const btn = document.getElementById('comfyQueueBtn');
            
            if(bar) bar.style.width = "100%";
            if(txt) txt.innerText = "COMPLETE";
            if (window.ResolverService) {
                try {
                    window.ResolverService.stop();
                } catch (e) {}
            } else if (window.Capacitor && window.Capacitor.Plugins.ResolverService) {
                try {
                     window.Capacitor.Plugins.ResolverService.stop();
                } catch (e) {}
            }

            // 2. SEND THE FINAL ALERT
            // This makes the sound and says "ComfyUI Generation Complete"
            if (typeof sendCompletionNotification === 'function') {
                sendCompletionNotification("ComfyUI Generation Complete");
            }
            
            // Re-enable Button
            if(btn) {
                btn.disabled = false;
                btn.innerHTML = `<i data-lucide="play"></i> GENERATE`;
                if(window.lucide) lucide.createIcons();
            }

            // AUTO-SAVE: Save ONLY the LAST image from the buffer to History
            if (comfyRunBuffer.length > 0) {
                const lastImage = comfyRunBuffer[comfyRunBuffer.length - 1];
                saveComfyToMainGallery(lastImage);
                console.log("Auto-saved final image:", lastImage);
            }
        }

    } catch (e) {
        // console.warn(e);
    }
}

function saveComfyToMainGallery(url) {
    const xhr = new XMLHttpRequest();
    xhr.onload = function() {
        const reader = new FileReader();
        reader.onloadend = function() {
            // FIX: We use the 'db' variable that is already open at version 2
            if (!db) {
                console.error("Database connection not ready");
                return;
            }

            try {
                const tx = db.transaction(["images"], "readwrite");
                const store = tx.objectStore("images");
                store.add({
                    data: reader.result,
                    date: new Date().toLocaleString()
                });
                console.log("Saved to Gallery Successfully!");

                // This tells the GAL tab to refresh so you see the image immediately
                if (typeof loadGallery === 'function') loadGallery();
                
            } catch (e) {
                console.error("Database Error:", e);
            }
        };
        reader.readAsDataURL(xhr.response);
    };
    xhr.open('GET', url);
    xhr.responseType = 'blob';
    xhr.send();
}

// --- 6. UTILITIES: VIEW & FORCE DOWNLOAD ---

function viewComfyImage(url) {
    const modal = document.getElementById('fullScreenModal');
    const img = document.getElementById('fsImage');
    
    if (modal && img) {
        img.src = url;
        modal.classList.remove('hidden');
        
        // 1. Hide arrows (No navigation for strip images)
        const arrows = modal.querySelectorAll('.nav-arrow');
        arrows.forEach(el => el.style.display = 'none');
        
        // 2. Override Download Button for Cross-Origin logic
        const dlBtn = modal.querySelector('button[onclick="downloadCurrent()"]');
        if (dlBtn) {
            dlBtn.dataset.originalClick = dlBtn.getAttribute('onclick');
            dlBtn.removeAttribute('onclick');
            dlBtn.onclick = () => forceComfyDownload(url);
        }

        // 3. Setup cleanup (Restores normal gallery function)
        const closeBtn = modal.querySelector('.lightbox-controls button');
        if(closeBtn) {
            const cleanup = () => {
                arrows.forEach(el => el.style.display = ''); 
                
                if (dlBtn && dlBtn.dataset.originalClick) {
                    dlBtn.onclick = null;
                    dlBtn.setAttribute('onclick', dlBtn.dataset.originalClick);
                }
                
                closeBtn.removeEventListener('click', cleanup);
            };
            closeBtn.addEventListener('click', cleanup);
        }
    }
}

function forceComfyDownload(url) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    
    xhr.onload = function() {
        if (this.status === 200) {
            const blob = this.response;

            // FIX: Check if we are native (Android)
            const isNative = window.Capacitor && window.Capacitor.isNative;
            const reader = new FileReader();

            if (isNative && typeof saveToMobileGallery === 'function') {
                // 1. Convert Blob to Base64
                reader.onloadend = function() {
                    // 2. Pass to your existing utils.js helper
                    saveToMobileGallery(reader.result, 'comfy');
                }
                reader.readAsDataURL(blob);
            } else {
                // Fallback: browser download, named via buildOutputFileName().
                reader.onloadend = async function() {
                    const filename = await buildOutputFileName(reader.result, 'comfy');
                    const blobUrl = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = blobUrl;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();

                    setTimeout(() => {
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(blobUrl);
                    }, 100);
                }
                reader.readAsDataURL(blob);
            }
        }
    };
    
    xhr.onerror = async () => await window.appAlert("Download Error: Check Connection or CORS", { title: 'Download Error', danger: true });
    xhr.send();
}

// --- 7. CLEAR UI ---
function clearComfyResults() {
    const gallery = document.getElementById('comfyGalleryContainer');
    if (gallery) gallery.innerHTML = "";
    
    const preview = document.getElementById('comfyLivePreview');
    if (preview) {
        preview.src = "";
        preview.style.opacity = 0.3;
    }
    
    const bar = document.getElementById('comfyProgressBar');
    if (bar) bar.style.width = "0%";
    
    const txt = document.getElementById('comfyProgressText');
    if (txt) txt.innerText = "IDLE";
    
    // Clear new buffers
    comfyRunBuffer = []; 
    
    // Force exit selection mode if active
    if(isComfySelectionMode) toggleComfySelectionMode();
}

// --- NEW SELECTION FUNCTIONS ---

function toggleComfySelectionMode() {
    isComfySelectionMode = !isComfySelectionMode;
    const gallery = document.getElementById('comfyGalleryContainer');
    const selectBtn = document.getElementById('comfySelectBtn');
    const saveBtn = document.getElementById('comfySaveSelectedBtn');

    // 1. Toggle the CSS class (This uses your new style.css rules)
    selectBtn.classList.toggle('active', isComfySelectionMode);
    
    // 2. Toggle the text
    selectBtn.innerText = isComfySelectionMode ? "CANCEL" : "SELECT";
    
    if (isComfySelectionMode) {
        gallery.classList.add('selection-mode');
        selectedComfyImages.clear();
        updateComfySelectionUI();
    } else {
        gallery.classList.remove('selection-mode');
        Array.from(gallery.children).forEach(el => el.classList.remove('selected'));
        saveBtn.classList.add('hidden');
    }
}

function handleComfyItemClick(element, url) {
    if (isComfySelectionMode) {
        // Use the DOM Element as the key (Always Unique)
        if (selectedComfyImages.has(element)) {
            // Deselect
            selectedComfyImages.delete(element);
            element.classList.remove('selected');
        } else {
            // Select
            selectedComfyImages.set(element, url);
            element.classList.add('selected');
        }
        updateComfySelectionUI();
    } else {
        // Standard View Mode (Fullscreen)
        viewComfyImage(url);
    }
}

function updateComfySelectionUI() {
    const saveBtn = document.getElementById('comfySaveSelectedBtn');
    const countSpan = document.getElementById('comfySelCount');
    
    countSpan.innerText = selectedComfyImages.size;
    
    // Only show SAVE button if at least 1 image is selected
    if (selectedComfyImages.size > 0) {
        saveBtn.classList.remove('hidden');
    } else {
        saveBtn.classList.add('hidden');
    }
}

function saveSelectedComfyImages() {
    if (selectedComfyImages.size === 0) return;
    
    // Iterate over the Map values (the URLs)
    for (const url of selectedComfyImages.values()) {
        saveComfyToMainGallery(url);
    }
    
    // Visual Feedback
    const btn = document.getElementById('comfySaveSelectedBtn');
    const originalText = btn.innerHTML;
    btn.innerText = "SAVED!";
    
    setTimeout(() => {
        // Exit selection mode automatically after saving
        toggleComfySelectionMode();
        btn.innerHTML = originalText;
    }, 1000);
}


// 1. Function to actually put the file in the database
function saveTemplateToDB(name, json) {
    if (!db) return;
    const tx = db.transaction(["comfy_templates"], "readwrite");
    const store = tx.objectStore("comfy_templates");
    store.put({ name: name, data: json, date: new Date().toLocaleString() });
}

// 2. Open the popup and show the list
async function openComfyTemplateModal() {
    document.getElementById('comfyTemplateModal').classList.remove('hidden');
    renderTemplateList();
    if(window.lucide) lucide.createIcons();
}

// 3. Close the popup and reset settings
function closeComfyTemplateModal() {
    document.getElementById('comfyTemplateModal').classList.add('hidden');
    isTmplSelectionMode = false;
    selectedTemplates.clear();
    const btn = document.getElementById('tmplSelectBtn');
    btn.innerText = "SELECT";
    document.getElementById('tmplDeleteBtn').classList.add('hidden');
}

// 4. Create the list items you see on screen
// --- TEMPLATE MANAGER (Jitter-Free & Persistent) ---

// 4. Create the list items
async function renderTemplateList() {
    const list = document.getElementById('tmplList');
    list.innerHTML = "";
    
    if (!db) return;
    const tx = db.transaction(["comfy_templates"], "readonly");
    const store = tx.objectStore("comfy_templates");
    
    store.getAll().onsuccess = (e) => {
        const all = e.target.result;
        
        if (all.length === 0) {
            list.innerHTML = '<div style="text-align:center; color:var(--text-muted); margin-top:20px;">No templates saved yet.</div>';
            return;
        }

        all.forEach(tmpl => {
            const div = document.createElement('div');
            const isSelected = selectedTemplates.has(tmpl.name);
            
            div.className = `tmpl-item ${isSelected ? 'selected' : ''}`;
            div.style.marginBottom = "8px"; 
            
            // We pre-render the checkmark but hide it if not selected
            div.innerHTML = `
                <div class="tmpl-info">
                    <span class="tmpl-name">${escapeHtmlAttr(tmpl.name)}</span>
                    <span style="font-size:9px; color:var(--text-muted);">${escapeHtmlAttr(tmpl.date)}</span>
                </div>
                <div class="tmpl-check ${isSelected ? '' : 'hidden'}">
                    <i data-lucide="check-circle" size="14" style="color:var(--error);"></i>
                </div>
            `;
            
            // CRITICAL FIX: Pass 'e' (event) AND 'tmpl'
            div.onclick = (e) => handleTmplClick(e, tmpl);
            list.appendChild(div);
        });
        
        if(window.lucide) lucide.createIcons();
    };
}

// 5. Handle Click (Selection or Load)
async function handleTmplClick(event, tmpl) {
    if (isTmplSelectionMode) {
        // Zero-Jitter Selection Logic
        const row = event.currentTarget;
        const checkIcon = row.querySelector('.tmpl-check');

        if (selectedTemplates.has(tmpl.name)) {
            selectedTemplates.delete(tmpl.name);
            row.classList.remove('selected');
            if(checkIcon) checkIcon.classList.add('hidden');
        } else {
            selectedTemplates.add(tmpl.name);
            row.classList.add('selected');
            if(checkIcon) checkIcon.classList.remove('hidden');
        }
        
        // Update ONLY text/buttons (No list re-render)
        updateTmplStats(); 
    } else {
        // Load Logic
        try {
            comfyLoadedWorkflow = JSON.parse(tmpl.data);
            document.getElementById('comfyLoadedFileName').innerText = tmpl.name;
            buildComfyUI(comfyLoadedWorkflow);
            
            // PERSISTENCE FIX: Save as Active Snapshot immediately
            localStorage.setItem('bojro_comfy_snapshot', tmpl.data);
            localStorage.setItem('bojro_comfy_snapshot_name', tmpl.name);
            
            if (comfySocket && comfySocket.readyState === WebSocket.OPEN) {
                document.getElementById('comfyQueueBtn').disabled = false;
            }
            
            closeComfyTemplateModal();
        } catch (e) {
            await window.appAlert("Error loading template: " + e.message, { title: 'Template Load Failed', danger: true });
        }
    }
}

// 6. Mode Toggle
function toggleTmplSelectionMode() {
    isTmplSelectionMode = !isTmplSelectionMode;
    const btn = document.getElementById('tmplSelectBtn');
    
    if (isTmplSelectionMode) {
        btn.innerText = "CANCEL";
        btn.classList.add('btn-cancel-active');
    } else {
        btn.innerText = "SELECT";
        btn.classList.remove('btn-cancel-active');
        selectedTemplates.clear();
    }
    updateTmplUI(); // Full re-render when switching modes
}

// 7a. Full UI Update (For opening/closing/deleting)
function updateTmplUI() {
    renderTemplateList();
    updateTmplStats();
}

// 7b. Stats Update Only (For clicking items - Fast!)
function updateTmplStats() {
    const count = selectedTemplates.size;
    const countLabel = document.getElementById('tmplSelCount');
    const delBtn = document.getElementById('tmplDeleteBtn');
    
    if(countLabel) countLabel.innerText = count;
    
    if (count > 0 && isTmplSelectionMode) {
        delBtn.classList.remove('hidden');
    } else {
        delBtn.classList.add('hidden');
    }
}

// 8. Delete Selected
async function deleteSelectedTemplates() {
    if (selectedTemplates.size === 0) return;
    
    if (await window.appConfirm(`Delete ${selectedTemplates.size} selected templates?`, { title: 'Delete Templates', okText: 'DELETE', danger: true })) {
        const tx = db.transaction(["comfy_templates"], "readwrite");
        const store = tx.objectStore("comfy_templates");
        
        selectedTemplates.forEach(name => {
            store.delete(name);
        });
        
        tx.oncomplete = () => {
            selectedTemplates.clear();
            // Optional: isTmplSelectionMode = false; 
            updateTmplUI(); // Full Refresh needed here
        };
    }
}

// 9. Wipe everything
async function clearAllTemplates() {
    if (await window.appConfirm("Delete ALL saved templates? This cannot be undone.", { title: 'Clear All Templates', okText: 'DELETE ALL', danger: true })) {
        const tx = db.transaction(["comfy_templates"], "readwrite");
        tx.objectStore("comfy_templates").clear();
        tx.oncomplete = () => {
            selectedTemplates.clear();
            isTmplSelectionMode = false;
            renderTemplateList();
            updateTmplUI();
        };
    }
}

// Function to import many JSON files at once
// Upgraded Import Function
async function importMultipleTemplates(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Create a list of "tasks" for every file
    const tasks = Array.from(files).map(file => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const jsonStr = e.target.result;
                    JSON.parse(jsonStr); // Check if it's a real workflow
                    saveTemplateToDB(file.name.toUpperCase(), jsonStr);
                } catch (err) {
                    console.error("Skipped bad file: " + file.name);
                }
                resolve(); // Always finish, even if the file was bad
            };
            reader.readAsText(file);
        });
    });

    // Wait for ALL files to finish loading
    await Promise.all(tasks);
    
    // Refresh the list once at the end
    renderTemplateList();
    
    // Clear the button so you can import again
    event.target.value = ""; 
    
    if(typeof Toast !== 'undefined') {
        Toast.show({ text: `Import process complete`, duration: 'short' });
    }
}

// --- NEW MASKING FUNCTIONS (ROBUST TAB SWITCH) ---

// --- NEW MASKING FUNCTIONS (ROBUST TAB SWITCH) ---

let comfyBaseImage = null; // Stores the clean, original image without orange lines

async function startComfyMasking(nodeId) {
    // 1. Get the image filename from the node
    const node = comfyLoadedWorkflow[nodeId];
    const currentImageName = node.inputs.image;
    
    if (!currentImageName) {
        await window.appAlert("Please upload a base image first!");
        return;
    }

    // 2. Set Global Flags
    isComfyMaskingMode = true;
    comfyMaskTargetNodeId = nodeId;

    // 3. Switch to the Inpaint Tab
    if(typeof switchTab === 'function') switchTab('inp');
    
    // 4. UI Hacking: Hide normal buttons
    const view = document.getElementById('view-inp');
    view.classList.add('comfy-mode-active'); 
    
    document.getElementById('img-input-container').classList.add('hidden');
    document.getElementById('canvasWrapper').classList.remove('hidden');
    if (typeof updateInpResultsAreaVisibility === 'function') updateInpResultsAreaVisibility();
    // Makes canvasWrapper visible independently of setInpaintTopMode().
    if (typeof syncThumbOnlySliderPosition === 'function') syncThumbOnlySliderPosition('brushSize');

    // 5. Create the "APPLY MASK" Toolbar
    let comfyBar = document.getElementById('comfy-mask-bar');
    if (!comfyBar) {
        comfyBar = document.createElement('div');
        comfyBar.id = 'comfy-mask-bar';
        comfyBar.className = 'glass-box';
        comfyBar.style.cssText = "margin-top:10px; background:var(--accent-secondary); border:1px solid var(--accent-primary);";
        comfyBar.innerHTML = `
            <div class="row" style="justify-content:space-between; align-items:center;">
                
                <!-- NEW MODE SWITCHER IN THE TOP BAR -->
                <div class="row" style="width:auto; gap:10px; align-items:center;">
                    <label style="color:white; font-weight:900; margin:0;"><i data-lucide="brush"></i> EDIT:</label>
                    <div class="row" style="width:auto; gap:4px; background:rgba(0,0,0,0.3); padding:4px; border-radius:6px;">
                        <div class="toggle-opt active" id="canvas-mode-mask" onclick="setCanvasMode('mask')" style="color:white; border:none; padding:4px 10px; font-size:10px;">MASK</div>
                        <div class="toggle-opt" id="canvas-mode-paint" onclick="setCanvasMode('paint')" style="color:white; border:none; padding:4px 10px; font-size:10px;">PAINT</div>
                        <input type="color" id="paintColorPicker" value="#ff0000" class="hidden" style="width:24px; height:24px; border:none; padding:0; cursor:pointer;" onchange="updatePaintColor(this.value)">
                    </div>
                </div>

                <!-- APPLY/CANCEL BUTTONS -->
                <div class="row" style="width:auto; gap:10px;">
                    <button class="btn-small" onclick="cancelComfyMasking()" style="background:rgba(0,0,0,0.2); color:white; border:none;">CANCEL</button>
                    <button class="btn-small" onclick="finishComfyMasking()" style="background:white; color:var(--accent-secondary); font-weight:900; border:none;">APPLY</button>
                </div>
            </div>
        `;
        const canvasWrap = document.getElementById('canvasWrapper');
        canvasWrap.insertBefore(comfyBar, canvasWrap.firstChild);
    }
    comfyBar.classList.remove('hidden');

    // 6. Load the Image
    const imageUrl = `http://${comfyHost}/view?filename=${currentImageName}&type=input`;
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imageUrl;
    
    img.onload = () => {
        // STORE THE CLEAN IMAGE GLOBALLLY
        comfyBaseImage = img;

        const canvas = document.getElementById('paintCanvas');
        const ctx = canvas.getContext('2d');
        
        // Resize canvases
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Update Globals for the engine
        if (typeof mainCanvas !== 'undefined') {
            mainCanvas = canvas;
            mainCtx = ctx;
        }
        
        // Draw image on the visual canvas (for user to see)
        ctx.drawImage(img, 0, 0);
        
        // SETUP THE MASK CANVAS (The invisible one)
        // This is where the magic happens. We clear it to transparent.
        // Your engine.js will draw strokes here when you drag your finger.
        if (typeof maskCanvas !== 'undefined' && maskCanvas) {
            maskCanvas.width = img.width;
            maskCanvas.height = img.height;
            const mCtx = maskCanvas.getContext('2d');
            mCtx.clearRect(0,0, maskCanvas.width, maskCanvas.height);
        }
        
        if(window.lucide) lucide.createIcons();
    };
}

function cancelComfyMasking() {
    isComfyMaskingMode = false;
    comfyMaskTargetNodeId = null;
    comfyBaseImage = null; // Clear memory
    
    // 1. Remove the special CSS class
    document.getElementById('view-inp').classList.remove('comfy-mode-active');
    
    // 2. Hide the Comfy Toolbar
    const bar = document.getElementById('comfy-mask-bar');
    if(bar) bar.classList.add('hidden');
    
    // 3. CLEAN THE CANVAS
    const canvas = document.getElementById('paintCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (typeof maskCanvas !== 'undefined' && maskCanvas) {
        const mCtx = maskCanvas.getContext('2d');
        mCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    }

    // 4. RESET UI STATE (Fix for the "Giant Black Image")
    // Hide the canvas wrapper
    document.getElementById('canvasWrapper').classList.add('hidden');
    // Show the original "Upload Box"
    document.getElementById('img-input-container').classList.remove('hidden');
    if (typeof updateInpResultsAreaVisibility === 'function') updateInpResultsAreaVisibility();

    // 5. Switch back to Comfy Tab
    if(typeof switchTab === 'function') switchTab('comfy');
}

async function finishComfyMasking() {
    if (!comfyBaseImage) {
        await window.appAlert("Error: Base image lost.", { title: 'Error', danger: true });
        return;
    }

    // 1. Create Canvas to Composite Original Image + Canvas Edits
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = comfyBaseImage.width;
    tempCanvas.height = comfyBaseImage.height;
    const ctx = tempCanvas.getContext('2d');

    // 2. Draw the clean base image first
    ctx.drawImage(comfyBaseImage, 0, 0);

    // 3. Apply Compositing based on Mode
    if (typeof maskCanvas !== 'undefined' && maskCanvas) {
        if (typeof activeEditorMode !== 'undefined' && activeEditorMode === 'paint') {
            // PAINT MODE: Bake drawn RGB colors on top
            ctx.globalCompositeOperation = 'source-over';
        } else {
            // MASK MODE: Punch transparent holes
            ctx.globalCompositeOperation = 'destination-out';
        }
        ctx.drawImage(maskCanvas, 0, 0);
    }

    // 4. Export composite image to Blob
    tempCanvas.toBlob(async (blob) => {
        const btn = document.querySelector('#comfy-mask-bar button:last-child');
        const oldText = btn ? btn.innerText : '';
        if (btn) btn.innerText = "UPLOADING...";

        const formData = new FormData();
        
        // Dynamically name the file based on the operation
        const prefix = (typeof activeEditorMode !== 'undefined' && activeEditorMode === 'paint') ? 'paint' : 'mask';
        const filename = `${prefix}_edit_${Date.now()}.png`;
        
        formData.append("image", blob, filename);
        formData.append("overwrite", "true");

        try {
            const resp = await fetch(`http://${comfyHost}/upload/image`, {
                method: 'POST',
                body: formData
            });
            const data = await resp.json();

            // 5. Update Comfy Node Logic & Visuals
            updateComfyValue(comfyMaskTargetNodeId, 'image', data.name);
            
            const thumbImg = document.getElementById(`thumb_${comfyMaskTargetNodeId}`);
            const labelSpan = document.getElementById(`label_${comfyMaskTargetNodeId}`);
            
            if (thumbImg) {
                thumbImg.src = `http://${comfyHost}/view?filename=${data.name}&type=input&t=${Date.now()}`;
                thumbImg.style.display = 'block';
            }
            if (labelSpan) {
                labelSpan.innerText = data.name; 
            }
            
            if (btn) btn.innerText = oldText;
            
            // 6. Cleanup & Reset Canvas
            cancelComfyMasking(); 
        } catch (e) {
            await window.appAlert("Upload Failed: " + e.message, { title: 'Upload Failed', danger: true });
            if (btn) btn.innerText = oldText;
        }
    }, 'image/png');
}

// --- COLLAPSE STATE MANAGERS ---

function toggleCollapse(headerElement, uniqueKey) {
    // 1. Toggle the visibility of the next element (the content)
    const content = headerElement.nextElementSibling;
    const isHidden = content.classList.toggle('hidden');
    
    // 2. Save the new state to LocalStorage (Persistent DB)
    // Key format: "bojro_collapse_node_50" or "bojro_collapse_resources"
    localStorage.setItem('bojro_collapse_' + uniqueKey, isHidden);
    
    // 3. Optional: Rotate the arrow if it exists
    const icon = headerElement.querySelector('svg');
    if(icon) {
        icon.style.transition = 'transform 0.2s';
        icon.style.transform = isHidden ? 'rotate(-90deg)' : 'rotate(0deg)';
    }
}

function getCollapseClass(uniqueKey) {
    // Read from DB. Default is '' (visible) if not set.
    // If 'true', return 'hidden' class.
    return localStorage.getItem('bojro_collapse_' + uniqueKey) === 'true' ? 'hidden' : '';
}

// --- FIX: Expose this function to the Window scope ---
window.setComfyLoraStrength = function(nodeId, val, btn) {
    // 1. Animation response
    if (btn) {
        btn.classList.add('btn-pop');
        setTimeout(() => btn.classList.remove('btn-pop'), 200);
    }
    
    // 2. Update BOTH background values
    updateComfyValue(nodeId, 'strength_model', val);
    updateComfyValue(nodeId, 'strength_clip', val);

    // 3. Update the single visual slider
    const slider = document.getElementById(`in_${nodeId}_strength`);
    const text = document.getElementById(`val_in_${nodeId}_strength`);
    if (slider) slider.value = val;
    if (text) text.innerText = val;
};

// 8. AUTO-INIT ON LOAD
document.addEventListener('DOMContentLoaded', restoreComfySession);