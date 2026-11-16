/**
 * LORA MANAGER SYSTEM (FINAL v3)
 * - Thumbnails: Uses '/file=' endpoint to find images by path (png/jpg/preview.png)
 * - UI: Fixed White Plus Button -> Muted/Accent
 * - Chips: Only 'All' by default. Favorites appear after hearting in Manager.
 * - Scroll: Batch size 15.
 * - Auto-Sort: Active items bubble to top.
 */

window.LoraManager = {
    // Data Sources
    allLoras: [],
    allLorasHost: null, // which host allLoras was fetched from, for cache validity
    folders: {},
    currentFolder: 'All',
    favorites: [],

    // The exact substring inserted per LoRA alias, so removal strips precisely that. Persisted; a manually typed or preset-loaded tag has no record and falls back to removing the bare tag.
    appliedInsertions: {}, // { mode: { alias: "insertedString" } }

    // Writes this mode's appliedInsertions to localStorage after every change.
    saveInsertions: function(mode) {
        try {
            localStorage.setItem(`bojro_lora_insertions_${mode}`, JSON.stringify(this.appliedInsertions[mode] || {}));
        } catch (e) {}
    },

    // Restores appliedInsertions for every mode at boot, together with appliedNegatives (below).
    loadInsertions: function() {
        ['xl', 'flux', 'qwen', 'anima', 'krea', 'inp'].forEach(mode => {
            try {
                const saved = localStorage.getItem(`bojro_lora_insertions_${mode}`);
                this.appliedInsertions[mode] = saved ? JSON.parse(saved) : {};
            } catch (e) {
                this.appliedInsertions[mode] = {};
            }
            try {
                const savedNeg = localStorage.getItem(`bojro_lora_neg_insertions_${mode}`);
                this.appliedNegatives[mode] = savedNeg ? JSON.parse(savedNeg) : {};
            } catch (e) {
                this.appliedNegatives[mode] = {};
            }
        });
    },

    // The Negative-box side of a LoRA's "Additional Negative Prompts" override: per alias, the tags it wants (`tags`) and those it actually inserted (`inserted`); a tag already present isn't the LoRA's to remove (as StyleManager.applyStyleToPrompts()). Persisted per mode.
    appliedNegatives: {}, // { mode: { alias: { tags: [..], inserted: [..] } } }

    saveNegatives: function(mode) {
        try {
            localStorage.setItem(`bojro_lora_neg_insertions_${mode}`, JSON.stringify(this.appliedNegatives[mode] || {}));
        } catch (e) {}
    },

    // Called when a LoRA is added (boot.js, appInjectConfig): appends its additional negative tags to that mode's Negative box, skipping existing ones, and records what it inserted.
    applyAdditionalNegative: function(mode, alias, text) {
        const nEl = document.getElementById(`${mode}_neg`);
        if (!nEl) return; // a mode with no negative box (Flux) has nothing to add to
        const tags = parseTagList(window.formatInsertedTags ? window.formatInsertedTags(text, mode) : text);
        if (!tags.length) return;

        if (!this.appliedNegatives[mode]) this.appliedNegatives[mode] = {};
        // Compared loosely (normaliseTag()), so a formatted copy already in the box counts.
        const present = boxTagSet(nEl);
        // A leftover record means the tag was removed some other way, so what it put in the box is still its own to remove.
        const stale = this.appliedNegatives[mode][alias];
        const carried = stale ? stale.inserted.filter(t => present.has(normaliseTag(t))) : [];
        const fresh = tags.filter((t, i) => !present.has(normaliseTag(t)) && tags.findIndex(u => normaliseTag(u) === normaliseTag(t)) === i);
        if (fresh.length) appendTagsToBox(nEl, fresh.join(', '));

        this.appliedNegatives[mode][alias] = { tags, inserted: [...new Set([...carried, ...fresh])] };
        this.saveNegatives(mode);
        if (typeof saveNegativePrompt === 'function') saveNegativePrompt(mode);
        if (mode === 'inp' && typeof saveCurrentInpaintModeStateLive === 'function') saveCurrentInpaintModeStateLive();
    },

    // On removal: takes its additional negative tags out of the Negative box however they got there, except ones the
    // default negative, another LoRA in the prompt or a tapped style also wants.
    removeAdditionalNegative: function(mode, alias, name) {
        const records = this.appliedNegatives[mode] || (this.appliedNegatives[mode] = {});
        const tags = this.negTagsFor(mode, alias, name);
        const added = new Set(withFormattedPieces((records[alias] && records[alias].inserted) || []).map(normaliseTag));
        delete records[alias];

        const nEl = document.getElementById(`${mode}_neg`);
        if (nEl && tags.length) {
            const defaults = window.StyleManager ? window.StyleManager.defaultTagSet(mode, 'neg') : new Set();
            // Matched loosely, so a copy the box formatted after it went in still goes.
            const toRemove = new Set(withFormattedPieces(tags).map(normaliseTag)
                .filter(n => (added.has(n) || !defaults.has(n)) && !this.claimNegative(mode, n, alias) && !(window.StyleManager && window.StyleManager.claimTag(mode, 'neg', n))));
            if (toRemove.size) nEl.value = withTrailingComma(removeTagsFromText(nEl.value, toRemove, true));
        }

        this.saveNegatives(mode);
        if (typeof saveNegativePrompt === 'function') saveNegativePrompt(mode);
        if (mode === 'inp' && typeof saveCurrentInpaintModeStateLive === 'function') saveCurrentInpaintModeStateLive();
    },

    // The LoRAs in a prompt other than exceptAlias, matched ignoring case as Forge does: { alias, name, path }.
    lorasInPrompt: function(mode, promptText, exceptAlias) {
        const lower = String(promptText || '').toLowerCase();
        const has = a => lower.includes(`<lora:${String(a).toLowerCase()}:`);
        const out = new Map();
        (this.allLoras || []).forEach(l => {
            const alias = this.resolveTagIdentifier(l);
            if (alias && alias !== exceptAlias && has(alias)) out.set(alias, { alias, name: l.name, path: l.path });
        });
        [this.appliedInsertions[mode], this.appliedNegatives[mode]].forEach(records => Object.keys(records || {}).forEach(alias => {
            if (alias !== exceptAlias && !out.has(alias) && has(alias)) out.set(alias, { alias, name: null, path: null });
        }));
        return [...out.values()];
    },

    // Fetches uncached configs of LoRAs in the prompt so their trigger words are known. A missing .json isn't asked
    // for again this session; each wait is capped at 3 seconds.
    sidecarMisses: new Set(),
    loadPromptLoraConfigs: async function(mode, promptText) {
        const missing = this.lorasInPrompt(mode, promptText).filter(l => l.name && l.path && !loraConfigs[l.name] && !this.sidecarMisses.has(l.name));
        if (!missing.length || typeof loadSidecarConfig !== 'function') return;
        await Promise.all(missing.map(l => Promise.race([
            loadSidecarConfig(l.name, l.path).then(() => { if (!loraConfigs[l.name]) this.sidecarMisses.add(l.name); }).catch(() => {}),
            new Promise(r => setTimeout(r, 3000))
        ])));
    },

    // A LoRA's trigger words: its config's and, if it was added from the list, the ones it was added with (the config may have changed since).
    triggerTagsFor: function(mode, alias, name) {
        const record = this.appliedInsertions[mode] && this.appliedInsertions[mode][alias];
        const cfg = name && loraConfigs[name];
        // Added as a variant: that variant's tags, as added and as it is now (loravariants.js).
        if (record && typeof record === 'object' && record.variant) {
            const v = window.LoraVariants && name ? window.LoraVariants.getVariant(name, record.variant) : null;
            return [...new Set([...parseTagList(record.trigger || ''), ...parseTagList((v && v.trigger) || '')])];
        }
        // Without a record, the variant whose tags are in the prompt (loravariants.js).
        const variantTags = !record && window.LoraVariants ? window.LoraVariants.detectedTags(mode, alias, name) : [];
        return [...new Set([...parseTagList((record && typeof record === 'object' && record.trigger) || ''), ...parseTagList((cfg && cfg.trigger) || ''), ...variantTags])];
    },
    // The same for its additional negative tags.
    negTagsFor: function(mode, alias, name) {
        const record = this.appliedNegatives[mode] && this.appliedNegatives[mode][alias];
        const cfg = name && loraConfigs[name];
        const fromCfg = cfg && cfg.additionalNegative ? parseTagList(window.formatInsertedTags ? window.formatInsertedTags(cfg.additionalNegative, mode) : cfg.additionalNegative) : [];
        return [...new Set([...((record && record.tags) || []), ...fromCfg])];
    },

    // Whether another LoRA in the prompt (not exceptAlias) has this tag as a trigger word, so it stays. promptText decides which are in.
    claimTrigger: function(mode, norm, exceptAlias, promptText) {
        return this.lorasInPrompt(mode, promptText, exceptAlias)
            .some(l => !this.releasedFor(mode, l.alias).has(norm) && withFormattedPieces(this.triggerTagsFor(mode, l.alias, l.name)).some(t => normaliseTag(t) === norm));
    },

    // Trigger words a LoRA has lost: deleted from the box, then put back by a LoRA added since (appInjectConfig(), boot.js).
    // { mode: { alias: [normalised tag] } }, kept until the LoRA is added or removed again.
    released: {},
    releasedFor: function(mode, alias) {
        if (!this.released[mode]) {
            try { this.released[mode] = JSON.parse(localStorage.getItem(`bojro_lora_released_${mode}`)) || {}; } catch (e) { this.released[mode] = {}; }
        }
        return new Set(this.released[mode][alias] || []);
    },
    setReleased: function(mode, alias, set) {
        this.releasedFor(mode, alias);
        if (set && set.size) this.released[mode][alias] = [...set]; else delete this.released[mode][alias];
        try { localStorage.setItem(`bojro_lora_released_${mode}`, JSON.stringify(this.released[mode])); } catch (e) {}
    },
    // A LoRA being added (alias) found these of its trigger words missing: other LoRAs in the box listing them lose them.
    releaseMissing: function(mode, alias, norms, promptText) {
        this.setReleased(mode, alias, null);
        if (!norms.length) return;
        this.lorasInPrompt(mode, promptText, alias).forEach(l => {
            const own = new Set(withFormattedPieces(this.triggerTagsFor(mode, l.alias, l.name)).map(normaliseTag));
            const lost = norms.filter(n => own.has(n));
            if (!lost.length) return;
            const set = this.releasedFor(mode, l.alias);
            lost.forEach(n => set.add(n));
            this.setReleased(mode, l.alias, set);
        });
    },

    // The same for a LoRA's additional negative tags.
    claimNegative: function(mode, norm, exceptAlias) {
        const promptText = (document.getElementById(`${mode}_prompt`) || {}).value || '';
        return this.lorasInPrompt(mode, promptText, exceptAlias)
            .some(l => withFormattedPieces(this.negTagsFor(mode, l.alias, l.name)).some(t => normaliseTag(t) === norm));
    },

    // Guards against a double-tap inserting a tag twice.
    togglesInFlight: {}, // { "mode:alias": true }

    // Active chip in the LoRA browser: 'arch', 'all', 'folder', 'starred' or 'sliders'.
    viewMode: 'arch',

    // Individually favourited LoRAs (by name), distinct from the folder-level `favorites`.
    loraFavorites: [],

    // Cache of display names (from .api_info.json model.name), keyed by raw filename.
    nameCache: {},

    // User renames from the LoRA config modal; separate from nameCache, which a refresh clears.
    userRenames: {},

    loadUserRenames: function() {
        try {
            const saved = localStorage.getItem('bojroLoraUserRenames');
            this.userRenames = saved ? JSON.parse(saved) : {};
        } catch (e) {
            this.userRenames = {};
        }
    },

    saveUserRename: function(loraName, newName) {
        const trimmed = (newName || '').trim();
        if (trimmed) {
            this.userRenames[loraName] = trimmed;
        } else {
            delete this.userRenames[loraName]; // empty save clears the override
        }
        localStorage.setItem('bojroLoraUserRenames', JSON.stringify(this.userRenames));
    },

    // Per-LoRA "Link to ADetailer" state, read by LoRA Link (extractLinkableLoraTags(), engine.js). Enabled by default, so only opt-outs are stored. A plain object keyed by raw filename (lora.name), one shared localStorage key.
    loraLinkDisabled: {},

    loadLoraLinkDisabled: function() {
        try {
            const saved = localStorage.getItem('bojroLoraLinkDisabled');
            this.loraLinkDisabled = saved ? JSON.parse(saved) : {};
        } catch (e) {
            this.loraLinkDisabled = {};
        }
    },

    // enabled=true clears any stored opt-out. Keys are lowercase (see isLoraLinkEnabled).
    setLoraLinkEnabled: function(loraName, enabled) {
        const key = (loraName || '').toLowerCase();
        if (enabled) {
            delete this.loraLinkDisabled[key];
        } else {
            this.loraLinkDisabled[key] = true;
        }
        localStorage.setItem('bojroLoraLinkDisabled', JSON.stringify(this.loraLinkDisabled));
    },

    // Case-insensitive, since a <lora:...> tag typed in a prompt may differ in case from the real filename.
    isLoraLinkEnabled: function(loraName) {
        return !this.loraLinkDisabled[(loraName || '').toLowerCase()];
    },

    // What to display for a LoRA: user rename, then the .api_info.json cache, then a prettified filename.
    getDisplayName: function(lora) {
        if (this.userRenames.hasOwnProperty(lora.name)) return this.userRenames[lora.name];
        if (this.nameCache.hasOwnProperty(lora.name) && this.nameCache[lora.name]) return this.nameCache[lora.name];
        return lora.name.replace(/_/g, ' ');
    },

    // Favourites are scoped per architecture (getEffectiveArch()), with the old unscoped bojroLoraFavs key as fallback when none can be resolved.
    loadLoraFavorites: function() {
        try {
            const arch = this.getEffectiveArch();
            const key = arch ? `bojroLoraFavs_${arch}` : 'bojroLoraFavs';
            const saved = localStorage.getItem(key);
            this.loraFavorites = saved ? JSON.parse(saved) : [];
        } catch (e) {
            this.loraFavorites = [];
        }
    },

    saveLoraFavorites: function() {
        const arch = this.getEffectiveArch();
        const key = arch ? `bojroLoraFavs_${arch}` : 'bojroLoraFavs';
        localStorage.setItem(key, JSON.stringify(this.loraFavorites));
    },

    // btn: the row's star. Outside the Favourites chip the list doesn't change, so only the star is redrawn; in it, the
    // list is redrawn in its place.
    toggleLoraFavorite: function(name, btn) {
        const idx = this.loraFavorites.indexOf(name);
        if (idx === -1) this.loraFavorites.push(name);
        else this.loraFavorites.splice(idx, 1);
        this.saveLoraFavorites();
        this.renderChips();
        if (btn && this.viewMode !== 'starred') {
            const isFav = idx === -1;
            btn.style.color = isFav ? '#ffc107' : 'var(--text-muted)';
            btn.innerHTML = `<i data-lucide="star" size="16" ${isFav ? 'fill="currentColor"' : ''}></i>`;
            if (window.lucide) lucide.createIcons();
            return;
        }
        if (window.LoraVariants) window.LoraVariants.refreshList();
        else this.filterAndRender(this.currentFolder);
    },

    // --- DISPLAY NAME RESOLUTION (from .api_info.json) ---
    loadNameCache: function() {
        try {
            const saved = localStorage.getItem('bojroLoraNameCache');
            this.nameCache = saved ? JSON.parse(saved) : {};
        } catch (e) {
            this.nameCache = {};
        }
    },

    saveNameCache: function() {
        localStorage.setItem('bojroLoraNameCache', JSON.stringify(this.nameCache));
    },

    // Reads "<lora file>.api_info.json" (the Civitai sidecar) next to the LoRA for its model.name, e.g. { "model": { "name": "Cherry-gig Western Style [Anima/Illustrious]" } }. Falls back to the filename on any problem. Cached.
    // Name lookups running, and those waiting for a turn (at most NAME_LOOKUPS at once).
    NAME_LOOKUPS: 4,
    nameLookupsRunning: 0,
    nameLookupQueue: [],
    resolveDisplayName: async function(lora) {
        if (this.nameCache.hasOwnProperty(lora.name)) {
            return this.nameCache[lora.name];
        }
        // A finished lookup hands its place straight to the next one waiting.
        if (this.nameLookupsRunning >= this.NAME_LOOKUPS) await new Promise(r => this.nameLookupQueue.push(r));
        else this.nameLookupsRunning++;
        try {
            return await this.lookUpDisplayName(lora);
        } finally {
            const next = this.nameLookupQueue.shift();
            if (next) next(); else this.nameLookupsRunning--;
        }
    },
    lookUpDisplayName: async function(lora) {
        // Found while it waited its turn.
        if (this.nameCache.hasOwnProperty(lora.name)) {
            return this.nameCache[lora.name];
        }

        let host = "";
        if (typeof buildWebUIUrl === 'function') host = buildWebUIUrl();
        if (!host && typeof HOST !== 'undefined') host = HOST;
        if (!host) return null;

        let pathNoExt = lora.path;
        if (pathNoExt.lastIndexOf('.') > -1) {
            pathNoExt = pathNoExt.substring(0, pathNoExt.lastIndexOf('.'));
        }

        // Time limit: a request that never answered left the list spinning.
        // A timeout isn't remembered, so the name is asked for again next time.
        const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 4000) : 0;
        try {
            const url = `${host}/file=${pathNoExt}.api_info.json`;
            const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
            clearTimeout(timer);
            if (!res.ok) {
                this.nameCache[lora.name] = null;
                this.saveNameCache();
                return null;
            }
            const info = await res.json();
            const displayName = info?.model?.name || null;
            this.nameCache[lora.name] = displayName;
            this.saveNameCache();
            return displayName;
        } catch (e) {
            clearTimeout(timer);
            if (e && e.name === 'AbortError') return null;
            this.nameCache[lora.name] = null;
            this.saveNameCache();
            return null;
        }
    },

    // Virtualization
    filteredList: [],
    displayedCount: 0,
    BATCH_SIZE: 15, // Low batch size for stability
    observer: null,

    // Cache System
    fs: window.Capacitor ? window.Capacitor.Plugins.Filesystem : null,
    CACHE_DIR: 'CACHES',
    metaCache: {}, // { "loraName": "lastModifiedString" }; false: the server has no thumbnail for it
    // In-memory cache of resolved thumbnails, so filter chips don't flash default icons.
    thumbnailMemCache: {},

    init: async function() {
        this.loadFavorites();
        this.loadLoraFavorites();
        this.loadNameCache();
        this.loadUserRenames();
        this.loadLoraLinkDisabled();
        await this.loadMetaCache();
        this.setupObserver();
        console.log("LoraManager: Ready");
    },

    loadFavorites: function() {
        try {
            const saved = localStorage.getItem('bojroFolderFavs');
            if (saved) this.favorites = JSON.parse(saved);
        } catch(e) {}
    },

    saveFavorites: function() {
        localStorage.setItem('bojroFolderFavs', JSON.stringify(this.favorites));
        this.renderChips(); // Refresh chips immediately on save
    },

    // --- META CACHE ---
    loadMetaCache: async function() {
        if(!this.fs) return;
        try {
            const ret = await this.fs.readFile({
                path: `${this.CACHE_DIR}/meta_cache.json`,
                directory: 'CACHE',
                encoding: 'utf8'
            });
            this.metaCache = JSON.parse(ret.data);
        } catch (e) {
            this.metaCache = {};
        }
    },

    // Many misses can come at once while scrolling, so they're written together.
    queueMetaCacheSave: function() {
        clearTimeout(this.metaSaveTimer);
        this.metaSaveTimer = setTimeout(() => this.saveMetaCache(), 1000);
    },

    // After a refresh (thumbRecheck), each LoRA's thumbnail is checked with the server once more (thumbChecked).
    thumbRecheck: false,
    thumbChecked: new Set(),

    // Shows the copy saved on the device; false if there isn't one.
    readCachedThumb: async function(imgEl, name) {
        if (!this.fs || !this.metaCache[name]) return false;
        try {
            const file = await this.fs.readFile({ path: `${this.CACHE_DIR}/${name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}.jpg`, directory: 'CACHE' });
            const dataUrl = `data:image/jpeg;base64,${file.data}`;
            imgEl.src = dataUrl;
            this.thumbnailMemCache[name] = dataUrl;
            return true;
        } catch (e) {
            return false;
        }
    },

    // Has a thumbnail saved on the device.
    hasSavedThumb: function(name) {
        return !!(this.fs && this.metaCache[name]);
    },
    // Reads the saved thumbnails into memory in the background, a few at a time, so a filter shows them at once.
    preloadSavedThumbs: function() {
        if (!this.fs || this.thumbPreloading) return;
        // After a refresh, each is checked with the server as it comes into view instead (thumbRecheck).
        if (this.thumbRecheck) return;
        const names = this.allLoras.map(l => l.name).filter(n => this.hasSavedThumb(n) && !this.thumbnailMemCache[n]);
        if (!names.length) return;
        this.thumbPreloading = true;
        let next = 0;
        const worker = async () => {
            while (next < names.length) {
                const name = names[next++];
                if (this.thumbnailMemCache[name]) continue;
                try {
                    const file = await this.fs.readFile({ path: `${this.CACHE_DIR}/${name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}.jpg`, directory: 'CACHE' });
                    if (!this.thumbnailMemCache[name]) this.thumbnailMemCache[name] = `data:image/jpeg;base64,${file.data}`;
                } catch (e) {}
            }
        };
        // After the rows on screen have read theirs.
        setTimeout(() => Promise.all([worker(), worker(), worker()]).then(() => { this.thumbPreloading = false; }), 500);
    },

    // Shows a thumb-wait image once its thumbnail is in, or the app icon after 1.5s if it never comes.
    revealThumb: function(img) {
        img.addEventListener('load', () => { if (img.getAttribute('src') !== 'icon.png') img.classList.remove('thumb-wait'); });
        setTimeout(() => img.classList.remove('thumb-wait'), 1500);
    },

    saveMetaCache: async function() {
        if(!this.fs) return;
        try {
            await this.fs.writeFile({
                path: `${this.CACHE_DIR}/meta_cache.json`,
                data: JSON.stringify(this.metaCache),
                directory: 'CACHE',
                encoding: 'utf8'
            });
        } catch(e) {}
    },

    // --- MAIN OPEN LOGIC ---
    // Fetches missing .api_info.json names in parallel before sorting, so the order matches the displayed names.
    preResolveNames: async function(loraList) {
        const needsResolve = loraList.filter(lora =>
            !this.userRenames.hasOwnProperty(lora.name) && !this.nameCache.hasOwnProperty(lora.name)
        );
        if (needsResolve.length === 0) return;
        await Promise.all(needsResolve.map(lora => this.resolveDisplayName(lora)));
    },

    open: async function(targetMode) {
        this.targetMode = targetMode; // 'xl', 'flux', 'qwen', 'inp', 'img2img'

        // Inpaint/img2img detect the architecture from the selected checkpoint, on every open.
        const isSharedPromptMode = targetMode === 'inp' || targetMode === 'img2img';
        if (isSharedPromptMode) {
            const modelSelect = document.getElementById(`${targetMode}_modelSelect`);
            this.detectedCheckpointArch = this.detectCheckpointArchitecture(modelSelect ? modelSelect.value : '');
        } else {
            this.detectedCheckpointArch = null;
        }
        // Favourites are scoped per architecture, so reload them now that detectedCheckpointArch is current.
        this.loadLoraFavorites();

        // Restore the last-selected chip (All or mode-filtered). Starred and folder chips are never saved, so any other value falls back to 'arch'.
        const savedViewMode = localStorage.getItem('bojroLoraViewMode');
        this.viewMode = (savedViewMode === 'all') ? savedViewMode : 'arch';

        // FIX (Issue 3): Use global HOST variable directly
        // Removed reliance on window.HOST (which is undefined for let variables)
        // and removed reliance on hidden hostIp input.
        let targetHost = "";

        // Try to get from config utility first
        if (typeof buildWebUIUrl === 'function') {
            targetHost = buildWebUIUrl();
        }

        // Fallback to global HOST variable if config helper failed/missing
        if (!targetHost && typeof HOST !== 'undefined') {
            targetHost = HOST;
        }

        if (!targetHost) {
            await window.appAlert("Link server first!");
            return;
        }

        const modal = document.getElementById('loraModal');
        modal.classList.remove('hidden');
        if (typeof lockBodyScroll === 'function') lockBodyScroll();

        // The search box keeps its value across opens; sync the clear button.
        const clearBtn = document.getElementById('loraSearchClear');
        const searchEl = document.getElementById('loraSearch');
        if (clearBtn) clearBtn.classList.toggle('hidden', !searchEl || !searchEl.value);

        // Reset View
        document.getElementById('loraVerticalList').innerHTML = '<div class="spinner" style="display:block"></div>';
        const refreshBtn = document.getElementById('loraRefreshBtn');
        if (refreshBtn) refreshBtn.classList.add('hidden');

        const log = msg => { if (window.dbg) window.dbg(`LoRA list: ${msg}`); };
        const showError = e => {
            log(`failed: ${e && e.message}${e && e.stack ? ' | ' + String(e.stack).split('\n').slice(0, 3).join(' < ') : ''}`);
            document.getElementById('loraVerticalList').innerHTML = `<div style="text-align:center;padding:20px;color:red">Error: ${escapeHtmlAttr(e && e.message)}</div>`;
            if (refreshBtn) refreshBtn.classList.remove('hidden');
        };

        // Reuse the list from an earlier open this session if on the same host; REFRESH always re-fetches.
        if (this.allLoras.length > 0 && this.allLorasHost === targetHost) {
            try {
                this.processFolders();
                this.renderChips();
                this.filterAndRender('All');
                this.preloadSavedThumbs();
                if (refreshBtn) refreshBtn.classList.remove('hidden');
            } catch (e) {
                showError(e);
            }
            return;
        }

        try {
            // FIX: Added headers to support ngrok/auth
            const loadToken = this.loadToken = (this.loadToken || 0) + 1;
            log(`request ${loadToken}`);
            const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
            // The request and reading its reply, 20s in all.
            const listTimer = ctrl ? setTimeout(() => ctrl.abort(), 20000) : 0;
            let data;
            try {
                const res = await fetch(`${targetHost}/sdapi/v1/loras`, Object.assign({
                    headers: typeof getHeaders === 'function' ? getHeaders() : {}
                }, ctrl ? { signal: ctrl.signal } : {}));
                if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
                data = await res.json();
            } catch (err) {
                log(`request ${loadToken}: ${err && (err.name + ' ' + err.message)}`);
                throw new Error(err && err.name === 'AbortError' ? 'The server took too long. Tap refresh to try again.' : (err && /^Fetch failed/.test(err.message) ? err.message : 'Fetch failed'));
            } finally {
                clearTimeout(listTimer);
            }
            log(`request ${loadToken}: ${Array.isArray(data) ? data.length : typeof data} LoRAs`);
            // A newer open (or refresh) took over.
            if (loadToken !== this.loadToken) { log(`request ${loadToken} replaced by ${this.loadToken}`); return; }

            // Detect before sorting: active-first sorting needs duplicateAliasSet (resolveTagIdentifier).
            this.detectDuplicateAliases(data);
            // Display names (.api_info.json) for up to 3 seconds; any still missing show their file name this time.
            await Promise.race([this.preResolveNames(data), new Promise(r => setTimeout(r, 3000))]);
            if (loadToken !== this.loadToken) return;
            this.allLoras = this.sortLoras(data);
            this.allLorasHost = targetHost;

            this.processFolders();
            this.renderChips();
            this.filterAndRender('All');
            this.preloadSavedThumbs();
            if (refreshBtn) refreshBtn.classList.remove('hidden');
            log(`request ${loadToken} shown`);
        } catch (e) {
            showError(e);
        }
    },

    // Re-fetches the LoRA list without resetting filter, folder or search (open() does).
    refresh: async function() {
        if (!this.targetMode) return;

        let targetHost = "";
        if (typeof buildWebUIUrl === 'function') targetHost = buildWebUIUrl();
        if (!targetHost && typeof HOST !== 'undefined') targetHost = HOST;
        if (!targetHost) {
            await window.appAlert("Link server first!");
            return;
        }

        const listEl = document.getElementById('loraVerticalList');
        const previousContent = listEl.innerHTML;
        listEl.innerHTML = '<div class="spinner" style="display:block"></div>';

        try {
            // Forge caches its LoRA list, so POST first to force a rescan (as the WebUI's refresh button).
            const refreshRes = await fetch(`${targetHost}/sdapi/v1/refresh-loras`, {
                method: 'POST',
                headers: typeof getHeaders === 'function' ? getHeaders() : {}
            });
            if (!refreshRes.ok) throw new Error("Refresh-loras failed");

            const res = await fetch(`${targetHost}/sdapi/v1/loras`, {
                headers: typeof getHeaders === 'function' ? getHeaders() : {}
            });
            if (!res.ok) throw new Error("Fetch failed");
            const data = await res.json();

            // Thumbnails are checked again as they come into view: changed ones download, missing ones are looked for.
            Object.keys(this.thumbnailMemCache).filter(k => !k.startsWith('ckpt_')).forEach(k => delete this.thumbnailMemCache[k]);
            this.thumbRecheck = true;
            this.thumbChecked = new Set();
            // Refresh also picks up sidecar edits: clear the name cache before pre-resolving and sorting.
            this.nameCache = {};
            this.saveNameCache();
            // Clear cached sidecar weight/trigger text so PC-side edits are picked up, keeping entries with userEdited:true, then re-save.
            // Entries holding more than the sidecar's weight and trigger (a Type, say) are the user's: kept.
            Object.keys(loraConfigs).forEach(name => {
                const c = loraConfigs[name];
                if (c && !c.userEdited && Object.keys(c).some(k => !['weight', 'trigger'].includes(k) && c[k] !== '' && c[k] !== false && c[k] != null)) c.userEdited = true;
                if (!c || !c.userEdited) delete loraConfigs[name];
            });
            localStorage.setItem('bojroLoraConfigs', JSON.stringify(loraConfigs));
            this.detectDuplicateAliases(data); // before sorting - see open() for why
            const loadToken = this.loadToken = (this.loadToken || 0) + 1;
            await Promise.race([this.preResolveNames(data), new Promise(r => setTimeout(r, 3000))]);
            if (loadToken !== this.loadToken) return;
            this.allLoras = this.sortLoras(data);
            this.allLorasHost = targetHost;
            this.processFolders();
            this.renderChips();
            this.filterAndRender(this.currentFolder);
            this.preloadSavedThumbs();
        } catch (e) {
            listEl.innerHTML = previousContent;
            await window.appAlert("Refresh failed: " + e.message, { title: 'Refresh Failed', danger: true });
        }
    },

    // --- SORTING (Active -> Top) ---
    sortLoras: function(data) {
        const activePrompt = this.getActivePrompt();
        // Sorts by displayed name, not raw filename.
        const displayNameFor = (lora) => this.getDisplayName(lora);
        // Then the order chosen with the sort button (item 85); "added" is when the app first saw each LoRA.
        const keyOf = l => ListSort.loraKey(this.resolveTagIdentifier(l));
        const seenAt = ListSort.seen(data.map(keyOf));
        const order = ListSort.compare('lora', { name: displayNameFor, key: keyOf, added: l => seenAt[keyOf(l)] || 0 });
        ListSort.paint(document.getElementById('loraSortBtn'), 'lora');
        return data.sort((a, b) => {
            const aActive = activePrompt.toLowerCase().includes(`<lora:${String(this.resolveTagIdentifier(a)).toLowerCase()}:`);
            const bActive = activePrompt.toLowerCase().includes(`<lora:${String(this.resolveTagIdentifier(b)).toLowerCase()}:`);

            if (aActive && !bActive) return -1;
            if (!aActive && bActive) return 1;
            return order(a, b);
        });
    },

    // Inpaint and img2img share inp_prompt; map targetMode back to the real field id.
    resolvePromptId: function() {
        if (this.targetMode === 'inp' || this.targetMode === 'img2img') return 'inp_prompt';
        return `${this.targetMode}_prompt`;
    },

    getActivePrompt: function() {
        const el = document.getElementById(this.resolvePromptId());
        return el ? el.value : "";
    },

    // Forge's "alias" is not guaranteed unique, so use the full name when it collides (as the WebUI does). Use consistently wherever a <lora:...> tag is built or matched.
    resolveTagIdentifier: function(lora) {
        return this.duplicateAliasSet.has(lora.alias) ? lora.name : lora.alias;
    },

    // --- ARCHITECTURE DETECTION (for filtering by model type) ---
    // Based on the subfolder under .../Lora/. An unlisted folder or no subfolder is 'unknown' and always shown.
    FOLDER_ARCH_MAP: {
        'flux': 'flux',
        'qwen': 'qwen',
        'krea': 'krea',
        'anima': 'anima',
        'illustrious': 'xl',
        'sd': 'xl',
        'sdxl': 'xl',
        'other': 'xl'
    },

    // Top-level subfolder name under .../Lora/ for a LoRA (mirrors processFolders()).
    getTopFolderName: function(lora) {
        const path = (lora.path || '').replace(/\\/g, '/');
        const parts = path.split('/');
        const idx = parts.findIndex(p => p.toLowerCase() === 'lora');
        if (idx !== -1 && idx < parts.length - 2) {
            return parts[idx + 1];
        }
        return 'Root';
    },

    detectLoraArchitecture: function(lora) {
        if (lora._archCache) return lora._archCache;
        const topFolder = this.getTopFolderName(lora).toLowerCase();
        const result = this.FOLDER_ARCH_MAP[topFolder] || 'unknown';
        lora._archCache = result;
        return result;
    },

    // The type set in the Checkpoint Manager, else detected from the name.
    detectCheckpointArchitecture: function(title) {
        return (window.checkpointTypeOverride && window.checkpointTypeOverride(title)) || this.detectCheckpointArchitectureFromName(title);
    },

    // Guesses architecture from the filename/title by keyword (Forge gives none). Defaults to 'xl', since SDXL finetunes have no reliable keyword.
    detectCheckpointArchitectureFromName: function(title) {
        const t = (title || '').toLowerCase();
        if (t.includes('flux')) return 'flux';
        if (t.includes('qwen')) return 'qwen';
        if (t.includes('krea')) return 'krea';
        // "animagine" (SDXL) contains "anima", so it is excluded from Anima.
        if (t.includes('anima') && !t.includes('animagine')) return 'anima';
        return 'xl';
    },

    // Like detectCheckpointArchitecture() but returns null when nothing matches, so "no match" stays distinguishable from SDXL (for buildGroupedModelOptions, network.js).
    detectCheckpointArchitectureStrict: function(title) {
        const override = window.checkpointTypeOverride && window.checkpointTypeOverride(title);
        if (override) return override;
        const t = (title || '').toLowerCase();

        // Folder prefix (e.g. "SDXL\model.safetensors") is checked first; it is a more reliable signal than a substring.
        const folderMatch = t.match(/^([^\\/]+)[\\/]/);
        const folder = folderMatch ? folderMatch[1] : '';
        const CHECKPOINT_FOLDER_ARCH_MAP = {
            'flux': 'flux',
            'qwen': 'qwen',
            'krea': 'krea',
            'anima': 'anima',
            'illustrious': 'xl',
            'sd': 'xl',
            'sdxl': 'xl',
            'pony': 'xl',
        };
        if (CHECKPOINT_FOLDER_ARCH_MAP[folder]) return CHECKPOINT_FOLDER_ARCH_MAP[folder];

        if (t.includes('flux')) return 'flux';
        if (t.includes('qwen')) return 'qwen';
        if (t.includes('krea')) return 'krea';
        if (t.includes('anima') && !t.includes('animagine')) return 'anima';
        // Pony Diffusion is an SDXL family; checked as a keyword.
        if (t.includes('pony')) return 'xl';
        // General "XL" suffix (DreamshaperXL etc), with a boundary after "xl" so "flexlora" doesn't match. Checked last.
        if (/xl(?=[_\-.\s\d]|$)/i.test(t)) return 'xl';
        return null;
    },

    // Architecture key for chip filtering: targetMode for the five main tabs, or the detected architecture of the selected checkpoint for Inpaint/img2img (detectedCheckpointArch, from open()).
    getEffectiveArch: function() {
        if (this.targetMode === 'inp' || this.targetMode === 'img2img') {
            return this.detectedCheckpointArch;
        }
        return this.targetMode;
    },


    // --- FOLDER PARSING ---
    processFolders: function() {
        this.folders = { 'All': [] };

        this.allLoras.forEach(lora => {
            const path = lora.path.replace(/\\/g, '/');
            const parts = path.split('/');

            // Extract folder logic
            let folderName = 'Root';
            const idx = parts.findIndex(p => p.toLowerCase() === 'lora');

            if (idx !== -1 && idx < parts.length - 2) {
                folderName = parts.slice(idx + 1, parts.length - 1).join(' > ');
            }

            if (!this.folders[folderName]) this.folders[folderName] = [];
            this.folders[folderName].push(lora);
            this.folders['All'].push(lora);
        });
    },

    // See resolveTagIdentifier(); must run before sortLoras() and any render.
    duplicateAliasSet: new Set(),
    detectDuplicateAliases: function(data) {
        const counts = {};
        (data || this.allLoras).forEach(l => { counts[l.alias] = (counts[l.alias] || 0) + 1; });
        this.duplicateAliasSet = new Set(Object.keys(counts).filter(a => counts[a] > 1));
    },

    // --- RENDER CHIPS (All, current-mode filter, + Favorites) ---
    renderChips: function() {
        const container = document.getElementById('loraFolderChips');
        container.innerHTML = '';

        const effectiveArch = this.getEffectiveArch();
        const modeLabel = { xl: 'SDXL', flux: 'Flux', qwen: 'Qwen', anima: 'Anima', krea: 'Krea' }[effectiveArch] || (effectiveArch || '').toUpperCase();
        const allList = this.folders['All'] || [];
        const archList = effectiveArch ? allList.filter(l => {
            const a = this.detectLoraArchitecture(l);
            return a === 'unknown' || a === effectiveArch;
        }) : allList;

        // icon: 'star' (Favourites, no text), 'heart' (a favourite folder) or 'funnel' / 'funnel-x' (outlined: the model type
        // chip).
        const addChip = (label, count, { icon = null, isActive = false, onClick } = {}) => {
            const chip = document.createElement('div');
            chip.className = 'folder-chip';
            if (isActive) chip.classList.add('active');

            chip.innerHTML = `
                ${icon ? `<i data-lucide="${icon}" class="chip-${icon}" width="14" height="14"${icon.startsWith('funnel') ? '' : ' fill="currentColor"'}></i>` : ''}
                ${label ? `<span>${escapeHtmlAttr(label)}</span>` : ''}
                <span style="font-size:12px;opacity:0.6">${count}</span>
            `;
            chip.onclick = () => {
                document.querySelectorAll('.folder-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                // Clear any active search so Favourites isn't empty because of it.
                if (typeof window.clearLoraSearch === 'function') window.clearLoraSearch();
                onClick();
            };
            container.appendChild(chip);
        };

        // The model type chip: LoRAs for the current architecture plus unclassified ones. Tapped while selected it shows every
        // LoRA (reading ALL); tapped again it filters again.
        if (effectiveArch) {
            const showingAll = this.viewMode === 'all';
            addChip(showingAll ? 'All' : modeLabel, showingAll ? allList.length : archList.length, {
                icon: showingAll ? 'funnel-x' : 'funnel',
                isActive: this.viewMode === 'arch' || showingAll,
                onClick: () => this.setArchView(this.viewMode === 'arch' ? 'all' : 'arch')
            });
        } else {
            addChip('All', allList.length, {
                isActive: this.viewMode === 'all' || this.viewMode === 'arch',
                onClick: () => this.setArchView('all')
            });
        }

        // Starred LoRAs and groups regardless of architecture.
        addChip('', this.loraFavorites.length + (window.LoraGroups ? window.LoraGroups.favCount() : 0), {
            icon: 'star',
            isActive: this.viewMode === 'starred',
            onClick: () => {
                this.viewMode = 'starred';
                // Not saved to localStorage (see open()), so reopening returns to the saved All/mode-filtered choice.
                this.filterAndRender('All');
            }
        });

        // LoRAs of the Slider type (lorasliders.js), regardless of architecture.
        const sliderCount = allList.filter(l => window.LoraSliders && window.LoraSliders.inSliderType(l.name)).length;
        if (sliderCount) {
            addChip('', sliderCount, {
                icon: 'sliders-horizontal',
                isActive: this.viewMode === 'sliders',
                onClick: () => {
                    this.viewMode = 'sliders';
                    this.filterAndRender('All');
                }
            });
        } else if (this.viewMode === 'sliders') {
            this.viewMode = localStorage.getItem('bojroLoraViewMode') === 'all' ? 'all' : 'arch';
        }

        // Favourited folders are already architecture-specific.
        this.favorites.forEach(fav => {
            if (this.folders[fav]) {
                addChip(fav, this.folders[fav].length, {
                    icon: 'heart',
                    isActive: this.viewMode === 'folder' && this.currentFolder === fav,
                    onClick: () => {
                        this.viewMode = 'folder';
                        this.filterAndRender(fav);
                    }
                });
            }
        });

        if(window.lucide) lucide.createIcons();

        // Size the refresh button from the rendered chip height; aspect-ratio support varies across Android WebView versions.
        const refreshBtn = document.getElementById('loraRefreshBtn');
        const firstChip = container.querySelector('.folder-chip');
        if (refreshBtn && firstChip) {
            const chipHeight = firstChip.getBoundingClientRect().height;
            if (chipHeight > 0) {
                refreshBtn.style.height = `${chipHeight}px`;
                refreshBtn.style.width = `${chipHeight}px`;
            }
        }
    },

    // 'arch' (the model type) or 'all', remembered for the next time the window opens.
    setArchView: function(mode) {
        this.viewMode = mode;
        localStorage.setItem('bojroLoraViewMode', mode);
        this.renderChips();
        this.filterAndRender('All');
    },

    // --- FILTER & VIRTUAL RENDER ---
    typeFilter: '',
    typeOk: function(l) {
        // The type as set, Slider included (RandomTokens.typeOf() counts a slider as none, for random::).
        const t = this.typeFilter, typeOf = n => ((typeof loraConfigs !== 'undefined' && loraConfigs[n] && loraConfigs[n].type) || '');
        if (!t) return true;
        if (t === 'mixed') {
            const g = window.LoraGroups && LoraGroups.groupOf ? LoraGroups.groupOf(l.name) : null;
            return !!g && new Set(g.members.map(typeOf)).size > 1;
        }
        return (typeOf(l.name) || 'none') === t;
    },
    searchContentOn: () => localStorage.getItem('bojroLoraSearchContent') === 'true',
    // What content search looks in: the file name, Prompt, Negative, slider name, and each variant's name and texts.
    contentOf: function(l) {
        const c = (typeof loraConfigs !== 'undefined' && loraConfigs[l.name]) || {};
        const lv = window.LoraVariants;
        const vs = lv && lv.enabledFor(l.name) ? lv.list(l.name).flatMap(v => [v.name, v.trigger, v.negative]) : [];
        return [l.name, l.alias, c.trigger, c.additionalNegative, c.sliderName].concat(vs).filter(Boolean).join('\n');
    },
    toggleSearchContent: function() {
        const on = !this.searchContentOn();
        localStorage.setItem('bojroLoraSearchContent', on ? 'true' : 'false');
        this.paintSearchContent();
        if (typeof Toast !== 'undefined') Toast.show({ text: on ? 'Searching prompts and variants too' : 'Searching names only', duration: 'short' });
        if (typeof window.filterLoras === 'function') window.filterLoras();
    },
    paintSearchContent: function() {
        const b = document.getElementById('loraSearchContent'), on = this.searchContentOn();
        if (b) { b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    },
    setTypeFilter: function(t) {
        this.typeFilter = t || '';
        const sel = document.getElementById('loraTypeSelect');
        if (sel) sel.value = this.typeFilter;
        document.getElementById('loraTypeBtn')?.classList.toggle('active', !!this.typeFilter);
        document.getElementById('loraTypePill')?.classList.toggle('hidden', !this.typeFilter);
        const name = sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '';
        if (document.getElementById('loraTypePillName')) document.getElementById('loraTypePillName').textContent = name;
        if (typeof closeModelPicker === 'function') closeModelPicker();
        if (typeof window.filterLoras === 'function') window.filterLoras();
    },

    filterAndRender: function(folderName) {
        this.currentFolder = folderName;
        this.displayedCount = 0;

        const qEl = document.getElementById('loraSearch');
        const query = searchQuery(qEl ? qEl.value : "");
        this.paintSearchContent();

        // Get base list
        let list = this.folders[folderName] || [];

        // Search matches only the displayed name, not the raw filename (or a variant's name, loravariants.js).
        const lv = window.LoraVariants || null;
        // searchLoose: nothing matched by words, so matched anywhere; variants and groups match the same way.
        const texts = l => [this.getDisplayName(l)].concat(lv && lv.enabledFor(l.name) ? lv.list(l.name).map(v => v.name) : []);
        this.searchLoose = !!query && !list.some(l => texts(l).some(t => searchMatches(t, query)));
        // Content search (the button beside the tag): LoRAs whose prompts, variants, slider name or file name have the
        // words (whole words, item 10) come after the name matches.
        this.contentHits = new Set();
        if (query) {
            const named = searchFilter(list, texts, query);
            if (this.searchContentOn()) {
                const has = new Set(named.map(l => l.name));
                list.forEach(l => { if (!has.has(l.name) && searchMatches(this.contentOf(l), query + ' ')) this.contentHits.add(l.name); });
                list = named.concat(list.filter(l => this.contentHits.has(l.name)));
            } else list = named;
        }
        // Search by Type (the tag button): a Type, None, or Mixed (LoRAs in a group whose types differ).
        if (this.typeFilter) list = list.filter(l => this.typeOk(l));

        // Starred view: starred LoRAs (and groups, loragroups.js) only; while searching, widened to this model's architecture-matching LoRAs (as the ARCH tab would show).
        const effectiveArch = this.getEffectiveArch();
        if (this.viewMode === 'starred') {
            if (query) {
                list = list.filter(l => {
                    if (this.loraFavorites.includes(l.name)) return true;
                    if (!effectiveArch) return false;
                    const arch = this.detectLoraArchitecture(l);
                    return arch === 'unknown' || arch === effectiveArch;
                });
            } else {
                list = list.filter(l => this.loraFavorites.includes(l.name));
            }
        }

        if (this.viewMode === 'sliders') list = list.filter(l => window.LoraSliders && window.LoraSliders.inSliderType(l.name));

        // Architecture filter only when the "[MODE]" chip is active.
        if (this.viewMode === 'arch' && effectiveArch) {
            list = list.filter(l => {
                const arch = this.detectLoraArchitecture(l);
                return arch === 'unknown' || arch === effectiveArch;
            });
        }

        // Matches the model type chip hides, offered at the end of a search ("N more in ALL").
        let moreInAll = 0;
        if (query && this.viewMode === 'arch' && effectiveArch && folderName === 'All') {
            const shown = new Set(list.map(l => l.name));
            moreInAll = searchFilter(this.folders['All'] || [], l => [this.getDisplayName(l)].concat(lv && lv.enabledFor(l.name) ? lv.list(l.name).map(v => v.name) : []), query)
                .filter(l => !shown.has(l.name) && this.typeOk(l)).length;
        }

        // Re-sort
        this.filteredList = this.sortLoras(list);
        // LoRA groups: a header in place of their LoRAs, each kept to the LoRAs this chip shows. The Sliders chip lists them
        // all as one list.
        if (window.LoraGroups && this.viewMode !== 'sliders') {
            const inView = l => {
                if (!this.typeOk(l)) return false;
                if (this.viewMode !== 'arch' || !effectiveArch) return true;
                const arch = this.detectLoraArchitecture(l);
                return arch === 'unknown' || arch === effectiveArch;
            };
            this.filteredList = window.LoraGroups.arrange(this.filteredList, query, this.viewMode, this.folders[folderName] || [], inView);
        }
        // LoRA variants: open LoRAs list theirs underneath.
        if (lv) this.filteredList = lv.withChildRows(this.filteredList, query);
        if (moreInAll) this.filteredList.push({ name: '\u0001more', _moreInAll: moreInAll });

        const container = document.getElementById('loraVerticalList');
        container.innerHTML = '';
        // From the top: the LoRAs in the prompt are listed first (a list redrawn in its place sets its own position after).
        container.scrollTop = 0;

        // Trigger Element for Scroll
        const trigger = document.createElement('div');
        trigger.id = 'lora-scroll-trigger';
        trigger.style.height = '1px';
        trigger.style.marginTop = '-1px'; // sentinel adds no space below the last row
        container.appendChild(trigger);

        this.renderMore(true); // First batch
        if (!this.fillAhead()) this.fitListHeight();

        if(this.observer) this.observer.observe(trigger);
    },

    // Renders batches until there are two screens of rows past those shown, so a fling never reaches the end of the
    // rendered rows (where it would stop) before the next batch is in.
    fillAhead: function() {
        const list = document.getElementById('loraVerticalList');
        if (!list || !this.filteredList) return;
        let added = false;
        while (this.displayedCount < this.filteredList.length
            && list.scrollHeight - (list.scrollTop + list.clientHeight) < list.clientHeight * 2 + 400) {
            this.renderMore(true);
            added = true;
        }
        if (added) this.fitListHeight();
        return added;
    },

    // noFit: the caller fits the list's height once it has added its batches.
    renderMore: function(noFit) {
        const container = document.getElementById('loraVerticalList');
        const trigger = document.getElementById('lora-scroll-trigger');

        const batch = this.filteredList.slice(this.displayedCount, this.displayedCount + this.BATCH_SIZE);
        if(batch.length === 0) return;

        const activePrompt = this.getActivePrompt();
        const lv = window.LoraVariants || null;

        batch.forEach(lora => container.insertBefore(this.buildRow(lora, activePrompt, lv), trigger));

        this.displayedCount += batch.length;
        if(window.lucide) lucide.createIcons();
        if (!noFit) this.fitListHeight();
    },

    // One row of the list, keyed for keeping the list's place (LoraVariants.refreshList()).
    buildRow: function(lora, activePrompt, lv) {
        return this.keyRow(this.rowFor(lora, activePrompt, lv), lora);
    },
    // A list entry's key, then the rows to keep in place instead if it goes: a variant's or ADD VARIANT's LoRA, then the
    // group.
    rowKeys: function(lora) {
        const keys = lora._groupHead ? ['g:' + lora._groupHead]
            : lora._moreInAll ? ['more']
            : lora._variant ? ['v:' + lora.name + ':' + lora._variant.id, 'l:' + lora.name]
            : lora._addVariant ? ['a:' + lora.name, 'l:' + lora.name]
            : ['l:' + lora.name];
        if (lora._inGroup) keys.push('g:' + lora._inGroup);
        return keys;
    },
    keyRow: function(row, lora) {
        row.dataset.key = this.rowKeys(lora).join('\n');
        return row;
    },
    // One row of the list: a LoRA, a variant or ADD VARIANT (loravariants.js), or a group's header (loragroups.js).
    rowFor: function(lora, activePrompt, lv) {
        if (lora._groupHead) return window.LoraGroups.makeHead(lora);
        if (lora._moreInAll) {
            // The search's matches the model type chip hides: tapping shows ALL, keeping the search.
            const row = document.createElement('div');
            row.className = 'lora-item-row lv-add-row lora-more-all';
            row.innerHTML = `<i data-lucide="funnel-x" width="15" height="15"></i><span>${lora._moreInAll} more in ALL</span><span class="lora-more-all-tap">• Tap to show</span>`;
            row.onclick = () => this.setArchView('all');
            return row;
        }
        if (lora._variant || lora._addVariant) return lv.makeRow(lora);
        const tagId = this.resolveTagIdentifier(lora);
        // Ignoring case, as toggle() does.
        const isActive = activePrompt.toLowerCase().includes(`<lora:${String(tagId).toLowerCase()}:`);
        const isFav = this.loraFavorites.includes(lora.name);
        const row = document.createElement('div');
        row.className = `lora-item-row ${isActive ? 'active' : ''}`;

        const fallbackName = lora.name.replace(/_/g, ' ');
        // Use a cached display name immediately to avoid a flash from filename to nice name.
        const initialName = this.getDisplayName(lora) || fallbackName;
        const nameId = `name-${this.simpleHash(lora.name)}`;

        // The whole row toggles the LoRA. Passes the resolved tag identifier (full name when the alias collides) so toggle() matches the row's active-state check.
        row.onclick = () => window.LoraManager.toggle(tagId, lora.name);
        row.style.cursor = 'pointer';
        const cachedThumb = this.thumbFor(lora.name);
        // A saved thumbnail not read yet: an empty box until it is, not the app icon (thumb-wait).
        const wait = !cachedThumb && this.hasSavedThumb(lora.name);
        row.innerHTML = `
            <img src="${cachedThumb || 'icon.png'}" class="lora-item-thumb${wait ? ' thumb-wait' : ''}" id="thumb-${this.simpleHash(lora.name)}"${cachedThumb ? ' decoding="sync"' : ''}>
            <div class="lora-item-info">
                <div class="lora-item-name" id="${nameId}">${loraNameHtml(initialName)}</div>
                <div class="lora-item-meta"></div>
            </div>
            <div class="lora-star-toggle-stack">
                <button class="lora-btn-star" style="color:${isFav ? '#ffc107' : 'var(--text-muted)'}" title="Favorite">
                    <i data-lucide="star" size="16" ${isFav ? 'fill="currentColor"' : ''}></i>
                </button>
                <button class="lora-btn-action" style="color:var(--text-muted)">
                    <i data-lucide="settings-2" size="16"></i>
                </button>
            </div>
        `;

        if (wait) this.revealThumb(row.querySelector('.lora-item-thumb'));
        // Real closures rather than inline onclick strings (names with apostrophes).
        row.querySelector('.lora-btn-star').onclick = (event) => {
            event.stopPropagation();
            window.LoraManager.toggleLoraFavorite(lora.name, event.currentTarget);
        };
        row.querySelector('.lora-btn-action').onclick = (event) => {
            event.stopPropagation();
            window.openLoraSettings(event, lora.name, lora.path.replace(/\\/g, '/'));
        };
        if (lv && lv.enabledFor(lora.name)) lv.decorateParent(row, lora, tagId, isActive);
        if (lora._inGroup && window.LoraGroups) window.LoraGroups.decorateMember(row, lora);

        // Thumbnail and name load once the row nears the viewport.
        row._lazyLoad = () => {
            // Skip the lookup if this LoRA's thumbnail was already resolved this session.
            if (!cachedThumb) {
                const imgEl = row.querySelector('.lora-item-thumb');
                setTimeout(() => {
                    this.smartLoadThumbnail(imgEl, lora);
                }, 50);
            }

            // Resolve the nicer display name from .api_info.json (deferred), unless the user renamed this LoRA.
            if (!this.userRenames.hasOwnProperty(lora.name) && !this.nameCache.hasOwnProperty(lora.name)) {
                setTimeout(async () => {
                    const resolved = await this.resolveDisplayName(lora);
                    if (resolved && !this.userRenames.hasOwnProperty(lora.name)) {
                        const nameEl = document.getElementById(nameId);
                        if (nameEl) nameEl.innerHTML = loraNameHtml(resolved);
                    }
                }, 50);
            }
        };
        if (this.rowObserver) this.rowObserver.observe(row);
        else row._lazyLoad();
        return row;
    },

    // As many whole rows as fit on screen (ui.js).
    fitListHeight: function() {
        const list = document.getElementById('loraVerticalList');
        if (list) fitListToWholeRows(list, list.querySelectorAll('.lora-item-row'), 1, 4);
    },

    // Names with two lines under them (loraNameHtml(), engine.js) that make their row taller share one line.
    fitNameLines: function(root) {
        const tall = [...root.querySelectorAll('.lora-item-name')].filter(n => {
            if (n.querySelectorAll('.lora-item-sub').length < 2) return false;
            // The text stretches to the row's height, so it's taller than the row's other parts only when it adds height.
            const info = n.closest('.lora-item-info');
            const others = info ? [...info.parentElement.children].filter(c => c !== info).map(c => c.offsetHeight) : [];
            return others.length && Math.max(...others) > 0 && info.scrollHeight > Math.max(...others) + 1;
        });
        tall.forEach(n => {
            const subs = [...n.querySelectorAll('.lora-item-sub')];
            subs[0].textContent = subs.map(s => s.textContent).join(' • ');
            subs.slice(1).forEach(s => s.remove());
        });
    },

    setupObserver: function() {
        const root = document.getElementById('loraVerticalList');
        // Rows added or renamed: the lines under their names fitted before they're drawn.
        if (!root._nameLinesFit) {
            root._nameLinesFit = true;
            new MutationObserver(() => this.fitNameLines(root)).observe(root, { childList: true, subtree: true });
        }
        const opts = { root: root, rootMargin: '100px', threshold: 0.1 };

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if(e.isIntersecting) this.fillAhead();
            });
        }, opts);

        this.rowObserver = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (!e.isIntersecting) return;
                this.rowObserver.unobserve(e.target);
                if (e.target._lazyLoad) e.target._lazyLoad();
            });
        }, { root: root, rootMargin: '400px' });

        root.addEventListener('scroll', () => this.fillAhead(), { passive: true });

        // Scroll indicator hooks.
        root.indicatorScale = () => (this.displayedCount ? Math.max(1, this.filteredList.length / this.displayedCount) : 1);
        root.indicatorPrepareDrag = () => {
            while (this.displayedCount < this.filteredList.length) this.renderMore(true);
            this.fitListHeight();
        };
    },

    // --- TOGGLE LOGIC ---
    toggle: async function(alias, name) {
        const promptId = this.resolvePromptId();
        const promptEl = document.getElementById(promptId);
        if(!promptEl) return;
        const mode = promptId.replace(/_prompt$/, '');

        // Ignore a second tap while the first is processing (see togglesInFlight).
        const lockKey = `${mode}:${alias}`;
        if (this.togglesInFlight[lockKey]) return;
        this.togglesInFlight[lockKey] = true;

        try {
            let val = promptEl.value;
            const hasTag = new RegExp(`<lora:${this.escapeRegExp(alias)}:[^>]+>`, 'i').test(val);

            if (hasTag) {
                // REMOVE
                // Every LoRA in the prompt needs its trigger words known, including ones from Analyze or pasted.
                await this.loadPromptLoraConfigs(mode, val);
                val = promptEl.value;
                const bareTagRegex = new RegExp(`<lora:${this.escapeRegExp(alias)}:[^>]+>`, 'gi');
                // A tag alone at the start of a line takes the line break with it, as removeTagsFromText() does.
                val = val.replace(new RegExp(`\\n[ \\t]*<lora:${this.escapeRegExp(alias)}:[^>]+>(?=[ \\t]*(?:,|\\n|$))`, 'gi'), ',');
                val = val.replace(bareTagRegex, '');
                // Its trigger words go too, however they got there, except ones the default prompt, another LoRA or a tapped style wants.
                const triggers = this.triggerTagsFor(mode, alias, name);
                if (triggers.length) {
                    const owned = withFormattedPieces(triggers);
                    const defaults = window.StyleManager ? window.StyleManager.defaultTagSet(mode, 'prompt') : new Set();
                    const toRemove = new Set(), fromRegions = new Set();
                    owned.forEach(t => {
                        const n = normaliseTag(t);
                        if (this.claimTrigger(mode, n, alias, val)) return;
                        // Forge Couple's region boxes (forgecouple.js) only keep what another LoRA wants.
                        fromRegions.add(n);
                        if (defaults.has(n)) return;
                        if (window.StyleManager && window.StyleManager.claimTag(mode, 'prompt', n)) return;
                        toRemove.add(n);
                    });
                    val = removeTagsFromText(val, toRemove, true);
                    if (window.ForgeCouple) window.ForgeCouple.removeTags(mode, fromRegions);
                }
                if (this.appliedInsertions[mode]) {
                    delete this.appliedInsertions[mode][alias];
                    this.saveInsertions(mode);
                }
                this.setReleased(mode, alias, null);
            } else {
                // ADD
                if (window.Neo && window.Neo.appInjectConfig) {
                    // One LoRA of a group at a time (loragroups.js).
                    if (window.LoraGroups) await window.LoraGroups.clearOthers(name);
                    // Awaited, because appInjectConfig fetches the sidecar config on first use, which can be slow over a tunnel.
                    await window.Neo.appInjectConfig(alias, name, promptEl);
                    this.filterAndRender(this.currentFolder);
                    return;
                }
            }

            // Collapse only horizontal whitespace within a line, keeping deliberate line breaks. Leading/trailing junk is stripped, then exactly one ", " is put back if anything remains (withTrailingComma(), utils.js), so the box ends the same after an add or a remove.
            promptEl.value = withTrailingComma(collapseBlankLines(val.replace(/[ \t]{2,}/g, ' '))
                .replace(/^[\s,]+/, '')
                .replace(/[\s,]+$/, ''));
            // As the add path: programmatic assignment doesn't trigger the textarea's auto-save.
            if (typeof savePrompt === 'function') savePrompt(mode);
            // Takes this LoRA's "Additional Negative Prompts" back out of the Negative box. After the prompt is written back, since it checks which other LoRAs remain.
            this.removeAdditionalNegative(mode, alias, name);
            this.filterAndRender(this.currentFolder);
        } finally {
            delete this.togglesInFlight[lockKey];
        }
    },

    escapeRegExp: function(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },

    // =========================================================
    // SMART THUMBNAIL ENGINE (FILE PATH GUESSING)
    // =========================================================

    // A LoRA's thumbnail if shown this session: its own picked one (loravariants.js), else the server's.
    thumbFor: function(name) {
        return (window.LoraVariants && window.LoraVariants.parentThumb(name)) || this.thumbnailMemCache[name] || null;
    },

    smartLoadThumbnail: async function(imgEl, lora) {
        // A picked thumbnail is used instead of the server's.
        if (window.LoraVariants) {
            const own = await window.LoraVariants.parentThumbLoaded(lora.name);
            if (own) { imgEl.src = own; return; }
        }
        // A LoRA with a metaCache entry (persisted across restarts) is trusted: read the disk file immediately and skip the network probe. Only new LoRAs go through the full check-and-download flow, and a missing or unreadable disk file falls through to it. After a refresh each is checked once (thumbRecheck).
        const recheck = this.thumbRecheck && !String(lora.name).startsWith('ckpt_') && !this.thumbChecked.has(lora.name);
        if (recheck) this.thumbChecked.add(lora.name);
        // Known to have none: no requests.
        if (this.fs && !recheck && this.metaCache[lora.name] === false) return;
        if (this.fs && !recheck && this.metaCache[lora.name]) {
            const safeNameFast = lora.name.replace(/[^a-zA-Z0-9.\-_]/g, '_') + '.jpg';
            try {
                const file = await this.fs.readFile({ path: `${this.CACHE_DIR}/${safeNameFast}`, directory: 'CACHE' });
                const dataUrl = `data:image/jpeg;base64,${file.data}`;
                imgEl.src = dataUrl;
                this.thumbnailMemCache[lora.name] = dataUrl;
                return;
            } catch (e) {
                // Falls through - see comment above.
            }
        }

        // FIX: Use proper HOST check (same as open)
        let targetHost = "";
        if (typeof buildWebUIUrl === 'function') {
            targetHost = buildWebUIUrl();
        }
        if (!targetHost && typeof HOST !== 'undefined') {
            targetHost = HOST;
        }

        let host = targetHost || ''; // Ensure it's not undefined

        // 1. Determine "Guess" URLs based on real path
        // lora.path is absolute (e.g. C:\sd\models\Lora\foo.safetensors)
        // We want: C:\sd\models\Lora\foo.png (served via /file=)

        let pathNoExt = lora.path;
        if(pathNoExt.lastIndexOf('.') > -1) {
            pathNoExt = pathNoExt.substring(0, pathNoExt.lastIndexOf('.'));
        }

        // Possible extensions, the one that last found a thumbnail first (fewer failed requests).
        const candidates = ['.png', '.jpg', '.preview.png', '.jpeg', '.webp'];
        // Remembered separately for checkpoints ('ckpt_' names), which may be named differently.
        const extKey = 'bojroThumbExt_' + (String(lora.name).startsWith('ckpt_') ? 'ckpt' : 'lora');
        const lastExt = localStorage.getItem(extKey);
        if (candidates.includes(lastExt)) candidates.unshift(...candidates.splice(candidates.indexOf(lastExt), 1));

        // 2. Determine Local Cache Path
        const safeName = lora.name.replace(/[^a-zA-Z0-9.\-_]/g, '_') + '.jpg'; // Normalize to jpg for cache
        const localPath = `${this.CACHE_DIR}/${safeName}`;

        // 3. Helper to Check Server HEAD
        const checkServer = async (ext) => {
            const url = `${host}/file=${pathNoExt}${ext}`;
            try {
                // Add headers here too if authentication is needed for images
                // Note: /file= might not strictly require them depending on config, but safer to omit or test
                const res = await fetch(url, { method: 'HEAD' });
                reached = true;
                if (res.ok) {
                    return {
                        url: url,
                        // Never empty, as an entry's date is what marks it saved.
                        date: res.headers.get('Last-Modified') || res.headers.get('Content-Length') || 'unknown'
                    };
                }
            } catch(e) {}
            return null;
        };

        // Whether the server answered at all, so being offline isn't taken for having no thumbnail.
        let reached = false;

        // 4. Find valid server image
        let validServerImg = null;
        // Try provided thumbnail first if API gives it
        if(lora.thumbnail) {
             // API provided explicit path?
        }

        // Loop candidates
        for (let ext of candidates) {
            validServerImg = await checkServer(ext);
            if (validServerImg) {
                if (ext !== lastExt) localStorage.setItem(extKey, ext);
                break;
            }
        }

        if (!validServerImg) {
            // None on the server: remembered, so it isn't looked for again until a refresh.
            if (reached && this.fs && !String(lora.name).startsWith('ckpt_')) {
                this.metaCache[lora.name] = false;
                this.queueMetaCacheSave();
            }
            // Not reached while rechecking: the saved copy, and checked again next time.
            if (!reached && recheck) {
                this.thumbChecked.delete(lora.name);
                await this.readCachedThumb(imgEl, lora.name);
            }
            return;
        }

        // 5. Check Cache Validity
        let useCache = false;
        if (this.fs) {
            const cachedDate = this.metaCache[lora.name];
            if (cachedDate === validServerImg.date) {
                try {
                    const file = await this.fs.readFile({ path: localPath, directory: 'CACHE' });
                    const dataUrl = `data:image/jpeg;base64,${file.data}`;
                    imgEl.src = dataUrl;
                    this.thumbnailMemCache[lora.name] = dataUrl;
                    useCache = true;
                } catch(e) {}
            }
        } else {
            // Browser Fallback (just load url)
            imgEl.src = validServerImg.url;
            return;
        }

        // 6. Download if needed
        if (!useCache && this.fs) {
            this.downloadAndSave(validServerImg.url, localPath, imgEl, lora.name, validServerImg.date);
        }
    },

    downloadAndSave: async function(url, path, imgEl, loraName, serverDate) {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = url;
        img.onload = async () => {
            // Compress to small thumbnail: a LoRA's cropped to the list's 2:3 shape at 140x210, as picked ones
            // (loravariants.js); a checkpoint's 140 wide.
            const cvs = document.createElement('canvas');
            const ctx = cvs.getContext('2d');
            if (String(loraName).startsWith('ckpt_')) {
                cvs.width = 140;
                cvs.height = img.height * (140 / img.width);
                ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
            } else {
                cvs.width = 140;
                cvs.height = 210;
                const scale = Math.max(140 / img.width, 210 / img.height);
                const w = img.width * scale, h = img.height * scale;
                ctx.drawImage(img, (140 - w) / 2, (210 - h) / 2, w, h);
            }

            const b64 = cvs.toDataURL('image/jpeg', 0.8).split(',')[1];

            // Display
            const dataUrl = `data:image/jpeg;base64,${b64}`;
            imgEl.src = dataUrl;
            this.thumbnailMemCache[loraName] = dataUrl;

            // Save
            try {
                await this.fs.writeFile({
                    path: path,
                    data: b64,
                    directory: 'CACHE',
                    recursive: true
                });

                // Update Meta
                this.metaCache[loraName] = serverDate;
                this.saveMetaCache();

            } catch(e) {
                console.warn("Cache write failed", e);
            }
        };
    },

    simpleHash: function(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return "h" + Math.abs(hash);
    }
};

