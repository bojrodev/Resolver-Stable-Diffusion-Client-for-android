// -----------------------------------------------------------
// JOB BUILDER & GENERATION ENGINE
// -----------------------------------------------------------

// --- NEW HELPER: RETRY FETCH ---
// This tool tries to connect 5 times before giving up.
async function fetchWithRetry(url, options, retries = 5, backoff = 1000) {
    try {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error("Server Status: " + res.status);
        return res;
    } catch (err) {
        console.warn(`[Network] Fetch failed. Retries left: ${retries}. Error: ${err.message}`);
        
        // If we have no retries left, we finally fail
        if (retries <= 0) throw err;
        
        // Wait a bit (1 second, then 1.5s, etc.) then try again
        await new Promise(r => setTimeout(r, backoff));
        return fetchWithRetry(url, options, retries - 1, backoff * 1.5);
    }
}


// Returns null on any failure (feature off, endpoint unreachable, bad response); callers fall back to no bridge data.
async function fetchBridgeStatus() {
    if (localStorage.getItem('bojroProgressBridgeEnabled') !== 'true') return null;
    try {
        const res = await fetch(`${HOST}/forge-neo-progress-bridge/status`, { headers: getHeaders() });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

// A drop in `current` means a new upscale pass started (Upscaler 1 then 2): bank the finished pass's total so the combined count keeps growing.
// Guesses a noun from an ADetailer model's filename (the bridge reports only a count); null if no known class matches. The user's custom mappings (cfg.js, Settings > ADetailer Model Toast Text) are checked first.
function guessAdetailerLabel(modelFilename) {
    const m = (modelFilename || '').toLowerCase();
    if (typeof getCustomAdetailerLabels === 'function') {
        const customEntries = getCustomAdetailerLabels();
        for (const entry of customEntries) {
            if (entry.match && entry.singular && entry.plural && m.includes(entry.match.toLowerCase())) {
                return { singular: entry.singular, plural: entry.plural };
            }
        }
    }
    if (m.includes('face')) return { singular: 'face', plural: 'faces' };
    if (m.includes('hand')) return { singular: 'hand', plural: 'hands' };
    if (m.includes('eye')) return { singular: 'eye', plural: 'eyes' };
    if (m.includes('foot') || m.includes('feet')) return { singular: 'foot', plural: 'feet' };
    if (m.includes('person')) return { singular: 'person', plural: 'people' };
    return null;
}

// How many of a unit's detections ADetailer will process: Max Masks (ad_mask_k) keeps only the k best masks (by the Area/Confidence filter method), but the bridge reports what was detected. 0, empty or unset means unlimited. If the bridge ever reports a filtered count, min() makes this a no-op.
function adetailerProcessedCount(detectedCount, unitConfig) {
    const k = Number(unitConfig?.ad_mask_k);
    return (k > 0) ? Math.min(detectedCount, k) : detectedCount;
}

// A drop in `current` means a new upscale pass started: bank the finished pass's total. expectSecondPass shows total*2 up front, and is only safe when nothing can be cached for this image yet (see upscaledImageHashes), since Forge may skip a cached pass.
function createTileTracker(expectSecondPass) {
    let banked = 0;
    let lastCurrent = -1;
    let lastTotal = 0;
    let inFirstPass = true;
    return function(current, total) {
        if (current < lastCurrent) {
            banked += lastTotal;
            inFirstPass = false;
        }
        lastCurrent = current;
        lastTotal = total;
        const denominator = banked + (inFirstPass && expectSecondPass ? total * 2 : total);
        return { numerator: banked + current, denominator };
    };
}

// Source images already upscaled this session, by a cheap hash. Forge can cache a tiled pass keyed on image + settings and skip work (and bridge reporting), which is impossible only the first time an image is upscaled.
const upscaledImageHashes = new Set();

// Low Bits (Forge's "Diffusion in Low Bits", which also decides whether LoRAs are patched on the fly) is remembered per tab, so SDXL can use "Automatic" while Qwen/Flux use an "(fp16 LoRA)" option. Inpaint and img2img share one value ('inp'). Stored as bojro_low_bits_<tab>; a tab with nothing stored starts from the old global value (bojro_global_low_bits), otherwise plain "Automatic".
const LOW_BITS_DEFAULT = "Automatic";

function lowBitsKeyFor(mode) {
    return mode === 'img2img' ? 'inp' : (mode || 'xl');
}

// Inpaint and img2img are remembered per checkpoint (bojro_low_bits_model_<name>), falling back to the tab's value above.
function lowBitsModelKey(title) {
    if (!title || /loading|link first/i.test(title)) return null;
    return 'bojro_low_bits_model_' + String(title).toLowerCase().replace(/\s*\[[0-9a-f]+\]\s*$/, '').trim();
}

// The checkpoint currently chosen in the Inpaint / img2img view.
function currentInpModelTitle() {
    const id = (typeof currentInpaintTopMode !== 'undefined' && currentInpaintTopMode === 'img2img') ? 'img2img_modelSelect' : 'inp_modelSelect';
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function getLowBitsForMode(mode, modelTitle) {
    try {
        const key = lowBitsKeyFor(mode);
        if (key === 'inp') {
            const mk = lowBitsModelKey(modelTitle !== undefined ? modelTitle : currentInpModelTitle());
            const perModel = mk && localStorage.getItem(mk);
            if (perModel) return perModel;
        }
        const own = localStorage.getItem(`bojro_low_bits_${key}`);
        if (own) return own;
        const legacy = localStorage.getItem('bojro_global_low_bits');
        if (legacy) return legacy;
    } catch (e) { /* storage blocked: fall through to the default */ }
    return LOW_BITS_DEFAULT;
}

// The two selects (under the checkpoint box on the main tabs, and in Inpaint/img2img) show and edit the stored value of the tab / checkpoint in front.
window.refreshLowBitsControls = function () {
    const show = (selectId, mode) => {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        const want = getLowBitsForMode(mode);
        sel.value = [...sel.options].some(o => o.value === want) ? want : LOW_BITS_DEFAULT;
        if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText(selectId);
    };
    show('gen_low_bits', typeof currentMode !== 'undefined' ? currentMode : 'xl');
    show('inp_low_bits', 'inp');
};

window.saveLowBits = function (which) {
    const sel = document.getElementById(which === 'inp' ? 'inp_low_bits' : 'gen_low_bits');
    if (!sel) return;
    const mode = which === 'inp' ? 'inp' : currentMode;
    try {
        const mk = which === 'inp' ? lowBitsModelKey(currentInpModelTitle()) : null;
        // Inpaint/img2img: stored for the checkpoint shown; without a usable checkpoint (still loading) the tab-wide value is used.
        localStorage.setItem(mk || `bojro_low_bits_${lowBitsKeyFor(mode)}`, sel.value);
    } catch (e) { /* not persisted */ }
};

function buildNeverOomScriptPayload(mode) {
    // Forge's built-in script forcing tiled VAE decode / UNet offload. Key "never oom integrated", args [UNet always-offload, VAE always-tiled].
    const unetEl = document.getElementById(`${mode}_neveroom_unet`);
    const vaeEl = document.getElementById(`${mode}_neveroom_vae`);
    const unetEnabled = unetEl ? unetEl.checked : false;
    const vaeEnabled = vaeEl ? vaeEl.checked : false;
    if (!unetEnabled && !vaeEnabled) return {};
    return {
        "never oom integrated": {
            "args": [unetEnabled, vaeEnabled]
        }
    };
}

// Builds the alwayson_scripts.ADetailer entry for up to 4 stacked passes; returns {} when none are enabled.
// LoRA Link (per-pass MORE SETTINGS toggle): extracts <lora:name:weight> tags from the mode's main prompt for LoRAs with "Link to ADetailer" enabled (LoraManager.isLoraLinkEnabled; on by default, opt-out per LoRA). Tag only, no trigger words, as a trigger word can confuse an unrelated pass. Returns the verbatim tags in first-appearance order, deduplicated by LoRA name (case-insensitive); an empty array if none qualify or LoraManager isn't available yet.
function extractLinkableLoraTags(mode) {
    const realMode = mode === 'img2img' ? 'inp' : mode;
    const promptEl = document.getElementById(`${realMode}_prompt`);
    if (!promptEl || !promptEl.value || !window.LoraManager) return [];
    const matches = promptEl.value.match(/<lora:[^:>]+:[^>]+>/g) || [];
    const seen = new Set();
    const result = [];
    for (const tag of matches) {
        const nameMatch = tag.match(/^<lora:([^:>]+):/);
        if (!nameMatch) continue;
        const key = nameMatch[1].toLowerCase();
        if (seen.has(key)) continue;
        if (!LoraManager.isLoraLinkEnabled(nameMatch[1])) continue;
        seen.add(key);
        result.push(tag);
    }
    return result;
}

// The size of the image ADetailer works on for this mode: the Inpaint/img2img target size, or width x height times the Hi-Res Fix scale, rounded to a multiple of 8. Null if unknown (nothing size-related is sent).
function adetailerOutputSize(mode) {
    let w, h;
    if (mode === 'inp' || mode === 'img2img') {
        w = typeof editorTargetW !== 'undefined' ? editorTargetW : NaN;
        h = typeof editorTargetH !== 'undefined' ? editorTargetH : NaN;
    } else {
        w = parseInt(document.getElementById(`${mode}_width`)?.value);
        h = parseInt(document.getElementById(`${mode}_height`)?.value);
        const hrOn = document.getElementById(`${mode}_hr_enable`)?.checked;
        const scale = parseFloat(document.getElementById(`${mode}_hr_scale`)?.value);
        if (hrOn && scale > 0) { w = Math.floor(w * scale); h = Math.floor(h * scale); }
    }
    if (!(w > 0) || !(h > 0)) return null;
    const to8 = v => Math.max(8, Math.round(v / 8) * 8);
    return { w: to8(w), h: to8(h) };
}

function buildAdetailerScriptPayload(mode) {
    const units = [];
    const outputSize = adetailerOutputSize(mode);
    for (let n = 1; n <= 8; n++) {
        const enableEl = document.getElementById(`${mode}_adetailer_${n}_enable`);
        if (!enableEl || !enableEl.checked) continue;

        const model = document.getElementById(`${mode}_adetailer_${n}_model`).value;
        const confidence = parseFloat(document.getElementById(`${mode}_adetailer_${n}_confidence`).value) || 0.3;
        const denoise = parseFloat(document.getElementById(`${mode}_adetailer_${n}_denoise`).value) || 0.4;
        const maskBlur = parseInt(document.getElementById(`${mode}_adetailer_${n}_mask_blur`).value) || 4;
        const padding = parseInt(document.getElementById(`${mode}_adetailer_${n}_padding`).value) || 32;
        // Blank is a deliberate value: ADetailer's signal to use the main prompt/negative. Not trimmed.
        const adPrompt = document.getElementById(`${mode}_adetailer_${n}_prompt`)?.value || '';
        // Only does anything when the pass has its own custom prompt (an empty ad_prompt already reuses the main prompt, LoRAs included). Payload-only: the textarea and its saved value are untouched.
        const loraLinkEl = document.getElementById(`${mode}_adetailer_${n}_lora_link`);
        let finalAdPrompt = adPrompt;
        if (loraLinkEl?.checked && adPrompt.trim()) {
            const linkedTags = extractLinkableLoraTags(mode);
            if (linkedTags.length > 0) finalAdPrompt = `${linkedTags.join(', ')}, ${adPrompt}`;
        }
        const adNegative = document.getElementById(`${mode}_adetailer_${n}_neg`)?.value || '';
        // Empty (the "Unlimited" placeholder state, see normalizeMaxMasksField()) and 0 both mean no limit for ad_mask_k; parseInt(...) || 0 collapses both.
        // The field is ad_mask_k (renamed upstream from ad_mask_k_largest, which ADetailer-Neo rejects as an extra input). ad_mask_filter_method ("Area"/"Confidence") is exposed as an AREA/CONFIDENCE toggle (setAdetailerFilterMethod(), ui.js).
        const maxMasks = parseInt(document.getElementById(`${mode}_adetailer_${n}_max_masks`)?.value) || 0;
        const maskMerge = document.getElementById(`${mode}_adetailer_${n}_mask_merge`)?.value || 'None';
        const filterMethod = document.getElementById(`${mode}_adetailer_${n}_filter_method`)?.value || 'Area';
        // Defaults to true if the checkbox isn't found, never silently switching to whole-picture inpainting.
        const inpaintOnlyMaskedEl = document.getElementById(`${mode}_adetailer_${n}_inpaint_only_masked`);
        const inpaintOnlyMasked = inpaintOnlyMaskedEl ? inpaintOnlyMaskedEl.checked : true;
        const cnModel = document.getElementById(`${mode}_adetailer_${n}_cn_model`)?.value || 'None';
        const cnModule = document.getElementById(`${mode}_adetailer_${n}_cn_module`)?.value || 'none';
        const cnWeight = parseFloat(document.getElementById(`${mode}_adetailer_${n}_cn_weight`)?.value);
        const cnGuidanceStart = parseFloat(document.getElementById(`${mode}_adetailer_${n}_cn_guidance_start`)?.value);
        const cnGuidanceEnd = parseFloat(document.getElementById(`${mode}_adetailer_${n}_cn_guidance_end`)?.value);

        const unit = {
            "ad_model": model,
            "ad_prompt": finalAdPrompt,
            "ad_negative_prompt": adNegative,
            "ad_confidence": confidence,
            "ad_mask_k": maxMasks,
            "ad_mask_filter_method": filterMethod,
            "ad_mask_merge_invert": maskMerge,
            "ad_mask_blur": maskBlur,
            "ad_denoising_strength": denoise,
            "ad_inpaint_only_masked": inpaintOnlyMasked,
            "ad_inpaint_only_masked_padding": padding
        };
        // With Inpaint Only Masked OFF the whole picture is redrawn at the size ADetailer picks; with the server's "match inpaint bbox size" option on that comes from the detected box, squashing the image. Send the image's own size (ADetailer's separate width/height fields) to keep the aspect ratio. Only sent in this case.
        if (!inpaintOnlyMasked && outputSize) {
            unit["ad_use_inpaint_width_height"] = true;
            unit["ad_inpaint_width"] = outputSize.w;
            unit["ad_inpaint_height"] = outputSize.h;
        }
        // ControlNet fields are sent only when a pass has ControlNet configured: Forge Neo's ADetailer build rejects unknown fields, so they are left out unless the pass's ControlNet model is set.
        if (cnModel !== 'None') {
            unit["ad_controlnet_model"] = cnModel;
            // The preprocessor field (ad_controlnet_module): "none" (the schema default) when unset.
            unit["ad_controlnet_module"] = cnModule;
            // Clamped: ADetailer's schema caps this at 1.0, and an older saved value could exceed it.
            const clampedWeight = isNaN(cnWeight) ? 1.0 : Math.max(0, Math.min(1, cnWeight));
            unit["ad_controlnet_weight"] = clampedWeight;
            // ADetailer-Neo combines guidance start/end into ONE field, a 2-element tuple (ad_controlnet_guidance_start_end), not two scalars. The UI keeps two inputs (as the main ControlNet section) and combines them when the payload is built.
            const clampedStart = isNaN(cnGuidanceStart) ? 0.0 : Math.max(0, Math.min(1, cnGuidanceStart));
            const clampedEnd = isNaN(cnGuidanceEnd) ? 1.0 : Math.max(0, Math.min(1, cnGuidanceEnd));
            unit["ad_controlnet_guidance_start_end"] = [clampedStart, clampedEnd];
        }
        units.push(unit);
    }

    if (units.length === 0) return {};

    return {
        "ADetailer": {
            "args": [true, ...units]
        }
    };
}

// Shared by all 7 generation modes. ControlNet's args always contain all 3 units, each with its own "enabled" flag.
// Builds the 7-arg "soft inpainting" script entry (enabled, schedule bias, preservation strength, transition contrast boost, mask influence, difference threshold, difference contrast).
function buildSoftInpaintingScriptPayload(enabled) {
    return {
        "soft inpainting": {
            "args": [
                !!enabled, // Enabled
                1.0, // Schedule Bias
                0.5, // Preservation Strength
                4.0, // Transition Contrast Boost
                0.0, // Mask Influence
                0.5, // Difference Threshold
                2.0 // Difference Contrast
            ]
        }
    };
}

function buildControlNetScriptPayload(mode, sourceImg) {
    const cnUnits = [];
    let anyCnEnabled = false;
    // The 5 main tabs have no source image (sourceImg is null), so unit 1's image is remembered as units 2/3's fallback.
    const isMainTabMode = ['xl', 'flux', 'qwen', 'anima', 'krea'].includes(mode);
    let unit0Image = null;
    for (let u = 0; u <= 2; u++) {
        const cnEnableEl = document.getElementById(`${mode}_cn_${u}_enable`);
        const isEnabled = !!(cnEnableEl && cnEnableEl.checked);
        if (isEnabled) anyCnEnabled = true;

        // Per-unit control image, falling back to the mode's source image, or on the 5 main tabs to unit 1's image.
        const dedicatedControlImg = (typeof controlNetImages !== 'undefined' && controlNetImages[mode]) ? controlNetImages[mode][u] : null;
        if (u === 0) unit0Image = dedicatedControlImg;
        const fallbackImg = (isMainTabMode && u > 0) ? unit0Image : sourceImg;
        const rawControlImg = dedicatedControlImg || fallbackImg;

        cnUnits.push({
            "enabled": isEnabled,
            // Forge's native ControlNet extension accepts "image", not "input_image" (a Mikubill alias that was being filtered out).
            "image": rawControlImg ? rawControlImg.split(',')[1] : "",
            "module": document.getElementById(`${mode}_cn_${u}_module`)?.value || "none",
            // A model select's "Loading..." placeholder has no value="", so its value is that text; treat it as unset rather than sending it as a model name.
            "model": (() => { const v = document.getElementById(`${mode}_cn_${u}_model`)?.value; return (!v || v === 'Loading...') ? "None" : v; })(),
            // Weight and Guidance End fall back to 1.0 only when unreadable (NaN), not when 0 (the sliders can land on 0.00).
            "weight": (() => { const w = parseFloat(document.getElementById(`${mode}_cn_${u}_weight`)?.value); return isNaN(w) ? 1.0 : w; })(),
            "resize_mode": parseInt(document.getElementById(`${mode}_cn_${u}_resize`)?.value) || 0,
            "guidance_start": parseFloat(document.getElementById(`${mode}_cn_${u}_start`)?.value) || 0.0,
            "guidance_end": (() => { const g = parseFloat(document.getElementById(`${mode}_cn_${u}_end`)?.value); return isNaN(g) ? 1.0 : g; })(),
            "control_mode": parseInt(document.getElementById(`${mode}_cn_${u}_control_mode`)?.value) || 0,
            // Forge's bound_check_params() fills a preprocessor default only for negative values, so these three need a real positive value whenever sent.
            "processor_res": parseInt(document.getElementById(`${mode}_cn_${u}_res`)?.value) || 512,
            "threshold_a": parseInt(document.getElementById(`${mode}_cn_${u}_thresh_a`)?.value) || 100,
            "threshold_b": parseInt(document.getElementById(`${mode}_cn_${u}_thresh_b`)?.value) || 200,
            // Forge returns the preprocessor visualisation (edge/pose/depth map) only when this is true.
            "save_detected_map": false
        });
    }

    if (!anyCnEnabled) return {};

    return {
        "controlnet": { "args": cnUnits }
    };
}

// The main tabs have no source image to fall back to, so catch an enabled unit with nothing to send here rather than failing server-side.
function controlNetMissingRequiredImage(cnScripts) {
    if (!cnScripts.controlnet) return false;
    return cnScripts.controlnet.args.some(u => u.enabled && !u.image);
}

// Every job is stamped with the batch-grid options as they were when built: gridMaxEdge > 0 means build a grid on the device, at most this many px on its long edge (batchGridMaxEdge(), utils.js). A queued job keeps its own plan.
function buildJobFromUI() {
    const job = buildJobFromUIRaw();
    if (job) job.gridMaxEdge = batchGridMaxEdge();
    return job;
}

function buildJobFromUIRaw() {
    // FIX 1: Prioritize Inpaint Task Check BEFORE Qwen Mode Check

    let payload = {};
    let overrides = {};
    // CRITICAL: Ensure we use the new calculated profiles
    overrides["forge_inference_memory"] = getVramMapping();
    overrides["forge_unet_storage_dtype"] = getLowBitsForMode(currentTask === 'inp' ? 'inp' : currentMode);
    // do_not_save_grid only stops Forge writing the grid to disk; return_grid controls the API response. Always false: grids are built on the device (batchGridsEnabled(), utils.js).
    overrides["return_grid"] = false;

    // If Inpainting, read from new controls
    if (currentTask === 'inp') {
        const isImg2img = currentInpaintTopMode === 'img2img';
        const model = isImg2img
            ? document.getElementById('img2img_modelSelect').value
            : document.getElementById('inp_modelSelect').value;
        const prompt = document.getElementById('inp_prompt').value;
        if (!model || model.includes('Loading')) {
            // appAlert() returns a truthy Promise, so fire it without awaiting and return the falsy value callers check.
            window.appAlert("Select Model");
            window.__buildJobOwnMessageShown = true;
            return null;
        }

        // Batch Size in the UI is sent as n_iter (API batch_size is always 1): real tensor batching breaks Kontext/img2img-conditioned models (shape mismatch against a size-1 reference embedding).
        const uiBatchSize = parseInt(document.getElementById('inp_batch_size').value) || 1;
        const uiBatchCount = parseInt(document.getElementById('inp_batch_count').value) || 1;
        payload = {
            "prompt": prompt,
            "negative_prompt": document.getElementById('inp_neg').value,
            "steps": parseInt(document.getElementById('inp_steps').value),
            "cfg_scale": parseFloat(document.getElementById('inp_cfg').value),
            // Resize to editor crop resolution
            "width": editorTargetW,
            "height": editorTargetH,
            "sampler_name": document.getElementById('inp_sampler').value,
            "scheduler": document.getElementById('inp_scheduler').value,
            "batch_size": 1,
            "n_iter": uiBatchSize * uiBatchCount,
            "save_images": true,
            // Opt out of a grid explicitly in the payload.
            "do_not_save_grid": true
        };
        // Mask blur is only included for genuine masked Inpaint requests.
        if (!isImg2img) {
            payload.mask_blur = parseInt(document.getElementById('inp_mask_blur').value) || 4;
        }

        if (!sourceImageB64) {
            window.appAlert("Image missing!");
            window.__buildJobOwnMessageShown = true;
            return null;
        }

        // init_images must be a list
        payload.init_images = [sourceImageB64.split(',')[1]];
        payload.denoising_strength = parseFloat(document.getElementById('denoisingStrength').value);
        payload.resize_mode = 0;

        // img2img sends no mask-related fields (which is what makes it whole-image); the mask/fill/padding/soft-inpaint logic below is Inpaint only.
        if (!isImg2img && maskCanvas) {
            const cleanMask = maskCanvas.toDataURL().split(',')[1];
            payload.mask = cleanMask;
            payload.inpainting_mask_invert = 0;

            // NEW LOGIC: Get the fill mode from UI (Default to 1: Original if error)
            // 0=fill, 1=original, 2=latent noise, 3=latent nothing
            const contentMode = parseInt(document.getElementById('inp_content').value);
            payload.inpainting_fill = isNaN(contentMode) ? 1 : contentMode;

            if (currentInpaintMode === 'mask') {
                // Masked Only Mode
                payload.inpaint_full_res = true;
                // Get padding from UI, default to 32 if parsing fails
                payload.inpaint_full_res_padding = parseInt(document.getElementById('inp_padding').value) || 32;
            } else {
                // Whole Picture Mode
                payload.inpaint_full_res = false;
            }
        }

        // Soft Inpainting only applies to genuine masked Inpaint too
        const useSoftInpaint = !isImg2img && document.getElementById('inp_soft_inpaint').checked;
        payload.alwayson_scripts = buildSoftInpaintingScriptPayload(useSoftInpaint);
        if (useSoftInpaint) {
            // Recommendation: Increase mask blur slightly for soft inpainting
            if (payload.mask_blur < 8) payload.mask_blur = 8;
        }

        // Extras for both Inpaint and img2img, with separately-prefixed fields (the VAE for whole-image edits may differ from masked inpainting).
        const fieldPrefix = isImg2img ? 'img2img' : 'inp';
        let extraModules = [];

        const vaeSel = document.getElementById(`${fieldPrefix}_vae`);
        const teSel = document.getElementById(`${fieldPrefix}_te`);
        const vaeVal = vaeSel ? vaeSel.value : 'Automatic';
        const teVal = teSel ? teSel.value : 'None';
        // Reads _clip/_t5 too, only for Flux detection (the fields are hidden but not cleared otherwise). '' means nothing selected.
        const isFluxCheckpoint = window.LoraManager && window.LoraManager.detectCheckpointArchitecture(model) === 'flux';
        const clipSel = document.getElementById(`${fieldPrefix}_clip`);
        const t5Sel = document.getElementById(`${fieldPrefix}_t5`);
        const clipVal = isFluxCheckpoint && clipSel ? clipSel.value : '';
        const t5Val = isFluxCheckpoint && t5Sel ? t5Sel.value : '';
        extraModules = [vaeVal, teVal, clipVal, t5Val].filter(v => v && v !== 'Automatic' && v !== 'None');

        const adScripts = typeof buildAdetailerScriptPayload === 'function' ? buildAdetailerScriptPayload(fieldPrefix) : {};
        const neverOomScripts = typeof buildNeverOomScriptPayload === 'function' ? buildNeverOomScriptPayload(fieldPrefix) : {};
        const combinedExtraScripts = { ...adScripts, ...neverOomScripts };
        if (Object.keys(combinedExtraScripts).length > 0) {
            payload.alwayson_scripts = { ...(payload.alwayson_scripts || {}), ...combinedExtraScripts };
        }

        // Wrapper around buildControlNetScriptPayload() passing sourceImageB64 as the per-unit fallback image.
        const cnScripts = buildControlNetScriptPayload(fieldPrefix, sourceImageB64);
        if (Object.keys(cnScripts).length > 0) {
            payload.alwayson_scripts = { ...(payload.alwayson_scripts || {}), ...cnScripts };
        }

        // Use Model Override logic for generic Inpaint / img2img
        // AND CRITICALLY: Unload any Flux/SDXL modules that might be lingering
        overrides["sd_model_checkpoint"] = model;
        overrides["forge_additional_modules"] = extraModules; // FORCE CLEAR unless a VAE/TE was explicitly selected
        overrides["sd_vae"] = "Automatic"; // RESET VAE
        // Independent per sub-mode (see saveInpaintColorCorrection(), utils.js).
        const colorCorrectionEl = document.getElementById(`${fieldPrefix}_color_correction`);
        overrides["img2img_color_correction"] = colorCorrectionEl ? colorCorrectionEl.checked : false;

        payload.override_settings = overrides;

        return {
            mode: 'inp',
            modelTitle: model,
            payload: payload,
            desc: `${isImg2img ? 'img2img' : 'Inpaint'}: ${prompt.substring(0,20)}...`
        };
    }

    // --- NEO HOOK: DELEGATE TO NEO IF QWEN MODE ---
    // Moved below currentTask check to prevent hijacking
    if (currentMode === 'qwen' && window.Neo && window.Neo.buildJob) {
        return window.Neo.buildJob();
    }

    // Existing XL / Flux / Anima Logic
    const mode = currentMode;
    let targetModelTitle;
    if (mode === 'xl') targetModelTitle = document.getElementById('xl_modelSelect').value;
    else if (mode === 'anima') targetModelTitle = document.getElementById('anima_modelSelect').value;
    else if (mode === 'krea') targetModelTitle = document.getElementById('krea_modelSelect').value;
    else targetModelTitle = document.getElementById('flux_modelSelect').value;
    if (!targetModelTitle || targetModelTitle.includes("Link first")) return null;

    if (mode === 'xl') {
        overrides["forge_additional_modules"] = [];
        overrides["sd_vae"] = "Automatic";

        const adetailerScripts = buildAdetailerScriptPayload('xl');
        const neverOomScripts = buildNeverOomScriptPayload('xl');
        // txt2img modes have no source image; each unit's image comes from its own upload.
        const cnScripts = buildControlNetScriptPayload('xl', null);
        if (controlNetMissingRequiredImage(cnScripts)) {
            Toast.show({ text: "Load a reference image for ControlNET, or disable it.", duration: 'short' });
            window.__buildJobOwnMessageShown = true;
            return null;
        }
        // "soft inpainting" is an img2img-only extension: sending it on a main tab's outer request is rejected (HTTP 422), so it is not sent on any main tab.
        const xlCombinedScripts = { ...adetailerScripts, ...neverOomScripts, ...cnScripts };

        payload = {
            "prompt": document.getElementById('xl_prompt').value,
            "negative_prompt": document.getElementById('xl_neg').value,
            "steps": parseInt(document.getElementById('xl_steps').value),
            "cfg_scale": parseFloat(document.getElementById('xl_cfg').value),
            "width": parseInt(document.getElementById('xl_width').value),
            "height": parseInt(document.getElementById('xl_height').value),
            "batch_size": parseInt(document.getElementById('xl_batch_size').value) || 1,
            "n_iter": parseInt(document.getElementById('xl_batch_count').value) || 1,
            "sampler_name": document.getElementById('xl_sampler').value,
            "scheduler": document.getElementById('xl_scheduler').value,
            "seed": parseSeedValue(document.getElementById('xl_seed').value),
            "save_images": true,
            // No combined grid for batches (as Inpaint/img2img).
            "do_not_save_grid": true,
            // High Res Fix Injection
            ...(document.getElementById('xl_hr_enable') && document.getElementById('xl_hr_enable').checked ? {
                "enable_hr": true,
                "hr_scale": parseFloat(document.getElementById('xl_hr_scale').value),
                "hr_upscaler": document.getElementById('xl_hr_upscaler').value,
                "hr_second_pass_steps": parseInt(document.getElementById('xl_hr_steps').value),
                "denoising_strength": parseFloat(document.getElementById('xl_hr_denoise').value),
                "hr_cfg": parseFloat(document.getElementById('xl_hr_cfg').value),
                "hr_additional_modules": ["Use same choices"]
            } : {}),
            // ADetailer + Never OOM Injection
            ...(Object.keys(xlCombinedScripts).length > 0 ? { "alwayson_scripts": xlCombinedScripts } : {}),
            // ControlNet's extension reads a top-level resize_mode from the request; only sent when ControlNet is enabled, taken from unit 0 in cnScripts.
            ...(cnScripts.controlnet ? { "resize_mode": cnScripts.controlnet.args[0].resize_mode } : {}),
            "override_settings": overrides
        };
    } else if (mode === 'anima') {
        // Anima needs its own VAE/Text Encoder override (as Flux's VAE/CLIP/T5, with 2 modules).
        const modulesList = [document.getElementById('anima_vae').value, document.getElementById('anima_te').value].filter(v => v && v !== "Automatic" && v !== "None");
        // Always sent, even when empty: the runJob() module sync leaves the server's stored modules equal to each job's, so a mode sending nothing would inherit the previous mode's.
        overrides["forge_additional_modules"] = modulesList;

        overrides["forge_unet_storage_dtype"] = getLowBitsForMode('anima');

        const animaAdetailerScripts = buildAdetailerScriptPayload('anima');
        const animaNeverOomScripts = buildNeverOomScriptPayload('anima');
        const animaCnScripts = buildControlNetScriptPayload('anima', null);
        if (controlNetMissingRequiredImage(animaCnScripts)) {
            Toast.show({ text: "Load a reference image for ControlNET, or disable it.", duration: 'short' });
            window.__buildJobOwnMessageShown = true;
            return null;
        }
        const animaCombinedScripts = { ...animaAdetailerScripts, ...animaNeverOomScripts, ...animaCnScripts };

        payload = {
            "prompt": document.getElementById('anima_prompt').value,
            "negative_prompt": document.getElementById('anima_neg').value,
            "steps": parseInt(document.getElementById('anima_steps').value),
            "cfg_scale": parseFloat(document.getElementById('anima_cfg').value),
            "width": parseInt(document.getElementById('anima_width').value),
            "height": parseInt(document.getElementById('anima_height').value),
            "batch_size": parseInt(document.getElementById('anima_batch_size').value) || 1,
            "n_iter": parseInt(document.getElementById('anima_batch_count').value) || 1,
            "sampler_name": document.getElementById('anima_sampler').value,
            "scheduler": document.getElementById('anima_scheduler').value,
            "seed": parseSeedValue(document.getElementById('anima_seed').value),
            "save_images": true,
            // No combined grid for batches (as Inpaint/img2img).
            "do_not_save_grid": true,
            // High Res Fix Injection
            ...(document.getElementById('anima_hr_enable') && document.getElementById('anima_hr_enable').checked ? {
                "enable_hr": true,
                "hr_scale": parseFloat(document.getElementById('anima_hr_scale').value),
                "hr_upscaler": document.getElementById('anima_hr_upscaler').value,
                "hr_second_pass_steps": parseInt(document.getElementById('anima_hr_steps').value),
                "denoising_strength": parseFloat(document.getElementById('anima_hr_denoise').value),
                "hr_cfg": parseFloat(document.getElementById('anima_hr_cfg').value),
                "hr_additional_modules": ["Use same choices"]
            } : {}),
            // ADetailer + Never OOM Injection
            ...(Object.keys(animaCombinedScripts).length > 0 ? { "alwayson_scripts": animaCombinedScripts } : {}),
            ...(animaCnScripts.controlnet ? { "resize_mode": animaCnScripts.controlnet.args[0].resize_mode } : {}),
            "override_settings": overrides
        };
    } else if (mode === 'krea') {
        // Krea 2: 12B DiT, flow-matching, Qwen3-VL text encoder + Qwen-Image VAE
        const modulesList = [document.getElementById('krea_vae').value, document.getElementById('krea_te').value].filter(v => v && v !== "Automatic" && v !== "None");
        // Always sent, even when empty (see the Anima module list above).
        overrides["forge_additional_modules"] = modulesList;

        overrides["forge_unet_storage_dtype"] = getLowBitsForMode('krea');

        const kreaAdetailerScripts = buildAdetailerScriptPayload('krea');
        const kreaNeverOomScripts = buildNeverOomScriptPayload('krea');
        const kreaCnScripts = buildControlNetScriptPayload('krea', null);
        if (controlNetMissingRequiredImage(kreaCnScripts)) {
            Toast.show({ text: "Load a reference image for ControlNET, or disable it.", duration: 'short' });
            window.__buildJobOwnMessageShown = true;
            return null;
        }
        const kreaCombinedScripts = { ...kreaAdetailerScripts, ...kreaNeverOomScripts, ...kreaCnScripts };

        payload = {
            "prompt": document.getElementById('krea_prompt').value,
            "negative_prompt": document.getElementById('krea_neg').value,
            "steps": parseInt(document.getElementById('krea_steps').value),
            "cfg_scale": parseFloat(document.getElementById('krea_cfg').value),
            "width": parseInt(document.getElementById('krea_width').value),
            "height": parseInt(document.getElementById('krea_height').value),
            "batch_size": parseInt(document.getElementById('krea_batch_size').value) || 1,
            "n_iter": parseInt(document.getElementById('krea_batch_count').value) || 1,
            "sampler_name": document.getElementById('krea_sampler').value,
            "scheduler": document.getElementById('krea_scheduler').value,
            "seed": parseSeedValue(document.getElementById('krea_seed').value),
            "save_images": true,
            // No combined grid for batches (as Inpaint/img2img).
            "do_not_save_grid": true,
            ...(document.getElementById('krea_hr_enable') && document.getElementById('krea_hr_enable').checked ? {
                "enable_hr": true,
                "hr_scale": parseFloat(document.getElementById('krea_hr_scale').value),
                "hr_upscaler": document.getElementById('krea_hr_upscaler').value,
                "hr_second_pass_steps": parseInt(document.getElementById('krea_hr_steps').value),
                "denoising_strength": parseFloat(document.getElementById('krea_hr_denoise').value),
                "hr_cfg": parseFloat(document.getElementById('krea_hr_cfg').value),
                "hr_additional_modules": ["Use same choices"]
            } : {}),
            // ADetailer Injection
            ...(Object.keys(kreaCombinedScripts).length > 0 ? { "alwayson_scripts": kreaCombinedScripts } : {}),
            ...(kreaCnScripts.controlnet ? { "resize_mode": kreaCnScripts.controlnet.args[0].resize_mode } : {}),
            "override_settings": overrides
        };
    } else {
        const modulesList = [document.getElementById('flux_vae').value, document.getElementById('flux_clip').value, document.getElementById('flux_t5').value].filter(v => v && v !== "Automatic");
        // Always sent, even when empty (see the Anima module list above).
        overrides["forge_additional_modules"] = modulesList;
        
        overrides["forge_unet_storage_dtype"] = getLowBitsForMode('flux');
        
        const distCfg = parseFloat(document.getElementById('flux_distilled').value);

        // --- NEW FLUX CACHE (FBC) LOGIC START ---
        let scriptsPayload = {};
        const useCache = document.getElementById('flux_cache_enable').checked;
        
        if (useCache) {
            scriptsPayload["First Block Cache / TeaCache"] = {
                "args": [
                    true,                                           // Enabled
                    "First Block Cache",                            // Method
                    parseFloat(document.getElementById('flux_cache_threshold').value), // Threshold
                    parseInt(document.getElementById('flux_cache_start').value),       // Uncached start
                    parseInt(document.getElementById('flux_cache_max').value),         // Max consecutive
                    document.getElementById('flux_cache_last').checked                 // Skip last step? (Checked = True)
                ]
            };
        }
        // --- NEW FLUX CACHE (FBC) LOGIC END ---

        const fluxAdetailerScripts = buildAdetailerScriptPayload('flux');
        Object.assign(scriptsPayload, fluxAdetailerScripts);
        Object.assign(scriptsPayload, buildNeverOomScriptPayload('flux'));
        const fluxCnScripts = buildControlNetScriptPayload('flux', null);
        if (controlNetMissingRequiredImage(fluxCnScripts)) {
            Toast.show({ text: "Load a reference image for ControlNET, or disable it.", duration: 'short' });
            window.__buildJobOwnMessageShown = true;
            return null;
        }
        Object.assign(scriptsPayload, fluxCnScripts);

        payload = {
            "prompt": document.getElementById('flux_prompt').value,
            "negative_prompt": "",
            "steps": parseInt(document.getElementById('flux_steps').value),
            "cfg_scale": parseFloat(document.getElementById('flux_cfg').value),
            "distilled_cfg_scale": isNaN(distCfg) ? 3.5 : distCfg,
            "width": parseInt(document.getElementById('flux_width').value),
            "height": parseInt(document.getElementById('flux_height').value),
            "batch_size": parseInt(document.getElementById('flux_batch_size').value) || 1,
            "n_iter": parseInt(document.getElementById('flux_batch_count').value) || 1,
            "sampler_name": document.getElementById('flux_sampler').value,
            "scheduler": document.getElementById('flux_scheduler').value,
            "seed": parseSeedValue(document.getElementById('flux_seed').value),
            "save_images": true,
            // No combined grid for batches (as Inpaint/img2img).
            "do_not_save_grid": true,
            "alwayson_scripts": scriptsPayload,
            ...(fluxCnScripts.controlnet ? { "resize_mode": fluxCnScripts.controlnet.args[0].resize_mode } : {}),
            // High Res Fix Injection
            ...(document.getElementById('flux_hr_enable') && document.getElementById('flux_hr_enable').checked ? {
                "enable_hr": true,
                "hr_scale": parseFloat(document.getElementById('flux_hr_scale').value),
                "hr_upscaler": document.getElementById('flux_hr_upscaler').value,
                "hr_second_pass_steps": parseInt(document.getElementById('flux_hr_steps').value),
                "denoising_strength": parseFloat(document.getElementById('flux_hr_denoise').value),
                "hr_cfg": parseFloat(document.getElementById('flux_hr_cfg').value),
                "hr_additional_modules": ["Use same choices"]
            } : {}),
            "override_settings": overrides
        };
    }
    return {
        mode: mode,
        modelTitle: targetModelTitle,
        payload: payload,
        desc: `${payload.prompt.substring(0, 30)}...`
    };
}

// -----------------------------------------------------------
// QUEUE MANAGEMENT
// -----------------------------------------------------------

// Cancels the current server-side generation; shared by the ABORT button and the batch queue's ABORT.
window.interruptGeneration = async function() {
    try {
        await fetch(`${HOST}/sdapi/v1/interrupt`, {
            method: 'POST',
            headers: getHeaders()
        });
        if (typeof Toast !== 'undefined' && Toast) Toast.show({ text: 'Aborted', duration: 'short' });
    } catch (e) {
        console.error("Interrupt failed:", e);
    }
}

// Enables or greys out an ABORT button depending on whether something is running.
function setAbortButtonState(btnId, isRunning) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = !isRunning;
    if (isRunning) {
        btn.style.color = '#f44336';
        btn.style.borderColor = 'rgba(244, 67, 54, 0.4)';
        btn.style.background = 'rgba(244, 67, 54, 0.08)';
        btn.style.opacity = '1';
    } else {
        btn.style.color = 'var(--text-muted)';
        btn.style.borderColor = 'var(--border-color)';
        btn.style.background = 'transparent';
        btn.style.opacity = '0.5';
    }
}

// Items always go into QUEUE first, never straight into ACTIVE, so more can be added while a batch runs. Completed jobs keep only prompt/negative/mode: base64 images would exceed localStorage's quota.
function stripLargePayloadFields(payload) {
    if (!payload) return payload;
    const stripped = { ...payload };
    delete stripped.init_images;
    delete stripped.mask;
    if (stripped.alwayson_scripts?.controlnet?.args?.[0]?.image) {
        stripped.alwayson_scripts = {
            ...stripped.alwayson_scripts,
            controlnet: {
                ...stripped.alwayson_scripts.controlnet,
                args: [{ ...stripped.alwayson_scripts.controlnet.args[0], image: undefined }]
            }
        };
    }
    return stripped;
}

// Parses a seed field, defaulting to -1 (random) for empty or non-numeric input (0 is a valid seed).
function parseSeedValue(raw) {
    if (raw === null || raw === undefined) return -1;
    const trimmed = String(raw).trim();
    if (trimmed === '') return -1;
    const parsed = parseInt(trimmed, 10);
    return isNaN(parsed) ? -1 : parsed;
}


// Catches any LoRA change, now that unloadModel() fires from only a couple of triggers (it was narrowed to removals to limit a rare Forge/CUDA crash).
function loraSetChanged(previous, current) {
    if (previous.size !== current.size) return true;
    for (const tag of previous) if (!current.has(tag)) return true;
    return false;
}

const MAX_COMPLETED_HISTORY = 50;

window.addToQueue = function() {
    let job;
    // The same pre-build tidy-up as Generate (duplicate tags, closing comma), so a queued job carries the same prompt.
    if (typeof dedupePromptTagsForMode === 'function') dedupePromptTagsForMode(currentMode);
    try {
        job = buildJobFromUI();
    } catch (e) {
        console.error(e);
        window.appAlert("Couldn't add to queue: " + e.message);
        return;
    }
    if (!job) {
        window.appAlert("Please select a model first.");
        return;
    }
    job.id = Date.now().toString();
    job.timestamp = new Date().toLocaleString();

    queueState.next.push(job);
    saveQueueState();
    renderQueueAll();

    const badge = document.getElementById('queueBadge');
    badge.style.transform = "scale(1.5)";
    setTimeout(() => badge.style.transform = "scale(1)", 200);
}

// Escapes text before interpolating it into innerHTML: job.desc is a raw prompt slice that contains literal <lora:...> tags.
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Also escapes both quote characters, so it is safe inside quoted attributes and inline handler strings; used wherever a value isn't known to be plain text (workflow data, server names, imported files).
function escapeHtmlAttr(text) {
    return escapeHtml(text).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

window.renderQueueAll = function() {
    renderList('ongoing', queueState.ongoing);
    renderList('next', queueState.next);
    renderList('completed', queueState.completed);
    updateQueueBadge();
}

window.renderList = function(type, listData) {
    const container = document.getElementById(`list-${type}`);
    container.innerHTML = "";
    if (listData.length === 0) {
        container.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:11px;padding:10px;">Empty</div>`;
        return;
    }

    listData.forEach((job, index) => {
        const item = document.createElement('div');
        item.className = 'q-card';
        if (type !== 'completed') {
            item.draggable = true;
            item.ondragstart = (e) => dragStart(e, type, index);
        }
        let deleteBtn = `<button onclick="removeJob('${type}', ${index})" class="btn-icon" style="width:32px;height:32px;margin-left:6px;color:#f44336;border:none;"><i data-lucide="x" size="18"></i></button>`;
        const viewBtn = type === 'completed' ? `<button onclick="viewCompletedPrompt(${index})" class="btn-icon" style="width:32px;height:32px;color:#ff9800;border:none;" title="View full prompt"><i data-lucide="file-text" size="18"></i></button>` : "";
        const handle = type !== 'completed' ? `<div class="q-handle"><i data-lucide="grip-vertical" size="14"></i></div>` : "";
        item.innerHTML = `${handle}<div class="q-details"><div style="font-weight:bold; font-size:11px; color:var(--text-main);">${job.mode.toUpperCase()}</div><div class="q-meta">${escapeHtml(job.desc)}</div></div>${viewBtn}${deleteBtn}`;
        container.appendChild(item);
    });
    lucide.createIcons();
}

// Shows the full positive/negative prompt of a completed queue item, with copy buttons.
window.viewCompletedPrompt = function(index) {
    const job = queueState.completed[index];
    if (!job) return;
    const positive = job.payload?.prompt || "";
    const negative = job.payload?.negative_prompt || "";

    document.getElementById('promptViewPositive').value = positive;
    document.getElementById('promptViewNegative').value = negative;
    document.getElementById('promptViewModal').classList.remove('hidden');
}

// Android 13+ shows its own "Copied to clipboard" toast, so the app's toast is suppressed there (detected via navigator.userAgent).
window.androidShowsOwnClipboardToast = function() {
    const match = navigator.userAgent.match(/Android\s+(\d+)/);
    return !!match && parseInt(match[1], 10) >= 13;
}

window.copyPromptViewField = async function(fieldId) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    const text = el.value;

    let copiedViaModernApi = false;
    try {
        // Awaited: writeText() rejects asynchronously, so a bare try/catch would never reach the execCommand() fallback.
        await navigator.clipboard.writeText(text);
        copiedViaModernApi = true;
    } catch (e) {
        el.select();
        el.setSelectionRange(0, 99999);
        document.execCommand('copy');
    }

    // Clears the visible selection highlight either way.
    el.blur();
    if (window.getSelection) window.getSelection().removeAllRanges();

    if (typeof Toast !== 'undefined' && Toast) {
        const systemAlreadyShowsOne = copiedViaModernApi && window.androidShowsOwnClipboardToast();
        if (!systemAlreadyShowsOne) Toast.show({ text: 'Copied', duration: 'short' });
    }
}

window.removeJob = function(type, index) {
    // ongoing[0] is what processQueue()'s loop is awaiting, so removing it would crash or mark the wrong job complete. Use ABORT for what's running; removal is only for waiting items.
    if (type === 'ongoing' && index === 0 && isQueueRunning) {
        if (Toast) Toast.show({ text: 'Use ABORT to stop the current generation', duration: 'short' });
        return;
    }
    queueState[type].splice(index, 1);
    saveQueueState();
    renderQueueAll();
}

window.clearQueueSection = async function(type) {
    if (await window.appConfirm(`Clear all ${type.toUpperCase()} items?`, { title: 'Clear Queue', okText: 'CLEAR', danger: true })) {
        queueState[type] = [];
        saveQueueState();
        renderQueueAll();
    }
}

// Drag & Drop
let draggedItem = null;
window.dragStart = function(e, type, index) {
    draggedItem = {
        type,
        index
    };
    e.dataTransfer.effectAllowed = 'move';
    e.target.classList.add('dragging');
}
window.allowDrop = function(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}
window.drop = function(e, targetType) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (!draggedItem) return;
    if (draggedItem.type !== targetType) {
        const item = queueState[draggedItem.type].splice(draggedItem.index, 1)[0];
        queueState[targetType].push(item);
        saveQueueState();
        renderQueueAll();
    }
    document.querySelectorAll('.dragging').forEach(d => d.classList.remove('dragging'));
    draggedItem = null;
}

window.processQueue = async function() {
    if (isQueueRunning) return;
    if (queueState.next.length === 0) {
        await window.appAlert("Queue empty!");
        return;
    }

    // Only warns when the batch itself exceeds the cache limit (a normal batch against a full gallery just prunes the oldest).
    const totalImagesThisBatch = queueState.next.reduce((acc, job) => {
        return acc + ((job.payload.n_iter || 1) * (job.payload.batch_size || 1));
    }, 0);
    const cacheLimit = typeof getGalleryCacheLimit === 'function' ? getGalleryCacheLimit() : 30;
    const overflowCount = totalImagesThisBatch - cacheLimit;
    if (overflowCount > 0) {
        const proceed = await window.appConfirm(
            `This batch will generate ${totalImagesThisBatch} images, the first ${overflowCount} will be deleted before the batch finishes as your Gallery Cache Limit is ${cacheLimit}.\n\nContinue anyway?`,
            { title: 'Gallery Cache Limit', okText: 'CONTINUE' }
        );
        if (!proceed) return;
    }

    // Move everything waiting in QUEUE into ACTIVE; items added later wait for the next START BATCH.
    queueState.ongoing.push(...queueState.next);
    queueState.next = [];
    saveQueueState();
    renderQueueAll();

    isQueueRunning = true;
    isAborting = false;

    // --- 1. START PROTECTION ---
    if (typeof window.activateKeepAlive === 'function') window.activateKeepAlive();

    // Declared before the try block so finally can always reach them.
    const btn = document.getElementById('startQueueBtn');
    const oldText = btn ? btn.innerText : '';

    try {
        // --- 2. Calculate Steps ---
        totalBatchSteps = queueState.ongoing.reduce((acc, job) => {
            let perImage = job.payload.steps || 0;
            if (job.payload.enable_hr) {
                perImage += (job.payload.hr_second_pass_steps || 0);
            }
            return acc + ((job.payload.n_iter || 1) * perImage);
        }, 0);

        currentBatchProgress = 0;
        queueADetailerGrowthCarried = 0;

        // --- 3. UI Setup ---
        document.getElementById('queueProgressBox').classList.remove('hidden');
        // Reset the queue's progress text so it doesn't show the previous run's last value (e.g. "Step 220 / 220") until the first poll.
        document.getElementById('queueProgressText').innerText = `Step 0 / ${totalBatchSteps}`;
        btn.innerText = "RUNNING...";
        btn.disabled = true;
        setAbortButtonState('abortQueueBtn', true);

        if (document.hidden) updateBatchNotification("Starting batch job...", true, `0 / ${totalBatchSteps} steps`);

        // --- 4. The Loop (Only ONE loop) ---
        while (queueState.ongoing.length > 0) {
            const job = queueState.ongoing[0];
            try {
                await runJob(job, true);

                // If aborted while this job ran, don't record it as completed (abortQueue() already cleared the array).
                if (isAborting) break;

                const finishedJob = queueState.ongoing.shift();
                if (!finishedJob) break;
                finishedJob.finishedAt = new Date().toLocaleString();
                finishedJob.payload = stripLargePayloadFields(finishedJob.payload);
                queueState.completed.push(finishedJob);
                if (queueState.completed.length > MAX_COMPLETED_HISTORY) {
                    queueState.completed.splice(0, queueState.completed.length - MAX_COMPLETED_HISTORY);
                }
                saveQueueState();
                renderQueueAll();
            } catch (e) {
                if (isAborting) break; // expected - user-initiated, not a real error
                console.error(e);
                updateBatchNotification("Batch Paused", true, "Error occurred");
                await window.appAlert("Batch paused: " + e.message);
                break; // Stop loop on error
            }
        }

        // Runs when the loop exits without an uncaught throw (normal completion, abort, or an in-loop error turned into a break).
        if (typeof sendCompletionNotification === 'function') {
            await sendCompletionNotification("Batch Complete: All images ready.");
        }
        if (queueState.ongoing.length === 0) await window.appAlert("Batch Complete!");
    } finally {
        // --- 5+6. Cleanup + STOP PROTECTION ---
        // In finally, so a throw above can't leave the queue state, button and wake lock stuck.
        isQueueRunning = false;
        isAborting = false;
        if (btn) {
            btn.innerText = oldText;
            btn.disabled = false;
        }
        setAbortButtonState('abortQueueBtn', false);
        const progressBox = document.getElementById('queueProgressBox');
        if (progressBox) progressBox.classList.add('hidden');

        if (window.ResolverService) {
            try {
                await window.ResolverService.stop();
            } catch (e) {}
        } else if (window.Capacitor && window.Capacitor.Plugins.ResolverService) {
            try {
                 window.Capacitor.Plugins.ResolverService.stop();
            } catch (e) {}
        }

        if (typeof window.deactivateKeepAlive === 'function') window.deactivateKeepAlive();
    }
}

// Cancels the running batch item and discards the rest of ACTIVE (not requeued); QUEUE is untouched.
window.abortQueue = async function() {
    if (!isQueueRunning) return;

    isAborting = true;
    queueState.ongoing = [];
    saveQueueState();
    renderQueueAll();

    await window.interruptGeneration();
}

window.generate = async function() {
    let job;
    // Set by buildJobFromUI()/Neo.buildJob() before a return null that already showed its own message, to avoid a second generic "Please select a model first." popup. Reset after being read.
    window.__buildJobOwnMessageShown = false;
    // Covers generating without leaving the prompt/negative box (dedupePromptTagsOnBlur() never fires then). Must run before buildJobFromUI() reads the DOM.
    if (typeof dedupePromptTagsForMode === 'function') dedupePromptTagsForMode(currentMode);
    try {
        job = buildJobFromUI();
    } catch (e) {
        console.error(e);
        await window.appAlert("Couldn't start generation: " + e.message);
        return;
    }
    if (!job) {
        if (!window.__buildJobOwnMessageShown) {
            await window.appAlert("Please select a model first.");
        }
        window.__buildJobOwnMessageShown = false;
        return;
    }

    // The same Gallery Cache Limit warning as processQueue(), for this job's image count (generate() bypasses processQueue()).
    const genThisJobImages = (job.payload.n_iter || 1) * (job.payload.batch_size || 1);
    const genCacheLimit = typeof getGalleryCacheLimit === 'function' ? getGalleryCacheLimit() : 30;
    const genOverflowCount = genThisJobImages - genCacheLimit;
    if (genOverflowCount > 0) {
        const proceed = await window.appConfirm(
            `This will generate ${genThisJobImages} image${genThisJobImages === 1 ? '' : 's'}, the first ${genOverflowCount} will be deleted before it finishes as your Gallery Cache Limit is ${genCacheLimit}.\n\nContinue anyway?`,
            { title: 'Gallery Cache Limit', okText: 'CONTINUE' }
        );
        if (!proceed) return;
    }

    // --- 1. START PROTECTION ---
    if (typeof window.activateKeepAlive === 'function') window.activateKeepAlive();

    isSingleJobRunning = true;
    setAbortButtonState('abortGenBtn', true);
    setAbortButtonState('abortInpGenBtn', true);

    try {
        // Run the job
        await runJob(job, false);
    } catch (e) {
        console.error("Generation Error:", e);
        // This native alert (the "Error: Failed to fetch" popup) is shared by every mode, so use the in-app dialog.
        await window.appAlert("Error: " + e.message, { title: 'Generation Failed', danger: true });
    } finally {
        // --- 2. ALWAYS CLEAN UP ---
        isSingleJobRunning = false;
        setAbortButtonState('abortGenBtn', false);
        setAbortButtonState('abortInpGenBtn', false);

        // --- 3. STOP PROTECTION ---
        if (typeof window.deactivateKeepAlive === 'function') window.deactivateKeepAlive();

        // Stop persistent notification (Robust Check)
        if (window.ResolverService) {
            try {
                await window.ResolverService.stop();
            } catch (e) {}
        } else if (window.Capacitor && window.Capacitor.Plugins.ResolverService) {
            try {
                 window.Capacitor.Plugins.ResolverService.stop();
            } catch (e) {}
        }
    }

    // Send completion notification
    if (typeof sendCompletionNotification === 'function') {
        await sendCompletionNotification("Generation Complete: Image Ready");
    }
}

window.clearGenResults = function() {
    if (currentTask === 'inp') {
        const gal = document.getElementById('inpGallery');
        if (gal) gal.innerHTML = '';
    } else {
        const gal = document.getElementById('gallery');
        if (gal) gal.innerHTML = '';
    }
}

// Live Preview: shows the in-progress frame the API returns on each poll (fetched only when livePreviewCheck is checked; see pollProgressOnce) above the results gallery. clearLivePreviewImage() runs when the first real result is shown (addResult() in runJob()), holding the last frame until then, and whenever a job ends another way.
const LIVE_PREVIEW_IMG_IDS = ['livePreviewImg', 'inpLivePreviewImg'];
function updateLivePreviewImage(base64Data) {
    // Both the main tab's frame and the Inpaint/img2img tab's, as a job started on one tab can finish while the other is open.
    const src = `data:image/png;base64,${base64Data}`;
    LIVE_PREVIEW_IMG_IDS.forEach(id => {
        const img = document.getElementById(id);
        if (!img) return;
        img.src = src;
        img.classList.remove('hidden');
    });
}
function clearLivePreviewImage() {
    LIVE_PREVIEW_IMG_IDS.forEach(id => {
        const img = document.getElementById(id);
        if (!img) return;
        img.classList.add('hidden');
        img.src = '';
    });
}

// Builds a batch grid on the device from a job's returned images (nothing extra is downloaded). Layout as Forge's: rows = round(sqrt(n)), columns = ceil(n / rows), filled in generation order, empty spots black. Scaled down (never up) so the long edge is at most maxEdge; each image is fitted inside its cell. Carries no generation info. If the browser can't produce the requested size (a too-large canvas returns nothing), it retries at half and then a quarter.
async function buildLocalBatchGrid(dataUrls, maxEdge) {
    const n = dataUrls.length;
    if (n < 2) return null;
    const imgs = await Promise.all(dataUrls.map(async src => {
        const im = new Image();
        im.src = src;
        await im.decode();
        return im;
    }));
    for (const edge of [maxEdge, Math.floor(maxEdge / 2), Math.floor(maxEdge / 4)]) {
        const url = drawBatchGrid(imgs, edge);
        if (url) return url;
    }
    return null;
}

function drawBatchGrid(imgs, maxEdge) {
    const n = imgs.length;
    const rows = Math.min(n, Math.max(1, Math.round(Math.sqrt(n))));
    const cols = Math.ceil(n / rows);
    const cellW = Math.max(...imgs.map(i => i.naturalWidth));
    const cellH = Math.max(...imgs.map(i => i.naturalHeight));
    const scale = Math.min(1, maxEdge / Math.max(cols * cellW, rows * cellH));
    const tw = Math.max(1, Math.floor(cellW * scale));
    const th = Math.max(1, Math.floor(cellH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = cols * tw;
    canvas.height = rows * th;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Batch grid layout: everything is placed on whole pixels, and an image within 0.5% (min 2px) of filling its tile is drawn to fill it, so rows have no seam.
    const snapTol = full => Math.max(2, full * 0.005);
    imgs.forEach((im, idx) => {
        const s = Math.min(tw / im.naturalWidth, th / im.naturalHeight);
        const fitW = im.naturalWidth * s;
        const fitH = im.naturalHeight * s;
        const dw = (tw - fitW <= snapTol(tw)) ? tw : Math.round(fitW);
        const dh = (th - fitH <= snapTol(th)) ? th : Math.round(fitH);
        const x = (idx % cols) * tw + Math.floor((tw - dw) / 2);
        const y = Math.floor(idx / cols) * th + Math.floor((th - dh) / 2);
        ctx.drawImage(im, x, y, dw, dh);
    });
    const url = canvas.toDataURL('image/png');
    // "data:," is what a canvas that could not be allocated hands back.
    return url.startsWith('data:image/png') ? url : null;
}

const LONG_PRESS_MS = 500;
// Debounces long-press actions so one press shows one toast.
let lastLongPressActionTime = 0;
const LONG_PRESS_DEBOUNCE_MS = 1000;

// Long-pressing a result thumbnail sends that image's own seed (read from its PNG metadata) to the active mode's seed field. Used on the main results gallery.
async function sendSeedFromResultImage(img) {
    const mode = typeof currentMode !== 'undefined' ? currentMode : null;
    const seedEl = mode ? document.getElementById(`${mode}_seed`) : null;
    if (!seedEl) return false;
    const seed = await extractSeedFromDataUrl(img.src);
    if (seed === null) return false;
    seedEl.value = seed;
    if (typeof normalizeSeedField === 'function') normalizeSeedField(seedEl);
    if (Toast) Toast.show({ text: 'Seed sent', duration: 'short' });
}

// Long-pressing a result in the Inpaint / img2img / Upscale tab sends it to the Upscaler, replacing the loaded image.
function sendResultToUpscaler(img) {
    return sendImageToUpscaler(img.src);
}

// Runs onLongPress after a long press on a result thumbnail, and suppresses the click that follows so the fullscreen viewer doesn't also open.
function attachLongPress(img, onLongPress) {
    let pressTimer = null;
    let firedThisPress = false;
    // Ignores the compatibility mouse events some webviews fire after touch events for the same press.
    let touchJustHappened = false;

    const start = () => {
        firedThisPress = false;
        clearTimeout(pressTimer);
        pressTimer = setTimeout(async () => {
            firedThisPress = true;
            const now = Date.now();
            if (now - lastLongPressActionTime < LONG_PRESS_DEBOUNCE_MS) return;
            lastLongPressActionTime = now;
            await onLongPress(img);
        }, LONG_PRESS_MS);
    };
    const cancel = () => { clearTimeout(pressTimer); };

    img.addEventListener('touchstart', () => {
        touchJustHappened = true;
        start();
    }, { passive: true });
    img.addEventListener('touchend', () => {
        cancel();
        setTimeout(() => { touchJustHappened = false; }, 1000);
    });
    img.addEventListener('touchmove', cancel);
    img.addEventListener('touchcancel', () => {
        cancel();
        setTimeout(() => { touchJustHappened = false; }, 1000);
    });
    img.addEventListener('mousedown', () => {
        if (touchJustHappened) return;
        start();
    });
    img.addEventListener('mouseup', cancel);
    img.addEventListener('mouseleave', cancel);

    img.addEventListener('click', (e) => {
        if (firedThisPress) {
            e.stopImmediatePropagation();
            e.preventDefault();
            firedThisPress = false;
        }
    }, true);
}

// Makes Forge's stored VAE / text-encoder modules and Low Bits match what this job asks for, as picking them in the WebUI would.
// Modules: matching the stored value avoids Forge's "Model Selected" logs on every generation.
// Low Bits: the per-request override is stripped by the Neo sanitiser (network.js), and Forge only re-reads the stored value ("Patch LoRAs on-the-fly") when the checkpoint or modules change in the same options request. So when only Low Bits differs, the modules are flipped away and back to force the re-read.
// Best effort: on failure the generation still goes out with the per-request override.
function pickAnyModuleName() {
    const sel = document.querySelectorAll('select[id$="_vae"], select[id$="_te"], select[id$="_clip"], select[id$="_t5"]');
    for (const s of sel) {
        if (s.id.startsWith('modulePair')) continue;
        for (const o of s.options) {
            if (o.value && o.value !== 'Automatic' && o.value !== 'None') return o.value;
        }
    }
    return null;
}

async function syncJobServerOptions(job, serverOpts) {
    let storedBits = null, back = null;
    try {
        const ov = job.payload?.override_settings || {};
        const wantedMods = Array.isArray(ov.forge_additional_modules) ? ov.forge_additional_modules : null;
        const wantedBits = typeof ov.forge_unet_storage_dtype === 'string' && ov.forge_unet_storage_dtype ? ov.forge_unet_storage_dtype : null;
        if (!serverOpts || (!wantedMods && !wantedBits)) return;

        const storedMods = Array.isArray(serverOpts.forge_additional_modules) ? serverOpts.forge_additional_modules : [];
        storedBits = typeof serverOpts.forge_unet_storage_dtype === 'string' ? serverOpts.forge_unet_storage_dtype : null;
        // Forge stores modules as full paths in its own sorted order, so compare file names as a sorted set.
        const nameSet = (list) => list.map(v => String(v).split(/[\\/]/).pop()).sort().join('\n');
        const modsDiffer = !!wantedMods && nameSet(storedMods) !== nameSet(wantedMods);
        // No stored value reported (older server): nothing to compare.
        const bitsDiffer = !!wantedBits && storedBits !== null && storedBits !== wantedBits;
        if (!modsDiffer && !bitsDiffer) return;

        const body = {};
        if (modsDiffer) body.forge_additional_modules = wantedMods;
        if (bitsDiffer) body.forge_unet_storage_dtype = wantedBits;
        await postOption(body);

        if (bitsDiffer && !modsDiffer) {
            back = wantedMods || storedMods;
            const temp = back.length ? [] : (pickAnyModuleName() ? [pickAnyModuleName()] : null);
            if (!temp) { console.warn('Low Bits stored but Forge could not be made to re-read it (no module to toggle).'); return; }
            await postOption({ "forge_additional_modules": temp });
            await postOption({ "forge_additional_modules": back });
        }
    } catch (e) {
        console.warn('Server option sync skipped:', e);
        // Partial failure: restore the previous state so the next job retries.
        if (storedBits !== null) { try { await postOption({ "forge_unet_storage_dtype": storedBits }); } catch (e2) {} }
        if (back) { try { await postOption({ "forge_additional_modules": back }); } catch (e3) {} }
    }
}

async function runJob(job, isBatch = false) {
    // --- UPDATED ISOLATION LOGIC ---
    const isInpaintJob = job.mode === 'inp';

    // Select specific elements based on job mode
    const btnId = isInpaintJob ? 'inpGenBtn' : 'genBtn';
    const spinnerId = isInpaintJob ? 'inpLoadingSpinner' : 'loadingSpinner';
    const galleryId = isInpaintJob ? 'inpGallery' : 'gallery';

    const btn = document.getElementById(btnId);
    const spinner = document.getElementById(spinnerId);
    const gal = document.getElementById(galleryId);

    btn.disabled = true;
    spinner.style.display = 'block';

    // Declared outside try/finally so cleanup can always reach it.
    let progressPollTimeout = null;
    let progressVisibilityHandler = null;

    try {
        // The button reads "SETTLING..." from the start of the job until the first real step count. The finally block below restores the real label on every exit.
        btn.innerText = "SETTLING...";

        // Unload before an SDXL job that follows a diffusers-based one (Flux/Qwen/Anima/Krea), to avoid a stuck "patch LoRAs on-the-fly" state.
        if (job.mode === 'xl' && lastGeneratedMode && ['flux', 'qwen', 'anima', 'krea'].includes(lastGeneratedMode)) {
            if (typeof unloadModel === 'function') {
                try { await unloadModel(true); } catch (e) {}
            }
        }

        // Unload when this job's LoRA set differs from the last generated one (skipped on the first job of a session).
        const thisJobLoraSet = extractLoraTags(job.payload?.prompt);
        if (lastGeneratedLoraSet !== null && loraSetChanged(lastGeneratedLoraSet, thisJobLoraSet)) {
            btn.innerText = "SETTLING...";
            if (typeof unloadModel === 'function') {
                try { await unloadModel(true); } catch (e) {}
            }
            await new Promise(r => setTimeout(r, 2500));
        }

        let isReady = false;
        let attempts = 0;
        // Last options reported by Forge, reused by the module sync.
        let serverOpts = null;
        // Check whether the requested model is loaded: fetch options, normalise names, POST options on mismatch.
        while (!isReady && attempts < 40) {
            const optsReq = await fetch(`${HOST}/sdapi/v1/options`, {
                headers: getHeaders()
            });
            const opts = await optsReq.json();
            serverOpts = opts;

            // Normalize: lowercase, remove hash, remove path
            if (normalize(opts.sd_model_checkpoint) === normalize(job.modelTitle)) {
                isReady = true;
                break;
            }

            if (attempts % 5 === 0) {
                // Unload before the first checkpoint-switch attempt only, so an in-progress load isn't interrupted.
                if (attempts === 0 && typeof unloadModel === 'function') {
                    await unloadModel(true);
                }

                // Force overrides here as well to ensure alignment
                const loadPayload = {
                    "sd_model_checkpoint": job.modelTitle,
                    "forge_unet_storage_dtype": job.payload?.override_settings?.forge_unet_storage_dtype || getLowBitsForMode(job.mode, job.modelTitle)
                };

                // SDXL and Inpaint jobs clear VAE/text-encoder modules before the checkpoint loads, so modules from Qwen/Flux don't stay attached.
                if (job.mode === 'inp' || job.mode === 'xl') {
                    loadPayload["forge_additional_modules"] = [];
                    loadPayload["sd_vae"] = "Automatic";
                }

                await postOption(loadPayload);
            }
            attempts++;
            await new Promise(r => setTimeout(r, 1500));
        }
        if (!isReady) throw new Error("Timeout: Server failed to load model.");

        await syncJobServerOptions(job, serverOpts);

        // Short settle delay after a real checkpoint switch.
        if (attempts > 0) {
            btn.innerText = "SETTLING...";
            await new Promise(r => setTimeout(r, 2500));
        }

        // Re-asserts "SETTLING..." as the request goes out.
        btn.innerText = "SETTLING...";
        await updateBatchNotification("Starting Generation", true, "Initializing...");

        // Base and Hi-Res second-pass step totals come from settings, not Forge's progress. img2img/Inpaint under 1.0 denoising run fewer steps (same formula as the Denoising hint).
        const effectiveBaseSteps = job.mode === 'inp' && typeof job.payload.denoising_strength === 'number'
            ? Math.floor(Math.min(job.payload.denoising_strength, 0.999) * job.payload.steps) + 1
            : job.payload.steps;
        const perImagePhases = [effectiveBaseSteps];
        if (job.payload.enable_hr) perImagePhases.push(job.payload.hr_second_pass_steps || 0);
        const nIterCount = job.payload.n_iter || 1;
        // One image's known phases only; ADetailer passes are tracked separately per image.
        const knownPhaseTotals = perImagePhases;
        const deterministicPerImage = perImagePhases.reduce((a, b) => a + b, 0);

        // ADetailer pass count is unknown until it runs; this estimate is only for the first display and as a fallback.
        const adArgs = job.payload.alwayson_scripts?.ADetailer?.args;
        const adetailerEnabled = adArgs?.[0] === true;
        let adEstimate = 0;
        if (adetailerEnabled) {
            // Average denoising strength across the enabled ADetailer passes, used as a per-pass estimate.
            const units = adArgs.slice(1);
            const avgDenoise = units.length > 0
                ? units.reduce((sum, u) => sum + (u?.ad_denoising_strength ?? 0.4), 0) / units.length
                : 0.4;
            adEstimate = Math.round(job.payload.steps * avgDenoise);
        }
        const jobTotalSteps = (job.payload.n_iter || 1) * (deterministicPerImage + adEstimate);
        // Per-batch display floor. ADetailer's estimate enters only via the dynamic growth path below.
        let maxStepShown = 0; // used only by the no-per-job-state fallback path

        // phaseIndex: current pass within this batch (0 = base, 1 = Hi-Res, 2+ = ADetailer). Known phases use their configured total; only ADetailer passes grow it dynamically.
        let phaseIndex = 0;
        let accumulatedKnownSteps = 0;
        let lastJobNo = -1;
        let lastPassTotal = 0; // only meaningful once phaseIndex is past the known phases (ADetailer)
        // totalChanged covers a pass boundary with no job_no change, but must not fire for the stale sampling_steps echo right after a job_no change that was already handled.
        let suppressTotalChangedUntilProgress = false;
        let lastSamplingStep = -1;
        // Whether the current phase has been seen mid-sampling (a step done, not finished). A phase only counts as ended if it was watched running.
        let phaseSawInFlight = false;
        let lastDisplayTotal = jobTotalSteps; // updated as real totals come in; used as the accurate carryover once this job finishes
        // A queued job's first polls can show the previous job's leftover state. The job isn't treated as started until sampling_steps matches its known base-phase total.
        let thisJobConfirmedStarted = false;
        // Fallback deadline for that guard, so a total that never matches this app's formula can't freeze the display. Wall-clock based, since background polling is 10x slower. 1500ms covers a few foreground polls.
        const thisJobConfirmationDeadline = Date.now() + 1500;
        // Leftovers that are positively identifiable (Forge's empty job, or a poll already at its finish line) wait out a much longer deadline than a mere total mismatch. The long limit only ensures something is eventually shown.
        const thisJobStrongStaleDeadline = Date.now() + 120000;

        // Stall detection: step count unchanged for several consecutive polls (e.g. a server-side tiled Hi-Res upscale, which exposes no progress).
        let lastShownMsg = '';
        let stalledPollCount = 0;
        // 13 polls is roughly 5s at the foreground rate.
        const STALL_POLLS_BEFORE_INDICATOR = 13;
        // Requires a minimum step count so normal startup latency isn't read as a stall.
        const MIN_STEP_BEFORE_STALL_INDICATOR = 5;

        // A pass only counts once it has shown real progress (sampling_step >= 1), which ignores the phantom extra job_no transition after ADetailer.
        let adPassesCommitted = 0;
        let currentAdJobSeenProgress = false;
        // Per-batch step total: sums each unit's count as unit_index or batch_index changes, within the current image only.
        let adCumulativeCount = 0;
        let lastSeenUnitIndex = null;
        let lastSeenBatchIndex = null; // batch-size's own equivalent of unit_index - distinguishes image slots sharing one base pass
        // 1-based, shown as "Batch N/M" when nIterCount > 1. Reset is bounded at nIterCount - 1 boundaries.
        let currentBatchNumber = 1;
        // Sum of each previous batch's final total, for the job queue's whole-job total.
        let completedBatchesStepsSoFar = 0;
        let pendingBoundaryCheck = false; // defers trusting sampling_steps right at a job_no change - the exact staleness window varies, so this waits for real per-step progress rather than a fixed poll count

        // Never lets the numerator or total shrink within the current batch (reset at each image boundary).
        let maxStepInBatchShown = 0;
        let maxDisplayTotalShown = deterministicPerImage; // deterministic-only floor - ADetailer's estimate enters via dynamic growth, not this floor
        let maxBatchTotalShown = 0;
        // Tiled-upscale state, folded into the running step count (see bridge.upscale handling below).
        // Tiled upscale runs per image, so one gap can contain several tile phases:
        // - tilePreGapBaseline: step count when the first tile phase in this gap began (null if none yet).
        // - tilesBankedThisGap: sum of the declared totals of completed tile phases.
        // - tilePhaseActive: whether a tile phase is running now.
        // - currentTileTotal: the active phase's total, so mid-phase changes adjust the denominator.
        let tilePreGapBaseline = null;
        let tilesBankedThisGap = 0;
        let tilePhaseActive = false;
        let currentTileTotal = 0;

        // Defined once per job rather than per poll.
        const startNewBatch = () => {
            completedBatchesStepsSoFar += maxDisplayTotalShown;
            currentBatchNumber = Math.min(currentBatchNumber + 1, nIterCount);
            phaseIndex = 0;
            accumulatedKnownSteps = 0;
            adCumulativeCount = 0;
            lastSeenUnitIndex = null;
            lastSeenBatchIndex = null;
            adPassesCommitted = 0;
            maxStepInBatchShown = 0;
            maxDisplayTotalShown = deterministicPerImage;
            tilePreGapBaseline = null;
            tilesBankedThisGap = 0;
            tilePhaseActive = false;
            currentTileTotal = 0;
        };

        // Race guard: discards a straggler poll's result once the job is done.
        let jobFinished = false;

        // Self-rescheduling timeout: 400ms in the foreground, 4s backgrounded. The finally block in pollProgressOnce() reschedules on every exit path.
        const onProgressVisibilityChange = () => {
            if (!document.hidden && !jobFinished) {
                // Poll immediately when returning to the foreground.
                clearTimeout(progressPollTimeout);
                pollProgressOnce();
            }
        };
        progressVisibilityHandler = onProgressVisibilityChange;
        document.addEventListener('visibilitychange', onProgressVisibilityChange);

        // Makes a second call while one is running a no-op.
        let pollInFlight = false;

        async function pollProgressOnce() {
            if (jobFinished || pollInFlight) return;
            pollInFlight = true;
            try {
                // Requests skip_current_image=true to avoid downloading the preview on every poll, unless Live Preview is on.
                const livePreviewActive = document.getElementById('livePreviewCheck')?.checked === true;
                const progressUrl = livePreviewActive
                    ? `${HOST}/sdapi/v1/progress`
                    : `${HOST}/sdapi/v1/progress?skip_current_image=true`;
                const res = await fetch(progressUrl, {
                    headers: getHeaders()
                });
                if (jobFinished) return; // job may have finished WHILE this fetch was in flight
                const data = await res.json();
                if (jobFinished) return; // and again, to be thorough
                if (livePreviewActive && data.current_image) {
                    updateLivePreviewImage(data.current_image);
                }
                const bridge = await fetchBridgeStatus();
                if (jobFinished) return;
                const state = data.state || {};
                const hasJobInfo = typeof state.job_no === 'number'
                    && typeof state.sampling_step === 'number'
                    && typeof state.sampling_steps === 'number'
                    && state.sampling_steps > 0;

                let currentStepInBatch, displayTotal;
                let displayTotalIsBridgeConfirmed = false; // lets the global clamp below correct downward once real data replaces a guess

                if (hasJobInfo) {
                    if (!thisJobConfirmedStarted) {
                        // Rejects a poll that is already at its finish line (the previous job's final state) even if the total matches.
                        const looksAlreadyComplete = state.sampling_step >= state.sampling_steps;
                        // Rejects a poll with an empty state.job (Forge's idle signature). Kept separate from hasJobInfo, which also gates the deadline fallback.
                        const looksIdle = state.job === '';
                        // Two deadlines: positively identified leftovers (idle or finished) use the long one; a mere total mismatch uses the short one.
                        const looksStrongStale = looksAlreadyComplete || looksIdle;
                        const stillWaitingOnLeftovers = looksStrongStale
                            ? Date.now() < thisJobStrongStaleDeadline
                            : (state.sampling_steps !== knownPhaseTotals[0] && Date.now() < thisJobConfirmationDeadline);
                        if (stillWaitingOnLeftovers) {
                            // Possibly stale data: don't adopt it as the baseline, and wait for a genuine poll until the relevant deadline passes (1.5s for a mismatch, 120s for idle/finished leftovers).
                            // The button shows "SETTLING..." meanwhile.
                            btn.innerText = 'SETTLING...';
                            return;
                        }
                        thisJobConfirmedStarted = true;
                    }
                    // A new pass is detected by job_no changing, sampling_step dropping substantially, or sampling_steps changing while job_no stays the same.
                    const droppedSubstantially = lastSamplingStep !== -1 && (lastSamplingStep - state.sampling_step) >= 5;
                    const totalChanged = !suppressTotalChangedUntilProgress && lastPassTotal !== 0 && state.sampling_steps !== lastPassTotal;
                    const jobNoChanged = state.job_no !== lastJobNo;
                    const isNewPass = jobNoChanged || (state.job_no === lastJobNo && (droppedSubstantially || totalChanged));
                    if (jobNoChanged) suppressTotalChangedUntilProgress = true;
                    // A genuine image boundary resets to a fresh per-image display ("Batch N/M - Step X/Y"), since Forge's boundary signals are inconsistent.
                    if (isNewPass) {
                        if (lastJobNo !== -1) {
                            // Banks any tiled-upscale contribution (visible only through the bridge) into the permanent accumulator, so the next phase continues from it. Includes a still-active tile phase, just in case.
                            if (tilePhaseActive) tilesBankedThisGap += currentTileTotal;
                            if (tilesBankedThisGap > 0) {
                                accumulatedKnownSteps += tilesBankedThisGap;
                                tilesBankedThisGap = 0;
                            }
                            tilePreGapBaseline = null;
                            tilePhaseActive = false;
                            currentTileTotal = 0;
                            // Commits the pass that just ended before resetting for the one starting now.
                            if (phaseIndex < knownPhaseTotals.length) {
                                // Known phase (base/Hi-Res): committed as finished only if it was watched running (phaseSawInFlight). Otherwise the real job is replacing a baseline that was never its own, so it re-baselines without advancing phaseIndex.
                                if (phaseSawInFlight) {
                                    accumulatedKnownSteps += knownPhaseTotals[phaseIndex];
                                    phaseIndex++;
                                }
                            } else if (adetailerEnabled && currentAdJobSeenProgress) {
                                // An ADetailer phase that showed real progress: commit it.
                                adPassesCommitted++;
                            }
                            // ADetailer disabled, or an ADetailer-range phase that never showed progress (phantom final phase): not counted.
                            if (phaseIndex >= knownPhaseTotals.length && nIterCount > 1 && currentBatchNumber < nIterCount) {
                                // Image-boundary reset, capped by currentBatchNumber at the genuine boundaries possible between nIterCount images. Only when nIterCount > 1.
                                if (jobNoChanged) {
                                    // Forge's sampling_steps can echo the just-ended pass for a few polls after a job_no change, so wait for real non-zero progress within the new job_no.
                                    pendingBoundaryCheck = true;
                                } else if (state.sampling_steps === knownPhaseTotals[0]) {
                                    // droppedSubstantially or totalChanged already confirm sampling_steps changed: trust immediately.
                                    startNewBatch();
                                }
                            } else {
                                // Nothing to defer for this transition: clear any stale pending check.
                                pendingBoundaryCheck = false;
                            }
                        }
                        lastJobNo = state.job_no;
                        currentAdJobSeenProgress = false; // reset for the new phase
                        phaseSawInFlight = false; // ...and for this one too: a new phase hasn't been watched yet
                    } else if (pendingBoundaryCheck && state.sampling_step >= 1) {
                        // Real progress made within the same job_no: sampling_steps is now settled.
                        pendingBoundaryCheck = false;
                        if (phaseIndex >= knownPhaseTotals.length && nIterCount > 1 && currentBatchNumber < nIterCount && state.sampling_steps === knownPhaseTotals[0]) {
                            startNewBatch();
                        }
                    }
                    // Mid-sampling: at least one step done and not yet finished.
                    if (state.sampling_step >= 1 && state.sampling_step < state.sampling_steps) {
                        phaseSawInFlight = true;
                    }
                    if (state.sampling_step >= 1) {
                        currentAdJobSeenProgress = true;
                        suppressTotalChangedUntilProgress = false;
                    }
                    lastPassTotal = state.sampling_steps;
                    lastSamplingStep = state.sampling_step;

                    // Known phases use their configured total. Further growth counts only if ADetailer is enabled (spurious extra phases are ignored). ADetailer passes use steps * denoising_strength as an estimate.
                    let currentStepFromKnown = accumulatedKnownSteps;
                    let totalFromKnown = accumulatedKnownSteps;
                    if (phaseIndex < knownPhaseTotals.length) {
                        const currentPhaseTotal = knownPhaseTotals[phaseIndex];
                        currentStepFromKnown += Math.min(state.sampling_step, currentPhaseTotal);
                        totalFromKnown += currentPhaseTotal;
                        currentStepInBatch = currentStepFromKnown;
                        displayTotal = totalFromKnown;
                    } else if (adetailerEnabled) {
                        if (bridge && !bridge.errors?.length && bridge.adetailer?.active && typeof bridge.adetailer.count === 'number' && typeof bridge.adetailer.unit_index === 'number') {
                            // A change in unit_index or batch_index means new data (batch_index covers jobs spanning several image slots in one base pass). null falls back to unit_index.
                            const batchIndexKnown = typeof bridge.adetailer.batch_index === 'number';
                            const isGenuinelyNew = lastSeenUnitIndex !== bridge.adetailer.unit_index
                                || (batchIndexKnown && lastSeenBatchIndex !== bridge.adetailer.batch_index);
                            if (isGenuinelyNew) {
                                lastSeenUnitIndex = bridge.adetailer.unit_index;
                                if (batchIndexKnown) lastSeenBatchIndex = bridge.adetailer.batch_index;
                                const enabledUnits = adArgs.slice(1);
                                const unitConfig = enabledUnits[bridge.adetailer.unit_index];
                                // Merge / Merge and Invert (ad_mask_merge_invert) combine all detections in a unit into one mask, so they cost one pass. Only the total needs this; adPassesCommitted counts observed transitions.
                                const mergeActive = unitConfig && unitConfig.ad_mask_merge_invert !== 'None';
                                // Passes are capped by Max Masks first, then collapsed to one by merge. The toast keeps the raw detected count.
                                const processedCount = adetailerProcessedCount(bridge.adetailer.count, unitConfig);
                                adCumulativeCount += mergeActive ? Math.min(1, processedCount) : processedCount;
                                if (bridge.adetailer.count > 0 && Toast) {
                                    const label = guessAdetailerLabel(unitConfig?.ad_model);
                                    if (label) {
                                        const noun = bridge.adetailer.count === 1 ? label.singular : label.plural;
                                        Toast.show({ text: `${bridge.adetailer.count} ${noun} detected`, duration: 'short' });
                                    }
                                }
                            }
                        }
                        const adCommittedTotal = adPassesCommitted * adEstimate;
                        const currentPassContribution = currentAdJobSeenProgress ? Math.min(state.sampling_step, adEstimate) : 0;
                        currentStepInBatch = accumulatedKnownSteps + adCommittedTotal + currentPassContribution;
                        // Once the bridge reports a real count for this image, trust it over the cruder pass-counting estimate.
                        let adDisplayTotal = adCumulativeCount > 0
                            ? adCumulativeCount * adEstimate
                            : adCommittedTotal + (currentAdJobSeenProgress ? adEstimate : 0);
                        displayTotal = accumulatedKnownSteps + adDisplayTotal;
                        displayTotalIsBridgeConfirmed = adCumulativeCount > 0;
                        // Never show more than 100% when the trusted bridge total is below the pass-built numerator.
                        currentStepInBatch = Math.min(currentStepInBatch, displayTotal);
                    } else {
                        currentStepInBatch = accumulatedKnownSteps;
                        displayTotal = accumulatedKnownSteps;
                    }
                } else if (data.progress > 0) {
                    // Fallback with no per-job state yet (e.g. model still loading): scaled against the current batch's base+Hi-Res total only.
                    const rawStep = Math.round(data.progress * deterministicPerImage);
                    maxStepShown = Math.min(Math.max(maxStepShown, rawStep), deterministicPerImage);
                    currentStepInBatch = maxStepShown;
                    displayTotal = deterministicPerImage;
                } else {
                    if (btn.innerText.includes("Step")) {
                        updateBatchNotification("Finalizing...", false, "Receiving Images...");
                    }
                    return;
                }

                // Numerator never shrinks. The total follows the same rule except once the bridge confirms a real number, which may correct it downward.
                maxStepInBatchShown = Math.max(maxStepInBatchShown, currentStepInBatch);
                currentStepInBatch = maxStepInBatchShown;
                if (displayTotalIsBridgeConfirmed) {
                    maxDisplayTotalShown = displayTotal;
                    // Caps the numerator at the corrected total, and corrects the persistent tracker too.
                    currentStepInBatch = Math.min(currentStepInBatch, maxDisplayTotalShown);
                    maxStepInBatchShown = currentStepInBatch;
                } else {
                    maxDisplayTotalShown = Math.max(maxDisplayTotalShown, displayTotal);
                    displayTotal = maxDisplayTotalShown;
                }

                if (bridge && !bridge.errors?.length && bridge.upscale?.active && typeof bridge.upscale.current === 'number' && typeof bridge.upscale.total === 'number') {
                    if (!tilePhaseActive) {
                        // A new tile phase started: the first this gap, or a later image's in a batch_size>1 job.
                        tilePhaseActive = true;
                        if (tilePreGapBaseline === null) {
                            // Only the first tile phase in a gap sets the baseline; later ones count from it plus tilesBankedThisGap.
                            tilePreGapBaseline = maxStepInBatchShown;
                        }
                        currentTileTotal = bridge.upscale.total;
                        maxDisplayTotalShown += currentTileTotal;
                        displayTotal = maxDisplayTotalShown;
                        if (Toast) Toast.show({ text: `Added ${currentTileTotal} upscale tile steps`, duration: 'short' });
                    } else if (bridge.upscale.total !== currentTileTotal) {
                        // Total changed mid-phase: adjust the denominator by the difference.
                        maxDisplayTotalShown += (bridge.upscale.total - currentTileTotal);
                        displayTotal = maxDisplayTotalShown;
                        currentTileTotal = bridge.upscale.total;
                    }
                    const tileAdjustedStep = tilePreGapBaseline + tilesBankedThisGap + bridge.upscale.current;
                    currentStepInBatch = Math.max(currentStepInBatch, tileAdjustedStep);
                    maxStepInBatchShown = currentStepInBatch;
                } else if (tilePhaseActive) {
                    // Tile phase ended: bank its full declared total, since the bridge can go inactive before reporting the last tile or two.
                    tilesBankedThisGap += currentTileTotal;
                    currentTileTotal = 0;
                    currentStepInBatch = Math.max(currentStepInBatch, tilePreGapBaseline + tilesBankedThisGap);
                    maxStepInBatchShown = currentStepInBatch;
                    tilePhaseActive = false;
                }

                const msg = `Step ${currentStepInBatch} / ${displayTotal}`;
                // Literal line break rather than relying on word wrap.
                const batchLabel = nIterCount > 1 ? `Batch ${currentBatchNumber}/${nIterCount}\n` : '';

                // Compares the full message, and appends a "still working" hint when the same message repeats for several polls.
                if (msg === lastShownMsg) {
                    stalledPollCount++;
                } else {
                    stalledPollCount = 0;
                    lastShownMsg = msg;
                }
                // Without the bridge there is no tile count. A stall at the base/Hi-Res boundary with a model upscaler is shown plainly rather than folded into a guessed step count.
                const stalledAtHrBoundary = stalledPollCount >= STALL_POLLS_BEFORE_INDICATOR && currentStepInBatch >= MIN_STEP_BEFORE_STALL_INDICATOR;
                const likelyTilePhase = !bridge && phaseIndex === 0 && job.payload.enable_hr && job.payload.hr_upscaler && !job.payload.hr_upscaler.startsWith('Latent');
                let displayMsg = msg;
                if (stalledAtHrBoundary && likelyTilePhase) {
                    displayMsg = 'UPSCALING...';
                } else if (stalledAtHrBoundary) {
                    displayMsg = `${msg} (Processing...)`;
                }
                btn.innerText = batchLabel + displayMsg;
                // The job queue needs the whole-job total, so earlier images' contributions are added back to the per-image display.
                lastDisplayTotal = completedBatchesStepsSoFar + displayTotal;

                if (isBatch) {
                    const actualTotal = currentBatchProgress + completedBatchesStepsSoFar + currentStepInBatch;
                    // totalBatchSteps (globals.js) is the deterministic whole-queue total. queueADetailerGrowthCarried adds the real ADetailer growth of finished jobs and thisJobADetailerGrowth that of the current job, keeping the total in lockstep.
                    const thisJobADetailerGrowth = Math.max(0, (completedBatchesStepsSoFar + displayTotal) - (currentBatchNumber * deterministicPerImage));
                    let batchTotalDisplay = totalBatchSteps + queueADetailerGrowthCarried + thisJobADetailerGrowth;
                    maxBatchTotalShown = Math.max(maxBatchTotalShown, batchTotalDisplay);
                    batchTotalDisplay = maxBatchTotalShown;
                    document.getElementById('queueProgressText').innerText = `Step ${actualTotal} / ${batchTotalDisplay}`;
                    updateBatchNotification("Batch Running", false, `Step ${actualTotal} / ${batchTotalDisplay}`);
                } else {
                    updateBatchNotification("Generating...", false, msg);
                }
            } catch (e) {
            } finally {
                pollInFlight = false;
                if (!jobFinished) {
                    // Shares the user-configurable polling rate with the upscale poll (Settings > Generation Polling Rate).
                    const delay = document.hidden ? 4000 : getGenerationPollingRate();
                    progressPollTimeout = setTimeout(pollProgressOnce, delay);
                }
            }
        }
        progressPollTimeout = setTimeout(pollProgressOnce, getGenerationPollingRate());

        const endpoint = job.mode === 'inp' ? '/sdapi/v1/img2img' : '/sdapi/v1/txt2img';

        const res = await fetchWithRetry(`${HOST}${endpoint}`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(job.payload)
        });

        clearTimeout(progressPollTimeout);
        document.removeEventListener('visibilitychange', progressVisibilityHandler);
        jobFinished = true;
        // On success the last live-preview frame stays on screen until the first real image is shown (addResult()). A failed response clears it at once; finally{} clears it on any other exit.
        if (!res.ok) {
            if (typeof clearLivePreviewImage === 'function') clearLivePreviewImage();
            throw new Error("Server Error " + res.status);
        }

        // Recorded only after a real success.
        lastGeneratedLoraSet = thisJobLoraSet;
        lastGeneratedMode = job.mode;
        // Remembers which main tab last generated, for boot.js to restore.
        if (['xl', 'flux', 'qwen', 'anima', 'krea'].includes(job.mode)) localStorage.setItem('bojroLastGenTab', job.mode);

        const data = await res.json();
        if (isBatch) {
            currentBatchProgress += lastDisplayTotal;
            // Carries this job's final ADetailer growth forward for the next job.
            queueADetailerGrowthCarried += Math.max(0, lastDisplayTotal - (nIterCount * deterministicPerImage));
        }

        if (data.images) {
            const expectedImages = (job.payload.batch_size || 1) * (job.payload.n_iter || 1);

            // Shown first; the History save (saveImageToDBInBackground(), utils.js) runs behind it.
            const addResult = (finalB64, isGrid) => {
                const saved = saveImageToDBInBackground(finalB64);

                const img = document.createElement('img');
                img.src = finalB64;
                img.className = 'gen-result';
                img.loading = "lazy";
                img.dataset.dbId = '';
                if (isGrid) img.dataset.grid = '1';
                saved.then(newId => { img.dataset.dbId = newId != null ? String(newId) : ''; });
                img.onclick = async () => {
                    // Usually already saved; otherwise wait so the viewer gets the image's History id.
                    await saved;
                    // Gathers every image in this results gallery so the fullscreen viewer can cycle through them.
                    const allImgs = Array.from(gal.querySelectorAll('.gen-result'));
                    const items = allImgs.map(el => ({
                        id: el.dataset.dbId ? parseInt(el.dataset.dbId) : null,
                        data: el.src,
                        domElement: el
                    }));
                    window.openFullscreen(items, allImgs.indexOf(img));
                };
                // Not on a grid: it has no seed of its own. Inpaint / img2img results send to the Upscaler instead.
                if (!isGrid) attachLongPress(img, isInpaintJob ? sendResultToUpscaler : sendSeedFromResultImage);

                if (gal.firstChild) gal.insertBefore(img, gal.firstChild);
                else gal.appendChild(img);
                // Clears the last live frame, except for the grid, which can land after the next queued job has started.
                if (!isGrid && typeof clearLivePreviewImage === 'function') clearLivePreviewImage();
                const autoDl = document.getElementById('autoDlCheck');
                if (autoDl && autoDl.checked) saveToMobileGallery(finalB64);
            };

            for (const b64 of data.images) {
                addResult("data:image/png;base64," + b64, false);
            }

            // Show & Download Batch Grids: Forge was asked for no grid, so one is built here from the received images (see batchGridsEnabled(), utils.js), only when exactly the expected number came back. Not awaited, so the job and queue don't wait; added when ready.
            if (job.gridMaxEdge > 0 && expectedImages > 1 && data.images.length === expectedImages) {
                const gridSources = data.images.map(b => "data:image/png;base64," + b);
                (async () => {
                    try {
                        const gridUrl = await buildLocalBatchGrid(gridSources, job.gridMaxEdge);
                        if (gridUrl) addResult(gridUrl, true);
                    } catch (err) {
                        console.warn('Could not build the batch grid:', err);
                    }
                })();
            }
        }
    } catch (e) {
        throw e;
    } finally {
        if (progressPollTimeout) clearTimeout(progressPollTimeout);
        if (progressVisibilityHandler) document.removeEventListener('visibilitychange', progressVisibilityHandler);
        // No stale in-progress frame outlives the job.
        if (typeof clearLivePreviewImage === 'function') clearLivePreviewImage();
        spinner.style.display = 'none';
        btn.disabled = false;
        // --- NEO HOOK: BUTTON TEXT ---
        btn.innerText = getGenerateButtonLabel(currentMode);
    }
}

// -----------------------------------------------------------
// GALLERY RENDERER
// -----------------------------------------------------------

// True while a loadGallery() call waits on pending saves; a second call shares the queued reload.
let galleryReloadQueued = false;

window.loadGallery = function() {
    const grid = document.getElementById('savedGalleryGrid');
    if (!grid) return;
    // Results are shown before they are saved (saveImageToDBInBackground(), utils.js), so wait for pending saves first.
    if (imageSavesPending > 0) {
        if (!galleryReloadQueued) {
            galleryReloadQueued = true;
            imageSaveChain.then(() => { galleryReloadQueued = false; window.loadGallery(); });
        }
        return;
    }
    const paginationRow = document.getElementById('galleryPaginationRow');
    // Hide pagination until the load has resolved.
    if (paginationRow) paginationRow.classList.add('hidden');

    if (!db) return;
    db.transaction(["images"], "readonly").objectStore("images").getAll().onsuccess = e => {
        const imgs = e.target.result;

        // Built off-screen and swapped in atomically.
        const newContent = document.createDocumentFragment();

        if (!imgs || imgs.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.style.cssText = 'text-align:center;color:#777;margin-top:20px;grid-column:1/-1;';
            emptyMsg.textContent = 'No images';
            newContent.appendChild(emptyMsg);
            grid.innerHTML = "";
            grid.appendChild(newContent);
            // DELETE ALL is greyed out when the gallery is empty (set on both branches since this re-runs on every load).
            const clearAllBtn = document.getElementById('galClearAllBtn');
            if (clearAllBtn) clearAllBtn.disabled = true;
            // Pagination stays hidden when the gallery is empty.
            return;
        }
        const clearAllBtn = document.getElementById('galClearAllBtn');
        if (clearAllBtn) clearAllBtn.disabled = false;

        const reversed = imgs.reverse();
        // The full all-pages dataset for the fullscreen viewer's cross-page navigation.
        allGalleryImagesData = reversed;
        const totalPages = Math.ceil(reversed.length / ITEMS_PER_PAGE);
        if (galleryPage < 1) galleryPage = 1;
        if (galleryPage > totalPages) galleryPage = totalPages;

        const start = (galleryPage - 1) * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const pageItems = reversed.slice(start, end);

        pageItems.forEach((item, index) => {
            const container = document.createElement('div');
            container.style.position = 'relative';
            const img = document.createElement('img');
            // Uses the small thumbnail (generateThumbnail(), utils.js) when one exists, falling back to the full image. Fullscreen still uses item.data.
            img.src = item.thumbnail || item.data;
            img.className = 'gal-thumb';
            img.loading = 'lazy';
            img.onclick = () => {
                if (isSelectionMode) toggleSelectionForId(item.id, container);
                else window.openFullscreenFromGallery(index);
            };
            const tick = document.createElement('div');
            tick.className = 'gal-tick hidden';
            // The tick icon takes its colour from .gal-tick (style.css), i.e. the per-mode accent colour. Fill stays black for contrast.
            tick.innerHTML = '<i data-lucide="check-circle" size="24" fill="black"></i>';
            tick.style.position = 'absolute';
            tick.style.top = '5px';
            tick.style.right = '5px';
            container.appendChild(img);
            container.appendChild(tick);
            container.dataset.id = item.id;
            newContent.appendChild(container);
        });

        // Atomic swap of the grid.
        grid.innerHTML = "";
        grid.appendChild(newContent);

        document.getElementById('pageIndicator').innerText = `Page ${galleryPage} / ${totalPages}`;
        document.getElementById('prevPageBtn').disabled = galleryPage === 1;
        document.getElementById('nextPageBtn').disabled = galleryPage === totalPages;
        lucide.createIcons();
        // Pagination is revealed only when there is more than one page.
        if (paginationRow) paginationRow.classList.toggle('hidden', totalPages <= 1);
    }
}

window.changeGalleryPage = function(dir) {
    galleryPage += dir;
    loadGallery();
}

window.toggleGallerySelectionMode = function() {
    isSelectionMode = !isSelectionMode;
    const btn = document.getElementById('galSelectBtn');
    const delBtn = document.getElementById('galDeleteBtn');
    
    // Kept as a variable for a minimal diff.
    const clearBtn = document.getElementById('galClearAllBtn');

    if (isSelectionMode) {
        btn.style.background = "var(--accent-primary)";
        btn.style.color = "white";
        delBtn.classList.remove('hidden');
        
        // HIDE Delete All button to save space
        if(clearBtn) clearBtn.style.display = 'none';
        
    } else {
        btn.style.background = "var(--input-bg)";
        btn.style.color = "var(--text-main)";
        delBtn.classList.add('hidden');
        
        selectedImageIds.clear();
        document.querySelectorAll('.gal-tick').forEach(t => t.classList.add('hidden'));
        updateDeleteBtn();
        
        // SHOW Delete All button again
        if(clearBtn) clearBtn.style.display = '';
    }
}

window.toggleSelectionForId = function(id, container) {
    const tick = container.querySelector('.gal-tick');
    if (selectedImageIds.has(id)) {
        selectedImageIds.delete(id);
        tick.classList.add('hidden');
    } else {
        selectedImageIds.add(id);
        tick.classList.remove('hidden');
    }
    updateDeleteBtn();
}

window.updateDeleteBtn = function() {
    document.getElementById('galDeleteBtn').innerText = `DELETE (${selectedImageIds.size})`;
}

window.deleteSelectedImages = async function() {
    if (selectedImageIds.size === 0) return;
    const confirmed = await window.appConfirm(`Delete ${selectedImageIds.size} images?`, { title: 'Delete Images', okText: 'DELETE', danger: true });
    if (!confirmed) return;
    const tx = db.transaction(["images"], "readwrite");
    const store = tx.objectStore("images");
    selectedImageIds.forEach(id => store.delete(id));
    tx.oncomplete = () => {
        selectedImageIds.forEach(id => window.removeFromGenResultsById(id));
        // Reuses toggleGallerySelectionMode()'s exit branch.
        window.toggleGallerySelectionMode();
        loadGallery();
    };
}

// -----------------------------------------------------------
// NEW: SEND TO INPAINT EDITOR
// -----------------------------------------------------------

// Starts reading the prompt/negative from an image's PNG metadata for the editor to commit on PROCEED (see inpSourceMetadata, globals.js). Shared by the viewer's edit button (editCurrentFs) and the Analyzer's "Send image to" row (analyzer.js).
function startEditorMetadataCapture(src) {
    // Same capture as openEditorFromFile() (editor.js): the canvas re-encode on PROCEED would otherwise discard the metadata. src can be a data: or blob: URL.
    editorPendingMetadataPromise = (async () => {
        try {
            return await readImportablePromptsFromBlob(await (await fetch(src)).blob());
        } catch (e) {
            return null;
        }
    })();
}

// Opens the shared crop editor over the Inpaint tab with this image (img2img / Inpaint / Upscale share it).
function showEditorWithImage(src) {
    // Opens the editor modal immediately, before the image loads, and clears editorCanvas of stale content.
    const editorCanvasEl = document.getElementById('editorCanvas');
    editorCanvasEl?.getContext('2d')?.clearRect(0, 0, editorCanvasEl.width, editorCanvasEl.height);
    document.getElementById('editorModal').classList.remove('hidden');

    // 4. Load the image directly into the Editor
    const img = new Image();
    img.crossOrigin = "Anonymous"; 
    img.src = src;
    
    img.onload = () => {
        editorImage = img;
        // Synchronous placeholder matching this image's shape (see openEditorFromFile(), editor.js).
        editorTargetW = img.naturalWidth;
        editorTargetH = img.naturalHeight;
        if (typeof detectAndSetEditorOrientation === 'function') detectAndSetEditorOrientation(img);
        if (typeof highlightEditorMpLabel === 'function') highlightEditorMpLabel(img);
        if (typeof resetConfineToImageState === 'function') resetConfineToImageState();

        // REMOVED: document.getElementById('img-input-container').style.display = 'none';
        // We leave the upload box visible behind the modal. 
        // It will only be hidden when you click "PROCEED" (handled by applyEditorChanges).
        
        // Double rAF waits for a completed layout/paint instead of a fixed delay.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (typeof fitEditorToImage === 'function') {
                    fitEditorToImage();
                } else {
                    editorTargetW = parseInt(document.getElementById('xl_width').value) || 1024;
                    editorTargetH = parseInt(document.getElementById('xl_height').value) || 1024;
                    if (typeof recalcEditorLayout === 'function') recalcEditorLayout();
                    if (typeof resetEditorView === 'function') resetEditorView();
                }
            });
        });
    };
    
    img.onerror = () => {
        window.appAlert("Failed to load image for editing.");
    };
}

