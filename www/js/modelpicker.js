/*
 * CUSTOM CHECKPOINT PICKER
 * An in-app modal replacing the native <select> UI (an OS picker CSS can't style) for checkpoint and
 * other model dropdowns, with a clean primary name and a muted technical subtitle. The <select>
 * stays the source of truth: the modal builds its rows from the select's options, and choosing
 * one sets the value and dispatches a real 'change' event so existing onchange handlers run.
 */

// Technical tokens (encoding, quantisation, speed) stripped from a filename into a subtitle. Custom boundaries are used because \b treats underscore as a word character.
const MODEL_PICKER_B = '(?:(?<=^)|(?<=[^a-zA-Z0-9]))';
const MODEL_PICKER_B_END = '(?:(?=$)|(?=[^a-zA-Z0-9]))';
function modelPickerTok(pattern) {
    return new RegExp(MODEL_PICKER_B + pattern + MODEL_PICKER_B_END, 'gi');
}
const MODEL_PICKER_TECHNICAL_PATTERNS = [
    modelPickerTok('(?:svdq|gguf)'),
    modelPickerTok('(?:int4|int8|fp4|fp8|fp16|fp32|bf16|nf4)'),
    modelPickerTok('r\\d{1,3}'),
    modelPickerTok('lightning\\s*v?\\d+(?:\\.\\d+)?'),
    modelPickerTok('lightning'),
    modelPickerTok('turbo'),
    modelPickerTok('distilled'),
    modelPickerTok('hyper'),
    modelPickerTok('scaled'),
    modelPickerTok('\\d+[\\s\\-]?steps?'),
];

// Light readability pass on a token, e.g. "lightningv2.0" -> "lightning v2.0".
function modelPickerPrettifyToken(t) {
    return t
        .replace(/^lightning(?=[v\d])/i, 'lightning ')
        .replace(/(\d)(steps?)$/i, '$1 $2')
        .trim();
}

// Strips the path, trailing [hash] and extension Forge puts in checkpoint titles.
function stripCheckpointPathNoise(rawTitle) {
    let s = rawTitle;
    s = s.replace(/\s*\[[a-f0-9]+\]\s*$/i, '');
    s = s.replace(/\.(safetensors|ckpt|pt|bin|gguf|sft)$/i, '');
    s = s.replace(/^.*[\\\/]/, '');
    return s;
}

// Returns { primary, subtitle } for a checkpoint name; falls back to the full name if nothing meaningful is left.
function splitCheckpointDisplayName(rawTitle) {
    if (!rawTitle) return { primary: rawTitle || '', subtitle: '' };
    let clean = stripCheckpointPathNoise(rawTitle);
    const technicalParts = [];

    MODEL_PICKER_TECHNICAL_PATTERNS.forEach(pattern => {
        clean = clean.replace(pattern, (match) => {
            technicalParts.push(match.trim());
            return ' ';
        });
    });

    clean = clean.replace(/_+/g, ' ');
    // Collapse a hyphen left orphaned by a removed token; leave hyphens joining real words ("krea-dev").
    let prev;
    do {
        prev = clean;
        clean = clean.replace(/\s+-|-\s+/g, ' ');
    } while (clean !== prev);
    clean = clean.replace(/\s{2,}/g, ' ')
                 .replace(/^[\s\-\.]+|[\s\-\.]+$/g, '')
                 .trim();

    if (clean.length < 3) {
        return { primary: stripCheckpointPathNoise(rawTitle) || rawTitle, subtitle: '' };
    }

    const subtitle = technicalParts.map(t => modelPickerPrettifyToken(t)).filter(Boolean).join(' · ');
    return { primary: clean, subtitle };
}

let modelPickerTargetSelectId = null;

