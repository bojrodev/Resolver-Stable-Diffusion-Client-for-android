// CHECKPOINT MANAGER
// Per-checkpoint settings: model type, preferred VAE/Text Encoder (or CLIP/T5 for Flux), Low Bits, hiding in Inpaint/img2img, and Sampler/Schedule/Steps/CFG applied when selected.
// Stored in one map keyed by checkpoint title without its [hash] (Low Bits lives in engine.js). Applied on a checkpoint
// change by applyCheckpointSelection() (saveSelection(), ui.js); the type is read through
// checkpointTypeOverride() by LoraManager.detectCheckpointArchitecture() (lora.js).

const MODULE_PAIRS_STORAGE_KEY = 'bojroModulePairs';

// Modes with a VAE/TE (or VAE/CLIP/T5) module section; SDXL has none.
const MODULE_PAIR_MODES = ['flux', 'qwen', 'anima', 'krea', 'inp', 'img2img'];

const CHECKPOINT_TYPE_LABELS = { xl: 'SDXL', anima: 'ANIMA', qwen: 'QWEN', flux: 'FLUX', krea: 'KREA' };

// Forge adds " [hash]" to a title once the hash is known, so settings are keyed without it.
function checkpointConfigKey(title) {
    return (title || '').replace(/\s*\[[a-f0-9]+\]\s*$/i, '');
}

function readModulePairs() {
    try {
        const raw = localStorage.getItem(MODULE_PAIRS_STORAGE_KEY);
        const stored = raw ? JSON.parse(raw) : {};
        // Older entries were keyed by the full title and stored Automatic/None, which now mean no preference.
        const pairs = {};
        Object.keys(stored).forEach(k => {
            const key = checkpointConfigKey(k);
            const cfg = Object.assign({}, pairs[key], stored[k]);
            if (cfg.vae === 'Automatic') delete cfg.vae;
            if (cfg.te === 'None') delete cfg.te;
            if (cfg.clip === '') delete cfg.clip;
            if (cfg.t5 === '') delete cfg.t5;
            if (Object.keys(cfg).length) pairs[key] = cfg;
        });
        return pairs;
    } catch (e) {
        console.error("Reading checkpoint settings failed:", e);
        return {};
    }
}

function saveModulePairsToStorage(pairs) {
    localStorage.setItem(MODULE_PAIRS_STORAGE_KEY, JSON.stringify(pairs));
}

function getCheckpointConfig(title) {
    return title ? readModulePairs()[checkpointConfigKey(title)] || null : null;
}

// The model type set for a checkpoint, or null to detect it from the name.
window.checkpointTypeOverride = function(title) {
    const cfg = getCheckpointConfig(title);
    return cfg && CHECKPOINT_TYPE_LABELS[cfg.type] ? cfg.type : null;
};

window.isCheckpointHiddenInInpaint = function(title) {
    const cfg = getCheckpointConfig(title);
    return !!(cfg && cfg.hideInp);
};

// A module field's empty choice: Automatic for a VAE, None for an encoder.
function defaultModuleValue(select) {
    const opt = Array.from(select.options).find(o => o.value === '' || o.value === 'Automatic' || o.value === 'None');
    return opt ? opt.value : '';
}

function moduleFieldIds(mode, usesClipT5) {
    return usesClipT5
        ? { vae: `${mode}_vae`, clip: `${mode}_clip`, t5: `${mode}_t5` }
        : { vae: `${mode}_vae`, te: `${mode}_te` };
}

