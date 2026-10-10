/**
 * NEO MODULE
 * Specialized logic for Z-Image Turbo (Qwen) and S3-DiT Architectures.
 * Isolated from main app logic to prevent regression.
 */

const Neo = {
    // defaults optimized for Z-Image Turbo (Decoupled-DMD)
    defaults: {
        steps: 8,
        cfg: 1.0,  
        sampler: "Euler", 
        scheduler: "Simple"
    },

    // Called by app.js when models are fetched
    populateModels: function(models) {
        const sel = document.getElementById('qwen_modelSelect');
        if(!sel) return;
        
        // SORT MODELS ALPHABETICALLY BY NAME
        models.sort((a, b) => a.model_name.localeCompare(b.model_name, undefined, {sensitivity: 'base'}));

        const currentVal = sel.value;
        sel.innerHTML = "";

        // Grouped options as on the other main tabs (confident Qwen matches first).
        if (typeof buildGroupedModelOptions === 'function') {
            buildGroupedModelOptions(models, 'qwen', 'Qwen Models').forEach(g => sel.appendChild(g));
        } else {
            models.forEach(m => sel.appendChild(new Option(m.model_name, m.title)));
        }

        const saved = localStorage.getItem('bojroModel_qwen');
        if (saved) {
            sel.value = saved;
        } else if (currentVal) {
            sel.value = currentVal;
        }
        // Setting .value fires no 'change', so refresh the trigger button explicitly.
        if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText('qwen_modelSelect');
    },

    // Called by app.js when samplers are fetched
    populateSamplers: function(samplers) {
         const sel = document.getElementById('qwen_sampler');
         if(!sel) return;
         sel.innerHTML = "";
         samplers.forEach(s => {
             sel.appendChild(new Option(s.name, s.name));
         });

         // Restore sampler/scheduler from the live-state store, as other modes do.
         const savedSampler = localStorage.getItem('bojro_qwen_live_qwen_sampler');
         if (savedSampler && Array.from(sel.options).some(o => o.value === savedSampler)) {
             sel.value = savedSampler;
         } else if(Array.from(sel.options).some(o => o.value === "Euler")) {
             sel.value = "Euler";
         } else if(Array.from(sel.options).some(o => o.value === "Euler a")) {
             sel.value = "Euler a";
         }

         // Scheduler is restored by fetchSchedulers() (network.js), so it is left alone here.
    },

    // Populates the Dual Dropdowns (VAE and Qwen/TE)
    populateDual: function(modulesList) {
        const slots = [
            document.getElementById('qwen_vae'), 
            document.getElementById('qwen_te')
        ];

        // Reset
        slots.forEach((s, index) => {
            if(!s) return;
            s.innerHTML = index === 0 ? "<option value='Automatic'>Automatic</option>" : "<option value='None'>None</option>";
        });

        if(modulesList.length > 0) {
            // SORT MODULES ALPHABETICALLY
            modulesList.sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));

            slots.forEach(sel => {
                if(!sel) return;
                modulesList.forEach(name => {
                    if (name !== "Automatic" && !Array.from(sel.options).some(o => o.value === name)) {
                        sel.appendChild(new Option(name, name));
                    }
                });
            });
        }

        // Restore saved
        ['qwen_vae', 'qwen_te'].forEach(id => {
            const saved = localStorage.getItem('bojro_' + id);
            const el = document.getElementById(id);
            if(saved && el && Array.from(el.options).some(o => o.value === saved)) {
                el.value = saved;
            }
        });
    },

    saveDual: function() {
        ['qwen_vae', 'qwen_te'].forEach(id => {
            const el = document.getElementById(id);
            if(el) localStorage.setItem('bojro_' + id, el.value);
        });
    },

    // Helper to read the main VRAM Profile dropdown
    getMemoryReserve: function() {
        const profileEl = document.getElementById('vramProfile');
        const profile = profileEl ? profileEl.value : 'mid';

        // Returns amount to RESERVE (Inversed Logic)
        switch (profile) {
            case 'low':
                return 4980; // 6GB Reserve (Forces Offload - Safe)
            case 'high':
                return 1024; // 1GB Reserve (Aggressive - Might Crash)
            case 'mid':
            default:
                // FIX: 6GB Reserve to force Qwen Encoder (8.4GB) to RAM
                return 4980; 
        }
    },

    // The Bridge: Constructs the API payload for Forge
    buildJob: function() {
        const modelTitle = document.getElementById('qwen_modelSelect').value;
        if(!modelTitle || modelTitle.includes("Link first")) {
            window.appAlert("Neo System: Please select a Qwen/Turbo model first.");
            window.__buildJobOwnMessageShown = true;
            return null;
        }

        // 1. Gather Inputs
        const prompt = document.getElementById('qwen_prompt').value;
        const neg = document.getElementById('qwen_neg').value;
        
        const steps = parseInt(document.getElementById('qwen_steps').value) || 8;
        const cfg = parseFloat(document.getElementById('qwen_cfg').value) || 1.0;
        const width = parseInt(document.getElementById('qwen_width').value) || 1024;
        const height = parseInt(document.getElementById('qwen_height').value) || 1024;
        const seed = parseSeedValue(document.getElementById('qwen_seed').value);
        const batchSize = parseInt(document.getElementById('qwen_batch_size').value) || 1;
        const batchCount = parseInt(document.getElementById('qwen_batch_count').value) || 1;

        const sampler = document.getElementById('qwen_sampler').value;
        const scheduler = document.getElementById('qwen_scheduler').value;

        // 2. Define Overrides
        const vae = document.getElementById('qwen_vae').value;
        const te = document.getElementById('qwen_te').value;
        
        // Get Low Bits setting (from app.js UI logic)
        const bits = typeof getLowBitsForMode === 'function' ? getLowBitsForMode('qwen') : "Automatic";

        const modulesToLoad = [vae, te].filter(v => v && v !== "Automatic" && v !== "None");

        let overrides = {
            "sd_model_checkpoint": modelTitle,
            "sd_vae": vae === "Automatic" ? "Automatic" : "Automatic", 
            "forge_additional_modules": modulesToLoad, 
            "forge_unet_storage_dtype": bits,
            // CRITICAL FIX: Reserve 6GB to force Offload
            "forge_inference_memory": this.getMemoryReserve(),
            // return_grid keeps Forge from returning a grid in the response (do_not_save_grid only affects disk).
            "return_grid": false
        };

        // 3. Construct Payload
        const payload = {
            "prompt": prompt,
            "negative_prompt": neg,
            "steps": steps,
            "cfg_scale": cfg,
            "width": width,
            "height": height,
            "batch_size": batchSize,
            "n_iter": batchCount,
            "sampler_name": sampler,
            "scheduler": scheduler,
            "seed": seed,
            "save_images": true,
            // No combined grid for batches (same as the other modes).
            "do_not_save_grid": true,
            "override_settings": overrides
        };

        // High-Res Fix Injection for Qwen
        const hrEl = document.getElementById('qwen_hr_enable');
        if (hrEl && hrEl.checked) {
            payload.enable_hr = true;
            payload.hr_scale = parseFloat(document.getElementById('qwen_hr_scale').value) || 1.5;
            payload.hr_upscaler = document.getElementById('qwen_hr_upscaler').value;
            payload.hr_second_pass_steps = parseInt(document.getElementById('qwen_hr_steps').value) || 6;
            payload.denoising_strength = parseFloat(document.getElementById('qwen_hr_denoise').value) || 0.4;
            // Note: 'hr_cfg' is often supported by Forge/A1111 payload even if not standard in original SD
            payload.hr_cfg = parseFloat(document.getElementById('qwen_hr_cfg').value) || 1.0;
            // FIX: Add hr_additional_modules to prevent NoneType error in processing.py
            payload.hr_additional_modules = ["Use same choices"]; 
        }

        // ADetailer + Never OOM + ControlNet Injection
        const qwenAdetailerScripts = typeof buildAdetailerScriptPayload === 'function' ? buildAdetailerScriptPayload('qwen') : {};
        const qwenNeverOomScripts = typeof buildNeverOomScriptPayload === 'function' ? buildNeverOomScriptPayload('qwen') : {};
        // Guarded: buildControlNetScriptPayload lives in engine.js.
        const qwenCnScripts = typeof buildControlNetScriptPayload === 'function' ? buildControlNetScriptPayload('qwen', null) : {};
        // Guarded: controlNetMissingRequiredImage lives in engine.js.
        if (typeof controlNetMissingRequiredImage === 'function' && controlNetMissingRequiredImage(qwenCnScripts)) {
            if (typeof Toast !== 'undefined') Toast.show({ text: "Load a reference image for ControlNET, or disable it.", duration: 'short' });
            window.__buildJobOwnMessageShown = true;
            return null;
        }
        const qwenCombinedScripts = { ...qwenAdetailerScripts, ...qwenNeverOomScripts, ...qwenCnScripts };
        if (Object.keys(qwenCombinedScripts).length > 0) {
            payload.alwayson_scripts = qwenCombinedScripts;
        }
        // ControlNet reads a top-level resize_mode from the request.
        if (qwenCnScripts.controlnet) {
            payload.resize_mode = qwenCnScripts.controlnet.args[0].resize_mode;
        }

        return {
            mode: 'qwen',
            modelTitle: modelTitle,
            payload: payload,
            desc: `Qwen: ${prompt.substring(0, 30)}...`
        };
    }
};

// Expose to window for app.js to find
if(window) window.Neo = Neo;