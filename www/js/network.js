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
        if (!silent) await window.appAlert("Connection Error: No URL found. Please check your External/Local settings.", { title: 'Connection Error', danger: true });
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
        isEngineConnected = true;
        
        localStorage.setItem('bojroHostIp', HOST);
        const genBtn = document.getElementById('genBtn');
        if(genBtn) genBtn.disabled = false;

        // fetchControlNetOptions() also runs on every successful connection (including re-taps of Initialize Engine), because the ControlNet lists were otherwise only populated once at boot and could stay empty if the server wasn't ready then. It also populates ADetailer's ControlNet model dropdown (populateAdetailerControlNetModels()), which depends on the same fetch.
        await Promise.all([fetchModels(), fetchSamplers(), fetchSchedulers(), fetchVaes(), fetchUpscalers(), fetchAdetailerModels(), fetchControlNetOptions()]);

        // applyAllSavedDefaults() does not run here (it fought the live-state system). Sampler/scheduler are restored in fetchSamplers()/fetchSchedulers(); saved defaults apply only via Load Default.

        if (!silent && Toast) Toast.show({
            text: 'Engine Linked',
            duration: 'short',
            position: 'center'
        });

    } catch (e) {
        // A genuine failure means the connection is gone, so a later resume can retry (unlike a brief interruption).
        isEngineConnected = false;
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
                
                await window.appAlert("Failed: " + msg, { title: 'Connection Failed', danger: true });
                
                setTimeout(() => {
                    btn.innerHTML = `<i data-lucide="zap-off"></i> INITIALIZE ENGINE`;
                    if(window.lucide) lucide.createIcons();
                }, 2000);
            }
        }
    }
}

