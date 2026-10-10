// -----------------------------------------------------------
// UI INTERACTION & SETTINGS
// -----------------------------------------------------------

// Default Prompts Configuration
const DEFAULT_PROMPTS = {
    'xl': "1girl, hand fan, solo, black hair, long hair, jewelry, earrings, holding, chinese clothes, hair ornament, holding fan, red nails, looking at viewer, upper body, long sleeves, red lips, folding fan, smoke, hanfu, nail polish, masterpiece, best quality",
    'flux': "textured chalk pastel for subtle highlights, delicate charcoal shading for depth and contrast, warm, earthy color palette with ambient lighting casting soft shadows, A young woman with expressive, natural eyes and a gentle smile, soft oil brushwork adding warmth and depth to her skin, her small cat sitting calmly beside her, cozy and slightly messy living room in the background with books scattered, a warm throw blanket casually draped over the couch, city lights visible through a large window showing the urban landscape at night,",
    'qwen': "a man wearing sun glasses as captain of the guards stands in full regalia, exuding authority and experience. His striking eyes command attention, contrasting with his chestnut curly hair. The bear crest on his armor symbolizes his strength and loyalty. This vivid portrayal, whether a painting or photograph, captures the essence of a formidable and respected knight in exquisite detail and quality",
    'anima': "a man wearing sun glasses as captain of the guards stands in full regalia, exuding authority and experience. His striking eyes command attention, contrasting with his chestnut curly hair. The bear crest on his armor symbolizes his strength and loyalty. This vivid portrayal, whether a painting or photograph, captures the essence of a formidable and respected knight in exquisite detail and quality",
    'krea': "a man wearing sun glasses as captain of the guards stands in full regalia, exuding authority and experience. His striking eyes command attention, contrasting with his chestnut curly hair. The bear crest on his armor symbolizes his strength and loyalty. This vivid portrayal, whether a painting or photograph, captures the essence of a formidable and respected knight in exquisite detail and quality",
    'inp': "original"
};

// Negative-prompt equivalent of DEFAULT_PROMPTS, populated at boot by loadSavedPrompts() from each textarea's own value.
let DEFAULT_NEGATIVE_PROMPTS = {};

// Called on blur for batch size/count: an empty or zero value counts as 1, so show it.
window.normalizeBatchField = function(el) {
    el.value = parseInt(el.value) || 1;
    // Setting .value fires no 'input' event, so save the corrected value explicitly.
    if (typeof saveCurrentInpaintModeStateLive === 'function') saveCurrentInpaintModeStateLive();
    // Derives the main tab from the field id ({mode}_{fieldname}) instead of a separate onblur per mode; no-op for an unknown mode.
    if (typeof saveLiveGenParams === 'function') {
        const mode = el.id.split('_')[0];
        saveLiveGenParams(mode);
    }
}

// As normalizeBatchField, for seed fields: an empty value means -1 (random). Uses parseSeedValue since 0 is a valid seed.
window.normalizeSeedField = function(el) {
    if (typeof parseSeedValue === 'function') el.value = parseSeedValue(el.value);
}

// The 5 modes with both a CFG field and a negative prompt (Flux has no negative). Inpaint and img2img share the 'inp' fields.
const NEG_PROMPT_CFG_MODES = ['xl', 'anima', 'qwen', 'krea', 'inp'];

// At CFG 1 the negative prompt has no effect; grey out its text (the field stays editable).
window.updateNegPromptDimming = function(mode) {
    const cfgEl = document.getElementById(`${mode}_cfg`);
    const negEl = document.getElementById(`${mode}_neg`);
    if (!cfgEl || !negEl) return;
    const isInert = parseFloat(cfgEl.value) === 1;
    negEl.classList.toggle('neg-prompt-inert', isInert);
}

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