// On a checkpoint change: fields set to "Use preferred" follow the checkpoint (Automatic/None if it has nothing set), and any module it prefers is applied. Plain .value assignment, no 'change' event. Returns whether a field changed.
window.applyModulePairing = function(mode, checkpointTitle) {
    if (!MODULE_PAIR_MODES.includes(mode)) return false;
    const pairing = getCheckpointConfig(checkpointTitle) || {};
    const usesClipT5 = pairing.clip !== undefined || pairing.t5 !== undefined
        || (window.LoraManager && window.LoraManager.detectCheckpointArchitecture(checkpointTitle) === 'flux' && !!document.getElementById(`${mode}_clip`));
    const ids = moduleFieldIds(mode, usesClipT5);

    let touched = false, modulesChanged = false;
    Object.keys(ids).forEach(field => {
        const el = document.getElementById(ids[field]);
        if (!el) return;
        let value = pairing[field];
        if (value === undefined) {
            if (localStorage.getItem(usePreferredModuleFlagKey(ids[field])) !== 'true') return;
            value = defaultModuleValue(el);
        }
        if (!Array.from(el.options).some(o => o.value === value)) return;
        touched = true;
        if (el.value !== value) { el.value = value; modulesChanged = true; }
    });
    if (!touched) return false;

    // Persist the value like a manual pick and refresh the trigger text.
    if (mode === 'inp' || mode === 'img2img') {
        if (typeof saveSelection === 'function') Object.values(ids).forEach(id => saveSelection(id));
        if (typeof updateInpFluxModuleVisibility === 'function') updateInpFluxModuleVisibility(mode);
    } else {
        // Flux/Qwen/Anima/Krea save through their own handlers (saveTrident()/Neo.saveDual()), not saveSelection().
        if (mode === 'flux' && typeof saveTrident === 'function') saveTrident();
        else if (mode === 'qwen' && window.Neo && typeof window.Neo.saveDual === 'function') window.Neo.saveDual();
        else if (typeof saveSelection === 'function') {
            saveSelection(`${mode}_vae`);
            saveSelection(`${mode}_te`);
        }
    }
    if (typeof refreshAllModelPickerTriggers === 'function') refreshAllModelPickerTriggers();
    return modulesChanged;
};

// Sampler/Schedule/Steps/CFG set for a checkpoint, applied visibly when it is selected on a tab (as LoRA overrides are when a LoRA is added). Returns whether a field changed.
window.applyCheckpointDefaults = function(mode, checkpointTitle) {
    const cfg = getCheckpointConfig(checkpointTitle);
    if (!cfg) return false;
    const fieldMode = mode === 'img2img' ? 'inp' : mode;
    let changed = false;
    ['sampler', 'scheduler', 'steps', 'cfg'].forEach(field => {
        const value = cfg[field];
        const el = document.getElementById(`${fieldMode}_${field}`);
        if (value === undefined || value === '' || !el) return;
        if (el.tagName === 'SELECT' && !Array.from(el.options).some(o => o.value === value)) return;
        if (el.value === value) return;
        el.value = value;
        changed = true;
        // The field's own handlers save it and update anything that depends on it.
        el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
        if (el.tagName === 'SELECT' && typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText(el.id);
    });
    return changed;
};

// Set while an img2img preset is applied, which shows its own toast.
let checkpointSelectionQuiet = false;

// A checkpoint chosen on a tab: modules, then defaults, with one toast. In Inpaint/img2img a non-SDXL checkpoint with no preferred modules adds a second toast.
window.applyCheckpointSelection = function(mode, checkpointTitle) {
    const modulesChanged = window.applyModulePairing(mode, checkpointTitle);
    const defaultsChanged = window.applyCheckpointDefaults(mode, checkpointTitle);
    // Overrides of LoRAs already in the prompt win over the checkpoint's defaults.
    if (defaultsChanged && typeof applyPromptLoraOverrides === 'function') applyPromptLoraOverrides(mode === 'img2img' ? 'inp' : mode);
    if ((!modulesChanged && !defaultsChanged) || checkpointSelectionQuiet) return;
    if (Toast) Toast.show({ text: 'Checkpoint defaults applied', duration: 'short' });
    const cfg = getCheckpointConfig(checkpointTitle);
    const hasModules = cfg && ['vae', 'te', 'clip', 't5'].some(k => cfg[k] !== undefined);
    const needsModules = !window.LoraManager || window.LoraManager.detectCheckpointArchitecture(checkpointTitle) !== 'xl';
    if ((mode === 'inp' || mode === 'img2img') && !hasModules && needsModules && Toast) {
        Toast.show({ text: 'PREFERRED MODULES NOT SET FOR THIS CHECKPOINT', duration: 'short' });
    }
};

// Called when the "Use preferred" row is tapped: the checkpoint's preferred module for that field, or Automatic/None if it has none.
function usePreferredModuleForField(selectId, kind) {
    const fieldSuffixByKind = { vae: '_vae', 'text-encoder': '_te', clip: '_clip', t5: '_t5' };
    const suffix = fieldSuffixByKind[kind];
    const select = document.getElementById(selectId);
    if (!suffix || !select || !selectId.endsWith(suffix)) return;
    const mode = selectId.slice(0, -suffix.length);

    const modelSelect = document.getElementById(`${mode}_modelSelect`);
    const pairing = getCheckpointConfig(modelSelect ? modelSelect.value : null);
    const fieldKey = kind === 'text-encoder' ? 'te' : kind;
    let value = pairing ? pairing[fieldKey] : undefined;
    if (value === undefined || !Array.from(select.options).some(o => o.value === value)) value = defaultModuleValue(select);

    // The flag is set before 'change' so the trigger keeps showing "Use preferred".
    try {
        localStorage.setItem(usePreferredModuleFlagKey(selectId), 'true');
    } catch (e) {
        console.error("Use Preferred flag save failed:", e);
    }
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText(selectId);
    if (typeof closeModelPicker === 'function') closeModelPicker();
}

// localStorage key for a field's "Use preferred" flag: read by updateModelPickerTriggerText(), set by usePreferredModuleForField(), cleared by selectModelFromPicker().
function usePreferredModuleFlagKey(selectId) {
    return `bojro_use_preferred_module_${selectId}`;
}

// --- Checkpoint list ---

// Every checkpoint the server reported (fetchModels(), network.js), else whatever the dropdowns hold.
function collectAllKnownCheckpoints() {
    if (Array.isArray(window.allCheckpointModels) && window.allCheckpointModels.length) {
        return window.allCheckpointModels.map(m => ({ title: m.title, filename: m.filename || '' }));
    }
    const seen = new Map();
    ['xl_modelSelect', 'flux_modelSelect', 'qwen_modelSelect', 'anima_modelSelect', 'krea_modelSelect', 'inp_modelSelect'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        Array.from(el.options).forEach(o => {
            if (o.value && !seen.has(o.value)) seen.set(o.value, { title: o.value, filename: '' });
        });
    });
    return Array.from(seen.values());
}

