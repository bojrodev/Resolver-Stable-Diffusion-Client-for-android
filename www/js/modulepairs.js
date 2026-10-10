// PREFERRED MODULE PAIRINGS
// Pairs a checkpoint (by title) with its preferred VAE/Text Encoder (or CLIP/T5 for Flux), applied
// when that checkpoint is selected on any tab with a module section (all but SDXL).
// 1. Storage: readModulePairs()/saveModulePairsToStorage(), one map keyed by checkpoint title.
// 2. Apply: applyModulePairing(mode, checkpointTitle), called from saveSelection() (ui.js).

const MODULE_PAIRS_STORAGE_KEY = 'bojroModulePairs';
const MODULE_PAIRS_ENABLED_KEY = 'bojro_module_pairs_enabled';

// Modes with a VAE/TE (or VAE/CLIP/T5) module section; SDXL has none.
const MODULE_PAIR_MODES = ['flux', 'qwen', 'anima', 'krea', 'inp', 'img2img'];

function readModulePairs() {
    try {
        const raw = localStorage.getItem(MODULE_PAIRS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        console.error("Reading module pairs failed:", e);
        return {};
    }
}

function saveModulePairsToStorage(pairs) {
    localStorage.setItem(MODULE_PAIRS_STORAGE_KEY, JSON.stringify(pairs));
}

window.isModulePairsEnabled = function() {
    return localStorage.getItem(MODULE_PAIRS_ENABLED_KEY) === 'true';
};

window.toggleModulePairsEnabled = function() {
    const el = document.getElementById('cfgModulePairsEnabled');
    if (!el) return;
    localStorage.setItem(MODULE_PAIRS_ENABLED_KEY, el.checked ? 'true' : 'false');
    window.updateModulePairsManageRowVisibility();
};

// The "Preferred Modules [MANAGE]" row appears only while pairing is enabled; saved pairings are kept when it is off.
window.updateModulePairsManageRowVisibility = function() {
    const row = document.getElementById('modulePairsManageRow');
    if (row) row.classList.toggle('hidden', !window.isModulePairsEnabled());
};

// The pairings list and add/edit flow live in a modal opened by MANAGE; the add/edit modal opens on top of it.
window.openModulePairsManager = function() {
    window.renderModulePairsList();
    document.getElementById('modulePairsManagerModal').classList.remove('hidden');
};
window.closeModulePairsManager = function() {
    document.getElementById('modulePairsManagerModal').classList.add('hidden');
};

// Applies a saved pairing to the mode's module fields (plain .value assignment, no 'change' event). No-op if off, unpaired, or the mode has no module fields.
window.applyModulePairing = function(mode, checkpointTitle) {
    if (!window.isModulePairsEnabled()) return;
    if (!MODULE_PAIR_MODES.includes(mode)) return;
    const pairs = readModulePairs();
    const pairing = pairs[checkpointTitle];
    if (!pairing) return;

    const setIfPresent = (id, value) => {
        if (value === undefined || value === null) return;
        const el = document.getElementById(id);
        if (!el) return;
        if (Array.from(el.options).some(o => o.value === value)) {
            el.value = value;
        }
    };

    // Snapshot of the fields before applying, so the toast shows only when something actually changed.
    const usesClipT5 = pairing.clip !== undefined || pairing.t5 !== undefined;
    const touchedIds = usesClipT5
        ? [`${mode}_vae`, `${mode}_clip`, `${mode}_t5`]
        : [`${mode}_vae`, `${mode}_te`];
    const valuesBefore = touchedIds.map(id => document.getElementById(id)?.value);

    setIfPresent(`${mode}_vae`, pairing.vae);
    if (usesClipT5) {
        setIfPresent(`${mode}_clip`, pairing.clip);
        setIfPresent(`${mode}_t5`, pairing.t5);
    } else {
        setIfPresent(`${mode}_te`, pairing.te);
    }
    const modulesChanged = touchedIds.some((id, i) => document.getElementById(id)?.value !== valuesBefore[i]);

    // Persist the value like a manual pick and refresh the trigger text.
    if (mode === 'inp' || mode === 'img2img') {
        if (typeof saveSelection === 'function') {
            saveSelection(`${mode}_vae`);
            if (pairing.clip !== undefined || pairing.t5 !== undefined) {
                saveSelection(`${mode}_clip`);
                saveSelection(`${mode}_t5`);
            } else {
                saveSelection(`${mode}_te`);
            }
        }
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

    // Inpaint/img2img also show a toast when a paired checkpoint auto-applies modules, but only if something changed. The persistence/refresh above runs either way.
    if ((mode === 'inp' || mode === 'img2img') && modulesChanged) {
        if (Toast) Toast.show({ text: 'Preferred modules selected', duration: 'short' });
    }
};

// Called when the "Use preferred X" row is tapped: resolves just that field (mode from the select id, checkpoint from that mode's model select).
function useProperredModuleForField(selectId, kind) {
    const fieldSuffixByKind = { vae: '_vae', 'text-encoder': '_te', clip: '_clip', t5: '_t5' };
    const fieldLabelByKind = { vae: 'VAE', 'text-encoder': 'Text Encoder', clip: 'CLIP', t5: 'T5' };
    const suffix = fieldSuffixByKind[kind];
    if (!suffix || !selectId.endsWith(suffix)) return;
    const mode = selectId.slice(0, -suffix.length);

    const modelSelect = document.getElementById(`${mode}_modelSelect`);
    const checkpointTitle = modelSelect ? modelSelect.value : null;
    const pairs = readModulePairs();
    const pairing = checkpointTitle ? pairs[checkpointTitle] : null;
    const fieldKey = kind === 'text-encoder' ? 'te' : kind;
    const resolvedValue = pairing ? pairing[fieldKey] : undefined;

    const select = document.getElementById(selectId);
    const hasResolvedOption = select && resolvedValue !== undefined
        && Array.from(select.options).some(o => o.value === resolvedValue);

    if (!hasResolvedOption) {
        if (Toast) Toast.show({ text: 'PREFERRED MODULES NOT SET FOR THIS CHECKPOINT', duration: 'short' });
        return;
    }
    // Applies silently; the trigger shows "Use preferred [FIELD]", persisted via usePreferredModuleFlagKey(). Sets .value and fires 'change' manually so the trigger text can be set after the flag.
    select.value = resolvedValue;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    try {
        localStorage.setItem(usePreferredModuleFlagKey(selectId), 'true');
    } catch (e) {
        console.error("Use Preferred flag save failed:", e);
    }
    if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText(selectId);
    if (typeof closeModelPicker === 'function') closeModelPicker();
}

// localStorage key for a field's "showing USE PREFERRED X" flag: read by updateModelPickerTriggerText(), set by useProperredModuleForField(), cleared by selectModelFromPicker().
function usePreferredModuleFlagKey(selectId) {
    return `bojro_use_preferred_module_${selectId}`;
}

// --- CFG tab: list rendering ---

// Strips .safetensors from a displayed VAE/TE/CLIP/T5 name only; stored values are untouched.
function stripExtensionForDisplay(name) {
    if (!name) return name;
    return name.replace(/\.safetensors$/i, '');
}

// Display name for a checkpoint title: Forge titles carry a path, extension and trailing " [hash]", so reuse stripCheckpointPathNoise() (modelpicker.js, loaded earlier).
function checkpointDisplayNameForPairing(rawTitle) {
    if (!rawTitle) return rawTitle;
    if (typeof stripCheckpointPathNoise === 'function') return stripCheckpointPathNoise(rawTitle);
    return stripExtensionForDisplay(rawTitle.split(/[\\/]/).pop());
}

function moduleFieldRows(pairing) {
    const rows = [['VAE', pairing.vae || 'Automatic']];
    if (pairing.clip !== undefined || pairing.t5 !== undefined) {
        rows.push(['CLIP', pairing.clip || 'None']);
        rows.push(['T5', pairing.t5 || 'None']);
    } else {
        rows.push(['TE', pairing.te || 'None']);
    }
    return rows;
}

window.renderModulePairsList = function() {
    const container = document.getElementById('modulePairsList');
    if (!container) return;
    const pairs = readModulePairs();
    const titles = Object.keys(pairs);
    const countEl = document.getElementById('modulePairsCount');
    if (countEl) countEl.textContent = titles.length ? `(${titles.length})` : '';
    if (titles.length === 0) {
        container.innerHTML = `<p style="font-size:11px; color:var(--text-muted); text-align:center; padding:10px 0; margin:0;">No pairings yet.</p>`;
        return;
    }
    container.innerHTML = titles.map(title => {
        const displayName = checkpointDisplayNameForPairing(title);
        // Each module on its own row.
        const fieldRowsHtml = moduleFieldRows(pairs[title]).map(([label, value]) => `
                <div class="row" style="gap:4px;">
                    <span style="font-size:10px; color:var(--text-muted); flex-shrink:0;">${label}:</span>
                    <span style="font-size:10px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtmlModulePairs(stripExtensionForDisplay(value))}</span>
                </div>`).join('');
        return `<div class="glass-box" style="padding:8px 10px; margin:0;">
            <div class="row" style="justify-content:space-between; align-items:center; gap:8px;">
                <span style="font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtmlModulePairs(displayName)}</span>
                <div class="row" style="width:auto; gap:6px; flex-shrink:0;">
                    <button onclick="openEditModulePairModal('${escapeJsStringModulePairs(title)}')" class="btn-icon" style="width:28px; height:28px; padding:4px;" title="Edit"><i data-lucide="pencil" width="14" height="14"></i></button>
                    <button onclick="deleteModulePair('${escapeJsStringModulePairs(title)}')" class="btn-icon" style="width:28px; height:28px; padding:4px; color:#f44336;" title="Delete"><i data-lucide="trash-2" width="14" height="14"></i></button>
                </div>
            </div>
            <div class="col" style="gap:2px; margin-top:4px;">${fieldRowsHtml}</div>
        </div>`;
    }).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
};

function escapeHtmlModulePairs(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
}
function escapeJsStringModulePairs(s) {
    return (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

window.deleteModulePair = function(title) {
    const pairs = readModulePairs();
    delete pairs[title];
    saveModulePairsToStorage(pairs);
    window.renderModulePairsList();
};

// --- CFG tab: add/edit modal ---

let modulePairEditingTitle = null; // null while adding a new pairing

// All known checkpoints pooled from each tab's dropdown, deduplicated by title.
function collectAllKnownCheckpoints() {
    const seen = new Map();
    ['xl_modelSelect', 'flux_modelSelect', 'qwen_modelSelect', 'anima_modelSelect', 'krea_modelSelect', 'inp_modelSelect'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        Array.from(el.options).forEach(o => {
            if (o.value && !seen.has(o.value)) seen.set(o.value, o.textContent);
        });
    });
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }));
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

function populateModulePairSelects() {
    const modules = collectAllKnownModules();
    const vaeSel = document.getElementById('modulePairVae');
    const teSel = document.getElementById('modulePairTe');
    const clipSel = document.getElementById('modulePairClip');
    const t5Sel = document.getElementById('modulePairT5');
    [[vaeSel, 'Automatic'], [teSel, 'None'], [clipSel, ''], [t5Sel, '']].forEach(([sel, defaultLabel]) => {
        if (!sel) return;
        const defaultText = defaultLabel === '' ? 'None' : defaultLabel;
        sel.innerHTML = `<option value="${defaultLabel}">${defaultText}</option>`;
        modules.forEach(name => {
            if (name === 'Automatic' || name === 'None') return;
            sel.appendChild(new Option(name, name));
        });
    });
}

window.updateModulePairFieldVisibility = function() {
    const checkpointSel = document.getElementById('modulePairCheckpoint');
    const fluxRow = document.getElementById('modulePairFluxRow');
    const teCol = document.getElementById('modulePairTeCol');
    if (!checkpointSel || !fluxRow || !teCol || !window.LoraManager) return;
    const isFlux = window.LoraManager.detectCheckpointArchitecture(checkpointSel.value) === 'flux';
    fluxRow.classList.toggle('hidden', !isFlux);
    teCol.classList.toggle('hidden', isFlux);
};

window.openAddModulePairModal = function() {
    modulePairEditingTitle = null;
    document.getElementById('modulePairModalTitle').textContent = 'ADD PAIRING';
    const checkpointSel = document.getElementById('modulePairCheckpoint');
    checkpointSel.innerHTML = '';
    collectAllKnownCheckpoints().forEach(([value, label]) => checkpointSel.appendChild(new Option(label, value)));
    checkpointSel.disabled = false;
    // The select is hidden, so disable its trigger button to lock it while editing.
    const checkpointTrigger = document.querySelector('button[data-target="modulePairCheckpoint"]');
    if (checkpointTrigger) checkpointTrigger.disabled = false;
    populateModulePairSelects();
    window.updateModulePairFieldVisibility();
    // These fields use the custom picker, so refresh the trigger text after setting .value.
    if (typeof refreshAllModelPickerTriggers === 'function') refreshAllModelPickerTriggers();
    document.getElementById('modulePairModal').classList.remove('hidden');
};

window.openEditModulePairModal = function(title) {
    const pairs = readModulePairs();
    const pairing = pairs[title];
    if (!pairing) return;
    modulePairEditingTitle = title;
    document.getElementById('modulePairModalTitle').textContent = 'EDIT PAIRING';
    const checkpointSel = document.getElementById('modulePairCheckpoint');
    checkpointSel.innerHTML = '';
    const known = collectAllKnownCheckpoints();
    // Fallback label for the plain <select>; the trigger derives its text from the value.
    if (!known.some(([value]) => value === title)) known.push([title, checkpointDisplayNameForPairing(title)]);
    known.forEach(([value, label]) => checkpointSel.appendChild(new Option(label, value)));
    checkpointSel.value = title;
    // An existing pairing stays pinned to its checkpoint (the title is the key); changing it means delete and recreate.
    checkpointSel.disabled = true;
    const checkpointTriggerEdit = document.querySelector('button[data-target="modulePairCheckpoint"]');
    if (checkpointTriggerEdit) checkpointTriggerEdit.disabled = true;
    populateModulePairSelects();
    const vaeSel = document.getElementById('modulePairVae');
    const teSel = document.getElementById('modulePairTe');
    const clipSel = document.getElementById('modulePairClip');
    const t5Sel = document.getElementById('modulePairT5');
    if (vaeSel && pairing.vae !== undefined) vaeSel.value = pairing.vae;
    if (teSel && pairing.te !== undefined) teSel.value = pairing.te;
    if (clipSel && pairing.clip !== undefined) clipSel.value = pairing.clip;
    if (t5Sel && pairing.t5 !== undefined) t5Sel.value = pairing.t5;
    window.updateModulePairFieldVisibility();
    if (typeof refreshAllModelPickerTriggers === 'function') refreshAllModelPickerTriggers();
    document.getElementById('modulePairModal').classList.remove('hidden');
};

window.closeModulePairModal = function() {
    document.getElementById('modulePairModal').classList.add('hidden');
};

window.saveModulePair = function() {
    const checkpointSel = document.getElementById('modulePairCheckpoint');
    const title = modulePairEditingTitle || checkpointSel.value;
    if (!title) return;
    const isFlux = !document.getElementById('modulePairFluxRow').classList.contains('hidden');
    const pairs = readModulePairs();
    const vae = document.getElementById('modulePairVae').value;
    if (isFlux) {
        pairs[title] = {
            vae,
            clip: document.getElementById('modulePairClip').value,
            t5: document.getElementById('modulePairT5').value
        };
    } else {
        pairs[title] = {
            vae,
            te: document.getElementById('modulePairTe').value
        };
    }
    saveModulePairsToStorage(pairs);
    window.renderModulePairsList();
    window.closeModulePairModal();
    if (Toast) Toast.show({ text: 'Pairing saved', duration: 'short' });
};
