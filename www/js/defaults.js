// DEFAULT GENERATION PARAMETERS
// Lets the user pin the current numeric/dropdown values of each generation tab as defaults, saved to
// localStorage. Applied only when Load Default is tapped; see LIVE_GEN_PARAM_FIELDS below (and
// INPAINT_SHARED_STATE_FIELDS, editor.js) for what is restored on launch.

const DEFAULT_PARAM_STORAGE_KEY = 'bojroDefaultGenParams';

// Live state for the main tabs: what is on screen persists automatically, separate from pinned defaults. Uses DEFAULT_PARAM_FIELDS; 'inp' has its own system (editor.js).
const LIVE_GEN_PARAM_MODES = ['xl', 'flux', 'qwen', 'anima', 'krea'];

function saveLiveGenParams(mode) {
    const fields = DEFAULT_PARAM_FIELDS[mode];
    if (!fields) return;
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const value = el.type === 'checkbox' ? el.checked : el.value;
        localStorage.setItem(`bojro_${mode}_live_${id}`, value);
    });
}

// Restore counterpart: an unsaved field keeps its HTML value; selects (sampler/scheduler) are left to fetchSamplers().
function restoreLiveGenParams(mode) {
    const fields = DEFAULT_PARAM_FIELDS[mode];
    if (!fields) return;
    fields.forEach(id => {
        if (id.endsWith('_sampler') || id.endsWith('_scheduler')) return;
        const el = document.getElementById(id);
        if (!el) return;
        const saved = localStorage.getItem(`bojro_${mode}_live_${id}`);
        if (saved === null) return;
        if (el.type === 'checkbox') {
            el.checked = saved === 'true';
        } else {
            el.value = saved;
        }
    });
    // Re-sync the aspect ratio highlight after Width/Height are set.
    if (typeof updateResSwitchHighlight === 'function') updateResSwitchHighlight(mode);
    // Re-sync negative-prompt CFG=1 dimming (as applySavedDefaults(); no-op for modes without a *_cfg/*_neg pair).
    if (typeof updateNegPromptDimming === 'function') updateNegPromptDimming(mode);
}

// Field IDs making up a mode's default params. Prompts, negatives, model, seed and batch size/count are excluded (batch fields: resetPerGenerationFieldsOnBoot(), boot.js).
const DEFAULT_PARAM_FIELDS = {
    xl: ['xl_steps', 'xl_cfg', 'xl_width', 'xl_height', 'xl_sampler', 'xl_scheduler'],
    flux: ['flux_steps', 'flux_cfg', 'flux_distilled', 'flux_width', 'flux_height', 'flux_sampler', 'flux_scheduler'],
    qwen: ['qwen_steps', 'qwen_cfg', 'qwen_width', 'qwen_height', 'qwen_sampler', 'qwen_scheduler'],
    anima: ['anima_steps', 'anima_cfg', 'anima_width', 'anima_height', 'anima_sampler', 'anima_scheduler'],
    krea: ['krea_steps', 'krea_cfg', 'krea_width', 'krea_height', 'krea_sampler', 'krea_scheduler'],
    // 'inp' covers every field; safe because defaults are applied only on an explicit Load Default tap.
    inp: ['inp_steps', 'inp_cfg', 'inp_sampler', 'inp_scheduler', 'inp_mask_blur', 'inp_padding', 'denoisingStrength']
};

function readDefaultParamStore() {
    try {
        return JSON.parse(localStorage.getItem(DEFAULT_PARAM_STORAGE_KEY) || '{}');
    } catch (e) {
        return {};
    }
}

// Fallback in-app popup for when the native Toast plugin is unavailable.
function showFadeToast(msg) {
    let el = document.getElementById('defaultsFadeToast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'defaultsFadeToast';
        el.style.cssText = `
            position: fixed;
            left: 50%;
            bottom: 110px;
            transform: translateX(-50%);
            background: rgba(20, 20, 24, 0.96);
            color: var(--accent-primary, #ff9800);
            border: 1px solid var(--accent-primary, #ff9800);
            padding: 10px 18px;
            border-radius: 10px;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.5px;
            z-index: 99999;
            opacity: 0;
            transition: opacity 0.25s ease;
            pointer-events: none;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            text-align: center;
            max-width: 80vw;
        `;
        document.body.appendChild(el);
    }

    el.textContent = msg;
    el.style.opacity = '0';
    void el.offsetWidth; // force reflow so the fade-in transition retriggers on repeat taps
    el.style.opacity = '1';

    clearTimeout(el._hideTimeout);
    el._hideTimeout = setTimeout(() => { el.style.opacity = '0'; }, 1400);
}