// switchTab() is defined only in boot.js (it replaces window.switchTab).
window.setMode = function(mode) {
    currentMode = mode;
    // The Low Bits row under the checkpoint box shows the value of the tab now in front.
    if (typeof refreshLowBitsControls === 'function') refreshLowBitsControls();

    const root = document.documentElement;
    const btnXL = document.getElementById('btn-xl');
    const btnFlux = document.getElementById('btn-flux');
    const btnQwen = document.getElementById('btn-qwen');
    const btnAnima = document.getElementById('btn-anima');
    const btnKrea = document.getElementById('btn-krea');

    const xlRow = document.getElementById('row-xl-model');
    const fluxRow = document.getElementById('row-flux-model');
    const qwenRow = document.getElementById('row-qwen-model');
    const animaRow = document.getElementById('row-anima-model');
    const kreaRow = document.getElementById('row-krea-model');

    const xlCont = document.getElementById('mode-xl-container');
    const fluxCont = document.getElementById('mode-flux-container');
    const qwenCont = document.getElementById('mode-qwen-container');
    const animaCont = document.getElementById('mode-anima-container');
    const kreaCont = document.getElementById('mode-krea-container');

    const titleEl = document.getElementById('appTitle');

    // Reset all states
    btnXL.classList.remove('active');
    btnFlux.classList.remove('active');
    if (btnQwen) btnQwen.classList.remove('active');
    if (btnAnima) btnAnima.classList.remove('active');
    if (btnKrea) btnKrea.classList.remove('active');

    xlRow.classList.add('hidden');
    fluxRow.classList.add('hidden');
    if (qwenRow) qwenRow.classList.add('hidden');
    if (animaRow) animaRow.classList.add('hidden');
    if (kreaRow) kreaRow.classList.add('hidden');

    xlCont.classList.add('hidden');
    fluxCont.classList.add('hidden');
    if (qwenCont) qwenCont.classList.add('hidden');
    if (animaCont) animaCont.classList.add('hidden');
    if (kreaCont) kreaCont.classList.add('hidden');

    // --- MODE SWITCHING LOGIC ---
    if (mode === 'flux') {
        root.setAttribute('data-mode', 'flux');
        btnFlux.classList.add('active');
        fluxRow.classList.remove('hidden');
        fluxCont.classList.remove('hidden');
        document.getElementById('genBtn').innerText = getGenerateButtonLabel('flux');
    } else if (mode === 'qwen') {
        root.setAttribute('data-mode', 'qwen');
        if (btnQwen) btnQwen.classList.add('active');
        if (qwenRow) qwenRow.classList.remove('hidden');
        if (qwenCont) qwenCont.classList.remove('hidden');
        document.getElementById('genBtn').innerText = getGenerateButtonLabel('qwen');
    } else if (mode === 'anima') {
        root.setAttribute('data-mode', 'anima');
        if (btnAnima) btnAnima.classList.add('active');
        if (animaRow) animaRow.classList.remove('hidden');
        if (animaCont) animaCont.classList.remove('hidden');
        document.getElementById('genBtn').innerText = "GENERATE";
    } else if (mode === 'krea') {
        root.setAttribute('data-mode', 'krea');
        if (btnKrea) btnKrea.classList.add('active');
        if (kreaRow) kreaRow.classList.remove('hidden');
        if (kreaCont) kreaCont.classList.remove('hidden');
        document.getElementById('genBtn').innerText = "GENERATE";
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

    // Re-validates negative prompt dimming against the current CFG, since only the CFG field's oninput triggered it.
    if (typeof NEG_PROMPT_CFG_MODES !== 'undefined' && NEG_PROMPT_CFG_MODES.includes(mode) && typeof updateNegPromptDimming === 'function') {
        updateNegPromptDimming(mode);
    }

    // Same for the res-switch highlight: width/height can change while a mode is hidden.
    if (typeof updateResSwitchHighlight === 'function') updateResSwitchHighlight(mode);
}

// --- FORM HELPERS ---

// Flux checkpoints don't use a negative prompt (see updateNegPromptDimming() for CFG=1). Hides the whole Negative group for whichever of Inpaint/img2img is active, based on its selected checkpoint; re-checked on checkpoint change and mode switch.
function updateInpaintNegativePromptVisibility() {
    if (typeof currentInpaintTopMode === 'undefined') return;
    // currentInpaintTopMode uses 'inpaint'/'img2img' but the select id uses 'inp' for Inpaint, so only 'inpaint' is remapped.
    const modelPrefix = currentInpaintTopMode === 'inpaint' ? 'inp' : currentInpaintTopMode;
    const modelSelect = document.getElementById(`${modelPrefix}_modelSelect`);
    const negGroup = document.getElementById('inpNegativeGroup');
    if (!modelSelect || !negGroup || !window.LoraManager) return;
    const arch = window.LoraManager.detectCheckpointArchitecture(modelSelect.value);
    negGroup.classList.toggle('hidden', arch === 'flux');
}

// CLIP/T5 override row for a Flux checkpoint on Inpaint/img2img, alongside the Text Encoder field for single-encoder architectures like Qwen. Per sub-mode with independent checkpoints, so it takes an explicit mode.
function updateInpFluxModuleVisibility(mode) {
    const modelSelect = document.getElementById(`${mode}_modelSelect`);
    const fluxRow = document.getElementById(`${mode}_flux_modules_row`);
    const teCol = document.getElementById(`${mode}_te_col`);
    if (!modelSelect || !fluxRow || !teCol || !window.LoraManager) return;
    const isFlux = window.LoraManager.detectCheckpointArchitecture(modelSelect.value) === 'flux';
    fluxRow.classList.toggle('hidden', !isFlux);
    teCol.classList.toggle('hidden', isFlux);

    // Inpaint/img2img can have any checkpoint, so re-classify their ControlNet/ADetailer sections and re-apply the CFG toggle's feature-hidden state on every change.
    const isSdxlAnima = ['xl', 'anima'].includes(window.LoraManager.detectCheckpointArchitecture(modelSelect.value));
    const cnGroup = document.getElementById(`${mode}ControlnetGroup`);
    if (cnGroup) {
        cnGroup.classList.toggle('controlnet-section-sdxl-anima', isSdxlAnima);
        cnGroup.classList.toggle('controlnet-section-other', !isSdxlAnima);
        const cnKey = isSdxlAnima ? 'bojroShowControlnetSdxlAnima' : 'bojroShowControlnetOther';
        cnGroup.classList.toggle('feature-hidden', localStorage.getItem(cnKey) !== 'true');
    }
    const adetailerWrapper = document.getElementById(`${mode}AdetailerGroup`);
    const adetailerSection = adetailerWrapper ? adetailerWrapper.querySelector('.adetailer-section') : null;
    if (adetailerSection) {
        adetailerSection.classList.toggle('adetailer-section-sdxl-anima', isSdxlAnima);
        adetailerSection.classList.toggle('adetailer-section-other', !isSdxlAnima);
        const adKey = isSdxlAnima ? 'bojroShowAdetailerSdxlAnima' : 'bojroShowAdetailerOther';
        adetailerSection.classList.toggle('feature-hidden', localStorage.getItem(adKey) !== 'true');
    }
}

window.saveSelection = function(key) {
    if (key === 'xl') localStorage.setItem('bojroModel_xl', document.getElementById('xl_modelSelect').value);
    else if (key === 'flux') {
        localStorage.setItem('bojroModel_flux', document.getElementById('flux_modelSelect').value);
        if (typeof applyModulePairing === 'function') applyModulePairing('flux', document.getElementById('flux_modelSelect').value);
    }
    else if (key === 'inp') {
        localStorage.setItem('bojroModel_inp', document.getElementById('inp_modelSelect').value);
        if (typeof updateInpaintNegativePromptVisibility === 'function') updateInpaintNegativePromptVisibility();
        if (typeof updateInpFluxModuleVisibility === 'function') updateInpFluxModuleVisibility('inp');
        if (typeof applyModulePairing === 'function') applyModulePairing('inp', document.getElementById('inp_modelSelect').value);
        if (typeof refreshLowBitsControls === 'function') refreshLowBitsControls();
    }
    else if (key === 'img2img') {
        localStorage.setItem('bojroModel_img2img', document.getElementById('img2img_modelSelect').value);
        if (typeof updateInpaintNegativePromptVisibility === 'function') updateInpaintNegativePromptVisibility();
        if (typeof updateInpFluxModuleVisibility === 'function') updateInpFluxModuleVisibility('img2img');
        if (typeof applyModulePairing === 'function') applyModulePairing('img2img', document.getElementById('img2img_modelSelect').value);
        if (typeof refreshLowBitsControls === 'function') refreshLowBitsControls();
    }
    else if (key === 'img2img_vae') localStorage.setItem('bojro_img2img_vae', document.getElementById('img2img_vae').value);
    else if (key === 'img2img_te') localStorage.setItem('bojro_img2img_te', document.getElementById('img2img_te').value);
    else if (key === 'inp_vae') localStorage.setItem('bojro_inp_vae', document.getElementById('inp_vae').value);
    else if (key === 'inp_te') localStorage.setItem('bojro_inp_te', document.getElementById('inp_te').value);
    // CLIP/T5 fields follow the same save pattern as inp_vae/inp_te (read back by fetchVaes()).
    else if (key === 'inp_clip') localStorage.setItem('bojro_inp_clip', document.getElementById('inp_clip').value);
    else if (key === 'inp_t5') localStorage.setItem('bojro_inp_t5', document.getElementById('inp_t5').value);
    else if (key === 'img2img_clip') localStorage.setItem('bojro_img2img_clip', document.getElementById('img2img_clip').value);
    else if (key === 'img2img_t5') localStorage.setItem('bojro_img2img_t5', document.getElementById('img2img_t5').value);
    else if (key === 'inp_content') localStorage.setItem('bojro_inp_content', document.getElementById('inp_content').value);
    else if (key === 'inp_padding') localStorage.setItem('bojro_inp_padding', document.getElementById('inp_padding').value);
    // Save the mask blur value (restored by the <script> beside inp_mask_blur in index.html).
    else if (key === 'inp_mask_blur') localStorage.setItem('bojro_inp_mask_blur', document.getElementById('inp_mask_blur').value);
    else if (key === 'inp_sampler') localStorage.setItem('bojro_inp_sampler', document.getElementById('inp_sampler').value);
    else if (key === 'qwen') {
        localStorage.setItem('bojroModel_qwen', document.getElementById('qwen_modelSelect').value);
        if (typeof applyModulePairing === 'function') applyModulePairing('qwen', document.getElementById('qwen_modelSelect').value);
    }
    else if (key === 'anima') {
        localStorage.setItem('bojroModel_anima', document.getElementById('anima_modelSelect').value);
        if (typeof applyModulePairing === 'function') applyModulePairing('anima', document.getElementById('anima_modelSelect').value);
    }
    else if (key === 'anima_vae') localStorage.setItem('bojro_anima_vae', document.getElementById('anima_vae').value);
    else if (key === 'anima_te') localStorage.setItem('bojro_anima_te', document.getElementById('anima_te').value);
    else if (key === 'krea') {
        localStorage.setItem('bojroModel_krea', document.getElementById('krea_modelSelect').value);
        if (typeof applyModulePairing === 'function') applyModulePairing('krea', document.getElementById('krea_modelSelect').value);
    }
    else if (key === 'krea_vae') localStorage.setItem('bojro_krea_vae', document.getElementById('krea_vae').value);
    else if (key === 'krea_te') localStorage.setItem('bojro_krea_te', document.getElementById('krea_te').value);
    else if (/^(inp|img2img|xl|flux|qwen|anima|krea)_cn_\d_(module|model)$/.test(key)) localStorage.setItem(`bojro_${key}`, document.getElementById(key).value);
}

// --- PROMPT SAVING SYSTEM ---

// The set of active LoRA names in a prompt, case-insensitive; the same LoRAs in any order or weight count as unchanged.
function extractLoraTags(text) {
    if (!text) return new Set();
    const matches = text.matchAll(/<lora:([^:>]+):[^>]*>/g);
    return new Set(Array.from(matches, m => m[1].toLowerCase()));
}

// Removes duplicate comma-separated tags from a prompt/negative box, keeping the first occurrence and the order (exact match after trimming, as StyleManager's dedupe). Empty entries are dropped but not counted. Returns the number of duplicates removed, or 0 and leaves the field untouched. (LoRA-change unload logic is in runJob(); see lastGeneratedLoraSet, globals.js.)
function removeDuplicateTagsFrom(el) {
    if (!el || !el.value) return 0;
    const tags = el.value.split(',').map(t => t.trim()).filter(Boolean);
    const seen = new Set();
    const deduped = [];
    let removedCount = 0;
    for (const tag of tags) {
        if (seen.has(tag)) {
            removedCount++;
        } else {
            seen.add(tag);
            deduped.push(tag);
        }
    }
    if (removedCount > 0) {
        // join(', ') drops a trailing comma left by a LoRA/style (withTrailingComma(), utils.js), so keep it if the box had one.
        const hadTrailingComma = /,\s*$/.test(el.value);
        el.value = deduped.join(', ') + (hadTrailingComma && deduped.length ? ', ' : '');
    }
    return removedCount;
}

// Tag-style prompt modes only (xl, anima, inp/img2img via 'inp'); flux/qwen/krea are natural-language. img2img shares inp_prompt/inp_neg.
const DEDUPE_TAG_MODES = ['xl', 'anima', 'inp', 'img2img'];
function normalizeDedupeMode(mode) {
    return mode === 'img2img' ? 'inp' : mode;
}

// Tag-style modes whose prompt and negative boxes get a closing comma on blur or Generate (SDXL and Anima); not the natural-language modes or img2img/Inpaint.
const AUTO_COMMA_MODES = ['xl', 'anima'];

// Adds ", " to a box with content that doesn't end in a comma (the ending LoRAs and styles leave, withTrailingComma(), utils.js). An empty box stays empty. Returns true if it changed anything.
function ensureTrailingCommaOn(el) {
    if (!el) return false;
    const trimmed = el.value.replace(/\s+$/, '');
    if (!trimmed || trimmed.endsWith(',')) return false;
    el.value = withTrailingComma(el.value);
    return true;
}

// Wired to each in-scope box's onblur. Generate without leaving the box is handled in generate() via dedupePromptTagsForMode().
window.dedupePromptTagsOnBlur = function(mode, field) {
    if (!DEDUPE_TAG_MODES.includes(mode)) return;
    const realMode = normalizeDedupeMode(mode);
    const el = document.getElementById(`${realMode}_${field}`);
    const removed = removeDuplicateTagsFrom(el);
    const commaAdded = AUTO_COMMA_MODES.includes(realMode) && ensureTrailingCommaOn(el);
    if (removed > 0 || commaAdded) {
        if (field === 'prompt') { savePrompt(realMode); } else { saveNegativePrompt(realMode); }
        if (realMode === 'inp' && typeof saveCurrentInpaintModeStateLive === 'function') saveCurrentInpaintModeStateLive();
    }
    if (removed > 0 && Toast) Toast.show({ text: `Removed ${removed} duplicate prompt${removed === 1 ? '' : 's'}`, duration: 'short' });
}

// Called from generate() before building the job: checks the prompt and negative together and shows a single toast.
window.dedupePromptTagsForMode = function(mode) {
    if (!DEDUPE_TAG_MODES.includes(mode)) return;
    const realMode = normalizeDedupeMode(mode);
    const promptEl = document.getElementById(`${realMode}_prompt`);
    const negEl = document.getElementById(`${realMode}_neg`);
    const removedPrompt = removeDuplicateTagsFrom(promptEl);
    const removedNeg = removeDuplicateTagsFrom(negEl);
    const autoComma = AUTO_COMMA_MODES.includes(realMode);
    const commaPrompt = autoComma && ensureTrailingCommaOn(promptEl);
    const commaNeg = autoComma && ensureTrailingCommaOn(negEl);
    const total = removedPrompt + removedNeg;
    if (removedPrompt > 0 || commaPrompt) savePrompt(realMode);
    if (removedNeg > 0 || commaNeg) saveNegativePrompt(realMode);
    if ((total > 0 || commaPrompt || commaNeg) && realMode === 'inp' && typeof saveCurrentInpaintModeStateLive === 'function') saveCurrentInpaintModeStateLive();
    if (total > 0 && Toast) Toast.show({ text: `Removed ${total} duplicate prompt${total === 1 ? '' : 's'}`, duration: 'short' });
}

window.savePrompt = function(mode) {
    const el = document.getElementById(`${mode}_prompt`);
    if (el) {
        localStorage.setItem(`bojro_prompt_${mode}`, el.value);
    }
    if (window.StyleManager && typeof window.StyleManager.checkAndClearFullyRemovedStyles === 'function') {
        window.StyleManager.checkAndClearFullyRemovedStyles(mode);
    }
}

window.saveNegativePrompt = function(mode) {
    const el = document.getElementById(`${mode}_neg`);
    if (el) {
        localStorage.setItem(`bojro_neg_session_${mode}`, el.value);
    }
    if (window.StyleManager && typeof window.StyleManager.checkAndClearFullyRemovedStyles === 'function') {
        window.StyleManager.checkAndClearFullyRemovedStyles(mode);
    }
}

// Allow the user to save their current text (even if empty) as the new default
window.saveAsNewDefault = function(mode) {
    const el = document.getElementById(`${mode}_prompt`);
    if (el) {
        localStorage.setItem(`bojro_custom_default_${defaultKeyMode(mode)}`, el.value);
        // Toast is always defined now (a plain in-app object).
        Toast.show({ text: 'Saved as new default prompt!', duration: 'short' });
    }
}

// Same idea as saveAsNewDefault, but for the negative prompt box
window.saveNegativeAsNewDefault = function(mode) {
    const el = document.getElementById(`${mode}_neg`);
    if (el) {
        localStorage.setItem(`bojro_custom_default_neg_${defaultKeyMode(mode)}`, el.value);
        Toast.show({ text: 'Saved as new default negative!', duration: 'short' });
    }
}

// Empties the prompt box
window.clearPrompt = function(mode) {
    const el = document.getElementById(`${mode}_prompt`);
    if (el) {
        el.value = "";
        savePrompt(mode); // Save the empty state
    }

    // The prompt text is gone, so clear stale selected-style state for this mode and re-render the Style Manager if open.
    if (window.StyleManager && typeof window.StyleManager.getSelectedStylesForMode === 'function') {
        window.StyleManager.getSelectedStylesForMode(mode).clear();
        if (typeof window.StyleManager.render === 'function') {
            window.StyleManager.render();
        }
    }
}

// Empties the negative prompt box
window.clearNegative = function(mode) {
    const el = document.getElementById(`${mode}_neg`);
    if (el) {
        el.value = "";
        saveNegativePrompt(mode); // Save the empty state
    }
}

// img2img's "import from image metadata" buttons (download icon between each box's reload and trash icons): replace the box's contents with the prompt/negative from the loaded image's PNG metadata (inpSourceMetadata, globals.js; captured when the image enters the editor). Says "No available metadata" per box when there is none (no image, no generation info, or only a prompt or only a negative).
function importFromImageMetadata(mode, field) {
    const meta = inpSourceMetadata;
    const value = meta ? (field === 'prompt' ? meta.pos : meta.neg) : '';
    if (!value) {
        if (typeof Toast !== 'undefined' && Toast) Toast.show({ text: 'No available metadata', duration: 'short' });
        return;
    }

    const el = document.getElementById(field === 'prompt' ? `${mode}_prompt` : `${mode}_neg`);
    if (!el) return;
    el.value = value;
    if (field === 'prompt') {
        savePrompt(mode);
        // As clearPrompt()/insertDefaultPrompt(): clear stale selected-style state (this mode only).
        if (window.StyleManager && typeof window.StyleManager.getSelectedStylesForMode === 'function') {
            window.StyleManager.getSelectedStylesForMode(mode).clear();
            if (typeof window.StyleManager.render === 'function') window.StyleManager.render();
        }
    } else {
        saveNegativePrompt(mode);
    }
    // Programmatic assignment fires no oninput, so update Inpaint/img2img's per-mode snapshot explicitly.
    if (mode === 'inp' && typeof saveCurrentInpaintModeStateLive === 'function') saveCurrentInpaintModeStateLive();
}
window.importPromptFromImageMetadata = function(mode) { importFromImageMetadata(mode, 'prompt'); };
window.importNegativeFromImageMetadata = function(mode) { importFromImageMetadata(mode, 'neg'); };

// Generic clear for a single field by id (ADetailer prompts: 4 passes, each with prompt and negative). Persists via saveAdetailer(mode).
window.clearAdetailerPromptField = function(fieldId, mode) {
    const el = document.getElementById(fieldId);
    if (el) {
        el.value = "";
        saveAdetailer(mode);
    }
}

// Save/Reload Default for a single ADetailer prompt/negative field, independent per field (7 modes x 8 passes x 2 fields), keyed from the field's id.
window.saveAdetailerPromptFieldAsDefault = function(fieldId) {
    const el = document.getElementById(fieldId);
    if (el) {
        localStorage.setItem(`bojro_adetailer_default_${fieldId}`, el.value);
        Toast.show({ text: 'Saved as default', duration: 'short' });
    }
}
window.reloadAdetailerPromptFieldDefault = function(fieldId, mode) {
    const el = document.getElementById(fieldId);
    if (el) {
        const saved = localStorage.getItem(`bojro_adetailer_default_${fieldId}`);
        // No default saved for this field: say so rather than silently doing nothing.
        if (saved === null) {
            Toast.show({ text: 'No default saved for this field yet', duration: 'short' });
            return;
        }
        el.value = saved;
        saveAdetailer(mode);
    }
}

// ad_mask_k_largest treats 0 and unset as "no limit", so typing 0 clears the box back to its "Unlimited" placeholder. Runs on change (not input) so multi-digit entries starting with 0 aren't disturbed.
window.normalizeMaxMasksField = function(el) {
    if (el.value === '0') el.value = '';
}

// Replaces the prompt box with this mode's default (a saved custom default first, as loadSavedPrompts()).
window.insertDefaultPrompt = function(mode) {
    const el = document.getElementById(`${mode}_prompt`);
    if (el) {
        const customDefault = localStorage.getItem(`bojro_custom_default_${defaultKeyMode(mode)}`);
        el.value = customDefault !== null ? customDefault : (DEFAULT_PROMPTS[mode] || "");
        savePrompt(mode);
    }

    // As clearPrompt(): clear stale style selections (this mode only).
    if (window.StyleManager && typeof window.StyleManager.getSelectedStylesForMode === 'function') {
        window.StyleManager.getSelectedStylesForMode(mode).clear();
        if (typeof window.StyleManager.render === 'function') {
            window.StyleManager.render();
        }
    }
}

// Replaces the negative box with this mode's default (custom default first, as insertDefaultPrompt).
window.insertDefaultNegative = function(mode) {
    const el = document.getElementById(`${mode}_neg`);
    if (el) {
        const customNegDefault = localStorage.getItem(`bojro_custom_default_neg_${defaultKeyMode(mode)}`);
        el.value = customNegDefault !== null ? customNegDefault : (DEFAULT_NEGATIVE_PROMPTS[mode] || "");
        saveNegativePrompt(mode);
    }
}

window.loadSavedPrompts = function() {
    ['xl', 'flux', 'qwen', 'anima', 'krea', 'inp'].forEach(mode => {
        // Snapshot the negative textarea's raw HTML value as the mode's default before it is overwritten.
        const negElForDefault = document.getElementById(`${mode}_neg`);
        if (negElForDefault) DEFAULT_NEGATIVE_PROMPTS[mode] = negElForDefault.value;

        const saved = localStorage.getItem(`bojro_prompt_${mode}`);
        const el = document.getElementById(`${mode}_prompt`);
        
        if (el) {
            if (saved) {
                // Non-empty session value - load it, whatever it is
                el.value = saved;
            } else {
                // Empty falls back to the custom default, then the hardcoded default.
                const customDefault = localStorage.getItem(`bojro_custom_default_${defaultKeyMode(mode)}`);
                el.value = customDefault !== null ? customDefault : (DEFAULT_PROMPTS[mode] || "");
            }
        }

        // Negative prompt: same rule as the main prompt (session value, then saved custom default, then HTML default).
        const negEl = document.getElementById(`${mode}_neg`);
        if (negEl) {
            const sessionNeg = localStorage.getItem(`bojro_neg_session_${mode}`);
            if (sessionNeg) {
                negEl.value = sessionNeg;
            } else {
                const customNegDefault = localStorage.getItem(`bojro_custom_default_neg_${defaultKeyMode(mode)}`);
                if (customNegDefault !== null) negEl.value = customNegDefault;
            }
        }
    });
    window.initHr();
    window.initAdetailer();
    window.initNeverOom();
    window.initGlobalUiState();
}

window.saveTrident = function() {
    ['flux_vae', 'flux_clip', 'flux_t5'].forEach(id => localStorage.setItem('bojro_' + id, document.getElementById(id).value));
}

// Aspect ratio chip orientation (3:2 vs 2:3) comes from the mode's width/height: portrait means all chips portrait, landscape means all landscape. Derived every time this runs (boot, mode switch, preset tap, flip), so it can't drift. Square dimensions fall back to the last stored orientation, so Flip on a square size and a restart keep it.
function resChipOrientationKey(mode) { return `bojroResChipOrientation_${mode}`; }

function getResChipOrientation(grid) {
    for (const btn of grid.querySelectorAll('.res-switch[data-w]')) {
        const w = parseInt(btn.dataset.w, 10);
        const h = parseInt(btn.dataset.h, 10);
        if (w !== h) return h > w ? 'portrait' : 'landscape';
    }
    return 'landscape';
}

// Swaps one chip's own data-w/data-h, tap handler and label ("3:2" <-> "2:3").
function flipResChip(btn, mode) {
    const newW = btn.dataset.h;
    const newH = btn.dataset.w;
    btn.dataset.w = newW;
    btn.dataset.h = newH;
    btn.setAttribute('onclick', `setRes('${mode}', ${newW}, ${newH})`);
    btn.textContent = btn.textContent.split(':').reverse().join(':');
}

function syncResChipOrientation(mode) {
    const widthEl = document.getElementById(`${mode}_width`);
    const heightEl = document.getElementById(`${mode}_height`);
    const grid = document.getElementById(`resGrid-${mode}`);
    if (!widthEl || !heightEl || !grid) return;
    const w = parseInt(widthEl.value, 10);
    const h = parseInt(heightEl.value, 10);
    const key = resChipOrientationKey(mode);

    let want;
    if (Number.isFinite(w) && Number.isFinite(h) && w !== h) {
        want = h > w ? 'portrait' : 'landscape';
    } else {
        want = localStorage.getItem(key) === 'portrait' ? 'portrait' : 'landscape';
    }

    grid.querySelectorAll('.res-switch[data-w]').forEach(btn => {
        const btnW = parseInt(btn.dataset.w, 10);
        const btnH = parseInt(btn.dataset.h, 10);
        if (btnW === btnH) return; // 1:1 chips read the same either way
        if ((btnH > btnW ? 'portrait' : 'landscape') !== want) flipResChip(btn, mode);
    });
    try { localStorage.setItem(key, want); } catch (e) { /* storage unavailable - orientation just won't persist */ }
}

// Highlights the res-switch preset matching the mode's width/height. WP depends on the screen (computeWallpaperRes()). Flip has no single target.
window.updateResSwitchHighlight = function(mode) {
    const widthEl = document.getElementById(`${mode}_width`);
    const heightEl = document.getElementById(`${mode}_height`);
    const grid = document.getElementById(`resGrid-${mode}`);
    if (!widthEl || !heightEl || !grid) return;
    // Orientation first, so chips match the current dimensions before comparing.
    syncResChipOrientation(mode);
    const w = parseInt(widthEl.value, 10);
    const h = parseInt(heightEl.value, 10);
    grid.querySelectorAll('.res-switch[data-w]').forEach(btn => {
        const btnW = parseInt(btn.dataset.w, 10);
        const btnH = parseInt(btn.dataset.h, 10);
        btn.classList.toggle('active-ratio', btnW === w && btnH === h);
    });
    const wpMatch = computeWallpaperRes();
    grid.querySelectorAll('.res-switch[data-wp]').forEach(btn => {
        btn.classList.toggle('active-ratio', wpMatch.w === w && wpMatch.h === h);
    });
}

// The "WP" (Wallpaper) preset calculation, factored out of setWallpaperRes() so updateResSwitchHighlight() can check against it.
function computeWallpaperRes() {
    const ratio = window.screen.width / window.screen.height;
    const landscapeRatio = Math.max(ratio, 1 / ratio);

    const targetArea = 1024 * 1024;
    let w = Math.sqrt(targetArea * landscapeRatio);
    let h = Math.sqrt(targetArea / landscapeRatio);

    w = Math.max(8, Math.round(w / 8) * 8);
    h = Math.max(8, Math.round(h / 8) * 8);

    return { w: h, h: w }; // swapped: w/h above are landscape; portrait (what tapping WP actually sets) is the reverse
}

window.setRes = (mode, w, h) => {
    document.getElementById(`${mode}_width`).value = w;
    document.getElementById(`${mode}_height`).value = h;
    updateResSwitchHighlight(mode);
    // Direct .value assignment fires no input event, so save explicitly so a tapped preset persists.
    if (typeof saveLiveGenParams === 'function') saveLiveGenParams(mode);
}
window.flipRes = (mode) => {
    const w = document.getElementById(`${mode}_width`);
    const h = document.getElementById(`${mode}_height`);
    const t = w.value;
    w.value = h.value;
    h.value = t;

    // Also flips each fixed-ratio preset's label and data-w/data-h ("3:2" becomes "2:3"). The [data-w] selector excludes WP, which loses its highlight.
    const grid = document.getElementById(`resGrid-${mode}`);
    if (grid) {
        grid.querySelectorAll('.res-switch[data-w]').forEach(btn => flipResChip(btn, mode));
        // Recorded here so a flip on a square size is remembered.
        try { localStorage.setItem(resChipOrientationKey(mode), getResChipOrientation(grid)); } catch (e) {}
    }

    updateResSwitchHighlight(mode);
    // As setRes(): save explicitly, since a flip fires no input event.
    if (typeof saveLiveGenParams === 'function') saveLiveGenParams(mode);
}

// "WP" (Wallpaper) preset: detects the device's screen aspect ratio and outputs portrait dimensions by default; the flip (⇄) button gives landscape.
window.setWallpaperRes = function(mode) {
    const res = computeWallpaperRes();
    window.setRes(mode, res.w, res.h);
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
        <div class="modal-content" style="max-height: 85vh; overflow-y: auto;">
            <div class="modal-header">
                <h3 id="cfgLoraTitle" onclick="enterLoraNameEditMode()" style="max-width:70%; cursor:text; font-size:16px; text-transform:none;" title="Tap to rename">Config</h3>
                <input type="text" id="cfgLoraTitleEdit" class="hidden" onblur="commitLoraNameEdit()" onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}" style="flex:1; margin: 0 8px; font-size:16px; font-weight:700;">
                <div class="row" style="width:auto; gap:8px; flex-shrink:0;">
                    <button id="cfgResetNameBtn" class="btn-icon hidden" style="width:28px; height:28px;" onclick="resetLoraOverrides()" title="Reset name, weight, and trigger text to defaults">
                        <i data-lucide="rotate-ccw" width="14" height="14"></i>
                    </button>
                    <button class="close-btn" onclick="closeConfigModal()">×</button>
                </div>
            </div>
            <div class="col" style="gap: 15px; padding: 10px 0;">
                <div>
                    <label style="display:flex; justify-content:space-between;">
                        <span>Preferred Weight</span>
                        <span id="cfgWeightDisplay" style="color:var(--accent-primary);">1.0</span>
                    </label>
                    <div class="slider-fake-thumb-wrap" style="margin-top:5px;"><input type="range" id="cfgWeight" class="orange-slider thumb-only-slider" min="-2" max="2" step="0.05" value="1" oninput="updateWeightDisplay(this.value)"><div class="slider-fake-thumb" data-for="cfgWeight"></div></div>
                </div>
                <div>
                    <label>Activation / Trigger Text</label>
                    <textarea id="cfgTrigger" rows="3" placeholder="trigger, words, here" style="margin-top:5px;"></textarea>
                </div>
                <div class="row" style="justify-content:space-between; align-items:center;">
                    <label for="cfgLoraLink" style="margin:0;">Link to ADetailer</label>
                    <input type="checkbox" id="cfgLoraLink" class="bojro-switch" checked>
                </div>
                <div style="border-top: 1px solid var(--border-color); padding-top: 10px;">
                    <div class="row" onclick="toggleGeneric('grp-lora-overrides', 'arr-lora-overrides', 'bojro_vis_lora_overrides')" style="justify-content:space-between; align-items:center; cursor:pointer;">
                        <label style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; cursor:pointer; margin:0;">Overrides</label>
                        <i id="arr-lora-overrides" data-lucide="chevron-down" width="14" height="14" style="transition: transform 0.2s;"></i>
                    </div>
                    <div id="grp-lora-overrides">
                    <div class="row" style="margin-top:8px;">
                        <div class="col"><label>Sampler</label><div class="row"><select id="cfgLoraOverrideSampler" style="display:none;"><option value="">Not Set</option></select><button type="button" class="model-picker-trigger hidden" data-target="cfgLoraOverrideSampler" data-kind="sampler" data-pin-first="" data-modal-title="Select Sampler" onclick="openModelPicker(this)"><span class="model-picker-trigger-primary"></span><span class="model-picker-trigger-subtitle hidden"></span></button></div></div>
                        <div class="col"><label>Schedule</label><div class="row"><select id="cfgLoraOverrideScheduler" style="display:none;"><option value="">Not Set</option></select><button type="button" class="model-picker-trigger hidden" data-target="cfgLoraOverrideScheduler" data-kind="schedule" data-pin-first="" data-modal-title="Select Schedule" onclick="openModelPicker(this)"><span class="model-picker-trigger-primary"></span><span class="model-picker-trigger-subtitle hidden"></span></button></div></div>
                    </div>
                    <div class="row" style="margin-top: 10px;">
                        <div class="col"><label>Steps</label><input type="number" id="cfgLoraOverrideSteps" placeholder="Default"></div>
                        <div class="col"><label>CFG</label><input type="number" id="cfgLoraOverrideCfg" placeholder="Default" step="0.5"></div>
                    </div>
                    <div style="margin-top: 10px;">
                        <label for="cfgLoraAdditionalNegative">Additional Negative Prompts</label>
                        <textarea id="cfgLoraAdditionalNegative" rows="2" placeholder="bad hands, extra fingers" style="margin-top:5px;"></textarea>
                    </div>
                    </div>
                </div>
                <button id="cfgSaveBtn" class="btn-small" style="background: var(--accent-gradient); color: white; margin-top:10px;">SAVE CONFIG</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
    // Preferred Weight is a thumb-only slider like the Inpaint ones (editor.js), in 0.05 steps. Wired here because the modal is built on demand, after editor.js ran its init.
    if (typeof initThumbOnlySlider === 'function') initThumbOnlySlider('cfgWeight');
    // Overrides starts collapsed and remembers its state like other collapsible sections. Done in JS because inline <script> doesn't run for innerHTML markup.
    if (typeof window.initGenericSectionClosed === 'function') {
        window.initGenericSectionClosed('grp-lora-overrides', 'arr-lora-overrides', 'bojro_vis_lora_overrides');
    }
    // This modal is created after boot's lucide.createIcons() pass, so create its icons explicitly.
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Populates the OVERRIDE selects (Sampler/Schedule) by copying the options loaded into the XL tab's selects (the live lists from fetchSamplers()/fetchSchedulers(), network.js) each time the modal opens. The select is hidden and only holds options and the value for openModelPicker(); the visible control is the paired model-picker-trigger (a native select popup can't be styled).
function populateLoraOverrideSelectors() {
    const copyOptions = (sourceId, targetId) => {
        const source = document.getElementById(sourceId);
        const target = document.getElementById(targetId);
        if (!source || !target) return;
        const current = target.value;
        target.innerHTML = '<option value="">Not Set</option>';
        Array.from(source.options).forEach(opt => {
            target.appendChild(new Option(opt.value, opt.value));
        });
        // Restore the previous selection if it still exists in the fresh list.
        if (current && Array.from(target.options).some(o => o.value === current)) {
            target.value = current;
        }
    };
    copyOptions('xl_sampler', 'cfgLoraOverrideSampler');
    copyOptions('xl_scheduler', 'cfgLoraOverrideScheduler');
}