// Loads an image straight into the shared source image (as PROCEED would, without the crop step) and opens the Upscale panel. Everything is loaded and decoded before the tab changes, so the switch itself is instant with nothing flashing.
async function sendImageToUpscaler(src) {
    if (!src) return false;
    let dataUrl = src;
    let img;
    try {
        if (!src.startsWith('data:')) {
            const blob = await (await fetch(src)).blob();
            dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }
        img = new Image();
        img.src = dataUrl;
        await img.decode();
        startEditorMetadataCapture(dataUrl);
        inpSourceMetadata = editorPendingMetadataPromise ? await editorPendingMetadataPromise : null;
        editorPendingMetadataPromise = null;
        const previewImg = document.getElementById('upscalePreviewImg');
        if (previewImg) {
            previewImg.src = dataUrl;
            await previewImg.decode();
            if (typeof updateUpscaleResolutionHint === 'function') updateUpscaleResolutionHint();
        }
    } catch (e) {
        console.error('Send to Upscaler failed:', e);
        if (Toast) Toast.show({ text: 'Could not send to Upscaler', duration: 'short' });
        return false;
    }

    sourceImageB64 = dataUrl;
    editorImage = img;
    editorTargetW = img.naturalWidth;
    editorTargetH = img.naturalHeight;
    resetInpaintCanvas();
    // As PROCEED: any ControlNet image belonged to the previous source image.
    if (typeof clearControlNetImage === 'function') {
        ['inp', 'img2img'].forEach(mode => {
            for (let u = 0; u <= 2; u++) clearControlNetImage(mode, u);
        });
    }
    document.getElementById('img-input-container').classList.add('hidden');
    document.getElementById('inpTopModeSwitcher').classList.remove('hidden');

    // One synchronous block: the next paint shows the finished Upscale panel.
    window.switchTab('inp');
    window.setInpaintTopMode('upscale');
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (Toast) Toast.show({ text: 'Sent to Upscaler', duration: 'short' });
    return true;
}

