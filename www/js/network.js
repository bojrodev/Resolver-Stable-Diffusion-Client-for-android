// -----------------------------------------------------------
// NATIVE NETWORK PROXY (CORS BYPASS)
// -----------------------------------------------------------

// 1. Capture the original browser fetch immediately
window.originalFetch = window.originalFetch || window.fetch;

// 2. Helper for Native Capacitor Requests
async function performNativeRequest(url, options = {}) {
    // Fallback if plugin is missing (dev environment)
    if (!window.Capacitor || !window.Capacitor.Plugins.CapacitorHttp) {
        console.warn("[NativeProxy] CapacitorHttp missing, falling back.");
        return window.originalFetch(url, options);
    }

    const method = options.method || 'GET';
    const headers = options.headers || {};
    
    // INJECT CLOUDFLARE CREDENTIALS
    if (connectionConfig.isCloudflare) {
        if (connectionConfig.cfClientId) headers['CF-Access-Client-Id'] = connectionConfig.cfClientId;
        if (connectionConfig.cfClientSecret) headers['CF-Access-Client-Secret'] = connectionConfig.cfClientSecret;
    }

    // Ensure JSON content type for POST/PUT if missing
    if (method !== 'GET' && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    let data = options.body;
    
    // CapacitorHttp Data Normalization
    try {
        if (data && typeof data === 'string') {
            if (headers['Content-Type'] && headers['Content-Type'].includes('json')) {
                data = JSON.parse(data);
            }
        }
    } catch (e) {}

    try {
        const response = await window.Capacitor.Plugins.CapacitorHttp.request({
            method: method,
            url: url,
            headers: headers,
            data: data
        });

        // Return a Fetch-Compatible Response Object
        return {
            ok: response.status >= 200 && response.status < 300,
            status: response.status,
            statusText: response.status >= 200 && response.status < 300 ? "OK" : "Error",
            headers: new Headers(response.headers),
            json: async () => response.data,
            text: async () => typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
            blob: async () => new Blob([JSON.stringify(response.data)])
        };

    } catch (error) {
        console.error("[NativeProxy] Request Failed:", error);
        throw error;
    }
}

// 3. Global Override Logic
window.fetch = async function(input, init) {
    
    // --- FORGE NEO SANITIZER PATCH ---
    try {
        let urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
        if (urlStr.includes('/sdapi/v1/') && init && init.body) {
            let isString = typeof init.body === 'string';
            let payload = isString ? JSON.parse(init.body) : init.body;
            
            if (payload && payload.override_settings) {
                let modifiedSomething = false;
                
                // 1. Purge ONLY the specific legacy memory variables that crash Neo.
                // Leave 'forge_additional_modules' intact so your engine.js flush logic works!
                const toxicKeys = ['forge_inference_memory', 'forge_unet_storage_dtype'];
                toxicKeys.forEach(toxicKey => {
                    if (payload.override_settings[toxicKey] !== undefined) {
                        delete payload.override_settings[toxicKey];
                        modifiedSomething = true;
                    }
                });
                
                // 2. Fix VAE for BOTH servers.
                // Neo crashes looking for a file named "Automatic". Legacy Forge needs an explicit reset.
                // Changing it to "None" safely clears the VAE in both architectures.
                if (payload.override_settings['sd_vae'] === 'Automatic') {
                    payload.override_settings['sd_vae'] = 'None';
                    modifiedSomething = true;
                }
                
                if (modifiedSomething) {
                    init.body = isString ? JSON.stringify(payload) : payload;
                    console.log("[NeoPatch] Payload sanitized. Isolation logic preserved.");
                }
            }
        }
    } catch (e) {
        console.warn("[NeoPatch] Error sanitizing payload", e);
    }
    // ---------------------------------

    // A. VALIDATION CHECK: Only run if Remote + Cloudflare are ON
    if (typeof connectionConfig === 'undefined' || !connectionConfig.isRemote) {
        return window.originalFetch(input, init);
    }

    let url;
    let options = init || {};

    // Normalize input
    if (typeof input === 'string') {
        url = input;
    } else if (input instanceof Request) {
        url = input.url;
        options = { ...options, method: input.method, headers: input.headers };
    } else {
        url = input.toString();
    }

    // B. TARGET FILTERING: Only proxy configured external URLs
    const targetHosts = [
        connectionConfig.extForge, 
        connectionConfig.extWake
    ].filter(h => h && h.length > 0);

    const isTarget = targetHosts.some(host => url.startsWith(host));

    if (isTarget) {
        return performNativeRequest(url, options);
    }

    // Fallback for non-target URLs
    return window.originalFetch(input, init);
};

// -----------------------------------------------------------
// NETWORK & API COMMUNICATION
// -----------------------------------------------------------
function loadHostIp() {
    // Load from new centralized config first
    if (typeof loadConnectionConfig === 'function') {
        loadConnectionConfig();
    }
    
    if (connectionConfig.baseIp) {
        HOST = buildWebUIUrl();
        // Update legacy field for backward compatibility if it exists
        const legacyField = document.getElementById('hostIp');
        if (legacyField) legacyField.value = HOST;
    } else {
        // Fallback to legacy method
        const ip = localStorage.getItem('bojroHostIp');
        if (ip) {
            HOST = ip;
            const legacyField = document.getElementById('hostIp');
            if (legacyField) legacyField.value = ip;
        }
    }
}

window.connect = async function(silent = false) {
    // 1. FORCE STATE SYNC (Safety Check)
    // Directly check the switch to ensure we know the true mode, even if cfg.js missed it
    const modeSwitch = document.getElementById('cfgModeSwitch');
    if (modeSwitch && typeof connectionConfig !== 'undefined') {
        connectionConfig.isRemote = modeSwitch.checked;
    }

    // 2. RESOLVE HOST
    if (typeof connectionConfig !== 'undefined' && connectionConfig.baseIp) {
        // This will now correctly return "" if external is selected but empty
        HOST = buildWebUIUrl(); 
    } else {
        // Legacy fallback
        const legacyField = document.getElementById('hostIp');
        if (legacyField) HOST = legacyField.value.replace(/\/$/, "");
        else if (localStorage.getItem('bojroHostIp')) HOST = localStorage.getItem('bojroHostIp');
    }

    // 3. VALIDATE HOST (Prevents the "Empty URL" Hang)
    // If the URL is empty, stop immediately. Do not try to fetch.
    if (!HOST || HOST.trim() === "") {
        if (!silent) alert("Connection Error: No URL found. Please check your External/Local settings.");
        return;
    }
    
    // TARGET THE BRICK BUTTON
    const btn = document.getElementById('initEngineBtn');

    // Visual State 1: Connecting
    if (btn) {
        btn.classList.remove('active'); 
        if (!silent) {
            btn.innerHTML = `<i data-lucide="cloud-lightning"></i> INITIALIZING...`;
            btn.classList.add('connecting'); 
            if(window.lucide) lucide.createIcons();
        }
    }

    try {
        // 4. TIMEOUT FOR PERMISSIONS (Prevents Plugin Hang)
        // If permissions take longer than 500ms, skip them and proceed to connect
        if (LocalNotifications && !silent) {
            try {
                const permPromise = LocalNotifications.requestPermissions();
                const timeoutPromise = new Promise(r => setTimeout(r, 500));
                
                // Race: Whichever finishes first wins
                const result = await Promise.race([permPromise, timeoutPromise]);
                
                if (result && result.display === 'granted') {
                    // Fire-and-forget the channel creation
                    createNotificationChannel().catch(e => console.warn(e));
                }
            } catch(e) { console.warn("Notif perm skipped", e); }
        }

        // 5. TIMEOUT FOR CONNECTION (Prevents Network Hang)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 Second Timeout

        const res = await fetch(`${HOST}/sdapi/v1/sd-models`, {
            headers: getHeaders(),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId); // Clear timeout if successful

        if (!res.ok) throw new Error("Status " + res.status);

        // Visual State 2: Success
        if (btn) {
            btn.classList.remove('connecting');
            btn.classList.add('active');
            btn.innerHTML = `<i data-lucide="zap"></i> INITIALIZED`;
            if(window.lucide) lucide.createIcons();
        }
        
        localStorage.setItem('bojroHostIp', HOST);
        const genBtn = document.getElementById('genBtn');
        if(genBtn) genBtn.disabled = false;

        await Promise.all([fetchModels(), fetchSamplers(), fetchVaes(), fetchUpscalers()]);

        if (!silent && Toast) Toast.show({
            text: 'Engine Linked',
            duration: 'short',
            position: 'center'
        });

    } catch (e) {
        // Visual State 3: Failure
        if (btn) {
            btn.classList.remove('connecting');
            btn.classList.remove('active');
            
            if (!silent) {
                btn.innerHTML = `<i data-lucide="x-circle"></i> FAILED`;
                if(window.lucide) lucide.createIcons();
                
                // Readable Error Messages
                let msg = e.message;
                if (e.name === 'AbortError') msg = "Connection Timed Out";
                else if (e.message.includes("Failed to fetch")) msg = "Host Unreachable";
                
                alert("Failed: " + msg);
                
                setTimeout(() => {
                    btn.innerHTML = `<i data-lucide="zap-off"></i> INITIALIZE ENGINE`;
                    if(window.lucide) lucide.createIcons();
                }, 2000);
            }
        }
    }
}

async function fetchModels() {
    try {
        const res = await fetch(`${HOST}/sdapi/v1/sd-models`, {
            headers: getHeaders()
        });
        const data = await res.json();
        
        // SORT MODELS ALPHABETICALLY BY NAME
        data.sort((a, b) => a.model_name.localeCompare(b.model_name, undefined, {sensitivity: 'base'}));

        // Helper to safely populate
        const safePopulate = (id, list) => {
            const el = document.getElementById(id);
            if(el) {
                el.innerHTML = "";
                list.forEach(item => el.appendChild(item));
            }
        };

        const optsXL = [];
        const optsFlux = [];
        const optsInp = [];

        data.forEach(m => {
            optsXL.push(new Option(m.model_name, m.title));
            optsFlux.push(new Option(m.model_name, m.title));
            optsInp.push(new Option(m.model_name, m.title));
        });

        safePopulate('xl_modelSelect', optsXL);
        safePopulate('flux_modelSelect', optsFlux);
        safePopulate('inp_modelSelect', optsInp);

        ['xl', 'flux', 'inp'].forEach(mode => {
            const saved = localStorage.getItem('bojroModel_' + mode);
            const el = document.getElementById(mode + '_modelSelect');
            if (saved && el) el.value = saved;
        });

        // --- NEO HOOK: POPULATE QWEN MODELS ---
        if (window.Neo && window.Neo.populateModels) window.Neo.populateModels(data);

    } catch (e) {}
}

async function fetchSamplers() {
    try {
        const res = await fetch(`${HOST}/sdapi/v1/samplers`, {
            headers: getHeaders()
        });
        const data = await res.json();
        
        const optsXL = [];
        const optsInp = [];
        const optsFlux = [];

        data.forEach(s => {
            optsXL.push(new Option(s.name, s.name));
            optsInp.push(new Option(s.name, s.name));
            const opt = new Option(s.name, s.name);
            if (s.name === "Euler") opt.selected = true;
            optsFlux.push(opt);
        });

        const safePopulate = (id, list) => {
            const el = document.getElementById(id);
            if(el) {
                el.innerHTML = "";
                list.forEach(item => el.appendChild(item));
            }
        };

        safePopulate('xl_sampler', optsXL);
        safePopulate('inp_sampler', optsInp);
        safePopulate('flux_sampler', optsFlux);

        // --- NEO HOOK: POPULATE QWEN SAMPLERS ---
        if (window.Neo && window.Neo.populateSamplers) window.Neo.populateSamplers(data);

    } catch (e) {}
}

async function fetchUpscalers() {
    try {
        const res = await fetch(`${HOST}/sdapi/v1/upscalers`, { headers: getHeaders() });
        const data = await res.json();
        ['xl', 'flux', 'qwen'].forEach(mode => {
            const el = document.getElementById(`${mode}_hr_upscaler`);
            if (el) {
                el.innerHTML = "";
                data.forEach(u => el.appendChild(new Option(u.name, u.name)));
                // Restore saved selection
                const saved = localStorage.getItem(`bojro_${mode}_hr_upscaler`);
                if (saved && Array.from(el.options).some(o => o.value === saved)) el.value = saved;
            }
        });
    } catch (e) { console.warn("Upscaler fetch failed", e); }
}

async function fetchVaes() {
    // Safe select wrapper
    const getEl = (id) => document.getElementById(id);
    const slots = [getEl('flux_vae'), getEl('flux_clip'), getEl('flux_t5')].filter(Boolean);
    
    slots.forEach(s => s.innerHTML = "<option value='Automatic'>Automatic</option>");
    
    try {
        const res = await fetch(`${HOST}/sdapi/v1/sd-modules`, {
            headers: getHeaders()
        });
        const data = await res.json();
        if (data && data.length) {
            // SORT MODULES ALPHABETICALLY
            const list = data.map(m => m.model_name).sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));
            
            slots.forEach(sel => {
                list.forEach(name => {
                    if (name !== "Automatic" && !Array.from(sel.options).some(o => o.value === name)) sel.appendChild(new Option(name, name));
                });
            });
            // --- NEO HOOK: POPULATE DUAL (VAE/TE) for QWEN ---
            if (window.Neo && window.Neo.populateDual) window.Neo.populateDual(list);
        }
    } catch (e) {}

    ['flux_vae', 'flux_clip', 'flux_t5'].forEach(id => {
        const saved = localStorage.getItem('bojro_' + id);
        const el = document.getElementById(id);
        if (saved && el && Array.from(el.options).some(o => o.value === saved)) el.value = saved;
    });
    
    const savedBits = localStorage.getItem('bojro_flux_bits');
    const elBits = document.getElementById('flux_bits');
    if (savedBits && elBits) elBits.value = savedBits;

    // --- NEO HOOK: RESTORE QWEN BITS ---
    const savedQwenBits = localStorage.getItem('bojro_qwen_bits');
    const elQwenBits = document.getElementById('qwen_bits');
    if (savedQwenBits && elQwenBits) elQwenBits.value = savedQwenBits;
}