// All known module names, reusing whichever dropdown already has the fullest list.
function collectAllKnownModules() {
    const seen = new Set();
    ['flux_vae', 'flux_clip', 'flux_t5', 'qwen_vae', 'qwen_te', 'anima_vae', 'anima_te', 'krea_vae', 'krea_te', 'inp_vae', 'inp_te'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        Array.from(el.options).forEach(o => {
            if (o.value) seen.add(o.value);
        });
    });
    return Array.from(seen).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function escapeHtmlModulePairs(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
}

function updateCheckpointManagerCount() {
    const countEl = document.getElementById('modulePairsCount');
    if (!countEl) return;
    const n = Object.keys(readModulePairs()).length;
    countEl.textContent = n ? `(${n})` : '';
}

window.openCheckpointManager = function() {
    const search = document.getElementById('ckptSearch');
    if (search) search.value = '';
    document.getElementById('checkpointManagerModal').classList.remove('hidden');
    if (typeof lockBodyScroll === 'function') lockBodyScroll();
    // Square refresh button as tall as the search box.
    const btn = document.getElementById('ckptRefreshBtn');
    const h = search ? search.getBoundingClientRect().height : 0;
    if (btn && h > 0) btn.style.width = `${h}px`;
    window.renderCheckpointManagerList();
};

window.closeCheckpointManager = function() {
    document.getElementById('checkpointManagerModal').classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
};

window.clearCheckpointSearch = function() {
    const search = document.getElementById('ckptSearch');
    if (search) search.value = '';
    window.renderCheckpointManagerList();
};

let checkpointThumbObserver = null;