window.editCurrentFs = function() {
    const src = document.getElementById('fsImage').src;
    if (!src) return;

    startEditorMetadataCapture(src);

    // 1. Close the Lightbox
    window.closeFsModal();

    // 2. Switch to the Inpaint Tab
    window.switchTab('inp');

    showEditorWithImage(src);
};

// Reflects sourceImageB64 in the Upscale panel's preview. "Remove image" calls the shared clearInpaintImage().
function renderUpscalePreview() {
    const previewImg = document.getElementById('upscalePreviewImg');
    if (!previewImg) return;
    // Direct property assignment so listeners don't stack. naturalWidth/Height aren't reliable until load.
    previewImg.onload = updateUpscaleResolutionHint;
    if (sourceImageB64 && previewImg.src !== sourceImageB64) previewImg.src = sourceImageB64;
}

// Input/output resolution hint under the Upscale preview, computed from the active resize mode. Called on image load, field input and mode toggle.
window.updateUpscaleResolutionHint = function() {
    const el = document.getElementById('upscaleResolutionHint');
    if (!el) return;
    const previewImg = document.getElementById('upscalePreviewImg');
    const inW = previewImg?.naturalWidth || 0;
    const inH = previewImg?.naturalHeight || 0;
    if (!inW || !inH) {
        el.textContent = '— × — → — × —';
        return;
    }

    const isFactor = document.getElementById('upscale_resize_mode')?.value !== '1';
    let outW, outH;
    if (isFactor) {
        const factor = parseFloat(document.getElementById('upscale_factor')?.value) || 1;
        outW = Math.round(inW * factor);
        outH = Math.round(inH * factor);
    } else {
        outW = parseInt(document.getElementById('upscale_width')?.value) || inW;
        outH = parseInt(document.getElementById('upscale_height')?.value) || inH;
    }

    el.textContent = `${inW} × ${inH} → ${outW} × ${outH}`;
}

