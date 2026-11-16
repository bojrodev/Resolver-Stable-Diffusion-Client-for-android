// Wildcard versions and Recently deleted (wildcards.js calls saved() and deleted()). Kept in IndexedDB apart from the
// wildcards: only wildcards you save or delete, the last 10 saves each, deleted ones for 30 days.
(function () {
    const DB = 'bojroWcHistory', STORE = 'items', PER = 11, DAYS = 30, MAX_DELETED = 200;
    const $ = id => document.getElementById(id);
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const keyOf = n => String(n || '').trim().replace(/\s+/g, '_').toLowerCase();
    const same = (a, b) => !!a && !!b && a.name === b.name && !!a.inOrder === !!b.inOrder && a.lines.join('\n') === b.lines.join('\n');
    const copy = w => ({ name: w.name, lines: w.lines.slice(), ...(w.inOrder ? { inOrder: true } : {}) });
    let dbp = null;
    function db() {
        if (!dbp) dbp = new Promise(res => {
            try {
                const r = indexedDB.open(DB, 1);
                r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
                r.onsuccess = () => res(r.result);
                r.onerror = () => res(null);
            } catch (e) { res(null); }
        });
        return dbp;
    }
    const req = r => new Promise(res => { r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
    async function all() { const d = await db(); return d ? (await req(d.transaction([STORE]).objectStore(STORE).getAll())) || [] : []; }
    async function change(fn) {
        const d = await db();
        if (!d) return;
        const s = d.transaction([STORE], 'readwrite').objectStore(STORE);
        await fn(s);
    }
    // A save: the wildcard as saved (and as it was, the first time); renamed ones take their versions along.
    async function saved(before, after, oldName) {
        if (!after || same(before, after)) return;
        const key = keyOf(after.name), items = await all();
        await change(s => {
            if (oldName && keyOf(oldName) !== key) items.filter(i => i.kind === 'v' && i.key === keyOf(oldName)).forEach(i => { i.key = key; s.put(i); });
            const mine = items.filter(i => i.kind === 'v' && (i.key === key || (oldName && i.key === keyOf(oldName))));
            const now = Date.now();
            if (!mine.length && before) { s.add({ kind: 'v', key, w: copy(before), ts: null, at: now - 1 }); mine.push({ at: now - 1 }); }
            s.add({ kind: 'v', key, w: copy(after), ts: now, at: now });
            mine.sort((a, b) => a.at - b.at).slice(0, Math.max(0, mine.length + 1 - PER)).forEach(i => i.id != null && s.delete(i.id));
        });
    }
    // A delete: kept 30 days (the newest 200); UNDO for a few seconds.
    // Deleted entries: one wildcard ('d') or several deleted together ('D', one entry).
    const isDel = i => i.kind === 'd' || i.kind === 'D';
    async function deleted(w) {
        if (!w) return;
        const now = Date.now(), items = await all();
        let added = null;
        await change(s => {
            const gone = items.filter(isDel).sort((a, b) => b.at - a.at);
            gone.forEach((i, n) => { if (n >= MAX_DELETED - 1 || now - i.at > DAYS * 864e5) s.delete(i.id); });
            added = req(s.add({ kind: 'd', key: keyOf(w.name), w: copy(w), ts: now, at: now }));
        });
        const id = await added;
        snack(`Deleted "${w.name}"`, () => restoreDeleted(id));
    }
    // Several at once (the list's DELETE (N)): one UNDO puts them all back.
    async function deletedMany(ws) {
        ws = (ws || []).filter(Boolean);
        if (!ws.length) return;
        if (ws.length === 1) return deleted(ws[0]);
        const now = Date.now(), items = await all();
        let added = null;
        await change(s => {
            const gone = items.filter(isDel).sort((a, b) => b.at - a.at);
            gone.forEach((i, n) => { if (n >= MAX_DELETED - 1 || now - i.at > DAYS * 864e5) s.delete(i.id); });
            added = req(s.add({ kind: 'D', ws: ws.map(copy), ts: now, at: now }));
        });
        const id = await added;
        snack(`Deleted ${ws.length.toLocaleString()} wildcards`, () => restoreDeleted(id));
    }
    let snackTimer = 0;
    function snack(text, undo) {
        document.querySelectorAll('.wc-snack').forEach(e => e.remove());
        clearTimeout(snackTimer);
        const el = document.createElement('div');
        el.className = 'wc-snack';
        el.innerHTML = `<span>${esc(text)}</span><button type="button">UNDO</button>`;
        el.querySelector('button').onclick = () => { el.remove(); undo(); };
        document.body.appendChild(el);
        snackTimer = setTimeout(() => el.remove(), 6000);
    }
    // ---- the sheets ----
    const when = ts => {
        if (!ts) return 'Before your first save';
        const d = new Date(ts), t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const day = new Date(); day.setHours(0, 0, 0, 0);
        if (ts >= day.getTime()) return `Today ${t}`;
        if (ts >= day.getTime() - 864e5) return `Yesterday ${t}`;
        return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${t}`;
    };
    const optCount = w => w.lines.filter(l => l.trim() && !l.trim().startsWith('#')).length;
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    // An empty window: an icon, a short title and one muted line.
    const emptyState = (icon, title, line) => `<div class="wv-empty"><i data-lucide="${icon}" width="28" height="28"></i><b>${title}</b><span>${line}</span></div>`;
    function openSheet(title, label, html, bin) {
        $('wcHistTitle').textContent = title;
        $('wcHistEmptyBtn').classList.toggle('hidden', !bin);
        $('wcHistLabel').textContent = label;
        $('wcHistOut').innerHTML = html;
        const m = $('wcHistModal');
        if (m.classList.contains('hidden') && typeof lockBodyScroll === 'function') lockBodyScroll();
        m.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    }
    function close() {
        const m = $('wcHistModal');
        if (!m.classList.contains('hidden') && typeof unlockBodyScroll === 'function') unlockBodyScroll();
        m.classList.add('hidden');
    }
    // Versions of the wildcard in the editor: what restoring would bring back (green) and take out (red); RESTORE puts
    // it in the editor to save.
    async function versions() {
        const name = Wildcards._editing ? Wildcards._editing() : '';
        if (!name) return;
        const now = (Wildcards._lib.read().find(w => keyOf(w.name) === keyOf(name))) || { name, lines: [] };
        const list = (await all()).filter(i => i.kind === 'v' && i.key === keyOf(name)).sort((a, b) => b.at - a.at);
        const cur = new Set(now.lines.map(l => l.trim()));
        const html = list.map((i, n) => {
            const has = new Set(i.w.lines.map(l => l.trim()));
            const add = i.w.lines.filter(l => !cur.has(l.trim())), del = now.lines.filter(l => !has.has(l.trim()));
            const isNow = same(i.w, now);
            const diff = add.map(l => `<div class="add">+ ${esc(l)}</div>`).concat(del.map(l => `<div class="del">${esc(l)}</div>`));
            return `<div class="wc-ver${isNow ? ' cur' : ''}"><div class="wc-ver-h"><span>${when(i.ts)}</span><small>${plural(optCount(i.w), 'option')}${isNow ? ' • now' : ''}</small></div>` +
                (i.w.name !== now.name ? `<div class="wc-ver-diff"><div class="del">${esc(now.name)}</div><div class="add">+ named ${esc(i.w.name)}</div></div>` : '') +
                (diff.length ? `<div class="wc-ver-diff">${diff.slice(0, 6).join('')}${diff.length > 6 ? `<div class="more">and ${diff.length - 6} more</div>` : ''}</div>` : '') +
                (isNow ? '' : `<div class="wc-ver-foot"><button type="button" class="btn-small" data-i="${n}">RESTORE</button></div>`) + '</div>';
        }).join('') || emptyState('history', 'No earlier versions yet', 'Each time you save, the version before is kept here (the last 10).');
        openSheet('Versions', name.toUpperCase(), html + (list.length ? '<div class="wc-hist-note">The last 10 saves of each wildcard are kept.</div>' : ''));
        $('wcHistOut').querySelectorAll('[data-i]').forEach(b => { b.onclick = () => { const w = list[+b.dataset.i].w; close(); Wildcards._load(w); }; });
    }
    async function deletedOpen() {
        const now = Date.now(), list = (await all()).filter(i => isDel(i) && now - i.at <= DAYS * 864e5).sort((a, b) => b.at - a.at);
        const card = i => (i.kind === 'D'
            ? `<div class="wc-ver"><div class="wc-ver-h"><span>Deleted ${i.ws.length.toLocaleString()} wildcards</span><small>${when(i.ts)}</small></div><div class="wc-hist-note" style="margin:4px 0 0">${esc(i.ws.slice(0, 5).map(w => w.name).join(', '))}${i.ws.length > 5 ? ` and ${(i.ws.length - 5).toLocaleString()} more` : ''}</div>` +
              `<div class="wc-ver-foot"><button type="button" class="btn-small" data-id="${i.id}">RESTORE ALL</button></div></div>`
            : `<div class="wc-ver"><div class="wc-ver-h"><span>${esc(i.w.name)}</span><small>${when(i.ts)}</small></div><div class="wc-hist-note" style="margin:4px 0 0">${plural(optCount(i.w), 'option')}</div>` +
              `<div class="wc-ver-foot"><button type="button" class="btn-small" data-id="${i.id}">RESTORE</button></div></div>`);
        const html = list.map(card).join('') || emptyState('undo-2', 'Nothing deleted', 'Deleted wildcards are kept here for 30 days.');
        openSheet('Recently deleted', list.length ? 'DELETED WILDCARDS' : '', html + (list.length ? '<div class="wc-hist-note">Kept for 30 days.</div>' : ''), list.length > 0);
        $('wcHistOut').querySelectorAll('[data-id]').forEach(b => { b.onclick = async () => { await restoreDeleted(+b.dataset.id); deletedOpen(); }; });
    }
    // Back in the list (a name taken since gets " restored").
    async function restoreDeleted(id) {
        const i = (await all()).find(x => x.id === id);
        if (!i) return;
        // One write and one redraw however many (a 'D' entry is all of them).
        const list = Wildcards._lib.read(), taken = new Set(list.map(x => keyOf(x.name)));
        (i.kind === 'D' ? i.ws : [i.w]).forEach(src => {
            const w = copy(src);
            while (taken.has(keyOf(w.name))) w.name = `${w.name} restored`;
            taken.add(keyOf(w.name));
            list.push(w);
        });
        Wildcards._lib.write(list);
        await change(s => s.delete(id));
        Wildcards.render();
    }
    // The red bin: every deleted wildcard gone for good.
    async function emptyDeleted() {
        const list = (await all()).filter(isDel);
        if (!list.length) return;
        const n = list.reduce((t, i) => t + (i.kind === 'D' ? i.ws.length : 1), 0);
        if (!(await window.appConfirm(`${plural(n, 'wildcard')} will be gone for good.`, { title: 'Empty Deleted Wildcards?', okText: 'EMPTY', danger: true }))) return;
        await change(s => list.forEach(i => s.delete(i.id)));
        deletedOpen();
    }
    window.WcHistory = { saved, deleted, deletedMany, versions, deletedOpen, close, restoreDeleted, emptyDeleted };
})();