// --- GLOBAL EXPORTS ---
window.filterLoras = () => {
    const searchEl = document.getElementById('loraSearch');
    const clearBtn = document.getElementById('loraSearchClear');
    if (clearBtn) clearBtn.classList.toggle('hidden', !searchEl || !searchEl.value);
    window.LoraManager.filterAndRender(window.LoraManager.currentFolder);
};

window.clearLoraSearch = () => {
    const searchEl = document.getElementById('loraSearch');
    if (!searchEl) return;
    searchEl.value = '';
    // Not re-focusing - was popping the keyboard back up on clear
    window.filterLoras();
};
window.openLoraModal = (m) => window.LoraManager.open(m);

// A sideways swipe on the LoRA list, or on the backdrop round the window, moves to the next or previous filter chip
// (a tap on the backdrop still closes it, boot.js).
(function () {
    let start = null;
    document.addEventListener('touchstart', e => {
        const list = e.target.closest && (e.target.closest('#loraVerticalList') || (e.target.id === 'loraModal' ? e.target : null));
        start = list && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null;
    }, { passive: true });
    document.addEventListener('touchend', e => {
        if (!start || !e.changedTouches.length) return;
        const dx = e.changedTouches[0].clientX - start.x, dy = e.changedTouches[0].clientY - start.y;
        const quick = Date.now() - start.t < 600;
        start = null;
        if (!quick || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
        const chips = [...document.querySelectorAll('#loraFolderChips .folder-chip')];
        const at = chips.findIndex(c => c.classList.contains('active'));
        const next = chips[at + (dx < 0 ? 1 : -1)];
        if (!next) return;
        next.click();
        next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }, { passive: true });
    document.addEventListener('touchcancel', () => { start = null; }, { passive: true });
    // The keyboard going changes the room for whole rows.
    document.addEventListener('focusout', e => {
        if (e.target && e.target.id === 'loraSearch') setTimeout(() => window.LoraManager && window.LoraManager.fitListHeight(), 400);
    });
})();
window.closeLoraModal = () => {
    document.getElementById('loraModal').classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
};

// --- FOLDER MANAGER (GEAR ICON) ---
window.openFolderManager = function() {
    const modal = document.getElementById('folderManagerModal');
    modal.classList.remove('hidden');
    const list = document.getElementById('folderManagerList');
    list.innerHTML = '';

    const mgr = window.LoraManager;
    const folders = Object.keys(mgr.folders).sort();

    folders.forEach(f => {
        if (f === 'All') return;

        const isFav = mgr.favorites.includes(f);
        const div = document.createElement('div');
        div.className = 'folder-item-row';
        div.innerHTML = `
            <div class="folder-item-name">
                <i data-lucide="folder" width="16" height="16"></i>
                ${escapeHtmlAttr(f)}
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
                <span class="folder-item-count">${mgr.folders[f].length}</span>
                <button class="folder-heart-btn ${isFav ? 'active' : ''}">
                    <i data-lucide="heart" size="18"></i>
                </button>
            </div>
        `;
        // Real closure rather than an inline onclick string (folder names with apostrophes).
        div.querySelector('.folder-heart-btn').onclick = function() {
            window.toggleFolderFav(f, this);
        };
        list.appendChild(div);
    });
    if (window.lucide) window.lucide.createIcons();
    fitFolderManagerList();
};

function fitFolderManagerList() {
    const list = document.getElementById('folderManagerList');
    if (list && typeof fitListToWholeRows === 'function') fitListToWholeRows(list, list.querySelectorAll('.folder-item-row'));
}

window.closeFolderManager = function() {
    document.getElementById('folderManagerModal').classList.add('hidden');
    window.LoraManager.renderChips(); // Refresh chips
};

window.toggleFolderFav = function(folder, btn) {
    const mgr = window.LoraManager;
    if (mgr.favorites.includes(folder)) {
        mgr.favorites = mgr.favorites.filter(x => x !== folder);
        btn.classList.remove('active');
        btn.querySelector('svg').style.fill = 'none';
        btn.querySelector('svg').style.color = 'var(--text-muted)';
    } else {
        mgr.favorites.push(folder);
        btn.classList.add('active');
        btn.querySelector('svg').style.fill = 'currentColor';
        btn.querySelector('svg').style.color = 'var(--error)';
    }
    mgr.saveFavorites();
};

window.addEventListener('load', () => window.LoraManager.init());