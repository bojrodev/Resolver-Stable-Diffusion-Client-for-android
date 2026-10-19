// Config > "Clean Up Model Data": finds LoRAs with custom data (custom name, edited config, ADetailer-link
// opt-out, favourite) and checkpoints with saved settings (ckptcleanup.js) that are no longer on the server,
// lists them, and clears that data after confirmation. Compares only against lists fetched live from the
// server, stops on a failed or empty answer, and re-fetches when the user confirms.
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

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    // Fetches both live lists; throws if either can't be trusted.
    async function findAllStale() {
        const ckpt = window.__ckptCleanup;
        const [loras, checkpoints] = await Promise.all([fetchInstalledNames(), ckpt ? ckpt.fetchInstalledKeys() : null]);
        return { loras: findStale(loras), checkpoints: ckpt ? ckpt.findStale(checkpoints) : [] };
    }

    function showModal(stale) {
        document.getElementById('loraCleanupModal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'loraCleanupModal';
        modal.className = 'modal';
        const row = (name, kinds) => `
            <div style="padding:8px 10px; border:1px solid var(--border-color); border-radius:10px; background:rgba(255,255,255,0.02);">
                <div style="font-size:13px; font-weight:800; color:var(--text-main); word-break:break-word;">${esc(name)}</div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${esc(kinds.join(' · '))}</div>
            </div>`;
        const section = (label, items, nameOf) => items.length
            ? `<div class="model-item-group-label" style="margin:4px 2px 0;">${label}</div>` + items.map(s => row(nameOf(s), s.kinds)).join('')
            : '';
        const rows = section('LoRAs', stale.loras, s => s.name)
            + section('Checkpoints', stale.checkpoints, s => (typeof splitCheckpointDisplayName === 'function' && splitCheckpointDisplayName(s.name).primary) || s.name);
        const counts = [stale.loras.length ? plural(stale.loras.length, 'LoRA') : '', stale.checkpoints.length ? plural(stale.checkpoints.length, 'checkpoint') : ''].filter(Boolean).join(' and ');
        const total = stale.loras.length + stale.checkpoints.length;
        modal.innerHTML = `
            <div class="modal-content" style="max-height:85vh; display:flex; flex-direction:column;">
                <div class="modal-header">
                    <h3>Clean up model data</h3>
                    <button type="button" class="close-btn" onclick="closeLoraCleanup()">×</button>
                </div>
                <div style="font-size:12px; color:var(--text-muted); margin:4px 0 10px;">
                    ${counts} ${total === 1 ? 'is' : 'are'} no longer on the server but still ${total === 1 ? 'has' : 'have'} custom data in the app. Deleting clears that data for good.
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
            let stale;
            try {
                stale = await findAllStale();
            } catch (e) {
                await window.appAlert(`${e.message} Nothing was changed.`, { title: 'Cannot compare models' });
                return;
            }
            if (stale.loras.length + stale.checkpoints.length === 0) {
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
            let fresh;
            try {
                fresh = await findAllStale();
            } catch (e) {
                closeModal();
                await window.appAlert(`${e.message} Nothing was deleted.`, { title: 'Cannot clear', danger: true });
                return;
            }
            // Only what was shown and is still missing.
            const shownL = new Set(modal._stale.loras.map(s => s.key));
            const shownC = new Set(modal._stale.checkpoints.map(s => s.key));
            const goneL = fresh.loras.filter(s => shownL.has(s.key));
            const goneC = fresh.checkpoints.filter(s => shownC.has(s.key));
            clearData(goneL.map(s => s.key));
            if (window.__ckptCleanup) window.__ckptCleanup.clearData(goneC);
            closeModal();
            if (typeof Toast !== 'undefined') {
                const parts = [goneL.length ? plural(goneL.length, 'LoRA') : '', goneC.length ? plural(goneC.length, 'checkpoint') : ''].filter(Boolean).join(' and ');
                Toast.show({ text: `Cleared custom data for ${parts || 'nothing'}`, duration: 'long' });
            }
        } finally {
            busy = false;
        }
    };

    // Exposed for the checks in this repo's test runs; not used by the UI.
    window.__loraCleanup = { findStale, clearData, collectCustomData, fetchInstalledNames };
})();