// Groups a checkpoint list into a "[groupLabel]" optgroup (confident matches) and "Other Models" (uncertain); confident matches for other architectures are excluded. Uses LoraManager's filename heuristic.
function buildGroupedModelOptions(data, arch, groupLabel) {
    const matchGroup = document.createElement('optgroup');
    matchGroup.label = groupLabel;
    const otherGroup = document.createElement('optgroup');
    otherGroup.label = 'Other Models';

    data.forEach(m => {
        const opt = new Option(m.model_name, m.title);
        const detected = window.LoraManager ? window.LoraManager.detectCheckpointArchitectureStrict(m.title) : null;

        if (arch === 'xl') {
            // SDXL is the default architecture, so uncertain titles belong here; only titles confidently tagged for another architecture are excluded.
            if (detected === null || detected === 'xl') matchGroup.appendChild(opt);
        } else if (detected === arch) {
            matchGroup.appendChild(opt);
        } else if (detected === null) {
            // Uncertain: shown rather than hidden.
            otherGroup.appendChild(opt);
        }
        // Confidently a different architecture (including 'xl' by folder name): excluded entirely.
    });

    // Empty groups render nothing (not even a label).
    const groups = [];
    if (matchGroup.children.length > 0) groups.push(matchGroup);
    if (otherGroup.children.length > 0) groups.push(otherGroup);
    return groups;
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

        const optsInp = [];
        const optsImg2img = [];
        data.forEach(m => {
            optsInp.push(new Option(m.model_name, m.title));
            optsImg2img.push(new Option(m.model_name, m.title));
        });

        safePopulate('xl_modelSelect', buildGroupedModelOptions(data, 'xl', 'SDXL Models'));
        safePopulate('flux_modelSelect', buildGroupedModelOptions(data, 'flux', 'Flux Models'));
        safePopulate('inp_modelSelect', optsInp);
        safePopulate('img2img_modelSelect', optsImg2img);
        safePopulate('anima_modelSelect', buildGroupedModelOptions(data, 'anima', 'Anima Models'));
        safePopulate('krea_modelSelect', buildGroupedModelOptions(data, 'krea', 'Krea Models'));

        ['xl', 'flux', 'inp', 'img2img', 'anima', 'krea'].forEach(mode => {
            const saved = localStorage.getItem('bojroModel_' + mode);
            const el = document.getElementById(mode + '_modelSelect');
            if (saved && el) el.value = saved;
        });
        // Setting .value fires no 'change', so refresh the trigger button text.
        if (typeof refreshAllModelPickerTriggers === 'function') refreshAllModelPickerTriggers();
        // Inpaint/img2img Low Bits belongs to the checkpoint just restored
        if (typeof refreshLowBitsControls === 'function') refreshLowBitsControls();

        // Re-check now that the saved checkpoint (not the "Loading..." placeholder) is in the dropdown.
        if (typeof updateInpaintNegativePromptVisibility === 'function') updateInpaintNegativePromptVisibility();
        // The same for the Flux CLIP/T5 module row, for both sub-modes.
        if (typeof updateInpFluxModuleVisibility === 'function') {
            updateInpFluxModuleVisibility('inp');
            updateInpFluxModuleVisibility('img2img');
        }

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

        // Reads each mode's saved sampler from the live-state system before options are shown, avoiding a flash of the server default. inp_sampler is shared by Inpaint/img2img (reads the active sub-mode).
        const savedXL = localStorage.getItem('bojro_xl_live_xl_sampler');
        const savedInp = typeof currentInpaintTopMode !== 'undefined'
            ? localStorage.getItem(`bojro_${currentInpaintTopMode}_state_inp_sampler`)
            : null;
        const savedFlux = localStorage.getItem('bojro_flux_live_flux_sampler');
        const savedAnima = localStorage.getItem('bojro_anima_live_anima_sampler');
        const savedKrea = localStorage.getItem('bojro_krea_live_krea_sampler');

        const optsXL = [];
        const optsInp = [];
        const optsFlux = [];
        const optsAnima = [];
        const optsKrea = [];

        data.forEach(s => {
            const optXL = new Option(s.name, s.name);
            if (savedXL ? s.name === savedXL : false) optXL.selected = true;
            optsXL.push(optXL);

            const optInp = new Option(s.name, s.name);
            if (savedInp ? s.name === savedInp : false) optInp.selected = true;
            optsInp.push(optInp);

            const opt = new Option(s.name, s.name);
            if (savedFlux ? s.name === savedFlux : s.name === "Euler") opt.selected = true;
            optsFlux.push(opt);

            const opt2 = new Option(s.name, s.name);
            if (savedAnima ? s.name === savedAnima : s.name === "Euler") opt2.selected = true;
            optsAnima.push(opt2);

            const opt3 = new Option(s.name, s.name);
            // Krea 2's documented preset: Euler / Simple
            if (savedKrea ? s.name === savedKrea : s.name === "Euler") opt3.selected = true;
            optsKrea.push(opt3);
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
        safePopulate('anima_sampler', optsAnima);
        safePopulate('krea_sampler', optsKrea);

        // --- NEO HOOK: POPULATE QWEN SAMPLERS ---
        if (window.Neo && window.Neo.populateSamplers) window.Neo.populateSamplers(data);

        // None of this fires 'change', so refresh the sampler trigger buttons.
        if (typeof refreshAllModelPickerTriggers === 'function') refreshAllModelPickerTriggers();

    } catch (e) {}
}

// Schedulers are a separate list in Forge; fetched and populated as fetchSamplers().
async function fetchSchedulers() {
    try {
        const res = await fetch(`${HOST}/sdapi/v1/schedulers`, {
            headers: getHeaders()
        });
        const data = await res.json();
        if (!Array.isArray(data)) return;

        const names = data.map(s => s.label || s.name).filter(Boolean);

        // Reads the live-state system directly: assigning a value that isn't yet an option is ignored. Falls back to the DOM value if nothing is saved.
        const savedFor = (mode, fieldId) => {
            if (mode === 'inp') {
                return typeof currentInpaintTopMode !== 'undefined'
                    ? localStorage.getItem(`bojro_${currentInpaintTopMode}_state_${fieldId}`)
                    : null;
            }
            return localStorage.getItem(`bojro_${mode}_live_${fieldId}`);
        };

        const safePopulate = (id, preferDefault, mode) => {
            const el = document.getElementById(id);
            if (!el) return;
            const previousValue = el.value;
            const saved = savedFor(mode, id);
            el.innerHTML = "";
            names.forEach(name => el.appendChild(new Option(name, name)));
            if (saved && names.includes(saved)) {
                el.value = saved;
            } else if (previousValue && names.includes(previousValue)) {
                el.value = previousValue;
            } else if (preferDefault && names.includes(preferDefault)) {
                el.value = preferDefault;
            }
        };

        safePopulate('xl_scheduler', 'Karras', 'xl');
        safePopulate('flux_scheduler', 'Simple', 'flux');
        safePopulate('qwen_scheduler', 'Normal', 'qwen');
        safePopulate('anima_scheduler', 'Normal', 'anima');
        safePopulate('krea_scheduler', 'Simple', 'krea');
        safePopulate('inp_scheduler', 'Karras', 'inp');

        // As fetchSamplers(): no 'change' event fires.
        if (typeof refreshAllModelPickerTriggers === 'function') refreshAllModelPickerTriggers();
    } catch (e) {}
}

async function fetchUpscalers() {
    try {
        const res = await fetch(`${HOST}/sdapi/v1/upscalers`, { headers: getHeaders() });
        const data = await res.json();
        // "None" removed where it isn't meaningful (Hi-Res fix always upscales; Upscaler 1 is required); Upscaler 2 keeps it.
        const dataNoNone = data.filter(u => u.name !== 'None');

        ['xl', 'flux', 'qwen', 'anima', 'krea'].forEach(mode => {
            const el = document.getElementById(`${mode}_hr_upscaler`);
            if (el) {
                el.innerHTML = "";
                dataNoNone.forEach(u => el.appendChild(new Option(u.name, u.name)));
                // Restore saved selection
                const saved = localStorage.getItem(`bojro_${mode}_hr_upscaler`);
                if (saved && Array.from(el.options).some(o => o.value === saved)) el.value = saved;
            }
        });

        // upscaler_1 is required by Forge's API; upscaler_2 is optional, keeping "None" pinned to the top (already in Forge's response).
        const el1 = document.getElementById('upscale_upscaler_1');
        if (el1) {
            el1.innerHTML = "";
            dataNoNone.forEach(u => el1.appendChild(new Option(u.name, u.name)));
            const saved1 = localStorage.getItem('bojro_upscale_upscaler_1');
            if (saved1 && Array.from(el1.options).some(o => o.value === saved1)) el1.value = saved1;
        }
        const el2 = document.getElementById('upscale_upscaler_2');
        if (el2) {
            el2.innerHTML = "";
            data.forEach(u => el2.appendChild(new Option(u.name, u.name)));
            const saved2 = localStorage.getItem('bojro_upscale_upscaler_2');
            if (saved2 && Array.from(el2.options).some(o => o.value === saved2)) el2.value = saved2;
        }

        // Setting .value fires no 'change', so refresh the trigger buttons.
        if (typeof refreshAllModelPickerTriggers === 'function') refreshAllModelPickerTriggers();
    } catch (e) { console.warn("Upscaler fetch failed", e); }
}

// ADetailer's model list has no REST endpoint, so read Gradio's /config for "script_txt2img_adetailer_ad_model"/"script_img2img_adetailer_ad_model". Any failure leaves the static list untouched.
async function fetchAdetailerModels() {
    try {
        const res = await fetch(`${HOST}/config`, { headers: getHeaders() });
        if (!res.ok) {
            console.warn(`ADetailer model list: /config returned ${res.status} - keeping the built-in list.`);
            return;
        }
        const config = await res.json();
        const components = config?.components;
        if (!Array.isArray(components)) {
            console.warn("ADetailer model list: /config response didn't have the expected components array - keeping the built-in list.");
            return;
        }

        const target = components.find(c =>
            c?.props?.elem_id === 'script_txt2img_adetailer_ad_model' ||
            c?.props?.elem_id === 'script_img2img_adetailer_ad_model'
        );
        if (!target) {
            console.warn("ADetailer model list: couldn't find ADetailer's own model dropdown in /config (elem_id may differ in this ADetailer version) - keeping the built-in list.");
            return;
        }

        const rawChoices = target.props?.choices;
        if (!Array.isArray(rawChoices) || rawChoices.length === 0) {
            console.warn("ADetailer model list: found the dropdown, but it had no choices listed - keeping the built-in list.");
            return;
        }

        // Gradio dropdown choices are flat strings or [label, value] tuples depending on version; normalise to the value.
        const modelNames = rawChoices.map(c => Array.isArray(c) ? c[c.length - 1] : c).filter(Boolean);
        if (modelNames.length === 0) {
            console.warn("ADetailer model list: choices were present but empty after parsing - keeping the built-in list.");
            return;
        }

        // "None" removed: a detection pass must detect something.
        const modelNamesNoNone = modelNames.filter(name => name !== 'None');
        if (modelNamesNoNone.length === 0) {
            console.warn("ADetailer model list: only \"None\" was left after filtering it out - keeping the built-in list.");
            return;
        }

        let updated = 0;
        ['xl', 'flux', 'qwen', 'anima', 'krea', 'inp', 'img2img'].forEach(mode => {
            [1, 2, 3, 4, 5, 6, 7, 8].forEach(slot => {
                const el = document.getElementById(`${mode}_adetailer_${slot}_model`);
                if (!el) return;
                const saved = localStorage.getItem(`bojro_${mode}_adetailer_${slot}_model`);
                el.innerHTML = "";
                modelNamesNoNone.forEach(name => el.appendChild(new Option(name, name)));
                if (saved && Array.from(el.options).some(o => o.value === saved)) el.value = saved;
                updated++;
            });
        });

        console.log(`ADetailer model list: successfully fetched ${modelNamesNoNone.length} models from the live server via Gradio's /config, replacing the built-in list on ${updated} dropdowns.`);
        if (typeof refreshAllModelPickerTriggers === 'function') refreshAllModelPickerTriggers();
    } catch (e) {
        console.warn("ADetailer model list: /config fetch failed - keeping the built-in list.", e);
    }
}

async function fetchVaes() {
    // Safe select wrapper
    const getEl = (id) => document.getElementById(id);
    // Inpaint/img2img can load any checkpoint including Flux, so they need CLIP/T5 overrides alongside the single Text Encoder field.
    const slots = [getEl('flux_vae'), getEl('flux_clip'), getEl('flux_t5'), getEl('inp_clip'), getEl('inp_t5'), getEl('img2img_clip'), getEl('img2img_t5')].filter(Boolean);
    const img2imgSlots = [getEl('img2img_vae'), getEl('img2img_te'), getEl('inp_vae'), getEl('inp_te'), getEl('anima_vae'), getEl('anima_te'), getEl('krea_vae'), getEl('krea_te')].filter(Boolean);

    slots.forEach(s => s.innerHTML = "<option value='Automatic'>Automatic</option>");
    img2imgSlots.forEach((s, i) => s.innerHTML = i % 2 === 0 ? "<option value='Automatic'>Automatic</option>" : "<option value='None'>None</option>");

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
            img2imgSlots.forEach(sel => {
                list.forEach(name => {
                    if (name !== "Automatic" && !Array.from(sel.options).some(o => o.value === name)) sel.appendChild(new Option(name, name));
                });
            });
            // --- NEO HOOK: POPULATE DUAL (VAE/TE) for QWEN ---
            if (window.Neo && window.Neo.populateDual) window.Neo.populateDual(list);
        }
    } catch (e) {}

    ['flux_vae', 'flux_clip', 'flux_t5', 'inp_clip', 'inp_t5', 'img2img_clip', 'img2img_t5'].forEach(id => {
        const saved = localStorage.getItem('bojro_' + id);
        const el = document.getElementById(id);
        if (saved && el && Array.from(el.options).some(o => o.value === saved)) el.value = saved;
    });

    ['img2img_vae', 'img2img_te', 'inp_vae', 'inp_te', 'anima_vae', 'anima_te', 'krea_vae', 'krea_te'].forEach(id => {
        const saved = localStorage.getItem('bojro_' + id);
        const el = document.getElementById(id);
        if (saved && el && Array.from(el.options).some(o => o.value === saved)) el.value = saved;
    });
    
    // Low Bits is remembered per tab (engine.js getLowBitsForMode); this puts the stored values into the two selects.
    if (typeof refreshLowBitsControls === 'function') refreshLowBitsControls();

    // Setting a select's value fires no 'change', so refresh each trigger button (modelpicker.js).
    if (typeof refreshAllModelPickerTriggers === 'function') refreshAllModelPickerTriggers();
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
            try {
                localStorage.setItem('bojroLoraConfigs', JSON.stringify(loraConfigs));
            } catch (e) {}
            return newConfig;
        }
    } catch (e) {}
    return {
        weight: 1.0,
        trigger: ""
    };
}

