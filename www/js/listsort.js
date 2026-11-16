// Sorting the Wildcards, Styles, LoRA and Character Select lists (item 85): a button at the end of each search row
// opens SORT BY (A-Z, RECENTLY ADDED, RECENTLY USED, MOST USED; Character Select has no "added", its list is built
// in). Each window remembers its choice. Use is counted once per job run, from what the job sends (recordJob()).
(function () {
    const PREF_KEY = 'bojroListSort', USE_KEY = 'bojroListUse', SEEN_KEY = 'bojroLoraSeen';
    const KINDS = { wc: ['az', 'added', 'recent', 'used'], style: ['az', 'added', 'recent', 'used'], lora: ['az', 'added', 'recent', 'used'], saac: ['az', 'recent', 'used'], preset: ['az', 'added', 'recent', 'used'] };
    const LABEL = { az: ['arrow-down-a-z', 'A–Z'], added: ['clock', 'RECENTLY ADDED'], recent: ['history', 'RECENTLY USED'], used: ['flame', 'MOST USED'] };
    const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } };
    const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { if (window.dbg) dbg(`List sort: couldn't save ${k} (${e && e.name})`); } };
    const COLLATE = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

    function mode(kind) { const m = read(PREF_KEY, {})[kind]; return KINDS[kind] && KINDS[kind].includes(m) ? m : 'az'; }
    function setMode(kind, m) { const p = read(PREF_KEY, {}); p[kind] = m; write(PREF_KEY, p); }

    // Use: { kind: { key: [times, lastUsedMs] } }.
    let use = null;
    const uses = () => (use = use || read(USE_KEY, {}));
    function bump(kind, keys, now) {
        const u = uses(), m = u[kind] = u[kind] || {};
        [...new Set(keys.filter(Boolean))].forEach(k => { const e = m[k] || [0, 0]; m[k] = [e[0] + 1, now]; });
    }

    // A comparator for one window's list: get = { name(x), key(x), added(x) (bigger is newer), use(x) (optional:
    // [times, lastMs] in place of key's) }. Ones not used yet go after the used ones (A-Z); ties A-Z.
    function compare(kind, get) {
        const m = mode(kind), u = (uses()[kind]) || {}, az = (a, b) => COLLATE.compare(get.name(a), get.name(b));
        const st = x => (get.use ? get.use(x) : u[get.key(x)]) || [0, 0];
        if (m === 'added') return (a, b) => (get.added(b) - get.added(a)) || az(a, b);
        if (m === 'used') return (a, b) => (st(b)[0] - st(a)[0]) || az(a, b);
        if (m === 'recent') return (a, b) => (st(b)[1] - st(a)[1]) || az(a, b);
        return az;
    }

    // LoRAs: when the app first saw each (Forge doesn't say when a file was added). The first time, all of them at
    // once (0), so only ones that come later sort as new. Kept in memory too, so a failed save can't make a later load
    // count everything as old again; an empty list (server not ready) doesn't count as the first time.
    let seenMem = null;
    function seen(keys) {
        keys = keys.filter(Boolean);
        if (!seenMem) seenMem = read(SEEN_KEY, null);
        const first = !seenMem, now = Date.now();
        if (first && !keys.length) return {};
        seenMem = seenMem || {};
        const fresh = keys.filter(k => !(k in seenMem));
        fresh.forEach(k => { seenMem[k] = first ? 0 : now; });
        if (fresh.length || first) {
            const log = window.dbg || (() => { });
            log(first ? `LoRA sort: ${fresh.length} LoRAs noted as already there` : `LoRA sort: ${fresh.length} new LoRA${fresh.length === 1 ? '' : 's'} (${fresh.slice(0, 5).join(', ')}${fresh.length > 5 ? ', ...' : ''})`);
            try { localStorage.setItem(SEEN_KEY, JSON.stringify(seenMem)); }
            catch (e) {
                let size = 0;
                try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); size += k.length + (localStorage.getItem(k) || '').length; } } catch (e2) { }
                log(`LoRA sort: couldn't save (${e && e.name}); app storage holds ${(size / 1048576).toFixed(1)}M characters`);
            }
        }
        return seenMem;
    }

    // The button: its icon is the order in use.
    function paint(btn, kind) {
        if (!btn) return;
        const m = mode(kind), [ic, t] = LABEL[m];
        btn.dataset.sort = m;
        btn.title = `Sort: ${t.replace('A–Z', 'A to Z').toLowerCase()}`;
        btn.setAttribute('aria-label', btn.title);
        btn.innerHTML = `<i data-lucide="${ic}" width="18" height="18"></i>`;
        if (window.lucide) lucide.createIcons();
    }
    function menu(btn, kind, onChange) {
        document.getElementById('thumbMenu')?.remove();
        const m = document.createElement('div');
        m.id = 'thumbMenu';
        m.className = 'modal wxp-menu sort-menu';
        const cur = mode(kind);
        m.innerHTML = '<div class="thumb-menu-box"><div class="sort-menu-h">SORT BY</div>' + KINDS[kind].map(k => `<button type="button" class="btn-small${k === cur ? ' on' : ''}" data-k="${k}"><i data-lucide="${LABEL[k][0]}" width="16" height="16"></i>${LABEL[k][1]}${k === cur ? '<i class="sort-ck" data-lucide="check" width="16" height="16"></i>' : ''}</button>`).join('') + '</div>';
        const shut = () => m.remove();
        m.querySelectorAll('button[data-k]').forEach(b => { b.onclick = () => { shut(); setMode(kind, b.dataset.k); paint(btn, kind); if (onChange) onChange(); }; });
        document.body.appendChild(m);
        if (window.lucide) lucide.createIcons();
        const r = btn.getBoundingClientRect(), box = m.firstChild;
        box.style.left = `${Math.max(8, Math.min(r.right - box.offsetWidth, window.innerWidth - box.offsetWidth - 8))}px`;
        box.style.top = `${Math.min(r.bottom + 6, window.innerHeight - box.offsetHeight - 8)}px`;
    }

    // ---- counting, once per job run ----
    const loraKey = s => String(s || '').trim().toLowerCase();
    function recordJob(job) {
        if (!job || !job.payload) return;
        const text = String(job.typedPrompt != null ? job.typedPrompt : job.payload.prompt || ''), now = Date.now();
        bump('lora', [...text.matchAll(/<(?:lora|lyco):([^:>]+)/gi)].map(m => loraKey(m[1])), now);
        const styles = (job.styleNames || []).concat([...text.matchAll(/style::([^,\n]+)/gi)].map(m => m[1].trim()));
        bump('style', styles.map(s => s.toLowerCase()), now);
        if (window.WcEngine && WcEngine.callsIn) { try { bump('wc', [...WcEngine.callsIn(text)], now); } catch (e) { } }
        // Characters: tags of the prompt that are in Character Select's list (loaded the first time if need be).
        const saac = window.SaacManager;
        const count = () => {
            if (!saac || !Array.isArray(saac.data)) return;
            const norm = typeof normaliseTag === 'function' ? normaliseTag : t => String(t).trim().toLowerCase();
            const known = saac._sortKeys = saac._sortKeys || new Set(saac.data.map(c => norm(c.tag)));
            bump('saac', text.split(/[,\n]/).map(t => norm(t)).filter(t => t && known.has(t)), now);
            write(USE_KEY, uses());
        };
        write(USE_KEY, uses());
        if (saac && !saac.isLoaded && saac.init) Promise.resolve(saac.init()).then(count).catch(() => { }); else count();
    }

    // With the sort button a search box can be too narrow for its hint on a small phone: "Search" then.
    const ctx = document.createElement('canvas').getContext('2d');
    function fitHint(i) {
        if (!i.clientWidth) return;
        const cs = getComputedStyle(i), full = i.dataset.hint || (i.dataset.hint = i.placeholder);
        ctx.font = `${cs.fontSize} ${cs.fontFamily}`;
        const room = i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        i.placeholder = ctx.measureText(full).width <= room ? full : 'Search';
    }
    function watchHints() {
        if (!window.ResizeObserver) return;
        const ro = new ResizeObserver(es => es.forEach(e => fitHint(e.target)));
        document.querySelectorAll('#wcSearch, #styleSearch, #loraSearch, #saacSearch, #img2imgPresetSearch').forEach(i => ro.observe(i));
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchHints); else watchHints();

    // One use now (img2img presets: a preset loaded).
    function used(kind, key) { bump(kind, [key], Date.now()); write(USE_KEY, uses()); }
    window.ListSort = { mode, setMode, compare, seen, paint, menu, recordJob, loraKey, fitHint, used, uses: () => uses() };
})();
