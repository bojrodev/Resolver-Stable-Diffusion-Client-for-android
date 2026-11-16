// Wildcards window, Advanced view (the BASIC/ADVANCED switch): badges, the editor's tags and rules, Used by, Try,
// Check, the YAML reader for Import (wcimport.js) and the guide. It only reads and writes the wildcards' own lines, so Basic keeps everything.
(function () {
    const KEY = 'bojroWcAdvanced';
    const E = () => window.WcEngine;
    const L = () => Wildcards._lib;
    const $ = id => document.getElementById(id);
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const on = () => localStorage.getItem(KEY) === 'true';
    const icons = () => { if (window.lucide) lucide.createIcons(); };
    const open = id => { const m = $(id); if (m.classList.contains('hidden') && typeof lockBodyScroll === 'function') lockBodyScroll(); m.classList.remove('hidden'); };
    const close = id => { const m = $(id); if (!m.classList.contains('hidden') && typeof unlockBodyScroll === 'function') unlockBodyScroll(); m.classList.add('hidden'); };

    // ---- what each wildcard holds and calls ----
    // Option lines only: # lines (notes, ## tags, #! rules) are never picked, so a __name__ in a note calls nothing.
    const live = w => w.lines.filter(l => !String(l).trim().startsWith('#'));
    const calls = w => { const out = []; live(w).forEach(l => { for (const m of String(l).matchAll(new RegExp(E().CALL.source, 'g'))) out.push(m[1]); }); return out; };
    function info(list) {
        const lib = E().compile(list), byKey = new Map(), calledBy = new Map();
        list.forEach(w => {
            const opts = E().weighted(w), lines = w.lines.map(l => String(l).trim());
            const i = { w, opts, calls: calls(w), rules: lines.filter(l => l.startsWith('#!')), tagged: opts.some(o => o.tags.length), cond: opts.some(o => o.cond),
                context: opts.length > 0 && opts.every(o => /^(\$\{[^}]*=[\s\S]*\}\s*|__[^_][\s\S]*?__\s*)+$/.test(o.text)) && opts.some(o => /\$\{[^}]*=/.test(o.text)) };
            i.missing = [...new Set(i.calls.filter(n => !E().entry(lib, n) && !/\$\{/.test(n)))];
            byKey.set(E().nameKey(w.name), i);
        });
        byKey.forEach((i, k) => i.calls.forEach(n => { const t = E().nameKey(n); if (t !== k) { if (!calledBy.has(t)) calledBy.set(t, new Set()); calledBy.get(t).add(i.w.name); } }));
        return { lib, byKey, calledBy };
    }
    let cache = null;
    const data = () => { const list = L().read(); if (!cache || cache.list !== JSON.stringify(list)) cache = { list: JSON.stringify(list), ...info(list) }; return cache; };

    // ---- the window ----
    function paint() {
        const adv = on();
        document.querySelectorAll('#wcModeSeg .toggle-opt').forEach(b => b.classList.toggle('active', (b.dataset.mode === 'advanced') === adv));
        $('wcAdvTools').classList.toggle('hidden', !adv);
        $('wcHelpBtn').classList.toggle('hidden', !adv);
        // Recently deleted: in the header in both modes (the Advanced row has import and export).
        if ($('wcDeletedBtn')) $('wcDeletedBtn').classList.remove('hidden');
        $('wcHintBasic').classList.toggle('hidden', adv);
        $('wcHintAdv').classList.toggle('hidden', !adv);
        if (adv) paintCount();
        paintEditor();
    }
    // CHECK's count of problems (Advanced only).
    function paintCount() {
        if (!on() || !$('wcCheckCount') || $('wildcardsModal').classList.contains('hidden')) return;
        const n = check().filter(x => x.bad).reduce((t, x) => t + x.items.length, 0), btn = $('wcCheckBtn');
        $('wcCheckCount').textContent = n;
        $('wcCheckCount').classList.toggle('hidden', !n);
        if (btn) btn.classList.remove('wc-check-flag');
        // CHECK stays on one line: a count that doesn't fit gives way to a red border.
        if (btn && n && btn.offsetParent && btn.scrollWidth > btn.clientWidth + 1) { $('wcCheckCount').classList.add('hidden'); btn.classList.add('wc-check-flag'); }
    }
    // Export (a window of its own, still to come).
    function exportOpen() { if (window.WcExport) WcExport.open(); }
    let countTimer = 0;
    const paintCountSoon = () => { clearTimeout(countTimer); countTimer = setTimeout(paintCount, 150); };
    function setMode(m) {
        localStorage.setItem(KEY, m === 'advanced' ? 'true' : 'false');
        paint();
        Wildcards.render();
    }
    const BADGE = (t, k = '') => `<span class="wc-badge ${k}">${t}</span>`;
    // Badges after a wildcard's name in the list (Wildcards.render(): one look at the library for the whole list).
    function badgesFor() {
        if (!on()) return () => '';
        const d = data();
        return w => badges(w, d);
    }
    function badges(w, d) {
        const i = d.byKey.get(E().nameKey(w.name));
        if (!i) return '';
        let h = '';
        if (i.context) h += BADGE('CONTEXT');
        else if (i.tagged) h += BADGE('LABELS');
        if (i.rules.length) h += BADGE(`${i.rules.length} RULE${i.rules.length > 1 ? 'S' : ''}`);
        if (i.cond) h += BADGE('IF');
        if (i.missing.length) h += BADGE(`${i.missing.length} MISSING`, 'bad');
        if (!d.calledBy.has(E().nameKey(w.name))) h += BADGE('UNUSED', 'muted');
        return h;
    }

    // ---- the editor: tags and rules as chips over its own lines ----
    const textEl = () => $('wcEditorText');
    const lines = () => textEl().value.split('\n');
    function setLines(ls) { textEl().value = ls.join('\n'); textEl().dispatchEvent(new Event('input', { bubbles: true })); clearTimeout(pending); paintEditor(); }
    function paintEditor() {
        const box = $('wcAdvEditor');
        if (!box) return;
        box.classList.toggle('hidden', !on());
        if (window.WcList) WcList.paint();
        if (!on()) return;
        const ls = lines().map(l => l.trim());
        const tags = [...new Set(ls.filter(l => l.startsWith('##')).flatMap(l => E().tagList(l.slice(2))))];
        $('wcAdvTags').innerHTML = tags.map(t => `<button type="button" class="folder-chip active wc-chip" data-tag="${esc(t)}">${esc(t)} ×</button>`).join('');
        $('wcAdvTags').querySelectorAll('[data-tag]').forEach(b => { b.onclick = () => removeTag(b.dataset.tag); });
        const rules = ls.filter(l => l.startsWith('#!'));
        $('wcAdvRules').innerHTML = rules.map((r, i) => {
            // In plain words: "sitting never with standing", "underwater needs wet", "only one of: a, b".
            const p = E().parseRule(r), word = p.type === 'requires' ? 'needs' : p.a ? 'never with' : 'never';
            const body = p.type === 'bad' ? `<span class="wc-bad">${esc(r.slice(2).trim())}</span>` : p.type === 'last' ? '<b>picked last</b>' : p.type === 'one' ? `<b>only one of</b> ${esc(p.tags.join(', '))}` : `${esc((p.a || []).join(', '))} <b>${word}</b> ${esc(p.b.join(', '))}`;
            return `<div class="inset-card wc-rule"><span>${body}</span><button type="button" class="wc-x" data-i="${i}" aria-label="Remove rule">×</button></div>`;
        }).join('');
        $('wcAdvRules').querySelectorAll('[data-i]').forEach(b => { b.onclick = () => removeRule(rules[+b.dataset.i]); });
        const name = $('wcEditorName').value.trim(), by = name ? [...(data().calledBy.get(E().nameKey(name)) || [])].sort() : [];
        $('wcUsedBy').innerHTML = by.length ? 'Used by ' + by.slice(0, 3).map(n => `<u data-n="${esc(n)}">${esc(n)}</u>`).join(', ') + (by.length > 3 ? ` (+${by.length - 3})` : '') : 'Not used by other wildcards.';
        $('wcUsedBy').querySelectorAll('[data-n]').forEach(u => { u.onclick = () => Wildcards.edit(u.dataset.n); });
    }
    function removeTag(t) {
        setLines(lines().map(l => {
            if (!l.trim().startsWith('##')) return l;
            const left = E().tagList(l.trim().slice(2)).filter(x => x !== t);
            return left.length ? `## ${left.join(', ')}` : null;
        }).filter(l => l !== null));
    }
    function removeRule(r) {
        const ls = lines(), i = ls.findIndex(l => l.trim() === r);
        if (i >= 0) ls.splice(i, 1);
        setLines(ls);
    }
    // + TAG / + RULE: a box under the chips; Enter or ADD puts the line at the top.
    function ask(kind) {
        if (kind === 'rule') return ruleOpen();
        const row = $('wcAdvAsk'), input = $('wcAdvAskInput');
        // + LABEL again: closed, and what was typed goes (item 29).
        if (!row.classList.contains('hidden') && row.dataset.kind === kind) { input.value = ''; row.classList.add('hidden'); return; }
        row.dataset.kind = kind;
        input.value = '';
        input.placeholder = kind === 'tag' ? 'label, e.g. indoor' : 'e.g. sitting excludes standing';
        row.classList.remove('hidden');
        input.focus();
    }
    function addAsked() {
        const row = $('wcAdvAsk'), v = $('wcAdvAskInput').value.trim();
        row.classList.add('hidden');
        if (!v) return;
        const ls = lines();
        if (row.dataset.kind === 'tag') {
            const at = ls.findIndex(l => l.trim().startsWith('##'));
            if (at >= 0) ls[at] = `## ${[...new Set(E().tagList(ls[at].trim().slice(2)).concat(E().tagList(v)))].join(', ')}`;
            else ls.unshift(`## ${E().tagList(v).join(', ')}`);
        } else {
            const r = `#! ${v.replace(/^#!\s*/, '')}`;
            if (E().parseRule(r).type === 'bad') { toast('Write it as "a excludes b", "a requires b" or "one of: a, b"'); return; }
            const last = ls.reduce((k, l, i) => (l.trim().startsWith('#') ? i : k), -1);
            ls.splice(last + 1, 0, r);
        }
        setLines(ls.filter((l, i) => l.trim() || i < ls.length - 1));
    }
    // + RULE: the kind, its label boxes and what it does, then ADD. Kinds write the same lines the text view reads.
    const RULE_KINDS = {
        excludes: { name: 'NEVER TOGETHER', pair: true, mid: 'never with', hint: 'Whichever is picked first wins; the other is left out. Commas for more than one label.' },
        requires: { name: 'NEEDS', pair: true, mid: 'needs', hint: 'An option with the first label is only used when the second label is picked too. Commas for more than one label.' },
        one: { name: 'ONLY ONE OF', list: true, hint: 'Once one of these is picked, the others are left out. Give two or more, separated by commas.' },
        never: { name: 'NEVER', single: true, mid: 'never', hint: 'Options with this label are never picked.' },
        last: { name: 'PICK LAST', none: true, hint: 'This wildcard is picked after the others, so it fits what they picked.' },
    };
    let ruleKind = 'excludes', ruleA = '', ruleB = '';
    function ruleOpen() {
        $('wcAdvAsk').classList.add('hidden');
        ruleKind = 'excludes'; ruleA = ''; ruleB = '';
        paintRule();
        $('wcRulePanel').classList.remove('hidden');
        ($('wrA') || $('wrB'))?.focus();
    }
    // What is typed in the boxes, kept when the kind changes.
    function ruleRead() {
        if ($('wrA')) ruleA = $('wrA').value;
        if ($('wrB')) ruleB = $('wrB').value;
    }
    function paintRule() {
        const k = RULE_KINDS[ruleKind], types = $('wrTypes'), line = $('wrLine');
        types.innerHTML = Object.keys(RULE_KINDS).map(key => `<button type="button" class="${key === ruleKind ? 'on' : ''}" data-k="${key}">${RULE_KINDS[key].name}</button>`).join('');
        types.querySelectorAll('[data-k]').forEach(b => { b.onclick = () => { ruleRead(); ruleKind = b.dataset.k; paintRule(); }; });
        const box = (id, ph, v) => `<input type="text" id="${id}" class="wx-in" placeholder="${ph}" value="${esc(v)}" autocomplete="off" spellcheck="false">`;
        line.innerHTML = k.pair ? box('wrA', 'label', ruleA) + `<span>${k.mid}</span>` + box('wrB', 'label', ruleB)
            : k.list ? box('wrA', 'labels, e.g. dry, wet', ruleA)
            : k.single ? `<span>${k.mid}</span>` + box('wrB', 'label', ruleB) : '';
        line.classList.toggle('hidden', !!k.none);
        line.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); ruleAdd(); } };
        $('wrHint').textContent = k.hint;
    }
    // The line for the kind and boxes, or '' when they are not filled in.
    function ruleLine() {
        const k = RULE_KINDS[ruleKind], a = E().tagList(ruleA), b = E().tagList(ruleB);
        if (k.none) return '#! last';
        if (k.list) return a.length >= 2 ? `#! one of: ${a.join(', ')}` : '';
        if (k.single) return b.length ? `#! excludes ${b.join(', ')}` : '';
        return a.length && b.length ? `#! ${a.join(', ')} ${ruleKind} ${b.join(', ')}` : '';
    }
    function ruleAdd() {
        ruleRead();
        const r = ruleLine();
        if (!r) { toast(RULE_KINDS[ruleKind].list ? 'ONLY ONE OF needs two or more labels, separated by commas' : 'Fill in the labels first'); return; }
        if (E().parseRule(r).type === 'bad') { toast("Couldn't read that rule"); return; }
        const ls = lines(), last = ls.reduce((n, l, i) => (l.trim().startsWith('#') ? i : n), -1);
        ls.splice(last + 1, 0, r);
        $('wcRulePanel').classList.add('hidden');
        setLines(ls.filter((l, i) => l.trim() || i < ls.length - 1));
    }
    function ruleCancel() { $('wcRulePanel').classList.add('hidden'); }
    const toast = text => { if (typeof Toast !== 'undefined') Toast.show({ text, duration: 'short' }); };

    // ---- Try: a prompt resolved once, with how ----
    function tryOpen(text) {
        $('wcTryText').value = text != null ? text : $('wcTryText').value || '';
        open('wcTryModal');
        runTry();
    }
    function fromPrompt() {
        const m = typeof currentMode !== 'undefined' ? currentMode : 'xl', box = $(`${m}_prompt`) || $('xl_prompt');
        $('wcTryText').value = box ? box.value : '';
        runTry();
    }
    const TRY_DETAILS_KEY = 'bojroWcTryDetails';
    // The picked prompt to the clipboard ("Copied" unless Android shows its own).
    async function copyTry(text) {
        let modern = false;
        try { await navigator.clipboard.writeText(text); modern = true; } catch (e) {
            const t = document.createElement('textarea');
            t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
        }
        if (typeof Toast !== 'undefined' && !(modern && window.androidShowsOwnClipboardToast && androidShowsOwnClipboardToast())) Toast.show({ text: 'Copied', duration: 'short' });
    }
    function runTry() {
        const t = $('wcTryText').value;
        if (!t.trim()) { $('wcTryOut').innerHTML = ''; return; }
        const r = Wildcards.explain(t);
        const node = (n, depth) => {
            const pad = `style="padding-left:${depth * 14}px"`;
            if (n.rulesOn !== undefined) return `<div ${pad}><b>${esc(n.name)}</b> <span class="wc-dim">${n.rulesOn} rule${n.rulesOn === 1 ? '' : 's'} on</span></div>`;
            if (n.variable) return `<div ${pad}><b>\${${esc(n.variable)}}</b> = ${esc(n.pick || '')}</div>` + n.children.map(c => node(c, depth + 1)).join('');
            const head = n.variant !== undefined ? `{${esc(n.variant.length > 30 ? n.variant.slice(0, 30) + '…' : n.variant)}}` : esc(n.name);
            const count = n.given ? 'chosen by the scene' : n.options ? (n.eligible !== undefined && n.eligible !== n.options ? `${n.eligible} of ${n.options} fit` : `1 of ${n.options}`) : '';
            const pick = n.children.length ? '' : ` → ${esc(n.pick || '(nothing)')}`;
            const left = (n.left || []).slice(0, 6).map(x => `${esc(x.text)}: ${esc(x.why)}`).join(' · ');
            return `<div ${pad}><b>${head}</b> <span class="wc-dim">${count}</span>${pick}</div>` + (left ? `<div class="wc-dim" style="padding-left:${depth * 14 + 14}px">left out: ${left}</div>` : '') + n.children.map(c => node(c, depth + 1)).join('');
        };
        const open = localStorage.getItem(TRY_DETAILS_KEY) === 'true';
        $('wcTryOut').innerHTML = `<div class="inset-card wc-try-result">${esc(r.text) || '<span class="wc-dim">(empty)</span>'}</div>` +
            (r.text ? `<button type="button" class="btn-small wc-try-copy">COPY</button>` : '') +
            `<div class="row wc-try-details" role="button" aria-expanded="${open}"><label>DETAILS</label><i data-lucide="chevron-down" width="16" height="16"></i></div>` +
            `<div class="wc-tree${open ? '' : ' hidden'}">${r.trace.map(n => node(n, 0)).join('')}${r.problems.map(p => `<div class="wc-bad">${esc(Wildcards.problemText(p))}</div>`).join('')}</div>`;
        const copy = $('wcTryOut').querySelector('.wc-try-copy');
        if (copy) copy.onclick = () => copyTry(r.text);
        const det = $('wcTryOut').querySelector('.wc-try-details');
        det.onclick = () => {
            const now = localStorage.getItem(TRY_DETAILS_KEY) !== 'true';
            localStorage.setItem(TRY_DETAILS_KEY, now ? 'true' : 'false');
            det.setAttribute('aria-expanded', String(now));
            $('wcTryOut').querySelector('.wc-tree').classList.toggle('hidden', !now);
        };
        if (window.lucide) lucide.createIcons();
    }

    // ---- Check: the library looked over ----
    function check() {
        const d = data(), out = [], add = (title, items, bad) => { if (items.length) out.push({ title, items, bad }); };
        const names = [...d.byKey.values()].map(i => i.w.name);
        const near = n => { const k = E().nameKey(n), s = k.replace(/s$/, ''); return names.find(x => { const y = E().nameKey(x); return y !== k && (y.replace(/s$/, '') === s || y.replace(/_/g, '') === k.replace(/_/g, '')); }); };
        add('Missing', [...d.byKey.values()].flatMap(i => i.missing.map(m => ({ w: i.w.name, text: `calls __${m}__${near(m) ? ` (did you mean "${near(m)}"?)` : ''}` }))), true);
        // Loops: a wildcard that can reach itself.
        const loops = [];
        const graph = k => (d.byKey.get(k) || { calls: [] }).calls.map(n => E().nameKey(n)).filter(n => d.byKey.has(n));
        d.byKey.forEach((i, k) => {
            const seen = new Set(), stack = graph(k);
            while (stack.length) { const n = stack.pop(); if (n === k) { loops.push({ w: i.w.name, text: 'can end up calling itself' }); break; } if (seen.has(n)) continue; seen.add(n); stack.push(...graph(n)); }
        });
        add('Loops', loops, true);
        const syntax = [];
        d.byKey.forEach(i => {
            i.w.lines.forEach(l => { const t = String(l).trim(); if (/^-\d*\.?\d+\s*::/.test(t)) syntax.push({ w: i.w.name, text: `negative weight: "${t.slice(0, 40)}"` }); });
            i.opts.forEach(o => { if (o.cond && E().parseExpr(o.cond).op === 'bad') syntax.push({ w: i.w.name, text: `can't read the condition "?${o.cond}::"` }); });
            live(i.w).forEach(l => { for (const m of String(l).matchAll(new RegExp(E().CALL.source, 'g'))) if (m[3] !== undefined && E().parseExpr(m[3]).op === 'bad') syntax.push({ w: i.w.name, text: `can't read the filter "[${m[3]}]"` }); });
            live(i.w).forEach(l => { for (const m of String(l).matchAll(/\{\s*(\d+)\s*-\s*(\d+)\s*\$\$/g)) if (+m[1] > +m[2]) syntax.push({ w: i.w.name, text: `count ${m[1]}-${m[2]} runs backwards` }); });
            i.rules.forEach(r => { if (E().parseRule(r).type === 'bad') syntax.push({ w: i.w.name, text: `can't read the rule "${r.slice(2).trim()}"` }); });
        });
        add("Can't read", syntax, true);
        // Rules that can't both hold: a requires b and a excludes b (or one of: a, b).
        const all = [];
        d.byKey.forEach(i => i.rules.forEach(r => { const p = E().parseRule(r); if (p.type !== 'bad') all.push({ ...p, w: i.w.name }); }));
        const clash = [];
        all.filter(r => r.type === 'requires').forEach(q => q.a.forEach(a => q.b.forEach(b => all.forEach(x => {
            const ex = x.type === 'excludes' && ((x.a ? x.a.includes(a) : true) && x.b.includes(b) || x.a && x.a.includes(b) && x.b.includes(a) || !x.a && x.b.includes(b));
            const one = x.type === 'one' && x.tags.includes(a) && x.tags.includes(b);
            if (ex || one) clash.push({ w: q.w, text: `"${a} requires ${b}" against ${x.w}: "${x.src.slice(2).trim()}"` });
        }))));
        add('Rules that clash', clash, true);
        // Tags asked for (filters, conditions, rules) that no option carries.
        const carried = new Set();
        d.byKey.forEach(i => i.opts.forEach(o => o.tags.forEach(t => carried.add(t))));
        const asked = [];
        const words = ast => !ast ? [] : ast.op === 'tag' ? [ast.tag] : ast.op === '!' ? words(ast.a) : ast.a ? words(ast.a).concat(words(ast.b)) : [];
        d.byKey.forEach(i => {
            i.opts.forEach(o => { if (o.cond) words(E().parseExpr(o.cond)).filter(t => !carried.has(t)).forEach(t => asked.push({ w: i.w.name, text: `"${o.text.slice(0, 30)}" needs the tag "${t}", which no option has` })); });
            live(i.w).forEach(l => { for (const m of String(l).matchAll(new RegExp(E().CALL.source, 'g'))) if (m[3] && !/\$\{/.test(m[3])) words(E().parseExpr(m[3])).filter(t => !carried.has(t)).forEach(t => asked.push({ w: i.w.name, text: `filter [${m[3]}]: no option has "${t}"` })); });
        });
        add('Never picked', asked, false);
        add('Empty', [...d.byKey.values()].filter(i => !i.opts.length && !i.rules.length).map(i => ({ w: i.w.name, text: 'has no options' })), false);
        // Wildcards with most of the same options (at least 4, 80%).
        const owner = new Map(), same = [];
        d.byKey.forEach((i, k) => new Set(i.opts.map(o => o.text.toLowerCase())).forEach(t => { if (!owner.has(t)) owner.set(t, []); owner.get(t).push(k); }));
        const pairs = new Map();
        owner.forEach(ks => { if (ks.length > 1 && ks.length < 30) for (let a = 0; a < ks.length; a++) for (let b = a + 1; b < ks.length; b++) { const p = ks[a] + '|' + ks[b]; pairs.set(p, (pairs.get(p) || 0) + 1); } });
        pairs.forEach((n, p) => {
            const [a, b] = p.split('|').map(k => d.byKey.get(k)), m = Math.max(a.opts.length, b.opts.length);
            if (n >= 4 && n / m >= 0.8) same.push({ w: a.w.name, text: `and "${b.w.name}": ${n} of ${m} the same` });
        });
        add('Same options', same, false);
        const unused = [...d.byKey.values()].filter(i => !d.calledBy.has(E().nameKey(i.w.name))).map(i => ({ w: i.w.name, text: '' }));
        add('Not used by other wildcards', unused, false);
        // The deepest chain.
        const memo = new Map();
        const depth = (k, on = new Set()) => { if (memo.has(k)) return memo.get(k); if (on.has(k)) return 0; on.add(k); const v = 1 + Math.max(0, ...graph(k).map(n => depth(n, on))); on.delete(k); memo.set(k, v); return v; };
        let deep = null;
        d.byKey.forEach((i, k) => { const v = depth(k); if (!deep || v > deep.v) deep = { v, w: i.w.name }; });
        if (deep && deep.v > 1) out.push({ title: 'Deepest', items: [{ w: deep.w, text: `${deep.v} levels (limit ${E().MAX_DEPTH})` }], bad: deep.v > E().MAX_DEPTH });
        return out;
    }
    const CHEV = '<svg class="wc-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
    function checkOpen() {
        const res = check(), n = L().read().length;
        $('wcCheckTitle').textContent = `Check (${n.toLocaleString()})`;
        const list = (items, limit) => {
            const grouped = items[0] && items[0].text === '';
            const shown = items.slice(0, limit).map(x => (grouped ? `<u data-w="${esc(x.w)}">${esc(x.w)}</u>` : `<div><u data-w="${esc(x.w)}">${esc(x.w)}</u> ${esc(x.text)}</div>`));
            return (grouped ? shown.join(', ') : shown.join('')) + (items.length > limit ? `<div class="wc-more" data-more>and ${items.length - limit} more</div>` : '');
        };
        const wire = el => el.querySelectorAll('[data-w]').forEach(u => { u.onclick = () => { close('wcCheckModal'); Wildcards.edit(u.dataset.w); }; });
        $('wcCheckOut').innerHTML = res.length ? res.map((r, i) => `<div class="inset-card wc-check"><b class="${r.bad ? 'wc-bad' : ''}"><span>${esc(r.title)}${r.items.length > 1 ? ` (${r.items.length})` : ''}</span>${CHEV}</b><div data-i="${i}">${list(r.items, r.title.startsWith('Not used') ? 40 : 12)}</div></div>`).join('')
            : '<div class="empty-note">All fine.</div>';
        wire($('wcCheckOut'));
        // A title folds its section; which are folded is remembered (also after a restart).
        const FOLD_KEY = 'bojroWcCheckFolds';
        let folds = [];
        try { folds = JSON.parse(localStorage.getItem(FOLD_KEY) || '[]'); } catch (e) { }
        $('wcCheckOut').querySelectorAll('.wc-check > b').forEach((b, k) => {
            const key = res[k] ? res[k].title : '';
            if (folds.includes(key)) b.parentElement.classList.add('folded');
            b.onclick = () => {
                const f = b.parentElement.classList.toggle('folded');
                folds = folds.filter(x => x !== key).concat(f ? [key] : []);
                try { localStorage.setItem(FOLD_KEY, JSON.stringify(folds)); } catch (e) { }
            };
        });
        // "and N more": the whole list in its place.
        $('wcCheckOut').querySelectorAll('[data-more]').forEach(m => { m.onclick = () => { const box = m.parentElement; box.innerHTML = list(res[+box.dataset.i].items, Infinity); wire(box); }; });
        open('wcCheckModal');
    }

    // ---- Dynamic Prompts .yaml / .json (Import, wcimport.js) ----
    // A tree of names: nested keys make the name ("a: {b: [x]}" gives "a b"); a list's items, or a single text, are its
    // options; a multi-line text (a | or >- block) is one option. A key with nothing under it is an empty wildcard.
    function treeToWildcards(tree) {
        const out = [], by = new Map();
        const add = (path, v) => {
            if (!path.length) return;
            const name = path.join(' ');
            let w = by.get(name);
            if (!w) { w = { name, lines: [] }; by.set(name, w); out.push(w); }
            const t = v == null ? '' : String(v).replace(/\s*\r?\n\s*/g, ' ').trim();
            if (t) w.lines.push(t);
        };
        const walk = (v, path) => {
            if (v == null || (Array.isArray(v) && !v.length)) { add(path, ''); return; }
            if (Array.isArray(v)) { v.forEach(x => (x && typeof x === 'object' ? walk(x, path) : add(path, x))); return; }
            if (typeof v === 'object') { Object.keys(v).forEach(k => walk(v[k], path.concat(String(k).trim()))); return; }
            add(path, v);
        };
        walk(tree, []);
        return out;
    }
    function parseYaml(text) {
        if (window.jsyaml) { try { return treeToWildcards(jsyaml.load(text)); } catch (e) { /* not plain YAML: line by line */ } }
        return parseYamlLines(text);
    }
    function parseYamlLines(text) {
        // Nested mappings and lists of plain values (Dynamic Prompts' layout); "a: {b: [x]}" gives the wildcard "a b".
        const out = [], stack = [{ indent: -1, path: [] }];
        text.split('\n').forEach(raw => {
            if (!raw.trim() || /^\s*#/.test(raw)) return;
            const indent = raw.search(/\S/), line = raw.trim();
            while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
            const path = stack[stack.length - 1].path;
            const item = /^-\s*(.*)$/.exec(line);
            if (item) {
                const v = item[1].replace(/^(['"])(.*)\1$/, '$2');
                const name = path.join(' ');
                let w = out.find(x => x.name === name);
                if (!w) out.push(w = { name, lines: [] });
                if (v) w.lines.push(v);
                return;
            }
            const kv = /^([^:]+):\s*(.*)$/.exec(line);
            if (!kv) return;
            const key = kv[1].trim().replace(/^(['"])(.*)\1$/, '$2');
            if (kv[2]) {
                const v = kv[2].replace(/^(['"])(.*)\1$/, '$2');
                const name = path.concat(key).join(' ');
                const list = /^\[(.*)\]$/.exec(v);
                out.push({ name, lines: list ? list[1].split(',').map(x => x.trim().replace(/^(['"])(.*)\1$/, '$2')).filter(Boolean) : [v] });
            } else stack.push({ indent, path: path.concat(key) });
        });
        return out;
    }
    function guideOpen() { open('wcGuideModal'); }
    // The chips follow the options box as it is typed in.
    let pending = 0;
    document.addEventListener('DOMContentLoaded', () => {
        const later = () => { clearTimeout(pending); pending = setTimeout(paintEditor, 250); };
        $('wcEditorText')?.addEventListener('input', later);
        $('wcEditorName')?.addEventListener('input', later);
    });

    window.WcAdvanced = { on, paint, paintCountSoon, exportOpen, setMode, badgesFor, paintEditor, ask, addAsked, ruleAdd, ruleCancel, tryOpen, fromPrompt, runTry, check, checkOpen, parseYaml, treeToWildcards, guideOpen,
        closeTry: () => close('wcTryModal'), closeCheck: () => close('wcCheckModal'), closeGuide: () => close('wcGuideModal') };
})();