window.unloadModel = async function(silent = false) {
    if (!silent && !(await window.appConfirm("Unload current model?", { title: 'Unload Model', okText: 'UNLOAD' }))) return;
    try {
        await fetch(`${HOST}/sdapi/v1/unload-checkpoint`, {
            method: 'POST',
            headers: getHeaders()
        });
        if (!silent && typeof Toast !== 'undefined') Toast.show({ text: 'VRAM cleared', duration: 'short' });
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

window.generateLlmPrompt = async function() {
    if (!window.Capacitor || !window.Capacitor.Plugins.CapacitorHttp) {
        await window.appAlert("Native HTTP Plugin not loaded!");
        return;
    }
    
    const btn = document.getElementById('llmGenerateBtn');
    const inputEl = document.getElementById('llmInput');
    const sysEl = document.getElementById('llmSystemPrompt');
    const outputEl = document.getElementById('llmOutput');
    
    if (!inputEl) return; 

    const inputVal = inputEl.value;
    if (!inputVal) {
        await window.appAlert("Please enter an idea!");
        return;
    }

    let { baseUrl, key, model } = getLlmConfig();

    const modelSelect = document.getElementById('llmModelSelect');
    const notYetLinked = !modelSelect || !modelSelect.value;
    if (notYetLinked) {
        if (typeof connectToLlmService === 'function') {
            await connectToLlmService();
            ({ baseUrl, key, model } = getLlmConfig());
        }
        if (!modelSelect || !modelSelect.value) return; // connectToLlmService already alerted on failure
    }

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
        await window.appAlert("Generation failed: " + (e.message || JSON.stringify(e)), { title: 'Generation Failed', danger: true });
    } finally {
        if(btn) btn.disabled = false;
        if (typeof updateLlmButtonState === 'function') updateLlmButtonState();
    }
}

// --- CONTROLNET (Inpaint + img2img) ---
// Populates both modes' Preprocessor/Model dropdowns from ControlNet's API (no-op if not installed). One shared mode list keeps the places below in step.
const CONTROLNET_MODES = ['inp', 'img2img', 'xl', 'flux', 'qwen', 'anima', 'krea'];

async function fetchControlNetOptions() {
    const units = [0, 1, 2];
    const moduleEls = CONTROLNET_MODES.flatMap(m => units.map(u => document.getElementById(`${m}_cn_${u}_module`))).filter(Boolean);
    const modelEls = CONTROLNET_MODES.flatMap(m => units.map(u => document.getElementById(`${m}_cn_${u}_model`))).filter(Boolean);
    if (moduleEls.length === 0 && modelEls.length === 0) return;

    try {
        const [modRes, mdlRes] = await Promise.all([
            fetch(`${HOST}/controlnet/module_list`, { headers: getHeaders() }),
            fetch(`${HOST}/controlnet/model_list`, { headers: getHeaders() })
        ]);
        const modData = await modRes.json();
        const mdlData = await mdlRes.json();

        if (Array.isArray(modData.module_list)) {
            // Preprocessor "None" stays: it is a real choice (use the control image as given).
            moduleEls.forEach(sel => {
                sel.innerHTML = '';
                modData.module_list.forEach(name => sel.appendChild(new Option(name, name)));
            });
            // Kept so Control Type's "All" can restore the full list (specific types replace the options).
            window.controlNetFullModuleList = modData.module_list;
        }
        if (Array.isArray(mdlData.model_list)) {
            // "None" filtered out of the model list: "no model" isn't a useful choice while ControlNet is enabled.
            const modelsNoNone = mdlData.model_list.filter(name => name !== 'None');
            modelEls.forEach(sel => {
                sel.innerHTML = '';
                modelsNoNone.forEach(name => sel.appendChild(new Option(name, name)));
            });
            // Same reasoning as controlNetFullModuleList above.
            window.controlNetFullModelList = modelsNoNone;
        }

        if (typeof populateAdetailerControlNetModels === 'function') populateAdetailerControlNetModels();

        CONTROLNET_MODES.forEach(mode => {
            units.forEach(unit => {
                const moduleSel = document.getElementById(`${mode}_cn_${unit}_module`);
                const modelSel = document.getElementById(`${mode}_cn_${unit}_model`);
                const savedModule = localStorage.getItem(`bojro_${mode}_cn_${unit}_module`);
                const savedModel = localStorage.getItem(`bojro_${mode}_cn_${unit}_model`);
                if (moduleSel && savedModule && Array.from(moduleSel.options).some(o => o.value === savedModule)) moduleSel.value = savedModule;
                if (modelSel && savedModel && Array.from(modelSel.options).some(o => o.value === savedModel)) modelSel.value = savedModel;
                // Setting .value fires no 'change', so refresh each select's trigger button (as applyImg2imgPresetData()'s setIfExists()).
                if (typeof updateModelPickerTriggerText === 'function') {
                    updateModelPickerTriggerText(`${mode}_cn_${unit}_module`);
                    updateModelPickerTriggerText(`${mode}_cn_${unit}_model`);
                }
            });
        });
    } catch (e) {
        console.warn("ControlNet options fetch failed (extension may not be installed):", e);
        // Surfaces a failure to fetch the ControlNet lists in the console instead of staying silent (a stuck "Loading..." placeholder could otherwise be sent as a model name; see buildControlNetScriptPayload()).
        if (Toast) Toast.show({ text: 'ControlNet options failed to load', duration: 'short' });
    }
}

// ADetailer's own ControlNet integration (ad_controlnet_model etc, per pass, no separate script) reuses this model list (window.controlNetFullModelList). "None" is kept (it is the on/off state) and "Passthrough" is added (ADetailer's own value for using the settings outside ADetailer).
// Only models matching ADetailer's server-side validator are offered: ad_controlnet_model is regex-constrained to names containing certain keywords (or "None"), and a mismatch rejects the whole request. Filtering the choices prevents that.
// Also populates each pass's Preprocessor (ad_controlnet_module) from the live list (window.controlNetFullModuleList).
const ADETAILER_CN_MODEL_REGEX = /inpaint|tile|scribble|lineart|openpose|depth/i;
function populateAdetailerControlNetModels() {
    // Two independent guards, so a missing model list doesn't skip module population, or the reverse.
    const compatibleModels = Array.isArray(window.controlNetFullModelList)
        ? window.controlNetFullModelList.filter(name => ADETAILER_CN_MODEL_REGEX.test(name))
        : null;
    CONTROLNET_MODES.forEach(mode => {
        for (let n = 1; n <= 8; n++) {
            const sel = document.getElementById(`${mode}_adetailer_${n}_cn_model`);
            if (sel && compatibleModels) {
                const previousValue = sel.value;
                sel.innerHTML = '<option value="None" selected>None</option><option value="Passthrough">Passthrough</option>';
                compatibleModels.forEach(name => sel.appendChild(new Option(name, name)));
                const saved = localStorage.getItem(`bojro_${mode}_adetailer_${n}_cn_model`);
                if (saved && Array.from(sel.options).some(o => o.value === saved)) {
                    sel.value = saved;
                } else if (saved) {
                    // A saved value no longer offered is reset to a valid one through saveAdetailer(), so storage doesn't keep an invalid value that would be sent.
                    sel.value = 'None';
                    if (typeof saveAdetailer === 'function') saveAdetailer(mode);
                } else if (previousValue && Array.from(sel.options).some(o => o.value === previousValue)) {
                    sel.value = previousValue;
                }
                if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText(`${mode}_adetailer_${n}_cn_model`);
            }

            const moduleSel = document.getElementById(`${mode}_adetailer_${n}_cn_module`);
            if (moduleSel && Array.isArray(window.controlNetFullModuleList)) {
                // No prepended "none": Forge's module list already includes it. data-pin-first="none" pins it to the top of the picker.
                const previousModuleValue = moduleSel.value;
                moduleSel.innerHTML = '';
                window.controlNetFullModuleList.forEach(name => moduleSel.appendChild(new Option(name, name)));
                const savedModule = localStorage.getItem(`bojro_${mode}_adetailer_${n}_cn_module`);
                if (savedModule && Array.from(moduleSel.options).some(o => o.value === savedModule)) {
                    moduleSel.value = savedModule;
                } else if (previousModuleValue && Array.from(moduleSel.options).some(o => o.value === previousModuleValue)) {
                    moduleSel.value = previousModuleValue;
                }
                if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText(`${mode}_adetailer_${n}_cn_module`);
            }
        }
    });
}

// "Control Type" has no field on a ControlNet unit; it only filters Preprocessor/Model options and auto-selects a pair, using GET /controlnet/control_types.
async function fetchControlNetTypes() {
    const typeEls = CONTROLNET_MODES.flatMap(m => [0, 1, 2].map(u => document.getElementById(`${m}_cn_${u}_controltype`))).filter(Boolean);
    if (typeEls.length === 0) return;
    try {
        const res = await fetch(`${HOST}/controlnet/control_types`, { headers: getHeaders() });
        if (!res.ok) {
            console.warn(`Control Type fetch: server returned ${res.status} - the selector will only offer "All".`);
            return;
        }
        const data = await res.json();
        const types = data?.control_types;
        if (!types || typeof types !== 'object') {
            console.warn("Control Type fetch: response didn't have the expected control_types object - the selector will only offer \"All\".");
            return;
        }
        window.controlNetTypesData = types;

        const typeNames = ['All', ...Object.keys(types).filter(t => t.toLowerCase() !== 'all')];
        typeEls.forEach(sel => {
            const saved = localStorage.getItem(`bojro_${sel.id.replace('_controltype', '')}_controltype`) || 'All';
            sel.innerHTML = '';
            typeNames.forEach(name => sel.appendChild(new Option(name, name)));
            if (typeNames.includes(saved)) sel.value = saved;
        });
        console.log(`Control Type: fetched ${typeNames.length - 1} real types from the server.`);
    } catch (e) {
        console.warn("Control Type fetch failed - the selector will only offer \"All\".", e);
    }
}

// Applies the selected Control Type's filtered lists (or restores the full lists for "All"); called from the select's onchange per mode and unit.
window.applyControlType = function(mode, unit) {
    const typeSel = document.getElementById(`${mode}_cn_${unit}_controltype`);
    const moduleSel = document.getElementById(`${mode}_cn_${unit}_module`);
    const modelSel = document.getElementById(`${mode}_cn_${unit}_model`);
    if (!typeSel || !moduleSel || !modelSel) return;

    localStorage.setItem(`bojro_${mode}_cn_${unit}_controltype`, typeSel.value);

    const restoreFull = () => {
        if (Array.isArray(window.controlNetFullModuleList)) {
            moduleSel.innerHTML = '';
            window.controlNetFullModuleList.forEach(name => moduleSel.appendChild(new Option(name, name)));
        }
        if (Array.isArray(window.controlNetFullModelList)) {
            modelSel.innerHTML = '';
            window.controlNetFullModelList.forEach(name => modelSel.appendChild(new Option(name, name)));
        }
    };

    const typeData = window.controlNetTypesData ? window.controlNetTypesData[typeSel.value] : null;
    if (typeSel.value === 'All' || !typeData) {
        restoreFull();
    } else {
        if (Array.isArray(typeData.module_list) && typeData.module_list.length > 0) {
            moduleSel.innerHTML = '';
            typeData.module_list.forEach(name => moduleSel.appendChild(new Option(name, name)));
            if (typeData.default_option && Array.from(moduleSel.options).some(o => o.value === typeData.default_option)) {
                moduleSel.value = typeData.default_option;
            }
        }
        if (Array.isArray(typeData.model_list) && typeData.model_list.length > 0) {
            const filteredNoNone = typeData.model_list.filter(name => name !== 'None');
            const useList = filteredNoNone.length > 0 ? filteredNoNone : typeData.model_list;
            modelSel.innerHTML = '';
            useList.forEach(name => modelSel.appendChild(new Option(name, name)));
            if (typeData.default_model && Array.from(modelSel.options).some(o => o.value === typeData.default_model)) {
                modelSel.value = typeData.default_model;
            }
        }
    }

    saveControlNet(mode);
    if (typeof updateModelPickerTriggerText === 'function') {
        updateModelPickerTriggerText(`${mode}_cn_${unit}_module`);
        updateModelPickerTriggerText(`${mode}_cn_${unit}_model`);
    }
}

// Control images per mode, separate from the source image; an empty unit falls back to the mode's source image (see buildJobFromUI). One image per unit. Built from CONTROLNET_MODES.
let controlNetImages = Object.fromEntries(CONTROLNET_MODES.map(m => [m, [null, null, null]]));

window.handleControlNetUpload = function(event, mode, unit) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        applyControlNetImage(mode, unit, evt.target.result);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

// Applies image data to a unit; shared with sendCurrentFsImageToControlNet() (engine.js), which has an image in hand. Same auto-enable and thumbnail/clear handling either way.
function applyControlNetImage(mode, unit, dataUrl) {
    controlNetImages[mode][unit] = dataUrl;
    // Uploading an image turns on ControlNet and this pass if either was off. Turning either off already clears the image (saveControlNet(), toggleControlNetMaster()).
    const masterEl = document.getElementById(`${mode}_cn_master`);
    const unitEnableEl = document.getElementById(`${mode}_cn_${unit}_enable`);
    if ((masterEl && !masterEl.checked) || (unitEnableEl && !unitEnableEl.checked)) {
        if (masterEl) masterEl.checked = true;
        if (unitEnableEl) unitEnableEl.checked = true;
        if (typeof saveControlNet === 'function') saveControlNet(mode);
    }
    const box = document.getElementById(`${mode}_cn_${unit}_uploadBox`);
    const label = document.getElementById(`${mode}_cn_${unit}_uploadLabel`);
    if (label) label.classList.add('hidden');
    if (box) {
        let thumb = document.getElementById(`${mode}_cn_${unit}_uploadThumb`);
        if (!thumb) {
            thumb = document.createElement('img');
            thumb.id = `${mode}_cn_${unit}_uploadThumb`;
            // Preview only: square/landscape images fill the box, portrait is capped at a square's height via max-height:100cqw (container-type:inline-size below), in CSS rather than measured pixels. No cropping.
            thumb.style.cssText = 'display:block; max-width:100%; max-height:100cqw; margin:0 auto; border-radius:4px;';
            box.appendChild(thumb);
        }
        thumb.src = dataUrl;
        thumb.classList.remove('hidden');
    }
    // The trash icon (a badge on the thumbnail) is hidden, not disabled, while there is no thumbnail.
    const clearBtn = document.getElementById(`${mode}_cn_${unit}_clearBtn`);
    if (clearBtn) {
        clearBtn.disabled = false;
        clearBtn.classList.remove('hidden');
    }
}

// Clears the uploaded control image and restores the empty upload box.
window.clearControlNetImage = function(mode, unit) {
    controlNetImages[mode][unit] = null;
    const label = document.getElementById(`${mode}_cn_${unit}_uploadLabel`);
    if (label) {
        label.textContent = 'Tap to upload';
        label.classList.remove('hidden');
    }
    const thumb = document.getElementById(`${mode}_cn_${unit}_uploadThumb`);
    if (thumb) thumb.classList.add('hidden');
    const fileInput = document.getElementById(`${mode}_cn_${unit}_upload`);
    if (fileInput) fileInput.value = '';
    const clearBtn = document.getElementById(`${mode}_cn_${unit}_clearBtn`);
    if (clearBtn) {
        clearBtn.disabled = true;
        clearBtn.classList.add('hidden');
    }
}

// Switches which ControlNet unit's fields are shown (unit chip, 0-2), like selectAdetailerPass() (ui.js). Each unit's enable checkbox is independent of the one being viewed.
window.selectControlNetUnit = function(mode, unitNum) {
    for (let u = 0; u <= 2; u++) {
        const chip = document.getElementById(`${mode}-cn-unit-chip-${u}`);
        const fields = document.getElementById(`${mode}_cn_${u}_fields`);
        if (chip) chip.classList.toggle('active', u === unitNum);
        if (fields) fields.classList.toggle('hidden', u !== unitNum);
    }
}

window.saveControlNet = function(mode) {
    const fields = ['weight', 'resize', 'start', 'end', 'control_mode', 'module', 'model', 'res', 'thresh_a', 'thresh_b'];
    let anyEnabled = false;
    for (let u = 0; u <= 2; u++) {
        fields.forEach(f => {
            const el = document.getElementById(`${mode}_cn_${u}_${f}`);
            if (el) localStorage.setItem(`bojro_${mode}_cn_${u}_${f}`, el.value);
        });
        const enableEl = document.getElementById(`${mode}_cn_${u}_enable`);
        if (enableEl) {
            // Turning a unit's enable checkbox off clears its reference image. Compared against the stored value so it only fires on a real on-to-off change.
            const wasEnabled = localStorage.getItem(`bojro_${mode}_cn_${u}_enable`) === 'true';
            if (wasEnabled && !enableEl.checked && typeof clearControlNetImage === 'function') {
                clearControlNetImage(mode, u);
            }
            localStorage.setItem(`bojro_${mode}_cn_${u}_enable`, enableEl.checked);
            if (enableEl.checked) anyEnabled = true;
        }
    }
    // Keep the master switch in step when a unit is toggled (as saveAdetailer()'s masterEl sync, ui.js).
    const masterEl = document.getElementById(`${mode}_cn_master`);
    if (masterEl) masterEl.checked = anyEnabled;
}

// Master ControlNet switch: off disables every unit but remembers which were on; on restores them (first use: unit 0 only). Like toggleAdetailerMaster() (ui.js).
window.toggleControlNetMaster = function(mode, isOn) {
    if (isOn) {
        const remembered = localStorage.getItem(`bojro_${mode}_cn_remembered_enables`);
        const enables = remembered ? JSON.parse(remembered) : [true, false, false];
        for (let u = 0; u <= 2; u++) {
            const el = document.getElementById(`${mode}_cn_${u}_enable`);
            if (el) el.checked = !!enables[u];
        }
    } else {
        const current = [];
        for (let u = 0; u <= 2; u++) {
            const el = document.getElementById(`${mode}_cn_${u}_enable`);
            current.push(el ? el.checked : false);
        }
        if (current.some(v => v)) {
            localStorage.setItem(`bojro_${mode}_cn_remembered_enables`, JSON.stringify(current));
        }
        for (let u = 0; u <= 2; u++) {
            const el = document.getElementById(`${mode}_cn_${u}_enable`);
            if (el) el.checked = false;
        }
        // Turning ControlNet off at the master toggle clears every unit's reference image.
        if (typeof clearControlNetImage === 'function') {
            for (let u = 0; u <= 2; u++) clearControlNetImage(mode, u);
        }
    }
    saveControlNet(mode);
}

window.initControlNet = function() {
    fetchControlNetOptions();
    fetchControlNetTypes();
    CONTROLNET_MODES.forEach(mode => {
        // ControlNet always starts OFF at launch (control images live only in memory). Runs only at boot (initControlNet() has no other caller). The previous session's enabled units go into the master switch's "remembered enables" slot (toggleControlNetMaster()), only if something was on, so turning the master back on restores them. The stored enable flags are reset to match the screen.
        const previouslyEnabled = [0, 1, 2].map(u => localStorage.getItem(`bojro_${mode}_cn_${u}_enable`) === 'true');
        if (previouslyEnabled.some(v => v)) {
            localStorage.setItem(`bojro_${mode}_cn_remembered_enables`, JSON.stringify(previouslyEnabled));
        }
        for (let u = 0; u <= 2; u++) {
            const enableEl = document.getElementById(`${mode}_cn_${u}_enable`);
            if (enableEl) enableEl.checked = false;
            localStorage.setItem(`bojro_${mode}_cn_${u}_enable`, 'false');

            const loadVal = (id, def) => {
                const el = document.getElementById(`${mode}_cn_${u}_${id}`);
                const saved = localStorage.getItem(`bojro_${mode}_cn_${u}_${id}`);
                if (el && saved !== null) el.value = saved;
                else if (el && def !== undefined) el.value = def;
            };
            loadVal('weight', 1.0);
            loadVal('resize', 1);
            loadVal('start', 0.0);
            loadVal('end', 1.0);
            loadVal('control_mode', 0);
        }

        const masterEl = document.getElementById(`${mode}_cn_master`);
        if (masterEl) masterEl.checked = false;

        if (typeof initGenericSectionClosed === 'function') {
            initGenericSectionClosed(`grp-${mode}-cn`, `arr-${mode}-cn`, `bojro_vis_${mode}_cn`);
            // vaete is Inpaint/img2img only (the main tabs have their own UI); skipped because initGenericSectionClosed() doesn't null-check.
            if (mode === 'inp' || mode === 'img2img') {
                initGenericSectionClosed(`grp-${mode}-vaete`, `arr-${mode}-vaete`, `bojro_vis_${mode}_vaete`);
            }
        }
    });
}

// --- IMG2IMG PRESETS ---
// Named bundles of the full img2img setup (model, VAE/TE, prompt/params, ADetailer, ControlNet), e.g. one per checkpoint.
const IMG2IMG_PRESETS_KEY = 'bojroImg2imgPresets';

function loadImg2imgPresets() {
    try {
        const raw = localStorage.getItem(IMG2IMG_PRESETS_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
}

function saveImg2imgPresetsToStorage(presets) {
    localStorage.setItem(IMG2IMG_PRESETS_KEY, JSON.stringify(presets));
}

function collectImg2imgPresetData() {
    const val = (id) => document.getElementById(id)?.value;
    const checked = (id) => document.getElementById(id)?.checked || false;

    const adetailer = [];
    for (let n = 1; n <= 8; n++) {
        adetailer.push({
            enable: checked(`img2img_adetailer_${n}_enable`),
            model: val(`img2img_adetailer_${n}_model`),
            confidence: val(`img2img_adetailer_${n}_confidence`),
            denoise: val(`img2img_adetailer_${n}_denoise`),
            mask_blur: val(`img2img_adetailer_${n}_mask_blur`),
            padding: val(`img2img_adetailer_${n}_padding`)
        });
    }

    const controlnet = [];
    for (let u = 0; u <= 2; u++) {
        controlnet.push({
            enable: checked(`img2img_cn_${u}_enable`),
            module: val(`img2img_cn_${u}_module`),
            model: val(`img2img_cn_${u}_model`),
            weight: val(`img2img_cn_${u}_weight`),
            resize: val(`img2img_cn_${u}_resize`),
            start: val(`img2img_cn_${u}_start`),
            end: val(`img2img_cn_${u}_end`),
            control_mode: val(`img2img_cn_${u}_control_mode`)
        });
    }

    return {
        model: val('img2img_modelSelect'),
        vae: val('img2img_vae'),
        te: val('img2img_te'),
        prompt: val('inp_prompt'),
        negative: val('inp_neg'),
        steps: val('inp_steps'),
        cfg: val('inp_cfg'),
        sampler: val('inp_sampler'),
        scheduler: val('inp_scheduler'),
        denoise: val('denoisingStrength'),
        adetailer: adetailer,
        controlnet: controlnet
    };
}

// Select fields are set only if the option still exists (a preset may reference a missing checkpoint/module).
function applyImg2imgPresetData(data) {
    if (!data) return;
    const setIfExists = (id, value) => {
        const el = document.getElementById(id);
        if (el && value !== undefined && Array.from(el.options || []).some(o => o.value === value)) {
            el.value = value;
            // Setting .value fires no 'change', so refresh model-picker-trigger buttons (ADetailer model, ControlNet module/model); a no-op for other fields.
            if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText(id);
        }
    };
    const setVal = (id, value) => {
        const el = document.getElementById(id);
        if (el && value !== undefined) el.value = value;
    };
    const setChecked = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.checked = !!value;
    };

    setIfExists('img2img_modelSelect', data.model);
    setIfExists('img2img_vae', data.vae);
    setIfExists('img2img_te', data.te);
    setVal('inp_prompt', data.prompt);
    setVal('inp_neg', data.negative);
    setVal('inp_steps', data.steps);
    setVal('inp_cfg', data.cfg);
    setIfExists('inp_sampler', data.sampler);
    setIfExists('inp_scheduler', data.scheduler);
    setVal('denoisingStrength', data.denoise);
    const dv = document.getElementById('denoiseVal');
    if (dv && data.denoise !== undefined) dv.innerText = data.denoise;
    // Loads the preset's denoising value via setVal(), bypassing the thumb-only slider's drag handler, so resync the fake thumb.
    if (typeof syncThumbOnlySliderPosition === 'function') syncThumbOnlySliderPosition('denoisingStrength');

    (data.adetailer || []).forEach((unit, i) => {
        const n = i + 1;
        setChecked(`img2img_adetailer_${n}_enable`, unit.enable);
        setIfExists(`img2img_adetailer_${n}_model`, unit.model);
        setVal(`img2img_adetailer_${n}_confidence`, unit.confidence);
        setVal(`img2img_adetailer_${n}_denoise`, unit.denoise);
        setVal(`img2img_adetailer_${n}_mask_blur`, unit.mask_blur);
        setVal(`img2img_adetailer_${n}_padding`, unit.padding);
    });

    (data.controlnet || []).forEach((unit, u) => {
        setChecked(`img2img_cn_${u}_enable`, unit.enable);
        setIfExists(`img2img_cn_${u}_module`, unit.module);
        setIfExists(`img2img_cn_${u}_model`, unit.model);
        setVal(`img2img_cn_${u}_weight`, unit.weight);
        setVal(`img2img_cn_${u}_resize`, unit.resize);
        setVal(`img2img_cn_${u}_start`, unit.start);
        setVal(`img2img_cn_${u}_end`, unit.end);
        setVal(`img2img_cn_${u}_control_mode`, unit.control_mode);
    });

    // Persist the applied values into img2img's mode state too, so switching away and back shows them.
    if (typeof saveInpaintModeState === 'function') saveInpaintModeState('img2img');
    if (typeof saveAdetailer === 'function') saveAdetailer('img2img');
    // saveControlNet() needs a mode to build its element IDs from (it was called with none).
    if (typeof saveControlNet === 'function') saveControlNet('img2img');
    if (typeof saveSelection === 'function') {
        saveSelection('img2img');
        saveSelection('img2img_vae');
        saveSelection('img2img_te');
    }
}

// Which preset (if any) matches the current configuration exactly; at most one is active. Cleared by clearActiveImg2imgPresetIfMatchingField() when a captured setting changes.
let activeImg2imgPresetName = null;

// applyAllSavedDefaults() can overwrite watched fields without dispatching events; called after Load Default so the active border doesn't claim a stale match.
window.clearActiveImg2imgPreset = function() {
    if (!activeImg2imgPresetName) return;
    activeImg2imgPresetName = null;
    window.renderImg2imgPresetList();
}

window.renderImg2imgPresetList = function() {
    const presets = loadImg2imgPresets();
    const container = document.getElementById('img2imgPresetList');
    const query = (document.getElementById('img2imgPresetSearch')?.value || '').toLowerCase();
    const clearBtn = document.getElementById('img2imgPresetSearchClear');
    if (clearBtn) clearBtn.classList.toggle('hidden', !query);

    const allNames = Object.keys(presets);
    if (allNames.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:11px; padding:15px;">No presets saved yet</div>`;
        return;
    }

    const names = allNames
        .filter(name => name.toLowerCase().includes(query))
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    if (names.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:11px; padding:15px;">No presets match your search</div>`;
        return;
    }

    container.innerHTML = '';
    names.forEach(name => {
        const isActive = name === activeImg2imgPresetName;
        // Clean checkpoint name (splitCheckpointDisplayName(), modelpicker.js) rather than the raw stored value.
        const rawModel = presets[name]?.model;
        const modelPreview = rawModel && typeof splitCheckpointDisplayName === 'function'
            ? splitCheckpointDisplayName(rawModel).primary
            : (rawModel || '...');

        // Same glass-box/style-card tile layout as the Style Manager (styles.js), without its active-style star.
        const div = document.createElement('div');
        div.className = 'glass-box style-card';
        div.style.cssText = `margin-bottom:10px; padding:12px; transition: 0.3s; border: 1px solid ${isActive ? '#ffd700' : 'var(--border-color)'}; box-shadow: ${isActive ? '0 0 15px rgba(255, 215, 0, 0.3)' : 'none'};`;
        div.innerHTML = `
            <div class="row" style="justify-content:space-between; align-items:center;">
                <div class="preset-select-target" style="flex:1; min-width:0; cursor:pointer;">
                    <div style="font-weight:900; color:${isActive ? '#ffd700' : 'var(--accent-primary)'}; font-size:12px;">${escapeHtmlAttr(name.toUpperCase())}</div>
                    <div style="font-size:10px; color:var(--text-muted); display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden;">
                        ${escapeHtmlAttr(modelPreview)}
                    </div>
                </div>
                <div class="row" style="width:auto; gap:10px;">
                    <button class="preset-save-btn" style="background:none; border:none; color:var(--accent-primary); padding:4px;" title="Overwrite with current settings">
                        <i data-lucide="save" size="14"></i>
                    </button>
                    <button class="preset-rename-btn" style="background:none; border:none; color:var(--text-muted); padding:4px;" title="Rename">
                        <i data-lucide="pencil" size="14"></i>
                    </button>
                    <button class="preset-delete-btn" style="background:none; border:none; color:#f44336; padding:4px;" title="Delete">
                        <i data-lucide="trash-2" size="14"></i>
                    </button>
                </div>
            </div>
        `;
        // Real closures rather than inline onclick strings (preset names with apostrophes).
        div.querySelector('.preset-select-target').onclick = () => window.loadImg2imgPreset(name);
        div.querySelector('.preset-save-btn').onclick = (event) => {
            event.stopPropagation();
            window.overwriteImg2imgPreset(name);
        };
        div.querySelector('.preset-rename-btn').onclick = (event) => {
            event.stopPropagation();
            window.renameImg2imgPreset(name);
        };
        div.querySelector('.preset-delete-btn').onclick = (event) => {
            event.stopPropagation();
            window.deleteImg2imgPreset(name);
        };
        container.appendChild(div);
    });

    if (window.lucide) lucide.createIcons();
}

window.clearImg2imgPresetSearch = function() {
    const searchEl = document.getElementById('img2imgPresetSearch');
    if (!searchEl) return;
    searchEl.value = '';
    window.renderImg2imgPresetList();
}

window.openImg2imgPresetSaveRow = function() {
    document.getElementById('img2imgPresetRenameRow').classList.add('hidden'); // mutually exclusive
    document.getElementById('img2imgPresetSaveRow').classList.remove('hidden');
    document.getElementById('img2imgPresetNewName').focus();
}

window.cancelSaveImg2imgPreset = function() {
    document.getElementById('img2imgPresetNewName').value = '';
    document.getElementById('img2imgPresetSaveRow').classList.add('hidden');
}

window.openImg2imgPresetModal = function() {
    window.renderImg2imgPresetList();
    window.cancelRenameImg2imgPreset();
    window.cancelSaveImg2imgPreset();
    document.getElementById('img2imgPresetModal').classList.remove('hidden');
    if (typeof lockBodyScroll === 'function') lockBodyScroll();
}

window.closeImg2imgPresetModal = function() {
    window.cancelRenameImg2imgPreset();
    window.cancelSaveImg2imgPreset();
    document.getElementById('img2imgPresetModal').classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
}

// A loaded preset's active border clears when any captured setting changes. Delegated on #view-inp, checked against the fields collectImg2imgPresetData() reads; applyImg2imgPresetData() dispatches no events, so loading doesn't clear it.
const IMG2IMG_PRESET_FIELD_IDS = new Set([
    'img2img_modelSelect', 'img2img_vae', 'img2img_te',
    'inp_prompt', 'inp_neg', 'inp_steps', 'inp_cfg', 'inp_sampler', 'inp_scheduler',
    'denoisingStrength'
]);
function isImg2imgPresetField(id) {
    if (!id) return false;
    if (IMG2IMG_PRESET_FIELD_IDS.has(id)) return true;
    if (id.startsWith('img2img_adetailer_')) return true;
    if (id.startsWith('img2img_cn_')) return true;
    return false;
}
function clearActiveImg2imgPresetIfMatchingField(e) {
    if (!activeImg2imgPresetName) return;
    if (!isImg2imgPresetField(e.target && e.target.id)) return;
    activeImg2imgPresetName = null;
    window.renderImg2imgPresetList();
}
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('view-inp');
    if (container) {
        container.addEventListener('input', clearActiveImg2imgPresetIfMatchingField);
        container.addEventListener('change', clearActiveImg2imgPresetIfMatchingField);
    }
});

