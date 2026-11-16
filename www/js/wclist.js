// Advanced editor, LIST view: each option a card (text, how often, labels, only if) that opens to edit; + OPTION;
// EXAMPLE, a pick from what's in the editor (tap it for TRY). It writes the same lines as the TEXT view (the options box).
(function () {
    const VIEW = 'bojroWcEditorView';
    const E = () => window.WcEngine;
    const $ = id => document.getElementById(id);
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const box = () => $('wcEditorText');
    const isList = () => window.WcAdvanced && WcAdvanced.on() && localStorage.getItem(VIEW) !== 'text';
    const STEPS = [0.5, 1, 2, 3, 5];
    const times = w => (w === 0.5 ? '½×' : `${w}×`);
    let openAt = -1, picking = false, draft = null;
    function reset() { openAt = -1; draft = null; picking = false; }

    // ---- tidying an option (its text only: never "3::", "?cond::", "## labels" or # lines) ----
    function tidy(t) {
        let x = String(t == null ? '' : t);
        if (typeof promptFormatOn === 'function' && promptFormatOn() && typeof formatPromptText === 'function') x = formatPromptText(x, true);
        return x.replace(/[\s,]+$/, '').replace(/^\s+/, '');
    }
    // A line with only its option text tidied, the rest exactly as written; # lines and blank ones as they are.
    function tidyLine(line) {
        const t = String(line).trim();
        if (!t || t.startsWith('#')) return line;
        const text = E().parseOption(line).text, at = text ? line.indexOf(text) : -1;
        if (at < 0) return line;
        const now = tidy(text);
        return now === text || !now ? line : line.slice(0, at) + now + line.slice(at + text.length);
    }
    // TEXT view, on leaving the box or SAVE: each option line.
    function tidyAll() {
        const b = box(), was = b.value, now = was.split('\n').map(tidyLine).join('\n');
        if (now !== was) { b.value = now; b.dispatchEvent(new Event('input', { bubbles: true })); }
    }

    // ---- an option line, apart and back together ----
    const parse = line => { const o = E().parseOption(line); return { text: o.text, w: o.weight, cond: o.cond, tags: o.tags }; };
    const build = o => (o.w !== 1 ? `${o.w}::` : '') + (o.cond ? `?${o.cond}:: ` : '') + o.text + (o.tags.length ? ` ## ${o.tags.join(', ')}` : '');
    // "?season=winter & !wet::" as terms (a pick has / no pick has / name is / name isn't); null when it uses | or brackets.
    function terms(cond) {
        if (!cond) return [];
        if (/[|()]/.test(cond)) return null;
        return cond.split(/\s*[&,]\s*/).filter(Boolean).map(t => {
            let m = /^([^!=]+?)\s*!=\s*(.+)$/.exec(t);
            if (m) return { kind: 'ne', name: m[1].trim(), value: m[2].trim() };
            m = /^([^=]+?)\s*=\s*(.+)$/.exec(t);
            if (m) return { kind: 'eq', name: m[1].trim(), value: m[2].trim() };
            return t.startsWith('!') ? { kind: 'not', name: t.slice(1).trim() } : { kind: 'has', name: t.trim() };
        });
    }
    const fromTerms = ts => ts.filter(t => t.name && (t.kind === 'has' || t.kind === 'not' || t.value))
        .map(t => (t.kind === 'has' ? t.name : t.kind === 'not' ? `!${t.name}` : `${t.name}${t.kind === 'eq' ? '=' : '!='}${t.value}`)).join(' & ');
    const KINDS = { has: 'a pick has', not: 'no pick has', eq: 'is', ne: "isn't" };
    const NEXT = { has: 'not', not: 'eq', eq: 'ne', ne: 'has' };
    // How a condition reads on a card.
    const condText = c => 'only if ' + c.replace(/\s*!=\s*/g, ' isn’t ').replace(/\s*=\s*/g, ' = ').replace(/\s*&\s*|\s*,\s*/g, ' and ').replace(/\s*\|\s*/g, ' or ').replace(/!(?=\w)/g, 'no ');

    // Labels in the library and the editor, most used first (the picker).
    function allLabels() {
        const n = new Map();
        const add = list => list.forEach(w => E().weighted(w).forEach(o => o.tags.forEach(t => n.set(t, (n.get(t) || 0) + 1))));
        const editing = E().nameKey(($('wcEditorName').value || '').trim() || '-');
        add(Wildcards._lib.read().filter(w => E().nameKey(w.name) !== editing));
        add([{ name: 'x', lines: lines() }]);
        return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    }
    const lines = () => box().value.split('\n');
    function write(ls) {
        box().value = ls.join('\n');
        box().dispatchEvent(new Event('input', { bubbles: true }));
    }

    // ---- painting ----
    function paint() {
        const adv = !!(window.WcAdvanced && WcAdvanced.on()), list = isList();
        $('wcViewSeg').classList.toggle('hidden', !adv);
        document.querySelectorAll('#wcViewSeg button').forEach(b => b.classList.toggle('on', (b.dataset.v === 'list') === list));
        $('wcTextView').classList.toggle('hidden', list);
        $('wcListView').classList.toggle('hidden', !list);
        $('wcExample').classList.toggle('hidden', !adv);
        if (adv) example(false);
        if (!list) return;
        const ls = lines();
        if (openAt >= ls.length || (openAt >= 0 && /^#/.test(ls[openAt].trim()))) reset();
        const rows = [];
        ls.forEach((l, i) => {
            const t = l.trim();
            if (i === openAt && !t) { rows.push(editorHtml(i, draft)); return; }
            if (!t || t.startsWith('#')) return;
            rows.push(i === openAt ? editorHtml(i, draft || (draft = toDraft(t))) : cardHtml(i, parse(t)));
        });
        $('wcListRows').innerHTML = rows.join('') || '<p class="wc-hint" style="margin:0 0 6px;">No options yet.</p>';
        if ($('wxText') && typeof queueAutoGrow === 'function' && typeof autoGrowOn !== 'undefined' && autoGrowOn) queueAutoGrow($('wxText'));
        $('wcListCount').textContent = String(ls.filter(l => l.trim() && !l.trim().startsWith('#')).length);
        // Opening another card keeps what was changed on the open one.
        $('wcListRows').querySelectorAll('[data-open]').forEach(r => {
            // A blue __wildcard__: that wildcard (item 40); a long press: the option's text copied (item 20).
            let held = 0, fired = false, at = null;
            r.addEventListener('pointerdown', e => {
                fired = false; at = [e.clientX, e.clientY];
                held = setTimeout(() => { held = 0; fired = true; const t = parse(lines()[+r.dataset.open].trim()).text; if (window.copyAnalyzerText) copyAnalyzerText(t); }, 500);
            });
            r.addEventListener('pointermove', e => { if (held && at && Math.hypot(e.clientX - at[0], e.clientY - at[1]) > 10) { clearTimeout(held); held = 0; } });
            ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => r.addEventListener(t, () => { if (held) { clearTimeout(held); held = 0; } }));
            r.oncontextmenu = e => e.preventDefault();
            r.onclick = e => {
                if (fired) { fired = false; return; }
                const ref = e.target.closest && e.target.closest('.wx-ref');
                if (ref) { e.stopPropagation(); Wildcards.editNested(ref.dataset.name); return; }
                const to = +r.dataset.open; if (openAt >= 0 && draft) done(); openAt = to; draft = null; picking = false; paint(); toTop();
            };
        });
        if (openAt >= 0) wireEditor();
        if (window.lucide) lucide.createIcons();
    }
    // The open option just under the editor window's top (as much of a long one as fits).
    function toTop() {
        const card = document.querySelector('#wcListRows .wx-open'), sc = document.querySelector('#wcEditorModal .modal-content');
        if (!card || !sc) return;
        const by = card.getBoundingClientRect().top - sc.getBoundingClientRect().top - 12;
        sc.scrollTo({ top: Math.max(0, sc.scrollTop + by), behavior: 'smooth' });
    }
    function cardHtml(i, o) {
        // A wildcard's name opens it; the rest colored as the prompt boxes when Color-coded prompts is on.
        const refName = n => n.replace(/\[[^\]]*\]$/, '').replace(/\([^()]*=[^()]*\)$/, '').replace(/"/g, '&quot;');
        const ref = window.PromptColors && PromptColors.on()
            ? PromptColors.html(o.text, true).replace(/<span class="pc-wc">__([^_][^]*?)__<\/span>/g, (m, n) => `<span class="pc-wc wx-ref" data-name="${refName(n)}">__${n}__</span>`)
            : esc(o.text).replace(/__([^_][^]*?)__/g, (m, n) => `<span class="wx-ref" data-name="${refName(n)}">__${n}__</span>`);
        const meta = (o.w !== 1 ? `<span class="wx-pill w">${times(o.w)}</span>` : '') + (o.cond ? `<span class="wx-pill if">${esc(condText(o.cond))}</span>` : '') + o.tags.map(t => `<span class="wx-pill">${esc(t)}</span>`).join('');
        return `<div class="wx-row" data-open="${i}"><div class="wx-main"><div class="wx-text">${ref || '<span class="wc-dim">(empty)</span>'}</div>${meta ? `<div class="wx-meta">${meta}</div>` : ''}</div><i class="wx-chev" data-lucide="chevron-right" width="16" height="16"></i></div>`;
    }
    const BIN = '<button type="button" class="btn-small wx-bin" id="wxDelete" aria-label="Delete option"><i data-lucide="trash-2" width="16" height="16"></i></button>';
    function editorHtml(i, d) {
        const steps = (STEPS.includes(d.w) ? STEPS : STEPS.concat(d.w).sort((a, b) => a - b)).map(w => `<button type="button" data-w="${w}" class="${w === d.w ? 'on' : ''}">${times(w)}</button>`).join('');
        const cond = d.raw !== null
            ? `<div class="row wx-cond-row"><input type="text" id="wxCondRaw" value="${esc(d.raw)}" autocomplete="off" spellcheck="false" style="margin:0; flex:1; min-width:0;">${BIN}</div>`
            : d.terms.map((t, k) => `<div class="wx-cond" data-k="${k}">${t.kind === 'eq' || t.kind === 'ne'
                ? `<input type="text" class="wx-in" data-f="name" value="${esc(t.name)}" placeholder="name"><button type="button" class="wx-sel" data-kind="${k}">${KINDS[t.kind]}</button><input type="text" class="wx-in" data-f="value" value="${esc(t.value || '')}" placeholder="value">`
                : `<button type="button" class="wx-sel" data-kind="${k}">${KINDS[t.kind]}</button><input type="text" class="wx-in" data-f="name" value="${esc(t.name)}" placeholder="label">`}<button type="button" class="wc-x" data-del="${k}" aria-label="Remove">×</button></div>`).join('')
                + '<div class="row wx-cond-row"><button type="button" class="folder-chip wc-chip" id="wxAddCond">+ CONDITION</button>' + BIN + '</div>';
        const labels = d.tags.map(t => `<button type="button" class="wx-pill wx-pill-x" data-tag="${esc(t)}">${esc(t)} ×</button>`).join('');
        const all = lines().filter(l => l.trim() && !l.trim().startsWith('#')).length, at = lines().slice(0, i + 1).filter(l => l.trim() && !l.trim().startsWith('#')).length;
        return `<div class="wx-row wx-open" data-i="${i}">
            <div class="wx-open-head"><span>OPTION ${Math.max(1, at)} OF ${Math.max(1, all, at)}</span><button type="button" class="wx-fold" id="wxFold" aria-label="Fold"><i data-lucide="chevron-up" width="18" height="18"></i></button></div>
            <textarea id="wxText" rows="1" autocomplete="off" spellcheck="false" placeholder="what goes in the prompt">${esc(d.text)}</textarea>
            <div class="wx-field"><label>How often</label><div class="wx-steps">${steps}</div></div>
            <div class="wx-field"><label>Labels</label><div class="row wc-chips">${labels}<button type="button" class="folder-chip wc-chip${picking ? ' on' : ''}" id="wxAddLabel">+ LABEL</button></div>
                ${picking ? '<div class="wx-pick"><input type="text" id="wxLabelFind" placeholder="Find or type a new label" autocomplete="off" spellcheck="false"><div class="row wc-chips" id="wxLabelHits"></div></div>' : ''}</div>
            <div class="wx-field"><label>Only if</label>${cond}</div>
        </div>`;
    }
    // An option opened: its parts, with the condition as terms (or as typed when it uses | or brackets).
    function toDraft(line) {
        const o = parse(line), ts = terms(o.cond);
        return { text: o.text, w: o.w, tags: o.tags.slice(), terms: ts || [], raw: ts === null ? o.cond : null };
    }
    // The open card's fields back into draft (before repainting it).
    function readDraft() {
        const d = draft;
        if ($('wxText')) d.text = $('wxText').value.trim();
        if ($('wxCondRaw')) d.raw = $('wxCondRaw').value;
        document.querySelectorAll('#wcListRows .wx-cond').forEach(r => {
            const t = d.terms[+r.dataset.k];
            if (!t) return;
            t.name = (r.querySelector('[data-f=name]')?.value || '').trim();
            const v = r.querySelector('[data-f=value]');
            if (v) t.value = v.value.trim();
        });
        return d;
    }
    function wireEditor() {
        const again = fn => () => { readDraft(); fn(); paint(); };
        document.querySelectorAll('#wcListRows [data-kind]').forEach(b => { b.onclick = again(() => { const t = draft.terms[+b.dataset.kind]; t.kind = NEXT[t.kind]; }); });
        document.querySelectorAll('#wcListRows [data-del]').forEach(b => { b.onclick = again(() => draft.terms.splice(+b.dataset.del, 1)); });
        if ($('wxAddCond')) $('wxAddCond').onclick = () => {
            readDraft(); draft.terms.push({ kind: 'has', name: '', value: '' }); paint();
            const ins = document.querySelectorAll('#wcListRows .wx-cond [data-f=name]');
            if (ins.length) ins[ins.length - 1].focus();
        };
        document.querySelectorAll('#wcListRows [data-w]').forEach(b => { b.onclick = again(() => { draft.w = Number(b.dataset.w); }); });
        document.querySelectorAll('#wcListRows [data-tag]').forEach(b => { b.onclick = again(() => { draft.tags = draft.tags.filter(t => t !== b.dataset.tag); }); });
        $('wxAddLabel').onclick = () => { readDraft(); picking = !picking; paint(); if (picking) $('wxLabelFind')?.focus(); };
        if (picking) {
            const find = $('wxLabelFind');
            const hits = () => {
                const q = find.value.trim().toLowerCase();
                const all = allLabels().filter(([t]) => !draft.tags.includes(t) && (!q || t.includes(q))).slice(0, 12);
                $('wxLabelHits').innerHTML = all.map(([t, n]) => `<button type="button" class="wx-pill wx-pill-pick" data-add="${esc(t)}">${esc(t)} <span class="wx-dim">${n}</span></button>`).join('')
                    + (q && !all.some(([t]) => t === q) ? `<button type="button" class="wx-pill wx-pill-pick" data-add="${esc(q)}">+ ${esc(q)}</button>` : '');
                $('wxLabelHits').querySelectorAll('[data-add]').forEach(b => { b.onclick = () => addLabel(b.dataset.add); });
            };
            find.oninput = hits;
            find.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); if (find.value.trim()) addLabel(find.value); } };
            hits();
        }
        // An option is one line: Enter folds it (kept), as ▲ does. Leaving the box tidies it.
        if ($('wxText')) {
            $('wxText').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); done(); } };
            $('wxText').onblur = () => { const t = $('wxText'); if (!t) return; const v = tidy(t.value); if (v !== t.value) t.value = v; };
        }
        $('wxFold').onclick = () => done();
        $('wxDelete').onclick = () => { const ls = lines(); ls.splice(openAt, 1); reset(); write(ls); paint(); };
    }
    function addLabel(t) {
        readDraft();
        E().tagList(t).forEach(x => { if (!draft.tags.includes(x)) draft.tags.push(x); });
        picking = false;
        paint();
    }
    function done() {
        const d = readDraft(), ls = lines();
        d.text = tidy(d.text);
        const cond = d.raw !== null ? (d.raw.trim() || null) : (fromTerms(d.terms) || null);
        if (!d.text) ls.splice(openAt, 1);
        else ls[openAt] = build({ text: d.text, w: d.w, cond, tags: d.tags });
        reset();
        write(ls);
        paint();
    }
    // CANCEL (item 30): the open option as it was (a new empty one goes).
    function cancel() {
        if (openAt < 0) return;
        const ls = lines();
        if (openAt < ls.length && !ls[openAt].trim()) { ls.splice(openAt, 1); reset(); write(ls); } else reset();
        paint();
    }
    function addOption() {
        const ls = lines();
        while (ls.length && !ls[ls.length - 1].trim()) ls.pop();
        ls.push('');
        openAt = ls.length - 1; draft = { text: '', w: 1, tags: [], terms: [], raw: null }; picking = false;
        box().value = ls.join('\n');
        paint();
        $('wxText')?.focus();
        toTop();
    }
    function setView(v) {
        if (openAt >= 0 && draft) done();
        localStorage.setItem(VIEW, v);
        paint();
    }

    // ---- EXAMPLE: a pick from the editor as it is now ----
    let lastExample = '';
    function example(again) {
        const el = $('wcExampleText');
        if (!el) return;
        const name = ($('wcEditorName').value || '').trim() || 'this wildcard', key = E().nameKey(name);
        const text = box().value;
        if (!again && el.dataset.src === name + '\n' + text) return;
        el.dataset.src = name + '\n' + text;
        const list = Wildcards._lib.read().filter(w => E().nameKey(w.name) !== key).concat([{ name, lines: text.split('\n') }]);
        const s = E().state({ problems: [] });
        let out = E().resolve(`__${name}__`, E().compile(list), s);
        if (s.blank) out = E().tidyBlank(out);
        lastExample = out;
        if (out.trim() && window.PromptColors && PromptColors.on()) { el.innerHTML = PromptColors.html(out, false); el.classList.add('pc-text'); }
        else { el.textContent = out.trim() ? out : '(nothing)'; el.classList.remove('pc-text'); }
        el.classList.toggle('wc-dim', !out.trim());
    }
    function tryIt() {
        const name = ($('wcEditorName').value || '').trim();
        if (name) WcAdvanced.tryOpen(`__${name}__`);
    }

    // TEXT view: leaving the options box tidies each option.
    document.addEventListener('focusout', e => { if (e.target && e.target.id === 'wcEditorText') tidyAll(); });
    window.WcList = { paint, setView, addOption, cancel, done: () => { if (openAt >= 0) done(); }, editing: () => openAt >= 0, example: () => { example(true); }, tryIt, reset, parse, build, terms, tidy, tidyLine, tidyAll };
})();