// Toggles the two Extras resize modes: 0 = scale by factor, 1 = exact width and height.
window.setUpscaleResizeMode = function(mode) {
    const isFactor = mode === 'factor';
    document.getElementById('upscale-resize-factor').classList.toggle('active', isFactor);
    document.getElementById('upscale-resize-size').classList.toggle('active', !isFactor);
    document.getElementById('upscaleFactorFields').classList.toggle('hidden', !isFactor);
    document.getElementById('upscaleSizeFields').classList.toggle('hidden', isFactor);
    document.getElementById('upscale_resize_mode').value = isFactor ? '0' : '1';
    updateUpscaleResolutionHint();
}

// Submits the Upscale tab to Forge's Extras API.
window.runUpscaleJob = async function() {
    if (!sourceImageB64) {
        await window.appAlert("Please select an image first.");
        return;
    }

    const btn = document.getElementById('upscaleBtn');
    const spinner = document.getElementById('inpLoadingSpinner');
    const resultGal = document.getElementById('inpGallery');
    const oldText = btn ? btn.innerText : '';
    if (btn) { btn.disabled = true; btn.innerText = "UPSCALING..."; }
    if (spinner) spinner.style.display = 'block';
    // Enables the Upscale abort button, which uses /sdapi/v1/interrupt.
    setAbortButtonState('abortInpGenBtn', true);

    // A second pass is only guessed when this image has not been upscaled before; marked immediately.
    const imageHash = window.LoraManager.simpleHash(sourceImageB64);
    const expectSecondPass = !upscaledImageHashes.has(imageHash)
        && document.getElementById('upscale_upscaler_2').value !== 'None'
        && (parseFloat(document.getElementById('upscale_upscaler_2_visibility').value) || 0) > 0;
    upscaledImageHashes.add(imageHash);

    // Bridge polling only starts if the feature is on.
    let upscalePollTimeout = null;
    let upscaleJobDone = false;
    const upscaleTileTracker = createTileTracker(expectSecondPass);
    let lastKnownTotal = null; // real total once seen, used to show a genuinely-complete state on success
    // Poll delay has a small floor to avoid hammering a low-latency connection.
    async function pollUpscaleBridge() {
        if (upscaleJobDone) return;
        const bridge = await fetchBridgeStatus();
        if (upscaleJobDone) return;
        if (bridge && !bridge.errors?.length && bridge.upscale?.active && typeof bridge.upscale.current === 'number' && typeof bridge.upscale.total === 'number') {
            const { numerator, denominator } = upscaleTileTracker(bridge.upscale.current, bridge.upscale.total);
            lastKnownTotal = denominator;
            if (btn) btn.innerText = `Step ${numerator} / ${denominator}`;
        }
        if (!upscaleJobDone) upscalePollTimeout = setTimeout(pollUpscaleBridge, document.hidden ? 4000 : getGenerationPollingRate());
    }
    if (localStorage.getItem('bojroProgressBridgeEnabled') === 'true') upscalePollTimeout = setTimeout(pollUpscaleBridge, getGenerationPollingRate());

    try {
        const isFactorMode = document.getElementById('upscale_resize_mode').value === '0';
        const upscaler1 = document.getElementById('upscale_upscaler_1').value;
        const upscaler2 = document.getElementById('upscale_upscaler_2').value;

        const payload = {
            resize_mode: isFactorMode ? 0 : 1,
            show_extras_results: true,
            gfpgan_visibility: parseFloat(document.getElementById('upscale_gfpgan_visibility').value) || 0,
            codeformer_visibility: parseFloat(document.getElementById('upscale_codeformer_visibility').value) || 0,
            codeformer_weight: parseFloat(document.getElementById('upscale_codeformer_weight').value) || 0,
            upscaling_resize: parseFloat(document.getElementById('upscale_factor').value) || 2,
            upscaling_resize_w: parseInt(document.getElementById('upscale_width').value) || 1024,
            upscaling_resize_h: parseInt(document.getElementById('upscale_height').value) || 1024,
            upscaling_crop: document.getElementById('upscale_crop').checked,
            upscaler_1: upscaler1,
            upscaler_2: upscaler2,
            extras_upscaler_2_visibility: parseFloat(document.getElementById('upscale_upscaler_2_visibility').value) || 0,
            upscale_first: false,
            image: sourceImageB64.split(',')[1]
        };

        localStorage.setItem('bojro_upscale_upscaler_1', upscaler1);
        localStorage.setItem('bojro_upscale_upscaler_2', upscaler2);

        const res = await fetchWithRetry(`${HOST}/sdapi/v1/extra-single-image`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("Server Error " + res.status);
        const data = await res.json();
        if (!data.image) throw new Error("No image returned");

        // A successful request means every tile finished, whatever the last poll caught.
        upscaleJobDone = true;
        clearTimeout(upscalePollTimeout);
        if (lastKnownTotal !== null && btn) btn.innerText = `Step ${lastKnownTotal} / ${lastKnownTotal}`;

        const finalB64 = "data:image/png;base64," + data.image;
        // Shown first, saved behind it - see saveImageToDBInBackground(), utils.js.
        const saved = saveImageToDBInBackground(finalB64);

        const img = document.createElement('img');
        img.src = finalB64;
        img.className = 'gen-result';
        img.loading = "lazy";
        img.dataset.dbId = '';
        saved.then(newId => { img.dataset.dbId = newId != null ? String(newId) : ''; });
        img.onclick = async () => {
            await saved;
            // Gathers every image in this gallery for the fullscreen viewer.
            const allImgs = Array.from(resultGal.querySelectorAll('.gen-result'));
            const items = allImgs.map(el => ({
                id: el.dataset.dbId ? parseInt(el.dataset.dbId) : null,
                data: el.src,
                domElement: el
            }));
            window.openFullscreen(items, allImgs.indexOf(img));
        };
        attachLongPress(img, sendResultToUpscaler);
        if (resultGal.firstChild) resultGal.insertBefore(img, resultGal.firstChild);
        else resultGal.appendChild(img);

        const autoDl = document.getElementById('autoDlCheck');
        if (autoDl && autoDl.checked) saveToMobileGallery(finalB64);
        // Sends a completion notification for Upscale jobs (only fires while backgrounded).
        await sendCompletionNotification("Upscale Complete: Image Ready");
    } catch (e) {
        console.error("Upscale Error:", e);
        await window.appAlert("Upscale failed: " + e.message, { title: 'Upscale Failed', danger: true });
    } finally {
        upscaleJobDone = true;
        clearTimeout(upscalePollTimeout);
        if (btn) { btn.disabled = false; btn.innerText = oldText; }
        if (spinner) spinner.style.display = 'none';
        setAbortButtonState('abortInpGenBtn', false);
    }
}

// -----------------------------------------------------------
// FULLSCREEN LIGHTBOX & ANALYSIS
// -----------------------------------------------------------

// Converts the tapped thumbnail's page index to its absolute position in the full dataset, so navigation crosses pages.
window.openFullscreenFromGallery = function(index) {
    fullscreenOpenedFromGalleryGrid = true;
    currentGalleryImages = [...allGalleryImagesData];
    currentGalleryIndex = (galleryPage - 1) * ITEMS_PER_PAGE + index;
    updateLightboxImage();
    document.getElementById('fullScreenModal').classList.remove('hidden');
}

// Accepts an array of {id, data, domElement} plus the index to open on.
window.openFullscreen = function(items, index) {
    // This is the inline results strip, not the paginated gallery, so the flag is false (see globals.js).
    fullscreenOpenedFromGalleryGrid = false;
    currentGalleryImages = items;
    currentGalleryIndex = index;
    updateLightboxImage();
    document.getElementById('fullScreenModal').classList.remove('hidden');
}

window.updateLightboxImage = function() {
    if (currentGalleryImages.length > 0 && currentGalleryImages[currentGalleryIndex]) {
        const img = document.getElementById('fsImage');
        img.src = currentGalleryImages[currentGalleryIndex].data;
        // Reset prev/next positioning too.
        if (typeof window.resetLightboxZoom === 'function') {
            window.resetLightboxZoom(false);
        } else {
            img.style.transition = 'none';
            img.style.transform = 'translateX(0)';
        }
        const prevImg = document.getElementById('fsImagePrev');
        const nextImg = document.getElementById('fsImageNext');
        const containerWidth = document.getElementById('lightboxContainer').offsetWidth || window.innerWidth;
        if (prevImg) { prevImg.style.transition = 'none'; prevImg.style.transform = `translateX(${-containerWidth - 16}px)`; }
        if (nextImg) { nextImg.style.transition = 'none'; nextImg.style.transform = `translateX(${containerWidth + 16}px)`; }
    }
    if (typeof updateFsControlNetButtons === 'function') updateFsControlNetButtons();
}

window.slideImage = function(dir) {
    if (currentGalleryImages.length === 0) return;
    currentGalleryIndex += dir;
    if (currentGalleryIndex < 0) currentGalleryIndex = currentGalleryImages.length - 1;
    if (currentGalleryIndex >= currentGalleryImages.length) currentGalleryIndex = 0;
    updateLightboxImage();
}

// Swipe navigation for the fullscreen viewer: drag follows the finger, the neighbour peeks in, edge taps jump. Pinch-to-zoom (capped at 100% pixel size), double-tap toggles 100% / fit, and a single-finger drag pans when zoomed.
window.setupLightboxSwipe = function() {
    const GAP = 16; // px between images while dragging
    const EDGE_ZONE = 70; // px tap zone on each edge, room for a finger
    const TAP_MOVE_THRESHOLD = 10; // px - below this counts as a tap, not a drag
    const DOUBLE_TAP_MAX_DELAY = 300; // ms between taps to count as a double-tap
    const DOUBLE_TAP_MAX_DIST = 30; // px - taps further apart than this don't count
    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    let containerWidth = 0;
    let containerLeft = 0;
    let isCompleting = false;

    // Zoom/pan state - scale 1 is the default fit-to-width view
    let scale = 1;
    let panX = 0;
    let panY = 0;
    let isPinching = false;
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    // Captured at pinch start so pan is recalculated relative to where the gesture began and stops cleanly at the scale cap.
    let pinchStartPanX = 0;
    let pinchStartPanY = 0;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    // Tracks a pan that might turn out to be an edge tap.
    let panTapStartClientX = 0;
    let panTapStartClientY = 0;
    let panTapCurrentClientX = 0;
    let panTapCurrentClientY = 0;
    let panTapContainerLeft = 0;
    let panTapContainerWidth = 0;
    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;

    // Cache once - avoids 3x getElementById() per touchmove
    const container = document.getElementById('lightboxContainer');
    const img = document.getElementById('fsImage');
    const prevImg = document.getElementById('fsImagePrev');
    const nextImg = document.getElementById('fsImageNext');
    if (!container || !img) return;

    // Re-clamps once the new image has loaded. No-op when not zoomed.
    img.addEventListener('load', () => {
        if (scale > 1) {
            clampPan();
            applyZoomTransform(false);
        }
    });

    function neighborIndex(offset) {
        const len = currentGalleryImages.length;
        return ((currentGalleryIndex + offset) % len + len) % len;
    }

    // 100% = the image's actual pixel resolution relative to the fit-to-width size (uses getRenderedImageSize()).
    function getMaxScale() {
        if (!img.naturalWidth) return 3;
        const rendered = getRenderedImageSize(container.getBoundingClientRect());
        if (!rendered.w) return 3;
        return Math.max(1, img.naturalWidth / rendered.w);
    }

    // Rendered content is letterboxed (object-fit:contain), so the container size overstates the bounds on one axis.
    function getRenderedImageSize(rect) {
        if (!img.naturalWidth || !img.naturalHeight) return { w: rect.width, h: rect.height };
        const containerAspect = rect.width / rect.height;
        const imageAspect = img.naturalWidth / img.naturalHeight;
        if (imageAspect > containerAspect) {
            // Width-constrained: letterboxed top/bottom.
            return { w: rect.width, h: rect.width / imageAspect };
        }
        // Height-constrained: letterboxed left/right.
        return { w: rect.height * imageAspect, h: rect.height };
    }

    function clampPan() {
        const rect = container.getBoundingClientRect();
        const rendered = getRenderedImageSize(rect);
        const maxPanX = (rendered.w * (scale - 1)) / 2;
        const maxPanY = (rendered.h * (scale - 1)) / 2;
        panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
        panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
    }

    function applyZoomTransform(animate) {
        img.style.transition = animate ? 'transform 0.25s ease' : 'none';
        img.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    }

    window.resetLightboxZoom = function(animate) {
        scale = 1;
        panX = 0;
        panY = 0;
        applyZoomTransform(!!animate);
    };

    function touchDist(t1, t2) {
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function onStart(x) {
        if (currentGalleryImages.length <= 1) return; // nothing to swipe to
        if (isCompleting) return; // previous swipe's swap animation still finishing
        isDragging = true;
        startX = x;
        currentX = x;

        const rect = container.getBoundingClientRect();
        containerWidth = rect.width || window.innerWidth;
        containerLeft = rect.left;

        [img, prevImg, nextImg].forEach(el => { if (el) el.style.transition = 'none'; });

        if (prevImg) prevImg.src = currentGalleryImages[neighborIndex(-1)].data;
        if (nextImg) nextImg.src = currentGalleryImages[neighborIndex(1)].data;
    }

    function onMove(x) {
        if (!isDragging) return;
        currentX = x;
        const delta = currentX - startX;
        // Deadzone matching TAP_MOVE_THRESHOLD so finger jitter during a tap doesn't move the image.
        if (Math.abs(delta) < TAP_MOVE_THRESHOLD) return;
        img.style.transform = `translateX(${delta}px)`;
        if (prevImg) prevImg.style.transform = `translateX(${-containerWidth - GAP + delta}px)`;
        if (nextImg) nextImg.style.transform = `translateX(${containerWidth + GAP + delta}px)`;
    }

    function onEnd() {
        if (!isDragging) return;
        isDragging = false;
        const delta = currentX - startX;

        // Tap (not drag) on an edge zone - instant jump, no animation
        if (Math.abs(delta) < TAP_MOVE_THRESHOLD) {
            const tapX = startX - containerLeft;
            [img, prevImg, nextImg].forEach(el => { if (el) el.style.transition = 'none'; });
            if (tapX < EDGE_ZONE) {
                window.slideImage(-1);
            } else if (tapX > containerWidth - EDGE_ZONE) {
                window.slideImage(1);
            }
            return;
        }

        [img, prevImg, nextImg].forEach(el => { if (el) el.style.transition = 'transform 0.25s ease'; });

        const threshold = containerWidth * 0.2;
        if (Math.abs(delta) > threshold) {
            // Dragging left (negative delta) reveals the NEXT image.
            const dir = delta < 0 ? 1 : -1;
            const exitOffset = delta < 0 ? -(containerWidth + GAP) : (containerWidth + GAP);
            img.style.transform = `translateX(${exitOffset}px)`;
            if (dir === 1 && nextImg) nextImg.style.transform = 'translateX(0px)';
            if (dir === -1 && prevImg) prevImg.style.transform = 'translateX(0px)';
            isCompleting = true;
            setTimeout(() => {
                window.slideImage(dir);
                [img, prevImg, nextImg].forEach(el => { if (el) el.style.transition = 'none'; });
                img.style.transform = 'translateX(0)';
                if (prevImg) prevImg.style.transform = `translateX(${-containerWidth - GAP}px)`;
                if (nextImg) nextImg.style.transform = `translateX(${containerWidth + GAP}px)`;
                isCompleting = false;
            }, 250);
        } else {
            img.style.transform = 'translateX(0)';
            if (prevImg) prevImg.style.transform = `translateX(${-containerWidth - GAP}px)`;
            if (nextImg) nextImg.style.transform = `translateX(${containerWidth + GAP}px)`;
        }
    }

    container.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (e.touches.length === 2) {
            isDragging = false; // cancel any in-progress swipe drag
            // Also cancels any in-progress pan so a stale edge tap can't fire after a pinch.
            isPanning = false;
            isPinching = true;
            pinchStartDist = touchDist(e.touches[0], e.touches[1]);
            pinchStartScale = scale;
            pinchStartPanX = panX;
            pinchStartPanY = panY;
            return;
        }
        if (e.touches.length !== 1) return;

        const t = e.touches[0];
        const now = Date.now();
        const dx = t.clientX - lastTapX, dy = t.clientY - lastTapY;
        // No double-tap zoom at the edges, where edge-tap navigation lives.
        const edgeRect = container.getBoundingClientRect();
        const tapXForEdgeCheck = t.clientX - edgeRect.left;
        const nearEdgeForDoubleTap = tapXForEdgeCheck < EDGE_ZONE || tapXForEdgeCheck > edgeRect.width - EDGE_ZONE;
        const isDoubleTap = !nearEdgeForDoubleTap && (now - lastTapTime < DOUBLE_TAP_MAX_DELAY) && Math.sqrt(dx * dx + dy * dy) < DOUBLE_TAP_MAX_DIST;
        lastTapTime = now;
        lastTapX = t.clientX;
        lastTapY = t.clientY;

        if (isDoubleTap) {
            lastTapTime = 0; // consumed - don't let a 3rd tap chain into another toggle
            if (scale > 1) {
                window.resetLightboxZoom(true);
            } else {
                const newScale = getMaxScale();
                // Anchors the zoom at the tapped point.
                const rect = container.getBoundingClientRect();
                const offsetX = t.clientX - (rect.left + rect.width / 2);
                const offsetY = t.clientY - (rect.top + rect.height / 2);
                scale = newScale;
                panX = offsetX * (1 - newScale);
                panY = offsetY * (1 - newScale);
                clampPan();
                applyZoomTransform(true);
            }
            return;
        }

        if (scale > 1) {
            isPanning = true;
            panStartX = t.clientX - panX;
            panStartY = t.clientY - panY;
            // Captures the raw start position and container bounds so edge taps still navigate while zoomed.
            panTapStartClientX = t.clientX;
            panTapStartClientY = t.clientY;
            panTapCurrentClientX = t.clientX;
            panTapCurrentClientY = t.clientY;
            const zoomRect = container.getBoundingClientRect();
            panTapContainerLeft = zoomRect.left;
            panTapContainerWidth = zoomRect.width;
        } else {
            onStart(t.clientX);
        }
    }, { passive: false });

    container.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (isPinching && e.touches.length === 2) {
            const newDist = touchDist(e.touches[0], e.touches[1]);
            // Clamps the scale before recalculating pan.
            const rawScale = pinchStartScale * (newDist / pinchStartDist);
            scale = Math.max(1, Math.min(getMaxScale(), rawScale));
            const effectiveScaleFactor = scale / pinchStartScale;
            // Zooms around the image centre; recalculated from the pinch's starting pan each move.
            panX = pinchStartPanX * effectiveScaleFactor;
            panY = pinchStartPanY * effectiveScaleFactor;
            clampPan();
            applyZoomTransform(false);
            return;
        }
        if (isPanning && e.touches.length === 1) {
            panTapCurrentClientX = e.touches[0].clientX;
            panTapCurrentClientY = e.touches[0].clientY;
            // Same deadzone as onMove().
            const totalMove = Math.max(
                Math.abs(e.touches[0].clientX - panTapStartClientX),
                Math.abs(e.touches[0].clientY - panTapStartClientY)
            );
            if (totalMove < TAP_MOVE_THRESHOLD) return;
            panX = e.touches[0].clientX - panStartX;
            panY = e.touches[0].clientY - panStartY;
            clampPan();
            applyZoomTransform(false);
            return;
        }
        if (isDragging) onMove(e.touches[0].clientX);
    }, { passive: false });

    container.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (isPinching) {
            isPinching = false;
            if (scale <= 1.02) window.resetLightboxZoom(true); // snap back if barely zoomed
            return;
        }
        if (isPanning) {
            isPanning = false;
            // A tap near an edge: navigate, preserving zoom/pan. Checks both axes.
            const totalMove = Math.max(
                Math.abs(panTapCurrentClientX - panTapStartClientX),
                Math.abs(panTapCurrentClientY - panTapStartClientY)
            );
            if (totalMove < TAP_MOVE_THRESHOLD && currentGalleryImages.length > 1) {
                const tapX = panTapStartClientX - panTapContainerLeft;
                const savedScale = scale, savedPanX = panX, savedPanY = panY;
                let dir = 0;
                if (tapX < EDGE_ZONE) dir = -1;
                else if (tapX > panTapContainerWidth - EDGE_ZONE) dir = 1;
                if (dir !== 0) {
                    // Restores the saved zoom/pan after slideImage() resets them.
                    window.slideImage(dir);
                    scale = savedScale;
                    panX = savedPanX;
                    panY = savedPanY;
                    clampPan();
                    applyZoomTransform(false);
                }
            }
            return;
        }
        onEnd();
    }, { passive: false });

    // Handles touchcancel by abandoning the gesture.
    container.addEventListener('touchcancel', () => {
        isDragging = false;
        isPanning = false;
        isPinching = false;
    }, { passive: false });

    container.addEventListener('mousedown', (e) => { if (scale <= 1) onStart(e.clientX); });
    container.addEventListener('mousemove', (e) => { if (scale <= 1) onMove(e.clientX); });
    container.addEventListener('mouseup', onEnd);
    container.addEventListener('mouseleave', () => { if (isDragging) onEnd(); });
};