// Helper needed for the Smart Bridge (Neo/LoRA)
async function loadSidecarConfig(loraName, loraPath) {
    if (loraConfigs[loraName]) return loraConfigs[loraName];
    if (!loraPath) return {
        weight: 1.0,
        trigger: ""
    };
    try {
        const basePath = loraPath.substring(0, loraPath.lastIndexOf('.'));
        const jsonUrl = `${HOST}/file=${basePath}.json`;
        const res = await fetch(jsonUrl);
        if (res.ok) {
            const data = await res.json();
            const newConfig = {
                weight: data["preferred weight"] || data["weight"] || 1.0,
                trigger: data["activation text"] || data["trigger words"] || data["trigger"] || ""
            };
            loraConfigs[loraName] = newConfig;
            return newConfig;
        }
    } catch (e) {}
    return {
        weight: 1.0,
        trigger: ""
    };
}

window.unloadModel = async function(silent = false) {
    if (!silent && !confirm("Unload current model?")) return;
    try {
        await fetch(`${HOST}/sdapi/v1/unload-checkpoint`, {
            method: 'POST',
            headers: getHeaders()
        });
        if (!silent) alert("Unloaded");
    } catch (e) {}
}

async function postOption(payload) {
    const res = await fetch(`${HOST}/sdapi/v1/options`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("API Error " + res.status);
}

function normalize(str) {
    if (!str) return "";
    const noHash = str.split(' [')[0].trim();
    return noHash.replace(/\\/g, '/').split('/').pop().toLowerCase();
}

// --- LLM API COMMUNICATION ---

// Helper to resolve settings from DOM or Memory
function getLlmConfig() {
    let baseUrl = "";
    let key = "";
    let model = "";

    // 1. Base URL
    // Only try to build URL if we are Local (baseIp exists) OR if connectionConfig logic allows it.
    // Since we disabled buildLlmUrl for Remote, this will return "" in remote mode.
    if (connectionConfig && typeof buildLlmUrl === 'function') {
        baseUrl = buildLlmUrl();
    }
    
    // Fallbacks
    if (!baseUrl && document.getElementById('llmApiBase')) {
        baseUrl = document.getElementById('llmApiBase').value.replace(/\/$/, "");
    } else if (!baseUrl && llmSettings && llmSettings.baseUrl) {
        baseUrl = llmSettings.baseUrl;
    }

    // ... key and model logic remains the same ...
    if (document.getElementById('llmApiKey')) key = document.getElementById('llmApiKey').value;
    else if (llmSettings && llmSettings.key) key = llmSettings.key;

    if (document.getElementById('llmModelSelect')) model = document.getElementById('llmModelSelect').value;
    else if (llmSettings && llmSettings.model) model = llmSettings.model;

    return { baseUrl, key, model };
}

window.connectToLlm = async function() {
    // We check CapacitorHttp existence, but we will use fetch() to trigger the proxy
    if (!window.Capacitor || !window.Capacitor.Plugins.CapacitorHttp) return alert("Native HTTP Plugin not loaded! Rebuild App.");
    
    const { baseUrl, key } = getLlmConfig();
    
    if (!baseUrl) return alert("Enter Server URL first");

    const btn = event ? event.target : null;
    let originalText = "";
    if (btn) {
        originalText = btn.innerText;
        btn.innerText = "...";
        btn.disabled = true;
    }

    try {
        const headers = {
            'Content-Type': 'application/json'
        };
        if (key) headers['Authorization'] = `Bearer ${key}`;
        
        // --- FIXED: Use fetch() instead of CapacitorHttp.get() ---
        // This forces the request through the global proxy defined at the top,
        // which adds the Cloudflare headers if needed.
        const response = await fetch(`${baseUrl}/v1/models`, {
            method: 'GET',
            headers: headers
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json(); // fetch returns a response object, so we need .json()
        
        const select = document.getElementById('llmModelSelect');
        if (select && data.data && Array.isArray(data.data)) {
            select.innerHTML = "";
            data.data.forEach(m => {
                select.appendChild(new Option(m.id, m.id));
            });
            if (Toast) Toast.show({
                text: `Found ${data.data.length} models`,
                duration: 'short'
            });
        } else if (!data.data) {
            throw new Error("Invalid model format");
        }

        if (typeof saveLlmGlobalSettings === 'function') saveLlmGlobalSettings();

    } catch (e) {
        alert("Link Error: " + (e.message || JSON.stringify(e)));
    } finally {
        if (btn) {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }
}

window.generateLlmPrompt = async function() {
    if (!window.Capacitor || !window.Capacitor.Plugins.CapacitorHttp) return alert("Native HTTP Plugin not loaded!");
    
    const btn = document.getElementById('llmGenerateBtn');
    const inputEl = document.getElementById('llmInput');
    const sysEl = document.getElementById('llmSystemPrompt');
    const outputEl = document.getElementById('llmOutput');
    
    if (!inputEl) return; 

    const inputVal = inputEl.value;
    const { baseUrl, key, model } = getLlmConfig();
    
    if (!inputVal) return alert("Please enter an idea!");
    if (!baseUrl) return alert("Please connect to server first!");

    if(btn) {
        btn.disabled = true;
        btn.innerText = "GENERATING...";
    }

    const sysPrompt = sysEl ? sysEl.value : "";
    
    try {
        const payload = {
            model: model || "default",
            messages: [
                { role: "system", content: sysPrompt }, 
                { role: "user", content: inputVal }
            ],
            temperature: 0.8,
            max_tokens: 300,
            top_p: 0.9,
            repetition_penalty: 1.2,
            stream: false
        };
        
        const headers = { 'Content-Type': 'application/json' };
        if (key) headers['Authorization'] = `Bearer ${key}`;
        
        // --- FIXED: Use fetch() instead of CapacitorHttp.post() ---
        // This ensures headers are injected by the proxy.
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json(); // fetch returns a response object, so we need .json()

        let result = "";
        if (data.choices && data.choices[0] && data.choices[0].message) {
            result = data.choices[0].message.content;
        } else if (data.response) {
            result = data.response;
        }
        
        if(outputEl) outputEl.value = result;
        
        if (llmState && activeLlmMode) {
            llmState[activeLlmMode].output = result;
        }
        
        if (typeof updateLlmButtonState === 'function') updateLlmButtonState();
        
        if (Toast) Toast.show({
            text: 'Prompt Generated!',
            duration: 'short'
        });
    } catch (e) {
        alert("Generation failed: " + (e.message || JSON.stringify(e)));
    } finally {
        if(btn) btn.disabled = false;
        if (typeof updateLlmButtonState === 'function') updateLlmButtonState();
    }
}

window.sendPowerSignal = async function() {
    const btn = document.getElementById('power-btn-mini');
    
    // Use centralized configuration if available
    let serverUrl;
    if (connectionConfig.baseIp) {
        serverUrl = buildWakeUrl();
    } else {
        serverUrl = localStorage.getItem('bojro_power_ip');
    }

    if (!serverUrl) {
        alert("Please set the PC Server IP in settings first!");
        if (typeof togglePowerSettings === 'function') togglePowerSettings();
        return;
    }

    if(btn) btn.classList.add('active');
    
    if (Toast) Toast.show({
        text: 'Sending Wake Signal...',
        duration: 'short'
    });

    try {
        const targetUrl = `${serverUrl}/power`;

        await fetch(targetUrl, {
            method: 'POST'
        });

        if (Toast) Toast.show({
            text: 'Signal Sent! Starting Services...',
            duration: 'long'
        });

        setTimeout(() => {
            if(btn) btn.classList.remove('active');
        }, 3000);

    } catch (error) {
        console.error(error);
        if (Toast) Toast.show({
            text: 'Signal Sent (Or Check Connection)',
            duration: 'short'
        });
        if(btn) btn.classList.remove('active');
    }
}

// --- FIXED KILL SIGNAL FUNCTION ---
window.sendStopSignal = async function() {
    const btn = document.getElementById('kill-btn-mini');
    
    // Resolve URL using exact same priority as Wake button
    let serverUrl;
    if (connectionConfig.baseIp) {
        serverUrl = buildWakeUrl();
    } else {
        serverUrl = localStorage.getItem('bojro_power_ip');
    }

    if (!serverUrl) {
        alert("Please set the PC Server IP in settings first!");
        if (typeof togglePowerSettings === 'function') togglePowerSettings();
        return;
    }

    if(btn) btn.classList.add('active');
    
    if (Toast) Toast.show({
        text: 'Sending KILL Signal...',
        duration: 'short'
    });

    try {
        // Send simple POST request targeting /power/off (matches bojro_app.py route)
        // Headers removed to ensure a "Simple Request" that avoids CORS preflight issues
        const targetUrl = `${serverUrl}/power/off`;

        await fetch(targetUrl, {
            method: 'POST'
        });

        if (Toast) Toast.show({
            text: 'System Halted Successfully',
            duration: 'short'
        });

        setTimeout(() => {
            if(btn) btn.classList.remove('active');
        }, 1000);

    } catch (error) {
        console.error(error);
        if (Toast) Toast.show({
            text: 'Signal Sent (Or Check Connection)',
            duration: 'short'
        });
        if(btn) btn.classList.remove('active');
    }
}

// -----------------------------------------------------------
// PWK (PARTIAL WAKE/KILL) CONTROLS
// -----------------------------------------------------------

window.sendServiceSignal = async function(service, action) {
    // 1. Resolve Server URL (Supports centralized & legacy config)
    let serverUrl;
    if (typeof buildWakeUrl === 'function' && connectionConfig.baseIp) {
        serverUrl = buildWakeUrl();
    } else {
        serverUrl = localStorage.getItem('bojro_power_ip');
    }

    // 2. Validation
    if (!serverUrl) {
        alert("Please set the PC Server IP in settings first!");
        if (typeof switchTab === 'function') switchTab('cfg');
        return;
    }

    // 3. Visual Feedback Setup
    // Targets IDs like: btn-forge-on, btn-comfy-off
    const btnId = `btn-${service}-${action}`; 
    const btn = document.getElementById(btnId);
    
    // Add active state (assumes CSS handles .active or similar)
    if (btn) {
        btn.classList.add('active');
        btn.style.opacity = "0.5"; // Visual press effect
    }

    // Mapping for nicer Toast messages
    const serviceNames = {
        'forge': 'SD Forge',
        'comfy': 'ComfyUI',
        'lm': 'LM Studio'
    };
    const displayName = serviceNames[service] || service.toUpperCase();
    const displayAction = action === 'on' ? 'STARTING' : 'KILLING';

    if (Toast) Toast.show({
        text: `${displayAction} ${displayName}...`,
        duration: 'short'
    });

    try {
        // 4. Construct Endpoint
        // Matches Python routes: /power/forge/on, /power/lm/off, etc.
        const endpoint = `${serverUrl}/power/${service}/${action}`;

        // 5. Send Request
        // No headers needed for simple POST trigger
        const res = await fetch(endpoint, {
            method: 'POST'
        });

        if (!res.ok) throw new Error(`Server returned ${res.status}`);

        // 6. Success
        if (Toast) Toast.show({
            text: `Signal Sent: ${displayName}`,
            duration: 'short'
        });

    } catch (e) {
        console.error("PWK Error:", e);
        if (Toast) Toast.show({
            text: 'Connection Failed (Check PC App)',
            duration: 'short'
        });
    } finally {
        // 7. Cleanup UI
        if (btn) {
            setTimeout(() => {
                btn.classList.remove('active');
                btn.style.opacity = "1";
            }, 500);
        }
    }
}