window.openLoraSettings = async (e, loraName, loraPath) => {
    e.stopPropagation();
    const modal = document.getElementById('loraConfigModal');
    modal.classList.remove('hidden');
    // Lock body scroll while this modal's text fields have the keyboard up (as other picker modals).
    if (typeof lockBodyScroll === 'function') lockBodyScroll();

    // Always reset to display mode (not mid-edit) when opening for any LoRA
    window.currentConfigLoraName = loraName;
    window.currentConfigLoraPath = loraPath;
    const titleEl = document.getElementById('cfgLoraTitle');
    const editEl = document.getElementById('cfgLoraTitleEdit');
    titleEl.classList.remove('hidden');
    editEl.classList.add('hidden');

    titleEl.innerText = "Loading...";

    let cfg = loraConfigs[loraName];
    if (!cfg) cfg = await loadSidecarConfig(loraName, loraPath);

    const displayName = window.LoraManager ? window.LoraManager.getDisplayName({ name: loraName }) : loraName;
    titleEl.innerText = displayName;
    updateLoraResetBtnVisibility(loraName);
    document.getElementById('cfgWeight').value = cfg.weight;
    document.getElementById('cfgWeightDisplay').innerText = cfg.weight;
    if (typeof syncThumbOnlySliderPosition === 'function') syncThumbOnlySliderPosition('cfgWeight');
    document.getElementById('cfgTrigger').value = cfg.trigger;
    document.getElementById('cfgLoraLink').checked = window.LoraManager ? window.LoraManager.isLoraLinkEnabled(loraName) : true;
    populateLoraOverrideSelectors();
    document.getElementById('cfgLoraOverrideSampler').value = cfg.overrideSampler || '';
    document.getElementById('cfgLoraOverrideScheduler').value = cfg.overrideScheduler || '';
    document.getElementById('cfgLoraOverrideSteps').value = cfg.overrideSteps || '';
    document.getElementById('cfgLoraOverrideCfg').value = cfg.overrideCfg || '';
    document.getElementById('cfgLoraAdditionalNegative').value = cfg.additionalNegative || '';
    // The selects are hidden (see populateLoraOverrideSelectors), so refresh the visible trigger button's text after setting .value.
    if (typeof updateModelPickerTriggerText === 'function') {
        updateModelPickerTriggerText('cfgLoraOverrideSampler');
        updateModelPickerTriggerText('cfgLoraOverrideScheduler');
    }

    document.getElementById('cfgSaveBtn').onclick = () => {
        // SAVE CONFIG also commits a mid-rename (commitLoraNameEdit() is a no-op if the name box isn't open).
        commitLoraNameEdit({ silent: true });

        const newWeight = document.getElementById('cfgWeight').value;
        const newTrigger = document.getElementById('cfgTrigger').value;
        const linkEnabled = document.getElementById('cfgLoraLink').checked;
        const overrideSampler = document.getElementById('cfgLoraOverrideSampler').value;
        const overrideScheduler = document.getElementById('cfgLoraOverrideScheduler').value;
        const overrideSteps = document.getElementById('cfgLoraOverrideSteps').value;
        const overrideCfg = document.getElementById('cfgLoraOverrideCfg').value;
        const additionalNegative = document.getElementById('cfgLoraAdditionalNegative').value.trim();
        if (window.LoraManager) window.LoraManager.setLoraLinkEnabled(loraName, linkEnabled);
        loraConfigs[loraName] = {
            weight: parseFloat(newWeight),
            trigger: newTrigger,
            // Marks this entry as an in-app override, so LoraManager.refresh() re-fetches stale sidecar data but never discards a user-edited weight/trigger.
            userEdited: true,
            // Sampler/Schedule/Steps/CFG this LoRA applies to the current tab when added (window.Neo.appInjectConfig, boot.js). Empty means no opinion; each is applied only if non-empty.
            overrideSampler,
            overrideScheduler,
            overrideSteps,
            overrideCfg,
            // Tags appended to the Negative box when this LoRA is added and removed when toggled off (LoraManager.applyAdditionalNegative()/removeAdditionalNegative(), lora.js). The object is rebuilt on every save, so it must be listed here.
            additionalNegative
        };
        localStorage.setItem('bojroLoraConfigs', JSON.stringify(loraConfigs));
        modal.classList.add('hidden');
        // Closes through closeConfigModal(), which calls unlockBodyScroll() to match lockBodyScroll() on open.
        if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
        if (Toast) Toast.show({
            text: 'Saved',
            duration: 'short'
        });
    };
}

