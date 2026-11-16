// Scene optimization: before a job with wildcards is sent, Magic Prompt's model picks among options the wildcard engine
// makes for each wildcard, so they suit each other and the prompt. Any failure falls back to the usual random picks.
(function () {
    const ON_KEY = 'bojroSceneOn', MODEL_KEY = 'bojroSceneModel', UNLOAD_KEY = 'bojroSceneUnload';
    const unloadAfter = () => localStorage.getItem(UNLOAD_KEY) !== 'false';
    // Recolor to match / Drop tags that don't fit (Config): changes the model may make to the wildcard picks.
    const RECOLOR_KEY = 'bojroSceneRecolor', DROP_KEY = 'bojroSceneDrop', NEG_KEY = 'bojroSceneNeg', RECOLOR_BG_KEY = 'bojroSceneRecolorBg';
    const recolorOn = () => localStorage.getItem(RECOLOR_KEY) === 'true', dropOn = () => localStorage.getItem(DROP_KEY) === 'true', negOn = () => localStorage.getItem(NEG_KEY) === 'true';
    // Backgrounds too (under Recolor to match): places, lighting and props recolored as well.
    const bgOn = () => localStorage.getItem(RECOLOR_BG_KEY) === 'true';
    const MAX_RECOLOR = 4, MAX_DROP = 3, MAX_NEG = 4;
    // A swap needs both colours in this list.
    const COLOURS = new Set(('red,orange,yellow,green,blue,purple,pink,brown,black,white,grey,gray,silver,gold,navy,navy blue,beige,cream,' +
        'teal,aqua,cyan,maroon,burgundy,lavender,lilac,olive,khaki,tan,ivory,charcoal,crimson,scarlet,emerald,turquoise,magenta,violet,' +
        'coral,peach,mint,light blue,dark blue,sky blue,light green,dark green,dark red,light pink,hot pink,pastel pink,pastel blue,' +
        'pastel purple,pastel yellow,pastel green,rose,wine,mustard,rust,copper,bronze,platinum,blonde,indigo,plum,sage,forest green,royal blue').split(','));
    // Config > Prompts switches under Show Magic Prompt ('false' hides).
    const VIS = { prompt: 'bojroMpPrompt', describe: 'bojroMpDescribe', wcgen: 'bojroMpWcGen', scene: 'bojroMpScene' };
    // SDXL and Anima only (item 46: Flux, Qwen and Krea have wildcards but no scene optimization).
    const MODES = ['xl', 'anima'];
    const CANDIDATES = 10, TIMEOUT_MS = 20000, MAX_SLOTS = 40;
    // A wildcard made of other wildcards reaching at least BIG_REACH options (locations): BIG options, spread across it.
    const BIG = 20, BIG_REACH = 60;
    // A wildcard reaching more than CANDIDATES options, at most MENU_MAX of them and averaging at most MENU_AVG characters
    // (places, colours, expressions): every option offered, while the request's menus stay within MENU_BUDGET characters.
    const MENU_MAX = 400, MENU_AVG = 32, MENU_BUDGET = 8000;
    const $ = id => document.getElementById(id);
    const shown = k => localStorage.getItem(VIS[k]) !== 'false';
    const masterShown = () => localStorage.getItem('bojroHideMagicPrompt') !== 'true';
    const on = () => localStorage.getItem(ON_KEY) === 'true';
    const W = () => window.Wildcards && Wildcards._parts;
    const toast = (text, long) => { if (typeof Toast !== 'undefined') Toast.show({ text, duration: long ? 'long' : 'short' }); };

    // ---- the plan: the prompt's wildcards as slots ----
    // One option of only wildcards is a template (opened), several a slot the model picks for (its options made by the
    // engine, so conditions and rules hold); IN ORDER ones are fixed, "#! last" ones left to the engine.
    // Returns { top: [{ key, n, node }], slots, rules }.
    function plan(text, withCandidates, index = 0, worn = null) {
        const w = W(), list = w.read(), slots = [], rules = [], ruled = new Set();
        const lineOf = pos => (text.slice(0, pos).match(/\n/g) || []).length;
        function node(wc, path, depth, active, line) {
            const key = w.nameKey(wc.name), opts = w.weighted(wc);
            const own = wc.lines.map(l => String(l).trim()).filter(l => l.startsWith('#!'));
            if (own.length && !ruled.has(key)) { ruled.add(key); own.forEach(l => { const r = window.WcEngine.parseRule(l); if (r.type !== 'bad') rules.push(r); }); }
            if (!opts.length || active.has(key) || depth >= w.MAX_DEPTH) return { kind: 'text', text: '' };
            if (wc.inOrder) return { kind: 'fixed', wc };
            // Picked after the rest of the image, from what it has.
            if (own.some(l => /^#!\s*last\s*$/i.test(l))) return { kind: 'engine', wc };
            if (opts.length === 1 && !opts[0].cond && w.hasToken(opts[0].text)) {
                active.add(key);
                const parts = pieces(opts[0].text, path.concat(wc.name), depth + 1, active, line);
                active.delete(key);
                return { kind: 'tpl', parts };
            }
            const slot = { id: `s${slots.length + 1}`, name: wc.name, path, line, wc, key, depth, cands: [] };
            slots.push(slot);
            return { kind: 'slot', slot };
        }
        function pieces(t, path, depth, active, line) {
            const out = [];
            let last = 0;
            for (const m of t.matchAll(w.tokenRe())) {
                const wc = w.byName(list, m[1]);
                if (!wc) continue;
                if (m.index > last) out.push({ kind: 'text', text: t.slice(last, m.index) });
                out.push(node(wc, path, depth, active, line));
                last = m.index + m[0].length;
            }
            if (last < t.length) out.push({ kind: 'text', text: t.slice(last) });
            return out;
        }
        const top = [], count = new Map();
        for (const m of String(text || '').matchAll(w.tokenRe())) {
            const wc = w.byName(list, m[1]);
            if (!wc) continue;
            const key = w.nameKey(wc.name), n = (count.get(key) || 0) + 1;
            count.set(key, n);
            top.push({ key, n, index: m.index, length: m[0].length, node: node(wc, [], 0, new Set(), lineOf(m.index)) });
        }
        if (withCandidates) fill(slots, rules, String(text || ''), worn, index);
        return { top, slots, rules };
    }
    // Each slot's options, slots giving what others check first; a slot checking what earlier ones give has option k made
    // with their option k's tags, so its options suit theirs.
    function fill(slots, rules, text, worn, index) {
        const w = W(), E = window.WcEngine, lib = w.lib(), lines = text.split('\n');
        const info = slots.map(s => { const d = E.depsFor(lib, s.wc.name); return { s, reads: new Set(d.reads.filter(r => !r.startsWith('var:'))), makes: new Set(d.makes || []) }; });
        // Menus for the slots reaching the most options first, while the budget lasts.
        let budget = MENU_BUDGET;
        info.map(a => ({ a, m: menuOf(a.s.wc) })).filter(x => x.m && x.m.length > CANDIDATES)
            .sort((x, y) => y.m.length - x.m.length)
            .forEach(x => { const size = x.m.reduce((n, t) => n + t.len + 6, 0); if (size <= budget && size <= x.m.length * (MENU_AVG + 6)) { budget -= size; x.a.menu = x.m; } });
        const wait = info.slice(), done = [];
        const feeds = (b, a) => [...a.reads].some(t => b.makes.has(t));
        while (wait.length) {
            let k = wait.findIndex(a => !wait.some(b => b !== a && feeds(b, a)));
            if (k < 0) k = 0;
            const a = wait.splice(k, 1)[0], s = a.s, from = done.filter(b => feeds(b, a));
            const occ = worn && (worn.lines ? worn.lines[s.line] : worn.all);
            s.menu = !!a.menu;
            s.cands = candidates(s, { lib, index, occ, rules, label: lines[s.line] || '', count: big(s.wc) ? BIG : CANDIDATES, menu: a.menu,
                seed: from.length ? i => from.flatMap(b => ((b.s.cands[i % (b.s.cands.length || 1)] || {}).tags || []).filter(t => a.reads.has(t))) : null });
            if (s.menu) {
                const order = [];
                s.cands.forEach(c => { const g = group(c, s); if (!order.includes(g)) order.push(g); });
                s.cands = order.flatMap(g => s.cands.filter(c => group(c, s) === g));
            }
            s.must = mustDress(s.cands, occ);
            done.push(a);
        }
        slots.order = done.map(a => a.s);
        // Where the slots' outfits are worn, when another slot could take it.
        if (slots.length > 1) slots.forEach(s => { s.places = clothes(s) ? usualPlaces(s) : []; });
        // A menu's options matching an outfit's usual places (one's words held in the other's): first, as their own group.
        const wearing = slots.filter(s => s.places && s.places.length);
        if (wearing.length) slots.filter(m => m.menu && !wearing.includes(m)).forEach(m => {
            const has = (a, b) => (' ' + a + ' ').includes(' ' + b + ' ');
            const fits = [];
            for (const c of m.cands) {
                if (fits.length >= FITS_MAX) break;
                const f = words(String(c.text).split(',')[0]);
                if (!f) continue;
                const o = wearing.find(s => s.places.some(([, , ps]) => ps.some(pl => { const u = words(pl); return u && (u === f || (!GENERIC.has(f) && has(u, f)) || (!GENERIC.has(u) && has(f, u))); })));
                if (o) { c.fits = o.id; fits.push(c); }
            }
            if (fits.length) m.cands = fits.concat(m.cands.filter(c => !fits.includes(c)));
        });
    }
    // Every option a wildcard reaches through wildcards that are only another wildcard, each as the picks leading to it
    // (wildcard key → option text) and its length; null past MENU_MAX, or with an option made rare by its weight (below 1),
    // which a menu would offer as often as any other.
    function menuOf(wc) {
        const w = W(), list = w.read(), out = [], seen = new Set();
        const walk = (x, steps) => {
            const k = w.nameKey(x.name);
            if (steps.has(k) || out.length > MENU_MAX) return;
            for (const o of w.weighted(x)) {
                if (o.weight < 1) { out.length = MENU_MAX + 1; return; }
                const c = callOf(o.text), cw = c && w.byName(list, c), next = new Map(steps).set(k, o.text);
                if (cw) walk(cw, next);
                else if (!seen.has(o.text)) { seen.add(o.text); out.push({ steps: next, len: o.text.length }); }
                if (out.length > MENU_MAX) return;
            }
        };
        walk(wc, new Map());
        return out.length && out.length <= MENU_MAX ? out : null;
    }
    // A slot's "usual places": for its wildcard and the lists its options come from (up to 8), the library's scene list for
    // it, by name ("X outfits" → "X outfit scenes", "X scenes"; then the name a word shorter from either end: "halloween
    // witch costumes" → "halloween outfit scenes"), and up to 5 of that list's places. [[list, [places]]].
    const PLACES_LISTS = 8, PLACES_EACH = 5;
    function sceneListFor(name) {
        const w = W(), list = w.read();
        const base = String(name).trim().replace(/\s+(outfits?|costumes?|uniforms?)$/i, '');
        if (/\bscenes?$/i.test(base)) return null;
        const tries = [base], parts = base.split(/\s+/);
        for (let k = 1; k < parts.length; k++) tries.push(parts.slice(k).join(' '), parts.slice(0, parts.length - k).join(' '));
        for (const b of tries) for (const n of [`${name} scenes`, `${b} outfit scenes`, `${b} scenes`, `${b} costume scenes`]) {
            const hit = w.byName(list, n);
            if (hit && w.nameKey(hit.name) !== w.nameKey(name)) return hit;
        }
        return null;
    }
    // Most of the slot's options are worn clothing (not places, poses or props).
    const clothes = s => s.cands.length && s.cands.filter(c => [...window.WcEngine.wearOfText(c.text).all.values()].some(x => x.kinds.size)).length * 2 >= s.cands.length;
    function usualPlaces(s) {
        const w = W(), E = window.WcEngine, lib = w.lib(), out = [], seen = new Set();
        const names = [s.name].concat(...s.cands.map(c => c.path.slice().reverse()));
        for (const n of names) {
            if (out.length >= PLACES_LISTS) break;
            const sc = sceneListFor(n);
            if (!sc || seen.has(w.nameKey(sc.name))) continue;
            seen.add(w.nameKey(sc.name));
            const got = new Set();
            // All its places (up to 40), the line showing 5 of them.
            for (let k = 0; k < 120 && got.size < 40; k++) {
                const st = E.state({ problems: [], image: E.image() });
                const t = tidy(E.resolve(`__${sc.name}__`, lib, st));
                if (t) got.add(bare(t).split(',')[0].trim());
            }
            const all = [...got];
            if (all.length) out.push([n, all.slice(0, PLACES_EACH), all]);
        }
        return out;
    }
    // The wildcard a menu option comes from (its group in the request).
    const group = (c, s) => (c.fits ? `suits the outfit in ${c.fits}` : c.path.length ? c.path[c.path.length - 1] : s.name);
    const FITS_MAX = 12;
    // Place words too general to say a place suits an outfit when they are all an option is ("park" in "water park").
    const GENERIC = new Set(('park street road room field garden bridge cliff hall rooftop alley building house area city town ' +
        'outdoors indoors interior inside outside shop store office').split(' '));
    // A slot's answer as its option. A number: as before. Words: the same words as an option, then (a menu) its first tag
    // or one holding the answer or held in it (the longest); then the option holding most of the answer's words (at least
    // half; fewer other words breaks a tie).
    const words = t => String(t || '').toLowerCase().replace(/\\?[()]/g, ' ').replace(/[^a-z0-9' -]+/g, ' ').replace(/\b(a|an|the|with|and|in|on|of)\b/g, ' ').replace(/\s+/g, ' ').trim();
    function byName(s, v) {
        if (typeof v === 'number' || /^\s*\d+\s*$/.test(String(v))) { const i = parseInt(v, 10); return i >= 1 && i <= s.cands.length ? s.cands[i - 1] : null; }
        // Copied with the path or group it's listed under ("swimwear › one-piece and skirted swimwear: swim dress",
        // "water locations: beach"): the option.
        let raw = String(v).replace(/^[^:]*›[^:]*:\s*/, '');
        const colon = raw.lastIndexOf(': ');
        if (colon > 0 && raw.slice(colon + 2).trim()) raw = raw.slice(colon + 2);
        const a = words(raw);
        if (!a) return null;
        const full = s.cands.map(c => words(bare(c.text))), first = s.cands.map(c => words(String(c.text).split(',')[0]));
        let k = full.indexOf(a);
        // A group's (a list's) name: one of that group's options, at random.
        if (k < 0) {
            const inGroup = s.cands.filter(c => c.path.some(n => words(n) === a));
            if (inGroup.length) { log(`${s.name}: "${v}" is a group, picked one of its ${inGroup.length}`); return inGroup[Math.floor(Math.random() * inGroup.length)]; }
        }
        if (k < 0 && s.menu) k = first.indexOf(a);
        if (k < 0 && s.menu) {
            let best = -1, len = 0;
            first.forEach((f, i) => { if (f && (a.includes(f) || f.includes(a)) && f.length > len) { best = i; len = f.length; } });
            k = best;
        }
        if (k < 0) {
            const aw = [...new Set(a.split(' '))];
            let best = -1, top = 0, extra = Infinity;
            full.forEach((f, i) => {
                const fw = new Set(f.split(' ')), hit = aw.filter(x => fw.has(x)).length / aw.length, more = fw.size - hit * aw.length;
                if (hit >= 0.5 && (hit > top + 1e-9 || Math.abs(hit - top) < 1e-9 && more < extra)) { best = i; top = hit; extra = more; }
            });
            k = best;
        }
        return k >= 0 ? s.cands[k] : null;
    }
    // An option that is only another wildcard: that wildcard's name.
    const callOf = t => { const m = [...String(t).matchAll(W().tokenRe())]; return m.length === 1 && String(t).trim() === m[0][0] ? m[0][1] : null; };
    // Made mostly of other wildcards and reaching many options.
    function big(wc) {
        const w = W(), list = w.read(), seen = new Set();
        const reach = x => {
            const k = w.nameKey(x.name);
            if (seen.has(k)) return 0;
            seen.add(k);
            let n = 0;
            for (const o of w.weighted(x)) { const c = callOf(o.text), cw = c && w.byName(list, c); n += cw ? reach(cw) : 1; if (n >= BIG_REACH) break; }
            return n;
        };
        const o = w.weighted(wc), br = o.filter(x => callOf(x.text)).length;
        return br >= 2 && br * 2 >= o.length && reach(wc) >= BIG_REACH;
    }
    // A steer for the engine (state({ steer })): at a wildcard made of other wildcards, each of them once (in random order)
    // before weighted picks, so a few options cover the whole tree.
    function spreader() {
        const E = window.WcEngine, left = new Map();
        return (key, opts) => {
            // Ones made rare by their weight wait for the weighted picks.
            const br = [...new Set(opts.filter(o => callOf(o.text) && o.weight >= 1).map(o => o.text))];
            if (br.length < 2 || br.length * 2 < opts.length) return null;
            let q = left.get(key);
            if (!q) {
                q = br.slice();
                for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(E.rnd() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
                left.set(key, q);
            }
            const i = q.findIndex(t => br.includes(t));
            return i < 0 ? null : q.splice(i, 1)[0];
        };
    }
    // A clothing slot that can't be left out: most of its candidates are worn clothing, and the prompt gives its
    // character no clothing (or nudity) of its own, so leaving it empty would leave the character nude.
    function mustDress(cands, occ) {
        if (!cands.length || (occ && [...occ.values()].some(x => x.kinds.size || x.empty))) return false;
        const E = window.WcEngine, dressed = cands.filter(c => [...E.wearOfText(c.text).all.values()].some(x => x.kinds.size)).length;
        return dressed * 2 >= cands.length;
    }
    // Up to ctx.count different full picks of a slot's wildcard, made by the engine (conditions, rules and what the line
    // wears kept; spread across the wildcards it's made of), each with the path it took through wildcards that are only
    // another wildcard ("outdoors › water locations"), the tags and rules it brought, and the conditions it relied on.
    function candidates(slot, ctx) {
        const w = W(), E = window.WcEngine, list = w.read(), seen = new Set(), out = [], clash = [], want = ctx.count || CANDIDATES;
        const spread = spreader();
        // A menu: each option once (steered to it; one its conditions rule out is passed over), in random order.
        const menu = ctx.menu ? ctx.menu.slice() : null;
        if (menu) for (let i = menu.length - 1; i > 0; i--) { const j = Math.floor(E.rnd() * (i + 1)); [menu[i], menu[j]] = [menu[j], menu[i]]; }
        const tries = menu ? menu.length : want * 4;
        const make = (seed, steer) => {
            const rec = [];
            const st = E.state({ problems: [], image: E.image(), index: ctx.index || 0, steer, onPick: (name, o) => rec.push({ name, o }) });
            E.seedLabels(st, ctx.label, ctx.lib);
            (ctx.rules || []).forEach(r => { if (!st.rules.some(x => x.src === r.src)) st.rules.push(r); });
            seed.forEach(t => st.tags.add(t));
            const base = new Set(st.tags), ruled = st.rules.length;
            const text = E.resolve(`__${slot.wc.name}__`, ctx.lib, st);
            return { rec, st, base, ruled, seed, text: tidy(st.blank ? E.tidyBlank(text) : text) };
        };
        for (let t = 0; t < tries && (menu || out.length < want); t++) {
            let m;
            if (menu) {
                // The option asked for, in up to 4 of the other slots' contexts; left out if none allows it.
                const goal = menu[t].steps, steer = key => (goal.has(key) ? goal.get(key) : null);
                const got = x => [...goal].every(([k, v]) => x.rec.some(r => w.nameKey(r.name) === k && r.o.text === v));
                for (let a = 0; a < (ctx.seed ? 4 : 1) && !(m && got(m)); a++) m = make(ctx.seed ? ctx.seed(t + a * 7) : [], steer);
                if (!got(m)) continue;
            } else m = make(ctx.seed ? ctx.seed(t) : [], spread);
            const { rec, st, base, ruled, seed, text } = m;
            if (!text || seen.has(text)) continue;
            seen.add(text);
            const path = [];
            let at = slot.key;
            for (const r of rec) {
                if (w.nameKey(r.name) !== at) continue;
                const c = callOf(r.o.text), cw = c && w.byName(list, c);
                if (!cw) break;
                path.push(cw.name);
                at = w.nameKey(cw.name);
            }
            const c = { text, path, tags: [...st.tags].filter(t => !base.has(t)), seed,
                conds: [...new Set(rec.filter(r => r.o.cond).map(r => r.o.cond))], rules: st.rules.slice(ruled).map(r => r.src) };
            if (E.clashText(text, ctx.occ)) { clash.push(c); continue; }
            out.push(c);
        }
        // None fit what the prompt wears: offered anyway (their clashing tags are left out when sent).
        return out.length ? out : clash;
    }
    const tidy = t => String(t || '').split('\n').map(l => l.replace(/\s*,(\s*,)+/g, ',').replace(/^[\s,]+|[\s,]+$/g, '').replace(/\s{2,}/g, ' ')).join('\n').trim();

    // An image's picks, slot by slot in the order their options were made (those giving what others check first): the
    // chosen option (0 leaves it out, unusable is random); one breaking a rule, or a condition it relied on, given the
    // picks before it, is 'engine' (picked by the engine in context). Returns { decided: Map(slot id → option | null |
    // 'engine'), rules }.
    function decide(p, set) {
        const E = window.WcEngine, rules = p.rules.slice(), tags = new Set(), decided = new Map();
        const parsed = x => (x.rules || []).filter(src => !rules.some(r => r.src === src)).map(src => E.parseRule(src)).filter(r => r.type !== 'bad' && r.type !== 'last');
        const breaks = x => {
            const all = rules.concat(parsed(x));
            if (all.length && E.ruleBreak(x.tags || [], { rules: all, tags })) return true;
            if (!x.conds || !x.conds.length) return false;
            const then = new Set([...(x.tags || []), ...(x.seed || [])]), now = new Set([...(x.tags || []), ...tags]);
            return x.conds.some(k => E.condHolds(k, then) && !E.condHolds(k, now));
        };
        (p.slots.order || p.slots).forEach(s => {
            const v = set && set[s.id];
            if ((v === 0 || v === '0') && !s.must) { decided.set(s.id, null); return; }
            const got = v != null && v !== '' ? byName(s, v) : null;
            if (v != null && v !== '' && !got) log(`${s.name}: "${v}" matches none of its options, picked at random`);
            const c = got || (s.cands.length ? s.cands[Math.floor(Math.random() * s.cands.length)] : null);
            if (c && breaks(c)) { log(`${s.name}: pick clashed with the others, left to the engine`); decided.set(s.id, 'engine'); return; }
            decided.set(s.id, c);
            if (!c) return;
            (c.tags || []).forEach(t => tags.add(t));
            rules.push(...parsed(c));
        });
        return { decided, rules };
    }
    // Text for one image: each slot's decided option (acc.decided; without, as decide() would pick, rules aside); a
    // wildcard left to the engine stays as __name__. bits (Reroll): the text in pieces, each slot's its own.
    function render(n, picks, index, acc = { tags: new Set() }, bits = null) {
        const w = W();
        const put = (t, slot) => { if (bits) bits.push(slot ? { text: t, name: slot.name, slot: true } : { text: t }); return t; };
        if (n.kind === 'text') return put(n.text);
        if (n.kind === 'engine') return put(`__${n.wc.name}__`);
        if (n.kind === 'fixed') return put(w.resolveText(`__${n.wc.name}__`, w.read(), new Map(), new Set(), 0, new Map(), index));
        if (n.kind === 'tpl') return n.parts.map(p => render(p, picks, index, acc, bits)).join('');
        const s = n.slot;
        if (!acc.decided) acc.decided = new Map();
        if (!acc.decided.has(s.id)) decide({ slots: [s], rules: [] }, picks).decided.forEach((v, k) => acc.decided.set(k, v));
        const c = acc.decided.get(s.id);
        if (c === 'engine') return put(`__${s.name}__`, s);
        if (!c) return put('', s);
        (c.tags || []).forEach(t => acc.tags.add(t));
        return put(acc.adjust ? acc.adjust(c.text, s) : c.text, s);
    }
    // A slot worn by or part of the character (recolored with Backgrounds too off): mostly clothing, or hair, eyes,
    // makeup or accessories.
    const LOOKS = /\b(hair|eyes|makeup|lipstick|eyeshadow|eyeliner|nails?|earrings?|necklace|bracelet|choker|glasses|hat|cap|hairband|hairclip|hair ornament|ribbon|bow|gloves|jewelry|scarf|bag)\b/i;
    const onCharacter = s => s.cands.length && (clothes(s) || s.cands.filter(c => LOOKS.test(c.text)).length * 2 >= s.cands.length);

    // The model's recolor and drop for an image, on one wildcard's picked text (tags with a wildcard left in are skipped);
    // budget counts across the image's wildcards; done collects what changed, for the Debug Log.
    // keepColours: no recolor (a background with Backgrounds too off); keepTags: no drop (the character's picks).
    function adjust(text, set, budget, done, keepColours = false, keepTags = false) {
        let tags = String(text).split(',');
        if (recolorOn() && !keepColours && Array.isArray(set.recolor)) {
            set.recolor.forEach(pair => {
                if (!Array.isArray(pair)) return;
                const [a, b] = pair.map(x => String(x || '').trim().toLowerCase());
                if (!COLOURS.has(a) || !COLOURS.has(b) || a === b) return;
                // Not away from a palette colour.
                if (Array.isArray(set.palette) && set.palette.some(c => String(c || '').trim().toLowerCase() === a)) return;
                const seen = budget.seen || (budget.seen = new Set()), k = `${a}>${b}`;
                if (budget.recolor >= MAX_RECOLOR && !seen.has(k)) return;
                const re = new RegExp(`(^|[^a-z])${a.replace(/ /g, '\\s+')}(?=[^a-z]|$)`, 'gi');
                let hit = false;
                tags = tags.map(t => (t.includes('__') ? t : t.replace(re, (m, pre) => { hit = true; return pre + b; })));
                if (hit && !seen.has(k)) { seen.add(k); budget.recolor++; done.push(`${a} → ${b}`); }
            });
        }
        if (dropOn() && !keepTags && Array.isArray(set.drop)) {
            const gone = new Set(set.drop.map(x => String(x || '').trim().toLowerCase()).filter(Boolean));
            tags = tags.filter(t => {
                const k = t.trim().toLowerCase();
                if (!gone.has(k) || k.includes('__') || budget.drop >= MAX_DROP) return true;
                budget.drop++;
                done.push(`dropped ${t.trim()}`);
                return false;
            });
        }
        return tags.join(',');
    }

    // ---- what the model is told about LoRAs (item 62) ----
    const LORA_TAG = /<lora:([^:>]+):[^>]*>/gi;
    const trimName = (t, n = 70) => (t.length > n ? t.slice(0, n - 1).trim() + '…' : t);
    // A LoRA in a text by name and type, the variant whose trigger words the text has by its name; none for sliders,
    // tools and LoRAs not in the list.
    function loraDesc(alias, text) {
        const L = window.LoraManager;
        const l = L && (L.allLoras || []).find(x => String(L.resolveTagIdentifier(x)).toLowerCase() === String(alias).toLowerCase());
        if (!l) return null;
        const type = (typeof loraConfigs !== 'undefined' && loraConfigs[l.name] && loraConfigs[l.name].type) || '';
        if (type === 'slider' || type === 'tool') return null;
        let name = L.getDisplayName(l);
        const V = window.LoraVariants;
        if (V && V.enabledFor(l.name)) {
            const have = new Set(parseTagList(text).map(normaliseTag));
            let best = null, most = 0;
            V.list(l.name).forEach(v => { const t = parseTagList(v.trigger || '').map(normaliseTag); if (t.length && t.every(x => have.has(x)) && t.length > most) { best = v; most = t.length; } });
            if (best) name = `${name} - ${best.name}`;
        }
        return `${trimName(String(name).replace(/_/g, ' '))}${type ? `, ${type === 'characterpack' ? 'character' : type}` : ''}`;
    }
    // Each image's LoRAs: one line for those all images have, one per image for the rest.
    function loraLines(texts) {
        const per = texts.map(t => [...new Set([...String(t || '').matchAll(LORA_TAG)].map(m => loraDesc(m[1], t)).filter(Boolean))]);
        if (!per.some(x => x.length)) return '';
        const all = per[0].filter(d => per.every(x => x.includes(d))), rest = per.map(x => x.filter(d => !all.includes(d)));
        return (all.length ? `\nLoRAs: ${all.join('; ')}.` : '') + (rest.some(x => x.length) ? '\n' + rest.map((x, i) => `Image ${i + 1} LoRAs: ${x.join('; ') || 'none'}.`).join('\n') : '');
    }
    // LoRA tags and random::/order:: tokens out of what the model reads (the LoRA lines say what they are).
    const bare = t => String(t || '').replace(LORA_TAG, '')
        .replace(/(?:random|order)::group::[^,\n<>{}|:()]*|(?:random|order)::[a-z]+(?:[ \t]*\([^()\n]*\))?(?:[ \t]+-[ \t]+[^(),\n<>{}|:]*)?/gi, '')
        .replace(/[ \t]+,/g, ',').replace(/,([ \t]*,)+/g, ',').replace(/^[ \t,]+|[ \t,]+$/gm, '');
    // random:: / order:: picked before the model is asked (as Wildcards.parts() would, same seed rules), so it knows
    // each image's LoRAs; the picks go to the images with the model's (withPre()). Not with All combinations.
    function prepick(job, n) {
        const R = window.RandomTokens, E = window.WcEngine, memos = Array.from({ length: n }, () => new Map());
        if (!R || job.combos || !R.inPayload(job.payload)) return { memos, texts: memos.map(() => job.payload.prompt), picked: false };
        const seed = Number(job.payload.seed), seeded = localStorage.getItem('bojroWcSeeded') === 'true' && Number.isFinite(seed) && seed !== -1;
        const problems = [];
        const texts = memos.map((m, i) => E.withRandom(seeded ? E.seeded(seed + i) : null, () => R.expandPayload({ ...job.payload }, job.mode, m, problems, i).prompt));
        if (problems.length) log(`random:: ${problems.map(x => x.name).join('; ')}`);
        return { memos, texts, picked: true };
    }
    const withPre = (pre, memoFor) => i => { const m = memoFor ? memoFor(i) : new Map(); pre.memos[i].forEach((v, k) => { if (!m.has(k)) m.set(k, v); }); return m; };
    // Cancelled before anything was sent: order:: counters back as they were.
    const unpick = pre => { if (pre && pre.picked && window.RandomTokens) RandomTokens.rollback(0); };

    // ---- Same seed, same picks (item 67): the model's picks kept for a set seed ----
    const REPLAY_KEY = 'bojroSceneReplay', REPLAY_MAX = 60;
    // seedAt / n: one image of a batch as a job of its own (its seed, 1 image), so its seed sent back finds it.
    function replayKey(job, kind, seedAt, n) {
        const p = job.payload, seed = seedAt != null ? seedAt : Number(p.seed);
        if (localStorage.getItem('bojroWcSeeded') !== 'true' || !Number.isFinite(seed) || seed === -1) return null;
        return JSON.stringify([kind, job.mode, job.typedPrompt != null ? job.typedPrompt : p.prompt, p.negative_prompt || '', seed, n != null ? n : (p.n_iter || 1), p.width || 0, p.height || 0, recolorOn(), dropOn(), negOn(), job.fcLabels || null]);
    }
    const plainMemo = m => [...m].filter(([k, v]) => !/^(random|order):/.test(k) && (typeof v === 'string' || Array.isArray(v)));
    function replayGet(key, n) {
        if (!key) return null;
        try { const hit = JSON.parse(localStorage.getItem(REPLAY_KEY) || '[]').find(x => x && x.k === key); return hit && Array.isArray(hit.memos) && hit.memos.length === n ? hit : null; } catch (e) { return null; }
    }
    function replayPut(key, memos, sets, job, kind) {
        if (!key) return;
        const recs = [{ k: key, memos: memos.map(plainMemo), sets: sets || [] }];
        // A batch: each image on its own too.
        if (job && memos.length > 1) memos.forEach((m, i) => { const k = replayKey(job, kind, Number(job.payload.seed) + i, 1); if (k) recs.push({ k, memos: [plainMemo(m)], sets: [(sets || [])[i] || {}] }); });
        try {
            const keep = recs.filter(r => JSON.stringify(r).length <= 200000), ks = new Set(keep.map(r => r.k));
            if (!keep.length) return;
            const all = JSON.parse(localStorage.getItem(REPLAY_KEY) || '[]').filter(x => x && !ks.has(x.k));
            localStorage.setItem(REPLAY_KEY, JSON.stringify(keep.concat(all).slice(0, REPLAY_MAX)));
        } catch (e) {}
    }
    function replay(job, hit, pre) {
        log(`replayed scene picks for seed ${job.payload.seed} (Same seed, same picks)`);
        const out = Wildcards.parts(job, withPre(pre, i => new Map(hit.memos[i])), true);
        addPeople(out, hit.sets);
        addNegatives(out, hit.sets);
        return out;
    }

    // ---- the request ----
    function message(job, p, n) {
        const labels = job.fcLabels || null;
        const where = s => (labels && labels[s.line] ? ` [${labels[s.line]}]` : '');
        // The prompt as the model sees it: slots as {s1}, fixed (IN ORDER) wildcards as their first image's pick.
        const shape = nd => (nd.kind === 'text' ? nd.text : nd.kind === 'engine' ? '' : nd.kind === 'fixed' ? render(nd, null, 0) : nd.kind === 'tpl' ? nd.parts.map(shape).join('') : `{${nd.slot.id}}`);
        let text = '', last = 0;
        const src = String(job.payload.prompt || '');
        p.top.forEach(t => { text += src.slice(last, t.index) + shape(t.node); last = t.index + t.length; });
        text += src.slice(last);
        text = bare(text);
        const lines = labels ? text.split('\n').map((l, i) => `${labels[i] || ''}: ${l}`).join('\n') : text;
        const menuLines = s => {
            const groups = new Map();
            s.cands.forEach(c => { const g = group(c, s); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(bare(c.text)); });
            return [...groups].map(([g, items]) => `${g}: ${items.join('; ')}`).join('\n');
        };
        const slots = p.slots.map(s => `${s.id} = ${s.path.concat(s.name).join(' › ')}${where(s)}${s.must ? ' (required)' : ''}${s.menu ? ' (every option: answer with its words)' : ''}\n` +
            (s.places && s.places.length ? `usual places: ${s.places.map(([n, ps]) => `${n}: ${ps.join(', ')}`).join('; ')}\n` : '') +
            (s.menu ? menuLines(s) : s.cands.map((c, i) => `${i + 1}. ${c.path.length ? c.path.slice(-2).join(' › ') + ': ' : ''}${bare(c.text)}`).join('\n'))).join('\n\n');
        const shapeOf = `{${p.slots.map(s => `"${s.id}": "words"`).join(', ')}${recolorOn() ? ', "palette": ["colour", ...], "recolor": [["from", "to"], ...] or []' : ''}}` +
            ' (for each slot, the words of the option that fits best: a whole option from a list with every option, e.g. "sandy beach"; ' +
            'from a numbered list, a few of its words that pick it out, e.g. "navy two-tone leotard, gold lapels"; 0 leaves the slot out)';
        const wear = p.unknown && p.unknown.length ? `\nThe first object must also have "wear": ["word=kind"] for each of these prompt words: ${p.unknown.join(', ')}. ` +
            `kind is what the word names as worn: one of ${WEAR_HINT}; or none if it isn't clothing.` : '';
        // The image's size and shape, for framing and composition.
        const wd = Number(job.payload.width) || 0, ht = Number(job.payload.height) || 0;
        const shapeLine = wd && ht ? `\nImage: ${wd}x${ht}, ${wd > ht * 1.05 ? 'landscape' : ht > wd * 1.05 ? 'portrait' : 'square'}.` : '';
        // Colours the prompt's own words name ("blue theme", "red and green"), longest names first.
        const own = ` ${String(src).replace(new RegExp(W().tokenRe().source, 'g'), ' ').toLowerCase().replace(/[^a-z]+/g, ' ')} `, typed = [];
        [...COLOURS].sort((a, b) => b.length - a.length).forEach(c => { if (own.includes(` ${c} `) && !typed.some(t => t.includes(c))) typed.push(c); });
        const extra = (countless(src) ? `\nThe prompt doesn't say how many people: each object must also have "people": one of ${PEOPLE.map(x => `"${x}"`).join(', ')}.` : '') + (negOn() ? `\nAn object may also have "negative": ["tag"], up to ${MAX_NEG} short Danbooru tags to keep out of that image (things its picks could wrongly bring in).` : '') + (recolorOn() ? `\n"palette": 2 or 3 colours for the image: ${typed.length ? `the prompt's own colours (${typed.join(', ')})` : 'ones that suit the setting, outfit and light you picked'}. ` +
            `"recolor": up to ${MAX_RECOLOR} swaps of a colour in the options you picked${bgOn() ? ', the place, lighting and background included: bring their colours into the palette too (e.g. "red and black striped background" with a blue and white palette: ["red", "blue"], ["black", "white"]),' : ' for the character (clothes, hair, accessories; not the place, light or props)'} that clashes with the palette, to a palette colour (colours only, ` +
            `e.g. ["yellow", "blue"]); [] when they already fit. Never change the fixed prompt.` : '') +
            (dropOn() ? `\nAn object may also have "drop": ["tag"], at most ${MAX_DROP} tags copied exactly from the place, prop, lighting or background options you picked that don't fit the scene (never the character's clothes, hair or accessories, never names from the lists).` : '') + wear;
        return `Prompt (fixed):\n${lines}\n${shapeLine}${job.sceneLoras || ''}${job.payload.negative_prompt ? `\nNegative (fixed): ${job.payload.negative_prompt}\n` : ''}\nSlots:\n${slots}\n\n` +
            (n > 1 ? `Reply with JSON only: {"images": [${n} objects, one per image, each different]}, each object ${shapeOf}.`
                : `Reply with JSON only: one object, ${shapeOf}, and nothing after it.`) + extra;
    }
    const WEAR_HINT = 'hat, glasses, neckwear, outer (jacket, coat), hoodie, top, sportsbra, bra, bikinitop, skirt, pants (trousers, shorts), ' +
        'panties, bikinibottom, legwear (socks, stockings, tights), leggings, shoes, gloves, dress, robe (kimono), onepiece (leotard, swimsuit, bodysuit), ' +
        'jumpsuit, bikini, underwear, uniform (whole outfit), armor';
    // "wear" in a reply: the words taught, kept (words asked about and not answered count as not clothing).
    function learn(sets, asked) {
        if (!asked || !asked.length) return;
        const got = {};
        asked.forEach(w => { got[w] = 'none'; });
        sets.forEach(set => (Array.isArray(set && set.wear) ? set.wear : []).forEach(x => {
            const m = /^\s*([^=]+?)\s*=\s*([a-z]+)\s*$/i.exec(String(x));
            if (m && asked.includes(m[1].toLowerCase())) got[m[1].toLowerCase()] = m[2].toLowerCase();
        }));
        const E = window.WcEngine;
        E.learnWear(got);
        try { localStorage.setItem('bojroWcWear', JSON.stringify(E.learnedWear())); } catch (e) {}
        log(`garment words: ${Object.entries(got).map(([w, k]) => `${w}=${k}`).join(', ')}`);
    }
    const SYSTEM = 'You choose wildcard options for a Stable Diffusion image so that everything forms one coherent scene. ' +
        'The prompt text is fixed: never contradict it. For each slot pick one option (answer with its words), or 0 to leave the slot out ' +
        '(use 0 when the prompt already covers it, e.g. clothing slots when an outfit is already given, or when nothing fits). ' +
        'A slot marked (required) is the character\'s clothing: never use 0 for it, pick the option that fits best. ' +
        'Make setting, season, weather, time of day, lighting, outfit, pose, expression, colours and camera suit each other; ' +
        'avoid duplicates and contradictions. Props and background details must belong in that setting, season and activity ' +
        '(no Easter eggs outside Easter, no bed in a kitchen); use 0 for a prop slot when nothing fits. Choose camera angles, ' +
        'framing and poses that suit the image\'s shape (landscape: wide shots and scenery; portrait: full body or upper body). ' +
        'Outfits made for a place or job (bunny girl, maid, nurse, idol, waitress, cheerleader, swimsuit, kimono...) go in a ' +
        'setting where they are worn, unless the prompt sets the place: pick such a place when a slot offers one. A slot\'s ' +
        '"usual places" line says where its outfits are worn: pick that place, or the closest one, from the place slot. ' +
        'For example: bunny girl: casino, bar or nightclub; maid: cafe or mansion; nurse: hospital or clinic; swimsuit or ' +
        'bikini: beach or pool; idol: stage or concert venue; kimono: shrine, festival or Japanese garden; cheerleader: ' +
        'stadium or sports field; waitress: cafe or restaurant. ' +
        'Poses must be anatomically possible with the view and the other picks: a character seen from behind (rear view, ' +
        'from behind, facing away) can\'t hand, hold out or reach towards someone in front of them, or make eye contact without ' +
        'looking back; no arms or legs bent the wrong way; use 0 for a pose that clashes. Keep the number of people exactly as ' +
        'the prompt says (1girl, solo, 2girls...): wide and square images tend to gain extra people, so there avoid picks that ' +
        'add others (crowds, couples, customers, audiences, partners) unless the prompt has them. ' +
        'Labels in [brackets] say which character a slot is for.';

    // A failure with the toast it shows (the Debug Log gets the detail).
    const fail = (toastText, detail) => Object.assign(new Error(detail || toastText), { toastText });
    const log = t => { if (typeof dlog === 'function') dlog(`scene: ${t}`); };
    // One request to the scene model: the reply's per-image objects (n of them).
    async function request(text, maxTokens, what, n) {
        if (typeof getLlmConfig !== 'function') throw fail('Magic Prompt not linked');
        let { baseUrl, key, model } = getLlmConfig();
        const own = localStorage.getItem(MODEL_KEY);
        if (own) model = own;
        if (!baseUrl) throw fail('Magic Prompt not linked');
        const t0 = Date.now();
        log(`${what}, ${n} image(s), model ${model || 'default'}`);
        const size = SYSTEM.length + text.length;
        log(`request ${size.toLocaleString('en')} characters (about ${Math.round(size / 4).toLocaleString('en')} tokens)`);
        const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        current = { ctrl, cancelled: false };
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (key) headers['Authorization'] = `Bearer ${key}`;
            const res = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST', headers, signal: ctrl.signal,
                body: JSON.stringify({ model: model || 'default', temperature: 0.8, max_tokens: maxTokens, stream: false,
                    // LM Studio: a model it loaded for this goes again after 5 s idle.
                    ...(unloadAfter() ? { ttl: 5 } : {}),
                    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }] })
            });
            if (!res.ok) throw fail(`Scene model error (HTTP ${res.status})`);
            const data = await res.json();
            // Ollama: unloaded now, so Forge has the VRAM for the generation (other servers ignore it).
            if (unloadAfter()) fetch(`${baseUrl}/api/generate`, { method: 'POST', headers, body: JSON.stringify({ model: model || 'default', keep_alive: 0 }) }).catch(() => {});
            const out = String((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || data.response || '').replace(/<think>[\s\S]*?<\/think>/gi, '');
            log(`reply in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${out.trim().slice(0, 400)}`);
            let json = null;
            try { json = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)); } catch (e) {}
            let images = !json ? [] : Array.isArray(json.images) ? json.images : Array.isArray(json) ? json : [json];
            // Not whole JSON: the complete {"s1": 2, ...} objects in it (one level of nesting for lists).
            if (!images.length || !images[0] || typeof images[0] !== 'object' || 'images' in images[0]) {
                const body = out.indexOf('[') >= 0 ? out.slice(out.indexOf('[')) : out;
                images = (body.match(/\{(?:[^{}]|\[[^\[\]]*\])*\}/g) || []).map(t => { try { return JSON.parse(t); } catch (e) { return null; } })
                    .filter(o => o && typeof o === 'object' && Object.keys(o).some(k => /^(s\d+|pick)$/.test(k)));
                if (images.length) log(`reply not whole JSON: used ${images.length} complete image object(s)`);
            }
            // Cut off before its end: its complete answers, and the palette and swaps if they finished.
            if (!images.length) {
                const got = {};
                for (const m of out.matchAll(/"(s\d+|pick)"\s*:\s*("(?:[^"\\]|\\.)*"|\d+)/g)) { if (!(m[1] in got)) { try { got[m[1]] = JSON.parse(m[2]); } catch (e) {} } }
                const list = key => { const m = new RegExp(`"${key}"\\s*:\\s*(\\[(?:[^\\[\\]]|\\[[^\\[\\]]*\\])*\\])`).exec(out); if (m) { try { got[key] = JSON.parse(m[1]); } catch (e) {} } };
                ['palette', 'recolor', 'negative'].forEach(list);
                if (Object.keys(got).some(k => /^(s\d+|pick)$/.test(k))) { images = [got]; log(`reply cut off: kept ${Object.keys(got).filter(k => /^(s\d+|pick)$/.test(k)).length} answer(s)`); }
            }
            if (!images.length || !images[0] || typeof images[0] !== 'object') throw fail("Scene model's reply unreadable");
            return Array.from({ length: n }, (_, i) => images[i % images.length] || {});
        } finally { clearTimeout(timer); }
    }
    async function ask(job, p, n) {
        const sets = await request(message(job, p, n), Math.round(1.5 * (60 + 40 * n + (countless(job.payload.prompt) ? 15 * n : 0) + 24 * n * p.slots.length + (recolorOn() ? 70 * n : dropOn() ? 50 * n : 0) + (negOn() ? 40 * n : 0) + 8 * ((p.unknown && p.unknown.length) || 0))) + 100, `${p.slots.length} picks`, n);
        learn(sets, p.unknown);
        // Leaving out most wildcards is a misread, not a choice: an image would lose them all.
        const left = set => p.slots.filter(sl => set[sl.id] === 0 || set[sl.id] === '0').length;
        if (p.slots.length >= 2 && sets.some(set => left(set) > p.slots.length * 0.6)) throw fail('Scene model left most out');
        return sets;
    }
    // Whole prompts, when no wildcard is a plain choice: WHOLE engine picks per image (each with its picks, so Hi-Res and
    // ADetailer follow the chosen one), and the model picks one per image.
    const WHOLE = 8;
    function wholeCandidates(job, n) {
        const w = W(), lib = w.lib(), E = window.WcEngine, each = Math.max(2, Math.min(WHOLE, Math.floor(16 / n)));
        return Array.from({ length: n }, (_, i) => {
            const seen = new Set(), out = [], steer = spreader();
            for (let k = 0; k < each * 2 && out.length < each; k++) {
                const memo = new Map(), st = E.state({ memo, active: new Set(), count: new Map(), index: i, problems: [], image: E.image(), steer });
                let t = E.resolve(String(job.payload.prompt || ''), lib, st);
                t = tidy(st.blank ? E.tidyBlank(t) : t);
                if (!t || seen.has(t)) continue;
                seen.add(t);
                out.push({ text: t, memo });
            }
            return out;
        });
    }
    function wholeMessage(job, cands) {
        const wd = Number(job.payload.width) || 0, ht = Number(job.payload.height) || 0;
        const shapeLine = wd && ht ? `Image: ${wd}x${ht}, ${wd > ht * 1.05 ? 'landscape' : ht > wd * 1.05 ? 'portrait' : 'square'}.\n` : '';
        const list = cands.map((c, i) => `Image ${i + 1}:\n` + c.map((x, k) => `${k + 1}. ${bare(x.text)}`).join('\n')).join('\n\n');
        const neg = negOn() ? `\nAn object may also have "negative": ["tag"], up to ${MAX_NEG} short Danbooru tags to keep out of that image.` : '';
        const people = countless(job.payload.prompt) ? `\nThe prompts don't say how many people: each object must also have "people": one of ${PEOPLE.map(x => `"${x}"`).join(', ')}.` : '';
        return `${shapeLine}${(job.sceneLoras || '').replace(/^\n/, '')}${job.sceneLoras ? '\n' : ''}${job.payload.negative_prompt ? `Negative (fixed): ${job.payload.negative_prompt}\n` : ''}Each image has whole prompts to choose from. ` +
            `Pick the one that forms the most coherent scene.\n\n${list}\n\nReply with JSON only: ${cands.length > 1 ? `{"images": [${cands.length} objects, one per image]}, each object {"pick": number}` : 'one object, {"pick": number}, and nothing after it'}.` + neg + people;
    }
    async function whole(job, n, btn) {
        const cands = wholeCandidates(job, n);
        if (cands.every(c => c.length < 2)) return Wildcards.parts(job);
        const pre = prepick(job, n);
        job.sceneLoras = loraLines(pre.texts);
        const rkey = replayKey(job, 'whole'), hit = replayGet(rkey, n);
        if (hit) return replay(job, hit, pre);
        const label = btn && btn.innerText;
        if (btn) btn.innerText = 'SETTING SCENE...';
        if (typeof updateBatchNotification === 'function' && !job.splitOf) updateBatchNotification('Setting scene...', true, '');
        let sets = null;
        try {
            sets = await request(wholeMessage(job, cands), Math.round(1.5 * (40 + 30 * n + (negOn() ? 40 * n : 0) + (countless(job.payload.prompt) ? 15 * n : 0))) + 100, `${cands[0].length} whole prompts`, n);
        } catch (e) {
            if (current && current.cancelled) { current = null; if (btn) btn.innerText = label; unpick(pre); return []; }
            log(e.name === 'AbortError' ? `timed out after ${TIMEOUT_MS / 1000}s` : e.message);
            toast(`${e.name === 'AbortError' ? 'Setting the scene took too long' : e.toastText || "Couldn't reach the scene model"}: random picks`);
        }
        current = null;
        if (btn && btn.innerText === 'SETTING SCENE...') btn.innerText = label;
        if (!sets) return Wildcards.parts(job, withPre(pre, null));
        const chosen = cands.map((c, i) => {
            const k = parseInt(sets[i] && sets[i].pick, 10);
            return c[k >= 1 && k <= c.length ? k - 1 : 0];
        });
        replayPut(rkey, chosen.map(c => (c ? c.memo : new Map())), sets, job, 'whole');
        const out = Wildcards.parts(job, withPre(pre, i => new Map(chosen[i] ? chosen[i].memo : [])), true);
        addPeople(out, sets);
        addNegatives(out, sets);
        return out;
    }
    // ABORT while the model is picking: no job is sent (interruptGeneration(), engine.js).
    let current = null;
    function cancel() {
        if (!current) return false;
        current.cancelled = true;
        current.ctrl.abort();
        return true;
    }

    // ---- the job ----
    // A job built with Scene optimization on (buildJobFromUI(), engine.js) remembers it, so a queued job picks when it runs.
    function mark(job) {
        if (!job || !job.payload || !MODES.includes(job.mode) || !active()) return;
        // Counting the wildcards style::NAME brings too (styles.js).
        const probe = { prompt: job.payload.prompt };
        if (window.StyleManager && StyleManager.expandTokens) StyleManager.expandTokens(probe);
        if (count(probe.prompt) >= 1) job.scene = true;
    }
    const active = () => on() && masterShown() && shown('scene') && W() && Wildcards.enabled();
    const count = text => {
        if (!W() || !text || String(text).indexOf('__') < 0) return 0;
        const p = plan(text, false);
        return p.slots.length || p.top.filter(t => t.node.kind !== 'fixed').length;
    };

    // Add negatives (Config): each image's own, after what its negative already has.
    // People-count tags, and those the model may add to a prompt that has none.
    const COUNT = /(^|[\s,(])(\d+\+?(girl|boy|other)s?|solo(_focus| focus)?|multiple[ _](girls|boys|others)|no[ _]humans)(?=$|[\s,):])/i;
    const PEOPLE = ['1girl, solo', '1boy, solo', '1girl, 1boy', '2girls', '2boys', 'multiple girls', 'no humans'];
    const countless = t => !COUNT.test(String(t || ''));
    function addPeople(out, picks) {
        out.forEach((j, i) => {
            const want = picks[i] && String(picks[i].people || '').trim().toLowerCase();
            if (!PEOPLE.includes(want) || !countless(j.payload.prompt)) return;
            j.payload = { ...j.payload, prompt: `${want}, ${String(j.payload.prompt || '').replace(/^[\s,]+/, '')}` };
            log(`image ${i + 1} people: ${want}`);
        });
    }
    function addNegatives(out, picks) {
        if (negOn()) out.forEach((j, i) => {
            const add = Array.isArray(picks[i] && picks[i].negative) ? picks[i].negative.map(x => String(x || '').trim().toLowerCase()).filter(x => x && x.length < 40 && !/[<>{}_]/.test(x)).slice(0, MAX_NEG) : [];
            const have = new Set(String(j.payload.negative_prompt || '').split(',').map(x => x.trim().toLowerCase()));
            const fresh = add.filter(x => !have.has(x));
            if (!fresh.length) return;
            const base = String(j.payload.negative_prompt || '').replace(/[\s,]+$/, '');
            j.payload = { ...j.payload, negative_prompt: base ? `${base}, ${fresh.join(', ')}` : fresh.join(', ') };
            log(`image ${i + 1} negative: ${fresh.join(', ')}`);
        });
    }
    // The requests a job is sent as (generate(), processQueue()), with the model's picks when it was marked.
    async function parts(job, btn) {
        if (!job || !job.scene || !W() || !Wildcards.enabled()) return Wildcards.parts(job);
        const n = (job.payload && job.payload.n_iter) || 1;
        const E = window.WcEngine, p = plan(job.payload.prompt, true, 0, E.wearOfText(job.payload.prompt));
        // Colour words are never garments (a typed palette like "blue and white").
        p.unknown = E.unknownWear(job.payload.prompt).filter(x => !COLOURS.has(String(x).toLowerCase()));
        if (!p.slots.length) return p.top.length ? whole(job, n, btn) : Wildcards.parts(job);
        if (p.slots.length > MAX_SLOTS) { toast('Too many wildcards to set the scene: picked at random'); return Wildcards.parts(job); }
        const pre = prepick(job, n);
        job.sceneLoras = loraLines(pre.texts);
        const rkey = replayKey(job, 'slots'), hit = replayGet(rkey, n);
        if (hit) return replay(job, hit, pre);
        const label = btn && btn.innerText;
        if (btn) btn.innerText = 'SETTING SCENE...';
        if (typeof updateBatchNotification === 'function' && !job.splitOf) updateBatchNotification('Setting scene...', true, '');
        let picks = null;
        try {
            picks = await ask(job, p, n);
        } catch (e) {
            if (current && current.cancelled) { current = null; if (btn) btn.innerText = label; unpick(pre); return []; }
            log(e.name === 'AbortError' ? `timed out after ${TIMEOUT_MS / 1000}s` : e.message);
            toast(`${e.name === 'AbortError' ? 'Setting the scene took too long' : e.toastText || "Couldn't reach the scene model"}: random picks`);
        }
        current = null;
        if (btn && btn.innerText === 'SETTING SCENE...') btn.innerText = label;
        if (!picks) return Wildcards.parts(job, withPre(pre, null));
        // Each image's picks go in as the wildcards' first uses, so Hi-Res and ADetailer prompts follow them.
        const memos = Array.from({ length: n }, (_, i) => {
            const memo = new Map(), dec = decide(p, picks[i]), acc = { tags: new Set(), decided: dec.decided }, budget = { recolor: 0, drop: 0 }, done = [];
            p.top.forEach(t => {
                const before = new Set(acc.tags);
                const bits = [];
                // Each slot's pick on its own: the character's never dropped; with Backgrounds too off, only theirs recolored.
                if (recolorOn() || dropOn()) acc.adjust = (text, sl) => { const ch = onCharacter(sl); return adjust(text, picks[i] || {}, budget, done, !bgOn() && !ch, ch); };
                const text = render(t.node, picks[i], i, acc, bits);
                memo.set(`${t.key}#${t.n}`, tidy(acc.adjust ? text : adjust(text, picks[i] || {}, budget, done)));
                memo.set(`#bits:${t.key}#${t.n}`, bits);
                memo.set(`#tags:${t.key}#${t.n}`, [...acc.tags].filter(x => !before.has(x)));
                memo.set(`#rules:${t.key}#${t.n}`, dec.rules.map(r => r.src));
            });
            if (recolorOn() && picks[i] && Array.isArray(picks[i].palette)) log(`image ${i + 1} palette: ${picks[i].palette.map(x => String(x)).join(', ')}`);
            if (done.length) log(`image ${i + 1}: ${done.join(', ')}`);
            return memo;
        });
        replayPut(rkey, memos, picks, job, 'slots');
        const out = Wildcards.parts(job, withPre(pre, i => new Map(memos[i])), true);
        addPeople(out, picks);
        addNegatives(out, picks);
        return out;
    }

    // ---- the toggle, beside each tab's Magic Prompt button ----
    function paintToggles() {
        MODES.forEach(m => {
            const b = $(`sceneBtn-${m}`);
            if (!b) return;
            const box = $(`${m}_prompt`), regions = Array.from(document.querySelectorAll(`#fc-${m}-regions:not(.hidden) textarea`)).map(t => t.value);
            b.classList.toggle('hidden', !shown('scene'));
            b.classList.toggle('idle', count([box ? box.value : ''].concat(regions).join('\n')) < 1);
            b.classList.toggle('on', on());
            b.setAttribute('aria-pressed', String(on()));
        });
    }
    function toggle() {
        paintToggles();
        const b = $(`sceneBtn-${typeof currentMode !== 'undefined' ? currentMode : 'xl'}`);
        if (b && b.classList.contains('idle')) { if (typeof Toast !== 'undefined') Toast.show({ text: 'Add a __wildcard__ first', duration: 'short', once: true }); return; }
        localStorage.setItem(ON_KEY, on() ? 'false' : 'true');
        paintToggles();
        toast(`Scene optimization ${on() ? 'on' : 'off'}`);
    }

    // ---- Config: what Magic Prompt shows, and the scene model ----
    function paintVisibility() {
        const body = document.body.classList;
        body.toggle('mp-no-prompt', !shown('prompt'));
        body.toggle('mp-no-describe', !shown('describe'));
        body.toggle('mp-no-button', !shown('prompt') && !shown('describe'));
        body.toggle('mp-no-wcgen', !shown('wcgen'));
        body.toggle('mp-no-scene', !shown('scene'));
        Object.keys(VIS).forEach(k => { const s = $(`cfgMp-${k}`); if (s) s.checked = shown(k); });
        const u = $('cfgSceneUnload');
        if (u) u.checked = unloadAfter();
        if ($('cfgSceneRecolor')) $('cfgSceneRecolor').checked = recolorOn();
        if ($('cfgSceneRecolorBg')) $('cfgSceneRecolorBg').checked = bgOn();
        ['cfgSceneRecolorBgRow', 'cfgSceneRecolorBgHint'].forEach(id => { if ($(id)) $(id).classList.toggle('hidden', !recolorOn()); });
        if ($('cfgSceneDrop')) $('cfgSceneDrop').checked = dropOn();
        if ($('cfgSceneNeg')) $('cfgSceneNeg').checked = negOn();
        const rows = $('mpSubRows');
        if (rows) rows.classList.toggle('hidden', !masterShown());
        paintToggles();
    }
    function setShown(k, v) {
        localStorage.setItem(VIS[k], v ? 'true' : 'false');
        paintVisibility();
    }
    // Opening Magic Prompt on a tab that's switched off shows the other.
    function fixTab() {
        if (!window.Describe) return;
        if (!shown('prompt')) Describe.setTab('describe');
        else if (!shown('describe')) Describe.setTab('prompt');
    }
    function syncModels() {
        const src = $('llmModelSelect'), sel = $('sceneModelSelect');
        if (!src || !sel) return;
        const saved = localStorage.getItem(MODEL_KEY) || '';
        sel.innerHTML = '';
        sel.appendChild(new Option('Same as Magic Prompt', ''));
        Array.from(src.options).forEach(o => { if (o.value) sel.appendChild(new Option(o.value, o.value)); });
        if (saved && !Array.from(sel.options).some(o => o.value === saved)) sel.appendChild(new Option(saved, saved));
        sel.value = saved;
        if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText('sceneModelSelect');
    }
    // Magic Prompt's model list, fetched quietly at launch so the Scene model list is there without a LINK.
    // A saved model is put in alone as a stand-in (loadLlmSettings(), ui.js) until the server lists them all.
    let listed = false;
    async function fetchModels() {
        const sel = $('llmModelSelect');
        if (!sel || listed || typeof buildLlmUrl !== 'function') return;
        if (typeof connectionConfig === 'undefined' || !connectionConfig || !connectionConfig.baseIp) return;
        try {
            const url = `${buildLlmUrl()}/v1/models`;
            const http = typeof CapacitorHttp !== 'undefined' && CapacitorHttp;
            const res = http ? await http.get({ url, headers: { 'Content-Type': 'application/json' } })
                : await fetch(url).then(async r => ({ status: r.status, data: await r.json() }));
            const models = res && res.status < 400 && res.data && Array.isArray(res.data.data) ? res.data.data : null;
            if (!models || !models.length || listed) return;
            listed = true;
            const keep = sel.value;
            sel.innerHTML = '';
            models.forEach(m => sel.appendChild(new Option(m.id, m.id)));
            const last = localStorage.getItem('bojroLastLlmModel') || keep;
            if (last && models.some(m => m.id === last)) sel.value = last;
            if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText('llmModelSelect');
            if (typeof updateConnectionStatus === 'function') updateConnectionStatus('llm', 'connected');
        } catch (e) {}
    }
    // Generate's label from the tap (engine.js): SETTING SCENE... when the model will pick first.
    const wouldSet = () => typeof currentTask !== 'undefined' && currentTask === 'txt' && MODES.includes(currentMode) && active() &&
        count([($(`${currentMode}_prompt`) || {}).value || ''].concat(Array.from(document.querySelectorAll(`#fc-${currentMode}-regions:not(.hidden) textarea`)).map(t => t.value)).join('\n')) >= 1;
    function setUnload(v) { localStorage.setItem(UNLOAD_KEY, v ? 'true' : 'false'); }
    function setRecolor(v) { localStorage.setItem(RECOLOR_KEY, v ? 'true' : 'false'); paintVisibility(); }
    function setRecolorBg(v) { localStorage.setItem(RECOLOR_BG_KEY, v ? 'true' : 'false'); }
    function setDrop(v) { localStorage.setItem(DROP_KEY, v ? 'true' : 'false'); }
    function setNeg(v) { localStorage.setItem(NEG_KEY, v ? 'true' : 'false'); }
    function saveModel() {
        const v = $('sceneModelSelect').value;
        if (v) localStorage.setItem(MODEL_KEY, v); else localStorage.removeItem(MODEL_KEY);
    }

    function start() {
        MODES.forEach(m => {
            const mp = document.querySelector(`#mode-${m}-container .magic-btn`);
            if (!mp || $(`sceneBtn-${m}`)) return;
            mp.innerHTML = '<i data-lucide="bot" width="16" height="16"></i>PROMPT';
            const wrap = document.createElement('div');
            wrap.className = 'mp-btns';
            mp.before(wrap);
            wrap.innerHTML = `<button type="button" id="sceneBtn-${m}" class="scene-btn hidden" onclick="Scene.toggle()" title="Scene optimization" aria-label="Scene optimization"><i data-lucide="wand-sparkles" width="16" height="16"></i></button>`;
            wrap.appendChild(mp);
        });
        if (window.lucide) lucide.createIcons();
        let timer = 0;
        const later = el => {
            if (!el.matches || !el.matches('textarea[id$="_prompt"], textarea.fc-text')) return;
            clearTimeout(timer);
            timer = setTimeout(paintToggles, 300);
        };
        document.addEventListener('input', e => later(e.target), true);
        // Text the app puts in (bin, default prompt, history, presets) sets .value, which fires no input event. Prompt
        // boxes have their own .value (lorasliders.js), wrapped here too.
        const wrap = (obj, el) => {
            const d = Object.getOwnPropertyDescriptor(obj, 'value');
            if (d && d.set) Object.defineProperty(obj, 'value', { configurable: true, enumerable: d.enumerable, get: d.get, set(v) { d.set.call(this, v); later(el || this); } });
        };
        wrap(HTMLTextAreaElement.prototype);
        document.querySelectorAll('textarea[id$="_prompt"]').forEach(el => { if (Object.getOwnPropertyDescriptor(el, 'value')) wrap(el, el); });
        const src = $('llmModelSelect');
        if (src) new MutationObserver(syncModels).observe(src, { childList: true });
        syncModels();
        paintVisibility();
        // Once the saved prompts are back in their boxes.
        setTimeout(paintToggles, 800);
        [1500, 6000, 20000].forEach(t => setTimeout(fetchModels, t));
        document.addEventListener('visibilitychange', () => { if (!document.hidden) fetchModels(); });
        const interrupt = window.interruptGeneration;
        if (typeof interrupt === 'function') window.interruptGeneration = function () { return cancel() ? Promise.resolve() : interrupt.apply(this, arguments); };
        // Prompts set by the app (restores, presets, Analyze) fire no input event.
        ['switchTab', 'setMode'].forEach(name => {
            const fn = window[name];
            if (typeof fn === 'function') window[name] = function () { const r = fn.apply(this, arguments); paintToggles(); return r; };
        });
    }

    window.Scene = { start, parts, mark, wouldSet, fetchModels, setUnload, setRecolor, setRecolorBg, setDrop, setNeg, toggle, paintToggles, paintVisibility, setShown, fixTab, saveModel, _plan: plan, _message: message };
})();
