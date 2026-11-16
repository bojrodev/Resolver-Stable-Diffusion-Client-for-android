// MORE SETTINGS cards on the generation tabs: Hi-Res Fix's own sampler, schedule, checkpoint (SDXL), prompt and negative,
// and under Seed a variation seed, a refiner (SDXL) and tiling. Untouched, they send nothing (MoreSettings.apply()).
(function () {
    const MODES = ['xl', 'anima', 'qwen', 'flux', 'krea'];
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const key = (mode, f) => `bojro_${mode}_more_${f}`;
    const el = (mode, f) => document.getElementById(`${mode}_more_${f}`);
    const picker = (id, kind, title) => `<button type="button" class="model-picker-trigger hidden" data-target="${id}" data-kind="${kind}" data-modal-title="${title}" data-pin-first="" onclick="openModelPicker(this)"><span class="model-picker-trigger-primary"></span><span class="model-picker-trigger-subtitle hidden"></span></button>`;
    const select = (mode, f, label, kind, title) => `<div class="col"><label>${label}</label><div class="row"><select id="${mode}_more_${f}" data-more="${f}"></select>${picker(`${mode}_more_${f}`, kind, title)}</div></div>`;
    const card = (mode, part, body) => `
        <div class="ad-more-card more-card" style="margin-top:12px;">
            <div class="row" onclick="toggleGeneric('grp-${mode}-${part}-more', 'arr-${mode}-${part}-more', 'bojro_vis_${mode}_${part}_more')" style="justify-content:space-between; align-items:center; cursor:pointer;">
                <label style="cursor:pointer; font-size:13px; margin:0;">MORE SETTINGS</label>
                <i id="arr-${mode}-${part}-more" data-lucide="chevron-down" width="16" height="16" style="transition: transform 0.2s;"></i>
            </div>
            <div id="grp-${mode}-${part}-more" class="hidden">${body}</div>
        </div>`;

    // Option lists copied from the tab's own (sampler, schedule, checkpoint), after "Same as main" (empty value).
    const SOURCES = { hr_sampler: '_sampler', hr_scheduler: '_scheduler', hr_checkpoint: '_modelSelect', refiner: '_modelSelect' };
    function copyOptions(mode, f) {
        const target = el(mode, f);
        const source = document.getElementById(mode + SOURCES[f]);
        if (!target || !source) return;
        const keep = target.value || localStorage.getItem(key(mode, f)) || '';
        target.innerHTML = `<option value="">${f === 'refiner' ? 'None' : 'Same as main'}</option>`;
        [...source.options].forEach(o => { if (o.value && !/^(Link first|Loading)/.test(o.value)) target.appendChild(new Option(o.textContent, o.value)); });
        target.value = [...target.options].some(o => o.value === keep) ? keep : '';
        if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText(target.id);
    }

    function build(mode) {
        const hr = document.getElementById(`grp-${mode}-hr`);
        const hasNeg = !!document.getElementById(`${mode}_neg`);
        if (hr && !document.getElementById(`grp-${mode}-hr-more`)) {
            hr.insertAdjacentHTML('beforeend', card(mode, 'hr', `
                <div class="row" style="gap:10px; margin-top:12px;">${select(mode, 'hr_sampler', 'Sampler', 'sampler', 'Select Sampler')}${select(mode, 'hr_scheduler', 'Schedule', 'schedule', 'Select Schedule')}</div>
                ${mode === 'xl' ? `<div style="margin-top:10px;">${select(mode, 'hr_checkpoint', 'Checkpoint', 'checkpoint', 'Select Checkpoint')}</div>` : ''}
                <div class="col" style="margin-top:10px;"><label>Prompt</label><textarea id="${mode}_more_hr_prompt" data-more="hr_prompt" rows="2" placeholder="Blank uses the main prompt" style="margin-top:5px;"></textarea></div>
                ${hasNeg ? `<div class="col" style="margin-top:10px;"><label>Negative</label><textarea id="${mode}_more_hr_negative" data-more="hr_negative" rows="2" placeholder="Blank uses the main negative" style="margin-top:5px;"></textarea></div>` : ''}`));
        }
        const seed = document.getElementById(`${mode}_seed`);
        const seedRow = seed && seed.closest('.row') && seed.closest('.row').parentElement && seed.closest('.row').parentElement.parentElement;
        if (seedRow && !document.getElementById(`grp-${mode}-seed-more`)) {
            seedRow.insertAdjacentHTML('afterend', card(mode, 'seed', `
                <div class="row" style="gap:10px; margin-top:12px;">
                    <div class="col"><label>Variation Seed</label><div class="row"><input type="number" id="${mode}_more_var_seed" data-more="var_seed" value="-1" onblur="normalizeSeedField(this); this.dispatchEvent(new Event('change'))"><button type="button" class="btn-icon" onclick="MoreSettings.randomSubseed('${mode}')"><i data-lucide="dices" width="20" height="20"></i></button></div></div>
                    <div class="col" style="flex: 0 0 auto;"><label>Strength</label><div class="row" style="gap: 8px;"><input type="number" id="${mode}_more_subseed_strength" data-more="subseed_strength" value="0.0" min="0" max="1" step="0.01" style="width: 72px;" onblur="MoreSettings.tidyStrength(this)"><button type="button" class="btn-icon" title="Reset to 0.0" aria-label="Reset strength" onclick="MoreSettings.resetStrength('${mode}')"><i data-lucide="rotate-ccw" width="20" height="20"></i></button></div></div>
                </div>
                <div class="row wc-only-row" style="justify-content:space-between; align-items:center; gap:10px; margin-top:12px;"><div class="row" style="align-items:center; gap:6px; min-width:0;"><label class="ad-opt-name" for="${mode}_more_combos" style="margin:0;">All combinations <span id="${mode}_more_combos_count" class="more-combos-count"></span></label><span id="${mode}_more_combos_reset"></span></div><input type="checkbox" id="${mode}_more_combos" data-more="combos" class="bojro-switch" onchange="MoreSettings.paintCombos('${mode}')"></div>
                ${mode === 'xl' ? `<div class="row" style="gap:10px; margin-top:10px;">${select(mode, 'refiner', 'Refiner', 'checkpoint', 'Select Refiner').replace('<div class="col">', '<div class="col" style="flex:2;">')}<div class="col"><label>Switch At</label><input type="number" id="${mode}_more_refiner_switch" data-more="refiner_switch" value="0.8" min="0.01" max="1" step="0.01"></div></div>` : ''}
                ${mode === 'xl' || mode === 'anima' ? `<div class="row" style="justify-content:space-between; align-items:center; margin-top:12px;"><label class="ad-opt-name" for="${mode}_more_tiling" style="margin:0;">Tiling (seamless)</label><input type="checkbox" id="${mode}_more_tiling" data-more="tiling" class="bojro-switch"></div>` : ''}`));
        }
        // Saved values back, then saved on change.
        document.querySelectorAll(`[id^="${mode}_more_"]`).forEach(input => {
            const f = input.dataset.more;
            if (SOURCES[f]) return;
            const v = f === 'combos' ? null : localStorage.getItem(key(mode, f));
            if (v !== null) { if (input.type === 'checkbox') input.checked = v === 'true'; else input.value = v; }
            if (f === 'subseed_strength') { const n = parseFloat(input.value), r = isNaN(n) ? 0 : Math.round(Math.min(1, Math.max(0, n)) * 100) / 100; input.value = Number.isInteger(r * 10) ? r.toFixed(1) : r.toFixed(2); }
            input.addEventListener(input.tagName === 'TEXTAREA' ? 'input' : 'change', () => {
                localStorage.setItem(key(mode, f), input.type === 'checkbox' ? String(input.checked) : input.value);
            });
        });
        Object.keys(SOURCES).forEach(f => {
            const target = el(mode, f);
            const source = document.getElementById(mode + SOURCES[f]);
            if (!target || !source) return;
            copyOptions(mode, f);
            target.addEventListener('change', () => localStorage.setItem(key(mode, f), target.value));
            // The tab's list is filled once connected.
            new MutationObserver(() => copyOptions(mode, f)).observe(source, { childList: true });
        });
        // The count follows the prompt; emptied by hand, All combinations goes off.
        const prompt = document.getElementById(`${mode}_prompt`);
        if (prompt) prompt.addEventListener('input', () => { if (!prompt.value.trim()) combosOff(mode); paintCombosSoon(mode); });
        paintCombos(mode);
        ['hr', 'seed'].forEach(part => typeof initGenericSectionClosed === 'function' && initGenericSectionClosed(`grp-${mode}-${part}-more`, `arr-${mode}-${part}-more`, `bojro_vis_${mode}_${part}_more`));
    }

    // All combinations' line: how many images the prompt makes.
    function paintCombos(mode) {
        const line = document.getElementById(`${mode}_more_combos_count`);
        if (!line) return;
        const prompt = document.getElementById(`${mode}_prompt`);
        const typed = prompt ? prompt.value : '';
        const text = window.ForgeCouple && ForgeCouple.promptFor ? ForgeCouple.promptFor(mode, typed) : typed;
        const c = window.Wildcards && Wildcards.comboCount ? Wildcards.comboCount(text, mode) : { total: 0, n: 0, next: 1 };
        // (16); (100 of 240) when a run makes fewer than all; (6/16) when the next run starts after an abort.
        const resume = c.n > 1 && c.next > 1;
        line.textContent = c.total < 2 ? '' : resume ? `(${c.next}/${c.total})` : c.total > c.n ? `(${c.n} of ${c.total})` : `(${c.total})`;
        const rs = document.getElementById(`${mode}_more_combos_reset`);
        if (rs) rs.innerHTML = resume ? `<button type="button" class="order-reset combos-reset" title="Start again" aria-label="Start again" onclick="Wildcards.comboReset('${mode}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></button>` : '';
        // Batch Count shows the number of images and can't be changed while it's on; off, it has its own number back.
        const sw = el(mode, 'combos'), count = document.getElementById(`${mode}_batch_count`);
        if (count) {
            if (sw && sw.checked && !(window.Wildcards && !Wildcards.enabled())) {
                if (count.dataset.combosWas == null) count.dataset.combosWas = count.value;
                count.value = String(Math.max(1, c.n));
                count.disabled = true;
                count.classList.add('combos-locked');
            } else if (count.dataset.combosWas != null) {
                count.value = count.dataset.combosWas;
                delete count.dataset.combosWas;
                count.disabled = false;
                count.classList.remove('combos-locked');
            }
        }
        // Group tokens need the LoRA list: counted again once it's loaded.
        if (window.RandomTokens && RandomTokens.hasGroupToken && RandomTokens.hasGroupToken(text) && window.LoraManager && !(LoraManager.allLoras || []).length && !line.dataset.waiting) {
            line.dataset.waiting = '1';
            RandomTokens.ensureLoras().then(() => { delete line.dataset.waiting; if ((LoraManager.allLoras || []).length) paintCombos(mode); });
        }
    }
    // All combinations off (the prompt emptied or reset; ui.js calls it for the bin and reset buttons).
    function combosOff(mode) {
        const sw = el(mode, 'combos');
        if (!sw || !sw.checked) return;
        sw.checked = false;
        localStorage.setItem(key(mode, 'combos'), 'false');
        paintCombos(mode);
    }
    const timers = {};
    function paintCombosSoon(mode) { clearTimeout(timers[mode]); timers[mode] = setTimeout(() => paintCombos(mode), 300); }
    // The count also follows text the app puts in a prompt (.value, no input event: wildcards, styles, LoRAs, Reroll),
    // the Forge Couple region boxes, Forge Couple on/off, and the wildcard library (paintAllSoon()).
    const BOX = /^(xl|flux|qwen|anima|krea)_(?:prompt|fc\d+)$/;
    const wrapValue = obj => {
        const d = Object.getOwnPropertyDescriptor(obj, 'value');
        if (!d || !d.set || d.set._combos) return;
        const set = function (v) { d.set.call(this, v); const m = BOX.exec(this.id || ''); if (m) paintCombosSoon(m[1]); };
        set._combos = true;
        Object.defineProperty(obj, 'value', { configurable: true, enumerable: d.enumerable, get: d.get, set });
    };
    function watchPrompts() {
        wrapValue(HTMLTextAreaElement.prototype);
        MODES.forEach(m => { const t = document.getElementById(`${m}_prompt`); if (t && Object.getOwnPropertyDescriptor(t, 'value')) wrapValue(t); });
    }
    document.addEventListener('input', e => { const m = BOX.exec((e.target && e.target.id) || ''); if (m) paintCombosSoon(m[1]); }, true);
    document.addEventListener('change', e => { if (e.target && /forge|couple|fc/i.test(e.target.id || '')) MODES.forEach(paintCombosSoon); }, true);
    document.addEventListener('click', e => { if (e.target && e.target.closest && e.target.closest('[id^="fc-"]')) MODES.forEach(paintCombosSoon); }, true);
    // Boxes given their own .value later (LoRA sliders) are wrapped too.
    window.addEventListener('load', () => { watchPrompts(); setTimeout(watchPrompts, 1500); });
    const paintAllSoon = () => MODES.forEach(paintCombosSoon);

    // Adds what's set to a job built from the tab (buildJobFromUI(), engine.js).
    function apply(job) {
        const mode = job && job.mode;
        if (!MODES.includes(mode) || !job.payload) return;
        const p = job.payload;
        const val = f => { const e = el(mode, f); return e ? (e.type === 'checkbox' ? e.checked : e.value.trim()) : ''; };
        if (p.enable_hr) {
            if (val('hr_sampler')) p.hr_sampler_name = val('hr_sampler');
            if (val('hr_scheduler')) p.hr_scheduler = val('hr_scheduler');
            if (val('hr_checkpoint')) p.hr_checkpoint_name = val('hr_checkpoint');
            if (val('hr_prompt')) p.hr_prompt = val('hr_prompt');
            if (val('hr_negative')) p.hr_negative_prompt = val('hr_negative');
        }
        const strength = parseFloat(val('subseed_strength'));
        if (strength > 0) {
            p.subseed = typeof parseSeedValue === 'function' ? parseSeedValue(val('var_seed')) : parseInt(val('var_seed'), 10);
            p.subseed_strength = Math.min(1, strength);
        }
        if (val('refiner')) {
            p.refiner_checkpoint = val('refiner');
            const at = parseFloat(val('refiner_switch'));
            p.refiner_switch_at = at > 0 && at <= 1 ? at : 0.8;
        }
        if (val('tiling') === true) p.tiling = true;
        // All combinations: its count in place of Batch Count (wildcards.js gives each image its options).
        // Not while Reroll keeps picks (its images keep theirs).
        const keeping = window.WcReroll && WcReroll.armed() && WcReroll.armed().mode === mode;
        if (val('combos') === true && !keeping && window.Wildcards && Wildcards.comboCount) {
            const c = Wildcards.comboCount(p.prompt, mode);
            if (c.n > 1) { job.combos = true; p.n_iter = c.n; }
        }
        // Batch Count shows the combinations; without them (Reroll keeping picks) the job has the box's own number.
        const box = document.getElementById(`${mode}_batch_count`);
        if (!job.combos && box && box.dataset.combosWas != null) p.n_iter = parseInt(box.dataset.combosWas, 10) || 1;
    }

    window.MoreSettings = {
        start: () => { MODES.forEach(build); if (window.lucide) lucide.createIcons(); if (typeof initModelPickers === 'function') initModelPickers(); },
        apply, paintCombos, combosOff, paintAllSoon,
        // Strength as shown: 0 to 1, at least one decimal, two at most (0 -> "0.0", 0.25 stays, 0.256 -> "0.26").
        tidyStrength: e => {
            const n = parseFloat(e.value);
            const r = isNaN(n) ? 0 : Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
            const t = Number.isInteger(r * 10) ? r.toFixed(1) : r.toFixed(2);
            if (e.value !== t) { e.value = t; e.dispatchEvent(new Event('change')); }
        },
        resetStrength: mode => { const e = el(mode, 'subseed_strength'); if (e) { e.value = '0.0'; e.dispatchEvent(new Event('change')); } },
        randomSubseed: mode => { const e = el(mode, 'var_seed'); if (e) { e.value = '-1'; localStorage.setItem(key(mode, 'var_seed'), '-1'); } }
    };
})();
