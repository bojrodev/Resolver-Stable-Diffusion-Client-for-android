// -----------------------------------------------------------
// UI INTERACTION & SETTINGS
// -----------------------------------------------------------

// Default Prompts Configuration
const DEFAULT_PROMPTS = {
    'xl': "1girl, hand fan, solo, black hair, long hair, jewelry, earrings, holding, chinese clothes, hair ornament, holding fan, red nails, looking at viewer, upper body, long sleeves, red lips, folding fan, smoke, hanfu, nail polish, masterpiece, best quality",
    'flux': "textured chalk pastel for subtle highlights, delicate charcoal shading for depth and contrast, warm, earthy color palette with ambient lighting casting soft shadows, A young woman with expressive, natural eyes and a gentle smile, soft oil brushwork adding warmth and depth to her skin, her small cat sitting calmly beside her, cozy and slightly messy living room in the background with books scattered, a warm throw blanket casually draped over the couch, city lights visible through a large window showing the urban landscape at night,",
    'qwen': "a man wearing sun glasses as captain of the guards stands in full regalia, exuding authority and experience. His striking eyes command attention, contrasting with his chestnut curly hair. The bear crest on his armor symbolizes his strength and loyalty. This vivid portrayal, whether a painting or photograph, captures the essence of a formidable and respected knight in exquisite detail and quality",
    'inp': "original"
};