window.saveCurrentAsImg2imgPreset = function() {
    const nameInput = document.getElementById('img2imgPresetNewName');
    const name = nameInput.value.trim();
    if (!name) {
        if (Toast) Toast.show({ text: 'Enter a preset name first', duration: 'short' });
        return;
    }
    const presets = loadImg2imgPresets();
    const isOverwrite = presets.hasOwnProperty(name);
    presets[name] = collectImg2imgPresetData();
    saveImg2imgPresetsToStorage(presets);
    // As overwriteImg2imgPreset(): overwriting an existing preset must also refresh the per-mode snapshot restoreInpaintModeState() reads.
    if (typeof saveInpaintModeState === 'function') saveInpaintModeState('img2img');
    if (typeof saveAdetailer === 'function') saveAdetailer('img2img');
    if (typeof saveControlNet === 'function') saveControlNet('img2img');
    if (typeof saveSelection === 'function') {
        saveSelection('img2img');
        saveSelection('img2img_vae');
        saveSelection('img2img_te');
    }
    nameInput.value = '';
    document.getElementById('img2imgPresetSaveRow').classList.add('hidden');
    // The just-saved preset matches the current settings, so mark it active.
    activeImg2imgPresetName = name;
    window.renderImg2imgPresetList();
    if (Toast) Toast.show({ text: isOverwrite ? `Updated "${name}"` : `Saved "${name}"`, duration: 'short' });
}