// Opens the picker for a trigger button, reading the target select's options. data-kind="checkpoint" runs names through splitCheckpointDisplayName(); other kinds are shown as is. data-modal-title sets the heading.
window.openModelPicker = function(trigger) {
    const selectId = trigger.dataset.target;
    const kind = trigger.dataset.kind || 'checkpoint';
    // A value always placed first (e.g. Upscaler 2's "None"). hasAttribute() because an empty string is a valid value.
    const pinFirst = trigger.hasAttribute('data-pin-first') ? trigger.dataset.pinFirst : null;
    // An explicit order (by value) replacing alphabetical sorting, e.g. VRAM Profile low/mid/high; unlisted values follow alphabetically.
    const customOrder = trigger.dataset.customOrder ? trigger.dataset.customOrder.split(',') : null;
    const select = document.getElementById(selectId);
    if (!select) return;
    modelPickerTargetSelectId = selectId;

    const titleEl = document.getElementById('modelPickerTitle');
    if (titleEl) titleEl.textContent = trigger.dataset.modalTitle || (kind === 'checkpoint' ? 'Select Checkpoint' : 'Select an Option');

    const list = document.getElementById('modelPickerList');
    if (!list) return;
    list.innerHTML = '';

    const currentValue = select.value;
    let anyOptions = false;

    // "Use preferred X" row pinned above the options for VAE/TE/CLIP/T5, resolved from Preferred Module Pairings for the checkpoint on this field's mode. Not shown in the pairings modal itself.
    const MODULE_PICKER_KIND_TO_FIELD = { vae: 'vae', 'text-encoder': 'te', clip: 'clip', t5: 't5' };
    const MODULE_PICKER_KIND_LABEL = { vae: 'VAE', 'text-encoder': 'Text Encoder', clip: 'CLIP', t5: 'T5' };
    // Only shown when Preferred Module Pairings is enabled; usingPreferred highlights this row instead of the resolved option.
    const usingPreferred = MODULE_PICKER_KIND_TO_FIELD[kind] && (() => {
        try { return localStorage.getItem(usePreferredModuleFlagKey(selectId)) === 'true'; }
        catch (e) { return false; }
    })();
    if (MODULE_PICKER_KIND_TO_FIELD[kind] && !selectId.startsWith('modulePair') && window.isModulePairsEnabled && window.isModulePairsEnabled()) {
        const usePreferredRow = document.createElement('div');
        usePreferredRow.className = 'model-item-row' + (usingPreferred ? ' active' : '');
        usePreferredRow.style.cssText = 'color:var(--accent-primary); font-weight:600; border-bottom:1px solid var(--border-color);';
        const nameEl = document.createElement('div');
        nameEl.className = 'model-item-name';
        nameEl.textContent = `Use preferred ${MODULE_PICKER_KIND_LABEL[kind]}`;
        usePreferredRow.appendChild(nameEl);
        usePreferredRow.onclick = () => useProperredModuleForField(selectId, kind);
        list.appendChild(usePreferredRow);
    }
    // Sentinel matching no real option, so only the Use Preferred row shows as active.
    const highlightValue = usingPreferred ? undefined : currentValue;

    // Sorted by displayed name; pinFirst goes first and customOrder overrides both.
    function sortOptions(opts) {
        const sortKey = (opt) => (kind === 'checkpoint' ? splitCheckpointDisplayName(opt.value).primary : (opt.textContent || opt.value)).toLowerCase();
        if (customOrder) {
            const ordered = [];
            customOrder.forEach(val => {
                const match = opts.find(o => o.value === val);
                if (match) ordered.push(match);
            });
            const unlisted = opts.filter(o => !customOrder.includes(o.value));
            unlisted.sort((a, b) => sortKey(a).localeCompare(sortKey(b), undefined, { sensitivity: 'base' }));
            return ordered.concat(unlisted);
        }
        // Case-insensitive match; pinFirst may be an empty string.
        const pinned = pinFirst !== null ? opts.filter(o => o.value.toLowerCase() === pinFirst.toLowerCase()) : [];
        const rest = pinFirst !== null ? opts.filter(o => o.value.toLowerCase() !== pinFirst.toLowerCase()) : opts.slice();
        rest.sort((a, b) => sortKey(a).localeCompare(sortKey(b), undefined, { sensitivity: 'base' }));
        return pinned.concat(rest);
    }

    const flatOptions = [];

    Array.from(select.children).forEach(child => {
        if (child.tagName === 'OPTGROUP') {
            // Skip empty optgroups.
            if (child.children.length === 0) return;
            const groupLabel = document.createElement('div');
            groupLabel.className = 'model-item-group-label';
            groupLabel.textContent = child.label;
            list.appendChild(groupLabel);

            const groupOptions = Array.from(child.children).filter(c => c.tagName === 'OPTION');
            sortOptions(groupOptions).forEach(opt => appendModelPickerRow(list, opt, highlightValue, kind));
            anyOptions = true;
        } else if (child.tagName === 'OPTION') {
            flatOptions.push(child);
        }
    });

    if (flatOptions.length > 0) {
        sortOptions(flatOptions).forEach(opt => appendModelPickerRow(list, opt, highlightValue, kind));
        anyOptions = true;
    }

    if (!anyOptions) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align:center; color:var(--text-muted); padding:20px; font-size:13px;';
        empty.textContent = 'No options available.';
        list.appendChild(empty);
    }

    document.getElementById('modelPickerModal')?.classList.remove('hidden');
    if (typeof lockBodyScroll === 'function') lockBodyScroll();
}

// ADetailer detection models are raw filenames, so give them a cleaner display name. Only the display changes; the full filename is still submitted.
function stripModelFileExtension(name) {
    return (name || '').replace(/\.[a-zA-Z0-9]+$/, '');
}

