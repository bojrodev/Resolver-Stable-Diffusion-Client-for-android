// Backup & Restore (Config > System Settings): BACK UP saves the ticked parts as one .zip (or that part's own file;
// History favourites always as a .zip);
// RESTORE asks which parts of a backup to restore.
(function () {
    // A-Z (Ollie, 7.4-checkpoint24).
    const PARTS = [
        { id: 'civitai', name: 'Civitai API Key', sub: 'Saved as plain text in the backup', icon: 'key-round' },
        { id: 'comfy', name: 'Comfy Templates', sub: 'Saved ComfyUI workflows', icon: 'workflow' },
        { id: 'favs', name: 'History Favorites', sub: 'Favorite images', icon: 'star' },
        { id: 'lora', name: 'LoRA Data', sub: 'Settings, names, thumbnails, variants, groups', icon: 'layers' },
        { id: 'presets', name: 'Presets', sub: 'img2img presets and favorites', icon: 'images' },
        { id: 'settings', name: 'Settings', sub: 'Every app option', icon: 'settings' },
        { id: 'styles', name: 'Styles', sub: 'Styles, favorites and thumbnails', icon: 'palette' },
        { id: 'wildcards', name: 'Wildcards', sub: 'Wildcards, favorites, groups and library links', icon: 'shuffle' },
    ];
    const CIVITAI_KEY = 'bojroCivitaiKey';
    const WILDCARDS_KEY = 'bojroWildcards';
    const PRESETS_KEY = 'bojroImg2imgPresets';
    const STYLES_KEY = 'resolver_styles_fallback', COUPLE_KEY = 'resolver_couple_styles';
    const WC_EXTRA = ['bojroWcFavs', 'bojroWcGroups', 'bojroWcLinks'], STYLE_EXTRA = ['bojroStyleFavs'], PRESET_EXTRA = ['bojroPresetFavs'];
    // Not backed up: History favourites (image numbers, which a fresh install gives to other images), the queue and a running
    // job's flag, recent lists and caches, and the Civitai API key.
    const SKIP = ['bojroCivitaiKey', 'bojroGalFavs', 'bojroQueueState', 'bojroJobRunning', 'bojroLoraNameCache', 'bojroEmbeddingNames', 'bojroDataUsageHistory',
        'bojroDescribeRecent', 'bojroWcRecent', 'bojroSceneReplay'];
    const LV = () => window.LoraVariants;
    // Which part a saved key belongs to: settings unless it's one of the others'.
    const partOfKey = k => (k === PRESETS_KEY ? 'presets' : k === STYLES_KEY || k === COUPLE_KEY ? 'styles' : k === WILDCARDS_KEY ? 'wildcards'
        : WC_EXTRA.includes(k) ? 'wildcards-extra' : STYLE_EXTRA.includes(k) ? 'styles-extra' : PRESET_EXTRA.includes(k) ? 'presets-extra' : SKIP.includes(k) ? 'skip' : LV() && LV().isBackupKey(k) ? 'lora' : 'settings');
    const extrasOf = keys => { const o = {}; keys.forEach(k => { const v = localStorage.getItem(k); if (v !== null) o[k] = v; }); return o; };
    const readExtras = (j, keys) => { const o = {}; if (isObj(j) && isObj(j.extras)) keys.forEach(k => { if (typeof j.extras[k] === 'string') o[k] = j.extras[k]; }); return o; };
    const comfyOn = () => !!(document.getElementById('cfgShowComfy') || {}).checked;
    const version = () => (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '');
    const stamp = () => { const iso = new Date().toISOString(); return iso.slice(0, 10).replace(/-/g, '') + iso.slice(11, 19).replace(/:/g, ''); };
    const enc = obj => new TextEncoder().encode(JSON.stringify(obj, null, 2));
    const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
    const toast = text => { if (typeof Toast !== 'undefined') Toast.show({ text, duration: 'short' }); };
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ---- each part's contents ----
    function settingsPayload() {
        const settings = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && partOfKey(k) === 'settings') settings[k] = localStorage.getItem(k);
        }
        return { app: 'Resolver', appVersion: version(), exportedAt: new Date().toISOString(), settings };
    }
    function presetsPayload() {
        return { app: 'Resolver', type: 'img2img-presets', appVersion: version(), exportedAt: new Date().toISOString(), presets: typeof loadImg2imgPresets === 'function' ? loadImg2imgPresets() : {}, extras: extrasOf(PRESET_EXTRA) };
    }
    async function stylesPayload() {
        let styles = [];
        try { styles = JSON.parse(localStorage.getItem(STYLES_KEY) || '[]'); } catch (e) {}
        const thumbs = window.StyleManager ? await window.StyleManager.allThumbs() : {};
        return { app: 'Resolver', type: 'styles', appVersion: version(), exportedAt: new Date().toISOString(), styles: Array.isArray(styles) ? styles : [], thumbs, extras: extrasOf(STYLE_EXTRA) };
    }
    // Couple styles (Forge Couple), their own file beside the styles.
    function couplePayload() {
        let list = [];
        try { list = JSON.parse(localStorage.getItem(COUPLE_KEY) || '[]'); } catch (e) {}
        return { app: 'Resolver', type: 'couple-styles', appVersion: version(), exportedAt: new Date().toISOString(), coupleStyles: Array.isArray(list) ? list : [] };
    }
    const hasCouple = () => couplePayload().coupleStyles.length > 0;

    function wildcardsPayload() {
        return { app: 'Resolver', type: 'wildcards', appVersion: version(), exportedAt: new Date().toISOString(), wildcards: window.Wildcards ? Wildcards.backupList() : [], extras: extrasOf(WC_EXTRA) };
    }
    // Comfy templates (IndexedDB "comfy_templates": { name, data, date }).
    const store = (name, mode) => (typeof db !== 'undefined' && db ? db.transaction([name], mode).objectStore(name) : null);
    const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    async function comfyPayload() {
        const st = store('comfy_templates', 'readonly');
        const templates = st ? await req(st.getAll()) : [];
        return { app: 'Resolver', type: 'comfy-templates', appVersion: version(), exportedAt: new Date().toISOString(), templates };
    }
    function readComfy(payload) {
        const ok = isObj(payload) && payload.app === 'Resolver' && payload.type === 'comfy-templates' && Array.isArray(payload.templates)
            && payload.templates.every(t => isObj(t) && typeof t.name === 'string' && typeof t.data === 'string');
        return ok ? payload.templates : null;
    }
    // History favourites: the images themselves (favorites/N.png ...) and what History keeps with them (favorites.json).
    const favIds = () => (window.GalleryFavs ? [...GalleryFavs.ids()] : []);
    async function favRecords() {
        const st = store('images', 'readonly');
        if (!st) return [];
        return (await Promise.all(favIds().map(id => req(st.get(id)).catch(() => null)))).filter(r => r && typeof r.data === 'string');
    }
    async function favSummary() {
        const recs = await favRecords();
        const mb = recs.reduce((a, r) => a + r.data.length * 0.75, 0) / 1048576;
        return { n: recs.length, text: recs.length ? `${recs.length} image${recs.length === 1 ? '' : 's'}, ${mb < 1 ? 'under 1 MB' : 'about ' + Math.round(mb) + ' MB'}` : 'No favorites' };
    }
    const b64ToBytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    async function favFiles() {
        const files = [], images = [];
        (await favRecords()).forEach((r, i) => {
            const m = r.data.match(/^(data:([^;,]+)(?:;[^,]*)?),(.*)$/);
            const head = m ? m[1] : '', mime = m ? m[2] : 'image/png', body = m ? m[3] : r.data;
            const file = `favorites/${i + 1}.${{ 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mime] || 'png'}`;
            files.push({ name: file, data: b64ToBytes(body) });
            const meta = { file, head };
            ['date', 'ts', 'upscale', 'badges', 'wc'].forEach(k => { if (r[k] !== undefined) meta[k] = r[k]; });
            images.push(meta);
        });
        files.unshift({ name: 'favorites.json', data: enc({ app: 'Resolver', type: 'history-favorites', appVersion: version(), exportedAt: new Date().toISOString(), images }) });
        return files;
    }
    async function restoreFavs(fav) {
        const have = new Set(((window.GalleryLite && await GalleryLite.list()) || []).map(it => it.key));
        const ids = window.GalleryFavs ? GalleryFavs.ids() : new Set();
        for (const meta of fav.images) {
            const bytes = fav.files[meta.file];
            if (!bytes) continue;
            const data = (meta.head ? meta.head + ',' : '') + LV().bytesToB64(bytes);
            if (typeof imageDataKey === 'function' && have.has(imageDataKey(data))) continue;
            const thumbnail = typeof generateThumbnail === 'function' ? await generateThumbnail(data) : null;
            const rec = { data, thumbnail, date: meta.date || new Date().toLocaleString(), ts: meta.ts || Date.now() };
            ['upscale', 'badges', 'wc'].forEach(k => { if (meta[k] !== undefined) rec[k] = meta[k]; });
            const id = await req(store('images', 'readwrite').add(rec));
            if (window.GalleryLite) await GalleryLite.add({ ...rec, id });
            ids.add(id);
        }
        if (window.GalleryFavs) GalleryFavs.save(ids);
    }
    async function backupWildcards() {
        try {
            await saveFile(`resolver-wildcards-${stamp()}.json`, enc(wildcardsPayload()), 'application/json');
        } catch (e) {
            await window.appAlert('Backup failed: ' + e.message, { title: 'Backup Failed', danger: true });
        }
    }

    // Saved to Documents (or downloaded, outside the app).
    async function saveFile(name, bytes, mime) {
        const fs = typeof Filesystem !== 'undefined' ? Filesystem : null;
        if (fs) {
            await LV().writeBig(fs, name, bytes, 'DOCUMENTS');
            if (typeof Toast !== 'undefined' && Toast.dismiss) Toast.dismiss('Backing up...');
            toast('Saved to Documents');
            return;
        }
        const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }
    async function backupStyles() {
        try {
            const t = stamp();
            await saveFile(`resolver-styles-${t}.json`, enc(await stylesPayload()), 'application/json');
            if (hasCouple()) await saveFile(`resolver-couple-styles-${t}.json`, enc(couplePayload()), 'application/json');
        } catch (e) {
            await window.appAlert('Backup failed: ' + e.message, { title: 'Backup Failed', danger: true });
        }
    }
    async function backupComfy() {
        try {
            await saveFile(`resolver-comfy-templates-${stamp()}.json`, enc(await comfyPayload()), 'application/json');
        } catch (e) {
            await window.appAlert('Backup failed: ' + e.message, { title: 'Backup Failed', danger: true });
        }
    }
    async function backupParts(ids) {
        // One part: its usual file (History favourites always come as a .zip).
        if (ids.length === 1 && ids[0] !== 'favs' && ids[0] !== 'civitai') {
            const one = { presets: () => window.exportImg2imgPresets(), lora: () => LV().backup(), settings: () => window.backupAppSettings(), styles: backupStyles, wildcards: backupWildcards, comfy: backupComfy }[ids[0]];
            return one();
        }
        // A big one takes a while: say so until it's saved.
        const busy = typeof Toast !== 'undefined' ? (Toast.show({ text: 'Backing up...', duration: 'long' }), () => { if (Toast.dismiss) Toast.dismiss('Backing up...'); }) : () => {};
        try {
            const files = [{ name: 'manifest.json', data: enc({ app: 'Resolver', kind: 'backup', appVersion: version(), exportedAt: new Date().toISOString(), parts: ids }) }];
            if (ids.includes('presets')) files.push({ name: 'presets.json', data: enc(presetsPayload()) });
            if (ids.includes('settings')) files.push({ name: 'settings.json', data: enc(settingsPayload()) });
            if (ids.includes('styles')) files.push({ name: 'styles.json', data: enc(await stylesPayload()) });
            if (ids.includes('styles') && hasCouple()) files.push({ name: 'couple-styles.json', data: enc(couplePayload()) });
            if (ids.includes('wildcards')) files.push({ name: 'wildcards.json', data: enc(wildcardsPayload()) });
            if (ids.includes('lora')) (await LV().backupFiles()).forEach(f => files.push({ name: 'lora/' + f.name, data: f.data }));
            if (ids.includes('comfy')) files.push({ name: 'comfy-templates.json', data: enc(await comfyPayload()) });
            if (ids.includes('favs')) (await favFiles()).forEach(f => files.push(f));
            if (ids.includes('civitai') && localStorage.getItem(CIVITAI_KEY)) files.push({ name: 'civitai-key.json', data: enc({ app: 'Resolver', type: 'civitai-key', key: localStorage.getItem(CIVITAI_KEY) }) });
            await saveFile(`resolver-backup-${stamp()}.zip`, LV().makeZip(files), 'application/zip');
            busy();
        } catch (e) {
            busy();
            await window.appAlert('Backup failed: ' + ((e && e.message) || e), { title: 'Backup Failed', danger: true });
        }
    }

    // ---- the window ----
    // rows: { id: true (ticked), false (unticked) or null (not available) }. done(ids) on the action button.
    function openWindow(title, sub, rows, okText, danger, done, subs = {}) {
        const parts = PARTS.filter(p => p.id !== 'comfy' || comfyOn());
        document.getElementById('backupWindow')?.remove();
        const modal = document.createElement('div');
        modal.id = 'backupWindow';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 360px;">
                <div class="modal-header"><h3>${esc(title)}</h3></div>
                ${sub ? `<div class="br-pick-from">${sub}</div>` : ''}
                <div class="col" style="gap: 8px;">
                    ${parts.map(p => `<div class="br-pick${rows[p.id] === null ? ' off' : ''}" data-part="${p.id}">
                        <div class="br-pick-icon"><i data-lucide="${p.icon}" width="17" height="17"></i></div>
                        <div class="br-pick-text"><div class="br-pick-name">${p.name}</div><div class="br-pick-sub">${esc(subs[p.id] || (rows[p.id] === null ? 'Not in this backup' : p.sub))}</div></div>
                        ${rows[p.id] === null ? '' : '<span class="lg-check"></span>'}
                    </div>`).join('')}
                </div>
                <div class="row" style="gap: 10px; margin-top: 14px;">
                    <button type="button" class="btn-small btn-cancel" style="flex: 1;" onclick="Backup.close()">CANCEL</button>
                    <button type="button" class="btn-small ${danger ? 'br-danger' : 'btn-save'}" id="backupWindowOk" style="flex: 1;">${okText}</button>
                </div>
            </div>`;
        let downOnBackdrop = false;
        modal.addEventListener('pointerdown', e => { downOnBackdrop = e.target === modal; });
        modal.addEventListener('click', e => { if (downOnBackdrop && e.target === modal) close(); downOnBackdrop = false; });
        document.body.appendChild(modal);
        const ticked = new Set(parts.filter(p => rows[p.id]).map(p => p.id));
        const ok = modal.querySelector('#backupWindowOk');
        const paint = () => {
            modal.querySelectorAll('.br-pick:not(.off)').forEach(row => {
                const on = ticked.has(row.dataset.part);
                row.classList.toggle('on', on);
                row.querySelector('.lg-check').classList.toggle('on', on);
                row.querySelector('.lg-check').innerHTML = on ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' : '';
            });
            ok.disabled = !ticked.size;
        };
        modal.querySelectorAll('.br-pick:not(.off)').forEach(row => {
            row.onclick = () => { const id = row.dataset.part; if (ticked.has(id)) ticked.delete(id); else ticked.add(id); paint(); };
        });
        ok.onclick = () => { const ids = parts.map(p => p.id).filter(id => ticked.has(id)); close(); done(ids); };
        paint();
        if (window.lucide) lucide.createIcons();
    }
    function close() {
        document.getElementById('backupWindow')?.remove();
    }

    // History Favorites starts unticked (it can be large); greyed out with none.
    async function openBackup() {
        const fav = await favSummary();
        // The Civitai key starts unticked; greyed out with none set.
        const key = !!localStorage.getItem(CIVITAI_KEY);
        openWindow('Back Up', '', { presets: true, lora: true, settings: true, styles: true, wildcards: true, comfy: true, favs: fav.n ? false : null, civitai: key ? false : null }, 'BACK UP', false, backupParts,
            { favs: fav.text, ...(key ? {} : { civitai: 'No key set' }) });
    }

    // ---- restoring ----
    function readSettings(payload) {
        const s = isObj(payload) && payload.app === 'Resolver' && isObj(payload.settings) ? payload.settings : null;
        return s && Object.keys(s).length && Object.values(s).every(v => typeof v === 'string') ? s : null;
    }
    function readPresets(payload) {
        if (!isObj(payload) || payload.app !== 'Resolver' || payload.type !== 'img2img-presets' || !isObj(payload.presets)) return null;
        return payload.presets;
    }
    function readWildcards(payload) {
        const ok = isObj(payload) && payload.app === 'Resolver' && payload.type === 'wildcards' && Array.isArray(payload.wildcards)
            && payload.wildcards.every(w => isObj(w) && typeof w.name === 'string' && Array.isArray(w.lines) && w.lines.every(l => typeof l === 'string'));
        return ok ? payload.wildcards : null;
    }
    function readStyles(payload) {
        return isObj(payload) && payload.app === 'Resolver' && payload.type === 'styles' && Array.isArray(payload.styles) ? payload.styles : null;
    }
    function readCouple(payload) {
        const ok = isObj(payload) && payload.app === 'Resolver' && payload.type === 'couple-styles' && Array.isArray(payload.coupleStyles)
            && payload.coupleStyles.every(s => isObj(s) && typeof s.name === 'string' && isObj(s.fc) && Array.isArray(s.fc.regions));
        return ok ? payload.coupleStyles : null;
    }
    // A styles backup's thumbnails ({ name: JPEG data URL }); null for one made before they were backed up.
    function readStyleThumbs(payload) {
        if (!isObj(payload) || !isObj(payload.thumbs)) return null;
        const out = {};
        Object.entries(payload.thumbs).forEach(([n, url]) => { if (typeof url === 'string' && /^data:image\/jpeg;base64,/.test(url)) out[n] = url; });
        return out;
    }
    // An older settings backup holds every saved key, the other parts' too.
    function fromSettings(all) {
        const out = {};
        const own = {}, lora = {};
        Object.entries(all).forEach(([k, v]) => {
            const part = partOfKey(k);
            if (part === 'settings') own[k] = v;
            else if (part === 'lora') lora[k] = v;
            else if (part === 'presets') { try { const p = JSON.parse(v); if (isObj(p)) out.presets = p; } catch (e) {} }
            else if (part === 'styles') { try { const s = JSON.parse(v); if (Array.isArray(s)) { if (k === COUPLE_KEY) out.coupleStyles = s; else out.styles = s; } } catch (e) {} }
            else if (part === 'wildcards') { try { const w = JSON.parse(v); if (Array.isArray(w)) out.wildcards = w; } catch (e) {} }
            else if (part === 'wildcards-extra' || part === 'styles-extra') (out.oldExtras = out.oldExtras || {})[k] = v;
        });
        if (Object.keys(own).length) out.settings = own;
        if (Object.keys(lora).length) out.lora = { keys: lora };
        return out;
    }
    // What a file holds, by part: { presets: {...}, settings: {...}, styles: [...], lora: { backup } or { keys } }, and
    // when it was made; null if it isn't one of this app's backups.
    async function readFile(file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const files = LV().readZip(bytes);
        const json = b => { try { return JSON.parse(new TextDecoder().decode(b)); } catch (e) { return null; } };
        if (files) {
            const manifest = files['manifest.json'] ? json(files['manifest.json']) : null;
            if (!isObj(manifest) || manifest.app !== 'Resolver') return null;
            const when = manifest.exportedAt;
            if (manifest.kind === 'lora-data') {
                const b = LV().readBackup(files);
                return b ? { when, parts: { lora: { backup: b } } } : null;
            }
            if (manifest.kind !== 'backup') return null;
            const parts = {};
            if (files['presets.json']) {
                // Checked as a presets file is, unless there were none.
                const j = json(files['presets.json']);
                const p = readPresets(j);
                if (!p || (Object.keys(p).length && !img2imgPresetsFromFile(JSON.stringify(j)))) return null;
                parts.presets = p;
                parts.presetExtras = readExtras(j, PRESET_EXTRA);
            }
            if (files['civitai-key.json']) {
                const j = json(files['civitai-key.json']);
                if (!isObj(j) || j.type !== 'civitai-key' || typeof j.key !== 'string' || !j.key.trim() || j.key.length > 500) return null;
                parts.civitai = j.key.trim();
            }
            if (files['settings.json']) { const s = readSettings(json(files['settings.json'])); if (!s) return null; parts.settings = s; }
            if (files['styles.json']) { const j = json(files['styles.json']); const s = readStyles(j); if (!s) return null; parts.styles = s; parts.styleThumbs = readStyleThumbs(j); parts.styleExtras = readExtras(j, STYLE_EXTRA); }
            if (files['couple-styles.json']) { const c = readCouple(json(files['couple-styles.json'])); if (!c) return null; parts.coupleStyles = c; }
            if (files['wildcards.json']) { const j = json(files['wildcards.json']); const w = readWildcards(j); if (!w) return null; parts.wildcards = w; parts.wildcardExtras = readExtras(j, WC_EXTRA); }
            if (files['comfy-templates.json']) { const c = readComfy(json(files['comfy-templates.json'])); if (!c) return null; parts.comfy = c; }
            if (files['favorites.json']) {
                const j = json(files['favorites.json']);
                if (!isObj(j) || j.type !== 'history-favorites' || !Array.isArray(j.images) || !j.images.every(m => isObj(m) && typeof m.file === 'string' && typeof m.head === 'string')) return null;
                parts.favs = { images: j.images, files };
            }
            const loraFiles = {};
            Object.keys(files).filter(n => n.startsWith('lora/')).forEach(n => { loraFiles[n.slice(5)] = files[n]; });
            if (Object.keys(loraFiles).length) { const b = LV().readBackup(loraFiles); if (!b) return null; parts.lora = { backup: b }; }
            return Object.keys(parts).length ? { when, parts } : null;
        }
        let payload = null;
        try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { return null; }
        const when = isObj(payload) ? payload.exportedAt : null;
        // A presets file, labelled or an older unlabelled one, each entry checked (img2imgPresetsFromFile(), network.js).
        const presets = img2imgPresetsFromFile(new TextDecoder().decode(bytes));
        if (presets) return { when, parts: { presets, presetExtras: readExtras(payload, PRESET_EXTRA) } };
        const wildcards = readWildcards(payload);
        if (wildcards) return { when, parts: { wildcards, wildcardExtras: readExtras(payload, WC_EXTRA) } };
        const styles = readStyles(payload);
        if (styles) return { when, parts: { styles, styleThumbs: readStyleThumbs(payload), styleExtras: readExtras(payload, STYLE_EXTRA) } };
        const comfy = readComfy(payload);
        if (comfy) return { when, parts: { comfy } };
        const coupleStyles = readCouple(payload);
        if (coupleStyles) return { when, parts: { coupleStyles } };
        const settings = readSettings(payload);
        if (settings) { const parts = fromSettings(settings); if (parts.oldExtras && !parts.settings) parts.settings = {}; return Object.keys(parts).length ? { when, parts } : null; }
        return null;
    }
    async function restoreParts(found, ids) {
        const failed = [];
        // Each part on its own, so one that fails doesn't stop the rest.
        const part = async (id, fn) => { if (!ids.includes(id)) return; try { await fn(); } catch (e) { failed.push((PARTS.find(x => x.id === id) || { name: id }).name); } };
        try {
            const p = found.parts;
            await part('settings', () => {
                const current = [];
                for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && partOfKey(k) === 'settings') current.push(k); }
                current.forEach(k => localStorage.removeItem(k));
                Object.entries(p.settings).forEach(([k, v]) => { if (partOfKey(k) === 'settings') localStorage.setItem(k, v); });
                // An older backup kept wildcard and style favourites with the settings.
                const old = { ...(p.oldExtras || {}) };
                Object.entries(p.settings).forEach(([k, v]) => { if (/-extra$/.test(partOfKey(k))) old[k] = v; });
                Object.entries(old).forEach(([k, v]) => {
                    const mine = { 'wildcards-extra': p.wildcardExtras, 'styles-extra': p.styleExtras, 'presets-extra': p.presetExtras }[partOfKey(k)];
                    if (!(mine && ids.includes(partOfKey(k).replace('-extra', '')) && k in mine)) localStorage.setItem(k, v);
                });
            });
            await part('presets', () => {
                localStorage.setItem(PRESETS_KEY, JSON.stringify(p.presets));
                // A file from before favorites leaves the app's as they are.
                if (p.presetExtras && Object.keys(p.presetExtras).length) { PRESET_EXTRA.forEach(k => localStorage.removeItem(k)); Object.entries(p.presetExtras).forEach(([k, v]) => localStorage.setItem(k, v)); }
            });
            await part('civitai', () => localStorage.setItem(CIVITAI_KEY, p.civitai));
            await part('styles', async () => {
                // A couple styles file restores those alone; a styles backup without them leaves the app's as they are.
                if (p.styles) localStorage.setItem(STYLES_KEY, JSON.stringify(p.styles));
                if (p.coupleStyles) localStorage.setItem(COUPLE_KEY, JSON.stringify(p.coupleStyles));
                // An older backup without thumbnails leaves the app's as they are.
                if (p.styleThumbs && window.StyleManager) await window.StyleManager.restoreThumbs(p.styleThumbs);
                if (p.styleExtras && Object.keys(p.styleExtras).length) { STYLE_EXTRA.forEach(k => localStorage.removeItem(k)); Object.entries(p.styleExtras).forEach(([k, v]) => localStorage.setItem(k, v)); }
            });
            await part('wildcards', () => {
                if (window.Wildcards) Wildcards.restoreList(p.wildcards);
                if (p.wildcardExtras && Object.keys(p.wildcardExtras).length) { WC_EXTRA.forEach(k => localStorage.removeItem(k)); Object.entries(p.wildcardExtras).forEach(([k, v]) => localStorage.setItem(k, v)); }
            });
            await part('comfy', async () => {
                const st = store('comfy_templates', 'readwrite');
                await req(st.clear());
                for (const t of p.comfy) await req(store('comfy_templates', 'readwrite').put({ name: t.name, data: t.data, date: t.date || '' }));
            });
            await part('favs', () => restoreFavs(p.favs));
            await part('lora', async () => {
                if (p.lora.backup) await LV().restoreBackup(p.lora.backup);
                else {
                    LV().backupKeys().forEach(k => localStorage.removeItem(k));
                    Object.entries(p.lora.keys).forEach(([k, v]) => localStorage.setItem(k, v));
                }
            });
            await window.appAlert(failed.length ? `Couldn't restore: ${failed.join(', ')}.` : '', { title: 'Restore Complete' });
            try { sessionStorage.setItem('bojroReturnTo', '.br-btns'); } catch (e) {}
            if (typeof paintNativeBg === 'function') paintNativeBg();
            window.location.reload();
        } catch (e) {
            await window.appAlert('Restore failed: ' + e.message, { title: 'Restore Failed', danger: true });
        }
    }
    function openRestore() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zip,.json,application/zip,application/json';
        input.className = 'hidden';
        input.onchange = async () => {
            const file = input.files && input.files[0];
            input.remove();
            if (!file) return;
            let found = null;
            try { found = await readFile(file); } catch (e) { found = null; }
            if (!found) { toast('Incompatible backup'); return; }
            const rows = {};
            PARTS.forEach(part => { rows[part.id] = found.parts[part.id] || (part.id === 'styles' && found.parts.coupleStyles) ? true : null; });
            const subs = found.parts.favs ? { favs: `${found.parts.favs.images.length} image${found.parts.favs.images.length === 1 ? '' : 's'}` } : {};
            const when = found.when ? new Date(found.when).toLocaleString() : '';
            openWindow('Restore', `From <b>${esc(file.name)}</b>${when ? `<br>${esc(when)}` : ''}`, rows, 'RESTORE', true, ids => restoreParts(found, ids), subs);
        };
        document.body.appendChild(input);
        input.click();
    }

    window.Backup = { openBackup, openRestore, close, settingsPayload, _readFile: readFile, _backupParts: backupParts, _restoreParts: restoreParts };
})();