// Show the reset button whenever any override exists (display rename, or saved weight/trigger), since resetLoraOverrides() clears both.
function updateLoraResetBtnVisibility(loraName) {
    const resetBtn = document.getElementById('cfgResetNameBtn');
    if (!resetBtn) return;
    const hasNameOverride = !!(window.LoraManager && window.LoraManager.userRenames.hasOwnProperty(loraName));
    const hasConfigOverride = !!(loraConfigs[loraName] && loraConfigs[loraName].userEdited);
    resetBtn.classList.toggle('hidden', !(hasNameOverride || hasConfigOverride));
}

// Tapping the name opens it for editing (no separate pencil button).
window.enterLoraNameEditMode = function() {
    const titleEl = document.getElementById('cfgLoraTitle');
    const editEl = document.getElementById('cfgLoraTitleEdit');
    const loraName = window.currentConfigLoraName;
    if (!loraName) return;
    // innerText respects CSS text-transform (the title is uppercase), so read the real display name from LoraManager.
    editEl.value = window.LoraManager ? window.LoraManager.getDisplayName({ name: loraName }) : titleEl.innerText;
    titleEl.classList.add('hidden');
    editEl.classList.remove('hidden');
    editEl.focus();
    editEl.select();
}

// Tapping away from the name box saves the rename (also done by SAVE CONFIG); a no-op if the box isn't open. options.silent skips the "Name saved" toast for the SAVE CONFIG path.
window.commitLoraNameEdit = function(options = {}) {
    const titleEl = document.getElementById('cfgLoraTitle');
    const editEl = document.getElementById('cfgLoraTitleEdit');
    const loraName = window.currentConfigLoraName;
    if (!loraName || editEl.classList.contains('hidden')) return;

    if (window.LoraManager) window.LoraManager.saveUserRename(loraName, editEl.value);
    const newDisplayName = window.LoraManager ? window.LoraManager.getDisplayName({ name: loraName }) : editEl.value;
    titleEl.innerText = newDisplayName;

    // Update the visible list row too, if it's currently rendered
    if (window.LoraManager) {
        const nameId = `name-${window.LoraManager.simpleHash(loraName)}`;
        const nameEl = document.getElementById(nameId);
        if (nameEl) nameEl.textContent = newDisplayName;
    }

    titleEl.classList.remove('hidden');
    editEl.classList.add('hidden');
    updateLoraResetBtnVisibility(loraName);
    if (!options.silent && Toast) Toast.show({ text: 'Name saved', duration: 'short' });
}