function appendModelPickerRow(list, opt, currentValue, kind) {
    let primary, subtitle;
    if (kind === 'checkpoint') {
        ({ primary, subtitle } = splitCheckpointDisplayName(opt.value));
    } else if (kind === 'detection-model') {
        primary = stripModelFileExtension(opt.textContent || opt.value);
        subtitle = '';
    } else {
        // Prefer textContent as the label (value and text differ for some selects, e.g. VRAM Profile).
        primary = opt.textContent || opt.value;
        subtitle = '';
    }

    const row = document.createElement('div');
    row.className = 'model-item-row' + (opt.value === currentValue ? ' active' : '');

    const nameEl = document.createElement('div');
    nameEl.className = 'model-item-name';
    nameEl.textContent = primary;
    row.appendChild(nameEl);

    if (subtitle) {
        const subEl = document.createElement('div');
        subEl.className = 'model-item-subtitle';
        subEl.textContent = subtitle;
        row.appendChild(subEl);
    }

    row.onclick = () => selectModelFromPicker(opt.value);
    list.appendChild(row);
}

// Sets the select's value and dispatches a real 'change' event so existing onchange handlers run.
function selectModelFromPicker(title) {
    const select = document.getElementById(modelPickerTargetSelectId);
    if (!select) return;
    select.value = title;
    // Manually picking an option clears that field's "USE PREFERRED..." flag.
    try {
        if (typeof usePreferredModuleFlagKey === 'function') {
            localStorage.removeItem(usePreferredModuleFlagKey(modelPickerTargetSelectId));
        }
    } catch (e) {
        console.error("Use Preferred flag clear failed:", e);
    }
    // bubbles:true is needed for the img2img Preset Manager's delegated listener.
    select.dispatchEvent(new Event('change', { bubbles: true }));
    updateModelPickerTriggerText(modelPickerTargetSelectId);
    closeModelPicker();
}

window.closeModelPicker = function() {
    document.getElementById('modelPickerModal')?.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
    modelPickerTargetSelectId = null;
}

// Keeps a trigger's text in sync with its select. Call it wherever a select's value is set without a 'change' event (e.g. boot-time restores).
function updateModelPickerTriggerText(selectId) {
    const select = document.getElementById(selectId);
    const btn = document.querySelector(`.model-picker-trigger[data-target="${selectId}"]`);
    if (!select || !btn) return;

    const kind = btn.dataset.kind || 'checkpoint';
    const selectedOption = select.options[select.selectedIndex];
    const primaryEl = btn.querySelector('.model-picker-trigger-primary');
    const subtitleEl = btn.querySelector('.model-picker-trigger-subtitle');
    if (!selectedOption || !primaryEl) return;

    if (kind === 'detection-model') {
        primaryEl.textContent = stripModelFileExtension(selectedOption.textContent || selectedOption.value) || 'Select an option';
        if (subtitleEl) subtitleEl.classList.add('hidden');
        return;
    }

    // Fields set via "Use Preferred X" show "Use preferred [FIELD]" until a manual pick clears the flag.
    if (kind !== 'checkpoint') {
        try {
            if (localStorage.getItem(usePreferredModuleFlagKey(selectId)) === 'true') {
                // Sentence case ("Use preferred VAE"), Text Encoder shortened to TE.
                const fieldLabelByKind = { vae: 'VAE', 'text-encoder': 'TE', clip: 'CLIP', t5: 'T5' };
                primaryEl.textContent = `Use preferred ${fieldLabelByKind[kind] || kind.toUpperCase()}`;
                if (subtitleEl) subtitleEl.classList.add('hidden');
                return;
            }
        } catch (e) {
            console.error("Use Preferred flag read failed:", e);
        }
    }

    if (kind !== 'checkpoint') {
        primaryEl.textContent = selectedOption.textContent || selectedOption.value || 'Select an option';
        if (subtitleEl) subtitleEl.classList.add('hidden');
        return;
    }

    const { primary, subtitle } = splitCheckpointDisplayName(selectedOption.value);
    primaryEl.textContent = primary || selectedOption.textContent || 'Select a checkpoint';
    if (subtitleEl) {
        subtitleEl.textContent = subtitle;
        subtitleEl.classList.toggle('hidden', !subtitle);
    }
}

// Refreshes every trigger's text after bulk or boot-time restores.
window.refreshAllModelPickerTriggers = function() {
    document.querySelectorAll('.model-picker-trigger').forEach(btn => {
        updateModelPickerTriggerText(btn.dataset.target);
    });
}

// Shows every trigger button and hides its select, without touching the select's value or options. Called at boot and incremental: triggers marked picker-initialized are skipped, so repeat calls (e.g. each visit to Settings) stay cheap while newly built triggers (updateAdetailerLabelsList(), cfg.js) are still picked up.
window.initModelPickers = function() {
    document.querySelectorAll('.model-picker-trigger:not(.picker-initialized)').forEach(btn => {
        btn.classList.add('picker-initialized');
        btn.classList.remove('hidden');
        const select = document.getElementById(btn.dataset.target);
        if (select) select.classList.add('hidden');
        updateModelPickerTriggerText(btn.dataset.target);
    });
}
