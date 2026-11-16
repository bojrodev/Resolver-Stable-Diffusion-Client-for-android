// History's light copy of each image (IndexedDB 'bojroGalleryLite'), so the grid never reads full images; the viewer reads
// one when needed (the thumbnail stands in) and keeps the last few. It follows the main store by its keys.
(function () {
    const DB = 'bojroGalleryLite', STORE = 'items', KEEP = 8;
    let liteDb = null;
    function open() {
        if (liteDb) return Promise.resolve(liteDb);
        return new Promise(resolve => {
            try {
                const req = indexedDB.open(DB, 1);
                req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
                req.onsuccess = () => { liteDb = req.result; resolve(liteDb); };
                req.onerror = () => resolve(null);
            } catch (e) { resolve(null); }
        });
    }
    const asPromise = req => new Promise(resolve => { req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(null); });
    const mainStore = () => db.transaction(['images'], 'readonly').objectStore('images');

    // ---- full images, read on demand ----
    const full = new Map();     // id -> data URL, most recent last
    const loading = new Map();  // id -> promise
    function remember(id, data) {
        full.delete(id);
        full.set(id, data);
        while (full.size > KEEP) full.delete(full.keys().next().value);
    }
    function load(id) {
        if (full.has(id)) return Promise.resolve(full.get(id));
        if (loading.has(id)) return loading.get(id);
        const p = (typeof db !== 'undefined' && db ? asPromise(mainStore().get(id)) : Promise.resolve(null)).then(rec => {
            loading.delete(id);
            if (rec && rec.data) { remember(id, rec.data); fixViewer(id); }
            return rec ? rec.data : null;
        });
        loading.set(id, p);
        return p;
    }
    // An item as History lists it: everything but the image; .data is the full image once read, the thumbnail until then.
    class Item {
        constructor(r) { Object.assign(this, r); }
        get data() {
            if (full.has(this.id)) { const d = full.get(this.id); remember(this.id, d); return d; }
            load(this.id);
            return this.thumbnail || '';
        }
        set data(v) { if (v) remember(this.id, v); }
    }
    // The viewer showing a thumbnail for an image just read: the full one in its place.
    function fixViewer(id) {
        const modal = document.getElementById('fullScreenModal');
        if (!modal || modal.classList.contains('hidden') || typeof currentGalleryImages === 'undefined' || !currentGalleryImages.length) return;
        const len = currentGalleryImages.length;
        [[-1, 'fsImagePrev'], [0, 'fsImage'], [1, 'fsImageNext']].forEach(([d, elId]) => {
            const it = currentGalleryImages[((currentGalleryIndex + d) % len + len) % len];
            const el = document.getElementById(elId);
            if (it instanceof Item && it.id === id && el && it.thumbnail && el.getAttribute('src') === it.thumbnail) el.src = full.get(id);
        });
    }
    // Before Download, Share, Send and the like: the image on show is the full one.
    async function settle() {
        const it = typeof currentGalleryImages !== 'undefined' && currentGalleryImages[currentGalleryIndex];
        if (!(it instanceof Item)) return;
        const data = await load(it.id);
        const el = document.getElementById('fsImage');
        if (data && el && el.getAttribute('src') !== data) {
            el.src = data;
            if (el.decode) { try { await el.decode(); } catch (e) {} }
        }
    }

    // ---- the light copy ----
    async function searchTextsOf(data) {
        try {
            const b64 = data.slice(data.indexOf(',') + 1, data.indexOf(',') + 1 + 700000);
            const bin = atob(b64.slice(0, b64.length - (b64.length % 4)));
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const raw = parametersFromTextChunks(await readPngTextChunks(new Blob([bytes])));
            if (!raw) return [];
            const info = parseGenInfo(raw);
            const model = (info.params.match(/Model:\s*([^,]+)/) || [])[1] || '';
            return [info.pos, model].filter(Boolean);
        } catch (e) { return []; }
    }
    async function liteOf(rec) {
        const out = { id: rec.id, key: rec.data ? imageDataKey(rec.data) : '', thumbnail: rec.thumbnail || null, date: rec.date, jpg: imageMimeFromBase64(rec.data || '') === 'image/jpeg', fmt: { 'image/jpeg': 'jpg', 'image/webp': 'webp' }[imageMimeFromBase64(rec.data || '')] || 'png', search: await searchTextsOf(rec.data || '') };
        if (!out.thumbnail && rec.data && typeof generateThumbnail === 'function') out.thumbnail = await generateThumbnail(rec.data);
        ['ts', 'badges', 'upscale'].forEach(k => { if (rec[k] !== undefined) out[k] = rec[k]; });
        return out;
    }
    // A record just saved (saveImageToDB(), utils.js).
    async function add(rec) {
        const ldb = await open();
        if (!ldb || !rec || rec.id == null) return;
        const lite = await liteOf(rec);
        if (rec.data) remember(rec.id, rec.data);
        await asPromise(ldb.transaction([STORE], 'readwrite').objectStore(STORE).put(lite));
        if (cache) cache.set(lite.id, new Item(lite));
    }
    // Every image, oldest first, as light items; copies made for new ones, and gone ones dropped. onProgress(done, total)
    // while copying more than a few.
    let syncing = null;
    let cache = null; // id -> Item, once read
    function list(onProgress) {
        if (syncing) return syncing;
        syncing = (async () => {
            const ldb = await open();
            if (!ldb || typeof db === 'undefined' || !db) return null;
            // After the first read only the keys are listed; copies come from memory.
            const [keys, lites] = await Promise.all([asPromise(mainStore().getAllKeys()), cache ? [...cache.values()] : asPromise(ldb.transaction([STORE], 'readonly').objectStore(STORE).getAll())]);
            if (!keys || !lites) return null;
            const have = new Map(lites.map(l => [l.id, l]));
            const there = new Set(keys);
            const gone = lites.filter(l => !there.has(l.id)).map(l => l.id);
            if (gone.length) {
                const s = ldb.transaction([STORE], 'readwrite').objectStore(STORE);
                gone.forEach(id => { s.delete(id); full.delete(id); have.delete(id); });
            }
            const missing = keys.filter(k => !have.has(k));
            for (let i = 0; i < missing.length; i++) {
                if (missing.length > 3 && onProgress) onProgress(i, missing.length);
                // Copied already (another tab's save): from the light store.
                const kept = cache && await asPromise(ldb.transaction([STORE], 'readonly').objectStore(STORE).get(missing[i]));
                if (kept) { have.set(kept.id, kept); continue; }
                const rec = await asPromise(mainStore().get(missing[i]));
                if (!rec) continue;
                const lite = await liteOf(rec);
                await asPromise(ldb.transaction([STORE], 'readwrite').objectStore(STORE).put(lite));
                have.set(lite.id, lite);
            }
            cache = new Map(keys.filter(k => have.has(k)).map(k => { const l = have.get(k); return [k, l instanceof Item ? l : new Item(l)]; }));
            return [...cache.values()];
        })().finally(() => { syncing = null; });
        return syncing;
    }

    // Debug Log: memory in use when History is opened or reloaded on screen (Chrome's performance.memory).
    function logMemory(count) {
        if (typeof dlog !== 'function' || document.getElementById('view-gal')?.classList.contains('hidden')) return;
        const m = performance && performance.memory;
        dlog(`History: ${count} image${count === 1 ? '' : 's'}${m ? `, memory ${Math.round(m.usedJSHeapSize / 1048576)} MB of ${Math.round(m.jsHeapSizeLimit / 1048576)} MB` : ''}`);
    }

    // An image's saved-to-device key (imageDataKey(), utils.js): from its light copy, or read once and kept there.
    async function keyOf(id) {
        const ldb = await open();
        if (!ldb) return '';
        const lite = await asPromise(ldb.transaction([STORE], 'readonly').objectStore(STORE).get(id));
        if (lite && lite.key) return lite.key;
        const data = await load(id);
        if (!data) return '';
        const key = imageDataKey(data);
        if (lite) await asPromise(ldb.transaction([STORE], 'readwrite').objectStore(STORE).put({ ...lite, key }));
        if (cache && cache.has(id)) cache.get(id).key = key;
        return key;
    }
    window.GalleryLite = { list, add, load, keyOf, prefetch: id => { load(id); }, settle, logMemory, _full: full };
})();