// Discards an uncommitted name edit (shared by resetLoraOverrides() and the hardware back button) without saving it.
window.discardLoraNameEditIfOpen = function() {
    const titleEl = document.getElementById('cfgLoraTitle');
    const editEl = document.getElementById('cfgLoraTitleEdit');
    if (editEl && titleEl && !editEl.classList.contains('hidden')) {
        editEl.classList.add('hidden');
        titleEl.classList.remove('hidden');
    }
}

// Resets a LoRA to defaults: display name, weight and trigger text.
window.resetLoraOverrides = async function() {
    const loraName = window.currentConfigLoraName;
    const loraPath = window.currentConfigLoraPath;
    if (!loraName || !window.LoraManager) return;

    // Discard an uncommitted name edit so the next blur doesn't commit it as a rename.
    const titleEl = document.getElementById('cfgLoraTitle');
    window.discardLoraNameEditIfOpen();

    window.LoraManager.saveUserRename(loraName, ''); // empty clears the override

    // Clear this before loadSidecarConfig(), which returns the cached entry if one exists.
    delete loraConfigs[loraName];
    localStorage.setItem('bojroLoraConfigs', JSON.stringify(loraConfigs));

    const revertedName = window.LoraManager.getDisplayName({ name: loraName });
    titleEl.innerText = revertedName;

    const nameId = `name-${window.LoraManager.simpleHash(loraName)}`;
    const nameEl = document.getElementById(nameId);
    if (nameEl) nameEl.textContent = revertedName;

    // Re-fetch from the sidecar now that the override is gone, and update the open modal.
    const freshCfg = await loadSidecarConfig(loraName, loraPath);
    document.getElementById('cfgWeight').value = freshCfg.weight;
    document.getElementById('cfgWeightDisplay').innerText = freshCfg.weight;
    if (typeof syncThumbOnlySliderPosition === 'function') syncThumbOnlySliderPosition('cfgWeight');
    document.getElementById('cfgTrigger').value = freshCfg.trigger;
    document.getElementById('cfgLoraOverrideSampler').value = '';
    document.getElementById('cfgLoraOverrideScheduler').value = '';
    document.getElementById('cfgLoraOverrideSteps').value = '';
    document.getElementById('cfgLoraOverrideCfg').value = '';
    document.getElementById('cfgLoraAdditionalNegative').value = '';
    if (typeof updateModelPickerTriggerText === 'function') {
        updateModelPickerTriggerText('cfgLoraOverrideSampler');
        updateModelPickerTriggerText('cfgLoraOverrideScheduler');
    }

    updateLoraResetBtnVisibility(loraName);
    if (Toast) Toast.show({ text: 'Reset to defaults', duration: 'short' });
}

