// Tag autocomplete from the server's TagComplete Neo extension: its tag file (downloaded once, kept until it changes)
// as a row of suggestions above the keyboard while a prompt box is typed in; LoRAs after (<)lora: and embeddings after (<)e:.
(function() {
    const MAX = 20;
    const COLOURS = { '-1': 'red', 0: 'lightblue', 1: 'indianred', 3: 'violet', 4: 'lightgreen', 5: 'orange' };
    const BOXES = 'textarea[id$="_prompt"]:not([id^="comfy"]), textarea[id$="_neg"]:not([id^="comfy"]), textarea[id$="_hr_negative"], textarea.fc-text, #wcEditorText, #wcTryText, #styleEditPrompt, #styleEditNeg, #img2imgPresetEdPrompt, #img2imgPresetEdNeg, #cfgTrigger, #cfgLoraAdditionalNegative, #lvTrigger, #lvNegative, #wxText, .wx-in';
    const STYLE_BOXES = ['styleEditPrompt', 'styleEditNeg'], LORA_BOXES = ['cfgTrigger', 'cfgLoraAdditionalNegative', 'lvTrigger', 'lvNegative'];
    // The tab a box writes for (the editors: the tab their window was opened from); null for the wildcard editor.
    function tabOf(el) {
        if (STYLE_BOXES.includes(el.id)) return window.StyleManager ? StyleManager.activeMode() : null;
        // The img2img preset editor writes for Inpaint / img2img.
        if (/^img2imgPresetEd/.test(el.id)) return 'inp';
        if (LORA_BOXES.includes(el.id)) return (window.LoraManager && LoraManager.targetMode) || (typeof currentMode !== 'undefined' ? currentMode : 'xl');
        const m = /^([a-z0-9]+)_/.exec(el.id);
        return m ? m[1] : null;
    }
    // 'xl' or 'anima' for a tab whose prompts take tags (Inpaint/img2img: by its checkpoint), else another type.
    function archOf(el) {
        const m = tabOf(el);
        if (m === null) return 'xl';
        if (m !== 'inp' && m !== 'img2img') return m;
        const title = typeof currentModelTitleFor === 'function' ? currentModelTitleFor(m) : '';
        return window.LoraManager && LoraManager.detectCheckpointArchitecture ? LoraManager.detectCheckpointArchitecture(title) : 'xl';
    }
    const takesTags = el => ['xl', 'anima'].includes(archOf(el));
    let opts = null;
    let tags = null, loading = null, loras = null, embeddings = null;
    let bar = null, box = null, term = null, timer = 0;

    const installed = () => localStorage.getItem('bojroTacInstalled') === 'true';
    const enabled = () => installed() && localStorage.getItem('bojroTagComplete') === 'true';
    const EXT_URL = 'https://github.com/eduardoabreu81/sd-webui-tagcomplete-neo';
    // Off by default; users the extension was already found for (when it was on by default) keep it on.
    if (localStorage.getItem('bojroTagComplete') === null) localStorage.setItem('bojroTagComplete', installed() ? 'true' : 'false');

    // ---- the tag file, cached in IndexedDB ----
    function idb(mode, fn) {
        return new Promise(resolve => {
            try {
                const req = indexedDB.open('bojroTagComplete', 1);
                req.onupgradeneeded = () => req.result.createObjectStore('files');
                req.onsuccess = () => {
                    try {
                        const tx = req.result.transaction('files', mode);
                        const r = fn(tx.objectStore('files'));
                        tx.oncomplete = () => resolve(r && 'result' in r ? r.result : true);
                        tx.onerror = tx.onabort = () => resolve(null);
                    } catch (e) { resolve(null); }
                };
                req.onerror = () => resolve(null);
            } catch (e) { resolve(null); }
        });
    }
    // 'tags': the tag file; 'extra': the extra file.
    const cached = (k = 'tags') => idb('readonly', s => s.get(k));
    const store = (v, k = 'tags') => idb('readwrite', s => s.put(v, k));
    // The files TagComplete Neo comes with (it has no way to list its folder), checked for on the server.
    const KNOWN = ['danbooru.csv', 'danbooru_2025.csv', 'e621.csv', 'e621_sfw.csv', 'danbooru_e621_merged.csv', 'derpibooru.csv', 'EnglishDictionary.csv', 'extra-quality-tags.csv'];
    const FILE_KEYS = { tag: 'bojroTacTagFile', extra: 'bojroTacExtraFile' };
    const picked = k => localStorage.getItem(FILE_KEYS[k]) || '';
    // The file in use: the one picked here, else the server's.
    const fileFor = (k, o = settings()) => picked(k) || (k === 'tag' ? o.tagFile : o.extraFile) || 'None';

    const fileUrl = path => `${HOST}/file=${path}`;

    async function fetchText(url, method = 'GET') {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), method === 'HEAD' ? 8000 : 120000);
        try {
            const r = await fetch(url, { method, headers: getHeaders(), signal: ctl.signal });
            if (!r.ok) return null;
            return method === 'HEAD' ? r : await r.text();
        } catch (e) { return null; } finally { clearTimeout(t); }
    }

    // After connecting: is the extension there, and is the cached tag file still current?
    async function connected() {
        loras = embeddings = null;
        try {
            const r = await fetch(`${HOST}/sdapi/v1/options`, { headers: getHeaders() });
            opts = r.ok ? await r.json() : null;
        } catch (e) { opts = null; }
        if (!opts) return;
        let base = (await fetchText(`${fileUrl('tmp/tagAutocompletePath.txt')}?${Date.now()}`) || '').trim();
        if (/[<>\n]/.test(base)) base = '';
        const on = (!!base || 'tac_tagFile' in opts) && opts.tac_active !== false;
        localStorage.setItem('bojroTacInstalled', on ? 'true' : 'false');
        localStorage.setItem('bojroTacOpts', JSON.stringify({
            base, tagFile: opts.tac_tagFile || 'danbooru.csv', extraFile: opts['tac_extra.extraFile'] || 'extra-quality-tags.csv',
            extraAfter: opts['tac_extra.addMode'] === 'Insert after', underscores: opts.tac_replaceUnderscores !== false, keep: opts.tac_undersocreReplacementExclusionList || '',
            escape: opts.tac_escapeParentheses !== false, comma: opts.tac_appendComma !== false, space: opts.tac_appendSpace !== false,
            neg: opts['tac_activeIn.negativePrompts'] !== false, anima: opts.tac_animaArtistPrefix === 'Auto'
        }));
        paintConfig();
        if (on && enabled()) refresh().then(listFiles);
    }

    // Which files the server has, for the Config lists.
    async function listFiles() {
        const o = settings(), base = o.base;
        if (!base) return;
        const names = [...new Set([...KNOWN, o.tagFile, o.extraFile, picked('tag'), picked('extra')])].filter(n => n && n !== 'None');
        const found = [];
        for (const n of names) if (await fetchText(fileUrl(`${base}/${n}`), 'HEAD')) found.push(n);
        localStorage.setItem('bojroTacFiles', JSON.stringify(found));
        paintConfig();
    }
    function setFile(k, v) {
        if (v) localStorage.setItem(FILE_KEYS[k], v); else localStorage.removeItem(FILE_KEYS[k]);
        tags = null;
        loading = null;
        if (enabled()) refresh();
    }

    async function refresh() {
        const o = settings();
        const base = o.base || (await fetchText(`${fileUrl('tmp/tagAutocompletePath.txt')}?${Date.now()}`) || '').trim();
        if (!base) return;
        for (const [k, key] of [['tag', 'tags'], ['extra', 'extra']]) {
            const name = fileFor(k, o);
            if (name === 'None') {
                if (await cached(key)) { await store(null, key); tags = null; loading = null; }
                continue;
            }
            const url = fileUrl(`${base}/${name}`);
            const head = await fetchText(url, 'HEAD');
            const stamp = head ? [head.headers.get('etag'), head.headers.get('last-modified'), head.headers.get('content-length')].join('|') : '';
            const old = await cached(key);
            if (old && old.url === url && (!head || !stamp.replace(/\|/g, '') || old.stamp === stamp)) continue;
            const text = await fetchText(url);
            if (!text) continue;
            await store({ url, stamp, text }, key);
            tags = null;
            loading = null;
            if (typeof dlog === 'function') dlog(`TagComplete: ${name} downloaded (${Math.round(text.length / 1024)} KB)`);
        }
    }

    function settings() {
        try { return JSON.parse(localStorage.getItem('bojroTacOpts')) || {}; } catch (e) { return {}; }
    }

    // name,category,count,"alias,alias"
    function parse(text) {
        const names = [], cats = [], counts = [], aliases = [];
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
            if (!line) continue;
            let parts;
            if (line.indexOf('"') < 0) parts = line.split(',');
            else parts = (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).map(p => p.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
            if (!parts[0]) continue;
            names.push(parts[0]);
            cats.push(parseInt(parts[1], 10) || 0);
            counts.push(parseInt(parts[2], 10) || 0);
            aliases.push(parts[3] ? ',' + parts[3].toLowerCase() : '');
        }
        return { names, cats, counts, aliases, lower: names.map(n => n.toLowerCase()) };
    }

    function load() {
        if (tags) return Promise.resolve(tags);
        if (!loading) loading = Promise.all([cached('tags'), cached('extra')]).then(([v, x]) => {
            const o = settings(), use = (c, k) => c && c.text && fileFor(k, o) !== 'None' && c.url.endsWith('/' + fileFor(k, o));
            const main = use(v, 'tag') ? parse(v.text) : null, extra = use(x, 'extra') ? parse(x.text) : null;
            if (!main || !extra) return (tags = main || extra);
            const [a, b] = o.extraAfter ? [main, extra] : [extra, main];
            return (tags = Object.fromEntries(Object.keys(a).map(f => [f, a[f].concat(b[f])])));
        });
        return loading;
    }

    async function listLoras() {
        if (loras) return loras;
        try {
            const r = await fetch(`${HOST}/sdapi/v1/loras`, { headers: getHeaders() });
            loras = r.ok ? (await r.json()).map(l => l.alias || l.name).filter(Boolean) : [];
        } catch (e) { loras = []; }
        return loras;
    }
    async function listEmbeddings() {
        if (embeddings) return embeddings;
        try {
            const r = await fetch(`${HOST}/sdapi/v1/embeddings`, { headers: getHeaders() });
            const d = r.ok ? await r.json() : {};
            embeddings = [...Object.keys(d.loaded || {}), ...Object.keys(d.skipped || {})];
        } catch (e) { embeddings = []; }
        return embeddings;
    }

    // ---- what is being typed ----
    function currentTerm(el) {
        const pos = el.selectionStart;
        if (pos !== el.selectionEnd) return null;
        const before = el.value.slice(0, pos);
        // "random::" or "order::" starting a tag: the picks this tab offers (randomtokens.js).
        // "random::group::" then a group's (or LoRA with variants') name.
        const rg = /(?:^|(?<=[\s,(\[{|]))(random|order)::group::([^(),\n<>{}|:]*)$/i.exec(before);
        if (rg && window.RandomTokens) return { kind: 'random', how: rg[1].toLowerCase(), group: true, text: rg[2], start: pos - rg[0].length, end: pos };
        // "random::character - " (after an optional "(word)"): a part after " - " in the names ("swimsuit").
        const rd = /(?:^|(?<=[\s,(\[{|]))(random|order)::([a-z]+)(?:[ \t]*\(([^()\n,<>{}|:]*)\))?[ \t]+-[ \t]+([^(),\n<>{}|:]*)$/i.exec(before);
        if (rd && window.RandomTokens) return { kind: 'random', how: rd[1].toLowerCase(), type: rd[2].toLowerCase(), br: (rd[3] || '').trim(), dash: true, text: rd[4], start: pos - rd[0].length, end: pos };
        // "random::character (" then a word in brackets in the names ("one piece").
        const rk = /(?:^|(?<=[\s,(\[{|]))(random|order)::([a-z]+)[ \t]*\(([^(),\n<>{}|:]*)$/i.exec(before);
        if (rk && window.RandomTokens) return { kind: 'random', how: rk[1].toLowerCase(), type: rk[2].toLowerCase(), text: rk[3], start: pos - rk[0].length, end: pos };
        const rt = /(?:^|(?<=[\s,(\[{|]))(random|order)::([a-z]*)$/i.exec(before);
        if (rt && window.RandomTokens) return { kind: 'random', how: rt[1].toLowerCase(), text: rt[2], start: pos - rt[0].length, end: pos };
        // "style::" starting a tag: a style's name (styles.js).
        const st = /(?:^|(?<=[\s,(\[{|]))style::([^,\n<>]*)$/i.exec(before);
        if (st && window.StyleManager && StyleManager.styles.length && !STYLE_BOXES.includes(el.id)) return { kind: 'style', text: st[1], start: pos - st[0].length, end: pos };
        // "__" starting a word: a wildcard (wildcards.js).
        const wc = /(?:^|(?<=[^A-Za-z0-9_]))__([A-Za-z0-9(-](?:(?!__)[A-Za-z0-9_ ()-])*|)$/.exec(before);
        if (wc && window.Wildcards && Wildcards.enabled()) return { kind: 'wc', text: wc[1], start: pos - wc[0].length, end: pos };
        // "<lora:" or "<e:", or "lora:" / "e:" starting a tag.
        const net = /(?:<(lora|lyco|l|e)|(?:^|(?<=[\s,(\[{|]))(lora|lyco|e)):([^<>:,]*)$/i.exec(before);
        if (net) return { kind: /^e$/i.test(net[1] || net[2]) ? 'emb' : 'lora', text: net[3], start: pos - net[0].length, end: pos };
        const m = /[^,\n{|<>]*$/.exec(before);
        const raw = m ? m[0] : '';
        // Opening brackets at the start are weighting; inside a tag they are part of it ("saber (fate)").
        const lead = raw.length - raw.replace(/^[\s(\[]+/, '').length;
        const text = raw.slice(lead).replace(/\\/g, '');
        if (text.trim().length < 2 || /[:<>]/.test(text) || !takesTags(el)) return null;
        return { kind: 'tag', text, start: pos - raw.length + lead, end: pos };
    }

    function search(t) {
        const q = t.text.toLowerCase().replace(/\s+/g, '_');
        const out = [];
        const seen = new Set();
        const add = i => { if (!seen.has(i)) { seen.add(i); out.push(i); } };
        const n = tags.names.length;
        for (let i = 0; i < n && out.length < MAX; i++) {
            if (tags.lower[i].startsWith(q) || tags.aliases[i].includes(',' + q)) add(i);
        }
        for (let i = 0; i < n && out.length < MAX; i++) {
            if (tags.lower[i].includes('_' + q)) add(i);
        }
        return out.map(i => ({ type: 'tag', name: tags.names[i], cat: tags.cats[i], count: tags.counts[i] }));
    }

    function count(n) {
        const f = n >= 1000000 || (n >= 1000 && n < 10000)
            ? Intl.NumberFormat('en', { notation: 'compact', minimumFractionDigits: 1, maximumFractionDigits: 1 })
            : Intl.NumberFormat('en', { notation: 'compact' });
        return f.format(n);
    }

    async function update() {
        if (!box) return hide();
        const t = currentTerm(box);
        if (!t || (t.kind !== 'wc' && t.kind !== 'style' && t.kind !== 'random' && !enabled())) return hide();
        if (/_neg$|_negative$/.test(box.id) && settings().neg === false) return hide();
        let results = [];
        if (t.kind === 'random') {
            const q = t.text.toLowerCase();
            // No LoRA list yet this session: offered again once it's loaded.
            if (!(window.LoraManager && LoraManager.allLoras && LoraManager.allLoras.length)) RandomTokens.ensureLoras().then(() => { if (box && document.activeElement === box) update(); });
            results = t.group
                ? RandomTokens.groupNames(tabOf(box)).filter(r => !q.trim() || (' ' + r.name.toLowerCase()).includes(' ' + q.trim())).slice(0, 50).map(r => ({ type: 'random', how: t.how, name: `group::${r.name}`, meta: r.meta }))
                : t.type && t.dash
                ? RandomTokens.keywords(tabOf(box), t.type, 'dash', t.br).filter(r => (' ' + r.name).includes(' ' + q.trim())).slice(0, 50).map(r => ({ type: 'random', how: t.how, name: `${t.type}${t.br ? ` (${t.br.toLowerCase()})` : ''} - ${r.name}`, meta: r.meta }))
                : t.type
                ? RandomTokens.keywords(tabOf(box), t.type).filter(r => (' ' + r.name).includes(' ' + q.trim())).slice(0, 50).map(r => ({ type: 'random', how: t.how, name: `${t.type} (${r.name})`, meta: r.meta }))
                : RandomTokens.available(tabOf(box), t.how).filter(r => r.name.startsWith(q)).map(r => ({ type: 'random', how: t.how, name: r.name, meta: r.meta }));
        } else if (t.kind === 'style') {
            // Leaving out styles already in this box.
            const v = box.value, rest = /^[^,\n<>]*/.exec(v.slice(t.end))[0];
            const used = new Set(StyleManager.tokensIn(v.slice(0, t.start) + v.slice(t.end + rest.length)));
            const q = StyleManager.tokenKey(t.text);
            results = StyleManager.styles.map(s => s.name).filter(n => !used.has(n) && StyleManager.tokenKey(n).includes(q))
                .sort((a, b) => (StyleManager.tokenKey(a).startsWith(q) === StyleManager.tokenKey(b).startsWith(q) ? a.localeCompare(b, undefined, { sensitivity: 'base' }) : StyleManager.tokenKey(a).startsWith(q) ? -1 : 1))
                .slice(0, MAX).map(n => ({ type: 'style', name: n }));
        } else if (t.kind === 'wc') {
            // Wildcards work without the extension; the first chip (a gear) opens the Wildcards window.
            // Not in the Wildcards window's own boxes (it's open already).
            const own = box && box.closest && box.closest('#wildcardsModal, #wcEditorModal, #wcTryModal');
            results = (own ? [] : [{ type: 'wcmanage', name: 'Wildcards' }]).concat(Wildcards.suggest(t.text).slice(0, MAX).map(w => ({ type: 'wc', name: w.name, count: w.count })));
        } else if (t.kind === 'lora' || t.kind === 'emb') {
            const list = t.kind === 'lora' ? await listLoras() : await listEmbeddings();
            const q = t.text.toLowerCase();
            results = list.filter(n => n.toLowerCase().includes(q))
                .sort((a, b) => a.toLowerCase().startsWith(q) === b.toLowerCase().startsWith(q) ? a.localeCompare(b) : (a.toLowerCase().startsWith(q) ? -1 : 1))
                .slice(0, MAX).map(n => ({ type: t.kind, name: n }));
        } else {
            if (!await load()) return hide();
            results = search(t);
        }
        // Still the same box and word?
        const now = box && currentTerm(box);
        if (!now || now.text !== t.text || now.kind !== t.kind) return;
        term = t;
        render(results);
    }

    function render(results) {
        if (!results.length) return hide();
        bar.innerHTML = '';
        // The gear in a slot of its own; the chips scroll beside it.
        const strip = document.createElement('div');
        strip.className = 'tac-scroll';
        results.forEach(r => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tac-chip';
            if (r.type === 'wcmanage') {
                b.classList.add('tac-gear');
                b.title = 'Wildcards';
                b.setAttribute('aria-label', 'Wildcards');
                b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';
                b.addEventListener('click', () => { const from = box; hide(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); Wildcards.open(from); });
                const slot = document.createElement('div');
                slot.className = 'tac-fixed';
                slot.appendChild(b);
                bar.appendChild(slot);
                return;
            }
            const name = document.createElement('span');
            name.className = 'tac-name';
            name.textContent = r.type === 'tag' ? r.name.replace(/_/g, ' ') : r.type === 'wc' ? `__${r.name}__` : r.type === 'style' ? `style::${r.name}` : r.type === 'random' ? `${r.how}::${r.name}` : r.name;
            if (r.type === 'tag') name.style.color = COLOURS[r.cat] || COLOURS['-1'];
            else if (r.type === 'wc' || r.type === 'random') name.classList.add('tac-wc');
            else name.classList.add('tac-net');
            b.appendChild(name);
            const meta = document.createElement('span');
            meta.className = 'tac-count';
            meta.textContent = r.type === 'tag' ? (r.count ? count(r.count) : '') : r.type === 'wc' ? String(r.count) : r.type === 'style' ? 'Style' : r.type === 'random' ? r.meta || '' : (r.type === 'lora' ? 'LoRA' : 'Embedding');
            if (meta.textContent) b.appendChild(meta);
            b.addEventListener('click', () => insert(r));
            strip.appendChild(b);
        });
        bar.appendChild(strip);
        strip.scrollLeft = 0;
        bar.classList.remove('hidden');
        place();
    }

    function hide() {
        term = null;
        if (bar) bar.classList.add('hidden');
    }

    // Above the keyboard: the bottom of the visible part of the page. It can't follow a scroll smoothly, so it is hidden
    // while the page moves and put back once it stops.
    function place() {
        if (!bar || bar.classList.contains('hidden')) return;
        const vv = window.visualViewport;
        const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
        bar.style.top = `${Math.round(bottom - bar.offsetHeight) + 2}px`;
    }
    let settle = 0;
    function moving() {
        if (!bar || bar.classList.contains('hidden')) return;
        bar.classList.add('tac-moving');
        clearTimeout(settle);
        settle = setTimeout(() => { place(); bar.classList.remove('tac-moving'); }, 150);
    }

    function tagText(r) {
        const o = settings();
        if (r.type === 'lora') {
            const w = (typeof loraConfigs !== 'undefined' && loraConfigs[r.name] && loraConfigs[r.name].weight) || 1;
            return `<lora:${r.name}:${w}>`;
        }
        if (r.type === 'emb') return r.name;
        let t = r.name;
        const keep = o.keep ? o.keep.split(',').map(s => s.trim()) : [];
        if (o.underscores !== false && !keep.includes(t)) t = t.replace(/_/g, ' ');
        if (o.escape !== false) t = t.replace(/([()])/g, '\\$1');
        if (o.anima && r.cat === 1 && archOf(box) === 'anima') t = '@' + t;
        return t;
    }

    function insert(r) {
        if (!box || !term) return;
        const el = box, v = el.value;
        const after = v.slice(term.end);
        const o = settings();
        let text = r.type === 'wc' ? `__${r.name}__` : r.type === 'style' ? `style::${r.name}` : r.type === 'random' ? `${r.how}::${r.name}` : tagText(r);
        if (r.type === 'wc' && window.Wildcards && Wildcards.noteUsed) Wildcards.noteUsed([r.name]);
        if (r.type === 'wc') {
            // Replaces the rest of a wildcard name being edited, closing "__" included.
            const word = (/^[A-Za-z0-9_ ()-]*?__/.exec(after) || /^[A-Za-z0-9_-]*/.exec(after))[0];
            const rest = after.slice(word.length);
            const sep = /^\s*[,\n|}]/.test(rest) || /^\s*$/.test(rest) && el.id === 'wcEditorText' ? '' : (o.comma !== false ? ',' : '') + (o.space !== false ? ' ' : '');
            el.value = v.slice(0, term.start) + text + sep + rest;
            el.selectionStart = el.selectionEnd = term.start + text.length + sep.length;
        } else if (r.type === 'style' || r.type === 'random') {
            const rest = after.slice(/^[^,\n<>]*/.exec(after)[0].length);
            const sep = /^\s*[,\n]/.test(rest) || el.id === 'wcEditorText' || /::$/.test(text) ? '' : (o.comma !== false ? ',' : '') + (o.space !== false ? ' ' : '');
            el.value = v.slice(0, term.start) + text + sep + rest;
            el.selectionStart = el.selectionEnd = term.start + text.length + sep.length;
        } else if (r.type === 'lora' || r.type === 'emb') {
            const close = /^[^<,]*?>/.exec(after);
            const rest = close ? after.slice(close[0].length) : after;
            const sep = /^\s*,/.test(rest) || r.type === 'lora' ? '' : (o.comma !== false ? ',' : '') + (o.space !== false ? ' ' : '');
            el.value = v.slice(0, term.start) + text + sep + rest;
            el.selectionStart = el.selectionEnd = term.start + text.length + sep.length;
        } else {
            const word = /^[^,\n)\]}|<>]*/.exec(after)[0];
            const rest = after.slice(word.length);
            const sep = /^\s*[,|}]/.test(rest) ? '' : (o.comma !== false ? ',' : '') + (o.space !== false ? ' ' : '');
            el.value = v.slice(0, term.start) + text + sep + rest;
            el.selectionStart = el.selectionEnd = term.start + text.length + sep.length;
        }
        hide();
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.focus();
    }

    function paintConfig() {
        const sw = document.getElementById('cfgTagCompleteSwitch');
        if (sw) sw.checked = localStorage.getItem('bojroTagComplete') === 'true';
        document.getElementById('tacFileRows')?.classList.toggle('hidden', !(sw && sw.checked));
        let found;
        try { found = JSON.parse(localStorage.getItem('bojroTacFiles')) || []; } catch (e) { found = []; }
        ['tag', 'extra'].forEach(k => {
            const sel = document.getElementById(k === 'tag' ? 'tacTagFileSelect' : 'tacExtraFileSelect');
            if (!sel) return;
            const v = picked(k);
            const list = [...new Set(found.concat(v && v !== 'None' ? [v] : []))];
            sel.innerHTML = '';
            sel.appendChild(new Option('Same as server', ''));
            list.forEach(n => sel.appendChild(new Option(n, n)));
            sel.appendChild(new Option('None', 'None'));
            sel.value = v;
            if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText(sel.id);
        });
    }

    // The Config switch: turning it on asks first, with a link to the extension (as Progress Bridge does).
    async function toggle() {
        const sw = document.getElementById('cfgTagCompleteSwitch');
        if (sw.checked) {
            const ok = await window.appConfirm(
                "Enable tag autocomplete? Requires the TagComplete Neo extension installed on your Forge Neo server.",
                { title: 'Tag Autocomplete', okText: 'ENABLE', link: { text: 'sd-webui-tagcomplete-neo', url: EXT_URL } }
            );
            if (!ok) { sw.checked = false; return; }
        }
        setEnabled(sw.checked);
        paintConfig();
    }

    function setEnabled(on) {
        localStorage.setItem('bojroTagComplete', on ? 'true' : 'false');
        if (on && typeof HOST !== 'undefined' && HOST) refresh();
        if (!on) hide();
    }

    // body.kb-up while a text field has the keyboard up: the bottom bar steps aside (style.css).
    function paintKeyboard() {
        const a = document.activeElement;
        const typing = !!a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|search|number|url|email|)$/.test(a.type || '')));
        document.body.classList.toggle('kb-up', typing && typeof isKeyboardUp === 'function' && isKeyboardUp());
    }

    function start() {
        bar = document.createElement('div');
        bar.id = 'tacBar';
        bar.className = 'tac-bar hidden';
        // Tapping a suggestion keeps the keyboard up.
        bar.addEventListener('mousedown', e => e.preventDefault());
        document.body.appendChild(bar);
        document.addEventListener('focusin', e => {
            if (!e.target.matches || !e.target.matches(BOXES)) return;
            box = e.target;
            if (enabled()) load();
        });
        document.addEventListener('focusout', e => {
            if (e.target !== box) return;
            setTimeout(() => { if (document.activeElement !== box) { box = null; hide(); } }, 150);
        });
        const later = () => { clearTimeout(timer); timer = setTimeout(update, 60); };
        document.addEventListener('input', e => { if (e.target === box) later(); });
        document.addEventListener('selectionchange', () => { if (box && document.activeElement === box) later(); });
        document.addEventListener('focusin', () => setTimeout(paintKeyboard, 0));
        document.addEventListener('focusout', () => setTimeout(paintKeyboard, 0));
        if (window.visualViewport) {
            visualViewport.addEventListener('resize', paintKeyboard);
            visualViewport.addEventListener('resize', moving);
            visualViewport.addEventListener('scroll', moving);
        }
        window.addEventListener('scroll', moving, { passive: true });
        paintConfig();
    }

    window.TagComplete = { connected, setEnabled, setFile, listFiles, toggle, refresh, currentTerm, search: t => (tags ? search(t) : []), load, insert };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
