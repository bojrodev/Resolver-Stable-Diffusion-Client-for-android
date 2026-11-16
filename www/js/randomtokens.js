// random::style, random::saac and random::<LoRA type> (character, artstyle, ...): each image's own pick, made with its
// wildcards (wildcards.js); order::<type> and order::style go through them in turn. A group or variants LoRA counts once.
(function () {
    const TYPES = ['artstyle', 'background', 'character', 'clothing', 'concept', 'other', 'pose', 'tool'];
    // An optional (word): what the name has in brackets ("one piece" for "Nami (One Piece)"); an optional - part: what it
    // has after a " - " ("swimsuit" for "Nami - Swimsuit").
    const TOKEN = /(random|order)::([a-z]+)(?:[ \t]*\(([^(),\n<>{}|:]*[^(),\n<>{}|:\s])[ \t]*\))?(?:[ \t]+-[ \t]+([^(),\n<>{}|:]*[^(),\n<>{}|:\s]))?/gi;
    const norm = t => String(t || '').toLowerCase().replace(/[_\s]+/g, ' ').trim();
    // random::group::Name / order::group::Name (no brackets, commas or colons in the name).
    const GROUP_TOKEN = /(random|order)::group::[ \t]*([^(),\n<>{}|:]*[^(),\n<>{}|:\s])/gi;
    // The words in brackets in a name: "Nami (One Piece) (pre-timeskip)" -> ["one piece", "pre-timeskip"].
    const bracketed = name => [...String(name || '').replace(/\\([()])/g, '$1').matchAll(/\(([^()]+)\)/g)].flatMap(m => m[1].split(',').map(norm)).filter(Boolean);
    // The parts after " - " in a name, brackets left out: "Nami - Swimsuit (One Piece) - Summer" -> ["swimsuit", "summer"].
    const dashed = name => norm(String(name || '').replace(/\\([()])/g, '$1')).split(/ +- +/).slice(1).map(x => norm(x.replace(/\([^()]*\)/g, ' '))).filter(Boolean);
    const has1 = (list, w) => list.some(b => b === w || (' ' + b + ' ').includes(' ' + w + ' '));
    // f: { br, dash } from the token (either may be empty); every part given must match one of the names.
    const kwOk = (names, f) => !f || ((!f.br || names.some(n => has1(bracketed(n), f.br))) && (!f.dash || names.some(n => has1(dashed(n), f.dash))));
    const specOf = (type, f) => type + (f && f.br ? ` (${f.br})` : '') + (f && f.dash ? ` - ${f.dash}` : '');
    const loraNames = l => [l.name, l.alias, LM() && LM().getDisplayName ? LM().getDisplayName(l) : ''];
    const LM = () => window.LoraManager;
    const cfgOf = name => (typeof loraConfigs !== 'undefined' && loraConfigs[name]) || {};
    // A LoRA's type in its settings (a 'slider' type from p294 is none).
    const typeOf = name => { const c = cfgOf(name); return c.type === 'slider' ? '' : c.type || ''; };
    const rnd = () => (window.WcEngine && WcEngine.rnd ? WcEngine.rnd() : Math.random());
    const any = list => list[Math.floor(rnd() * list.length)];
    // 'xl', 'anima', ... for a tab (Inpaint/img2img: by its checkpoint).
    function archFor(mode) {
        if (mode !== 'inp' && mode !== 'img2img') return mode || 'xl';
        const title = typeof currentModelTitleFor === 'function' ? currentModelTitleFor(mode) : '';
        return LM() && LM().detectCheckpointArchitecture ? LM().detectCheckpointArchitecture(title) : 'xl';
    }
    // The candidates of a type for a model: [[{ lora, variant }]], one list per LoRA or group, each picked from in turn.
    function units(type, arch, kw = '') {
        const all = (LM() && LM().allLoras) || [];
        // As the LoRA list shows them on the tab: its model's, and ones in no model folder. Character packs count as
        // characters.
        const kind = n => (typeOf(n) === 'characterpack' ? 'character' : typeOf(n));
        const fits = l => l && kind(l.name) === type && [arch, 'unknown'].includes(LM().detectLoraArchitecture(l));
        const V = window.LoraVariants, G = window.LoraGroups, seen = new Set(), out = [];
        all.filter(fits).forEach(l => {
            if (seen.has(l.name)) return;
            const g = G && G.groupOf ? G.groupOf(l.name) : null;
            const members = g ? g.members.map(n => all.find(x => x.name === n)).filter(fits) : [l];
            members.forEach(m => seen.add(m.name));
            const cands = members.flatMap(m => {
                const vs = V && V.enabledFor(m.name) ? V.list(m.name) : [];
                return vs.length ? vs.map(v => ({ lora: m, variant: v })) : [{ lora: m, variant: null }];
            });
            const ok = cands.filter(c => kwOk(loraNames(c.lora).concat(c.variant ? [c.variant.name] : []), kw));
            // A character pack's characters (its variants) are each a pick of their own.
            const pack = c => typeOf(c.lora.name) === 'characterpack';
            ok.filter(pack).forEach(c => out.push([c]));
            const rest = ok.filter(c => !pack(c));
            if (rest.length) out.push(rest);
        });
        return out;
    }
    // ---- groups: random::group::Name ----
    // A group's (or LoRA's) name in a token, as written: no (brackets), nothing after a spaced " - ".
    const groupName = title => String(title || '').replace(/\\([()])/g, '$1').replace(/\s+-\s+.*$/, '').replace(/\([^()]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    const groupKey = title => norm(groupName(title));
    const archOk = (l, arch) => [arch, 'unknown'].includes(LM().detectLoraArchitecture(l));
    const withVariants = l => { const V = window.LoraVariants, vs = V && V.enabledFor(l.name) ? V.list(l.name) : []; return vs.length ? vs.map(v => ({ lora: l, variant: v })) : [{ lora: l, variant: null }]; };
    const groupsNow = () => (window.LoraGroups && LoraGroups.list ? LoraGroups.list() : []);
    // What a group token picks from: the group's LoRAs (a LoRA's variants in its place; sliders left out), else the
    // variants of a LoRA with that name. Those for the tab's model.
    function groupCands(key, arch) {
        const all = (LM() && LM().allLoras) || [];
        const g = groupsNow().find(x => groupKey(x.title) === key);
        if (g) return g.members.map(n => all.find(l => l.name === n)).filter(l => l && archOk(l, arch) && cfgOf(l.name).type !== 'slider').flatMap(withVariants);
        const V = window.LoraVariants;
        const l = all.find(x => V && V.enabledFor(x.name) && V.list(x.name).length && archOk(x, arch) && groupKey(LM().getDisplayName(x)) === key);
        return l ? withVariants(l) : [];
    }
    // The names the tag bar offers after "random::group::": groups, then LoRAs with variants that are in no group.
    function groupNames(mode) {
        if (!LM()) return [];
        const arch = archFor(mode), out = new Map(), V = window.LoraVariants;
        groupsNow().forEach(g => { const n = groupCands(groupKey(g.title), arch).length; if (n && !out.has(groupKey(g.title))) out.set(groupKey(g.title), { name: groupName(g.title), meta: `${n}`, group: true }); });
        ((LM().allLoras) || []).forEach(l => {
            if (!V || !V.enabledFor(l.name) || V.list(l.name).length < 2 || !archOk(l, arch)) return;
            if (window.LoraGroups && LoraGroups.groupOf(l.name)) return;
            const k = groupKey(LM().getDisplayName(l));
            if (k && !out.has(k)) out.set(k, { name: groupName(LM().getDisplayName(l)), meta: `${V.list(l.name).length}` });
        });
        return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
    }
    // Styles random::style / order::style can pick: all but those switched off in the style editor (styles.js).
    const styles = (kw = '') => (window.StyleManager ? StyleManager.styles.filter(s => !s.fc && !(StyleManager.inRandom && !StyleManager.inRandom(s.name)) && kwOk([s.name], kw)) : []);
    // SAAC's characters (Config: SAAC on; SDXL), its favourites while its ★ filter is on.
    const saacOn = () => localStorage.getItem('bojroSaacEnabled') === 'true';
    function saacList(kw = '') {
        const S = window.SaacManager;
        if (!S || !S.data || !S.data.length) return [];
        const all = S.data.filter(c => kwOk([c.tag], kw));
        if (!S.favOnly) return all;
        const favs = S.favSet();
        const f = all.filter(c => favs.has(c.tag));
        return f.length ? f : all;
    }
    // The bracket words (or " - " parts) a type's LoRAs, styles or SAAC characters have, most used first: [{ name, meta }]
    // for the tag bar; br keeps to those with that bracket word.
    function keywords(mode, type, kind = 'bracket', br = '') {
        const arch = archFor(mode), n = new Map(), f = br ? { br: norm(br) } : '';
        const words = kind === 'dash' ? dashed : bracketed;
        const add = names => new Set(names.flatMap(words)).forEach(b => n.set(b, (n.get(b) || 0) + 1));
        if (type === 'style') styles(f).forEach(st => add([st.name]));
        else if (type === 'saac') { if (saacOn()) saacList(f).forEach(c => add([c.tag])); }
        else units(type, arch, f).forEach(u => add(u.flatMap(c => loraNames(c.lora).concat(c.variant ? [c.variant.name] : []))));
        return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, k]) => ({ name, meta: `${k}` }));
    }
    // What order:: goes through for a type: every LoRA (or variant) of it, as listed; or the styles.
    const orderList = (type, arch, kw = '', mode = '') => (RATIO.includes(type) ? ratios(type, mode) : type === 'style' ? styles(kw) : units(type, arch, kw).flat());
    // ---- ratio / landscape / portrait: sizes from the tab's 1MB presets (first row) and WP ----
    const RATIO = ['ratio', 'landscape', 'portrait'];
    function ratios(type, mode) {
        const grid = document.getElementById(`resGrid-${mode}`);
        if (!grid) return [];
        const sizes = [...grid.querySelectorAll('.res-switch[data-w]')].slice(0, 4).map(b => [Number(b.dataset.w), Number(b.dataset.h)]);
        const sq = sizes.find(([w, h]) => w === h), wide = sizes.filter(([w, h]) => w !== h).map(([w, h]) => [Math.max(w, h), Math.min(w, h)]);
        const wp = typeof computeWallpaperRes === 'function' ? computeWallpaperRes() : null;
        const tall = wp ? [Math.min(wp.w, wp.h), Math.max(wp.w, wp.h)] : null;
        const land = wide.map(([w, h]) => ({ w, h })), port = wide.map(([w, h]) => ({ w: h, h: w }));
        if (type === 'landscape') return land.concat(tall ? [{ w: tall[1], h: tall[0] }] : []);
        if (type === 'portrait') return port.concat(tall ? [{ w: tall[0], h: tall[1] }] : []);
        return (sq ? [{ w: sq[0], h: sq[1] }] : []).concat(land.flatMap((l, i) => [l, port[i]]), tall ? [{ w: tall[0], h: tall[1] }] : []);
    }
    const ratioIn = t => /(random|order)::(ratio|landscape|portrait)(?![a-z])/i.test(String(t || ''));
    // The tokens a tab offers (tag bar), as { name, meta }.
    function available(mode, prefix = 'random') {
        const out = [], arch = archFor(mode);
        if (styles().length) out.push('style');
        if (prefix === 'random' && saacOn() && arch === 'xl') out.push('saac');
        TYPES.forEach(t => { if (units(t, arch).length) out.push(t); });
        if (GEN.includes(mode)) out.push(...RATIO);
        const grp = groupNames(mode).length ? [{ name: 'group::', meta: '' }] : [];
        if (prefix !== 'order') return out.map(name => ({ name, meta: '' })).concat(grp);
        return out.map(name => { const n = orderList(name, arch, '', mode).length, k = (counters.get(`${mode}:${name}`) || 0) % n; return { name, meta: `next ${k + 1} of ${n}` }; }).concat(grp);
    }
    const has = t => typeof t === 'string' && /(random|order)::[a-z]/i.test(t);
    // What a LoRA adds, as tapping it in the LoRA list does: its tag at its weight, its trigger words, its negatives.
    function loraText(c) {
        const cfg = cfgOf(c.lora.name), v = c.variant;
        const w = v && v.weight !== undefined && v.weight !== null && v.weight !== '' ? v.weight : (cfg.weight !== undefined ? cfg.weight : 1);
        const trigger = String((v ? v.trigger : cfg.trigger) || '').split('\n').map(s => s.trim()).filter(Boolean).join(', ');
        const alias = LM().resolveTagIdentifier(c.lora);
        return { alias, text: `<lora:${alias}:${w}>` + (trigger ? `, ${trigger}` : ''), negative: [cfg.additionalNegative, v && v.negative].filter(Boolean).join(', ') };
    }

    // ---- order:: counters: per tab and type, in memory (start again when the app does) ----
    const counters = new Map(), starts = new Map();
    // A tab's boxes no longer holding order::<type> (deleted, binned, reset): that counter starts again.
    function sync(keep = '') {
        counters.forEach((v, key) => {
            const i = key.indexOf(':'), mode = key.slice(0, i), spec = key.slice(i + 1);
            const [, type, br, dash] = /^([a-z]+)(?: \((.+?)\))?(?: - (.+))?$/.exec(spec) || [, spec, '', ''];
            const lit = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[_\\s]+');
            const re = spec.startsWith('group::') ? new RegExp(`order::group::[ \\t]*${lit(spec.slice(7))}[ \\t]*(?=[,\\n<{|():]|$)`, 'i') : new RegExp(`order::${type}` + (br ? `[ \\t]*\\([ \\t]*${lit(br)}[ \\t]*\\)` : '(?![a-z]|[ \\t]*\\()')
                + (dash ? `[ \\t]+-[ \\t]+${lit(dash)}[ \\t]*(?=[,\\n]|$)` : '(?![ \\t]+-[ \\t])'), 'i');
            const boxes = [document.getElementById(`${mode}_prompt`), ...document.querySelectorAll(`#fc-${mode}-regions textarea`)].filter(Boolean);
            // A job's own text keeps it (a queued job whose box has changed since).
            if (boxes.length && !boxes.some(b => re.test(b.value)) && !re.test(keep)) counters.delete(key);
        });
    }
    // Image `index` of a job: the next in the list from where the job started; the counter moves on unless the seed
    // fixes the picks (Same seed, same picks with a set seed).
    function nextInOrder(key, list, index, frozen) {
        // A seed sent back: the place this order:: was at for that image (noted when the app picked the seed).
        const ctx = orderCtx;
        if (ctx && ctx.play) {
            const k = ctx.n[key] || 0, was = ctx.o[key] && ctx.o[key][k];
            ctx.n[key] = k + 1;
            if (Number.isInteger(was)) { paintOrderSoon(); return list[was % list.length]; }
        }
        if (index === 0 || !starts.has(key)) starts.set(key, counters.get(key) || 0);
        const at = starts.get(key) + index;
        if (!frozen) counters.set(key, at + 1);
        if (ctx && ctx.rec) (ctx.o[key] = ctx.o[key] || []).push(at);
        paintOrderSoon();
        return list[at % list.length];
    }

    // ---- Same seed, same picks with the seed at -1 (7.4-checkpoint39) ----
    // The app picks the seed before anything is picked (Forge would only pick it after), so the picks follow the seed
    // the image really has. Each image's IN ORDER places (order:: tokens, IN ORDER wildcards) are noted under its own
    // seed: that seed sent back gives them again. order:: still moves on for each random-seed image.
    const SEEDREC_KEY = 'bojroSeedOrder', SEEDREC_MAX = 300;
    // The seed the app picked for the job being run (null: the job's own seed, typed or sent back).
    let orderCtx = null, imageSeed = null, rolledNow = null;
    const seededOn = () => localStorage.getItem('bojroWcSeeded') === 'true';
    function rollSeed(job) {
        const p = job && job.payload;
        if (!p) return;
        // Run again (a queued job, REPEAT): a new seed each time.
        if (job.seedRolled) { p.seed = -1; delete job.seedRolled; }
        rolledNow = null;
        if (!seededOn() || Number(p.seed) !== -1) return;
        p.seed = Math.floor(Math.random() * 2147483000);
        job.seedRolled = true;
        rolledNow = p.seed;
        if (typeof dlog === 'function') dlog(`seed ${p.seed} picked by the app (Same seed, same picks)`);
    }
    const rolled = seed => rolledNow !== null && Number(seed) === rolledNow;
    function seedRecs() { try { const a = JSON.parse(localStorage.getItem(SEEDREC_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
    function seedRec(seed) { const s = Number(seed); return seedRecs().find(r => r && r.s === s) || null; }
    function seedNote(seed, patch) {
        try {
            const s = Number(seed), all = seedRecs(), old = all.find(r => r && r.s === s) || { s };
            const rec = { ...old, ...patch, s };
            localStorage.setItem(SEEDREC_KEY, JSON.stringify([rec].concat(all.filter(r => r && r.s !== s)).slice(0, SEEDREC_MAX)));
        } catch (e) {}
    }
    // Wildcards.parts(): the image being picked (its own seed), for the notes.
    const atImage = s => { imageSeed = s == null ? null : Number(s); };

    // ---- order:: progress under each generation tab's MORE SETTINGS card ----
    const GEN = ['xl', 'anima', 'qwen', 'flux', 'krea'];
    const escH = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    // The order:: tokens in a tab's prompt (and Forge Couple regions): [{ spec, next, n }], once each.
    function orderStatus(mode) {
        const boxes = [document.getElementById(`${mode}_prompt`), ...document.querySelectorAll(`#fc-${mode}-regions:not(.hidden) textarea`)].filter(Boolean);
        const out = new Map();
        boxes.forEach(b => [...String(b.value || '').matchAll(new RegExp(TOKEN.source, 'gi'))].forEach(m => {
            const type = m[2].toLowerCase();
            if (m[1].toLowerCase() !== 'order' || !(type === 'style' || TYPES.includes(type) || RATIO.includes(type))) return;
            const f = m[3] || m[4] ? { br: norm(m[3]), dash: norm(m[4]) } : '';
            const spec = specOf(type, f);
            if (out.has(spec)) return;
            const n = orderList(type, archFor(mode), f, mode).length;
            const at = view && view.has(`${mode}:${spec}`) ? view.get(`${mode}:${spec}`) : counters.get(`${mode}:${spec}`) || 0;
            out.set(spec, { spec, n, next: n ? (at % n) + 1 : 0, lora: type !== 'style' });
        }));
        boxes.forEach(b => [...String(b.value || '').matchAll(new RegExp(GROUP_TOKEN.source, 'gi'))].forEach(m => {
            if (m[1].toLowerCase() !== 'order') return;
            const spec = `group::${norm(m[2])}`;
            if (out.has(spec)) return;
            const n = groupCands(norm(m[2]), archFor(mode)).length;
            const at = view && view.has(`${mode}:${spec}`) ? view.get(`${mode}:${spec}`) : counters.get(`${mode}:${spec}`) || 0;
            out.set(spec, { spec, n, next: n ? (at % n) + 1 : 0, lora: true });
        }));
        return [...out.values()];
    }
    let paintTimer = 0;
    function paintOrderSoon() { clearTimeout(paintTimer); paintTimer = setTimeout(paintOrder, 60); }
    function paintOrder() {
        GEN.forEach(mode => {
            const card = document.getElementById(`grp-${mode}-seed-more`);
            if (!card) return;
            let box = document.getElementById(`orderStatus-${mode}`);
            const list = orderStatus(mode);
            if (!box) {
                if (!list.length) { lockRes(mode); return; }
                card.parentElement.insertAdjacentHTML('afterend', `<div id="orderStatus-${mode}" class="order-status"></div>`);
                box = document.getElementById(`orderStatus-${mode}`);
            }
            box.classList.toggle('hidden', !list.length);
            lockRes(mode);
            box.innerHTML = list.map(o => `<div class="order-line"><b>order::${escH(o.spec)}</b><span>${o.n ? `next ${o.next} of ${o.n}` : (!o.lora ? 'no styles' : LM() && !(LM().allLoras || []).length ? 'LoRAs not loaded yet' : 'none for this model')}</span>` +
                `<button type="button" class="order-reset" data-spec="${escH(o.spec)}" title="Start again" aria-label="Start again"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></button></div>`).join('');
            box.querySelectorAll('.order-reset').forEach(b => { b.onclick = () => resetOrder(mode, b.dataset.spec); });
            lockRes(mode);
            // A LoRA type's list needs the LoRA list: loaded, then shown again.
            if (list.some(o => o.lora && !o.n) && LM() && !(LM().allLoras || []).length) ensureLoras().then(() => { if ((LM().allLoras || []).length) paintOrderSoon(); });
        });
    }
    // A ratio token in the tab's prompt: its size presets and width / height can't be changed (a note says why).
    function lockRes(mode) {
        const grid = document.getElementById(`resGrid-${mode}`);
        if (!grid) return;
        const boxes = [document.getElementById(`${mode}_prompt`), ...document.querySelectorAll(`#fc-${mode}-regions:not(.hidden) textarea`)].filter(Boolean);
        const m = boxes.map(b => /(random|order)::(ratio|landscape|portrait)(?![a-z])/i.exec(b.value || '')).find(Boolean);
        grid.classList.toggle('res-locked', !!m);
        grid.dataset.lock = m ? `${m[1].toLowerCase()}::${m[2].toLowerCase()}` : '';
        [`${mode}_width`, `${mode}_height`].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = !!m; });
        // A tap on a locked preset: a toast instead.
        if (!grid.dataset.lockTap) {
            grid.dataset.lockTap = '1';
            grid.addEventListener('click', e => {
                if (!grid.classList.contains('res-locked')) return;
                e.stopImmediatePropagation();
                e.preventDefault();
                if (typeof Toast !== 'undefined') Toast.show({ text: `The size is set by ${grid.dataset.lock} in the prompt`, duration: 'short' });
            }, true);
        }
    }
    function resetOrder(mode, spec) {
        counters.delete(`${mode}:${spec}`);
        starts.delete(`${mode}:${spec}`);
        paintOrder();
    }

    // A job's texts with their random:: and order:: picked for image `index`. memo keeps the nth use the same in the
    // image's texts (prompt, Hi-Res, ADetailer); problems collects what couldn't be picked (wildcards.js logs them).
    // Where each image of the job being sent left the counters (ready() starts a job), for rollback() on ABORT.
    let marks = new Map();
    // While a job runs, the counters as the line under MORE SETTINGS shows them: where the image after the running
    // one starts (null: the counters themselves, once the job is done).
    let view = null;
    function running(index) {
        view = index == null ? null : marks.get(index + 1) || null;
        paintOrderSoon();
    }
    function rollback(index) {
        view = null;
        const m = marks.get(index);
        if (!m) return;
        counters.clear();
        m.forEach((v, k) => counters.set(k, v));
        marks = new Map();
        paintOrderSoon();
    }
    function expandPayload(p, mode, memo, problems, index = 0) {
        const seed = Number(p.seed), img = imageSeed != null ? imageSeed : seed + index, was = orderCtx;
        // A seed the app picked: its order:: places noted. A seed typed or sent back: noted places given again.
        orderCtx = !seededOn() || !Number.isFinite(seed) || seed === -1 ? null
            : rolled(seed) ? { rec: true, o: {}, n: {} }
            : (r => (r && r.o ? { play: true, o: r.o, n: {} } : null))(seedRec(img));
        try { return expandOne(p, mode, memo, problems, index); } finally {
            const c = orderCtx;
            orderCtx = was;
            if (c && c.rec && Object.keys(c.o).length) seedNote(img, { o: c.o });
        }
    }
    function expandOne(p, mode, memo, problems, index) {
        if (!marks.has(index)) marks.set(index, new Map(counters));
        const arch = archFor(mode), negs = [];
        const frozen = seededOn() && Number.isFinite(Number(p.seed)) && Number(p.seed) !== -1 && !rolled(p.seed);
        // LoRAs already in the prompt, and ones picked for this image, aren't picked again by random::.
        if (!memo.has('random:taken')) memo.set('random:taken', new Set([...String(p.prompt || '').matchAll(/<lora:([^:>]+):/gi)].map(m => m[1])));
        const taken = memo.get('random:taken');
        let count;
        const lora = (c, field) => {
            const t = loraText(c);
            taken.add(t.alias);
            if (t.negative && field === 'prompt') negs.push(t.negative);
            return t.text;
        };
        const pick = (how, type, field, kw = '') => {
            const spec = specOf(type, kw), what = `${how}::${spec}`;
            const n = (count.get(how + spec) || 0) + 1;
            count.set(how + spec, n);
            const slot = `${how}:${spec}#${n}`;
            if (memo.has(slot)) { const r = memo.get(`${slot}:size`); if (r) { p.width = r.w; p.height = r.h; } return memo.get(slot); }
            let out = '';
            if (RATIO.includes(type)) {
                // The image's size (the token itself leaves no text).
                const list = GEN.includes(mode) ? ratios(type, mode) : [];
                if (list.length) {
                    const r = how === 'order' ? nextInOrder(`${mode}:${spec}`, list, index + n - 1, frozen) : any(list);
                    p.width = r.w; p.height = r.h;
                    memo.set(`${slot}:size`, r);
                } else (problems || []).push({ type: 'random', name: `${what} only sets the size in a generation tab` });
            } else if (how === 'order') {
                const list = orderList(type, arch, kw, mode);
                if (list.length) {
                    const c = nextInOrder(`${mode}:${spec}`, list, index + n - 1, frozen);
                    out = type === 'style' ? `style::${c.name}` : lora(c, field);
                } else (problems || []).push({ type: 'random', name: `no ${type === 'style' ? 'styles' : `${type} LoRAs for this model`} for ${what}` });
            } else if (type === 'style') {
                const used = new Set(StyleManager.tokensIn(p.prompt));
                const free = styles(kw).filter(s => !used.has(s.name));
                if (free.length) out = `style::${any(free).name}`;
                else (problems || []).push({ type: 'random', name: `no styles to pick for ${what}` });
            } else if (type === 'saac') {
                const list = saacOn() ? saacList(kw) : [];
                if (list.length) { const c = any(list); out = window.formatInsertedTags ? formatInsertedTags(c.tag, 'xl') : c.tag; }
                else (problems || []).push({ type: 'random', name: 'no SAAC characters (SAAC off or not loaded)' });
            } else {
                const free = units(type, arch, kw).map(u => u.filter(c => !taken.has(LM().resolveTagIdentifier(c.lora)))).filter(u => u.length);
                if (free.length) out = lora(any(any(free)), field);
                else (problems || []).push({ type: 'random', name: `no ${type} LoRAs for this model for ${what}` });
            }
            memo.set(slot, out);
            return out;
        };
        // random::group::Name (any LoRA of the group not in the image yet) / order::group::Name (each in turn).
        const pickGroup = (how, name, field) => {
            const key = norm(name), spec = `group::${key}`, what = `${how}::group::${name}`;
            const n = (count.get(how + spec) || 0) + 1;
            count.set(how + spec, n);
            const slot = `${how}:${spec}#${n}`;
            if (memo.has(slot)) return memo.get(slot);
            const list = groupCands(key, arch);
            let out = '';
            // All combinations (wildcards.js): the one this image goes with.
            const ci = memo.get(`${slot}:combo`);
            if (Number.isInteger(ci) && list[ci]) out = lora(list[ci], field);
            else if (!list.length) (problems || []).push({ type: 'random', name: `no LoRA group or LoRA with variants called "${name}" for this model for ${what}` });
            else if (how === 'order') out = lora(nextInOrder(`${mode}:${spec}`, list, index + n - 1, frozen), field);
            else {
                const free = list.filter(c => !taken.has(LM().resolveTagIdentifier(c.lora)));
                if (free.length) out = lora(any(free), field);
                else (problems || []).push({ type: 'random', name: `every LoRA of "${name}" is in the prompt already for ${what}` });
            }
            memo.set(slot, out);
            return out;
        };
        // Counted per text, so the nth random::character of the Hi-Res prompt is the prompt's nth.
        // Tokens with a (word) or - part first, then plain ones (both counted per text).
        const put = (t, field) => {
            if (!has(t)) return t;
            count = new Map();
            const one = keyed => (m, how, type, br, dash) => {
                if (!!(br || dash) !== keyed) return m;
                const k = type.toLowerCase(), f = br || dash ? { br: norm(br), dash: norm(dash) } : '';
                return k === 'style' || TYPES.includes(k) || (RATIO.includes(k) && !keyed) || (k === 'saac' && how.toLowerCase() === 'random') ? pick(how.toLowerCase(), k, field, f) : m;
            };
            return t.replace(GROUP_TOKEN, (m, how, name) => pickGroup(how.toLowerCase(), name, field)).replace(TOKEN, one(true)).replace(TOKEN, one(false));
        };
        const tidy = t => (window.WcEngine ? WcEngine.tidyBlank(t) : t);
        if (index === 0) sync(texts(p).map(t => String(t || '')).join('\n'));
        ['prompt', 'hr_prompt'].forEach(f => { if (has(p[f])) p[f] = tidy(put(p[f], f === 'prompt' ? 'prompt' : 'hr')); });
        ['negative_prompt', 'hr_negative_prompt'].forEach(f => { if (has(p[f])) p[f] = tidy(put(p[f], 'neg')); });
        const ad = p.alwayson_scripts?.ADetailer?.args;
        if (Array.isArray(ad) && ad.some(u => u && (has(u.ad_prompt) || has(u.ad_negative_prompt)))) {
            p.alwayson_scripts = { ...p.alwayson_scripts, ADetailer: { ...p.alwayson_scripts.ADetailer, args: ad.map(u => (u && typeof u === 'object' ? { ...u, ad_prompt: tidy(put(u.ad_prompt, 'ad')), ad_negative_prompt: tidy(put(u.ad_negative_prompt, 'neg')) } : u)) } };
        }
        if (negs.length) {
            const base = String(p.negative_prompt || '').replace(/[\s,]+$/, '');
            p.negative_prompt = base ? `${base}, ${negs.join(', ')}` : negs.join(', ');
        }
        return p;
    }
    // The LoRA list, fetched once without the LoRA window when none has loaded this session (what open() keeps).
    let loading = null;
    function ensureLoras() {
        const M = LM();
        if (!M || (M.allLoras && M.allLoras.length)) return Promise.resolve();
        if (loading) return loading;
        const host = (typeof buildWebUIUrl === 'function' && buildWebUIUrl()) || (typeof HOST !== 'undefined' ? HOST : '');
        loading = fetch(`${host}/sdapi/v1/loras`, { headers: typeof getHeaders === 'function' ? getHeaders() : {} })
            .then(r => (r.ok ? r.json() : null))
            .then(data => {
                if (!Array.isArray(data) || (M.allLoras && M.allLoras.length)) return;
                M.detectDuplicateAliases(data);
                M.allLoras = M.sortLoras(data);
                M.allLorasHost = host;
                if (window.dbg) dbg(`random:: LoRA list loaded (${data.length})`);
            })
            .catch(e => { if (window.dbg) dbg(`random:: LoRA list failed: ${e && e.message}`); })
            .finally(() => { loading = null; });
        return loading;
    }
    const texts = p => ['prompt', 'negative_prompt', 'hr_prompt', 'hr_negative_prompt'].map(f => p[f])
        .concat((p.alwayson_scripts?.ADetailer?.args || []).flatMap(u => (u ? [u.ad_prompt, u.ad_negative_prompt] : [])));
    const inPayload = p => !!p && texts(p).some(has);
    // A job waits for what its tokens need: the LoRA list, SAAC's characters.
    function ready(job) {
        marks = new Map();
        view = null;
        if (!job || !job.payload) return Promise.resolve();
        const all = texts(job.payload).map(t => String(t || '')).join('\n');
        const waits = [];
        if (/(random|order)::(?!style\b|saac\b)[a-z]/i.test(all)) waits.push(ensureLoras());
        if (/random::saac\b/i.test(all) && window.SaacManager && !SaacManager.isLoaded) waits.push(SaacManager.init());
        return Promise.all(waits);
    }
    document.addEventListener('input', e => {
        if (!e.target || e.target.tagName !== 'TEXTAREA') return;
        if (counters.size) sync();
        paintOrderSoon();
    }, true);
    // A prompt set by the app (history, presets, a tab switch): checked now and then while the app is in front.
    setInterval(() => { if (!document.hidden) paintOrder(); }, 1500);

    // All combinations: each group token's LoRAs as a choice ([[memo key, index]] per LoRA), counted as put() counts.
    function groupAxes(prompt, mode) {
        const arch = archFor(mode), count = new Map();
        return [...String(prompt || '').matchAll(new RegExp(GROUP_TOKEN.source, 'gi'))].map(m => {
            const how = m[1].toLowerCase(), key = norm(m[2]), spec = `group::${key}`, n = (count.get(how + spec) || 0) + 1;
            count.set(how + spec, n);
            return groupCands(key, arch).map((c, i) => [[`${how}:${spec}#${n}:combo`, i]]);
        });
    }
    const hasGroupToken = t => new RegExp(GROUP_TOKEN.source, 'i').test(String(t || ''));
    window.RandomTokens = { GROUP_TOKEN, groupAxes, hasGroupToken, groupName, groupKey, groupCands, groupNames, RATIO, ratios, lockRes, TYPES, typeOf, archFor, units, available, keywords, bracketed, dashed, has, inPayload, expandPayload, ensureLoras, ready, rollSeed, rolled, seedRec, seedNote, atImage, sync, rollback, running, orderStatus, paintOrder, resetOrder, _counters: counters };
})();