window.loadImg2imgPreset = function(name) {
    const presets = loadImg2imgPresets();
    if (!presets[name]) return;
    applyImg2imgPresetData(presets[name]);
    // applyImg2imgPresetData() sets selects without 'change', so refresh their trigger buttons.
    if (typeof refreshAllModelPickerTriggers === 'function') refreshAllModelPickerTriggers();
    // Tapping a preset tile enables it in place (like the Style Manager) rather than closing the modal.
    activeImg2imgPresetName = name;
    window.renderImg2imgPresetList();
    if (Toast) Toast.show({ text: `Loaded "${name}"`, duration: 'short' });
}

window.overwriteImg2imgPreset = async function(name) {
    if (!(await window.appConfirm(`Overwrite "${name}" with your current settings?`, { title: 'Overwrite Preset', okText: 'OVERWRITE' }))) return;
    const presets = loadImg2imgPresets();
    presets[name] = collectImg2imgPresetData();
    saveImg2imgPresetsToStorage(presets);
    // restoreInpaintModeState() reads a per-mode snapshot that was refreshed only on loading a preset, so refresh it on overwriting too.
    if (typeof saveInpaintModeState === 'function') saveInpaintModeState('img2img');
    if (typeof saveAdetailer === 'function') saveAdetailer('img2img');
    if (typeof saveControlNet === 'function') saveControlNet('img2img');
    if (typeof saveSelection === 'function') {
        saveSelection('img2img');
        saveSelection('img2img_vae');
        saveSelection('img2img_te');
    }
    activeImg2imgPresetName = name;
    window.renderImg2imgPresetList();
    if (Toast) Toast.show({ text: `Updated "${name}"`, duration: 'short' });
}