// Removes a deleted image from Generation Results too (called from both deletion paths). Not applied to "Clear View".
window.removeFromGenResultsById = function(id) {
    if (id == null) return;
    ['gallery', 'inpGallery'].forEach(containerId => {
        const container = document.getElementById(containerId);
        if (!container) return;
        const match = container.querySelector(`img[data-db-id="${id}"]`);
        if (match) match.remove();
    });
}

window.deleteCurrentFsImage = async function() {
    const currentItem = currentGalleryImages[currentGalleryIndex];
    if (!currentItem) return;
    const confirmed = await window.appConfirm("Delete this image?", { title: 'Delete Image', okText: 'DELETE', danger: true });
    if (confirmed) {
        if (currentItem.id) {
            const tx = db.transaction(["images"], "readwrite");
            tx.objectStore("images").delete(currentItem.id);
            tx.oncomplete = () => {
                currentGalleryImages.splice(currentGalleryIndex, 1);
                window.removeFromGenResultsById(currentItem.id);
                finishDeleteAction(currentItem);
            };
        } else {
            currentGalleryImages.splice(currentGalleryIndex, 1);
            finishDeleteAction(currentItem);
        }
    }
}

window.finishDeleteAction = function(item) {
    if (item.domElement) item.domElement.remove();
    if (currentGalleryImages.length === 0) {
        window.closeFsModal();
        loadGallery();
    } else {
        if (currentGalleryIndex >= currentGalleryImages.length) currentGalleryIndex--;
        updateLightboxImage();
        loadGallery();
    }
}

