// LoRA weight sliders: a LoRA with Slider on gets a slider under its box while its tag is there; the slider and the
// tag's weight follow each other.
(function () {
    const MODES = ['xl', 'flux', 'qwen', 'anima', 'krea', 'inp'];
    const BOX_IDS = MODES.flatMap(m => [`${m}_prompt`, `${m}_neg`]);
    // Finer weights are typed in the prompt; the value shows two decimals, so they read exactly. The range is each LoRA's
    // own (loraSliderRange(), ui.js).
    const STEP = 0.1, DECIMALS = 2;
    const LM = () => window.LoraManager;
    const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 0.6, 0.65, 1.0
    const weightText = w => Number(w).toFixed(2).replace(/(\.\d)0$/, '$1');
    let idCounter = 0;

    // Forge Couple on in the box's tab with "Sliders for all LoRAs": every LoRA in its prompt box has one.
    const allFor = box => { const m = box && /^(.+)_prompt$/.exec(box.id); return !!(m && window.ForgeCouple && ForgeCouple.allSliders && ForgeCouple.allSliders() && ForgeCouple.active(m[1])); };
    // The LoRAs with Slider on (all in box, by allFor()): { name, label, aliases, range, weight }, weight being the one in
    // its settings. The alias saved with the setting covers the time before the LoRA list is loaded.
    function sliderLoras(box) {
        if (typeof loraConfigs === 'undefined') return [];
        const L = LM();
        const list = Object.keys(loraConfigs).filter(n => loraConfigs[n] && loraConfigs[n].slider).map(n => entry(n, loraConfigs[n], L && (L.allLoras || []).find(l => l.name === n), []));
        if (allFor(box)) {
            const have = new Set(list.flatMap(s => s.aliases.map(a => a.toLowerCase())));
            const re = /<lora:([^:<>]+):\s*-?\d*\.?\d+[^<>]*>/gi;
            let t;
            while ((t = re.exec(box.value || ''))) {
                const alias = t[1].trim();
                if (have.has(alias.toLowerCase())) continue;
                have.add(alias.toLowerCase());
                const lora = L && (L.allLoras || []).find(l => l.name === alias || L.resolveTagIdentifier(l) === alias);
                const n = lora ? lora.name : alias;
                list.push(entry(n, loraConfigs[n] || {}, lora, [alias]));
            }
        }
        return list;
    }
    function entry(n, cfg, lora, extra) {
        const L = LM();
        const aliases = [...new Set([...extra, cfg.sliderAlias, lora && L.resolveTagIdentifier(lora), n].filter(Boolean))];
        // Unnamed: the LoRA's name without "(...)" or " - ..." ("Nami (One Piece) - Elbaf" is "Nami").
        const full = (L ? L.getDisplayName(lora || { name: n }) : n) || n;
        const label = String(cfg.sliderName || '').trim() || (typeof splitLoraName === 'function' ? splitLoraName(full)[0] : full);
        const range = typeof loraSliderRange === 'function' ? loraSliderRange(cfg) : [0.5, 1.5];
        const weight = cfg.weight !== undefined && cfg.weight !== null && cfg.weight !== '' && !isNaN(Number(cfg.weight)) ? Number(cfg.weight) : 1;
        return { name: n, label, aliases, range, weight };
    }

    // The first of a LoRA's tags in text with a number for its weight: { index, start, end, weight }; null if none.
    function findTag(text, aliases) {
        let best = null;
        aliases.forEach(a => {
            const m = new RegExp(`(<lora:${reEsc(a)}:\\s*)(-?\\d*\\.?\\d+)[^<>]*>`, 'i').exec(text);
            if (m && (!best || m.index < best.index)) {
                const start = m.index + m[1].length;
                best = { index: m.index, start, end: start + m[2].length, weight: parseFloat(m[2]) };
            }
        });
        return best;
    }

    // The sliders a box should show, alphabetically.
    function wanted(box) {
        const text = box.value || '';
        return sliderLoras(box)
            .map(s => Object.assign(s, { tag: findTag(text, s.aliases) }))
            .filter(s => s.tag)
            .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true }) || a.name.localeCompare(b.name));
    }

    // What the slider area follows: the box, or its BACKGROUND tag (Forge Couple), which must stay just under it.
    const lead = box => (box.nextElementSibling && box.nextElementSibling.classList.contains('fc-bgtag') ? box.nextElementSibling : box);
    function areaFor(box) {
        let area = lead(box).nextElementSibling;
        if (area && area.classList.contains('lora-slider-area')) return area;
        area = document.createElement('div');
        area.className = 'lora-slider-area hidden';
        lead(box).after(area);
        return area;
    }

    function saveBox(box) {
        const m = /^(.+)_(prompt|neg)$/.exec(box.id);
        if (!m) return;
        if (m[2] === 'prompt' && typeof savePrompt === 'function') savePrompt(m[1]);
        if (m[2] === 'neg' && typeof saveNegativePrompt === 'function') saveNegativePrompt(m[1]);
        if (m[1] === 'inp' && typeof saveCurrentInpaintModeStateLive === 'function') saveCurrentInpaintModeStateLive();
    }

    // Writes a slider's value into its LoRA's tag.
    function writeWeight(box, name, value) {
        const s = sliderLoras(box).find(x => x.name === name);
        const tag = s && findTag(box.value, s.aliases);
        if (!tag || Math.abs(tag.weight - value) < 1e-9) return;
        box.value = box.value.slice(0, tag.start) + weightText(value) + box.value.slice(tag.end);
    }

    // A name too wide for its 110px: its text made smaller (not under 8px) so it all shows.
    let measureCtx = null;
    function fitLabel(label) {
        label.style.fontSize = '';
        const st = getComputedStyle(label), size = parseFloat(st.fontSize) || 11;
        let text = label.textContent;
        if (st.textTransform === 'uppercase') text = text.toUpperCase();
        measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
        measureCtx.font = `${st.fontWeight} ${size}px ${st.fontFamily}`;
        const gap = parseFloat(st.letterSpacing) || 0;
        const w = measureCtx.measureText(text).width + gap * text.length, room = (parseFloat(st.width) || 110) - 2;
        if (w > room) label.style.fontSize = `${Math.max(8, Math.floor(size * room / w * 4) / 4)}px`;
    }
    function makeRow(box, s) {
        const row = document.createElement('div');
        row.className = 'lora-slider-row';
        row.dataset.name = s.name;
        row.dataset.label = s.label;
        row.dataset.range = s.range.join(',');
        row.dataset.weight = s.weight;
        const input = document.createElement('input');
        input.type = 'number';
        input.id = `loraSlider${++idCounter}`;
        input.min = s.range[0];
        input.max = s.range[1];
        input.step = STEP;
        input.value = s.tag.weight;
        input.dataset.sliderLabel = '';
        input.dataset.sliderDecimals = DECIMALS;
        input.dataset.sliderDefault = s.weight;
        const col = document.createElement('div');
        col.className = 'col';
        col.appendChild(input);
        row.appendChild(col);
        input.addEventListener('input', () => writeWeight(box, s.name, parseFloat(input.value)));
        input.addEventListener('change', () => saveBox(box));
        return row;
    }

    // Brings one box's slider area in line with its text: rows rebuilt only when the set of sliders changes.
    function refresh(box) {
        if (!box || !box.isConnected) return;
        const list = wanted(box);
        const next = lead(box).nextElementSibling;
        if (!list.length && !(next && next.classList.contains('lora-slider-area'))) return;
        const area = areaFor(box);
        const rows = [...area.querySelectorAll(':scope > .lora-slider-row')];
        const same = rows.length === list.length && rows.every((r, i) => r.dataset.name === list[i].name && r.dataset.label === list[i].label && r.dataset.range === list[i].range.join(',') && r.dataset.weight === String(list[i].weight));
        if (!same) {
            area.innerHTML = '';
            list.forEach(s => area.appendChild(makeRow(box, s)));
            if (list.length && typeof upgradeControlNetSliders === 'function') upgradeControlNetSliders(area);
            area.querySelectorAll(':scope > .lora-slider-row').forEach((row, i) => {
                const label = row.querySelector('.cn-slider-label');
                if (label) { label.textContent = list[i].label; fitLabel(label); }
                row.querySelectorAll('.slider-fake-thumb').forEach(t => t.setAttribute('aria-label', list[i].label));
            });
        } else {
            rows.forEach((row, i) => {
                const input = row.querySelector('input[type="number"]');
                if (input && parseFloat(input.value) !== list[i].tag.weight) input.value = list[i].tag.weight;
            });
        }
        area.classList.toggle('hidden', !list.length);
    }

    // Refreshes are put off to the next frame and done once per box, however many times its text changed.
    const pending = new Set();
    let frame = 0;
    function queue(box) {
        pending.add(box);
        if (!frame) frame = requestAnimationFrame(() => {
            frame = 0;
            const boxes = [...pending];
            pending.clear();
            boxes.forEach(refresh);
        });
    }
    function refreshAll() {
        BOX_IDS.forEach(id => { const el = document.getElementById(id); if (el) queue(el); });
    }

    // Typing, and text the app puts in (setting .value fires no input event).
    function watch() {
        const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
        BOX_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (!el || el._loraSliderWatch) return;
            el._loraSliderWatch = true;
            el.addEventListener('input', () => queue(el));
            if (desc && desc.set) Object.defineProperty(el, 'value', {
                configurable: true,
                get() { return desc.get.call(this); },
                set(v) { desc.set.call(this, v); queue(this); }
            });
        });
        refreshAll();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
    else watch();

    // Whether a LoRA has Slider on (the LoRA list's Sliders chip, lora.js).
    const hasSlider = name => typeof loraConfigs !== 'undefined' && !!(loraConfigs[name] && loraConfigs[name].slider);
    // Of the Slider type (its Type is Slider): what the Sliders filter shows. The Slider switch is not looked at here.
    const inSliderType = name => typeof loraConfigs !== 'undefined' && !!(loraConfigs[name] && loraConfigs[name].type === 'slider');

    window.LoraSliders = { refreshAll, hasSlider, inSliderType };
})();