let renameTargetPreset = null;

window.renameImg2imgPreset = function(oldName) {
    renameTargetPreset = oldName;
    document.getElementById('img2imgPresetSaveRow').classList.add('hidden'); // mutually exclusive
    document.getElementById('img2imgPresetRenameInput').value = oldName;
    document.getElementById('img2imgPresetRenameRow').classList.remove('hidden');
    document.getElementById('img2imgPresetRenameInput').focus();
}

window.cancelRenameImg2imgPreset = function() {
    renameTargetPreset = null;
    document.getElementById('img2imgPresetRenameRow').classList.add('hidden');
}

window.confirmRenameImg2imgPreset = function() {
    const newName = document.getElementById('img2imgPresetRenameInput').value.trim();
    if (!renameTargetPreset || !newName || newName === renameTargetPreset) {
        window.cancelRenameImg2imgPreset();
        return;
    }
    const presets = loadImg2imgPresets();
    if (!presets[renameTargetPreset]) {
        window.cancelRenameImg2imgPreset();
        return;
    }
    presets[newName] = presets[renameTargetPreset];
    delete presets[renameTargetPreset];
    saveImg2imgPresetsToStorage(presets);
    if (activeImg2imgPresetName === renameTargetPreset) activeImg2imgPresetName = newName;
    window.cancelRenameImg2imgPreset();
    window.renderImg2imgPresetList();
}