window.downloadCurrent = function() {
    const src = document.getElementById('fsImage').src;
    saveToMobileGallery(src);
}

// Closing returns to the page the viewed image belongs to (only when opened from the paginated grid).
window.closeFsModal = () => {
    document.getElementById('fullScreenModal').classList.add('hidden');
    if (fullscreenOpenedFromGalleryGrid && currentGalleryImages && currentGalleryImages.length > 0) {
        const newPage = Math.floor(currentGalleryIndex / ITEMS_PER_PAGE) + 1;
        if (newPage !== galleryPage) {
            galleryPage = newPage;
            if (typeof loadGallery === 'function') loadGallery();
        }
    }
};

window.analyzeCurrentFs = async () => {
    const src = document.getElementById('fsImage').src;
    // The viewer stays up until the image has loaded into the Analyzer preview, then the tab is switched and the viewer closed together.
    try {
        const blob = await fetch(src).then(res => res.blob());
        await processImageForAnalysis(blob);
    } catch (e) {
        console.error('Analyze from viewer failed:', e);
    }
    window.switchTab('ana');
    window.closeFsModal();
    // Scrolls to the top, again on the next frame once the tab has laid out.
    window.scrollTo({ top: 0, behavior: 'instant' });
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
}

// With ControlNet enabled anywhere in Settings, ANALYZE becomes a round icon button to make room for the send-to-ControlNet button.
// ControlNet counts as on when either of its two Config switches is. The fullscreen viewer's buttons and the Analyzer's Send-to-ControlNet button and sticky-bar panel (analyzer.js) all use this one rule.
function isControlNetEnabledAnywhere() {
    return localStorage.getItem('bojroShowControlnetSdxlAnima') === 'true'
        || localStorage.getItem('bojroShowControlnetOther') === 'true';
}