// Closing the editor (X or hardware back via boot.js) discards a mid-rename, as resetLoraOverrides().
window.closeConfigModal = () => {
    window.discardLoraNameEditIfOpen();
    document.getElementById('loraConfigModal').classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
}
window.updateWeightDisplay = (val) => document.getElementById('cfgWeightDisplay').innerText = val;


// --- LLM MODALS ---

window.openLlmModal = (mode) => {
    activeLlmMode = mode;
    const llmModalEl = document.getElementById('llmModal');
    // Locks the page behind the window, once per open.
    if (llmModalEl.classList.contains('hidden') && typeof lockBodyScroll === 'function') lockBodyScroll();
    llmModalEl.classList.remove('hidden');
    
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
    else if (activeLlmMode === 'anima') savedSys = llmSettings.system_anima;
    else if (activeLlmMode === 'krea') savedSys = llmSettings.system_krea;
    document.getElementById('llmSystemPrompt').value = savedSys || "";
    
    updateLlmButtonState();
    if (!inputEl.value) inputEl.focus();
    
    if (typeof lucide !== 'undefined') lucide.createIcons();

    const modelSelect = document.getElementById('llmModelSelect');
    if ((!modelSelect || !modelSelect.value) && typeof connectToLlmService === 'function') {
        connectToLlmService();
    }
}

