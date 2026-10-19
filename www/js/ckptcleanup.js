// Checkpoint half of Config > "Clean Up Model Data" (loracleanup.js): finds checkpoints the app holds settings
// for (Checkpoint Manager, Low Bits, cached thumbnail) that are no longer on the server.
// Compares only against a list fetched live from the server and throws on a failed or empty answer.
(function () {
    const LOW_BITS_PREFIX = 'bojro_low_bits_model_';

    function serverHost() {
        let host = '';
        if (typeof buildWebUIUrl === 'function') host = buildWebUIUrl();
        if (!host && typeof HOST !== 'undefined') host = HOST;
        return host || '';
    }

    // Lowercase hash-free keys of every checkpoint on the server; throws if the list can't be trusted.
    async function fetchInstalledKeys() {
        const host = serverHost();
        if (!host) throw new Error('The app is not linked to a server.');
        const headers = typeof getHeaders === 'function' ? getHeaders() : {};
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            try {
                await fetch(`${host}/sdapi/v1/refresh-checkpoints`, { method: 'POST', headers, signal: controller.signal });
            } catch (e) { /* the GET decides */ }
            const res = await fetch(`${host}/sdapi/v1/sd-models`, { headers, signal: controller.signal });
            if (!res.ok) throw new Error(`The server answered with an error (${res.status}).`);
            const data = await res.json();
            if (!Array.isArray(data)) throw new Error('The server sent a checkpoint list in a format that was not recognised.');
            if (data.length === 0) throw new Error('The server reports no checkpoints at all, so there is nothing safe to compare against.');
            const keys = new Set();
            data.forEach(m => { if (m && m.title) keys.add(checkpointConfigKey(m.title).toLowerCase().trim()); });
            if (keys.size === 0) throw new Error('The server sent a checkpoint list with no names in it.');
            return keys;
        } catch (e) {
            if (e && e.name === 'AbortError') throw new Error('The server took too long to answer.');
            if (e instanceof TypeError) throw new Error('Could not reach the server.');
            throw e;
        } finally {
            clearTimeout(timer);
        }
    }

    // Everything stored per checkpoint, keyed by lowercase hash-free name: { name, kinds, configKeys, lowBitsKeys }.
    function collectCustomData() {
        const found = new Map();
        const entry = (name) => {
            const key = name.toLowerCase().trim();
            if (!found.has(key)) found.set(key, { name, kinds: new Set(), configKeys: [], lowBitsKeys: [] });
            return found.get(key);
        };
        Object.keys(readModulePairs()).forEach(k => {
            const e = entry(k);
            e.kinds.add('settings');
            e.configKeys.push(k);
        });
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || !k.startsWith(LOW_BITS_PREFIX)) continue;
            const e = entry(k.slice(LOW_BITS_PREFIX.length));
            e.kinds.add('Low Bits');
            e.lowBitsKeys.push(k);
        }
        return found;
    }

    function findStale(installed) {
        const stale = [];
        collectCustomData().forEach((info, key) => {
            if (!installed.has(key)) stale.push({ key, name: info.name, kinds: [...info.kinds], configKeys: info.configKeys, lowBitsKeys: info.lowBitsKeys });
        });
        stale.sort((a, b) => a.name.localeCompare(b.name));
        return stale;
    }

    function clearData(stale) {
        const pairs = readModulePairs();
        stale.forEach(s => {
            s.configKeys.forEach(k => delete pairs[k]);
            s.lowBitsKeys.forEach(k => localStorage.removeItem(k));
        });
        saveModulePairsToStorage(pairs);
        // Cached thumbnails (LoRA thumbnail cache, 'ckpt_' names).
        const LM = window.LoraManager;
        if (LM && LM.metaCache) {
            const gone = new Set(stale.map(s => s.key));
            Object.keys(LM.metaCache).forEach(n => {
                if (!n.startsWith('ckpt_') || !gone.has(n.slice(5).toLowerCase().trim())) return;
                delete LM.metaCache[n];
                delete LM.thumbnailMemCache[n];
                if (LM.fs) {
                    const file = `${LM.CACHE_DIR}/${n.replace(/[^a-zA-Z0-9.\-_]/g, '_')}.jpg`;
                    LM.fs.deleteFile({ path: file, directory: 'CACHE' }).catch(() => {});
                }
            });
            if (typeof LM.saveMetaCache === 'function') LM.saveMetaCache();
        }
        if (typeof updateCheckpointManagerCount === 'function') updateCheckpointManagerCount();
    }

    // Used by Clean Up Model Data (loracleanup.js).
    window.__ckptCleanup = { fetchInstalledKeys, findStale, clearData, collectCustomData };
})();