window.updateFsControlNetButtons = function() {
    const enabled = isControlNetEnabledAnywhere();
    const analyzeBtn = document.getElementById('fsAnalyzeBtn');
    const sendBtn = document.getElementById('fsSendToCnBtn');
    if (analyzeBtn) {
        analyzeBtn.className = enabled ? 'btn-icon' : 'btn-small';
        analyzeBtn.innerHTML = enabled ? '<i data-lucide="scan-line"></i>' : 'ANALYZE';
        if (enabled && typeof lucide !== 'undefined') lucide.createIcons();
    }
    if (sendBtn) sendBtn.classList.toggle('hidden', !enabled);
    // The Analyzer's own "Send image to ControlNet" button rides the same check
    if (typeof updateAnalyzerSendButtons === 'function') updateAnalyzerSendButtons();
}

// Resolves which mode's ControlNet units the viewer's send button targets (same fieldPrefix logic as buildJobFromUIRaw(); the sub-mode lives in currentInpaintTopMode).
function resolveControlNetModePrefix() {
    if (currentMode === 'inp') {
        return (typeof currentInpaintTopMode !== 'undefined' && currentInpaintTopMode === 'img2img') ? 'img2img' : 'inp';
    }
    return currentMode;
}

// Sends the fullscreen image to the first ControlNet unit of the current mode without an image, via applyControlNetImage() (network.js), then navigates to that unit.
// The work is in sendImageToControlNet() below, which the Analyzer's button also uses.
window.sendCurrentFsImageToControlNet = function() {
    const src = document.getElementById('fsImage').src;
    if (!src) return;
    sendImageToControlNet(src, true);
};