function notify(msg) {
    // Native toast first; custom popup only as a fallback.
    if (typeof Toast !== 'undefined' && Toast) {
        Toast.show({ text: msg, duration: 'short' });
    } else {
        showFadeToast(msg);
    }
    console.log(msg);
}

// Saves the current value of every tracked field as the mode's default ("Save Current as Default").
window.saveCurrentAsDefault = function(modeKey) {
    const fields = DEFAULT_PARAM_FIELDS[modeKey];
    if (!fields) return;

    const store = readDefaultParamStore();
    const snapshot = {};
    let foundAny = false;

    fields.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        snapshot[id] = (el.type === 'checkbox') ? el.checked : el.value;
        foundAny = true;
    });

    // Mask Mode isn't a real form element, needs its own snapshot key
    if (modeKey === 'inp') {
        snapshot._inpaintMaskMode = currentInpaintMode;
        foundAny = true;
    }

    if (!foundAny) return;

    store[defaultKeyMode(modeKey)] = snapshot;
    localStorage.setItem(DEFAULT_PARAM_STORAGE_KEY, JSON.stringify(store));
    // Inpaint and img2img share the 'inp' field list; the toast names the active sub-mode, and snapshots are keyed by defaultKeyMode() (inp_inpaint / inp_img2img).
    const label = (modeKey === 'inp' && typeof currentInpaintTopMode !== 'undefined' && currentInpaintTopMode === 'img2img')
        ? 'I2I'
        : modeKey.toUpperCase();
    notify(`Saved ${label} defaults`);
};

// Applies a mode's saved defaults, tolerating missing saves and fields not yet in the DOM.
window.applySavedDefaults = function(modeKey) {
    const fields = DEFAULT_PARAM_FIELDS[modeKey];
    const store = readDefaultParamStore();
    const snapshot = store[defaultKeyMode(modeKey)];
    if (!fields || !snapshot) return;

    fields.forEach(id => {
        if (!(id in snapshot)) return;
        const el = document.getElementById(id);
        if (!el) return;

        if (el.tagName === 'SELECT') {
            // Only set a saved option if it exists in the list (dropdowns are repopulated on connect).
            const hasOption = Array.from(el.options).some(o => o.value === snapshot[id]);
            if (hasOption) el.value = snapshot[id];
        } else if (el.type === 'checkbox') {
            el.checked = snapshot[id];
        } else {
            el.value = snapshot[id];
            // Update the separate value label of range sliders (.value fires no oninput).
            if (el.type === 'range') el.dispatchEvent(new Event('input'));
        }
    });

    // Goes through setInpaintMode() so the toggle buttons stay in sync
    if (modeKey === 'inp' && '_inpaintMaskMode' in snapshot && typeof window.setInpaintMode === 'function') {
        window.setInpaintMode(snapshot._inpaintMaskMode);
    }

    // Refresh the aspect ratio highlight after setting width/height.
    if (typeof updateResSwitchHighlight === 'function') updateResSwitchHighlight(modeKey);

    // Re-sync negative-prompt CFG=1 dimming.
    if (typeof updateNegPromptDimming === 'function') updateNegPromptDimming(modeKey);
};

// Explicit "Load Default": applies the snapshot, then re-syncs the live state to match.
window.loadSavedDefaultsForMode = function(modeKey) {
    window.applySavedDefaults(modeKey);
    if (modeKey === 'inp') {
        if (typeof saveInpaintModeState === 'function' && typeof currentInpaintTopMode !== 'undefined') {
            saveInpaintModeState(currentInpaintTopMode);
        }
    } else if (typeof saveLiveGenParams === 'function') {
        saveLiveGenParams(modeKey);
    }
    // Refresh picker triggers (no 'change' event fired). No toast on load, only on save.
    if (typeof refreshAllModelPickerTriggers === 'function') refreshAllModelPickerTriggers();
};

// Not called anywhere; a utility to load every mode's default at once.
window.applyAllSavedDefaults = function() {
    Object.keys(DEFAULT_PARAM_FIELDS).forEach(mode => {
        try {
            window.applySavedDefaults(mode);
        } catch (e) {
            console.error(`Applying saved defaults for ${mode} failed:`, e);
        }
    });
    // Refresh picker triggers of selects set directly.
    if (typeof refreshAllModelPickerTriggers === 'function') refreshAllModelPickerTriggers();

    // DEFAULT_PARAM_FIELDS.inp overlaps fields the img2img Preset Manager watches; no-op if none is active.
    if (typeof clearActiveImg2imgPreset === 'function') clearActiveImg2imgPreset();
};