window.closeLlmModal = () => {
    const llmModalEl = document.getElementById('llmModal');
    if (!llmModalEl.classList.contains('hidden') && typeof unlockBodyScroll === 'function') unlockBodyScroll();
    llmModalEl.classList.add('hidden');
};
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

window.resetLlmHistory = async function() {
    if (await window.appConfirm("Reset current chat history? All previous context for this mode will be deleted.", { title: 'Reset Chat History', okText: 'RESET', danger: true })) {
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
                sel.innerHTML = `<option value="${escapeHtmlAttr(llmSettings.model)}">${escapeHtmlAttr(llmSettings.model)}</option>`;
                sel.value = llmSettings.model;
            }
        }
    }
}

window.useLlmPrompt = async function() {
    const result = document.getElementById('llmOutput').value;
    if (!result) {
        await window.appAlert("Generate a prompt first!");
        return;
    }

    let targetId;
    if (activeLlmMode === 'xl') targetId = 'xl_prompt';
    else if (activeLlmMode === 'flux') targetId = 'flux_prompt';
    else if (activeLlmMode === 'qwen') targetId = 'qwen_prompt';
    else if (activeLlmMode === 'anima') targetId = 'anima_prompt';
    else if (activeLlmMode === 'krea') targetId = 'krea_prompt';

    const targetEl = document.getElementById(targetId);
    if(targetEl) {
        targetEl.value = result;
        if (typeof savePrompt === 'function') savePrompt(activeLlmMode);
        closeLlmModal();
        if (Toast) Toast.show({
            text: 'Applied to main prompt!',
            duration: 'short'
        });
    }
}

// --- HIGH-RES FIX LOGIC ---

window.saveHr = function(mode) {
    localStorage.setItem(`bojro_${mode}_hr_enable`, document.getElementById(`${mode}_hr_enable`).checked);
    localStorage.setItem(`bojro_${mode}_hr_upscaler`, document.getElementById(`${mode}_hr_upscaler`).value);
    localStorage.setItem(`bojro_${mode}_hr_steps`, document.getElementById(`${mode}_hr_steps`).value);
    localStorage.setItem(`bojro_${mode}_hr_denoise`, document.getElementById(`${mode}_hr_denoise`).value);
    localStorage.setItem(`bojro_${mode}_hr_scale`, document.getElementById(`${mode}_hr_scale`).value);
    localStorage.setItem(`bojro_${mode}_hr_cfg`, document.getElementById(`${mode}_hr_cfg`).value);
}

// --- ADETAILER (SDXL, Inpaint, img2img) ---
// Switches which ADetailer pass's fields are shown (pass chip 1-4). Each pass's enable checkbox (inside the chip) is independent of the one being viewed.
window.selectAdetailerPass = function(mode, passNum) {
    for (let i = 1; i <= 8; i++) {
        const chip = document.getElementById(`${mode}-adetailer-pass-chip-${i}`);
        const fields = document.getElementById(`${mode}_adetailer_${i}_fields`);
        if (chip) chip.classList.toggle('active', i === passNum);
        if (fields) fields.classList.toggle('hidden', i !== passNum);
    }
}

// MASK FILTER METHOD (Forge's ad_mask_filter_method: "Area" or "Confidence", which masks MAX MASKS keeps): an AREA/CONFIDENCE toggle above Inpaint Only Masked, styled like the WHOLE/MASKED buttons (setInpaintMode(), editor.js) but per pass and mode, so generic by id (as saveAdetailerPromptFieldAsDefault()). Backed by a hidden <select> like mask_merge, so the generic field loop in saveAdetailer()/initAdetailer() handles it (via 'filter_method' in that list).
window.syncAdetailerFilterMethodButtons = function(mode, n) {
    const select = document.getElementById(`${mode}_adetailer_${n}_filter_method`);
    const value = select ? select.value : 'Area';
    const areaBtn = document.getElementById(`${mode}_adetailer_${n}_filter_area`);
    const confBtn = document.getElementById(`${mode}_adetailer_${n}_filter_confidence`);
    if (areaBtn) areaBtn.classList.toggle('active', value === 'Area');
    if (confBtn) confBtn.classList.toggle('active', value === 'Confidence');
}
window.setAdetailerFilterMethod = function(mode, n, value) {
    const select = document.getElementById(`${mode}_adetailer_${n}_filter_method`);
    if (select) select.value = value;
    syncAdetailerFilterMethodButtons(mode, n);
    saveAdetailer(mode);
}

window.saveAdetailer = function(mode) {
    let anyEnabled = false;
    for (let n = 1; n <= 8; n++) {
        const enableEl = document.getElementById(`${mode}_adetailer_${n}_enable`);
        if (enableEl) {
            localStorage.setItem(`bojro_${mode}_adetailer_${n}_enable`, enableEl.checked);
            if (enableEl.checked) anyEnabled = true;
        }
        // Checkbox: needs .checked, saved separately from the generic loop.
        const inpaintOnlyMaskedEl = document.getElementById(`${mode}_adetailer_${n}_inpaint_only_masked`);
        if (inpaintOnlyMaskedEl) localStorage.setItem(`bojro_${mode}_adetailer_${n}_inpaint_only_masked`, inpaintOnlyMaskedEl.checked);
        const loraLinkEl = document.getElementById(`${mode}_adetailer_${n}_lora_link`);
        if (loraLinkEl) localStorage.setItem(`bojro_${mode}_adetailer_${n}_lora_link`, loraLinkEl.checked);
        ['model', 'confidence', 'denoise', 'mask_blur', 'padding', 'prompt', 'neg', 'max_masks', 'mask_merge', 'filter_method', 'cn_model', 'cn_module', 'cn_weight', 'cn_guidance_start', 'cn_guidance_end'].forEach(field => {
            const el = document.getElementById(`${mode}_adetailer_${n}_${field}`);
            if (el) localStorage.setItem(`bojro_${mode}_adetailer_${n}_${field}`, el.value);
        });
    }
    // Keep the master switch in step when any pass is toggled directly.
    const masterEl = document.getElementById(`${mode}_adetailer_master`);
    if (masterEl) masterEl.checked = anyEnabled;
}

// --- NEVER OOM (Forge's built-in tiled-VAE / UNet-offload script) ---
window.saveNeverOom = function(mode) {
    const vaeEl = document.getElementById(`${mode}_neveroom_vae`);
    const unetEl = document.getElementById(`${mode}_neveroom_unet`);
    localStorage.setItem(`bojro_neveroom_vae_${mode}`, vaeEl ? vaeEl.checked : false);
    localStorage.setItem(`bojro_neveroom_unet_${mode}`, unetEl ? unetEl.checked : false);
}

window.initNeverOom = function() {
    ['xl', 'flux', 'qwen', 'anima', 'krea', 'inp', 'img2img'].forEach(mode => {
        const vaeEl = document.getElementById(`${mode}_neveroom_vae`);
        const unetEl = document.getElementById(`${mode}_neveroom_unet`);
        if (vaeEl) vaeEl.checked = localStorage.getItem(`bojro_neveroom_vae_${mode}`) === 'true';
        if (unetEl) unetEl.checked = localStorage.getItem(`bojro_neveroom_unet_${mode}`) === 'true';
    });
}

