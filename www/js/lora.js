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
        const tags = parseTagList(text);
        if (!tags.length) return;

        if (!this.appliedNegatives[mode]) this.appliedNegatives[mode] = {};
        const present = new Set(parseTagList(nEl.value));
        // A leftover record means the tag was removed some other way, so what it put in the box is still its own to remove.
        const stale = this.appliedNegatives[mode][alias];
        const carried = stale ? stale.inserted.filter(t => present.has(t)) : [];
        const fresh = tags.filter((t, i) => !present.has(t) && tags.indexOf(t) === i);
        if (fresh.length) appendTagsToBox(nEl, fresh.join(', '));

        this.appliedNegatives[mode][alias] = { tags, inserted: [...new Set([...carried, ...fresh])] };
        this.saveNegatives(mode);
        if (typeof saveNegativePrompt === 'function') saveNegativePrompt(mode);
        if (mode === 'inp' && typeof saveCurrentInpaintModeStateLive === 'function') saveCurrentInpaintModeStateLive();
    },

    // Called when a LoRA is toggled off: removes exactly the tags it inserted, except tags another active LoRA also wants (those become that LoRA's). Matched tag by tag (StyleManager.removeStyleTags).
    removeAdditionalNegative: function(mode, alias) {
        const records = this.appliedNegatives[mode];
        const record = records && records[alias];
        if (!record) return;
        delete records[alias];

        const nEl = document.getElementById(`${mode}_neg`);
        if (nEl && record.inserted.length) {
            const promptText = (document.getElementById(`${mode}_prompt`) || {}).value || '';
            const stillWanted = new Set();
            Object.keys(records).forEach(otherAlias => {
                const other = records[otherAlias];
                const otherActive = new RegExp(`<lora:${this.escapeRegExp(otherAlias)}:[^>]+>`, 'i').test(promptText);
                if (!otherActive) return;
                other.tags.forEach(t => {
                    if (record.inserted.includes(t)) {
                        stillWanted.add(t);
                        if (!other.inserted.includes(t)) other.inserted.push(t);
                    }
                });
            });
            const toRemove = record.inserted.filter(t => !stillWanted.has(t));
            if (toRemove.length && window.StyleManager) {
                nEl.value = withTrailingComma(window.StyleManager.removeStyleTags(nEl.value, toRemove.join(', ')));
            }
        }

        this.saveNegatives(mode);
        if (typeof saveNegativePrompt === 'function') saveNegativePrompt(mode);
        if (mode === 'inp' && typeof saveCurrentInpaintModeStateLive === 'function') saveCurrentInpaintModeStateLive();
    },

    // Guards against a double-tap inserting a tag twice.
    togglesInFlight: {}, // { "mode:alias": true }

    // Active chip in the LoRA browser: 'arch', 'all', 'folder' or 'starred'.
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

    toggleLoraFavorite: function(name) {
        const idx = this.loraFavorites.indexOf(name);
        if (idx === -1) this.loraFavorites.push(name);
        else this.loraFavorites.splice(idx, 1);
        this.saveLoraFavorites();
        this.renderChips();
        this.filterAndRender(this.currentFolder);
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
    resolveDisplayName: async function(lora) {
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

        try {
            const url = `${host}/file=${pathNoExt}.api_info.json`;
            const res = await fetch(url);
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
    metaCache: {}, // Stores { "loraName": "lastModifiedString" }
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
        const refreshBtn = document.querySelector('.lora-refresh-btn');
        if (refreshBtn) refreshBtn.classList.add('hidden');

        // Reuse the list from an earlier open this session if on the same host; REFRESH always re-fetches.
        if (this.allLoras.length > 0 && this.allLorasHost === targetHost) {
            this.processFolders();
            this.renderChips();
            this.filterAndRender('All');
            if (refreshBtn) refreshBtn.classList.remove('hidden');
            return;
        }

        try {
            // FIX: Added headers to support ngrok/auth
            const res = await fetch(`${targetHost}/sdapi/v1/loras`, {
                headers: typeof getHeaders === 'function' ? getHeaders() : {}
            });

            if (!res.ok) throw new Error("Fetch failed");

            const data = await res.json();

            // Detect before sorting: active-first sorting needs duplicateAliasSet (resolveTagIdentifier).
            this.detectDuplicateAliases(data);
            await this.preResolveNames(data);
            this.allLoras = this.sortLoras(data);
            this.allLorasHost = targetHost;

            this.processFolders();
            this.renderChips();
            this.filterAndRender('All');
            if (refreshBtn) refreshBtn.classList.remove('hidden');

        } catch (e) {
            document.getElementById('loraVerticalList').innerHTML = `<div style="text-align:center;padding:20px;color:red">Error: ${escapeHtmlAttr(e.message)}</div>`;
            if (refreshBtn) refreshBtn.classList.remove('hidden');
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

            // Refresh also picks up sidecar edits: clear the name cache before pre-resolving and sorting.
            this.nameCache = {};
            this.saveNameCache();
            // Clear cached sidecar weight/trigger text so PC-side edits are picked up, keeping entries with userEdited:true, then re-save.
            Object.keys(loraConfigs).forEach(name => {
                if (!loraConfigs[name] || !loraConfigs[name].userEdited) {
                    delete loraConfigs[name];
                }
            });
            localStorage.setItem('bojroLoraConfigs', JSON.stringify(loraConfigs));
            this.detectDuplicateAliases(data); // before sorting - see open() for why
            await this.preResolveNames(data);
            this.allLoras = this.sortLoras(data);
            this.allLorasHost = targetHost;
            this.processFolders();
            this.renderChips();
            this.filterAndRender(this.currentFolder);
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
        return data.sort((a, b) => {
            const aActive = activePrompt.includes(`<lora:${this.resolveTagIdentifier(a)}:`);
            const bActive = activePrompt.includes(`<lora:${this.resolveTagIdentifier(b)}:`);

            if (aActive && !bActive) return -1;
            if (!aActive && bActive) return 1;
            return displayNameFor(a).localeCompare(displayNameFor(b));
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

    // Guesses architecture from the filename/title by keyword (Forge gives none); used for Inpaint/img2img. Defaults to 'xl', since SDXL finetunes have no reliable keyword.
    detectCheckpointArchitecture: function(title) {
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

        const addChip = (label, count, { isFav = false, isActive = false, onClick } = {}) => {
            const chip = document.createElement('div');
            chip.className = 'folder-chip';
            if (isActive) chip.classList.add('active');
            if (isFav) chip.style.borderColor = 'var(--accent-secondary)';

            chip.innerHTML = `
                ${isFav ? '<i data-lucide="heart" size="10" fill="currentColor"></i>' : ''}
                <span style="${label === '★' ? 'font-size:16px; line-height:1;' : ''}">${escapeHtmlAttr(label)}</span>
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

        // "All" - every LoRA, no architecture filtering
        addChip('All', allList.length, {
            isActive: this.viewMode === 'all',
            onClick: () => {
                this.viewMode = 'all';
                localStorage.setItem('bojroLoraViewMode', 'all');
                this.filterAndRender('All');
            }
        });

        // Current-mode chip: LoRAs from folders mapped to the effective architecture (FOLDER_ARCH_MAP) plus unclassified ones. For Inpaint/img2img that is the detected architecture of the selected checkpoint.
        if (effectiveArch) {
            addChip(modeLabel, archList.length, {
                isActive: this.viewMode === 'arch',
                onClick: () => {
                    this.viewMode = 'arch';
                    localStorage.setItem('bojroLoraViewMode', 'arch');
                    this.filterAndRender('All');
                }
            });
        }

        // Starred LoRAs regardless of architecture.
        addChip('★', this.loraFavorites.length, {
            isActive: this.viewMode === 'starred',
            onClick: () => {
                this.viewMode = 'starred';
                // Not saved to localStorage (see open()), so reopening returns to the saved All/mode-filtered choice.
                this.filterAndRender('All');
            }
        });

        // Favourited folders are already architecture-specific.
        this.favorites.forEach(fav => {
            if (this.folders[fav]) {
                addChip(fav, this.folders[fav].length, {
                    isFav: true,
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
        const refreshBtn = document.querySelector('.lora-refresh-btn');
        const firstChip = container.querySelector('.folder-chip');
        if (refreshBtn && firstChip) {
            const chipHeight = firstChip.getBoundingClientRect().height;
            if (chipHeight > 0) {
                refreshBtn.style.height = `${chipHeight}px`;
                refreshBtn.style.width = `${chipHeight}px`;
            }
        }
    },

    // --- FILTER & VIRTUAL RENDER ---
    filterAndRender: function(folderName) {
        this.currentFolder = folderName;
        this.displayedCount = 0;

        const qEl = document.getElementById('loraSearch');
        const query = qEl ? qEl.value.toLowerCase() : "";

        // Get base list
        let list = this.folders[folderName] || [];

        // Search matches only the displayed name, not the raw filename.
        if(query) list = list.filter(l => this.getDisplayName(l).toLowerCase().includes(query));

        // Starred view: starred LoRAs only; while searching, widened to this model's architecture-matching LoRAs (as the ARCH tab would show).
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

        // Architecture filter only when the "[MODE]" chip is active.
        if (this.viewMode === 'arch' && effectiveArch) {
            list = list.filter(l => {
                const arch = this.detectLoraArchitecture(l);
                return arch === 'unknown' || arch === effectiveArch;
            });
        }

        // Re-sort
        this.filteredList = this.sortLoras(list);

        const container = document.getElementById('loraVerticalList');
        container.innerHTML = '';

        // Trigger Element for Scroll
        const trigger = document.createElement('div');
        trigger.id = 'lora-scroll-trigger';
        trigger.style.height = '20px';
        container.appendChild(trigger);

        this.renderMore(); // First batch

        if(this.observer) this.observer.observe(trigger);
    },

    renderMore: function() {
        const container = document.getElementById('loraVerticalList');
        const trigger = document.getElementById('lora-scroll-trigger');

        const batch = this.filteredList.slice(this.displayedCount, this.displayedCount + this.BATCH_SIZE);
        if(batch.length === 0) return;

        const activePrompt = this.getActivePrompt();

        batch.forEach(lora => {
            const tagId = this.resolveTagIdentifier(lora);
            const isActive = activePrompt.includes(`<lora:${tagId}:`);
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
            const cachedThumb = this.thumbnailMemCache[lora.name];
            row.innerHTML = `
                <img src="${cachedThumb || 'icon.png'}" class="lora-item-thumb" id="thumb-${this.simpleHash(lora.name)}">
                <div class="lora-item-info">
                    <div class="lora-item-name" id="${nameId}">${escapeHtmlAttr(initialName)}</div>
                    <div class="lora-item-meta">${isActive ? 'ACTIVE' : ''}</div>
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

            // Real closures rather than inline onclick strings (names with apostrophes).
            row.querySelector('.lora-btn-star').onclick = (event) => {
                event.stopPropagation();
                window.LoraManager.toggleLoraFavorite(lora.name);
            };
            row.querySelector('.lora-btn-action').onclick = (event) => {
                event.stopPropagation();
                window.openLoraSettings(event, lora.name, lora.path.replace(/\\/g, '/'));
            };

            container.insertBefore(row, trigger);

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
                        if (nameEl) nameEl.textContent = resolved;
                    }
                }, 50);
            }
        });

        this.displayedCount += batch.length;
        if(window.lucide) lucide.createIcons();
    },

    setupObserver: function() {
        const root = document.getElementById('loraVerticalList');
        const opts = { root: root, rootMargin: '100px', threshold: 0.1 };

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if(e.isIntersecting) this.renderMore();
            });
        }, opts);
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
                let tracked = this.appliedInsertions[mode] && this.appliedInsertions[mode][alias];
                // Backward compatibility: older records were a plain string, not {insertion, trigger}, with no known trigger text, so only the bare tag is removed.
                if (typeof tracked === 'string') tracked = { insertion: tracked, trigger: '' };

                if (tracked && tracked.insertion && val.includes(tracked.insertion)) {
                    // Exact match: removes the tag plus what was inserted with it (e.g. a trigger word).
                    val = val.split(tracked.insertion).join('');
                } else {
                    // No tracked insertion, or edited since: remove the bare tag first; never assume trailing text belongs to it.
                    const bareTagRegex = new RegExp(`<lora:${this.escapeRegExp(alias)}:[^>]+>`, 'gi');
                    val = val.replace(bareTagRegex, '');
                    // If the trigger words are known, also strip those still present exactly as inserted.
                    if (tracked && tracked.trigger) {
                        val = this.removeTriggerWords(val, tracked.trigger);
                    }
                }
                if (this.appliedInsertions[mode]) {
                    delete this.appliedInsertions[mode][alias];
                    this.saveInsertions(mode);
                }
            } else {
                // ADD
                if (window.Neo && window.Neo.appInjectConfig) {
                    // Awaited, because appInjectConfig fetches the sidecar config on first use, which can be slow over a tunnel.
                    await window.Neo.appInjectConfig(alias, name, promptEl);
                    this.filterAndRender(this.currentFolder);
                    return;
                }
            }

            // Collapse only horizontal whitespace within a line, keeping deliberate line breaks. Leading/trailing junk is stripped, then exactly one ", " is put back if anything remains (withTrailingComma(), utils.js), so the box ends the same after an add or a remove.
            promptEl.value = withTrailingComma(val
                .replace(/,\s*,/g, ',')
                .replace(/[ \t]{2,}/g, ' ')
                .replace(/\n[ \t]*\n/g, '\n')
                .replace(/\n[ \t]+/g, '\n')
                .replace(/[ \t]+\n/g, '\n')
                .replace(/^[\s,]+/, '')
                .replace(/[\s,]+$/, ''));
            // As the add path: programmatic assignment doesn't trigger the textarea's auto-save.
            if (typeof savePrompt === 'function') savePrompt(mode);
            // Takes this LoRA's "Additional Negative Prompts" back out of the Negative box. After the prompt is written back, since it checks which other LoRAs remain.
            this.removeAdditionalNegative(mode, alias);
            this.filterAndRender(this.currentFolder);
        } finally {
            delete this.togglesInFlight[lockKey];
        }
    },

    escapeRegExp: function(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },

    // Removes trigger words still present exactly as inserted, segment by segment (an edited segment is left whole). Comma and newline both separate; a capturing split keeps multi-line text intact.
    removeTriggerWords: function(text, triggerSource) {
        const remainingWords = triggerSource.split(/[,\n]/).map(t => t.trim()).filter(t => t.length > 0);
        const parts = text.split(/([,\n])/);
        const kept = [];
        for (let i = 0; i < parts.length; i += 2) {
            const raw = parts[i];
            const sep = parts[i + 1];
            const trimmedVal = raw.trim();
            const idx = trimmedVal.length > 0 ? remainingWords.indexOf(trimmedVal) : -1;
            if (idx !== -1) {
                remainingWords.splice(idx, 1);
            } else {
                kept.push(raw);
                if (sep !== undefined) kept.push(sep);
            }
        }
        return kept.join("")
            .replace(/,\s*,/g, ",")
            .replace(/\n[ \t]*\n/g, "\n")
            .replace(/\n[ \t]+/g, "\n")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/^[\s,]+/, "")
            .replace(/[\s,]+$/, "")
            .trim();
    },

    // =========================================================
    // SMART THUMBNAIL ENGINE (FILE PATH GUESSING)
    // =========================================================

    smartLoadThumbnail: async function(imgEl, lora) {
        // A LoRA with a metaCache entry (persisted across restarts) is trusted: read the disk file immediately and skip the network probe. Only new LoRAs go through the full check-and-download flow, and a missing or unreadable disk file falls through to it.
        if (this.fs && this.metaCache.hasOwnProperty(lora.name)) {
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

        // Possible extensions to try
        const candidates = ['.png', '.jpg', '.preview.png', '.jpeg', '.webp'];

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
                if (res.ok) {
                    return {
                        url: url,
                        date: res.headers.get('Last-Modified') || res.headers.get('Content-Length')
                    };
                }
            } catch(e) {}
            return null;
        };

        // 4. Find valid server image
        let validServerImg = null;
        // Try provided thumbnail first if API gives it
        if(lora.thumbnail) {
             // API provided explicit path?
        }

        // Loop candidates
        for (let ext of candidates) {
            validServerImg = await checkServer(ext);
            if (validServerImg) break;
        }

        if (!validServerImg) return; // No image found on server

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
            // Compress to small thumbnail
            const cvs = document.createElement('canvas');
            const scale = 140 / img.width;
            cvs.width = 140;
            cvs.height = img.height * scale;
            const ctx = cvs.getContext('2d');
            ctx.drawImage(img, 0, 0, cvs.width, cvs.height);

            const b64 = cvs.toDataURL('image/jpeg', 0.8).split(',')[1];

            // Display
            const dataUrl = `data:image/jpeg;base64,${b64}`;
            imgEl.src = dataUrl;
            this.thumbnailMemCache[loraName] = dataUrl;

            // Save
            try {
                try { await this.fs.mkdir({ path: this.CACHE_DIR, directory: 'CACHE' }); } catch(e){}

                await this.fs.writeFile({
                    path: path,
                    data: b64,
                    directory: 'CACHE'
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
                <i data-lucide="${isFav ? 'heart' : 'folder'}" size="14" style="color:${isFav ? 'var(--error)' : 'var(--text-muted)'}"></i>
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
};

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