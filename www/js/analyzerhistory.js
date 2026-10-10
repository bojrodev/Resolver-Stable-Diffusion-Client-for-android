// Analyzer history: the last MAX_ENTRIES analysed images, kept on the device in their own
// IndexedDB database so one can be reopened later. Each entry keeps the original file plus a
// thumbnail. Storage failures are ignored so analysing an image never depends on it.
(function () {
    'use strict';

    const DB_NAME = 'bojro_analyzer_history';
    const STORE = 'entries';
    const MAX_ENTRIES = 20;
    const THUMB_EDGE = 160;

    // ---- storage ----

    let dbPromise = null;
    function openDb() {
        if (!dbPromise) {
            dbPromise = new Promise((resolve) => {
                try {
                    const req = indexedDB.open(DB_NAME, 1);
                    req.onupgradeneeded = () => {
                        const db = req.result;
                        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
                    };
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => resolve(null);
                    req.onblocked = () => resolve(null);
                } catch (e) {
                    resolve(null);
                }
            });
        }
        return dbPromise;
    }

    // Runs one operation in a transaction and resolves once it has completed.
    function run(db, mode, op) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            let result;
            const request = op(tx.objectStore(STORE));
            if (request) request.onsuccess = () => { result = request.result; };
            tx.oncomplete = () => resolve(result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    }

    // Identity of an image = hash of its bytes, so re-analysing the same image just moves it to the front.
    async function idFor(blob) {
        const bytes = await blob.arrayBuffer();
        try {
            const digest = await crypto.subtle.digest('SHA-256', bytes);
            return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            // No SubtleCrypto (an insecure context): FNV-1a over the whole file instead
            let h = 0x811c9dc5;
            const view = new Uint8Array(bytes);
            for (let i = 0; i < view.length; i++) { h ^= view[i]; h = Math.imul(h, 0x01000193) >>> 0; }
            return `fnv${h.toString(16)}-${view.length}`;
        }
    }

    async function makeThumb(blob) {
        const url = URL.createObjectURL(blob);
        try {
            const img = new Image();
            await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
            const scale = Math.min(1, THUMB_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff'; // JPEG has no transparency
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/jpeg', 0.7);
        } catch (e) {
            return '';
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    // Keeps only the newest MAX_ENTRIES.
    async function trim(db) {
        const all = await run(db, 'readonly', s => s.getAll());
        if (!all || all.length <= MAX_ENTRIES) return;
        const excess = all.sort((a, b) => a.ts - b.ts).slice(0, all.length - MAX_ENTRIES);
        await run(db, 'readwrite', s => { excess.forEach(e => s.delete(e.id)); return null; });
    }

    async function save(blob) {
        try {
            const db = await openDb();
            if (!db || !blob) return;
            const id = await idFor(blob);
            const existing = await run(db, 'readonly', s => s.get(id));
            if (existing) {
                existing.ts = Date.now(); // already stored: just bring it to the front
                await run(db, 'readwrite', s => s.put(existing));
            } else {
                const thumb = await makeThumb(blob);
                // A plain Blob, not the File: drops the file name
                const stored = new Blob([blob], { type: blob.type });
                await run(db, 'readwrite', s => s.put({ id, ts: Date.now(), size: blob.size, thumb, blob: stored }));
            }
            await trim(db);
        } catch (e) { /* history is a convenience - never let it get in the way */ }
    }

    // Newest first. Thumbnails only - the images themselves stay in storage until one is opened.
    async function list() {
        try {
            const db = await openDb();
            if (!db) return [];
            const all = await run(db, 'readonly', s => s.getAll());
            return (all || []).sort((a, b) => b.ts - a.ts).map(e => ({ id: e.id, ts: e.ts, size: e.size, thumb: e.thumb }));
        } catch (e) {
            return [];
        }
    }

    async function get(id) {
        try {
            const db = await openDb();
            if (!db) return null;
            const entry = await run(db, 'readonly', s => s.get(id));
            return entry ? entry.blob : null;
        } catch (e) {
            return null;
        }
    }

    async function remove(id) {
        try {
            const db = await openDb();
            if (db) await run(db, 'readwrite', s => s.delete(id));
        } catch (e) {}
    }

    async function clear() {
        try {
            const db = await openDb();
            if (db) await run(db, 'readwrite', s => s.clear());
        } catch (e) {}
    }

    // ---- the sheet ----

    // "Just now", "12 min ago", "Today 14:05", "Yesterday", "3 days ago", "3 Oct"
    function describeAge(ts, now) {
        now = now || Date.now();
        const diff = now - ts;
        if (diff < 60 * 1000) return 'Just now';
        if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} min ago`;
        const d = new Date(ts);
        const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
        const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        if (ts >= startOfToday.getTime()) return `Today ${hhmm}`;
        const days = Math.floor((startOfToday.getTime() - ts) / 86400000) + 1;
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days} days ago`;
        return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}`;
    }

    // Synchronous, so it can be applied in the very same frame a dialog closes.
    function showEmptyState() {
        const grid = document.getElementById('anaHistoryGrid');
        grid.textContent = '';
        document.getElementById('anaHistoryTitle').textContent = 'Recent';
        document.getElementById('anaHistoryClearBtn').classList.add('hidden');
        const empty = document.createElement('div');
        empty.className = 'ana-history-empty';
        empty.textContent = 'Images you analyze are kept here.';
        grid.appendChild(empty);
    }

    async function renderGrid() {
        const grid = document.getElementById('anaHistoryGrid');
        const title = document.getElementById('anaHistoryTitle');
        const clearBtn = document.getElementById('anaHistoryClearBtn');
        const entries = await list();
        grid.textContent = '';
        // Kept short so the title fits on one line at phone width.
        title.textContent = entries.length ? `Recent (${entries.length})` : 'Recent';
        clearBtn.classList.toggle('hidden', entries.length === 0);

        if (!entries.length) {
            showEmptyState();
            return;
        }
        entries.forEach(entry => {
            const tile = document.createElement('div');
            tile.className = 'ana-history-tile';
            tile.addEventListener('click', () => window.openAnalyzerHistoryEntry(entry.id));

            const img = document.createElement('img');
            img.alt = '';
            if (entry.thumb) img.src = entry.thumb;
            tile.appendChild(img);

            const age = document.createElement('div');
            age.className = 'ana-history-age';
            age.textContent = describeAge(entry.ts);
            tile.appendChild(age);

            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'btn-icon glass-icon ana-history-del';
            del.title = 'Remove from history';
            del.textContent = '\u00d7';
            del.addEventListener('click', async (e) => {
                e.stopPropagation();
                await remove(entry.id);
                renderGrid();
            });
            tile.appendChild(del);
            grid.appendChild(tile);
        });
    }

    window.openAnalyzerHistory = async function () {
        document.getElementById('anaHistoryModal').classList.remove('hidden');
        await renderGrid();
    };

    window.closeAnalyzerHistory = function () {
        document.getElementById('anaHistoryModal').classList.add('hidden');
    };

    window.openAnalyzerHistoryEntry = async function (id) {
        const blob = await get(id);
        if (!blob) {
            if (typeof Toast !== 'undefined' && Toast) Toast.show({ text: 'That image is no longer stored', duration: 'short' });
            await renderGrid();
            return;
        }
        window.closeAnalyzerHistory();
        window.scrollTo({ top: 0, behavior: 'instant' });
        processImageForAnalysis(blob); // exactly as a fresh upload (and re-saves it, which brings it to the front)
    };

    window.clearAnalyzerHistory = async function () {
        const entries = await list();
        if (!entries.length) return;
        const ok = await window.appConfirm(`Remove all ${entries.length} recent analyses from this device?`, { title: 'Clear history', okText: 'CLEAR' });
        if (!ok) return;
        // Empty the grid in the same frame the dialog closes, before the database clear finishes.
        showEmptyState();
        await clear();
        await renderGrid();
    };

    // No IndexedDB at all: the entry points aren't offered
    if (!window.indexedDB) {
        ['anaHistoryBtn', 'anaHistoryBtnEmpty'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
    }

    window.AnalyzerHistory = { save, list, get, remove, clear, describeAge, MAX_ENTRIES };
})();