// Shared body of the above, also used by the Analyzer's "Send image to" row (analyzer.js), which has no viewer to close.
function sendImageToControlNet(src, fromFullscreen) {
    const mode = resolveControlNetModePrefix();
    if (!controlNetImages[mode]) return;
    for (let unit = 0; unit <= 2; unit++) {
        if (!controlNetImages[mode][unit]) {
            applyControlNetImage(mode, unit, src);
            if (Toast) Toast.show({ text: `Sent to CONTROLNET ${unit + 1}` });
            navigateToControlNetUnit(mode, unit, fromFullscreen);
            return;
        }
    }
    // All units already have an image: say so rather than overwrite.
    if (Toast) Toast.show({ text: 'All ControlNet units already have an image' });
}

// Opens the unit's accordion group and toggle button without collapsing it if already open.
function ensureGenericSectionOpen(contentId, arrowId, storageKey) {
    const content = document.getElementById(contentId);
    if (content && content.classList.contains('hidden') && typeof toggleGeneric === 'function') {
        toggleGeneric(contentId, arrowId, storageKey);
    }
}

function navigateToControlNetUnit(mode, unit, fromFullscreen) {
    if (fromFullscreen) window.closeFsModal();
    if (mode === 'inp' || mode === 'img2img') {
        window.switchTab('inp');
        if (typeof window.setInpaintTopMode === 'function') window.setInpaintTopMode(mode === 'img2img' ? 'img2img' : 'inpaint');
    } else {
        window.switchTab('gen');
        if (typeof window.setMode === 'function') window.setMode(mode);
    }
    ensureGenericSectionOpen(`grp-${mode}-cn`, `arr-${mode}-cn`, `bojro_vis_${mode}_cn`);
    if (typeof window.selectControlNetUnit === 'function') window.selectControlNetUnit(mode, unit);
    const target = document.getElementById(`${mode}_cn_${unit}_fields`) || document.getElementById(`${mode}ControlnetGroup`);
    // Instant scroll, regardless of any page-wide scroll-behavior.
    if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
}

window.handleFileSelect = e => {
    const file = e.target.files[0];
    if (!file) return;
    processImageForAnalysis(file);
}

// Grows a textarea to fit its content.
function autoResizeTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

// Bytes to a human-readable string.
function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return '--';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Identifies the Analyzer image being loaded, so callbacks from a superseded or cleared load do nothing.
let anaLoadToken = 0;

async function processImageForAnalysis(blob) {
    const myLoadToken = ++anaLoadToken;
    // Shown immediately: these pieces stay hidden until an image is picked.
    const postUpload = document.getElementById('anaPostUploadSection');
    if (postUpload) postUpload.classList.remove('hidden');
    // The large centred box shows only before an upload (same pattern as the editor's img-input-container / canvasWrapper).
    const uploadContainer = document.getElementById('anaUploadContainer');
    if (uploadContainer) uploadContainer.classList.add('hidden');

    const url = URL.createObjectURL(blob);
    const img = new Image();
    // Resolves once the preview has loaded (or failed / been superseded), so callers can wait before showing it.
    let imageSettled;
    const imageLoaded = new Promise(resolve => { imageSettled = resolve; });
    img.onerror = () => imageSettled();
    img.onload = () => {
        if (myLoadToken !== anaLoadToken) { URL.revokeObjectURL(url); imageSettled(); return; }
        const w = img.width;
        const h = img.height;
        const d = gcd(w, h);
        document.getElementById('resOut').innerText = `${w} x ${h}`;
        document.getElementById('arOut').innerText = `${w/d}:${h/d}`;
        document.getElementById('anaPreview').src = url;
        document.getElementById('anaGallery').classList.remove('hidden');
        // The "Send image to" row works for any loaded image, metadata or not.
        document.getElementById('anaSendBlock')?.classList.remove('hidden');
        if (typeof updateAnalyzerSendButtons === 'function') updateAnalyzerSendButtons();
        if (typeof updateAnalyzerStickyBar === 'function') updateAnalyzerStickyBar();
        // Remembered in the Analyzer's history (analyzerhistory.js): the original file. Fire-and-forget.
        if (typeof AnalyzerHistory !== 'undefined') AnalyzerHistory.save(blob);
        imageSettled();
    };
    img.src = url;
    // Shows the file size alongside Resolution/Ratio.
    const fileSizeEl = document.getElementById('fileSizeOut');
    if (fileSizeEl) fileSizeEl.innerText = formatFileSize(blob.size);
    const text = await readPngMetadata(blob);
    await imageLoaded;
    if (myLoadToken !== anaLoadToken) return;
    const emptyBox = document.getElementById('anaMetaEmpty');
    const sections = document.getElementById('anaMetaSections');
    const btnContainer = document.getElementById('anaCopyButtons');

    if (text) {
        currentAnalyzedPrompts = parseGenInfo(text);
        emptyBox.classList.add('hidden');
        sections.classList.remove('hidden');

        // Prompt/Negative/LoRA chips/Settings chips (analyzer.js). Display only.
        renderAnalyzerMeta(currentAnalyzedPrompts);

        if (btnContainer) {
            renderUseInButtons();
            btnContainer.classList.remove('hidden');
            document.getElementById('anaUseInBlock')?.classList.remove('hidden');
        }
        if (typeof updateAnalyzerStickyBar === 'function') updateAnalyzerStickyBar();
    } else {
        currentAnalyzedPrompts = null;
        emptyBox.classList.remove('hidden');
        emptyBox.innerText = "No parameters found.";
        sections.classList.add('hidden');
        if (btnContainer) btnContainer.classList.add('hidden');
        document.getElementById('anaUseInBlock')?.classList.add('hidden');
        if (typeof updateAnalyzerStickyBar === 'function') updateAnalyzerStickyBar();
    }
}

// The cross on the Analyzer's image resets the whole tab to its pre-upload state.
window.clearAnalyzedImage = function() {
    anaLoadToken++; // anything still loading must not repopulate what's cleared below

    const preview = document.getElementById('anaPreview');
    if (preview) {
        if (preview.src && preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
        preview.removeAttribute('src');
    }
    document.getElementById('anaGallery')?.classList.add('hidden');
    document.getElementById('anaPostUploadSection')?.classList.add('hidden');
    document.getElementById('anaUploadContainer')?.classList.remove('hidden');

    const setText = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };
    setText('resOut', '-- x --');
    setText('arOut', '--');
    setText('fileSizeOut', '--');

    currentAnalyzedPrompts = null;
    const emptyBox = document.getElementById('anaMetaEmpty');
    if (emptyBox) { emptyBox.classList.remove('hidden'); emptyBox.innerText = 'Load image...'; }
    ['anaMetaSections', 'anaCopyButtons', 'anaUseInBlock', 'anaSendBlock'].forEach(id => {
        document.getElementById(id)?.classList.add('hidden');
    });
    // The prompt/negative/LoRA/settings cards (analyzer.js)
    if (typeof resetAnalyzerMeta === 'function') resetAnalyzerMeta();
    if (typeof updateAnalyzerStickyBar === 'function') updateAnalyzerStickyBar();

    // Resets the file input so re-selecting the same file fires change.
    const fileInput = document.getElementById('imageUpload');
    if (fileInput) fileInput.value = '';
};

// Rebuilds the Analyzer's "Use In" buttons, showing only modes enabled in Interface Tabs settings. With all 5, SDXL sits alone on a wide row below the other 4; with 1-4, they share one row.
// The modes "Use In" offers, in order, minus any hidden in Settings. Shared by the Use In row and the Analyzer's sticky header menu (analyzer.js).
const USE_IN_MODE_ORDER = [
    { key: 'xl', label: 'SDXL', fn: 'copyToSdxl' },
    { key: 'anima', label: 'ANIMA', fn: 'copyToAnima' },
    { key: 'qwen', label: 'QWEN', fn: 'copyToQwen' },
    { key: 'flux', label: 'FLUX', fn: 'copyToFlux' },
    { key: 'krea', label: 'KREA', fn: 'copyToKrea' }
];
function getUseInModes() {
    const saved = localStorage.getItem('bojro_model_visibility');
    const visibility = saved ? JSON.parse(saved) : { xl: true, flux: true, qwen: true, anima: true, krea: true };
    return USE_IN_MODE_ORDER.filter(m => visibility[m.key] !== false);
}

function renderUseInButtons() {
    const btnContainer = document.getElementById('anaCopyButtons');
    if (!btnContainer) return;

    const modeOrder = USE_IN_MODE_ORDER;
    const enabled = getUseInModes();

    const outlineStyle = 'flex:1; min-width:70px; background: var(--bg-panel); border:1px solid var(--accent-primary); color:var(--accent-primary);';
    const wideStyle = 'flex:1; min-width:70px; background: var(--accent-gradient); color:white;';
    const makeBtn = (m, style) => `<button onclick="${m.fn}()" class="btn-small" style="${style}">${m.label}</button>`;

    if (enabled.length === 0) {
        btnContainer.innerHTML = '';
        return;
    }

    if (enabled.length === 5) {
        btnContainer.className = 'col';
        btnContainer.style.gap = '10px';
        const topRow = enabled.filter(m => m.key !== 'xl').map(m => makeBtn(m, outlineStyle)).join('');
        const sdxlRow = makeBtn(modeOrder[0], wideStyle);
        btnContainer.innerHTML =
            `<div class="row" style="gap: 10px; flex-wrap: wrap;">${topRow}</div>` +
            `<div class="row" style="gap: 10px; flex-wrap: wrap;">${sdxlRow}</div>`;
    } else {
        btnContainer.className = 'row';
        btnContainer.style.gap = '10px';
        btnContainer.style.flexWrap = 'wrap';
        btnContainer.innerHTML = enabled.map(m => makeBtn(m, m.key === 'xl' ? wideStyle : outlineStyle)).join('');
    }
}

// Applies steps/cfg/sampler/scheduler/width/height/seed to a mode's fields. Sampler/scheduler apply only if a matching option exists.
// Returns the sampler/scheduler that could not be applied; a mode with no such field isn't reported.
function applyAnalyzedGenParams(mode) {
    const skipped = [];
    if (!currentAnalyzedPrompts) return skipped;
    const setIfPresent = (field, value) => {
        if (!value) return;
        const el = document.getElementById(`${mode}_${field}`);
        if (el) el.value = value;
    };
    const setIfOptionExists = (field, value, label) => {
        if (!value) return;
        const el = document.getElementById(`${mode}_${field}`);
        if (!el) return;
        if (Array.from(el.options || []).some(o => o.value === value)) el.value = value;
        else skipped.push(`${label} "${value}"`);
    };
    setIfPresent('steps', currentAnalyzedPrompts.steps);
    setIfPresent('cfg', currentAnalyzedPrompts.cfg);
    setIfPresent('width', currentAnalyzedPrompts.width);
    setIfPresent('height', currentAnalyzedPrompts.height);
    setIfPresent('seed', currentAnalyzedPrompts.seed);
    setIfOptionExists('sampler', currentAnalyzedPrompts.sampler, 'sampler');
    setIfOptionExists('scheduler', currentAnalyzedPrompts.scheduler, 'scheduler');
    // Programmatic assignment fires no oninput, so refresh the negative prompt's dimming explicitly.
    if (typeof updateNegPromptDimming === 'function') updateNegPromptDimming(mode);
    return skipped;
}

// The "Copied to SDXL" confirmation; names anything applyAnalyzedGenParams() had to leave out.
function analyzerUseInToast(label, skipped) {
    if (typeof Toast === 'undefined' || !Toast) return;
    const extra = skipped.length ? ` (${skipped.join(', ')} not available)` : '';
    Toast.show({ text: `Copied to ${label}${extra}`, duration: skipped.length ? 'long' : 'short' });
}

window.copyToSdxl = function() {
    if (!currentAnalyzedPrompts) return;
    document.getElementById('xl_prompt').value = currentAnalyzedPrompts.pos;
    document.getElementById('xl_neg').value = currentAnalyzedPrompts.neg;
    if (typeof savePrompt === 'function') savePrompt('xl');
    if (typeof saveNegativePrompt === 'function') saveNegativePrompt('xl');
    const skippedParams = applyAnalyzedGenParams('xl');
    window.setMode('xl');
    window.switchTab('gen');
    analyzerUseInToast('SDXL', skippedParams);
}

window.copyToFlux = function() {
    if (!currentAnalyzedPrompts) return;
    document.getElementById('flux_prompt').value = currentAnalyzedPrompts.pos;
    if (typeof savePrompt === 'function') savePrompt('flux');
    const skippedParams = applyAnalyzedGenParams('flux');
    window.setMode('flux');
    window.switchTab('gen');
    analyzerUseInToast('FLUX', skippedParams);
}

window.copyToQwen = function() {
    if (!currentAnalyzedPrompts) return;
    document.getElementById('qwen_prompt').value = currentAnalyzedPrompts.pos;
    document.getElementById('qwen_neg').value = currentAnalyzedPrompts.neg || "bad quality, blur, watermark";
    if (typeof savePrompt === 'function') savePrompt('qwen');
    if (typeof saveNegativePrompt === 'function') saveNegativePrompt('qwen');
    const skippedParams = applyAnalyzedGenParams('qwen');
    window.setMode('qwen');
    window.switchTab('gen');
    analyzerUseInToast('QWEN', skippedParams);
}

window.copyToAnima = function() {
    if (!currentAnalyzedPrompts) return;
    document.getElementById('anima_prompt').value = currentAnalyzedPrompts.pos;
    document.getElementById('anima_neg').value = currentAnalyzedPrompts.neg || "bad quality, blur, watermark";
    if (typeof savePrompt === 'function') savePrompt('anima');
    if (typeof saveNegativePrompt === 'function') saveNegativePrompt('anima');
    const skippedParams = applyAnalyzedGenParams('anima');
    window.setMode('anima');
    window.switchTab('gen');
    analyzerUseInToast('ANIMA', skippedParams);
}

window.copyToKrea = function() {
    if (!currentAnalyzedPrompts) return;
    document.getElementById('krea_prompt').value = currentAnalyzedPrompts.pos;
    document.getElementById('krea_neg').value = currentAnalyzedPrompts.neg || "bad quality, blur, watermark";
    if (typeof savePrompt === 'function') savePrompt('krea');
    if (typeof saveNegativePrompt === 'function') saveNegativePrompt('krea');
    const skippedParams = applyAnalyzedGenParams('krea');
    window.setMode('krea');
    window.switchTab('gen');
    analyzerUseInToast('KREA', skippedParams);
}