window.renderCheckpointManagerList = function() {
    const list = document.getElementById('checkpointManagerList');
    if (!list) return;
    const rawQuery = document.getElementById('ckptSearch')?.value || '';
    const query = searchQuery(rawQuery);
    document.getElementById('ckptSearchClear')?.classList.toggle('hidden', !rawQuery);
    const pairs = readModulePairs();

    const items = collectAllKnownCheckpoints()
        .map(c => Object.assign({ name: splitCheckpointDisplayName(c.title) }, c))
        .filter(c => !query || searchKey(c.name.primary).includes(query) || searchKey(c.title).includes(query))
        .sort((a, b) => a.name.primary.localeCompare(b.name.primary, undefined, { sensitivity: 'base' }));

    if (checkpointThumbObserver) checkpointThumbObserver.disconnect();
    // Thumbnails load as rows near the viewport, through the LoRA thumbnail cache.
    checkpointThumbObserver = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (!e.isIntersecting) return;
            checkpointThumbObserver.unobserve(e.target);
            if (e.target._loadThumb) e.target._loadThumb();
        });
    }, { root: list, rootMargin: '300px' });

    list.innerHTML = '';
    if (!items.length) {
        list.innerHTML = `<p style="font-size:12px; color:var(--text-muted); text-align:center; padding:20px 0; margin:0;">${query ? 'No checkpoints match your search.' : 'No checkpoints yet. Connect to the server first.'}</p>`;
        return;
    }
    items.forEach(c => {
        const cfg = pairs[checkpointConfigKey(c.title)] || {};
        const row = document.createElement('div');
        row.className = 'lora-item-row';
        row.style.cursor = 'pointer';
        const tags = [];
        if (CHECKPOINT_TYPE_LABELS[cfg.type]) tags.push(CHECKPOINT_TYPE_LABELS[cfg.type]);
        if (['vae', 'te', 'clip', 't5'].some(k => cfg[k] !== undefined)) tags.push('Modules');
        if (['sampler', 'scheduler', 'steps', 'cfg'].some(k => cfg[k] !== undefined)) tags.push('Defaults');
        if (cfg.hideInp) tags.push('Hidden in Inpaint');
        const memThumb = window.LoraManager && window.LoraManager.thumbnailMemCache[checkpointThumbKey(c.title)];
        row.innerHTML = `
            <img src="${memThumb || 'icon.png'}" class="lora-item-thumb">
            <div class="lora-item-info">
                <div class="lora-item-name">${escapeHtmlModulePairs(c.name.primary)}</div>
                ${c.name.subtitle ? `<div class="model-item-subtitle">${escapeHtmlModulePairs(c.name.subtitle)}</div>` : ''}
                ${tags.length ? `<div class="lora-item-meta" style="color:var(--accent-primary); margin-top:2px;">${escapeHtmlModulePairs(tags.join(' · '))}</div>` : ''}
            </div>`;
        row.onclick = () => window.openCheckpointConfig(c.title);
        if (!memThumb && c.filename && window.LoraManager) {
            row._loadThumb = () => window.LoraManager.smartLoadThumbnail(row.querySelector('img'), { name: checkpointThumbKey(c.title), path: c.filename });
            checkpointThumbObserver.observe(row);
        }
        list.appendChild(row);
    });
    fitCheckpointListHeight();
};

