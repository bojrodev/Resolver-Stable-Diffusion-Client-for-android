// Config > "Clean Up LoRA Data": finds LoRAs the app holds custom data for (custom name, edited config,
// ADetailer-link opt-out, favourite) that are no longer on the server, lists them, and clears that
// data after confirmation. It only compares against a list fetched live from the server, stops on a
// failed or empty answer, and re-fetches when the user confirms.
(function () {
    const FAV_PREFIX = 'bojroLoraFavs';

    function serverHost() {
        let host = '';
        if (typeof buildWebUIUrl === 'function') host = buildWebUIUrl();
        if (!host && typeof HOST !== 'undefined') host = HOST;
        return host || '';
    }

    function readJson(key, fallback) {
        try {
            const saved = localStorage.getItem(key);
            return saved ? JSON.parse(saved) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    // Returns a Set of lowercase LoRA names from the server, or throws if the list can't be trusted.
    async function fetchInstalledNames() {
        const host = serverHost();
        if (!host) throw new Error('The app is not linked to a server.');
        const headers = typeof getHeaders === 'function' ? getHeaders() : {};
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            // Asks Forge to rescan first (best effort), as the LoRA browser's REFRESH does.
            try {
                await fetch(`${host}/sdapi/v1/refresh-loras`, { method: 'POST', headers, signal: controller.signal });
            } catch (e) { /* the GET decides */ }
            const res = await fetch(`${host}/sdapi/v1/loras`, { headers, signal: controller.signal });
            if (!res.ok) throw new Error(`The server answered with an error (${res.status}).`);
            const data = await res.json();
            if (!Array.isArray(data)) throw new Error('The server sent a LoRA list in a format that was not recognised.');
            if (data.length === 0) throw new Error('The server reports no LoRAs at all, so there is nothing safe to compare against.');
            const names = new Set();
            data.forEach(l => {
                // Both name and alias count as installed.
                if (l && l.name) names.add(String(l.name).toLowerCase());
                if (l && l.alias) names.add(String(l.alias).toLowerCase());
            });
            if (names.size === 0) throw new Error('The server sent a LoRA list with no names in it.');
            return names;
        } catch (e) {
            if (e && e.name === 'AbortError') throw new Error('The server took too long to answer.');
            if (e instanceof TypeError) throw new Error('Could not reach the server.');
            throw e;
        } finally {
            clearTimeout(timer);
        }
    }

    // Everything the user set per LoRA, keyed by lowercase name: { name, kinds }.
    function collectCustomData() {
        const found = new Map();
        const add = (rawName, kind) => {
            const key = String(rawName).toLowerCase();
            if (!found.has(key)) found.set(key, { name: String(rawName), kinds: new Set() });
            found.get(key).kinds.add(kind);
        };
        const renames = (window.LoraManager && window.LoraManager.userRenames) || {};
        Object.keys(renames).forEach(n => add(n, 'custom name'));
        const linkOff = (window.LoraManager && window.LoraManager.loraLinkDisabled) || {};
        Object.keys(linkOff).forEach(n => add(n, 'ADetailer link off'));
        Object.keys(loraConfigs || {}).forEach(n => {
            // Entries without userEdited are cached sidecar copies, not user data.
            if (loraConfigs[n] && loraConfigs[n].userEdited) add(n, 'weight / trigger / overrides');
        });
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(FAV_PREFIX)) continue;
            const list = readJson(key, []);
            if (Array.isArray(list)) list.forEach(n => add(n, 'favourite'));
        }
        return found;
    }

    function findStale(installed) {
        const stale = [];
        collectCustomData().forEach((info, key) => {
            if (!installed.has(key)) stale.push({ key, name: info.name, kinds: [...info.kinds] });
        });
        stale.sort((a, b) => a.name.localeCompare(b.name));
        return stale;
    }

    // Removes the given names from every per-LoRA store, including cached copies.
    function clearData(staleKeys) {
        const gone = new Set(staleKeys);
        const isGone = n => gone.has(String(n).toLowerCase());
        const LM = window.LoraManager;

        if (LM) {
            Object.keys(LM.userRenames).filter(isGone).forEach(n => delete LM.userRenames[n]);
            localStorage.setItem('bojroLoraUserRenames', JSON.stringify(LM.userRenames));
            Object.keys(LM.loraLinkDisabled).filter(isGone).forEach(n => delete LM.loraLinkDisabled[n]);
            localStorage.setItem('bojroLoraLinkDisabled', JSON.stringify(LM.loraLinkDisabled));
            if (LM.nameCache) {
                Object.keys(LM.nameCache).filter(isGone).forEach(n => delete LM.nameCache[n]);
                LM.saveNameCache();
            }
        }
        Object.keys(loraConfigs).filter(isGone).forEach(n => delete loraConfigs[n]);
        localStorage.setItem('bojroLoraConfigs', JSON.stringify(loraConfigs));

        const favKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(FAV_PREFIX)) favKeys.push(key);
        }
        favKeys.forEach(key => {
            const list = readJson(key, null);
            if (!Array.isArray(list)) return;
            const kept = list.filter(n => !isGone(n));
            if (kept.length !== list.length) localStorage.setItem(key, JSON.stringify(kept));
        });
        // Reload the in-memory favourites from the cleaned storage.
        if (LM && typeof LM.loadLoraFavorites === 'function') LM.loadLoraFavorites();
    }

    function esc(s) {
        return typeof escapeHtmlAttr === 'function'
            ? escapeHtmlAttr(s)
            : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function closeModal() {
        document.getElementById('loraCleanupModal')?.remove();
        if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
    }
    window.closeLoraCleanup = closeModal;

    function showModal(stale) {
        document.getElementById('loraCleanupModal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'loraCleanupModal';
        modal.className = 'modal';
        const rows = stale.map(s => `
            <div style="padding:8px 10px; border:1px solid var(--border-color); border-radius:10px; background:rgba(255,255,255,0.02);">
                <div style="font-size:13px; font-weight:800; color:var(--text-main); word-break:break-word;">${esc(s.name)}</div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${esc(s.kinds.join(' · '))}</div>
            </div>`).join('');
        modal.innerHTML = `
            <div class="modal-content" style="max-height:85vh; display:flex; flex-direction:column;">
                <div class="modal-header">
                    <h3>Clean up LoRA data</h3>
                    <button type="button" class="close-btn" onclick="closeLoraCleanup()">×</button>
                </div>
                <div style="font-size:12px; color:var(--text-muted); margin:4px 0 10px;">
                    ${stale.length} LoRA${stale.length === 1 ? ' is' : 's are'} no longer on the server but still ${stale.length === 1 ? 'has' : 'have'} custom data in the app. Deleting clears that data for good.
                </div>
                <div id="loraCleanupList" class="col" style="gap:8px; overflow-y:auto; min-height:0; flex:1;">${rows}</div>
                <div class="row" style="gap:10px; margin-top:12px;">
                    <button type="button" class="btn-small" style="flex:1;" onclick="closeLoraCleanup()">CANCEL</button>
                    <button type="button" id="loraCleanupDeleteBtn" class="btn-small" style="flex:1; background:#f44336; color:#fff; border:none;" onclick="confirmLoraCleanup()">DELETE DATA</button>
                </div>
            </div>`;
        modal._stale = stale;
        document.body.appendChild(modal);
        if (typeof lockBodyScroll === 'function') lockBodyScroll();
    }

    let busy = false;

    window.openLoraCleanup = async function () {
        if (busy) return;
        busy = true;
        try {
            if (typeof Toast !== 'undefined') Toast.show({ text: 'Checking the server...', duration: 'short' });
            let installed;
            try {
                installed = await fetchInstalledNames();
            } catch (e) {
                await window.appAlert(`${e.message} Nothing was changed.`, { title: 'Cannot compare LoRAs' });
                return;
            }
            const stale = findStale(installed);
            if (stale.length === 0) {
                if (typeof Toast !== 'undefined') Toast.show({ text: 'Nothing to clean up', duration: 'short' });
                return;
            }
            showModal(stale);
        } finally {
            busy = false;
        }
    };

    window.confirmLoraCleanup = async function () {
        if (busy) return;
        const modal = document.getElementById('loraCleanupModal');
        const btn = document.getElementById('loraCleanupDeleteBtn');
        if (!modal || !modal._stale) return;
        busy = true;
        if (btn) { btn.disabled = true; btn.textContent = 'CHECKING...'; }
        try {
            // Re-checked against a fresh list at delete time; nothing is deleted if the server can't be reached.
            let installed;
            try {
                installed = await fetchInstalledNames();
            } catch (e) {
                closeModal();
                await window.appAlert(`${e.message} Nothing was deleted.`, { title: 'Cannot clear', danger: true });
                return;
            }
            const shown = new Set(modal._stale.map(s => s.key));
            const stillGone = findStale(installed).filter(s => shown.has(s.key));
            clearData(stillGone.map(s => s.key));
            closeModal();
            if (typeof Toast !== 'undefined') {
                Toast.show({ text: `Cleared custom data for ${stillGone.length} LoRA${stillGone.length === 1 ? '' : 's'}`, duration: 'long' });
            }
        } finally {
            busy = false;
        }
    };

    // Exposed for the checks in this repo's test runs; not used by the UI.
    window.__loraCleanup = { findStale, clearData, collectCustomData, fetchInstalledNames };
})();
