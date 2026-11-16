window.StyleManager = {
    styles: [],
    // style::NAME, its name running to the next comma or line (spaces and underscores alike, any case).
    tokenKey: n => String(n).trim().replace(/[\s_]+/g, ' ').toLowerCase(),
    styleForToken(name) {
        const k = this.tokenKey(name);
        return k ? this.styles.find(s => this.tokenKey(s.name) === k) || null : null;
    },
    // The names of the styles a text calls for.
    tokensIn(text) {
        return [...String(text || '').matchAll(/style::([^,\n<>]+)/gi)].map(m => this.styleForToken(m[1])).filter(Boolean).map(s => s.name);
    },
    // A job's prompts with style::NAME put in (engine.js: before wildcards, and again in runJob()). Unknown names stay.
    expandTokens(p) {
        if (!p || !this.styles.length) return;
        const negs = [];
        const tidy = t => String(t || '').replace(/\{prompt\}/g, '').replace(/^[\s,]+|[\s,]+$/g, '');
        const put = (text, side) => (typeof text !== 'string' || !/style::/i.test(text) ? text : text.replace(/style::([^,\n<>]+)/gi, (m, name) => {
            const s = this.styleForToken(name);
            if (!s) return m;
            if (side === 'prompt' && tidy(s.negative_prompt)) negs.push(tidy(s.negative_prompt));
            return tidy(side === 'prompt' ? s.prompt : s.negative_prompt);
        }).replace(/,(\s*,)+/g, ',').replace(/^[\s,]+/, ''));
        const add = text => {
            const have = new Set(String(text || '').split(',').map(t => this.tokenKey(t)).filter(Boolean));
            const extra = [];
            negs.join(', ').split(',').map(t => t.trim()).filter(Boolean).forEach(t => { if (!have.has(this.tokenKey(t))) { have.add(this.tokenKey(t)); extra.push(t); } });
            if (!extra.length) return text;
            const base = String(text || '').replace(/[\s,]+$/, '');
            return base ? `${base}, ${extra.join(', ')}` : extra.join(', ');
        };
        p.prompt = put(p.prompt, 'prompt');
        if (p.hr_prompt) p.hr_prompt = put(p.hr_prompt, 'prompt');
        p.negative_prompt = put(p.negative_prompt, 'neg');
        if (p.hr_negative_prompt) p.hr_negative_prompt = put(p.hr_negative_prompt, 'neg');
        (p.alwayson_scripts?.ADetailer?.args || []).forEach(a => {
            if (!a || typeof a !== 'object') return;
            if (a.ad_prompt) a.ad_prompt = put(a.ad_prompt, 'prompt');
            if (a.ad_negative_prompt) a.ad_negative_prompt = put(a.ad_negative_prompt, 'neg');
        });
        if (negs.length) {
            p.negative_prompt = add(p.negative_prompt);
            if (p.hr_negative_prompt) p.hr_negative_prompt = add(p.hr_negative_prompt);
        }
    },
    // Selected styles, one Set per mode (xl/flux/qwen/anima/krea/inp/img2img), so a style applied in one mode isn't highlighted in another.
    selectedStylesByMode: {},
    // { mode: { styleName: { promptSegment, negSegment } } }: the tags each style added (or took over from another, claimTag()), which are the ones removed with it.
    appliedInsertions: {},
    fs: window.Capacitor ? window.Capacitor.Plugins.Filesystem : null,
    DIR: 'Resolver/styles',
    FILE: 'Resolver/styles/styles.csv',
    // Couple styles (with Forge Couple regions) are kept apart from styles.csv, which Forge reads too.
    COUPLE_FILE: 'Resolver/styles/couple-styles.json',
    COUPLE_KEY: 'resolver_couple_styles',
    coupleOnly: localStorage.getItem('bojroStyleCoupleOnly') === 'true',
    editingOldName: null,
    // Thumbnails by style name (IndexedDB, not styles.csv, which Forge reads too), all read into memory at start.
    thumbs: {},
    THUMB_DB: 'bojro_style_thumbs',
    // Search the prompts as well as the names (the switch in the search box), off by default.
    searchPrompts: localStorage.getItem('bojroStyleSearchPrompts') === 'true',
    // The editor's picked thumbnail until SAVE: undefined unchanged, null removed, or a data URL.
    pendingThumb: undefined,

    init: async function() {
        // 1. Instant recovery from LocalStorage so UI isn't empty on boot
        const cache = localStorage.getItem('resolver_styles_fallback');
        if (cache) {
            try {
                this.styles = JSON.parse(cache);
            } catch(e) { console.error("Cache parse failed", e); }
        }

        // Restores active styles and their insertions (see saveSelectionState()).
        this.restoreSelectionState();
        this.thumbsReady = this.loadThumbs().then(() => {
            if (!document.getElementById('styleModal')?.classList.contains('hidden')) this.render();
        });

        // 2. Initialize Filesystem and try to load the physical CSV
        if (this.fs) {
            // The saved list stays the source of truth (an earlier install's styles.csv can't be overwritten),
            // so the file only restores styles when the app has none. No mkdir: on an existing folder it threw and skipped this.
            if (!cache) {
                await this.loadLocalCSV();
                if (this.styles.length) localStorage.setItem('resolver_styles_fallback', JSON.stringify(this.styles));
            }
        }
        await this.loadCouple();
    },
    // Couple styles: the saved list, or the file when there's none (a new install).
    loadCouple: async function() {
        let list = null;
        try { list = JSON.parse(localStorage.getItem(this.COUPLE_KEY) || 'null'); } catch (e) {}
        if (!Array.isArray(list) && this.fs) {
            try {
                const ret = await this.fs.readFile({ path: this.COUPLE_FILE, directory: 'DOCUMENTS', encoding: 'utf8' });
                const j = JSON.parse(ret.data);
                list = Array.isArray(j) ? j : j && Array.isArray(j.coupleStyles) ? j.coupleStyles : null;
                if (list) localStorage.setItem(this.COUPLE_KEY, JSON.stringify(list));
            } catch (e) {}
        }
        const ok = (Array.isArray(list) ? list : []).filter(s => s && typeof s.name === 'string' && s.fc && Array.isArray(s.fc.regions));
        const have = new Set(this.styles.map(s => s.name));
        this.styles = this.styles.filter(s => !s.fc).concat(ok.filter(s => !have.has(s.name) || this.styles.find(x => x.name === s.name && x.fc)));
        this.paintCoupleBtn();
    },

    // The mode whose boxes the window works on: the one it was opened for (img2img passes 'inp'), or the main tab's.
    activeMode: function() {
        return this.targetMode || (typeof currentMode !== 'undefined' ? currentMode : 'xl');
    },

    open: function(mode) {
        this.targetMode = mode || null;
        // The search is kept from the last time this session, as the LoRA window's (the app starts with it empty).
        const search = document.getElementById('styleSearch');
        if (search) search.value = this.lastSearch || '';
        document.getElementById('styleModal').classList.remove('hidden');
        if (typeof lockBodyScroll === 'function') lockBodyScroll();
        this.detectAppliedStyles();
        this.render();
        const list = document.getElementById('styleList');
        if (list) list.scrollTop = 0;
    },

    // --- THUMBNAILS ---
    thumbDb: function() {
        if (!this.thumbDbPromise) this.thumbDbPromise = new Promise(resolve => {
            try {
                const req = indexedDB.open(this.THUMB_DB, 1);
                req.onupgradeneeded = () => req.result.createObjectStore('thumbs');
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
        return this.thumbDbPromise;
    },
    thumbRun: async function(mode, fn) {
        const db = await this.thumbDb();
        if (!db) return;
        return new Promise(resolve => {
            try {
                const tx = db.transaction('thumbs', mode);
                fn(tx.objectStore('thumbs'));
                tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
            } catch (e) {
                resolve();
            }
        });
    },
    loadThumbs: async function() {
        const out = {};
        await this.thumbRun('readonly', store => {
            const req = store.openCursor();
            req.onsuccess = () => { const c = req.result; if (c) { out[c.key] = c.value; c.continue(); } };
        });
        this.thumbs = out;
    },
    // url null removes it.
    setThumb: function(name, url) {
        if (url) this.thumbs[name] = url;
        else delete this.thumbs[name];
        return this.thumbRun('readwrite', store => (url ? store.put(url, name) : store.delete(name)));
    },
    // Thumbnails whose style is gone (Clean Up Model Data, loracleanup.js).
    orphanThumbNames: function() {
        return Object.keys(this.thumbs).filter(n => !this.styles.some(s => s.name === n));
    },
    removeThumbs: async function(names) {
        for (const n of names) await this.setThumb(n, null);
    },
    // For Backup & Restore (backup.js): { name: data URL }; a restore replaces them all.
    allThumbs: async function() {
        if (this.thumbsReady) await this.thumbsReady;
        return { ...this.thumbs };
    },
    restoreThumbs: async function(thumbs) {
        await this.thumbRun('readwrite', store => store.clear());
        this.thumbs = {};
        for (const [name, url] of Object.entries(thumbs)) await this.setThumb(name, url);
    },
    // The editor's thumbnail: the pending one, else the style's own.
    paintEditorThumb: function() {
        const own = this.editingOldName ? this.thumbs[this.editingOldName] : null;
        const url = this.pendingThumb !== undefined ? this.pendingThumb : own;
        document.getElementById('styleThumbImg').src = url || 'icon.png';
        document.getElementById('styleThumbRemove')?.classList.toggle('hidden', !url);
    },
    setPendingThumb: async function(source) {
        try {
            if (!window.LoraVariants) throw new Error('That image could not be read.');
            this.pendingThumb = await window.LoraVariants.makeThumb(source);
            this.paintEditorThumb();
        } catch (e) {
            if (typeof Toast !== 'undefined') Toast.show({ text: e.message, duration: 'short' });
        }
    },
    thumbPicked: function(input) {
        const file = input.files && input.files[0];
        input.value = '';
        if (file) this.setPendingThumb(file);
    },
    thumbRemoved: function() {
        this.pendingThumb = null;
        this.paintEditorThumb();
    },
    // The newest image in History (the gallery's database, utils.js).
    thumbFromHistory: async function() {
        const url = await new Promise(resolve => {
            try {
                if (typeof db === 'undefined' || !db) return resolve(null);
                const req = db.transaction(['images'], 'readonly').objectStore('images').openCursor(null, 'prev');
                req.onsuccess = () => resolve(req.result ? (req.result.value.thumbnail || req.result.value.data) : null);
                req.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
        if (!url) {
            if (typeof Toast !== 'undefined') Toast.show({ text: 'No images in History yet', duration: 'short' });
            return;
        }
        try {
            await this.setPendingThumb(await (await fetch(url)).blob());
        } catch (e) {
            if (typeof Toast !== 'undefined') Toast.show({ text: 'That image could not be read.', duration: 'short' });
        }
    },

    // --- SYNC & FILESYSTEM ---
    syncWithServer: async function() {
        const host = typeof buildWebUIUrl === 'function' ? buildWebUIUrl() : "";
        
        // Guard against uninitialized network config
        if (!host || host.includes('undefined') || host.length < 5) {
            return await window.appAlert("Connection not ready. Please wait 2 seconds or check CFG.", { title: 'Not Ready' });
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); 

            const res = await fetch(`${host}/sdapi/v1/prompt-styles`, {
                signal: controller.signal,
                headers: typeof getHeaders === 'function' ? getHeaders() : {}
            });
            clearTimeout(timeoutId);

            if (!res.ok) throw new Error(`Server responded ${res.status}`);

            const serverData = await res.json();
            if (!Array.isArray(serverData)) throw new Error("Unexpected response shape from server");
            
            serverData.forEach(ss => {
                const incoming = {
                    name: ss.name,
                    prompt: ss.prompt || ss.value || "",
                    negative_prompt: ss.negative_prompt || ""
                };
                const existing = this.styles.find(ls => ls.name === ss.name);
                // A couple style of the same name is left as it is.
                if (existing && existing.fc) return;
                if (existing) {
                    // The server is the source of truth on sync, so refresh existing styles in place.
                    existing.prompt = incoming.prompt;
                    existing.negative_prompt = incoming.negative_prompt;
                } else {
                    this.styles.push(incoming);
                }
            });

            await this.writeToDisk();
            this.render();
            await window.appAlert("Sync Successful: " + serverData.length + " styles loaded.", { title: 'Sync Complete' });
        } catch (e) { 
            console.error("Style Sync Error:", e);
            await window.appAlert("Connection failed. Ensure WebUI is running with --api and your network is stable.", { title: 'Sync Failed', danger: true }); 
        }
    },

    loadLocalCSV: async function() {
        if (!this.fs) return;
        try {
            const ret = await this.fs.readFile({ 
                path: this.FILE, 
                directory: 'DOCUMENTS', 
                encoding: 'utf8' 
            });
            if (!ret.data) return;
            
            // CSV with quoted fields that may hold commas, doubled quotes and line breaks (as writeToDisk() and Forge write it).
            const rows = [];
            let row = [], field = '', quoted = false;
            const text = ret.data.replace(/\r\n?/g, '\n');
            for (let i = 0; i < text.length; i++) {
                const c = text[i];
                if (quoted) {
                    if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
                    else if (c === '"') quoted = false;
                    else field += c;
                } else if (c === '"') quoted = true;
                else if (c === ',') { row.push(field); field = ''; }
                else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
                else field += c;
            }
            if (field || row.length) { row.push(field); rows.push(row); }
            const parsed = rows.slice(1).filter(r => r.some(f => f.trim())).map(parts => ({
                name: (parts[0] || '').trim(),
                prompt: (parts[1] || '').trim(),
                negative_prompt: (parts[2] || '').trim()
            }));
            
            if (parsed.length > 0) this.styles = parsed;
        } catch (e) {
            console.log("No local file found, using cache.");
        }
    },

    writeToDisk: async function() {
        // 1. Immediate save to LocalStorage (Reliable on restart); couple styles to their own key and file.
        const plain = this.styles.filter(s => !s.fc), couple = this.styles.filter(s => s.fc);
        localStorage.setItem('resolver_styles_fallback', JSON.stringify(plain));
        localStorage.setItem(this.COUPLE_KEY, JSON.stringify(couple));
        if (this.fs) {
            try { await this.fs.writeFile({ path: this.COUPLE_FILE, data: JSON.stringify({ app: 'Resolver', type: 'couple-styles', coupleStyles: couple }, null, 2), directory: 'DOCUMENTS', encoding: 'utf8', recursive: true }); }
            catch (e) { console.error('Couple styles write failed', e); }
        }
        this.paintCoupleBtn();

        // 2. Generate CSV for Filesystem
        const q = v => `"${String(v || '').replace(/"/g, '""')}"`;
        let csv = "name,prompt,negative_prompt\n";
        plain.forEach(s => {
            csv += `${q(s.name)},${q(s.prompt)},${q(s.negative_prompt)}\n`;
        });

        // 3. Save to physical storage
        if (this.fs) {
            try {
                await this.fs.writeFile({ 
                    path: this.FILE, 
                    data: csv, 
                    directory: 'DOCUMENTS', 
                    encoding: 'utf8',
                    recursive: true
                });
            } catch(e) {
                console.error("FS Write failed", e);
                // Android only lets the app overwrite a file it made since it was installed, so one left by an earlier
                // install stays as it was. Said once a session; deleting the file lets the app make a new one.
                if (!this.csvWriteWarned) {
                    this.csvWriteWarned = true;
                    if (typeof Toast !== 'undefined' && Toast) Toast.show({ text: "Couldn't update styles.csv. Delete it in Documents/Resolver/styles and the app will make a new one.", duration: 'long' });
                }
            }
        }
    },

    // --- UI RENDERING ---
    // Lazily creates each mode's Set on first use.
    getSelectedStylesForMode: function(mode) {
        if (!this.selectedStylesByMode[mode]) this.selectedStylesByMode[mode] = new Set();
        return this.selectedStylesByMode[mode];
    },

    // Favourites (item 76): names kept in localStorage; the view stays while the app runs, off on a fresh start.
    FAV_KEY: 'bojroStyleFavs',
    favOnly: false,
    favs: function() { try { return new Set(JSON.parse(localStorage.getItem(this.FAV_KEY) || '[]')); } catch (e) { return new Set(); } },
    saveFavs: function(set) { try { localStorage.setItem(this.FAV_KEY, JSON.stringify([...set])); } catch (e) {} },
    toggleFav: function(name) {
        const set = this.favs();
        if (set.has(name)) set.delete(name); else set.add(name);
        this.saveFavs(set);
        this.render();
    },
    toggleFavOnly: function() {
        this.favOnly = !this.favOnly;
        this.render();
    },
    paintFavOnly: function() {
        const b = document.getElementById('styleFavOnly');
        if (!b) return;
        b.classList.toggle('on', this.favOnly);
        b.setAttribute('aria-pressed', this.favOnly ? 'true' : 'false');
        b.title = this.favOnly ? 'Show all' : 'Show favorites';
        const svg = b.querySelector('svg');
        if (svg) svg.setAttribute('fill', this.favOnly ? 'currentColor' : 'none');
    },
    // Style editor: a red line under a box naming the wildcards it calls that aren't in the library (item 65).
    paintMissingWildcards: function() {
        const modal = document.getElementById('styleEditorModal');
        if (!modal || modal.classList.contains('hidden')) return;
        const on = window.Wildcards && Wildcards.enabled && Wildcards.enabled() && window.WcEngine;
        const known = on ? new Set(Wildcards._lib.read().map(w => WcEngine.nameKey(w.name))) : null;
        const missing = text => {
            if (!on || !text) return [];
            const out = [];
            for (const m of String(text).matchAll(new RegExp(WcEngine.CALL.source, 'g'))) {
                const k = WcEngine.nameKey(m[1]);
                if (!known.has(k) && !out.some(x => WcEngine.nameKey(x) === k)) out.push(m[1]);
            }
            return out;
        };
        const fcOn = !document.getElementById('styleFcSection')?.classList.contains('hidden');
        const groups = [
            { at: document.getElementById('styleEditPrompt'), texts: [document.getElementById('styleEditPrompt')?.value], key: 'p', show: !fcOn },
            { at: document.getElementById('styleFcAdd'), texts: [...document.querySelectorAll('#styleFcSection textarea')].map(t => t.value), key: 'fc', show: fcOn },
            { at: document.getElementById('styleEditNeg'), texts: [document.getElementById('styleEditNeg')?.value], key: 'n', show: true }
        ];
        const ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>';
        groups.forEach(g => {
            if (!g.at) return;
            const after = g.at.parentElement && g.at.parentElement.classList.contains('cap-wrap') ? g.at.parentElement : g.at;
            let hint = modal.querySelector(`.st-wc-missing[data-k="${g.key}"]`);
            const names = g.show ? [...new Set(g.texts.flatMap(missing))] : [];
            if (!names.length) { if (hint) hint.remove(); return; }
            if (!hint) { hint = document.createElement('div'); hint.className = 'st-wc-missing'; hint.dataset.k = g.key; }
            if (hint.previousElementSibling !== after) after.after(hint);
            hint.innerHTML = `${ICON}<span>No wildcard${names.length > 1 ? 's' : ''} called ${names.map(n => `<span class="wc-token">__${escapeHtmlAttr(n)}__</span>`).join(', ')}</span>`;
        });
    },

    toggleSearchPrompts: function() {
        this.searchPrompts = !this.searchPrompts;
        localStorage.setItem('bojroStyleSearchPrompts', this.searchPrompts ? 'true' : 'false');
        if (typeof Toast !== 'undefined') Toast.show({ text: this.searchPrompts ? 'Searching prompts' : 'Searching names only', duration: 'short' });
        this.render();
    },

    // A row's name: a bracket at the end goes on a line under it ("Anime (Ghibli)"); " - " stays.
    nameHtml: function(name, extra) {
        const esc = typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr : String;
        const main = t => (typeof nameHtmlKeepBrackets === 'function' ? nameHtmlKeepBrackets(t) : esc(t));
        const m = /^(.*\S)\s*\(([^()]*)\)\s*$/.exec(String(name));
        if (m && m[2].trim()) return `<span class="st-main">${main(m[1])}</span>${extra}<span class="lora-item-sub">${esc(m[2].trim())}</span>`;
        return `<span class="st-main">${main(name)}</span>${extra}`;
    },

    render: function() {
        const container = document.getElementById('styleList');
        const rawQuery = document.getElementById('styleSearch').value;
        const query = searchQuery(rawQuery);
        const clearBtn = document.getElementById('styleSearchClear');
        if (clearBtn) clearBtn.classList.toggle('hidden', !rawQuery);
        container.innerHTML = '';

        const mode = window.StyleManager.activeMode();
        const selectedForMode = this.getSelectedStylesForMode(mode);
        const btn = document.getElementById('styleSearchPrompts');
        if (btn) { btn.classList.toggle('active', this.searchPrompts); btn.setAttribute('aria-pressed', this.searchPrompts ? 'true' : 'false'); }
        this.paintCoupleBtn();
        this.paintFavOnly();
        const favs = this.favs(), favFirst = this.favOnly && !!query;
        // The Forge Couple button: only couple styles; favourites view: favourites only, unless searching (item 76).
        let pool = this.coupleOnly ? this.styles.filter(s => s.fc) : this.styles;
        if (this.favOnly && !query) pool = pool.filter(s => favs.has(s.name));
        // Then the order chosen with the sort button (item 85); styles are kept in the order they were made.
        const madeAt = new Map(this.styles.map((st, i) => [st, i]));
        const order = ListSort.compare('style', { name: st => st.name, key: st => st.name.toLowerCase(), added: st => madeAt.get(st) || 0 });
        ListSort.paint(document.getElementById('styleSortBtn'), 'style');
        // A copy is sorted: with no search this was the saved list itself, so the order they were made in was lost.
        searchFilter(pool, s => (this.searchPrompts ? [s.name, s.prompt || ''].concat(s.fc ? s.fc.regions.map(r => r.t || '') : []) : [s.name]), query).slice()
            // Active styles first, as in the LoRA list.
            .sort((a, b) => (selectedForMode.has(b.name) - selectedForMode.has(a.name)) || (favFirst ? favs.has(b.name) - favs.has(a.name) : 0) || order(a, b))
            .forEach(style => {
            const isActive = selectedForMode.has(style.name);
            // Tapped but missing some of its tags: dashed outline and a count.
            const count = isActive ? this.styleCount(mode, style) : null;
            const isPartial = isActive && this.isPartial(count);

            const row = document.createElement('div');
            row.className = `lora-item-row style-row${isActive ? (isPartial ? ' st-partial' : ' active') : ''}`;
            row.innerHTML = `
                ${style.fc ? `<div class="lv-thumb-wrap"><img src="${this.thumbs[style.name] || 'icon.png'}" class="lora-item-thumb"><span class="lv-thumb-count" title="Forge Couple: ${style.fc.regions.length} regions"><i data-lucide="columns-2" width="11" height="11"></i>${style.fc.regions.length}</span></div>` : `<img src="${this.thumbs[style.name] || 'icon.png'}" class="lora-item-thumb">`}
                <div class="lora-item-info st-info">
                    <div class="lora-item-name st-name">${this.nameHtml(style.name, isPartial ? `<span class="st-count">${count.present}/${count.total}</span>` : '')}</div>
                    <div class="st-prev">${escapeHtmlAttr(style.prompt || '')}</div>
                </div>
                <div class="lora-star-toggle-stack">
                    <button class="lora-btn-star st-fav${favs.has(style.name) ? ' on' : ''}" title="Favorite" aria-label="Favorite" aria-pressed="${favs.has(style.name)}"><i data-lucide="star" size="16" ${favs.has(style.name) ? 'fill="currentColor"' : ''}></i></button>
                    <button class="lora-btn-action style-edit-btn" title="Edit"><i data-lucide="pencil" width="16" height="16"></i></button>
                </div>
            `;
            // Real closures rather than inline onclick strings, so names with apostrophes work.
            row.onclick = () => window.StyleManager.toggleSelection(style.name);
            row.querySelector('.st-fav').onclick = (event) => {
                event.stopPropagation();
                window.StyleManager.toggleFav(style.name);
            };
            row.querySelector('.style-edit-btn').onclick = (event) => {
                event.stopPropagation();
                window.StyleManager.openEditor(style.name);
            };
            container.appendChild(row);
        });
        // As the presets window's.
        if (!container.children.length) container.innerHTML = `<div class="empty-note" style="padding:15px;">${this.favOnly && !query && !pool.length ? 'No favorite styles yet. Tap a star to add one.' : this.coupleOnly && !pool.length ? 'No Forge Couple styles yet' : this.styles.length ? 'No styles match your search' : 'No styles saved yet'}</div>`;
        if (window.lucide) lucide.createIcons();
        this.fitPreviews(container);
        this.fitListHeight();
        if (typeof ResizeObserver === 'function') {
            if (!this.nameObserver) this.nameObserver = new ResizeObserver(entries => entries.forEach(e => this.fitPreviews(e.target.parentElement)));
            this.nameObserver.disconnect();
            container.querySelectorAll('.st-name').forEach(n => this.nameObserver.observe(n));
        }
    },

    // The prompt fills the lines the name leaves.
    fitPreviews: function(container) {
        (container.classList.contains('st-info') ? [container] : container.querySelectorAll('.st-info')).forEach(info => {
            const prev = info.querySelector('.st-prev');
            const name = info.querySelector('.st-name');
            if (!info.clientHeight) return;
            info.style.gap = prev.style.lineHeight = '';
            const fit = gap => Math.floor((info.clientHeight - name.offsetHeight - gap) / (parseFloat(getComputedStyle(prev).lineHeight) || 16));
            let lines = fit(3);
            // A two-line name still leaves two lines of prompt, a little tighter.
            if (lines < 2 && name.offsetHeight <= 2.5 * (parseFloat(getComputedStyle(name).lineHeight) || 19)) {
                info.style.gap = '1px';
                prev.style.lineHeight = '1.2';
                lines = fit(1);
            }
            prev.style.webkitLineClamp = String(Math.max(1, lines));
        });
    },

    // Four whole rows, or as many as fit on screen (ui.js).
    fitListHeight: function() {
        const list = document.getElementById('styleList');
        if (list) fitListToWholeRows(list, list.querySelectorAll('.style-row'), 1, 4, 0);
    },

    // Styles whose own tags (not the default prompt's) are in the boxes count as tapped: all of them, or partial (3+
    // tags, over half present, at most 3 missing). Not when every one of its tags there belongs to a tapped style or LoRA.
    detectAppliedStyles: function() {
        const mode = window.StyleManager.activeMode();
        const selected = this.getSelectedStylesForMode(mode);
        const promptText = (document.getElementById(`${mode}_prompt`) || {}).value || '';
        const lora = window.LoraManager;
        let changed = false;
        this.styles.forEach(style => {
            // Couple styles only by a tap (their regions aren't in the prompt box).
            if (selected.has(style.name) || style.fc) return;
            const count = this.styleCount(mode, style);
            if (!count.own) return;
            const missing = count.total - count.present;
            if (missing && (count.total < 3 || count.present * 2 <= count.total || missing > 3)) return;
            const covered = ['prompt', 'neg'].every(side => {
                const el = document.getElementById(`${mode}_${side}`);
                const box = el ? boxTagSet(el) : new Set();
                const defaults = this.defaultTagSet(mode, side);
                return this.styleTags(style, side, mode).map(normaliseTag).filter(n => !defaults.has(n) && box.has(n)).every(n =>
                    [...selected].some(other => { const s = this.styles.find(x => x.name === other); return s && this.styleTags(s, side, mode).some(t => normaliseTag(t) === n); })
                    || (lora && (side === 'neg' ? lora.claimNegative(mode, n) : lora.claimTrigger(mode, n, null, promptText))));
            });
            if (covered) return;
            selected.add(style.name);
            changed = true;
        });
        if (changed) this.saveSelectionState();
    },

    // --- TOGGLE & INJECT ---
    // Tapping a style: adds it; a partly present one gets its missing tags back; a complete one is removed.
    toggleSelection: async function(name) {
        const mode = window.StyleManager.activeMode();
        // The trigger words of LoRAs in the prompt need to be known, so a removal leaves the ones they use.
        const pEl = document.getElementById(`${mode}_prompt`);
        if (window.LoraManager && pEl && /<lora:/i.test(pEl.value)) await window.LoraManager.loadPromptLoraConfigs(mode, pEl.value);
        const selectedForMode = this.getSelectedStylesForMode(mode);
        const style = this.styles.find(s => s.name === name);
        if (style && style.fc) return this.toggleCouple(mode, style);
        if (!selectedForMode.has(name)) {
            selectedForMode.add(name);
            this.applyStyleToPrompts(name, true);
        } else if (style && this.isPartial(this.styleCount(mode, style))) {
            this.applyStyleToPrompts(name, true);
        } else {
            selectedForMode.delete(name);
            this.applyStyleToPrompts(name, false);
        }
        this.dropCoveredPartials(mode, name);
        this.render();
    },

    // A couple style: on turns Forge Couple on with its layout and regions (one couple style at a time) and adds its
    // background and negative as a style's; off takes them out and turns Forge Couple off.
    toggleCouple: function(mode, style) {
        const FC = window.ForgeCouple, selected = this.getSelectedStylesForMode(mode);
        if (!FC || !FC.supports(mode)) {
            if (typeof Toast !== 'undefined') Toast.show({ text: 'Forge Couple styles are for SDXL and Anima', duration: 'short' });
            return;
        }
        if (selected.has(style.name)) {
            selected.delete(style.name);
            this.applyStyleToPrompts(style.name, false);
            FC.off(mode);
        } else {
            this.styles.filter(s => s.fc && s.name !== style.name && selected.has(s.name)).forEach(s => { selected.delete(s.name); this.applyStyleToPrompts(s.name, false); });
            selected.add(style.name);
            this.applyStyleToPrompts(style.name, true);
            FC.load(mode, style.fc);
            if (!FC.shown() && typeof Toast !== 'undefined') Toast.show({ text: 'Turn on Forge Couple in Config > Extensions to use its regions', duration: 'long' });
        }
        this.saveSelectionState();
        this.render();
    },
    // The Forge Couple button in the header: shown with Forge Couple on in Config, or couple styles saved.
    paintCoupleBtn: function() {
        const b = document.getElementById('styleCoupleBtn');
        if (!b) return;
        const any = this.styles.some(s => s.fc), show = any || !!(window.ForgeCouple && ForgeCouple.shown());
        if (!show && this.coupleOnly) this.coupleOnly = false;
        b.classList.toggle('hidden', !show);
        b.classList.toggle('active', this.coupleOnly);
        b.setAttribute('aria-pressed', this.coupleOnly ? 'true' : 'false');
    },
    toggleCoupleOnly: function() {
        this.coupleOnly = !this.coupleOnly;
        localStorage.setItem('bojroStyleCoupleOnly', this.coupleOnly ? 'true' : 'false');
        this.render();
    },

    // ---- the couple style editor (the style editor with the background and region boxes) ----
    editFc: null,
    setEditorKind: function(fc) {
        this.editFc = fc ? JSON.parse(JSON.stringify(fc)) : null;
        document.getElementById('styleFcSection').classList.toggle('hidden', !fc);
        document.getElementById('styleEditPromptWrap').classList.toggle('hidden', !!fc);
        // random::style doesn't pick couple styles, so no switch for it.
        document.getElementById('styleEditInRandom').closest('.row').classList.toggle('hidden', !!fc);
        if (fc) this.paintFcEditor();
    },
    paintFcEditor: function() {
        const f = this.editFc, FC = window.ForgeCouple;
        if (!f || !FC) return;
        document.querySelectorAll('#styleFcMode .toggle-opt').forEach(b => b.classList.toggle('active', b.dataset.v === f.mode));
        document.querySelectorAll('#styleFcDir .toggle-opt').forEach(b => b.classList.toggle('active', b.dataset.v === f.dir));
        document.getElementById('styleFcDir').classList.toggle('hidden', f.mode === 'advanced');
        const nm = FC.regionNames(f), esc = typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr : String;
        const box = document.getElementById('styleFcRegions');
        box.innerHTML = f.regions.map((r, i) => `<div><div class="fc-reg-head"><span class="fc-dot" style="background:${FC.colour(i)}"></span><label for="styleFcR${i}">${esc(nm[i])}</label>`
            + (i >= 2 ? `<button type="button" class="wc-x" style="margin-left:auto;" aria-label="Remove ${esc(nm[i])}" data-i="${i}">×</button>` : '')
            + `</div><textarea id="styleFcR${i}" rows="${localStorage.getItem('bojroTallPrompt') === 'true' ? 4 : 2}" data-i="${i}"></textarea></div>`).join('');
        box.querySelectorAll('textarea').forEach(t => { t.value = f.regions[+t.dataset.i].t || ''; t.oninput = () => { f.regions[+t.dataset.i].t = t.value; }; });
        box.querySelectorAll('.wc-x').forEach(b => { b.onclick = () => { f.regions.splice(+b.dataset.i, 1); this.paintFcEditor(); }; });
        document.getElementById('styleFcAdd').classList.toggle('hidden', f.regions.length >= FC.MAX);
    },
    setFc: function(key, v) {
        if (!this.editFc) return;
        this.editFc[key] = v;
        this.paintFcEditor();
    },
    addFcRegion: function() {
        if (!this.editFc || this.editFc.regions.length >= window.ForgeCouple.MAX) return;
        this.editFc.regions.push({ t: '' });
        this.paintFcEditor();
        const last = document.getElementById(`styleFcR${this.editFc.regions.length - 1}`);
        if (last) last.focus();
    },

    // Partial styles are checked again without the tags complete tapped styles and LoRAs own; one no longer mostly there
    // stops being highlighted (its tags stay).
    dropCoveredPartials: function(mode, exceptName) {
        const selected = this.getSelectedStylesForMode(mode);
        const promptText = (document.getElementById(`${mode}_prompt`) || {}).value || '';
        const lora = window.LoraManager;
        const complete = [...selected].map(n => this.styles.find(x => x.name === n))
            .filter(s => s && !this.isPartial(this.styleCount(mode, s)));
        let changed = false;
        [...selected].forEach(name => {
            if (name === exceptName) return;
            const style = this.styles.find(x => x.name === name);
            if (!style || !this.isPartial(this.styleCount(mode, style))) return;
            let total = 0, present = 0;
            ['prompt', 'neg'].forEach(side => {
                const el = document.getElementById(`${mode}_${side}`);
                if (!el) return;
                const box = boxTagSet(el);
                const defaults = this.defaultTagSet(mode, side);
                new Set(this.styleTags(style, side, mode).map(normaliseTag)).forEach(n => {
                    if (defaults.has(n)) return;
                    total++;
                    const claimed = complete.some(s => s !== style && this.styleTags(s, side, mode).some(t => normaliseTag(t) === n))
                        || (lora && (side === 'neg' ? lora.claimNegative(mode, n) : lora.claimTrigger(mode, n, null, promptText)));
                    if (box.has(n) && !claimed) present++;
                });
            });
            const missing = total - present;
            const stillMostly = present > 0 && (!missing || (total >= 3 && present * 2 > total && missing <= 3));
            if (!stillMostly) { selected.delete(name); changed = true; }
        });
        if (changed) this.saveSelectionState();
    },

    // Formatted as the box would be (Prompt Auto-Formatting), so they match what formatting left there.
    styleTags: function(style, side, mode) {
        const text = side === 'neg' ? style.negative_prompt : style.prompt;
        return parseTagList(window.formatInsertedTags && mode ? window.formatInsertedTags(text, mode) : text);
    },

    // The mode's default prompt/negative tags (normaliseTag()); never removed, and not counted towards a style.
    defaultTagSet: function(mode, side) {
        const text = side === 'neg'
            ? (localStorage.getItem(`bojro_custom_default_neg_${defaultKeyMode(mode)}`) ?? (typeof DEFAULT_NEGATIVE_PROMPTS !== 'undefined' ? DEFAULT_NEGATIVE_PROMPTS[mode] : undefined) ?? '')
            : (localStorage.getItem(`bojro_custom_default_${defaultKeyMode(mode)}`) ?? (typeof DEFAULT_PROMPTS !== 'undefined' ? DEFAULT_PROMPTS[mode] : undefined) ?? '');
        return new Set(parseTagList(text).map(normaliseTag));
    },

    // How many of a style's tags are in this mode's boxes (a box the mode lacks, e.g. Flux's negative, is skipped).
    // Default-prompt tags don't count, unless the style has nothing else. anyLeft: whether any of its prompt
    // tags are left (its negative ones if it has none), which decides whether it is still selected.
    styleCount: function(mode, style) {
        const all = [], own = [];
        ['prompt', 'neg'].forEach(side => {
            const el = document.getElementById(`${mode}_${side}`);
            if (!el) return;
            const box = boxTagSet(el);
            const defaults = this.defaultTagSet(mode, side);
            new Set(this.styleTags(style, side, mode).map(normaliseTag)).forEach(n => {
                const tag = { present: box.has(n), side };
                all.push(tag);
                if (!defaults.has(n)) own.push(tag);
            });
        });
        const counted = own.length ? own : all;
        const promptTags = counted.filter(t => t.side === 'prompt');
        const leftIn = promptTags.length ? promptTags : counted;
        return { present: counted.filter(t => t.present).length, total: counted.length, anyLeft: leftIn.some(t => t.present), own: own.length };
    },
    isPartial: function(count) {
        return count.total > 0 && count.present < count.total;
    },

    // Another tapped style (not exceptName) that wants this tag takes it over, so it isn't removed. Returns true if one did.
    claimTag: function(mode, side, norm, exceptName) {
        const selected = this.getSelectedStylesForMode(mode);
        for (const other of selected) {
            if (other === exceptName) continue;
            const style = this.styles.find(s => s.name === other);
            const tag = style && this.styleTags(style, side, mode).find(t => normaliseTag(t) === norm);
            if (!tag) continue;
            if (!this.appliedInsertions[mode]) this.appliedInsertions[mode] = {};
            const record = this.appliedInsertions[mode][other] || (this.appliedInsertions[mode][other] = { promptSegment: '', negSegment: '' });
            const key = side === 'neg' ? 'negSegment' : 'promptSegment';
            const owned = parseTagList(record[key]);
            if (!owned.some(t => normaliseTag(t) === norm)) record[key] = [...owned, tag].join(', ');
            this.saveSelectionState();
            return true;
        }
        return false;
    },

    // Adds a style's missing tags (not doubling one in any weight or case), or removes its tags however they got there,
    // keeping ones the default prompt, another tapped style or a LoRA wants. Each box ends in ", " (withTrailingComma()).
    applyStyleToPrompts: function(name, add) {
        const mode = window.StyleManager.activeMode();
        if (!this.appliedInsertions[mode]) this.appliedInsertions[mode] = {};
        const sides = [['prompt', 'promptSegment'], ['neg', 'negSegment']];

        if (add) {
            const s = this.styles.find(x => x.name === name);
            if (!s) return;
            const record = this.appliedInsertions[mode][name] || { promptSegment: '', negSegment: '' };
            sides.forEach(([side, key]) => {
                const el = document.getElementById(`${mode}_${side}`);
                if (!el) return;
                const box = boxTagSet(el);
                const seen = new Set();
                const missing = this.styleTags(s, side, mode).filter(t => {
                    const n = normaliseTag(t);
                    if (box.has(n) || seen.has(n)) return false;
                    seen.add(n);
                    return true;
                });
                if (missing.length) appendTagsToBox(el, missing.join(', '));
                // The tags it added before and still has, plus the new ones.
                const owned = parseTagList(record[key]).filter(t => box.has(normaliseTag(t)));
                record[key] = [...owned, ...missing].join(', ');
            });
            this.appliedInsertions[mode][name] = record;
        } else {
            const record = this.appliedInsertions[mode][name] || { promptSegment: '', negSegment: '' };
            const style = this.styles.find(x => x.name === name);
            delete this.appliedInsertions[mode][name];
            sides.forEach(([side, key]) => {
                const el = document.getElementById(`${mode}_${side}`);
                const tags = [...parseTagList(record[key]), ...(style ? this.styleTags(style, side, mode) : [])];
                if (!el || !tags.length) return;
                const defaults = this.defaultTagSet(mode, side);
                const lora = window.LoraManager;
                const toRemove = new Set();
                withFormattedPieces(tags).forEach(t => {
                    const n = normaliseTag(t);
                    if (defaults.has(n) || this.claimTag(mode, side, n, name)) return;
                    if (lora && (side === 'neg' ? lora.claimNegative(mode, n) : lora.claimTrigger(mode, n, null, el.value))) return;
                    toRemove.add(n);
                });
                if (toRemove.size) el.value = withTrailingComma(removeTagsFromText(el.value, toRemove, true));
            });
        }

        if (typeof savePrompt === 'function') savePrompt(mode);
        if (typeof saveNegativePrompt === 'function') saveNegativePrompt(mode);
        this.saveSelectionState();
    },

    // Deselects a style none of whose prompt tags are left (by hand, a reset or clearing the box); its negative tags only count
    // for a style with no prompt tags. Called from savePrompt()/saveNegativePrompt().
    checkAndClearFullyRemovedStyles: function(mode) {
        const selectedForMode = this.getSelectedStylesForMode(mode);
        let changed = false;
        [...selectedForMode].forEach(name => {
            const style = this.styles.find(s => s.name === name);
            if (!style) return;
            const count = this.styleCount(mode, style);
            if (count.total && !count.anyLeft) {
                selectedForMode.delete(name);
                if (this.appliedInsertions[mode]) delete this.appliedInsertions[mode][name];
                changed = true;
            }
        });
        if (changed) {
            this.saveSelectionState();
            if (document.getElementById('styleList')) this.render();
        }
    },

    // selectedStylesByMode and appliedInsertions persist and restore together.
    saveSelectionState: function() {
        try {
            const serialized = {};
            Object.keys(this.selectedStylesByMode).forEach(mode => {
                serialized[mode] = Array.from(this.selectedStylesByMode[mode]);
            });
            localStorage.setItem('bojroSelectedStylesByMode', JSON.stringify(serialized));
            localStorage.setItem('bojroAppliedStyleInsertions', JSON.stringify(this.appliedInsertions));
        } catch (e) { console.error("Style selection save failed:", e); }
    },

    restoreSelectionState: function() {
        try {
            const savedSelected = localStorage.getItem('bojroSelectedStylesByMode');
            if (savedSelected) {
                const parsed = JSON.parse(savedSelected);
                this.selectedStylesByMode = {};
                Object.keys(parsed).forEach(mode => {
                    this.selectedStylesByMode[mode] = new Set(parsed[mode]);
                });
            }
            const savedInsertions = localStorage.getItem('bojroAppliedStyleInsertions');
            if (savedInsertions) this.appliedInsertions = JSON.parse(savedInsertions);
        } catch (e) { console.error("Style selection restore failed:", e); }
    },


    // --- EDITOR ---
    // Styles switched out of random::style / order::style (style editor), by name.
    NO_RANDOM_KEY: 'bojroStyleNoRandom',
    noRandom: function() { try { return new Set(JSON.parse(localStorage.getItem(this.NO_RANDOM_KEY) || '[]')); } catch (e) { return new Set(); } },
    inRandom: function(name) { return !this.noRandom().has(name); },
    setInRandom: function(name, on, oldName) {
        const set = this.noRandom();
        if (oldName) set.delete(oldName);
        if (on) set.delete(name); else set.add(name);
        try { localStorage.setItem(this.NO_RANDOM_KEY, JSON.stringify([...set])); } catch (e) {}
    },

    openCreatePopup: function() {
        this.editingOldName = null;
        document.getElementById('styleEditorModal').classList.remove('hidden');
        if (typeof lockBodyScroll === 'function') lockBodyScroll();
        // With Forge Couple on in the tab, or the Forge Couple filter on: a couple style.
        const mode = this.activeMode(), couple = this.coupleOnly || !!(window.ForgeCouple && ForgeCouple.isOn(mode));
        document.getElementById('styleEditorTitle').innerText = couple ? "NEW COUPLE STYLE" : "NEW STYLE";
        document.getElementById('styleEditorDeleteBtn').classList.add('hidden');
        document.getElementById('styleEditName').value = "";
        document.getElementById('styleEditPrompt').value = "";
        document.getElementById('styleFcBg').value = "";
        this.setEditorKind(couple ? { mode: 'basic', dir: 'h', bgw: 0.5, hr: false, edited: false, regions: [{ t: '' }, { t: '' }] } : null);
        document.getElementById('styleEditNeg').value = "";
        document.getElementById('styleEditInRandom').checked = true;
        this.pendingThumb = undefined;
        this.paintEditorThumb();
    },

    openEditor: function(name) {
        const style = this.styles.find(s => s.name === name);
        this.editingOldName = name;
        document.getElementById('styleEditorModal').classList.remove('hidden');
        if (typeof lockBodyScroll === 'function') lockBodyScroll();
        // A couple style opens as one whether or not Forge Couple is on.
        document.getElementById('styleEditorTitle').innerText = style.fc ? "EDIT COUPLE STYLE" : "EDIT STYLE";
        document.getElementById('styleEditorDeleteBtn').classList.remove('hidden');
        document.getElementById('styleEditName').value = style.name;
        document.getElementById('styleEditPrompt').value = style.prompt || "";
        document.getElementById('styleFcBg').value = style.fc ? style.prompt || "" : "";
        this.setEditorKind(style.fc || null);
        document.getElementById('styleEditNeg').value = style.negative_prompt || "";
        document.getElementById('styleEditInRandom').checked = this.inRandom(style.name);
        this.pendingThumb = undefined;
        this.paintEditorThumb();
    },

    copyFromTab: function() {
        const mode = window.StyleManager.activeMode();
        // A couple style: the prompt box as the background, and the tab's regions and layout.
        if (this.editFc) {
            document.getElementById('styleFcBg').value = document.getElementById(`${mode}_prompt`).value;
            if (window.ForgeCouple && ForgeCouple.supports(mode)) { this.editFc = ForgeCouple.stateFor(mode); this.paintFcEditor(); }
            const n = document.getElementById(`${mode}_neg`);
            if (n) document.getElementById('styleEditNeg').value = n.value;
            return;
        }
        document.getElementById('styleEditPrompt').value = document.getElementById(`${mode}_prompt`).value;
        const neg = document.getElementById(`${mode}_neg`);
        if(neg) document.getElementById('styleEditNeg').value = neg.value;
    },

    saveStyle: async function() {
        const newName = document.getElementById('styleEditName').value.trim();
        const fc = this.editFc ? { ...this.editFc, regions: this.editFc.regions.map(r => ({ ...r, t: String(r.t || '').trim() })) } : null;
        const prompt = (fc ? document.getElementById('styleFcBg') : document.getElementById('styleEditPrompt')).value.trim();
        const neg = document.getElementById('styleEditNeg').value.trim();

        if (!newName) {
            await window.appAlert("Name required");
            return;
        }
        if (newName !== this.editingOldName && this.styles.some(s => s.name === newName)) {
            await window.appAlert(`There's already a style called "${newName}".`, { title: 'Style' });
            return;
        }
        if (fc && !fc.regions.some(r => r.t)) {
            await window.appAlert('Write at least one region.', { title: 'Couple Style' });
            return;
        }

        if (this.editingOldName) {
            const idx = this.styles.findIndex(s => s.name === this.editingOldName);
            this.styles[idx] = { name: newName, prompt, negative_prompt: neg, ...(fc ? { fc } : {}) };
            // A renamed style stays selected, with the tags it added, in every mode.
            const oldName = this.editingOldName;
            if (newName !== oldName) {
                // Its star goes with it (item 76).
                const favs = this.favs();
                if (favs.delete(oldName)) { favs.add(newName); this.saveFavs(favs); }
                Object.keys(this.selectedStylesByMode).forEach(mode => {
                    const set = this.selectedStylesByMode[mode];
                    if (set.delete(oldName)) set.add(newName);
                    const records = this.appliedInsertions[mode];
                    if (records && records[oldName]) { records[newName] = records[oldName]; delete records[oldName]; }
                });
                this.saveSelectionState();
                // Its thumbnail goes with it.
                if (this.thumbs[oldName]) {
                    if (this.pendingThumb === undefined) this.pendingThumb = this.thumbs[oldName];
                    await this.setThumb(oldName, null);
                }
            }
        } else {
            this.styles.push({ name: newName, prompt, negative_prompt: neg, ...(fc ? { fc } : {}) });
        }

        this.setInRandom(newName, document.getElementById('styleEditInRandom').checked, this.editingOldName);
        if (this.pendingThumb !== undefined) await this.setThumb(newName, this.pendingThumb);
        this.pendingThumb = undefined;
        await this.writeToDisk();
        this.render();
        window.closeStyleEditor();
    },

    // Edit Style's bin: deletes the style being edited (after asking) and closes the editor.
    deleteFromEditor: async function() {
        const name = this.editingOldName;
        if (!name) return;
        const before = this.styles.length;
        await this.deleteStyle(name);
        if (this.styles.length < before) window.closeStyleEditor();
    },

    deleteStyle: async function(name) {
        if (!(await window.appConfirm(`Delete style "${name}"?`, { title: 'Delete Style', okText: 'DELETE', danger: true }))) return;
        this.setThumb(name, null);
        this.setInRandom(name, true);
        // Deleting an active style also removes its text from the current mode's prompt boxes (current mode only); a
        // couple style turns Forge Couple off too.
        const mode = window.StyleManager.activeMode();
        const selectedForMode = this.getSelectedStylesForMode(mode);
        const wasCouple = !!(this.styles.find(s => s.name === name) || {}).fc;
        this.styles = this.styles.filter(s => s.name !== name);
        if (selectedForMode.has(name)) {
            selectedForMode.delete(name);
            this.applyStyleToPrompts(name, false);
            if (wasCouple && window.ForgeCouple) ForgeCouple.off(mode);
        }
        await this.writeToDisk();
        this.render();
    }
};

// One close function for both close paths; also unlocks body scroll.
window.closeStyleModal = function() {
    if (window.StyleManager) window.StyleManager.lastSearch = document.getElementById('styleSearch')?.value || '';
    document.getElementById('styleModal')?.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
}

// One close function for all three close paths; also unlocks body scroll.
window.closeStyleEditor = function() {
    document.getElementById('styleEditorModal')?.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
}

// As clearLoraSearch()/clearSaacSearch(): don't refocus the field on clear.
window.clearStyleSearch = function() {
    const searchEl = document.getElementById('styleSearch');
    if (!searchEl) return;
    searchEl.value = '';
    window.StyleManager.render();
}

window.addEventListener('load', () => window.StyleManager.init());
// The style editor's missing-wildcard line (item 65): on typing, on opening, and when the boxes are filled by code.
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('styleEditorModal');
    if (!modal) return;
    const paint = () => window.StyleManager && window.StyleManager.paintMissingWildcards();
    modal.addEventListener('input', paint);
    new MutationObserver(paint).observe(modal, { attributes: true, attributeFilter: ['class'] });
    ['copyFromTab', 'setFc', 'addFcRegion'].forEach(k => {
        const f = window.StyleManager && window.StyleManager[k];
        if (typeof f === 'function') window.StyleManager[k] = function () { const r = f.apply(this, arguments); setTimeout(paint, 0); return r; };
    });
});