window.deleteImg2imgPreset = async function(name) {
    if (!(await window.appConfirm(`Delete preset "${name}"?`, { title: 'Delete Preset', okText: 'DELETE', danger: true }))) return;
    const presets = loadImg2imgPresets();
    delete presets[name];
    saveImg2imgPresetsToStorage(presets);
    if (activeImg2imgPresetName === name) activeImg2imgPresetName = null;
    window.renderImg2imgPresetList();
    if (Toast) Toast.show({ text: `Deleted "${name}"`, duration: 'short' });
}

window.exportImg2imgPresets = async function() {
    const presets = loadImg2imgPresets();
    if (Object.keys(presets).length === 0) {
        if (Toast) Toast.show({ text: 'No presets to export', duration: 'short' });
        return;
    }
    const json = JSON.stringify(presets, null, 2);
    const fileName = `img2img-presets-backup-${Date.now()}.json`;

    try {
        const isNative = window.Capacitor && window.Capacitor.isNative;
        if (isNative && window.Capacitor.Plugins.Filesystem) {
            const Filesystem = window.Capacitor.Plugins.Filesystem;
            try {
                await Filesystem.mkdir({ path: 'Resolver', directory: 'DOCUMENTS', recursive: false });
            } catch (e) {}
            await Filesystem.writeFile({
                path: `Resolver/${fileName}`,
                data: json,
                directory: 'DOCUMENTS',
                encoding: 'utf8'
            });
            if (Toast) Toast.show({ text: 'Saved to Documents/Resolver', duration: 'long' });
        } else {
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            link.click();
            URL.revokeObjectURL(url);
        }
    } catch (e) {
        await window.appAlert("Export failed: " + e.message, { title: 'Export Failed', danger: true });
    }
}