window.toggleTheme = function() {
    const root = document.documentElement;
    const switchEl = document.getElementById('cfgThemeSwitch');
    
    if (switchEl && switchEl.checked) {
        root.setAttribute('data-theme', 'light');
        localStorage.setItem('bojroTheme', 'light');
    } else {
        root.removeAttribute('data-theme');
        localStorage.setItem('bojroTheme', 'dark');
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.loadSavedTheme = function() {
    const saved = localStorage.getItem('bojroTheme');
    const switchEl = document.getElementById('cfgThemeSwitch');
    const root = document.documentElement;

    if (saved === 'light') {
        root.setAttribute('data-theme', 'light');
        if (switchEl) switchEl.checked = true;
    } else {
        root.removeAttribute('data-theme');
        if (switchEl) switchEl.checked = false;
    }
}

window.switchTab = function(view) {
    document.querySelectorAll('[id^="view-"]').forEach(v => v.classList.add('hidden'));
    document.getElementById('view-' + view).classList.remove('hidden');
    const items = document.querySelectorAll('.dock-item');
    items.forEach(item => item.classList.remove('active'));
    if (view === 'gen') {
        items[0].classList.add('active');
        currentTask = 'txt';
    }
    if (view === 'inp') {
        items[1].classList.add('active');
        currentTask = 'inp';
        
        // Enforce Inpaint Sampler Default if needed
        const inpSamplerEl = document.getElementById('inp_sampler');
        const savedSampler = localStorage.getItem('bojro_inp_sampler');
        
        if (savedSampler) {
            if (inpSamplerEl.value !== savedSampler) {
                const optionExists = Array.from(inpSamplerEl.options).some(o => o.value === savedSampler);
                if (optionExists) inpSamplerEl.value = savedSampler;
            }
        } else {
            const targetDefault = "DPM++ 2M SDE";
            const optionExists = Array.from(inpSamplerEl.options).some(o => o.value === targetDefault);
            if (optionExists && inpSamplerEl.value !== targetDefault) {
                inpSamplerEl.value = targetDefault;
                localStorage.setItem('bojro_inp_sampler', targetDefault); 
            }
        }
    }
    if (view === 'que') {
        items[2].classList.add('active');
        if (typeof renderQueueAll === 'function') renderQueueAll();
    }
    if (view === 'gal') {
        items[3].classList.add('active');
        if (typeof loadGallery === 'function') loadGallery();
    }
    if (view === 'ana') items[4].classList.add('active');
    if (view === 'cfg') items[5].classList.add('active'); 
}

window.setMode = async function(mode) {
    currentMode = mode;
    const root = document.documentElement;
    const btnXL = document.getElementById('btn-xl');
    const btnFlux = document.getElementById('btn-flux');
    const btnQwen = document.getElementById('btn-qwen');

    const xlRow = document.getElementById('row-xl-model');
    const fluxRow = document.getElementById('row-flux-model');
    const qwenRow = document.getElementById('row-qwen-model');

    const xlCont = document.getElementById('mode-xl-container');
    const fluxCont = document.getElementById('mode-flux-container');
    const qwenCont = document.getElementById('mode-qwen-container');

    const titleEl = document.getElementById('appTitle');

    // Reset all states
    btnXL.classList.remove('active');
    btnFlux.classList.remove('active');
    if (btnQwen) btnQwen.classList.remove('active');

    xlRow.classList.add('hidden');
    fluxRow.classList.add('hidden');
    if (qwenRow) qwenRow.classList.add('hidden');

    xlCont.classList.add('hidden');
    fluxCont.classList.add('hidden');
    if (qwenCont) qwenCont.classList.add('hidden');

    // --- MODE SWITCHING LOGIC ---
    if (mode === 'flux') {
        root.setAttribute('data-mode', 'flux');
        btnFlux.classList.add('active');
        fluxRow.classList.remove('hidden');
        fluxCont.classList.remove('hidden');
        document.getElementById('genBtn').innerText = "QUANTUM GENERATE";
    } else if (mode === 'qwen') {
        root.setAttribute('data-mode', 'qwen');
        if (btnQwen) btnQwen.classList.add('active');
        if (qwenRow) qwenRow.classList.remove('hidden');
        if (qwenCont) qwenCont.classList.remove('hidden');
        document.getElementById('genBtn').innerText = "TURBO GENERATE";
    } else {
        root.removeAttribute('data-mode');
        btnXL.classList.add('active');
        xlRow.classList.remove('hidden');
        xlCont.classList.remove('hidden');
        document.getElementById('genBtn').innerText = "GENERATE";
    }

    const unifiedTitle = "RESOLVER";
    if (titleEl) {
        titleEl.innerText = unifiedTitle;
        titleEl.setAttribute('data-text', unifiedTitle);
    }
}

// --- FORM HELPERS ---

window.saveSelection = function(key) {
    if (key === 'xl') localStorage.setItem('bojroModel_xl', document.getElementById('xl_modelSelect').value);
    else if (key === 'flux') localStorage.setItem('bojroModel_flux', document.getElementById('flux_modelSelect').value);
    else if (key === 'inp') localStorage.setItem('bojroModel_inp', document.getElementById('inp_modelSelect').value);
    else if (key === 'flux_bits') localStorage.setItem('bojro_flux_bits', document.getElementById('flux_bits').value);
    else if (key === 'inp_content') localStorage.setItem('bojro_inp_content', document.getElementById('inp_content').value);
    else if (key === 'inp_padding') localStorage.setItem('bojro_inp_padding', document.getElementById('inp_padding').value);
    else if (key === 'inp_sampler') localStorage.setItem('bojro_inp_sampler', document.getElementById('inp_sampler').value);
    else if (key === 'qwen') localStorage.setItem('bojroModel_qwen', document.getElementById('qwen_modelSelect').value);
    else if (key === 'qwen_bits') localStorage.setItem('bojro_qwen_bits', document.getElementById('qwen_bits').value);
}

// --- PROMPT SAVING SYSTEM ---

window.savePrompt = function(mode) {
    const el = document.getElementById(`${mode}_prompt`);
    if (el) {
        localStorage.setItem(`bojro_prompt_${mode}`, el.value);
    }
}

window.resetPrompt = function(mode) {
    if (confirm("Reset prompt to default?")) {
        const el = document.getElementById(`${mode}_prompt`);
        if (el) {
            // Check if the user has saved a custom default, otherwise use the hardcoded one
            const customDefault = localStorage.getItem(`bojro_custom_default_${mode}`);
            el.value = customDefault !== null ? customDefault : (DEFAULT_PROMPTS[mode] || "");
            savePrompt(mode); 
        }
    }
}

// Allow the user to save their current text (even if empty) as the new default
window.saveAsNewDefault = function(mode) {
    const el = document.getElementById(`${mode}_prompt`);
    if (el) {
        localStorage.setItem(`bojro_custom_default_${mode}`, el.value);
        if (typeof Toast !== 'undefined' && Toast) {
            Toast.show({ text: 'Saved as new default prompt!', duration: 'short' });
        } else {
            alert("Saved as new default prompt!");
        }
    }
}

// Empties the prompt box
window.clearPrompt = function(mode) {
    const el = document.getElementById(`${mode}_prompt`);
    if (el) {
        el.value = "";
        savePrompt(mode); // Save the empty state
    }
}

window.loadSavedPrompts = function() {
    ['xl', 'flux', 'qwen', 'inp'].forEach(mode => {
        const saved = localStorage.getItem(`bojro_prompt_${mode}`);
        const el = document.getElementById(`${mode}_prompt`);
        
        if (el) {
            if (saved !== null) {
                // Load their last active prompt
                el.value = saved;
            } else {
                // FIRST RUN: No active prompt saved yet.
                // Fall back to their custom default, or the hardcoded default.
                const customDefault = localStorage.getItem(`bojro_custom_default_${mode}`);
                el.value = customDefault !== null ? customDefault : (DEFAULT_PROMPTS[mode] || "");
            }
        }
    });
    window.initHr();
    window.initGlobalUiState();
}

window.saveTrident = function() {
    ['flux_vae', 'flux_clip', 'flux_t5'].forEach(id => localStorage.setItem('bojro_' + id, document.getElementById(id).value));
}

window.setRes = (mode, w, h) => {
    document.getElementById(`${mode}_width`).value = w;
    document.getElementById(`${mode}_height`).value = h;
}
window.flipRes = (mode) => {
    const w = document.getElementById(`${mode}_width`);
    const h = document.getElementById(`${mode}_height`);
    const t = w.value;
    w.value = h.value;
    h.value = t;
}

function loadAutoDlState() {
    const c = document.getElementById('autoDlCheck');
    if (c) c.checked = localStorage.getItem('bojroAutoSave') === 'true';
}
window.saveAutoDlState = () => localStorage.setItem('bojroAutoSave', document.getElementById('autoDlCheck').checked);

// --- CONFIG MODALS (LoRA & POWER) ---

function injectConfigModal() {
    if (document.getElementById('loraConfigModal')) return;
    const div = document.createElement('div');
    div.id = 'loraConfigModal';
    div.className = 'modal hidden';
    div.innerHTML = `
        <div class="modal-content" style="max-height: 60vh;">
            <div class="modal-header">
                <h3 id="cfgLoraTitle" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:80%;">Config</h3>
                <button class="close-btn" onclick="closeConfigModal()">×</button>
            </div>
            <div class="col" style="gap: 15px; padding: 10px 0;">
                <div>
                    <label style="display:flex; justify-content:space-between;">
                        <span>Preferred Weight</span>
                        <span id="cfgWeightDisplay" style="color:var(--accent-primary);">1.0</span>
                    </label>
                    <input type="range" id="cfgWeight" class="orange-slider" min="-2" max="2" step="0.1" value="1" oninput="updateWeightDisplay(this.value)" style="margin-top:5px;">
                </div>
                <div>
                    <label>Activation / Trigger Text</label>
                    <textarea id="cfgTrigger" rows="3" placeholder="trigger, words, here" style="margin-top:5px;"></textarea>
                </div>
                <button id="cfgSaveBtn" class="btn-small" style="background: var(--accent-gradient); color: white; margin-top:10px;">SAVE CONFIG</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
}

window.openLoraSettings = async (e, loraName, loraPath) => {
    e.stopPropagation();
    const modal = document.getElementById('loraConfigModal');
    modal.classList.remove('hidden');
    document.getElementById('cfgLoraTitle').innerText = "Loading...";

    let cfg = loraConfigs[loraName];
    if (!cfg) cfg = await loadSidecarConfig(loraName, loraPath);

    document.getElementById('cfgLoraTitle').innerText = loraName;
    document.getElementById('cfgWeight').value = cfg.weight;
    document.getElementById('cfgWeightDisplay').innerText = cfg.weight;
    document.getElementById('cfgTrigger').value = cfg.trigger;

    document.getElementById('cfgSaveBtn').onclick = () => {
        const newWeight = document.getElementById('cfgWeight').value;
        const newTrigger = document.getElementById('cfgTrigger').value;
        loraConfigs[loraName] = {
            weight: parseFloat(newWeight),
            trigger: newTrigger
        };
        localStorage.setItem('bojroLoraConfigs', JSON.stringify(loraConfigs));
        modal.classList.add('hidden');
        if (Toast) Toast.show({
            text: 'Saved',
            duration: 'short'
        });
    };
}

window.closeConfigModal = () => document.getElementById('loraConfigModal').classList.add('hidden');
window.updateWeightDisplay = (val) => document.getElementById('cfgWeightDisplay').innerText = val;

// --- POWER SETTINGS ---

function loadPowerSettings() {
    const savedIP = localStorage.getItem('bojro_power_ip');
    if (savedIP) {
        const el = document.getElementById('power-server-ip');
        if(el) el.value = savedIP;
    }
}

window.togglePowerSettings = function() {
    const modal = document.getElementById('powerSettingsModal');
    modal.classList.toggle('hidden');
}

window.savePowerSettings = function() {
    const ipInput = document.getElementById('power-server-ip').value.trim();

    if (ipInput) {
        let formattedIP = ipInput;
        if (!formattedIP.startsWith('http')) {
            formattedIP = 'http://' + formattedIP;
        }

        if (formattedIP.endsWith('/')) {
            formattedIP = formattedIP.slice(0, -1);
        }

        localStorage.setItem('bojro_power_ip', formattedIP);
        togglePowerSettings();
        if (Toast) Toast.show({
            text: 'Power Config Saved',
            duration: 'short'
        });
    } else {
        alert("Please enter a valid IP address.");
    }
}

// --- LLM MODALS ---

window.openLlmModal = (mode) => {
    activeLlmMode = mode;
    document.getElementById('llmModal').classList.remove('hidden');
    
    const inputEl = document.getElementById('llmInput');
    const outputEl = document.getElementById('llmOutput');
    const persistentCheck = document.getElementById('llmPersistentCheck');
    const resetBtn = document.getElementById('llmResetBtn');

    inputEl.value = llmState[mode].input;
    outputEl.value = llmState[mode].output;
    persistentCheck.checked = llmState[mode].persistent;
    
    if (llmState[mode].persistent) resetBtn.classList.remove('hidden');
    else resetBtn.classList.add('hidden');

    let savedSys = llmSettings.system_xl;
    if (activeLlmMode === 'flux') savedSys = llmSettings.system_flux;
    else if (activeLlmMode === 'qwen') savedSys = llmSettings.system_qwen;
    document.getElementById('llmSystemPrompt').value = savedSys || "";
    
    updateLlmButtonState();
    if (!inputEl.value) inputEl.focus();
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.closeLlmModal = () => document.getElementById('llmModal').classList.add('hidden');
window.toggleLlmSettings = () => document.getElementById('llmSettingsBox').classList.toggle('hidden');
window.updateLlmState = function() {
    llmState[activeLlmMode].input = document.getElementById('llmInput').value;
}

window.toggleLlmPersistent = function() {
    const isChecked = document.getElementById('llmPersistentCheck').checked;
    llmState[activeLlmMode].persistent = isChecked;
    
    const resetBtn = document.getElementById('llmResetBtn');
    if (isChecked) {
        resetBtn.classList.remove('hidden');
    } else {
        resetBtn.classList.add('hidden');
        llmState[activeLlmMode].history = []; 
    }
}

window.resetLlmHistory = function() {
    if (confirm("Reset current chat history? All previous context for this mode will be deleted.")) {
        llmState[activeLlmMode].history = [];
        if (Toast) Toast.show({ text: 'Context Reset', duration: 'short' });
    }
}

function updateLlmButtonState() {
    const hasOutput = llmState[activeLlmMode].output.trim().length > 0;
    const isPersistent = llmState[activeLlmMode].persistent;
    document.getElementById('llmGenerateBtn').innerText = (isPersistent && hasOutput) ? "ITERATE" : "GENERATE PROMPT";
}

function loadLlmSettings() {
    const s = localStorage.getItem('bojroLlmConfig');
    if (s) {
        const loaded = JSON.parse(s);
        llmSettings = { ...llmSettings, ...loaded };

        const elBase = document.getElementById('llmApiBase');
        if (elBase) elBase.value = llmSettings.baseUrl || '';
        
        const elKey = document.getElementById('llmApiKey');
        if (elKey) elKey.value = llmSettings.key || '';

        if (llmSettings.model) {
            const sel = document.getElementById('llmModelSelect');
            if (sel) {
                sel.innerHTML = `<option value="${llmSettings.model}">${llmSettings.model}</option>`;
                sel.value = llmSettings.model;
            }
        }
    }
}

window.saveLlmGlobalSettings = function() {
    const elBase = document.getElementById('llmApiBase');
    if (elBase) llmSettings.baseUrl = elBase.value.replace(/\/$/, "");
    
    const elKey = document.getElementById('llmApiKey');
    if (elKey) llmSettings.key = elKey.value;
    
    const elModel = document.getElementById('llmModelSelect');
    if (elModel) llmSettings.model = elModel.value;

    const sysVal = document.getElementById('llmSystemPrompt').value;
    if (activeLlmMode === 'xl') llmSettings.system_xl = sysVal;
    else if (activeLlmMode === 'flux') llmSettings.system_flux = sysVal;
    else if (activeLlmMode === 'qwen') llmSettings.system_qwen = sysVal;
    
    localStorage.setItem('bojroLlmConfig', JSON.stringify(llmSettings));
    if (Toast) Toast.show({
        text: 'Settings & Model Saved',
        duration: 'short'
    });
}

window.useLlmPrompt = function() {
    const result = document.getElementById('llmOutput').value;
    if (!result) return alert("Generate a prompt first!");

    let targetId;
    if (activeLlmMode === 'xl') targetId = 'xl_prompt';
    else if (activeLlmMode === 'flux') targetId = 'flux_prompt';
    else if (activeLlmMode === 'qwen') targetId = 'qwen_prompt';

    const targetEl = document.getElementById(targetId);
    if(targetEl) {
        targetEl.value = result;
        closeLlmModal();
        if (Toast) Toast.show({
            text: 'Applied to main prompt!',
            duration: 'short'
        });
    }
}

window.toggleFbcSection = function() {
    toggleGeneric('fbc-settings-content', 'fbc-arrow', 'bojro_vis_fbc');
}

// --- HIGH-RES FIX LOGIC ---

window.resetHr = function(mode) {
    document.getElementById(`${mode}_hr_steps`).value = 6;
    document.getElementById(`${mode}_hr_cfg`).value = 1.0;
    document.getElementById(`${mode}_hr_denoise`).value = 0.4;
    saveHr(mode);
    if (Toast) Toast.show({ text: 'High-Res Defaults Loaded', duration: 'short' });
}

window.saveHr = function(mode) {
    localStorage.setItem(`bojro_${mode}_hr_enable`, document.getElementById(`${mode}_hr_enable`).checked);
    localStorage.setItem(`bojro_${mode}_hr_upscaler`, document.getElementById(`${mode}_hr_upscaler`).value);
    localStorage.setItem(`bojro_${mode}_hr_steps`, document.getElementById(`${mode}_hr_steps`).value);
    localStorage.setItem(`bojro_${mode}_hr_denoise`, document.getElementById(`${mode}_hr_denoise`).value);
    localStorage.setItem(`bojro_${mode}_hr_scale`, document.getElementById(`${mode}_hr_scale`).value);
    localStorage.setItem(`bojro_${mode}_hr_cfg`, document.getElementById(`${mode}_hr_cfg`).value);
}

window.initHr = function() {
    ['xl', 'flux', 'qwen'].forEach(mode => {
        const sEnable = localStorage.getItem(`bojro_${mode}_hr_enable`);
        const elEnable = document.getElementById(`${mode}_hr_enable`);
        if (elEnable) elEnable.checked = (sEnable === 'true');

        const loadVal = (id, def) => {
            const el = document.getElementById(`${mode}_hr_${id}`);
            const saved = localStorage.getItem(`bojro_${mode}_hr_${id}`);
            if (el) el.value = saved !== null ? saved : def;
        };

        loadVal('steps', 6);
        loadVal('cfg', 1.0);
        loadVal('denoise', 0.4);
        loadVal('scale', 1.5);
        
        initGenericSectionClosed(`grp-${mode}-hr`, `arr-${mode}-hr`, `bojro_vis_${mode}_hr`);
    });
}

// --- GLOBAL UI PERSISTENCE INITIALIZER ---

// --- GLOBAL UI PERSISTENCE INITIALIZER ---

window.initGlobalUiState = function() {
    loadSavedTheme(); 
    
    // Main Gen Tab Sections
    initGenericSection('grp-models', 'arr-models', 'bojro_vis_models');
    initGenericSection('grp-xl', 'arr-xl', 'bojro_vis_xl');
    initGenericSection('grp-flux', 'arr-flux', 'bojro_vis_flux');
    initGenericSection('grp-qwen', 'arr-qwen', 'bojro_vis_qwen');
    initGenericSection('grp-flux-trident', 'arr-flux-trident', 'bojro_vis_flux_trident');
    initGenericSection('grp-qwen-modules', 'arr-qwen-modules', 'bojro_vis_qwen_modules');
    initGenericSection('fbc-settings-content', 'fbc-arrow', 'bojro_vis_fbc');
    
    // CFG Tab Sections
    initGenericSection('cfg-appearance', 'arr-cfg-app', 'bojro_vis_cfg_app');
    initGenericSection('cfg-ui', 'arr-cfg-ui', 'bojro_vis_cfg_ui');
    
    // NEW: Local IP & Ports (Defaults to Open)
    initGenericSection('cfg-local-ip', 'arr-cfg-local-ip', 'bojro_vis_cfg_local_ip');
    initGenericSection('cfg-local-ports', 'arr-cfg-local-ports', 'bojro_vis_cfg_local_ports');

    // FIX: RES EXP Persistence
    initGenericSection('cfg-res-exp', 'arr-cfg-res', 'bojro_vis_cfg_res');

    // Closed by default sections
    initGenericSectionClosed('cfg-sys', 'arr-cfg-sys', 'bojro_vis_cfg_sys');
}

// --- GENERIC SECTION TOGGLER (PERSISTENT) ---

window.initGenericSectionClosed = function(contentId, arrowId, storageKey) {
    const savedState = localStorage.getItem(storageKey);
    const content = document.getElementById(contentId);
    const arrow = document.getElementById(arrowId);
    if (savedState === 'open') {
        content.classList.remove('hidden');
        arrow.style.transform = 'rotate(0deg)';
    } else {
        content.classList.add('hidden');
        arrow.style.transform = 'rotate(-90deg)';
    }
}

window.toggleGeneric = function(contentId, arrowId, storageKey) {
    const content = document.getElementById(contentId);
    const arrow = document.getElementById(arrowId);
    const isHidden = content.classList.contains('hidden');

    if (isHidden) {
        content.classList.remove('hidden');
        arrow.style.transform = 'rotate(0deg)'; 
        localStorage.setItem(storageKey, 'open');
    } else {
        content.classList.add('hidden');
        arrow.style.transform = 'rotate(-90deg)'; 
        localStorage.setItem(storageKey, 'closed');
    }
}

window.initGenericSection = function(contentId, arrowId, storageKey) {
    const savedState = localStorage.getItem(storageKey);
    const content = document.getElementById(contentId);
    const arrow = document.getElementById(arrowId);

    if (savedState === 'closed') {
        content.classList.add('hidden');
        arrow.style.transform = 'rotate(-90deg)';
    } else {
        content.classList.remove('hidden');
        arrow.style.transform = 'rotate(0deg)';
    }
}

// Add this at the very bottom of ui.js
if (window.StyleManager && typeof window.StyleManager.init === 'function') {
    window.StyleManager.init();
}