window.initAdetailer = function() {
    const defaultModelPerPass = { 1: 'face_yolov8n.pt', 2: 'hand_yolov8n.pt', 3: 'person_yolov8n-seg.pt', 4: 'face_yolov8n.pt', 5: 'face_yolov8n.pt', 6: 'hand_yolov8n.pt', 7: 'person_yolov8n-seg.pt', 8: 'face_yolov8n.pt' };
    ['xl', 'img2img', 'inp', 'qwen', 'flux', 'anima', 'krea'].forEach(mode => {
        let anyEnabled = false;
        for (let n = 1; n <= 8; n++) {
            const sEnable = localStorage.getItem(`bojro_${mode}_adetailer_${n}_enable`);
            const elEnable = document.getElementById(`${mode}_adetailer_${n}_enable`);
            const isEnabled = (sEnable === 'true');
            if (elEnable) elEnable.checked = isEnabled;
            if (isEnabled) anyEnabled = true;

            // Checkbox, restored separately from loadVal(). Defaults to checked, matching the previous hardcoded ad_inpaint_only_masked.
            const inpaintOnlyMaskedEl = document.getElementById(`${mode}_adetailer_${n}_inpaint_only_masked`);
            if (inpaintOnlyMaskedEl) {
                const sInpaintOnlyMasked = localStorage.getItem(`bojro_${mode}_adetailer_${n}_inpaint_only_masked`);
                inpaintOnlyMaskedEl.checked = sInpaintOnlyMasked !== null ? (sInpaintOnlyMasked === 'true') : true;
            }

            // LoRA Link is new and opt-in, so it defaults to unchecked.
            const loraLinkEl = document.getElementById(`${mode}_adetailer_${n}_lora_link`);
            if (loraLinkEl) {
                loraLinkEl.checked = localStorage.getItem(`bojro_${mode}_adetailer_${n}_lora_link`) === 'true';
            }

            const loadVal = (field, def) => {
                const el = document.getElementById(`${mode}_adetailer_${n}_${field}`);
                const saved = localStorage.getItem(`bojro_${mode}_adetailer_${n}_${field}`);
                if (el) el.value = saved !== null ? saved : def;
            };
            loadVal('model', defaultModelPerPass[n]);
            loadVal('confidence', 0.3);
            loadVal('denoise', 0.4);
            loadVal('mask_blur', 4);
            loadVal('padding', 32);
            loadVal('prompt', '');
            loadVal('neg', '');
            loadVal('max_masks', '');
            loadVal('mask_merge', 'None');
            loadVal('filter_method', 'Area');
            syncAdetailerFilterMethodButtons(mode, n);
            // The model list is populated by populateAdetailerControlNetModels() (network.js); this restores only weight/guidance.
            loadVal('cn_weight', 1.0);
            loadVal('cn_guidance_start', 0.0);
            loadVal('cn_guidance_end', 1.0);
        }

        // Master switch reflects whether any pass is enabled; it has no stored value of its own.
        const masterEl = document.getElementById(`${mode}_adetailer_master`);
        if (masterEl) masterEl.checked = anyEnabled;

        initGenericSectionClosed(`grp-${mode}-adetailer`, `arr-${mode}-adetailer`, `bojro_vis_${mode}_adetailer`);
        for (let n = 1; n <= 8; n++) {
            initGenericSectionClosed(`grp-${mode}-adetailer-${n}-more`, `arr-${mode}-adetailer-${n}-more`, `bojro_vis_${mode}_adetailer_${n}_more`);
        }
    });
}

// Master ADetailer switch: off disables every pass but remembers which were on; on restores those (first use: pass 1 only).
window.toggleAdetailerMaster = function(mode, isOn) {
    if (isOn) {
        const remembered = localStorage.getItem(`bojro_${mode}_adetailer_remembered_enables`);
        const enables = remembered ? JSON.parse(remembered) : [true, false, false, false, false, false, false, false];
        for (let n = 1; n <= 8; n++) {
            const el = document.getElementById(`${mode}_adetailer_${n}_enable`);
            if (el) el.checked = !!enables[n - 1];
        }
    } else {
        const current = [];
        for (let n = 1; n <= 8; n++) {
            const el = document.getElementById(`${mode}_adetailer_${n}_enable`);
            current.push(el ? el.checked : false);
        }
        // Only remember a non-empty state, so turning every pass off then the master off doesn't overwrite a remembered set.
        if (current.some(v => v)) {
            localStorage.setItem(`bojro_${mode}_adetailer_remembered_enables`, JSON.stringify(current));
        }
        for (let n = 1; n <= 8; n++) {
            const el = document.getElementById(`${mode}_adetailer_${n}_enable`);
            if (el) el.checked = false;
        }
    }
    saveAdetailer(mode);
}

window.initHr = function() {
    ['xl', 'flux', 'qwen', 'anima', 'krea'].forEach(mode => {
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

window.initGlobalUiState = function() {
    loadSavedTheme(); 
    
    // Main Gen Tab Sections
    initGenericSection('grp-models', 'arr-models', 'bojro_vis_models');
    initGenericSection('grp-xl', 'arr-xl', 'bojro_vis_xl');
    initGenericSection('grp-flux', 'arr-flux', 'bojro_vis_flux');
    initGenericSection('grp-qwen', 'arr-qwen', 'bojro_vis_qwen');
    initGenericSection('grp-flux-trident', 'arr-flux-trident', 'bojro_vis_flux_trident');
    initGenericSection('grp-qwen-modules', 'arr-qwen-modules', 'bojro_vis_qwen_modules');
    initGenericSection('grp-anima-modules', 'arr-anima-modules', 'bojro_vis_anima_modules');
    initGenericSection('grp-krea-modules', 'arr-krea-modules', 'bojro_vis_krea_modules');
    initGenericSection('fbc-settings-content', 'fbc-arrow', 'bojro_vis_fbc');
    initGenericSectionClosed('grp-xl-neveroom', 'arr-xl-neveroom', 'bojro_vis_xl_neveroom');
    initGenericSectionClosed('grp-flux-neveroom', 'arr-flux-neveroom', 'bojro_vis_flux_neveroom');
    initGenericSectionClosed('grp-qwen-neveroom', 'arr-qwen-neveroom', 'bojro_vis_qwen_neveroom');
    initGenericSectionClosed('grp-anima-neveroom', 'arr-anima-neveroom', 'bojro_vis_anima_neveroom');
    initGenericSectionClosed('grp-krea-neveroom', 'arr-krea-neveroom', 'bojro_vis_krea_neveroom');
    initGenericSectionClosed('grp-inp-neveroom', 'arr-inp-neveroom', 'bojro_vis_inp_neveroom');
    initGenericSectionClosed('grp-img2img-neveroom', 'arr-img2img-neveroom', 'bojro_vis_img2img_neveroom');
    initGenericSectionClosed('grp-vram-lowbits', 'arr-vram-lowbits', 'bojro_vis_vram_lowbits');
    
    // CFG tab sections: all open by default except System. The page was regrouped, so the old per-section keys (cfg_app, cfg_ui, cfg_local_ip, cfg_local_ports, cfg_res, cfg_module_pairs) are no longer read.
    initGenericSection('cfg-connection', 'arr-cfg-connection', 'bojro_vis_cfg_connection');
    initGenericSection('cfg-interface', 'arr-cfg-interface', 'bojro_vis_cfg_interface');
    initGenericSection('cfg-generation', 'arr-cfg-generation', 'bojro_vis_cfg_generation');
    initGenericSection('cfg-models', 'arr-cfg-models', 'bojro_vis_cfg_models');
    initGenericSection('cfg-extensions', 'arr-cfg-extensions', 'bojro_vis_cfg_extensions');
    initGenericSection('cfg-experimental', 'arr-cfg-experimental', 'bojro_vis_cfg_experimental');
    initGenericSectionClosed('cfg-sys', 'arr-cfg-sys', 'bojro_vis_cfg_sys');
}

// --- GENERIC SECTION TOGGLER (PERSISTENT) ---
// initGenericSection()/initGenericSectionClosed() live in an early inline <script> after <body> opens, because sections call them before this file loads.

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


// Add this at the very bottom of ui.js
if (window.StyleManager && typeof window.StyleManager.init === 'function') {
    window.StyleManager.init();
}