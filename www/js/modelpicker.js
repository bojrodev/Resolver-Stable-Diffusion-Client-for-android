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

    const subtitle = technicalParts.map(t => modelPickerPrettifyToken(t)).filter(Boolean).join(' • ');
    return { primary: clean, subtitle };
}

let modelPickerTargetSelectId = null;

// Opens the picker for a trigger button, as a flyout (placeFlyout()), reading the target select's options. data-kind="checkpoint" runs names through splitCheckpointDisplayName(); other kinds are shown as is. data-modal-title sets the heading.
window.openModelPicker = function(trigger, anchor) {
    const selectId = trigger.dataset.target;
    const kind = trigger.dataset.kind || 'checkpoint';
    // A value always placed first (e.g. Upscaler 2's "None"). hasAttribute() because an empty string is a valid value.
    const pinFirst = trigger.hasAttribute('data-pin-first') ? trigger.dataset.pinFirst : null;
    // An explicit order (by value) replacing alphabetical sorting, e.g. VRAM Profile low/mid/high; unlisted values follow alphabetically.
    const customOrder = trigger.dataset.customOrder ? trigger.dataset.customOrder.split(',') : null;
    const select = document.getElementById(selectId);
    if (!select) return;
    modelPickerTargetSelectId = selectId;

    // The flyout: its heading (the title without "Select"), then the list.
    document.getElementById('thumbMenu')?.remove();
    const fly = document.createElement('div');
    fly.id = 'thumbMenu';
    fly.className = 'modal pick-fly';
    fly.innerHTML = '<div class="thumb-menu-box"><div class="sort-menu-h"></div><div id="modelPickerList" class="pf-list"></div></div>';
    const title = trigger.dataset.modalTitle || (kind === 'checkpoint' ? 'Select Checkpoint' : 'Select an Option');
    fly.querySelector('.sort-menu-h').textContent = title.replace(/^Select (an? )?/i, '').toUpperCase();
    const list = fly.querySelector('.pf-list');

    const currentValue = select.value;
    let anyOptions = false;

    // "Use preferred" row pinned above the options for VAE/TE/CLIP/T5, resolved from the Checkpoint Manager for the checkpoint on this field's mode. Not shown for triggers marked data-no-preferred (the Checkpoint Manager).
    const MODULE_PICKER_KIND_TO_FIELD = { vae: 'vae', 'text-encoder': 'te', clip: 'clip', t5: 't5' };
    // usingPreferred highlights this row instead of the resolved option.
    const usingPreferred = MODULE_PICKER_KIND_TO_FIELD[kind] && (() => {
        try { return localStorage.getItem(usePreferredModuleFlagKey(selectId)) === 'true'; }
        catch (e) { return false; }
    })();
    if (MODULE_PICKER_KIND_TO_FIELD[kind] && !trigger.hasAttribute('data-no-preferred')) {
        const usePreferredRow = document.createElement('div');
        usePreferredRow.className = 'model-item-row' + (usingPreferred ? ' active' : '');
        usePreferredRow.style.cssText = 'color:var(--accent-primary); font-weight:600;';
        const nameEl = document.createElement('div');
        nameEl.className = 'model-item-name';
        nameEl.textContent = 'Use preferred';
        usePreferredRow.appendChild(nameEl);
        usePreferredRow.onclick = () => usePreferredModuleForField(selectId, kind);
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

    document.body.appendChild(fly);
    // Placed by what was tapped: the box itself, or (a hidden box opened by another button) that button.
    const shown = el => el && el.getClientRects().length && el.getBoundingClientRect().width > 0;
    const at = [anchor, trigger, document.activeElement, flyLastPress()].find(shown) || trigger;
    placeFlyout(fly.firstChild, list, at);
}

// A flyout's box placed by what opened it: below (above if there's more room), at least its width, at most 60% of the
// screen or the room there is (above the dock), the list scrolling inside; the chosen row in view.
window.placeFlyout = function(box, list, anchor) {
    const t = anchor.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    const dock = document.querySelector('.dock-wrapper'), d = dock && dock.getClientRects().length && getComputedStyle(dock).visibility !== 'hidden' ? dock.getBoundingClientRect() : null;
    const bottom = (d && d.height && d.top > t.bottom + 60 ? d.top : H) - 8;
    const w = Math.min(W - 16, Math.max(t.width, 236));
    box.style.width = `${w}px`;
    box.style.left = `${Math.max(8, Math.min(t.left, W - w - 8))}px`;
    const below = bottom - (t.bottom + 6), above = t.top - 6 - 8, cap = H * 0.6;
    const down = below >= Math.min(box.scrollHeight, cap) || below >= above;
    const room = Math.max(120, Math.min(cap, down ? below : above));
    box.style.maxHeight = `${room}px`;
    // Whole rows only, as other lists: the list ends after the last row that fits (with equal rows, scrolled to the end
    // it's clean too).
    if (list) {
        list.style.maxHeight = '';
        const pad = parseFloat(getComputedStyle(list).paddingBottom) || 0, top = list.offsetTop;
        const rows = [...list.children].filter(r => r.offsetHeight);
        let end = 0;
        for (const r of rows) { const b = r.offsetTop + r.offsetHeight + pad; if (top + b > room) break; end = b; }
        if (end && rows.length && rows[rows.length - 1].offsetTop + rows[rows.length - 1].offsetHeight + pad > end) list.style.maxHeight = `${end}px`;
    }
    box.style.top = `${down ? t.bottom + 6 : t.top - 6 - box.offsetHeight}px`;
    // The chosen row about the middle, scrolled to a row's top so no row is cut.
    const on = list && list.querySelector('.active, .on');
    if (on && list.scrollHeight > list.clientHeight) {
        const rows = [...list.children].filter(r => r.offsetHeight), want = on.offsetTop - (list.clientHeight - on.offsetHeight) / 2;
        const top = rows.map(r => r.offsetTop).filter(t => t <= Math.max(0, want)).pop() || 0;
        list.scrollTop = Math.min(top, list.scrollHeight - list.clientHeight);
    }
};
window.addEventListener('resize', () => { if (document.querySelector('#thumbMenu.pick-fly')) closeModelPicker(); });
// Any flyout (#thumbMenu): the page held still while it's open, whichever way it closes (tap, back, a pick); a tap
// outside closes it and goes on to what's under it (its backdrop takes no taps), except on the button that opened it.
(() => {
    let held = null, lastPress = null, opener = null;
    window.flyLastPress = () => lastPress;
    new MutationObserver(() => {
        const fly = document.getElementById('thumbMenu');
        if (fly === held) return;
        if (held && typeof unlockBodyScroll === 'function') unlockBodyScroll();
        held = fly;
        if (held && typeof lockBodyScroll === 'function') lockBodyScroll();
        // What opened it: the button last pressed before it appeared.
        if (held) opener = lastPress;
    }).observe(document.body, { childList: true });
    document.addEventListener('pointerdown', e => {
        const fly = document.getElementById('thumbMenu');
        const btn = e.target.closest ? e.target.closest('button, [role="button"], .model-picker-trigger, .lv-thumb-pick') : null;
        if (!fly || !fly.firstElementChild?.contains(e.target)) lastPress = btn;
        if (fly && !fly.firstElementChild?.contains(e.target)) {
            const own = opener && opener.contains(e.target);
            if (fly.classList.contains('pick-fly')) closeModelPicker(); else fly.remove();
            if (own) {
                const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
                document.addEventListener('click', swallow, { capture: true, once: true });
                setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 600);
            }
            opener = null;
        }
    }, true);
})();
// ADetailer detection models are raw filenames, so give them a cleaner display name. Only the display changes; the full filename is still submitted.
function stripModelFileExtension(name) {
    return (name || '').replace(/\.[a-zA-Z0-9]+$/, '');
}

