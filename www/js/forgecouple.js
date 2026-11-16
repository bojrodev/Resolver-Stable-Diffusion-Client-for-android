// Forge Couple (sd-forge-couple) on SDXL and Anima: the prompt box is the background and each region has its own box.
// BASIC splits the image evenly; ADVANCED takes boxes dragged on a preview. Shown from Config > Extensions.
(function () {
    const MODES = ['xl', 'anima'];
    const SHOW_KEY = 'bojroForgeCouple', STATE_KEY = 'bojroCoupleState', ALL_KEY = 'bojroFcAllSliders';
    const EXT_URL = 'https://github.com/Haoming02/sd-forge-couple';
    const COLOURS = ['#4dd0e1', '#f06292', '#aed581', '#ffb74d', '#b39ddb'];
    const MAX = 5, SNAP = 0.05, MIN_SIZE = 0.1;
    const $ = id => document.getElementById(id);
    const shown = () => localStorage.getItem(SHOW_KEY) === 'true';
    let state = {};
    try { state = JSON.parse(localStorage.getItem(STATE_KEY)) || {}; } catch (e) {}
    const selected = { xl: 0, anima: 0 };
    let lastTap = null;
    // The region box last tapped per tab (null: the prompt box), where a LoRA's trigger words go.
    const lastBox = { xl: null, anima: null };
    document.addEventListener('pointerdown', e => { lastTap = e.target; }, true);

    const fresh = () => ({ on: false, mode: 'basic', dir: 'h', bgw: 0.5, hr: false, edited: false, regions: [{ t: '' }, { t: '' }] });
    function st(m) {
        const s = state[m] = Object.assign(fresh(), state[m]);
        if (!Array.isArray(s.regions) || s.regions.length < 2) s.regions = fresh().regions;
        return s;
    }
    const save = () => { try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {} };
    const active = m => MODES.includes(m) && shown() && st(m).on;
    const r2 = v => Math.round(v * 100) / 100;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const snap = v => r2(Math.round(v / SNAP) * SNAP);
    const sel = m => Math.min(selected[m] || 0, st(m).regions.length - 1);

    // Even strips, as BASIC splits the image; ADVANCED starts from these until a region is moved.
    function strips(s) {
        const n = s.regions.length;
        return s.regions.map((r, i) => (s.dir === 'v' ? [0, 1, r2(i / n), r2((i + 1) / n)] : [r2(i / n), r2((i + 1) / n), 0, 1]));
    }
    const boxOf = (s, i) => (s.edited && s.regions[i].box) || strips(s)[i];
    const weightOf = r => (typeof r.w === 'number' && r.w >= 0 ? r.w : 1);
    // A weight as shown: at least one decimal, at most two (1 -> "1.0", 0.25 -> "0.25").
    const wText = n => { const r = Math.round(n * 100) / 100; return Number.isInteger(r * 10) ? r.toFixed(1) : r.toFixed(2); };
    function names(s) {
        const n = s.regions.length;
        if (s.mode === 'basic' && n <= 3) {
            const h = s.dir === 'v' ? ['Top', 'Middle', 'Bottom'] : ['Left', 'Middle', 'Right'];
            return n === 2 ? [h[0], h[2]] : h;
        }
        return s.regions.map((r, i) => `Region ${i + 1}`);
    }
    function describe([x1, x2, y1, y2]) {
        const pct = v => Math.round(v * 100);
        const across = x1 === 0 && x2 === 1 ? 'full width' : `${pct(x1)}–${pct(x2)}% across`;
        const down = y1 === 0 && y2 === 1 ? 'full height' : `${pct(y1)}–${pct(y2)}% down`;
        return `${across} • ${down}`;
    }
    const icons = () => { if (window.lucide) lucide.createIcons(); };

    // ---- the region boxes, under the prompt box ----
    function renderRegions(m) {
        const s = st(m), box = $(`fc-${m}-regions`);
        if (!box) return;
        const nm = names(s), rows = localStorage.getItem('bojroTallPrompt') === 'true' ? 4 : 2;
        box.innerHTML = '';
        s.regions.forEach((r, i) => {
            if (i) box.insertAdjacentHTML('beforeend', `<button type="button" class="fc-swap" aria-label="Swap ${nm[i - 1]} and ${nm[i]}" onclick="ForgeCouple.swap('${m}', ${i})"><i data-lucide="arrow-up-down" width="16" height="16"></i></button>`);
            const wrap = document.createElement('div');
            wrap.innerHTML = `<div class="fc-reg-head"><span class="fc-dot" style="background:${COLOURS[i]}"></span><label for="${m}_fc${i}">${nm[i]}</label><button type="button" class="btn-icon fc-clear" aria-label="Clear ${nm[i]}" onclick="ForgeCouple.clear('${m}', ${i})"><i data-lucide="trash-2" width="16" height="16"></i></button>${s.regions.length > 2 ? `<button type="button" class="btn-icon fc-del" aria-label="Remove ${nm[i]}" onclick="ForgeCouple.remove('${m}', ${i})"><i data-lucide="x" width="18" height="18"></i></button>` : ''}</div><textarea id="${m}_fc${i}" class="fc-text" rows="${rows}" placeholder="${nm[i]}: who or what is here"></textarea>`;
            const ta = wrap.querySelector('textarea');
            ta.value = r.t || '';
            ta.addEventListener('input', () => { r.t = ta.value; save(); });
            ta.addEventListener('focus', () => { lastBox[m] = i; });
            ta.addEventListener('blur', () => {
                if (typeof promptFormatOnBlur !== 'function' || !promptFormatOnBlur()) return;
                const n = tidy(m, ta);
                if (n && typeof Toast !== 'undefined') Toast.show({ text: `Removed ${n} duplicate prompt${n === 1 ? '' : 's'}`, duration: 'short' });
            });
            box.appendChild(wrap);
        });
        if (window.Wildcards && Wildcards.paintBoxButtons) Wildcards.paintBoxButtons();
        if (s.regions.length < MAX) box.insertAdjacentHTML('beforeend', `<button type="button" class="fc-add" onclick="ForgeCouple.add('${m}')"><i data-lucide="plus" width="16" height="16"></i>REGION</button>`);
        icons();
        if (typeof refitPromptBoxes === 'function') refitPromptBoxes();
    }
    // Prompt Auto-Formatting's tidy-up, as the prompt box gets; returns how many duplicates went.
    function tidy(m, el) {
        if (typeof tidyPromptBox !== 'function') return 0;
        const r = tidyPromptBox(el, m);
        if (r.changed) { st(m).regions[+el.id.split('_fc')[1]].t = el.value; save(); }
        return r.removed;
    }

    // ---- the card, above Hi-Res Fix ----
    function buildCard(m) {
        const hr = $(`${m}_hr_enable`) && $(`${m}_hr_enable`).closest('.glass-box');
        const tools = document.querySelector(`#mode-${m}-container .prompt-tools`);
        if (!hr || !tools || $(`fc-${m}-card`)) return;
        tools.insertAdjacentHTML('afterend', `<div id="fc-${m}-regions" class="fc-regions hidden"></div>`);
        $(`${m}_prompt`).insertAdjacentHTML('afterend', `<span id="fc-${m}-bgtag" class="fc-bgtag hidden">BACKGROUND</span>`);
        hr.insertAdjacentHTML('beforebegin', `<div id="fc-${m}-card" class="glass-box fc-card hidden">
            <div class="row" style="justify-content:space-between; margin-bottom:5px; align-items:center;">
                <div class="row" style="width:auto; gap:10px; align-items:center;">
                    <label for="${m}_fc_enable" style="margin:0; line-height:20px; min-width:135px; font-size: var(--fs-section);"><i data-lucide="columns-2" width="20" height="20"></i> Forge Couple</label>
                    <input type="checkbox" id="${m}_fc_enable" class="bojro-switch" onchange="ForgeCouple.setOn('${m}', this.checked)" onclick="event.stopPropagation()">
                </div>
                <i id="arr-${m}-fc" data-lucide="chevron-down" width="14" height="14" style="cursor:pointer; transition: transform 0.2s;" onclick="toggleGeneric('grp-${m}-fc', 'arr-${m}-fc', 'bojro_vis_${m}_fc')"></i>
            </div>
            <div id="grp-${m}-fc" class="hidden">
                <div id="fc-${m}-dyn"></div>
                <div class="row" style="margin-top:10px;"><div class="col"><label>Background Weight</label><input data-slider-label="Background Weight" type="number" id="${m}_fc_bgw" value="${wText(st(m).bgw)}" step="0.05" min="0.1" max="1.5" onchange="ForgeCouple.setBgw('${m}', this.value); if (!isNaN(parseFloat(this.value))) this.value = ForgeCouple.wText(parseFloat(this.value))"></div></div>
                <div class="row ad-more-switch" style="margin-top:10px;"><label class="ad-opt-name" for="${m}_fc_hr">Also during Hi-Res Fix</label><input type="checkbox" id="${m}_fc_hr" class="bojro-switch" onchange="ForgeCouple.setHr('${m}', this.checked)"></div>
            </div>
        </div>`);
        $(`${m}_prompt`).addEventListener('focus', () => { lastBox[m] = null; });
        if (typeof upgradeControlNetSliders === 'function') upgradeControlNetSliders($(`fc-${m}-card`));
        if (typeof initGenericSectionClosed === 'function') initGenericSectionClosed(`grp-${m}-fc`, `arr-${m}-fc`, `bojro_vis_${m}_fc`);
        ['width', 'height'].forEach(f => { const e = $(`${m}_${f}`); if (e) { e.addEventListener('input', () => drawPrev(m, true)); e.addEventListener('change', () => drawPrev(m, true)); } });
    }

    function renderCard(m) {
        const s = st(m), dyn = $(`fc-${m}-dyn`);
        if (!dyn) return;
        const adv = s.mode === 'advanced';
        const seg = (opts, cur, fn) => `<div class="ad-seg">${opts.map(([v, t]) => `<div class="toggle-opt${v === cur ? ' active' : ''}" onclick="ForgeCouple.${fn}('${m}', '${v}')">${t}</div>`).join('')}</div>`;
        let h = `<label class="fc-sub">Mode</label>${seg([['basic', 'BASIC'], ['advanced', 'ADVANCED']], s.mode, 'setMode')}`;
        if (!adv) h += `<label class="fc-sub">Direction</label>${seg([['h', 'SIDE BY SIDE'], ['v', 'STACKED']], s.dir, 'setDir')}`;
        h += `<div id="fc-${m}-prev" class="fc-prev${adv ? ' fc-edit' : ''}"></div>`;
        if (adv) h += `<div class="fc-note"><span>Drag a region to move it, its corners to resize.</span><button type="button" class="btn-small fc-reset" onclick="ForgeCouple.resetLayout('${m}')">RESET</button></div><div id="fc-${m}-rows"></div>`;
        dyn.innerHTML = h;
        drawPrev(m);
        if (adv) { renderRows(m); $(`fc-${m}-prev`).addEventListener('pointerdown', e => drag(m, e)); }
        const sw = $(`${m}_fc_enable`), hr = $(`${m}_fc_hr`), bgw = $(`${m}_fc_bgw`);
        if (sw) sw.checked = !!s.on;
        if (hr) hr.checked = !!s.hr;
        if (bgw && parseFloat(bgw.value) !== s.bgw) bgw.value = wText(s.bgw);
    }

    // The image's shape with each region on it; ADVANCED also shows overlaps and the picked region's corners.
    // keep (a size change): what was last tapped below the preview, else the width box, stays put on screen.
    function drawPrev(m, keep) {
        const prev = $(`fc-${m}-prev`);
        if (!prev) return;
        const below = el => el && el.isConnected && (prev.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
        const anchor = keep ? (below(lastTap) ? lastTap : $(`${m}_width`)) : null;
        const top0 = anchor ? anchor.getBoundingClientRect().top : 0;
        drawShape(m, prev);
        if (anchor) { const d = anchor.getBoundingClientRect().top - top0; if (Math.abs(d) >= 1) window.scrollBy(0, d); }
    }
    function drawShape(m, prev) {
        const s = st(m);
        const W = parseInt($(`${m}_width`) && $(`${m}_width`).value, 10) || 1024, H = parseInt($(`${m}_height`) && $(`${m}_height`).value, 10) || 1024;
        prev.style.aspectRatio = `${W} / ${H}`;
        // Full width up to 1.5 times as tall as wide (a square fills it; tall portraits narrow).
        prev.style.width = `min(100%, ${Math.round(150 * W / H)}%)`;
        prev.classList.toggle('fc-v', s.dir === 'v');
        const adv = s.mode === 'advanced', nm = names(s), boxes = s.regions.map((r, i) => (adv ? boxOf(s, i) : strips(s)[i]));
        const pos = ([x1, x2, y1, y2]) => `left:${x1 * 100}%;top:${y1 * 100}%;width:${r2(x2 - x1) * 100}%;height:${r2(y2 - y1) * 100}%;`;
        let h = '';
        boxes.forEach((b, i) => {
            h += `<div class="fc-r${adv && i === sel(m) ? ' sel' : ''}" data-i="${i}" style="${pos(b)}background:${COLOURS[i]}26;border-color:${COLOURS[i]};color:${COLOURS[i]}">${adv ? i + 1 : nm[i].toUpperCase()}</div>`;
        });
        if (adv) {
            for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i], b = boxes[j];
                const o = [Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.min(a[3], b[3])];
                if (o[1] - o[0] > 0.001 && o[3] - o[2] > 0.001) h += `<div class="fc-both" style="${pos(o)}">${o[1] - o[0] >= 0.15 && o[3] - o[2] >= 0.15 ? 'BOTH' : ''}</div>`;
            }
            const [x1, x2, y1, y2] = boxes[sel(m)], c = COLOURS[sel(m)];
            [['tl', x1, y1], ['tr', x2, y1], ['bl', x1, y2], ['br', x2, y2]].forEach(([k, x, y]) => {
                h += `<div class="fc-h" data-c="${k}" style="left:${x * 100}%;top:${y * 100}%;border-color:${c}"></div>`;
            });
        }
        prev.innerHTML = h;
    }

    function renderRows(m) {
        const s = st(m), rows = $(`fc-${m}-rows`);
        if (!rows) return;
        const nm = names(s);
        rows.innerHTML = s.regions.map((r, i) => `<div class="fc-row${i === sel(m) ? ' sel' : ''}" style="--c:${COLOURS[i]}" onclick="ForgeCouple.pick('${m}', ${i})">
            <span class="fc-dot" style="background:${COLOURS[i]}"></span>
            <div class="fc-row-txt"><b>${nm[i]}</b><small id="fc-${m}-desc${i}">${describe(boxOf(s, i))}</small></div>
            <label class="fc-wlab" for="${m}_fc_w${i}">Weight</label>
            <input type="number" id="${m}_fc_w${i}" value="${wText(weightOf(r))}" min="0" max="5" step="0.1" onclick="event.stopPropagation()" onchange="ForgeCouple.setWeight('${m}', ${i}, this.value, this)">
        </div>`).join('');
    }

    // Moving or resizing a region (ADVANCED), to the nearest 5%.
    function drag(m, e) {
        const s = st(m), prev = $(`fc-${m}-prev`);
        const handle = e.target.closest('.fc-h'), reg = e.target.closest('.fc-r');
        if (!handle && !reg) return;
        e.preventDefault();
        if (!s.edited) { s.regions.forEach((r, i) => { r.box = strips(s)[i]; }); s.edited = true; }
        const i = handle ? sel(m) : +reg.dataset.i;
        if (i !== sel(m)) { selected[m] = i; renderRows(m); }
        const rect = prev.getBoundingClientRect(), start = s.regions[i].box.slice(), x0 = e.clientX, y0 = e.clientY;
        const corner = handle ? handle.dataset.c : '';
        drawPrev(m);
        const move = ev => {
            const dx = (ev.clientX - x0) / rect.width, dy = (ev.clientY - y0) / rect.height;
            let [x1, x2, y1, y2] = start;
            if (!corner) {
                const w = r2(x2 - x1), h = r2(y2 - y1);
                x1 = clamp(snap(x1 + dx), 0, r2(1 - w)); x2 = r2(x1 + w);
                y1 = clamp(snap(y1 + dy), 0, r2(1 - h)); y2 = r2(y1 + h);
            } else {
                if (corner[1] === 'l') x1 = clamp(snap(x1 + dx), 0, r2(x2 - MIN_SIZE)); else x2 = clamp(snap(x2 + dx), r2(x1 + MIN_SIZE), 1);
                if (corner[0] === 't') y1 = clamp(snap(y1 + dy), 0, r2(y2 - MIN_SIZE)); else y2 = clamp(snap(y2 + dy), r2(y1 + MIN_SIZE), 1);
            }
            s.regions[i].box = [x1, x2, y1, y2];
            drawPrev(m);
            const d = $(`fc-${m}-desc${i}`);
            if (d) d.textContent = describe(s.regions[i].box);
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            save();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
    }

    function paint(m) {
        const s = st(m), act = active(m);
        const card = $(`fc-${m}-card`);
        if (!card) return;
        card.classList.toggle('hidden', !shown());
        $(`fc-${m}-regions`).classList.toggle('hidden', !act);
        $(`fc-${m}-bgtag`).classList.toggle('hidden', !act);
        $(`${m}_prompt`).classList.toggle('fc-bg', act);
        if (!act) $(`${m}_prompt`).classList.remove('fc-bg-row');
        $(`${m}_fc_enable`).checked = !!s.on;
        if (typeof fitPromptBox === 'function') fitPromptBox($(`${m}_prompt`));
        if (act && typeof refitPromptBoxes === 'function') refitPromptBoxes();
        if (window.LoraSliders) LoraSliders.refreshAll();
    }
    function render(m) { renderRegions(m); renderCard(m); paint(m); }
    // Whether the box's last line (or scrolled text) would run under its BACKGROUND tag, measured with a copy of the box.
    function needsRow(box) {
        const tag = document.getElementById(`fc-${box.id.replace(/_prompt$/, '')}-bgtag`);
        if (!tag || tag.classList.contains('hidden')) return false;
        if (box.scrollHeight > box.clientHeight + 1) return true;
        const cs = getComputedStyle(box), cp = document.createElement('div');
        ['font', 'letterSpacing', 'wordSpacing', 'textIndent', 'lineHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
         'tabSize', 'wordBreak', 'overflowWrap', 'textTransform'].forEach(k => { cp.style[k] = cs[k]; });
        Object.assign(cp.style, { position: 'absolute', visibility: 'hidden', left: '-9999px', top: '0', boxSizing: 'border-box', border: '0',
            width: `${box.clientWidth}px`, whiteSpace: 'pre-wrap' });
        cp.textContent = box.value;
        const end = document.createElement('span'); end.textContent = '\u200b'; cp.appendChild(end);
        document.body.appendChild(cp);
        const x = end.offsetLeft, bottom = end.offsetTop + end.offsetHeight;
        cp.remove();
        const b = box.getBoundingClientRect(), t = tag.getBoundingClientRect();
        return bottom > t.top - b.top - box.clientTop && x > t.left - b.left - box.clientLeft - 6;
    }

    // True when every point of the image lies in at least one region.
    function covers(mapping) {
        for (let y = 0.0125; y < 1; y += 0.025) for (let x = 0.0125; x < 1; x += 0.025) {
            if (!mapping.some(([x1, x2, y1, y2]) => x >= x1 && x <= x2 && y >= y1 && y <= y2)) return false;
        }
        return true;
    }
    function fail(text) {
        if (typeof Toast !== 'undefined') Toast.show({ text, duration: 'long' });
        window.__buildJobOwnMessageShown = true;
        return false;
    }

    // Adds Forge Couple to a job built from the tab (buildJobFromUI(), engine.js); false when it can't be sent.
    function apply(job) {
        const m = job && job.mode;
        if (!active(m) || !job.payload) return true;
        const s = st(m), p = job.payload, nm = names(s), adv = s.mode === 'advanced';
        // Forge Couple reads one line per region, so a box's own line breaks become commas.
        const flat = t => String(t || '').split('\n').map(l => l.trim().replace(/,\s*$/, '')).filter(Boolean).join(', ');
        const bg = flat(p.prompt), regs = s.regions.map(r => flat(r.t));
        const empty = regs.findIndex(t => !t);
        if (empty >= 0) return fail(`Forge Couple: ${nm[empty]} has no prompt`);
        let lines = bg ? [bg, ...regs] : regs, mapping = null;
        if (adv) {
            mapping = s.regions.map((r, i) => [...boxOf(s, i), weightOf(r)]);
            if (bg) mapping.unshift([0, 1, 0, 1, s.bgw]);
            else if (!covers(mapping)) return fail('Forge Couple: the regions must cover the whole image, or write a background prompt');
        }
        p.prompt = lines.join('\n');
        p.alwayson_scripts = {
            ...(p.alwayson_scripts || {}),
            'forge couple': { args: [true, !s.hr, adv ? 'Advanced' : 'Basic', '', adv ? null : (s.dir === 'v' ? 'Vertical' : 'Horizontal'),
                adv ? null : (bg ? 'First Line' : 'None'), adv ? null : s.bgw, mapping, 'off', false, false, null, null, null, null, null, null] }
        };
        job.fcRegions = s.regions.map(r => r.t);
        // Which character each prompt line is for (Scene optimization, scene.js).
        job.fcLabels = (bg ? ['Background'] : []).concat(nm.map(x => `${x} character`));
        // For Reroll (wcreroll.js): the boxes' texts as sent, and each prompt line's region name.
        job.fcInfo = { bg, regions: regs, names: (bg ? ['Background'] : []).concat(nm) };
        return true;
    }

    // Prompt history or Analyze putting a prompt back: its regions, or Forge Couple off when it had none.
    function restore(m, regs, opts) {
        if (!MODES.includes(m)) return;
        const s = st(m);
        if (!Array.isArray(regs) || regs.length < 2) {
            if (s.on) { s.on = false; save(); paint(m); }
            return;
        }
        const old = s.regions;
        s.regions = regs.slice(0, MAX).map((t, i) => ({ ...(old[i] || {}), t: String(t) }));
        Object.assign(s, opts || {}, { on: true });
        save();
        render(m);
    }

    // Analyze's Use In: an image made with Forge Couple fills the region boxes and returns the background prompt.
    function fromAnalyzed(m, a) {
        const pos = (a && a.pos) || '', params = (a && a.params) || '';
        if (!MODES.includes(m)) return pos;
        const get = k => {
            const r = new RegExp(`${k}:\\s*("(?:[^"\\\\]|\\\\.)*"|[^,]*)`).exec(params);
            if (!r) return null;
            let v = r[1].trim();
            if (v.startsWith('"')) { try { v = JSON.parse(v); } catch (e) { v = v.slice(1, -1); } }
            return v;
        };
        const mode = String(get('forge_couple_mode') || '').toLowerCase();
        if (!/forge_couple:\s*True/i.test(params) || !['basic', 'advanced'].includes(mode)) { restore(m, null); return pos; }
        const sep = get('forge_couple_separator');
        const lines = pos.split(!sep || sep === '\\n' || sep === '\n' ? '\n' : sep.replace(/\\n/g, '\n')).map(l => l.trim());
        const opts = { mode, hr: String(get('forge_couple_compatibility')).toLowerCase() === 'false' };
        let bg = '';
        if (mode === 'advanced') {
            let mapping = null;
            try { mapping = JSON.parse(get('forge_couple_mapping')); } catch (e) {}
            if (!Array.isArray(mapping) || mapping.length !== lines.length) { restore(m, null); return pos; }
            const full = b => b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 1;
            if (lines.length > 2 && full(mapping[0])) { bg = lines.shift(); opts.bgw = mapping.shift()[4]; }
            if (lines.length < 2) { restore(m, null); return pos; }
            restore(m, lines, { ...opts, edited: true });
            st(m).regions.forEach((r, i) => { r.box = mapping[i].slice(0, 4).map(Number); r.w = Number(mapping[i][4]); });
        } else {
            const back = get('forge_couple_background');
            if (back === 'First Line') bg = lines.shift(); else if (back === 'Last Line') bg = lines.pop();
            const w = parseFloat(get('forge_couple_background_weight'));
            if (!isNaN(w)) opts.bgw = w;
            opts.dir = get('forge_couple_direction') === 'Vertical' ? 'v' : 'h';
            if (lines.length < 2) { restore(m, null); return pos; }
            restore(m, lines, opts);
        }
        save();
        render(m);
        return bg;
    }

    // An image's Forge Couple settings for showing (Analyze, item 81): null when it wasn't made with it.
    function parseInfo(a) {
        const pos = (a && a.pos) || '', params = (a && a.params) || '';
        const get = k => {
            const r = new RegExp(`${k}:\\s*("(?:[^"\\\\]|\\\\.)*"|[^,]*)`).exec(params);
            if (!r) return null;
            let v = r[1].trim();
            if (v.startsWith('"')) { try { v = JSON.parse(v); } catch (e) { v = v.slice(1, -1); } }
            return v;
        };
        const mode = String(get('forge_couple_mode') || '').toLowerCase();
        if (!/forge_couple:\s*True/i.test(params) || !['basic', 'advanced'].includes(mode)) return null;
        const sepRaw = get('forge_couple_separator');
        const newline = !sepRaw || sepRaw === '\\n' || sepRaw === '\n';
        const lines = pos.split(newline ? '\n' : sepRaw.replace(/\\n/g, '\n')).map(l => l.trim());
        const out = { mode, sep: newline ? 'New line' : sepRaw, hr: String(get('forge_couple_compatibility')).toLowerCase() === 'false', bg: null, bgw: null, bgAt: 'None', dir: 'h', regions: [] };
        if (mode === 'advanced') {
            let mapping = null;
            try { mapping = JSON.parse(get('forge_couple_mapping')); } catch (e) {}
            if (!Array.isArray(mapping) || mapping.length !== lines.length) return null;
            const full = b => b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 1;
            if (lines.length > 2 && full(mapping[0])) { out.bg = lines.shift(); out.bgw = Number(mapping.shift()[4]); out.bgAt = 'First line'; }
            out.regions = lines.map((t, i) => ({ text: t, box: mapping[i].slice(0, 4).map(Number), w: Number(mapping[i][4]) }));
        } else {
            const back = get('forge_couple_background');
            if (back === 'First Line') { out.bg = lines.shift(); out.bgAt = 'First line'; } else if (back === 'Last Line') { out.bg = lines.pop(); out.bgAt = 'Last line'; }
            const w = parseFloat(get('forge_couple_background_weight'));
            if (!isNaN(w)) out.bgw = w;
            out.dir = get('forge_couple_direction') === 'Vertical' ? 'v' : 'h';
            const n = lines.length;
            out.regions = lines.map((t, i) => ({ text: t, box: out.dir === 'v' ? [0, 1, i / n, (i + 1) / n] : [i / n, (i + 1) / n, 0, 1], w: 1 }));
        }
        if (out.regions.length < 2) return null;
        out.names = names({ mode, dir: out.dir, regions: out.regions });
        out.where = out.regions.map(r => describe(r.box).replace(/ • full (width|height)/, '').replace(/^full (width|height) • /, ''));
        return out;
    }

    async function toggleShown() {
        const sw = $('cfgForgeCoupleSwitch');
        if (sw.checked) {
            const ok = await window.appConfirm('Show Forge Couple on the SDXL and Anima tabs? Requires the Forge Couple extension installed on your Forge Neo server.',
                { title: 'Forge Couple', okText: 'SHOW', link: { text: 'sd-forge-couple', url: EXT_URL } });
            if (!ok) { sw.checked = false; return; }
        }
        localStorage.setItem(SHOW_KEY, sw.checked ? 'true' : 'false');
        MODES.forEach(paint);
        paintConfig();
    }

    const edit = (m, fn) => { fn(st(m)); save(); render(m); };
    // el stays where it was on screen while what's above it changes (region boxes shown or hidden).
    function keepStill(el, fn) {
        const t0 = el ? el.getBoundingClientRect().top : 0;
        fn();
        if (!el) return;
        const fix = () => { const d = el.getBoundingClientRect().top - t0; if (Math.abs(d) >= 1) window.scrollBy(0, d); };
        fix();
        requestAnimationFrame(() => { fix(); requestAnimationFrame(fix); });
    }
    const allSliders = () => shown() && localStorage.getItem(ALL_KEY) === 'true';
    function paintConfig() {
        const row = $('cfgFcAllSlidersRow'), sw = $('cfgFcAllSliders');
        if (row) row.classList.toggle('hidden', !shown());
        if (sw) sw.checked = localStorage.getItem(ALL_KEY) === 'true';
    }
    window.ForgeCouple = {
        needsRow,
        start() {
            MODES.forEach(m => { buildCard(m); render(m); });
            const sw = $('cfgForgeCoupleSwitch');
            if (sw) sw.checked = shown();
            paintConfig();
            // The preview follows the tab's size (set by these as well as typed).
            ['setMode', 'setRes', 'flipRes'].forEach(name => {
                const fn = window[name];
                if (typeof fn === 'function') window[name] = function (md) { const r = fn.apply(this, arguments); if (MODES.includes(md)) drawPrev(md, true); return r; };
            });
        },
        apply, restore, fromAnalyzed, toggleShown, colour: i => COLOURS[i % COLOURS.length],
        supports: m => MODES.includes(m),
        shown,
        isOn: m => active(m),
        // The prompt as a job from this tab sends it (the background, then each region's line), for counting.
        promptFor(m, text) {
            if (!active(m)) return text;
            const flat = t => String(t || '').split('\n').map(l => l.trim().replace(/,\s*$/, '')).filter(Boolean).join(', ');
            const bg = flat(text), regs = st(m).regions.map(r => flat(r.t));
            return (bg ? [bg, ...regs] : regs).join('\n');
        },
        // A tab's layout and regions (couple styles, styles.js).
        stateFor(m) {
            const s = st(m);
            return { mode: s.mode, dir: s.dir, bgw: s.bgw, hr: s.hr, edited: s.edited, regions: s.regions.map(r => JSON.parse(JSON.stringify(r))) };
        },
        // A couple style picked: Forge Couple on with its layout and regions.
        load(m, fc) {
            if (!MODES.includes(m) || !fc || !Array.isArray(fc.regions)) return;
            const s = st(m);
            ['mode', 'dir', 'bgw', 'hr', 'edited'].forEach(k => { if (fc[k] !== undefined) s[k] = fc[k]; });
            s.regions = fc.regions.slice(0, MAX).map(r => JSON.parse(JSON.stringify(r)));
            while (s.regions.length < 2) s.regions.push({ t: '' });
            s.on = true;
            selected[m] = 0;
            save();
            render(m);
        },
        // Tapped off: Forge Couple off, its region boxes emptied.
        off(m) {
            if (!MODES.includes(m)) return;
            const s = st(m);
            s.on = false;
            s.regions.forEach(r => { r.t = ''; });
            save();
            render(m);
        },
        // Region names for a layout: Left / Right, Top / Middle / Bottom, or Region 1, 2...
        parseInfo,
        regionNames: fc => names({ mode: fc.mode || 'basic', dir: fc.dir || 'h', regions: fc.regions || [] }),
        MAX,
        // A LoRA added with Forge Couple on (appInjectConfig(), boot.js): its trigger words go to the region box last tapped.
        triggerBox: m => (active(m) && lastBox[m] !== null ? $(`${m}_fc${lastBox[m]}`) : null),
        // Every tag in the region boxes, normalised (for LoRA claims, lora.js).
        regionTags: m => (MODES.includes(m) ? st(m).regions.flatMap(r => [...boxTagSet({ value: r.t || '' })]) : []),
        addTo: (el, text) => { appendTagsToBox(el, text); el.dispatchEvent(new Event('input', { bubbles: true })); },
        // A LoRA removed (LoraManager.toggle(), lora.js): its trigger words leave the region boxes too.
        removeTags(m, normSet) {
            if (!MODES.includes(m) || !normSet || !normSet.size) return;
            st(m).regions.forEach((r, i) => {
                const t = removeTagsFromText(r.t || '', normSet, true).replace(/^[\s,]+/, '').replace(/[\s,]+$/, '');
                const out = t ? withTrailingComma(t) : '';
                if (out === (r.t || '')) return;
                r.t = out;
                const e = $(`${m}_fc${i}`);
                if (e) e.value = out;
            });
            save();
        },
        // Before a job (Prompt Auto-Formatting on): each region box, as dedupePromptTagsForMode() does the prompt box.
        tidyAll: m => (active(m) ? Array.from(document.querySelectorAll(`#fc-${m}-regions textarea`)).reduce((n, el) => n + tidy(m, el), 0) : 0),
        setOn: (m, on) => keepStill($(`${m}_fc_enable`), () => edit(m, s => { s.on = !!on; })),
        active, allSliders,
        setAllSliders(on) {
            localStorage.setItem(ALL_KEY, on ? 'true' : 'false');
            if (window.LoraSliders) LoraSliders.refreshAll();
        },
        setMode: (m, v) => edit(m, s => { s.mode = v; }),
        setDir: (m, v) => edit(m, s => { s.dir = v; }),
        setBgw: (m, v) => { const n = parseFloat(v); if (!isNaN(n)) { st(m).bgw = n; save(); } },
        setHr: (m, on) => { st(m).hr = !!on; save(); },
        setWeight: (m, i, v, el) => { const n = parseFloat(v); if (!isNaN(n)) { st(m).regions[i].w = n; save(); if (el) el.value = wText(n); } },
        wText,
        pick: (m, i) => { selected[m] = i; drawPrev(m); renderRows(m); },
        add: m => edit(m, s => { if (s.regions.length < MAX) s.regions.push(s.edited ? { t: '', box: [0.25, 0.75, 0.25, 0.75] } : { t: '' }); }),
        // The bin beside a region's name empties its box; the X at the end removes the region.
        clear: (m, i) => { st(m).regions[i].t = ''; save(); const e = $(`${m}_fc${i}`); if (e) e.value = ''; },
        remove: (m, i) => edit(m, s => { if (s.regions.length > 2) s.regions.splice(i, 1); }),
        // Swaps two neighbouring regions' prompts; where the regions are stays.
        swap: (m, i) => {
            edit(m, s => { const a = s.regions[i - 1], b = s.regions[i]; [a.t, b.t] = [b.t, a.t]; });
            // A pulse on the button and both boxes shows what moved.
            [$(`${m}_fc${i - 1}`), $(`${m}_fc${i}`), document.querySelectorAll(`#fc-${m}-regions .fc-swap`)[i - 1]].forEach(el => {
                if (!el) return;
                el.classList.add('fc-pulse');
                el.addEventListener('animationend', () => el.classList.remove('fc-pulse'), { once: true });
            });
        },
        resetLayout: m => edit(m, s => { s.edited = false; s.regions.forEach(r => { delete r.box; r.w = 1; }); })
    };
})();