window.handleImg2imgPresetImport = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const imported = JSON.parse(evt.target.result);
            if (typeof imported !== 'object' || Array.isArray(imported)) throw new Error("Not a valid presets file");

            const existing = loadImg2imgPresets();
            const merged = { ...existing, ...imported };
            saveImg2imgPresetsToStorage(merged);
            window.renderImg2imgPresetList();

            const count = Object.keys(imported).length;
            if (Toast) Toast.show({ text: `Imported ${count} preset${count === 1 ? '' : 's'}`, duration: 'short' });
        } catch (e) {
            await window.appAlert("Import failed: this doesn't look like a valid presets file.", { title: 'Import Failed', danger: true });
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// BOJRO DEV POWER (PC Server companion app: wake/kill signals)
// Requires the separate "Bojro Dev Power" PC Server app running and reachable; plain POST requests matching its routes (bojro_app.py).

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
        await window.appAlert("Please set the PC Server IP in settings first!");
        if (typeof switchTab === 'function') switchTab('cfg');
        return;
    }

    if (btn) btn.classList.add('active');

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
            if (btn) btn.classList.remove('active');
        }, 3000);

    } catch (error) {
        console.error(error);
        if (Toast) Toast.show({
            text: 'Signal Sent (Or Check Connection)',
            duration: 'short'
        });
        if (btn) btn.classList.remove('active');
    }
}

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
        await window.appAlert("Please set the PC Server IP in settings first!");
        if (typeof switchTab === 'function') switchTab('cfg');
        return;
    }

    if (btn) btn.classList.add('active');

    if (Toast) Toast.show({
        text: 'Sending KILL Signal...',
        duration: 'short'
    });

    try {
        // Simple POST to /power/off (bojro_app.py) with no headers, so there is no CORS preflight.
        const targetUrl = `${serverUrl}/power/off`;

        await fetch(targetUrl, {
            method: 'POST'
        });

        if (Toast) Toast.show({
            text: 'System Halted Successfully',
            duration: 'short'
        });

        setTimeout(() => {
            if (btn) btn.classList.remove('active');
        }, 1000);

    } catch (error) {
        console.error(error);
        if (Toast) Toast.show({
            text: 'Signal Sent (Or Check Connection)',
            duration: 'short'
        });
        if (btn) btn.classList.remove('active');
    }
}

// PWK (Partial Wake/Kill): starts or kills one service (Forge/ComfyUI/LM Studio) rather than the whole machine.
window.sendServiceSignal = async function(service, action) {
    let serverUrl;
    if (typeof buildWakeUrl === 'function' && connectionConfig.baseIp) {
        serverUrl = buildWakeUrl();
    } else {
        serverUrl = localStorage.getItem('bojro_power_ip');
    }

    if (!serverUrl) {
        await window.appAlert("Please set the PC Server IP in settings first!");
        if (typeof switchTab === 'function') switchTab('cfg');
        return;
    }

    // Targets IDs like: btn-forge-on, btn-comfy-off
    const btnId = `btn-${service}-${action}`;
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.classList.add('active');
        btn.style.opacity = "0.5";
    }

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
        // Matches Python routes: /power/forge/on, /power/lm/off, etc.
        const endpoint = `${serverUrl}/power/${service}/${action}`;

        await fetch(endpoint, {
            method: 'POST'
        });

        if (Toast) Toast.show({
            text: `${displayName} ${action === 'on' ? 'Started' : 'Killed'}`,
            duration: 'short'
        });
    } catch (error) {
        console.error(error);
        if (Toast) Toast.show({
            text: 'Signal Sent (Or Check Connection)',
            duration: 'short'
        });
    } finally {
        setTimeout(() => {
            if (btn) {
                btn.classList.remove('active');
                btn.style.opacity = "1";
            }
        }, 1000);
    }
}
