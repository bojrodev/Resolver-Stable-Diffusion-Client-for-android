// The wildcard engine of the app (www/js/wcengine.js, Resolver v3.0), copied unchanged, so the Wildcards page's examples
// pick exactly as the app does.
// Wildcard engine: a library compiled once per change; texts resolved (__wildcards__, {a|b} choices, ${variables}, tags,
// filters, conditions and rules) with an optional trace of every pick and a list of problems. wildcards.js sits on top.
(function () {
    const TOKEN = /__([A-Za-z0-9(-](?:(?!__)[A-Za-z0-9_ ()-])*?)__/g;
    // __name(season=winter, mood=calm)__: the wildcard with those variables set while it is picked; __name[indoor & !wet]__:
    // only its options whose tags fit.
    const CALL = /__([A-Za-z0-9(-](?:(?!__)[A-Za-z0-9_ ()-])*?)(?:\(([^()]*=[^()]*)\))?(?:\[([^\[\]]*)\])?__/g;
    const MAX_DEPTH = 16;
    // An option line: "3::a" three times as likely, "?winter:: coat" only when that holds, "library ## indoor" tagged (never
    // sent). A line "## indoor" tags every option, "#! …" is a rule (below); other lines starting with # are notes.
    const WEIGHT = /^(\d+(?:\.\d+)?)\s*::\s*/;
    const COND = /^\?([^:]*(?::(?!:)[^:]*)*)::\s*/;
    const nameKey = name => String(name).trim().replace(/\s+/g, '_').toLowerCase();
    const tagList = t => String(t || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    function parseOption(l) {
        let t = String(l).trim(), weight = 1, cond = null, tags = [];
        const w = WEIGHT.exec(t);
        if (w) { weight = Number(w[1]); t = t.slice(w[0].length); }
        const c = COND.exec(t);
        if (c) { cond = c[1].trim(); t = t.slice(c[0].length); }
        const h = t.indexOf('##');
        if (h > 0) { tags = tagList(t.slice(h + 2)); t = t.slice(0, h).trim(); }
        return { text: t, weight, cond, tags };
    }
    const weighted = w => {
        const all = w.lines.map(l => String(l).trim()).filter(Boolean);
        const shared = all.filter(l => l.startsWith('##')).flatMap(l => tagList(l.slice(2)));
        return all.filter(l => !l.startsWith('#')).map(parseOption).filter(o => o.text)
            .map(o => (shared.length ? { ...o, tags: [...new Set([...shared, ...o.tags])] } : o));
    };
    // The random numbers: Math.random, or a seeded one while withRandom() runs (Same seed, same picks).
    let rnd = Math.random;
    function withRandom(r, fn) {
        const was = rnd;
        rnd = r || Math.random;
        try { return fn(); } finally { rnd = was; }
    }
    // A repeatable sequence from a number (mulberry32).
    function seeded(n) {
        let a = (Number(n) >>> 0) ^ 0x9e3779b9;
        return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    function weightedPick(opts) {
        const total = opts.reduce((s, o) => s + o.weight, 0);
        if (!(total > 0)) return opts[Math.floor(rnd() * opts.length)].text;
        let r = rnd() * total;
        for (const o of opts) { r -= o.weight; if (r < 0) return o.text; }
        return opts[opts.length - 1].text;
    }

    // ---- the library ----
    // { byKey: Map(key -> { w, opts }) }, built again only when the list changes.
    let lastList = null, lastLib = null;
    function compile(list) {
        if (list === lastList && lastLib) return lastLib;
        const byKey = new Map();
        list.forEach(w => { const k = nameKey(w.name); if (!byKey.has(k)) byKey.set(k, { w, opts: null }); });
        lastList = list;
        lastLib = { list, byKey };
        return lastLib;
    }
    const entry = (lib, name) => lib.byKey.get(nameKey(name)) || null;
    // __outfits*__ / __outfits/*__: the library's wildcards whose names fit (a "/" or "_" as a space, * as anything).
    const GLOB = /__((?:(?!__)[A-Za-z0-9_ ()\/*-])*\*(?:(?!__)[A-Za-z0-9_ ()\/*-])*)__/g;
    const globKey = t => String(t).toLowerCase().replace(/[\/_]+/g, ' ').replace(/\s+/g, ' ').trim();
    function globNames(lib, pat) {
        if (!lib.globs) lib.globs = new Map();
        const k = globKey(pat);
        if (!lib.globs.has(k)) {
            const re = new RegExp('^' + k.split(/\*+/).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
            lib.globs.set(k, lib.list.map(w => w.name).filter(n => re.test(globKey(n))));
        }
        return lib.globs.get(k);
    }
    const hasGlob = (t, lib) => typeof t === 'string' && t.indexOf('*') >= 0 && [...t.matchAll(GLOB)].some(m => globNames(lib, m[1]).length);
    const globs = (t, lib) => t.replace(GLOB, (m, pat) => { const n = globNames(lib, pat); return n.length ? `{${n.map(x => `__${x}__`).join('|')}}` : m; });
    // Every label the library's options have (item 61: a typed tag's last word that is one labels the image).
    function labelsOf(lib) {
        if (!lib.labels) { lib.labels = new Set(); lib.byKey.forEach(e => optsOf(e).forEach(o => o.tags.forEach(t => lib.labels.add(t)))); }
        return lib.labels;
    }
    const optsOf = e => e.opts || (e.opts = weighted(e.w));

    // ---- rules ----
    // "#! a excludes b" (either way round), "#! excludes b" (none at all), "#! a requires b", "#! one of: a, b, c"; tags may
    // be lists. They apply to the image once their wildcard is used (picked first: ordered()); rules alone give nothing.
    // "#! last": the wildcard is picked after the rest of the text (finishLate()).
    function parseRule(line) {
        const t = line.slice(2).trim().toLowerCase();
        if (t === 'last') return { type: 'last', src: line };
        const one = /^one of\s*:?\s*(.+)$/.exec(t);
        if (one) return { type: 'one', tags: tagList(one[1]), src: line };
        const m = /^(?:(.+?)\s+)?(excludes|requires)\s+(.+)$/.exec(t);
        if (!m || !m[1] && m[2] === 'requires') return { type: 'bad', src: line };
        return { type: m[2], a: m[1] ? tagList(m[1]) : null, b: tagList(m[3]), src: line };
    }
    const rulesOf = e => e.rules || (e.rules = e.w.lines.map(l => String(l).trim()).filter(l => l.startsWith('#!')).map(parseRule));
    // Why an option with these tags breaks a rule given what is picked, or ''.
    function ruleBreak(tags, s) {
        if (!s.rules.length || !tags.length) return '';
        const picked = s.tags, has = t => picked.has(t);
        for (const r of s.rules) {
            if (r.type === 'excludes' && (!r.a ? tags.some(t => r.b.includes(t)) : tags.some(t => r.a.includes(t)) && r.b.some(has) || tags.some(t => r.b.includes(t)) && r.a.some(has))) return r.src;
            if (r.type === 'requires' && tags.some(t => r.a.includes(t)) && !r.b.every(has)) return r.src;
            if (r.type === 'one' && tags.some(t => r.tags.includes(t) && !has(t)) && r.tags.some(has)) return r.src;
        }
        return '';
    }

    // ---- resolving ----
    // s: memo keeps the nth use of a wildcard or choice the same across an image's texts; vars, tags and rules are the
    // image's (image()); index is its place in Batch Count (in-order picks); trace collects every pick.
    const image = () => ({ vars: new Map(), tags: new Set(), rules: [], ruled: new Set() });
    function state(o = {}) {
        const im = o.image || image();
        return { memo: o.memo || new Map(), count: o.count || new Map(), active: o.active || new Set(), index: o.index || 0, vars: im.vars, tags: im.tags, rules: im.rules, ruled: im.ruled, trace: o.trace || null, problems: o.problems || null, avoid: o.avoid || null, record: o.record || null, recIn: null, ban: o.ban || null, noRepeat: !!o.noRepeat, steer: o.steer || null, onPick: o.onPick || null };
    }

    // ---- conditions and filters ----
    // "indoor & !wet", "(a | b), c" (comma is and), "season=winter", "mood!=calm": a word is a tag (a filter's option's
    // own, a ?condition::'s picked for the image), name=value a variable.
    const exprCache = new Map();
    function parseExpr(src) {
        if (exprCache.has(src)) return exprCache.get(src);
        const toks = (src.match(/!=|[&|,!()]|[^&|,!()]+/g) || []).filter(t => t.trim());
        let i = 0;
        const peek = () => (toks[i] || '').trim(), next = () => toks[i++];
        function or() { let a = and(); while (peek() === '|') { next(); a = { op: '|', a, b: and() }; } return a; }
        function and() { let a = not(); while (peek() === '&' || peek() === ',') { next(); a = { op: '&', a, b: not() }; } return a; }
        function not() {
            if (peek() === '!') { next(); return { op: '!', a: not() }; }
            if (peek() === '(') { next(); const e = or(); if (peek() !== ')') throw new Error('bracket'); next(); return e; }
            let t = (next() || '').trim();
            if (!t) throw new Error('empty');
            if (peek() === '!=') { next(); return { op: '!=', name: t.toLowerCase(), value: (next() || '').trim().toLowerCase() }; }
            const eq = t.indexOf('=');
            return eq > 0 ? { op: '=', name: t.slice(0, eq).trim().toLowerCase(), value: t.slice(eq + 1).trim().toLowerCase() } : { op: 'tag', tag: t.toLowerCase() };
        }
        let ast;
        try {
            ast = or();
            if (i < toks.length) throw new Error('extra');
        } catch (e) { ast = { op: 'bad' }; }
        exprCache.set(src, ast);
        return ast;
    }
    function holds(ast, tags, s) {
        switch (ast.op) {
            case '|': return holds(ast.a, tags, s) || holds(ast.b, tags, s);
            case '&': return holds(ast.a, tags, s) && holds(ast.b, tags, s);
            case '!': return !holds(ast.a, tags, s);
            case 'tag': return tags.has(ast.tag);
            case '=': case '!=': {
                const v = s.vars.get(ast.name), val = v && 'value' in v ? String(v.value).trim().toLowerCase() : '';
                return ast.op === '=' ? val === ast.value : val !== ast.value;
            }
            default: return false;
        }
    }
    function check(src, tags, s, where) {
        const ast = parseExpr(src);
        if (ast.op === 'bad') { problem(s, 'expr', `${where}: ${src}`); return false; }
        return holds(ast, tags, s);
    }
    // The options that may be picked now: their ?condition:: holds, with a filter their tags fit it, and they break no
    // rule (if the rules alone leave none, it is said so).
    function eligible(opts, s, filter, where, out = {}) {
        out.left = [];
        const fit = opts.filter(o => {
            if (o.cond && !check(o.cond, s.tags, s, where)) { out.left.push({ text: o.text, why: `?${o.cond}` }); return false; }
            if (filter && !check(filter, new Set(o.tags), s, where)) { out.left.push({ text: o.text, why: `[${filter}]` }); return false; }
            return true;
        });
        out.ruledOut = [];
        if (!s.rules.length) return fit;
        const ok = fit.filter(o => { const r = ruleBreak(o.tags, s); if (r) out.ruledOut.push({ text: o.text, rule: r }); return !r; });
        if (!ok.length && fit.length) problem(s, 'rules', where);
        return ok;
    }
    function problem(s, type, name) {
        if (s.problems && !s.problems.some(p => p.type === type && p.name === name)) s.problems.push({ type, name });
    }
    // A tag as compared: lower case, no weight or brackets, underscores as spaces.
    const plainTag = t => String(t).toLowerCase().replace(/_/g, ' ').replace(/[()\[\]{}]|:\s*-?[\d.]+/g, ' ').replace(/\s+/g, ' ').trim();
    // <...> (LoRA) tags go first: a LoRA file name can hold "__", which would pair with a wildcard's.
    const ownTags = text => text.replace(/<[^<>]*>/g, ',').replace(/__(?:(?!__)[\s\S])*?__/g, ',').replace(/\{[^{}]*\}/g, ',')
        .split(/[,\n]/).map(plainTag).filter(Boolean);
    // Clothing the prompt mentions, by kind: a tag holding one of these words gives the label (not "dress shirt" for
    // dress, nor a tag that says it's off: "pants down", "no panties"). Wildcards' own labels have the same names.
    const OUTFIT = [
        ['legs-covered', 'pants jeans trousers slacks shorts leggings pantyhose tights overalls jumpsuit hakama sweatpants joggers spats capris'],
        ['one-piece', 'leotard bodysuit catsuit unitard jumpsuit swimsuit bikini plugsuit wetsuit monokini tankini one-piece|sports bra|diving suit|playboy bunny'],
        ['leotard', 'leotard|playboy bunny'],
        ['skirt', 'skirt miniskirt'],
        ['dress', 'dress sundress gown qipao cheongsam'],
        ['top', 'shirt blouse t-shirt sweater hoodie jersey camisole cardigan tunic polo|tank top|crop top|tube top'],
        ['zip-front', 'zipper zip-up|track jacket'],
        ['button-front', 'buttons button-up button-down blazer cardigan|dress shirt|collared shirt'],
        ['cold', 'parka mittens earmuffs scarf|winter coat|down jacket|puffer jacket|snow boots|winter clothes'],
    ].map(([label, words]) => [label, words.split('|').flatMap((g, i) => (i === 0 ? g.split(' ') : [g])).filter(Boolean)]);
    const NOT_WORN = /\b(pull|pulled|down|aside|removed|lift|lifted|open|unzipped|unbuttoned|around|off)\b|^no /;
    const NOT_DRESS = /\bdress (shirt|shoes|socks)\b/;
    function outfitLabels(tags) {
        const out = new Set();
        tags.forEach(t => {
            if (t === 'nude' || t === 'naked' || t === 'completely nude') out.add('nude');
            if (NOT_WORN.test(t)) return;
            const w = ' ' + t + ' ';
            OUTFIT.forEach(([label, words]) => {
                if (label === 'dress' && NOT_DRESS.test(t)) return;
                if (words.some(x => w.indexOf(' ' + x + ' ') >= 0)) out.add(label);
            });
        });
        return out;
    }
    // The prompt's own text (not its wildcards, choices or LoRA tags) gives labels: clothing it mentions, and the words
    // of the optional "prompt labels" wildcard ("leotard, catsuit ## one-piece"). Only an image's first text is read.
    const FROM_TEXT = Symbol('labelled from text');
    function textLabels(text, lib, s) {
        if (s.tags[FROM_TEXT]) return;
        s.tags[FROM_TEXT] = true;
        s.tags[WORN] = wearOfText(text);
        wearLabels(s.tags[WORN].all).forEach(t => s.tags.add(t));
        const own = ownTags(text);
        if (!own.length) return;
        outfitLabels(own).forEach(t => s.tags.add(t));
        const labels = labelsOf(lib);
        own.forEach(t => { const w = t.split(' ').pop(); if (labels.has(t)) s.tags.add(t); if (labels.has(w)) s.tags.add(w); });
        const e = entry(lib, 'prompt labels');
        if (!e) return;
        optsOf(e).forEach(o => {
            const hit = tagList(o.text).some(w => own.some(t => (' ' + t + ' ').indexOf(' ' + w + ' ') >= 0));
            if (hit) o.tags.forEach(t => s.tags.add(t));
        });
    }
    // Tags in the negative (s.avoid): an option that would add one is passed over while others fit.
    // ~word in the negative (avoid.ends): any tag ending in that word.
    const avoided = (avoid, t) => avoid.has(t) || !!avoid.ends && avoid.ends.some(w => t === w || t.endsWith(' ' + w));
    const avoids = (o, s) => ownTags(o.text).some(t => avoided(s.avoid, t));
    const callsBanned = (text, ban) => { let hit = false; String(text).replace(CALL, (w, n) => { if (ban.has(nameKey(n))) hit = true; return w; }); return hit; };
    // Wildcards written in a text (the negative prompt's, for ban).
    const callsIn = text => { const out = new Set(); String(text || '').replace(CALL, (w, n) => { out.add(nameKey(n)); return w; }); return out; };

    // ---- what the character wears ----
    // A clothing tag names its garment last ("black dress", "yoga top") once state words are off ("panties pulled
    // down", "open jacket"). Each kind fills body slots; words the scene model taught (learnWear()) count too.
    const WEAR = {
        hat: ['head', 'hat cap beret helmet beanie fedora bonnet hood headwear'],
        glasses: ['eyes', 'glasses sunglasses goggles eyewear monocle'],
        neckwear: ['neck', 'scarf necktie tie bowtie neckerchief ascot cravat'],
        outer: ['outer', 'jacket coat blazer cardigan parka cape cloak poncho windbreaker raincoat vest waistcoat haori bolero shawl labcoat overcoat peacoat anorak capelet'],
        hoodie: ['top outer', 'hoodie'],
        top: ['top', 'shirt blouse t-shirt tshirt sweater sweatshirt jersey camisole tunic polo top turtleneck pullover|sweater vest'],
        sportsbra: ['bra top', '|sports bra'],
        bra: ['bra', 'bra brassiere bandeau sarashi pasties'],
        bikinitop: ['bra', '|bikini top'],
        skirt: ['bottom', 'skirt miniskirt microskirt'],
        pants: ['bottom', 'pants trousers jeans shorts slacks joggers sweatpants hakama culottes capris buruma bloomers spats overalls dungarees'],
        panties: ['panties', 'panties panty thong g-string briefs boxers knickers fundoshi shimapan underpants'],
        bikinibottom: ['panties', '|bikini bottom|bikini bottoms'],
        legwear: ['legs', 'thighhighs thighhigh kneehighs kneehigh stockings stocking pantyhose tights socks sock fishnets legwear|thigh highs|knee highs|leg warmers'],
        leggings: ['legs bottom', 'leggings'],
        shoes: ['feet', 'shoes shoe boots boot sneakers trainers heels sandals loafers slippers flats pumps geta zouri okobo footwear clogs stilettos|mary janes'],
        gloves: ['hands', 'gloves glove mittens gauntlets|arm warmers'],
        dress: ['top bottom', 'dress sundress gown qipao cheongsam nightgown chemise babydoll pinafore'],
        robe: ['top bottom outer', 'kimono yukata robe bathrobe hanfu furisode'],
        onepiece: ['top bottom bra panties', 'leotard bodysuit catsuit unitard swimsuit plugsuit wetsuit monokini teddy bunnysuit one-piece|playboy bunny|bunny suit|diving suit'],
        jumpsuit: ['top bottom', 'jumpsuit romper boilersuit|flight suit|space suit'],
        bikini: ['bra panties', 'bikini tankini microkini|bikini armor|bikini armour'],
        underwear: ['bra panties', 'underwear lingerie'],
        uniform: ['top bottom', 'uniform serafuku gakuran outfit costume suit tracksuit maid'],
        armor: ['top bottom outer bra panties', 'armor armour'],
        towel: ['top bottom', 'towel'],
    };
    // Only what is done with these counts ("towel wrapped around body"); a towel alone is a prop.
    const ACT_ONLY = new Set(['towel']);
    const SLOTS = {}, WORD = new Map();
    Object.entries(WEAR).forEach(([k, [slots, words]]) => {
        SLOTS[k] = slots.split(' ');
        words.split('|').forEach((g, i) => (i === 0 ? g.split(' ') : [g]).filter(Boolean).forEach(w => WORD.set(w, k)));
    });
    ['hair tie', 'hair scarf', 'spinning top', 'bottle cap', 'birthday suit', 'swim cap'].forEach(w => WORD.set(w, null));
    // An action on a garment ("skirt lift") also fits these worn kinds.
    const COMPAT = { top: ['hoodie', 'sportsbra', 'uniform'], hoodie: ['top', 'outer', 'uniform'], outer: ['hoodie', 'uniform', 'robe'],
        bra: ['sportsbra', 'bikini', 'bikinitop', 'underwear'], sportsbra: ['bra', 'top'], bikini: ['bikinitop', 'bikinibottom'],
        bikinitop: ['bikini', 'bra'], bikinibottom: ['bikini', 'panties'], panties: ['bikini', 'bikinibottom', 'underwear'],
        underwear: ['bra', 'panties', 'bikini'], skirt: ['dress', 'uniform'], pants: ['uniform', 'jumpsuit', 'leggings'],
        leggings: ['legwear', 'pants'], legwear: ['leggings'], dress: ['robe'], robe: ['dress'], uniform: ['top', 'skirt', 'pants', 'outer', 'dress'] };
    const BODY = ['top', 'bottom', 'bra', 'panties', 'outer'];
    const NONE_TAG = { nude: BODY, naked: BODY, 'completely nude': BODY, topless: ['top', 'bra', 'outer'], bottomless: ['bottom', 'panties'], barefoot: ['feet'] };
    const STATE = new Set(('lift lifted lifting pull pulled pulling aside down up open opened removed removing off slip tug tugging peek peeking ' +
        'hold holding grab grabbing visible undone unzipped unzipping unbuttoned unbuttoning untied lowered raised partially torn ' +
        'ripped wet see-through adjusting taking strap straps slipping sliding falling wrapped rolled bunched riding').split(' '));
    const IGNORE = /^(holding|carrying|hanging|folded|folding|unworn|clothes|clothing)\b|\bon top$/;
    const PREP = /^(.*?)\s(?:in|into|under|inside|through|beneath|between|over|on|around|from)\s(.+)$/;
    const learned = new Map();
    let learnV = 0;
    // undefined: a word it doesn't know; null: known not to be worn.
    function lookup(words) {
        for (let n = Math.min(3, words.length); n >= 1; n--) {
            const ph = words.slice(-n).join(' ');
            if (WORD.has(ph)) return WORD.get(ph);
            if (learned.has(ph)) return learned.get(ph);
        }
        const last = words[words.length - 1] || '';
        if (last.length > 3 && last.endsWith('s') && WORD.has(last.slice(0, -1))) return WORD.get(last.slice(0, -1));
        return undefined;
    }
    function headOf(text) {
        const words = text.split(' ').filter(Boolean);
        let act = false;
        while (words.length > 1 && STATE.has(words[words.length - 1])) { words.pop(); act = true; }
        while (words.length > 1 && STATE.has(words[0])) { words.shift(); act = true; }
        const k = words.length ? lookup(words) : null;
        if (k) return { kind: k, act };
        // "dress slipping off shoulder": a garment followed by what is happening to it.
        for (let i = words.length - 2; i >= 0; i--) {
            if (!STATE.has(words[i + 1])) continue;
            const g = lookup(words.slice(0, i + 1));
            if (g) return { kind: g, act: true };
        }
        return null;
    }
    // A tag's garment: { kind, slots, act: add / act (on a worn one) / none ("no bra", topless) / only, gone }, or null.
    const wearCache = new Map();
    function parseWear(tag) {
        const key = learnV + ':' + tag;
        if (wearCache.has(key)) return wearCache.get(key);
        let t = tag.replace(/\boff[- ]shoulder/g, 'offshoulder'), r = null, m, h;
        if (NONE_TAG[t]) r = { kind: null, slots: NONE_TAG[t], act: 'none' };
        else if (IGNORE.test(t)) r = null;
        else if ((m = /^no (.+)$/.exec(t))) r = (h = headOf(m[1])) && { kind: h.kind, slots: SLOTS[h.kind], act: 'none' };
        else if ((m = /^(?:naked|nude) (.+)$/.exec(t))) { h = headOf(m[1]); r = { kind: h && h.kind, slots: h ? SLOTS[h.kind] : [], act: 'only' }; }
        else if ((m = /^(.+) only$/.exec(t))) r = (h = headOf(m[1])) && { kind: h.kind, slots: SLOTS[h.kind], act: 'only' };
        else {
            const gone = /(^|\s)(removed|off|discarded)(\s|$)/.test(t), pre = PREP.exec(t);
            h = pre ? headOf(pre[2]) || headOf(pre[1]) : headOf(t);
            r = h && { kind: h.kind, slots: SLOTS[h.kind], act: pre || gone || h.act ? 'act' : 'add', gone };
            if (r && r.act === 'add' && ACT_ONLY.has(r.kind)) r = null;
        }
        if (wearCache.size > 4000) wearCache.clear();
        wearCache.set(key, r);
        return r;
    }
    // Slots the tags fill: slot -> { kinds, empty } (empty: said to be bare, "no bra", nude).
    function wearOf(tags) {
        const occ = new Map(), at = sl => { if (!occ.has(sl)) occ.set(sl, { kinds: new Set(), empty: false }); return occ.get(sl); };
        tags.forEach(t => {
            const w = parseWear(t);
            if (!w) return;
            if (w.act === 'none' || w.gone) w.slots.forEach(sl => { at(sl).empty = true; });
            else {
                if (w.kind) w.slots.forEach(sl => at(sl).kinds.add(w.kind));
                if (w.act === 'only') BODY.forEach(sl => { if (!w.slots.includes(sl)) at(sl).empty = true; });
            }
        });
        return occ;
    }
    // The prompt's own clothing; per line when two or more lines have some (Forge Couple: a character a line).
    // Tags holding a wildcard or choice ("__colour__ shirt") are left out: what they give is picked, not worn yet.
    // <...> (LoRA) tags go first, as in ownTags().
    const typedOnly = t => String(t || '').replace(/<[^<>]*>/g, ',').replace(/[^,\n]*(?:__[^,\n]*?__|\{[^{}\n]*\})[^,\n]*/g, '');
    function wearOfText(text) {
        text = typedOnly(text);
        const all = wearOf(ownTags(text)), lines = text.split('\n').map(l => wearOf(ownTags(l)));
        return { all, lines: lines.filter(m => m.size).length >= 2 ? lines : null };
    }
    const fits = (k, x) => x.kinds.has(k) || (COMPAT[k] || []).some(c => x.kinds.has(c));
    function clash(w, occ) {
        const worn = sl => occ.get(sl) && occ.get(sl).kinds.size;
        if (w.act === 'none') return w.slots.some(worn);
        if (w.act === 'only') return BODY.some(sl => !w.slots.includes(sl) && worn(sl)) || w.slots.some(sl => occ.has(sl) && !fits(w.kind, occ.get(sl)));
        if (w.act === 'act') { const x = occ.get(w.slots[0]); return !!x && (!x.kinds.size ? !ACT_ONLY.has(w.kind) : !fits(w.kind, x)); }
        return w.slots.some(sl => occ.has(sl));
    }
    const clashTag = (tag, occ) => { const w = parseWear(tag); return !!w && clash(w, occ); };
    // An option's own tags as worn, once per way its {choices} can go (the nth option of each; wildcards left out).
    function wearSets(text) {
        const base = String(text).replace(/<[^<>]*>/g, ',').replace(/__(?:(?!__)[\s\S])*?__/g, ' ').replace(/\$\{[^}]*\}/g, ' ');
        const alts = b => b.replace(/^[^|]*\$\$/, '').split('|').map(a => a.replace(/^\s*[\d.]+\s*::|^\s*\?[^:]*::/, ''));
        const most = Math.min(6, Math.max(1, ...(base.match(/\{[^{}]*\}/g) || []).map(c => alts(c.slice(1, -1)).length)));
        return Array.from({ length: most }, (_, k) => {
            let t = base;
            for (let i = 0; i < 4 && /\{[^{}]*\}/.test(t); i++) t = t.replace(/\{([^{}]*)\}/g, (x, b) => { const a = alts(b); return a[Math.min(k, a.length - 1)]; });
            return t.split(/[,\n]/).map(plainTag).filter(Boolean).map(parseWear).filter(Boolean);
        });
    }
    // Clashes however its choices go.
    const setsClash = (sets, occ) => sets.every(ws => ws.some(w => clash(w, occ)));
    const clashText = (text, occ) => !!occ && occ.size > 0 && setsClash(wearSets(text), occ);
    function optClash(o, occ) {
        if (o.wv !== learnV) { o.wear = wearSets(o.text); o.wv = learnV; }
        return setsClash(o.wear, occ);
    }
    const WORN = Symbol('worn');
    const occNow = s => { const w = s.tags[WORN]; const m = w && (w.lines ? w.lines[s.line || 0] : w.all); return m && m.size ? m : null; };
    // Labels the library's conditions read, from what is worn.
    const LABEL = { pants: ['legs-covered'], leggings: ['legs-covered'], jumpsuit: ['legs-covered', 'one-piece'], onepiece: ['one-piece'],
        bikini: ['one-piece'], skirt: ['skirt'], dress: ['dress'], robe: ['dress'], top: ['top'], hoodie: ['top'], sportsbra: ['top', 'one-piece'] };
    const wearLabels = occ => { const out = new Set(); occ.forEach(x => x.kinds.forEach(k => (LABEL[k] || []).forEach(l => out.add(l)))); return out; };
    // Last words of the prompt's tags it doesn't know (for the scene model to say what they are).
    const STOP = new Set(('girl girls boy boys solo hair eyes eye smile quality masterpiece background breasts breast body skin face view shot focus ' +
        'lighting light pose viewer mouth lips teeth tongue ears ear tail wings horns blush expression art style detailed details detail score rating ' +
        'artist ass thighs legs arms hands hand fingers feet navel cleavage hips waist shoulders neck nose bangs ponytail twintails braid bun sidelocks ' +
        'ahoge eyelashes eyebrows pupils sky clouds day night room indoors outdoors scenery window wall floor bed water tree trees flowers flower grass ' +
        'city street absurdres highres illustration anime realistic photo photorealistic portrait cowboy standing sitting lying kneeling squatting ' +
        'walking running looking apron belt collar choker necklace earrings earring bracelet ribbon bow hairband headband hairclip hairpin headdress ' +
        'headpiece tiara crown mask veil jewelry jewellery piercing tattoo makeup lipstick nails sweat tears freckles muscular curvy petite tall ' +
        'short long open closed parted aesthetic best high low resolution newest masterpiece version source realism').split(' '));
    function unknownWear(text) {
        const out = new Set();
        ownTags(String(text || '')).forEach(t => {
            if (NONE_TAG[t] || IGNORE.test(t) || /[\d:]/.test(t)) return;
            const words = t.replace(/^(?:no|naked|nude) /, '').replace(/ only$/, '').split(' ').filter(Boolean);
            while (words.length > 1 && STATE.has(words[words.length - 1])) words.pop();
            const last = words[words.length - 1];
            if (!last || last.length < 3 || STOP.has(last) || /[^a-z-]/.test(last) || lookup(words) !== undefined) return;
            out.add(last);
        });
        return [...out].slice(0, 12);
    }
    // { word: kind or 'none' }: words taught (kept by wildcards.js / scene.js).
    function learnWear(map) {
        Object.entries(map || {}).forEach(([w, k]) => {
            w = plainTag(w);
            if (!w || WORD.has(w) || !(k === 'none' || SLOTS[k])) return;
            learned.delete(w);
            learned.set(w, k === 'none' ? null : k);
        });
        while (learned.size > 1000) learned.delete(learned.keys().next().value);
        learnV++;
    }
    const learnedWear = () => Object.fromEntries([...learned].map(([w, k]) => [w, k || 'none']));
    function resolve(text, lib, s, depth = 0, into = s.trace) {
        if (typeof text !== 'string') return text;
        if (text.indexOf('＿') >= 0) text = text.replace(/＿/g, '_');
        if (text.indexOf('*') >= 0 && text.indexOf('__') >= 0) text = globs(text, lib);
        if (text.indexOf('__') < 0 && text.indexOf('{') < 0) return text;
        if (depth === 0) { s.line = 0; textLabels(text, lib, s); }
        if (depth === 0 && !s.late) s.late = [];
        const parts = text.indexOf('{') >= 0 ? splitVariants(text) : [text];
        const open = t => (t.match(/__/g) || []).length % 2 === 1 && t.indexOf('\n', t.lastIndexOf('__')) < 0;
        let out = '';
        // A wildcard name still open (__${season} outfit__) waits for what is put in it: left to right.
        if (!parts.some(p => typeof p === 'string' && open(p))) out = ordered(parts, lib, s, depth, into).join('');
        else {
            let buf = '';
            for (const p of parts) {
                if (typeof p === 'string') buf += p;
                else {
                    const v = p.kind === 'var' ? variable(p, lib, s, depth, into) : variant(p, lib, s, depth, into);
                    if (open(buf)) { buf += v; continue; }
                    out += wildcards(buf, lib, s, depth, into) + v;
                    buf = '';
                    continue;
                }
                if (!open(buf)) { out += wildcards(buf, lib, s, depth, into); buf = ''; }
            }
            out += wildcards(buf, lib, s, depth, into);
        }
        if (depth === 0 && s.late) out = finishLate(out, lib, s, into);
        return depth === 0 ? unescape(out) : out;
    }
    // The "#! last" wildcards of a text, each after the others that give what it checks, put in their stand-ins (and in
    // the picks kept for the image's other texts).
    function finishLate(out, lib, s, into) {
        const late = s.late, done = new Map(), wait = late.map((x, i) => i);
        s.late = null;
        s.lateNow = true;
        late.forEach(x => { x.deps = depsOfCall(x.name, null, x.filter, lib, new Set()); });
        while (wait.length) {
            const gives = (i, j) => [...late[j].deps.reads].some(t => late[i].deps.makes.has(t));
            let k = wait.findIndex(j => !wait.some(i => i !== j && gives(i, j)));
            if (k < 0) k = 0;
            const i = wait.splice(k, 1)[0], x = late[i];
            s.line = x.line;
            s.solo = x.solo;
            done.set(i, pick(x.whole, x.name, lib, s, x.depth, into, x.filter));
        }
        s.lateNow = false;
        const put = t => (typeof t === 'string' && t.indexOf('\u0001') >= 0 ? t.replace(/\u0001(\d+)\u0001/g, (m, i) => (done.has(+i) ? done.get(+i) : '')) : t);
        s.memo.forEach((v, k) => { if (typeof v === 'string' && v.indexOf('\u0001') >= 0) s.memo.set(k, put(v)); });
        return put(out);
    }

    // ---- the order of picking ----
    // A text's items (wildcards, choices, ${…}) picked: ones bringing rules, then others checking nothing, left to right;
    // then ones with ?conditions:: (or "requires"), each after what gives what it checks (two that need each other: the
    // one giving more first). Output keeps the written order.
    // A wildcard that is a tag of its own (", __expression__," or "(__expression__:1.2)"), not part of one ("__color__ shirt");
    // next to a choice ({red|blue} __clothing__) it is part of one. No repeats in an image is for tags of their own.
    function soloCall(p, at, len, prev, next) {
        const a = Math.max(p.lastIndexOf(',', at - 1), p.lastIndexOf('\n', at - 1)) + 1;
        const cut = p.slice(at + len).search(/[,\n]/), b = cut < 0 ? p.length : at + len + cut;
        if ((a === 0 && prev) || (b === p.length && next)) return false;
        const t = p.slice(a, at) + '\u0002' + p.slice(at + len, b);
        return /^\s*[(\[]*\s*\u0002\s*(?::\s*-?[\d.]+)?\s*[)\]]*\s*$/.test(t);
    }
    function ordered(parts, lib, s, depth, into) {
        const items = [];
        parts.forEach((p, pi) => {
            if (typeof p !== 'string') { items.push({ part: p }); return; }
            let last = 0;
            p.replace(CALL, (whole, name, args, filter, at) => {
                if (at > last) items.push({ lit: p.slice(last, at) });
                items.push({ call: { whole, name, args, filter, solo: soloCall(p, at, whole.length, pi > 0, pi < parts.length - 1) } });
                last = at + whole.length;
                return whole;
            });
            if (last < p.length) items.push({ lit: p.slice(last) });
        });
        const out = items.map(it => ('lit' in it ? it.lit : null));
        // The prompt line each item is on (what is worn can be per line).
        if (depth === 0) { let ln = 0; items.forEach(it => { it.line = ln; ln += (('lit' in it ? it.lit : it.part ? it.part.body || '' : '').match(/\n/g) || []).length; }); }
        const run = i => {
            const it = items[i];
            if (depth === 0) s.line = it.line;
            if (it.call) { const c = it.call; s.solo = c.solo; out[i] = c.args ? withParams(c.args, lib, s, depth, into, () => pick(c.whole, c.name, lib, s, depth, into, c.filter)) : pick(c.whole, c.name, lib, s, depth, into, c.filter); }
            else out[i] = it.part.kind === 'var' ? variable(it.part, lib, s, depth, into) : variant(it.part, lib, s, depth, into);
        };
        // "a requires b" (the text's rules and the image's): what gives a waits for what gives b.
        items.forEach(it => { if (!('lit' in it)) it.deps = depsOfItem(it, lib); });
        const req = new Set(s.rules.filter(r => r.type === 'requires'));
        items.forEach(it => it.deps && it.deps.requires.forEach(r => req.add(r)));
        const later = [], free = [];
        items.forEach((it, i) => {
            if (!it.deps) return;
            if (req.size) {
                const reads = new Set(it.deps.reads);
                req.forEach(r => { if (r.a.some(t => it.deps.makes.has(t))) r.b.forEach(t => reads.add(t)); });
                it.deps = { ...it.deps, reads };
            }
            if (it.deps.reads.size) later.push(i); else if (it.deps.rules) run(i); else free.push(i);
        });
        free.forEach(run);
        while (later.length) {
            const gives = (i, j) => [...items[j].deps.reads].some(t => items[i].deps.makes.has(t));
            let k = later.findIndex(j => !later.some(i => i !== j && gives(i, j)));
            // Each needs another: the one giving the others most of what they check, the leftmost of equals.
            if (k < 0) {
                const gift = i => later.reduce((t, j) => t + (j === i ? 0 : [...items[j].deps.reads].filter(x => items[i].deps.makes.has(x)).length), 0);
                k = later.reduce((best, i, at) => (gift(i) > gift(later[best]) ? at : best), 0);
            }
            run(later.splice(k, 1)[0]);
        }
        return out;
    }
    // What a wildcard's picks (any depth) can check (reads: labels, var:names), give (makes), the "requires" rules they
    // bring and whether any rules come (rules); kept per library.
    const deps0 = () => ({ reads: new Set(), makes: new Set(), requires: new Set(), rules: false });
    const NO_DEPS = deps0();
    let loops = 0;
    function exprNames(src, into) {
        const walk = a => {
            if (!a) return;
            if (a.op === 'tag') into.add(a.tag);
            else if (a.op === '=' || a.op === '!=') into.add('var:' + a.name);
            else { walk(a.a); walk(a.b); }
        };
        walk(parseExpr(src));
    }
    function merge(d, x) { x.reads.forEach(t => d.reads.add(t)); x.makes.forEach(t => d.makes.add(t)); x.requires.forEach(r => d.requires.add(r)); if (x.rules) d.rules = true; }
    function depsOf(e, lib, stack = new Set()) {
        if (e.deps) return e.deps;
        const key = nameKey(e.w.name);
        if (stack.has(key)) { loops++; return NO_DEPS; }
        stack.add(key);
        const seen = loops;
        const d = deps0();
        optsOf(e).forEach(o => {
            if (o.cond) exprNames(o.cond, d.reads);
            o.tags.forEach(t => d.makes.add(t));
            merge(d, depsOfText(o.text, lib, stack));
        });
        rulesOf(e).forEach(r => { if (r.type === 'last') return; d.rules = true; if (r.type === 'requires') d.requires.add(r); });
        stack.delete(key);
        // Kept unless a loop cut it short (then worked out again from the top).
        if (loops === seen || !stack.size) e.deps = d;
        return d;
    }
    function depsOfText(text, lib, stack) {
        const d = deps0();
        if (typeof text !== 'string' || (text.indexOf('__') < 0 && text.indexOf('{') < 0)) return d;
        const parts = text.indexOf('{') >= 0 ? splitVariants(text) : [text];
        parts.forEach(p => {
            if (typeof p === 'string') { p.replace(CALL, (whole, name, args, filter) => { merge(d, depsOfCall(name, args, filter, lib, stack)); return whole; }); return; }
            merge(d, depsOfPart(p, lib, stack));
        });
        return d;
    }
    function depsOfCall(name, args, filter, lib, stack) {
        const d = deps0();
        const e = entry(lib, name);
        if (e && stack.size && rulesOf(e).some(r => r.type === 'last')) depsOf(e, lib, stack).makes.forEach(t => d.makes.add(t));
        else if (e) merge(d, depsOf(e, lib, stack));
        (String(filter || '').match(/\$\{([A-Za-z0-9_.-]+)/g) || []).forEach(v => d.reads.add('var:' + v.slice(2).toLowerCase()));
        if (args) merge(d, depsOfText(args, lib, stack));
        return d;
    }
    function depsOfPart(p, lib, stack) {
        const d = deps0();
        if (p.kind === 'var') {
            // Setting gives the variable; using it waits for what sets it.
            if (p.set) { d.makes.add('var:' + p.name); merge(d, depsOfText(p.value, lib, stack)); }
            else { d.reads.add('var:' + p.name); if (p.fallback) merge(d, depsOfText(p.fallback, lib, stack)); }
            return d;
        }
        p.opts.forEach(o => {
            if (o.cond) exprNames(o.cond, d.reads);
            o.tags.forEach(t => d.makes.add(t));
            merge(d, depsOfText(o.text, lib, stack));
        });
        return d;
    }
    function depsOfItem(it, lib) {
        if (it.call) return depsOfCall(it.call.name, it.call.args, it.call.filter, lib, new Set());
        return depsOfPart(it.part, lib, new Set());
    }

    // ---- ${variables} (Dynamic Prompts syntax) ----
    // ${season=!{a|b}} picks now and keeps it, ${season=…} again at each use; ${season} puts it in, ${season:spring} with a
    // default. Shared by an image's texts; a ?season=winter:: waits for it.
    const VAR = /^([A-Za-z0-9_.-]+)\s*(?:(=)\s*(!)?([\s\S]*)|:([\s\S]*))?$/;
    function parseVar(body) {
        const m = VAR.exec(body.trim());
        if (!m) return null;
        return { kind: 'var', name: m[1].toLowerCase(), set: !!m[2], now: !!m[3], value: m[2] ? m[4].trim() : null, fallback: m[5] !== undefined ? m[5].trim() : null };
    }
    function variable(v, lib, s, depth, into) {
        if (v.set) {
            if (!v.now) { s.vars.set(v.name, { lazy: v.value }); return ''; }
            const n = (s.count.get('$' + v.name) || 0) + 1;
            s.count.set('$' + v.name, n);
            const slot = `$${v.name}#${n}`;
            const node = into ? { variable: v.name, children: [] } : null;
            if (node) into.push(node);
            const value = s.memo.has(slot) ? s.memo.get(slot) : resolve(v.value, lib, s, depth, node ? node.children : null);
            s.memo.set(slot, value);
            if (node) node.pick = value;
            s.vars.set(v.name, { value });
            return '';
        }
        const got = s.vars.get(v.name);
        if (!got) {
            if (v.fallback === null) problem(s, 'unset', v.name);
            return v.fallback === null ? '' : resolve(v.fallback, lib, s, depth, into);
        }
        return 'value' in got ? got.value : resolve(got.lazy, lib, s, depth, into);
    }
    // __name(a=x, b=y)__: a and b set (values picked first) while it is picked, then put back as they were.
    function withParams(args, lib, s, depth, into, fn) {
        const saved = new Map();
        topSplit(args, ',').forEach(a => {
            const i = a.indexOf('=');
            const k = i < 0 ? '' : a.slice(0, i).trim().toLowerCase();
            if (!k) return;
            if (!saved.has(k)) saved.set(k, s.vars.get(k));
            s.vars.set(k, { value: resolve(a.slice(i + 1).trim(), lib, s, depth, into) });
        });
        const out = fn();
        saved.forEach((v, k) => (v === undefined ? s.vars.delete(k) : s.vars.set(k, v)));
        return out;
    }

    // ---- {a|b} choices (Dynamic Prompts syntax) ----
    // {a|b} one of, {2::a|b} weighted, {2$$a|b|c} two, {1-3$$…} one to three (-3, 2- open), {2$$ and $$…} joined by " and ",
    // {|a} may be nothing, {2$$__w__} a wildcard's options. {prompt} (no | or $$) stays as typed; \{ \} \| are literal.
    const COUNT = /^\s*(\d*)\s*(?:(-)\s*(\d*))?\s*\$\$/;
    const unescape = t => t.replace(/\\([{}|])/g, '$1');
    // The top-level parts of a text: strings, and { body, opts, min, max, sep } for each choice.
    function splitVariants(text) {
        const parts = [];
        let lit = '', i = 0;
        while (i < text.length) {
            const c = text[i];
            if (c === '\\' && i + 1 < text.length) { lit += c + text[i + 1]; i += 2; continue; }
            if (c === '$' && text[i + 1] === '{') {
                const end = closing(text, i + 1);
                const v = end < 0 ? null : parseVar(text.slice(i + 2, end));
                if (v) {
                    if (lit) parts.push(lit);
                    lit = '';
                    parts.push(v);
                    i = end + 1;
                    continue;
                }
            }
            if (c !== '{') { lit += c; i++; continue; }
            const end = closing(text, i);
            const v = end < 0 ? null : parseVariant(text.slice(i + 1, end));
            if (!v) { lit += c; i++; continue; }
            if (lit) parts.push(lit);
            lit = '';
            parts.push(v);
            i = end + 1;
        }
        if (lit) parts.push(lit);
        return parts;
    }
    function closing(text, i) {
        for (let d = 0, j = i; j < text.length; j++) {
            if (text[j] === '\\') { j++; continue; }
            if (text[j] === '{') d++;
            else if (text[j] === '}' && --d === 0) return j;
        }
        return -1;
    }
    // Splits at top-level occurrences of sep (outside nested braces, not escaped).
    function topSplit(body, sep) {
        const out = [];
        let d = 0, start = 0;
        for (let j = 0; j < body.length; j++) {
            const c = body[j];
            if (c === '\\') { j++; continue; }
            if (c === '{') d++;
            else if (c === '}') d--;
            else if (d === 0 && body.startsWith(sep, j)) { out.push(body.slice(start, j)); start = j + sep.length; j += sep.length - 1; }
        }
        out.push(body.slice(start));
        return out;
    }
    function parseVariant(body) {
        let min = 1, max = 1, sep = ', ', counted = false;
        const m = COUNT.exec(body);
        if (m && (m[1] || m[2])) {
            counted = true;
            min = m[1] === '' ? 1 : Number(m[1]);
            max = !m[2] ? min : m[3] === '' ? Infinity : Number(m[3]);
            body = body.slice(m[0].length);
            const rest = topSplit(body, '$$');
            if (rest.length > 1) { sep = rest[0]; body = rest.slice(1).join('$$'); }
        }
        const opts = topSplit(body, '|');
        if (!counted && opts.length < 2) return null;
        return { body, min, max: Math.max(min, max), sep, opts: opts.map(parseOption) };
    }
    function variant(v, lib, s, depth, into) {
        // The nth use of the same choice is the same across an image's texts (prompt and Hi-Res prompt).
        const n0 = (s.count.get('{' + v.body) || 0) + 1;
        s.count.set('{' + v.body, n0);
        const slot = `{${v.body}#${n0}`;
        const rec = s.record && !s.record.has(slot) ? { k: slot, variant: true, parent: s.recIn, line: s.line || 0 } : null;
        if (rec) s.record.set(slot, rec);
        if (s.memo.has(slot) && s.memo.get('#raw:' + slot)) {
            s.memo.delete('#raw:' + slot);
            (s.memo.get('#tags:' + slot) || []).forEach(t => s.tags.add(t));
            const given = s.memo.get(slot);
            s.memo.set(slot, typeof given === 'string' ? resolve(given, lib, s, depth + 1, into) : given);
        }
        // Left out (Reroll): nothing, and the commas around it tidied.
        if (s.memo.get(slot) === '') s.blank = true;
        if (s.memo.has(slot)) { if (rec) rec.pick = s.memo.get(slot); return s.memo.get(slot); }
        const was = s.recIn;
        if (rec) s.recIn = slot;
        const out = pickVariant(v, lib, s, depth, into);
        s.recIn = was;
        if (rec) rec.pick = out;
        s.memo.set(slot, out);
        return out;
    }
    function pickVariant(v, lib, s, depth, into) {
        let opts = v.opts, d = depth;
        // {2$$__w__}: the wildcard's own options.
        if (opts.length === 1 && (v.min !== 1 || v.max !== 1)) {
            const m = /^__([A-Za-z0-9(-](?:(?!__)[A-Za-z0-9_ ()-])*?)__$/.exec(opts[0].text);
            const e = m && entry(lib, m[1]);
            if (e) { opts = optsOf(e); d = depth + 1; }
        }
        if (opts.some(o => o.cond) || s.rules.length) opts = eligible(opts, s, null, `{${v.body}}`);
        const occ = occNow(s);
        if (occ && opts.length) {
            const fit = opts.filter(o => !optClash(o, occ));
            if (fit.length) opts = fit;
        }
        const n = Math.min(opts.length, v.min + (v.max > v.min ? Math.floor(rnd() * (Math.min(v.max, opts.length) - v.min + 1)) : 0));
        const pool = opts.slice(), picks = [];
        for (let k = 0; k < n && pool.length; k++) {
            const t = weightedPick(pool), i = pool.findIndex(o => o.text === t);
            pool[i].tags.forEach(x => s.tags.add(x));
            pool.splice(i, 1);
            picks.push(t);
        }
        const node = into ? { variant: v.body, options: opts.length, choice: picks.join(' | '), children: [] } : null;
        if (node) into.push(node);
        const out = picks.map(t => resolve(t, lib, s, d, node ? node.children : null)).filter(t => t !== '').join(v.sep);
        if (out === '' && picks.some(t => !t.trim())) s.blank = true;
        if (node) node.pick = out;
        return out;
    }

    function wildcards(text, lib, s, depth, into) {
        if (text.indexOf('__') < 0) return text;
        return text.replace(CALL, (whole, name, args, filter) => (args ? withParams(args, lib, s, depth, into, () => pick(whole, name, lib, s, depth, into, filter)) : pick(whole, name, lib, s, depth, into, filter)));
    }
    function pick(whole, name, lib, s, depth, into, filter) {
        // A tag of its own (ordered(); other ways in: part of one), read before anything inside it is picked.
        const solo = s.solo === true;
        s.solo = undefined;
        const e = entry(lib, name);
        if (!e) { problem(s, 'missing', name); return whole; }
        const key = nameKey(e.w.name);
        // In the negative prompt: never picked here (wildcards.js).
        if (s.ban && s.ban.has(key)) { s.blank = true; return ''; }
        if (s.active.has(key)) { problem(s, 'loop', e.w.name); return ''; }
        if (depth >= MAX_DEPTH) { problem(s, 'depth', e.w.name); return ''; }
        // "#! last": a stand-in now, picked when the rest of the text is (finishLate()).
        if (s.late && !s.lateNow && rulesOf(e).some(r => r.type === 'last')) {
            s.late.push({ whole, name, filter, depth, line: s.line || 0, solo });
            return `\u0001${s.late.length - 1}\u0001`;
        }
        const n = (s.count.get(key) || 0) + 1;
        s.count.set(key, n);
        const slot = `${key}#${n}`;
        const rules = rulesOf(e);
        if (rules.length && !s.ruled.has(key)) {
            s.ruled.add(key);
            rules.forEach(r => (r.type === 'bad' ? problem(s, 'rule', r.src) : r.type !== 'last' && s.rules.push(r)));
        }
        // Given as itself (Scene optimization left it to the engine): picked here as usual.
        const self = s.memo.get(slot);
        if (typeof self === 'string' && /^__[^_].*__$/.test(self.trim()) && nameKey(self.trim().slice(2, -2)) === key) s.memo.delete(slot);
        if (s.memo.has(slot)) {
            // Given (Scene optimization, Reroll): its tags count for the image's rules, and wildcards left in it are picked here.
            const gtags = s.memo.get('#tags:' + slot) || [];
            // The rules its picks brought (Scene optimization): they hold for the rest of the image.
            (s.memo.get('#rules:' + slot) || []).forEach(src => {
                if (s.rules.some(r => r.src === src)) return;
                const r = parseRule(String(src));
                if (r.type !== 'bad' && r.type !== 'last') s.rules.push(r);
            });
            gtags.forEach(t => s.tags.add(t));
            let given = s.memo.get(slot);
            const node = into ? { name: e.w.name, slot, given: true, children: [] } : null;
            if (node) into.push(node);
            const rec = s.record && !s.record.has(slot) ? { k: slot, name: e.w.name, choice: given, tags: gtags, multi: optsOf(e).length > 1, parent: s.recIn, line: s.line || 0 } : null;
            if (given === '') s.blank = true;
            if (solo && typeof given === 'string' && given) s.memo.set('#used:' + key, (s.memo.get('#used:' + key) || []).concat(given));
            if (rec) s.record.set(slot, rec);
            if (typeof given === 'string' && (given.indexOf('__') >= 0 || given.indexOf('{') >= 0)) {
                s.active.add(key);
                const was = s.recIn;
                if (rec) s.recIn = slot;
                given = resolve(given, lib, s, depth + 1, node ? node.children : null);
                s.recIn = was;
                s.active.delete(key);
                s.memo.set(slot, given);
            }
            if (rec) rec.pick = given;
            if (node) node.pick = given;
            return given;
        }
        const all = optsOf(e);
        if (!all.length) {
            if (!rules.length) { problem(s, 'empty', e.w.name); return ''; }
            if (into) into.push({ name: e.w.name, slot, rulesOn: rules.filter(r => r.type !== 'bad').length, pick: '', children: [] });
            s.blank = true;
            return '';
        }
        const why = {};
        let opts = filter || s.rules.length || all.some(o => o.cond) ? eligible(all, s, filter && filter.trim(), e.w.name, why) : all;
        if (!opts.length) { problem(s, 'none', filter ? `${e.w.name}[${filter}]` : e.w.name); return ''; }
        if (s.avoid && (s.avoid.size || s.avoid.ends && s.avoid.ends.length) && !e.w.inOrder) { const keep = opts.filter(o => !avoids(o, s)); if (keep.length && keep.length < opts.length) opts = keep; }
        // Options calling a wildcard that's in the negative prompt: passed over while others remain.
        if (s.ban && s.ban.size) { const keep = opts.filter(o => !callsBanned(o.text, s.ban)); if (keep.length && keep.length < opts.length) opts = keep; }
        // What the character wears: options adding to a filled slot or acting on a garment not worn are passed over;
        // if all do, one is still picked and only its clashing tags are left out (resolvePayload(), wildcards.js).
        const occ = !e.w.inOrder && occNow(s);
        if (occ) {
            const fit = opts.filter(o => !optClash(o, occ));
            if (fit.length && fit.length < opts.length) {
                why.left = (why.left || []).concat(opts.filter(o => !fit.includes(o)).map(o => ({ text: o.text, why: 'outfit' })));
                opts = fit;
            }
        }
        // No repeats in an image (Config): options this wildcard gave already are passed over while others are left.
        let used = s.noRepeat && solo && !e.w.inOrder ? (s.memo.get('#used:' + key) || []).slice() : null;
        // Later uses given already (Reroll, Scene optimization): earlier ones are in #used when they were tags of their own.
        if (used) s.memo.forEach((v, k) => { const j = k.startsWith(key + '#') ? Number(k.slice(key.length + 1)) : 0; if (j > n && typeof v === 'string' && v) used.push(v); });
        const many = opts.length > 1;
        if (used && used.length) { const fresh = opts.filter(o => !used.includes(o.text)); if (fresh.length) opts = fresh; }
        s.active.add(key);
        const chosen = e.w.inOrder ? opts[s.index % opts.length] : null;
        // steer (Scene optimization's options): which of these to take, or null for a weighted pick.
        const steered = !chosen && s.steer ? s.steer(key, opts) : null;
        const choice = chosen ? chosen.text : steered && opts.some(o => o.text === steered) ? steered : weightedPick(opts);
        const opt = chosen || opts.find(o => o.text === choice);
        if (s.onPick) s.onPick(e.w.name, opt);
        opt.tags.forEach(x => s.tags.add(x));
        // Reroll's record: the option chosen (its wildcards are picks of their own).
        if (solo) s.memo.set('#used:' + key, (s.memo.get('#used:' + key) || []).concat(choice));
        const rec = s.record && !s.record.has(slot) ? { k: slot, name: e.w.name, choice, tags: opt.tags, multi: many, parent: s.recIn, line: s.line || 0 } : null;
        if (rec) s.record.set(slot, rec);
        const node = into ? { name: filter ? `${e.w.name}[${filter.trim()}]` : e.w.name, slot, options: all.length, eligible: opts.length, left: (why.left || []).concat((why.ruledOut || []).map(r => ({ text: r.text, why: r.rule }))), choice, children: [] } : null;
        if (node) into.push(node);
        const was = s.recIn;
        if (rec) s.recIn = slot;
        const out = resolve(choice, lib, s, depth + 1, node ? node.children : null);
        s.recIn = was;
        if (rec) rec.pick = out;
        if (node) node.pick = out;
        s.active.delete(key);
        s.memo.set(slot, out);
        // Nothing to show on purpose (only ${…} set): the commas around it are tidied (tidyBlank()).
        if (out === '' && /\$\{[^}]*=/.test(choice)) s.blank = true;
        return out;
    }

    // A text after a wildcard gave nothing on purpose (rules, a context): no doubled or leading commas left.
    const tidyBlank = t => (typeof t !== 'string' ? t : t.split('\n').map(l => l.replace(/,(\s*,)+/g, ',').replace(/^[\s,]+/, '')).join('\n'));

    // Every combination of a text's top-level choices and wildcards (combinatorial mode, wildcards.js): { total, list }
    // with list[i] the memo giving image i its options (at most cap).
    // extra: more choices ([[memo key, value], ...] per option; random::group::); start: the first combination made.
    function combos(text, lib, cap = 100, extra = [], start = 0) {
        if (typeof text !== 'string') return { total: 0, list: [] };
        if (text.indexOf('＿') >= 0) text = text.replace(/＿/g, '_');
        if (text.indexOf('*') >= 0 && text.indexOf('__') >= 0) text = globs(text, lib);
        const axes = [], count = new Map();
        const parts = text.indexOf('{') >= 0 ? splitVariants(text) : [text];
        parts.forEach(p => {
            if (typeof p === 'string') {
                p.replace(CALL, (whole, name, args, filter) => {
                    const e = entry(lib, name);
                    if (!e) return whole;
                    const key = nameKey(e.w.name), n = (count.get(key) || 0) + 1, slot = `${key}#${n}`;
                    count.set(key, n);
                    const opts = args || filter ? [] : optsOf(e).filter(o => !o.cond);
                    if (opts.length > 1) axes.push(opts.map(o => [[slot, o.text], ['#tags:' + slot, o.tags]]));
                    return whole;
                });
                return;
            }
            if (p.kind === 'var') return;
            const n = (count.get('{' + p.body) || 0) + 1, slot = `{${p.body}#${n}`;
            count.set('{' + p.body, n);
            const opts = p.min === 1 && p.max === 1 ? p.opts.filter(o => !o.cond) : [];
            if (opts.length > 1) axes.push(opts.map(o => [[slot, o.text], ['#raw:' + slot, true], ['#tags:' + slot, o.tags]]));
        });
        extra.forEach(a => { if (a.length > 1) axes.push(a); });
        const total = axes.length ? axes.reduce((t, a) => t * a.length, 1) : 0, list = [];
        for (let i = 0; i < Math.min(total, cap); i++) {
            const m = new Map();
            for (let j = axes.length - 1, k = (start + i) % total; j >= 0; j--) { axes[j][k % axes[j].length].forEach(([a, b]) => m.set(a, b)); k = Math.floor(k / axes[j].length); }
            list.push(m);
        }
        return { total, list };
    }
    // Whether a text holds a {a|b} choice or ${variable} (so a job is split per image even without wildcards).
    const hasVariant = t => typeof t === 'string' && t.indexOf('{') >= 0 && splitVariants(t).some(p => typeof p !== 'string');

    // What a wildcard's picks (any depth) check and give, and whether rules come with it (scene.js orders its slots by these).
    const depsFor = (lib, name) => { const e = entry(lib, name), d = e ? depsOf(e, lib) : NO_DEPS; return { reads: [...d.reads], makes: [...d.makes], rules: d.rules }; };
    // A ?condition:: on a set of tags; the labels a prompt's own words give (as resolving it would), put in s first.
    const condHolds = (src, tags) => { const ast = parseExpr(String(src)); return ast.op !== 'bad' && holds(ast, tags, { vars: new Map() }); };
    const seedLabels = (s, text, lib) => textLabels(String(text || ''), lib, s);

    window.WcEngine = {
        combos, plainTag, ownTags, callsIn, avoided, hasGlob, globNames, GLOB, outfitLabels, wearOfText, clashTag, clashText, unknownWear, learnWear, learnedWear, WEAR_KINDS: Object.keys(WEAR), depsFor, condHolds, seedLabels, TOKEN, CALL, MAX_DEPTH, WEIGHT, nameKey, tagList, parseOption, weighted, weightedPick, withRandom, seeded, rnd: () => rnd(), compile, entry, image, state, resolve, tidyBlank, hasVariant, parseExpr, parseRule, ruleBreak };
})();