// VAE/TE/CLIP/T5 names without their model file extension (display only).
const MODULE_PICKER_KINDS = ['vae', 'text-encoder', 'clip', 't5'];
function stripModuleExtension(name) {
    return (name || '').replace(/\.(safetensors|ckpt|pt|pth|bin|gguf|sft)$/i, '');
}

function appendModelPickerRow(list, opt, currentValue, kind) {
    let primary, subtitle;
    if (kind === 'checkpoint' && opt.value) {
        ({ primary, subtitle } = splitCheckpointDisplayName(opt.value));
    } else if (kind === 'checkpoint') {
        // An empty choice ("None", "Same as main") shows its label.
        primary = opt.textContent;
        subtitle = '';
    } else if (kind === 'detection-model') {
        primary = stripModelFileExtension(opt.textContent || opt.value);
        subtitle = '';
    } else if (MODULE_PICKER_KINDS.includes(kind)) {
        primary = stripModuleExtension(opt.textContent || opt.value);
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
    // Manually picking an option clears that field's "Use preferred" flag.
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
    document.querySelector('#thumbMenu.pick-fly')?.remove();
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

    // Fields set via "Use preferred" show that until a manual pick clears the flag.
    if (kind !== 'checkpoint') {
        try {
            if (localStorage.getItem(usePreferredModuleFlagKey(selectId)) === 'true') {
                primaryEl.textContent = 'Use preferred';
                if (subtitleEl) subtitleEl.classList.add('hidden');
                return;
            }
        } catch (e) {
            console.error("Use Preferred flag read failed:", e);
        }
    }

    if (kind !== 'checkpoint') {
        const label = selectedOption.textContent || selectedOption.value;
        primaryEl.textContent = (MODULE_PICKER_KINDS.includes(kind) ? stripModuleExtension(label) : label) || 'Select an option';
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