// Rescans the server's checkpoint folder (as the LoRA list's refresh) and rebuilds this list and every dropdown.
window.refreshCheckpointList = async function() {
    let host = typeof buildWebUIUrl === 'function' ? buildWebUIUrl() : '';
    if (!host && typeof HOST !== 'undefined') host = HOST;
    if (!host) {
        await window.appAlert("Link server first!");
        return;
    }
    const btn = document.getElementById('ckptRefreshBtn');
    const list = document.getElementById('checkpointManagerList');
    const previous = list.innerHTML;
    if (btn) btn.disabled = true;
    list.innerHTML = '<div class="spinner" style="display:block"></div>';
    try {
        const headers = typeof getHeaders === 'function' ? getHeaders() : {};
        await fetch(`${host}/sdapi/v1/refresh-checkpoints`, { method: 'POST', headers });
        const res = await fetch(`${host}/sdapi/v1/sd-models`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('Unexpected reply');
        data.sort((a, b) => a.model_name.localeCompare(b.model_name, undefined, { sensitivity: 'base' }));
        window.allCheckpointModels = data;
        if (typeof populateCheckpointSelects === 'function') populateCheckpointSelects(data);
        // Thumbnails are looked up again, so a new or changed preview image shows.
        const LM = window.LoraManager;
        if (LM) Object.keys(LM.thumbnailMemCache).filter(k => k.startsWith('ckpt_')).forEach(k => {
            delete LM.thumbnailMemCache[k];
            delete LM.metaCache[k];
        });
        window.renderCheckpointManagerList();
        if (Toast) Toast.show({ text: `${data.length} checkpoint${data.length === 1 ? '' : 's'}`, duration: 'short' });
    } catch (e) {
        list.innerHTML = previous;
        await window.appAlert("Refresh failed: " + e.message, { title: 'Refresh Failed', danger: true });
    } finally {
        if (btn) btn.disabled = false;
    }
};

function checkpointThumbKey(title) {
    return 'ckpt_' + checkpointConfigKey(title);
}

// As many whole rows as fit on screen (ui.js).
function fitCheckpointListHeight() {
    const list = document.getElementById('checkpointManagerList');
    if (list) fitListToWholeRows(list, list.querySelectorAll('.lora-item-row'));
}

// --- Checkpoint settings window ---

let checkpointConfigTitle = null;

function fillCheckpointConfigSelect(id, defaultValue, defaultLabel, modules, value) {
    const sel = document.getElementById(id);
    sel.innerHTML = '';
    sel.appendChild(new Option(defaultLabel, defaultValue));
    modules.forEach(name => {
        if (name === 'Automatic' || name === 'None' || name === '') return;
        sel.appendChild(new Option(name, name));
    });
    // A saved module the server no longer lists stays selectable.
    if (value && !Array.from(sel.options).some(o => o.value === value)) sel.appendChild(new Option(value, value));
    sel.value = value || defaultValue;
}

window.openCheckpointConfig = function(title) {
    checkpointConfigTitle = title;
    const cfg = getCheckpointConfig(title) || {};
    const { primary, subtitle } = splitCheckpointDisplayName(title);
    document.getElementById('ckptCfgTitle').textContent = primary;
    const sub = document.getElementById('ckptCfgSubtitle');
    sub.textContent = subtitle;
    sub.classList.toggle('hidden', !subtitle);

    const typeSel = document.getElementById('ckptCfgType');
    const detected = window.LoraManager ? window.LoraManager.detectCheckpointArchitectureFromName(title) : 'xl';
    typeSel.innerHTML = '';
    typeSel.appendChild(new Option(`Auto (${CHECKPOINT_TYPE_LABELS[detected]})`, ''));
    Object.keys(CHECKPOINT_TYPE_LABELS).forEach(k => typeSel.appendChild(new Option(CHECKPOINT_TYPE_LABELS[k], k)));
    typeSel.value = CHECKPOINT_TYPE_LABELS[cfg.type] ? cfg.type : '';

    const modules = collectAllKnownModules();
    fillCheckpointConfigSelect('ckptCfgVae', 'Automatic', 'Automatic', modules, cfg.vae);
    fillCheckpointConfigSelect('ckptCfgTe', 'None', 'None', modules, cfg.te);
    fillCheckpointConfigSelect('ckptCfgClip', '', 'None', modules, cfg.clip);
    fillCheckpointConfigSelect('ckptCfgT5', '', 'None', modules, cfg.t5);
    document.getElementById('ckptCfgHideInp').checked = !!cfg.hideInp;

    // Defaults when selected: option lists copied from the SDXL tab.
    const copyOptions = (sourceId, targetId, value) => {
        const target = document.getElementById(targetId);
        target.innerHTML = '<option value="">Not Set</option>';
        Array.from(document.getElementById(sourceId)?.options || []).forEach(o => {
            if (o.value) target.appendChild(new Option(o.value, o.value));
        });
        if (value && !Array.from(target.options).some(o => o.value === value)) target.appendChild(new Option(value, value));
        target.value = value || '';
    };
    copyOptions('xl_sampler', 'ckptCfgSampler', cfg.sampler);
    copyOptions('xl_scheduler', 'ckptCfgScheduler', cfg.scheduler);
    document.getElementById('ckptCfgSteps').value = cfg.steps || '';
    document.getElementById('ckptCfgCfg').value = cfg.cfg || '';

    // Low Bits is stored per checkpoint by engine.js (getLowBitsForMode()); Automatic when nothing is set.
    const lowBitsSel = document.getElementById('ckptCfgLowBits');
    lowBitsSel.innerHTML = '';
    Array.from(document.getElementById('gen_low_bits')?.options || []).forEach(o => lowBitsSel.appendChild(new Option(o.textContent, o.value)));
    lowBitsSel.value = typeof getLowBitsForMode === 'function' ? getLowBitsForMode('xl', title) : 'Automatic';
    const lowBitsOrder = document.querySelector('[data-target="gen_low_bits"]')?.dataset.customOrder;
    const lowBitsTrigger = document.querySelector('[data-target="ckptCfgLowBits"]');
    if (lowBitsOrder && lowBitsTrigger) lowBitsTrigger.dataset.customOrder = lowBitsOrder;

    window.updateCheckpointConfigFields();
    document.getElementById('checkpointConfigModal').classList.remove('hidden');
    if (typeof lockBodyScroll === 'function') lockBodyScroll();
};

window.closeCheckpointConfig = function() {
    document.getElementById('checkpointConfigModal').classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
    checkpointConfigTitle = null;
};

// Flux takes CLIP and T5; every other type one Text Encoder.
window.updateCheckpointConfigFields = function() {
    const type = document.getElementById('ckptCfgType').value
        || (window.LoraManager ? window.LoraManager.detectCheckpointArchitectureFromName(checkpointConfigTitle) : 'xl');
    const isFlux = type === 'flux';
    document.getElementById('ckptCfgFluxRow').classList.toggle('hidden', !isFlux);
    document.getElementById('ckptCfgTeCol').classList.toggle('hidden', isFlux);
    ['ckptCfgType', 'ckptCfgVae', 'ckptCfgTe', 'ckptCfgClip', 'ckptCfgT5', 'ckptCfgLowBits', 'ckptCfgSampler', 'ckptCfgScheduler'].forEach(id => {
        if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText(id);
    });
};

window.saveCheckpointConfig = function() {
    const title = checkpointConfigTitle;
    if (!title) return;
    const pairs = readModulePairs();
    const key = checkpointConfigKey(title);
    const layoutOf = c => JSON.stringify([c && c.type, !!(c && c.hideInp)]);
    const before = layoutOf(pairs[key]);
    const val = id => document.getElementById(id).value;
    const cfg = {};
    if (val('ckptCfgType')) cfg.type = val('ckptCfgType');
    // Automatic/None mean no preference, so nothing is applied for them.
    if (val('ckptCfgVae') !== 'Automatic') cfg.vae = val('ckptCfgVae');
    if (!document.getElementById('ckptCfgFluxRow').classList.contains('hidden')) {
        if (val('ckptCfgClip')) cfg.clip = val('ckptCfgClip');
        if (val('ckptCfgT5')) cfg.t5 = val('ckptCfgT5');
    } else if (val('ckptCfgTe') !== 'None') {
        cfg.te = val('ckptCfgTe');
    }
    if (document.getElementById('ckptCfgHideInp').checked) cfg.hideInp = true;
    if (val('ckptCfgSampler')) cfg.sampler = val('ckptCfgSampler');
    if (val('ckptCfgScheduler')) cfg.scheduler = val('ckptCfgScheduler');
    if (val('ckptCfgSteps') !== '' && Number(val('ckptCfgSteps')) > 0) cfg.steps = String(Math.round(Number(val('ckptCfgSteps'))));
    if (val('ckptCfgCfg') !== '' && Number(val('ckptCfgCfg')) >= 0) cfg.cfg = String(Number(val('ckptCfgCfg')));

    const lowBitsKey = typeof lowBitsModelKey === 'function' ? lowBitsModelKey(title) : null;
    if (lowBitsKey) {
        if (val('ckptCfgLowBits') && val('ckptCfgLowBits') !== 'Automatic') localStorage.setItem(lowBitsKey, val('ckptCfgLowBits'));
        else localStorage.removeItem(lowBitsKey);
        if (typeof refreshLowBitsControls === 'function') refreshLowBitsControls();
    }

    if (Object.keys(cfg).length) pairs[key] = cfg;
    else delete pairs[key];
    saveModulePairsToStorage(pairs);
    window.closeCheckpointConfig();
    window.renderCheckpointManagerList();
    updateCheckpointManagerCount();
    // Type and Inpaint visibility change the dropdowns and the Inpaint/img2img layout.
    if (before !== layoutOf(pairs[key]) && typeof refreshCheckpointDependentUi === 'function') refreshCheckpointDependentUi();
    if (Toast) Toast.show({ text: 'Checkpoint saved', duration: 'short' });
};

window.addEventListener('load', updateCheckpointManagerCount);
