window.StyleManager = {
    styles: [],
    // Selected styles, one Set per mode (xl/flux/qwen/anima/krea/inp/img2img), so a style applied in one mode isn't highlighted in another.
    selectedStylesByMode: {},
    // { mode: { styleName: { promptSegment, negSegment } } }: the tags each style added (or took over from another, claimTag()), which are the ones removed with it.
    appliedInsertions: {},
    fs: window.Capacitor ? window.Capacitor.Plugins.Filesystem : null,
    DIR: 'Resolver/styles',
    FILE: 'Resolver/styles/styles.csv',
    editingOldName: null,

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

        // 2. Initialize Filesystem and try to load the physical CSV
        if (this.fs) {
            // The saved list stays the source of truth (an earlier install's styles.csv can't be overwritten),
            // so the file only restores styles when the app has none. No mkdir: on an existing folder it threw and skipped this.
            if (!cache) {
                await this.loadLocalCSV();
                if (this.styles.length) localStorage.setItem('resolver_styles_fallback', JSON.stringify(this.styles));
            }
        }
    },

    open: function() {
        const search = document.getElementById('styleSearch');
        if (search) search.value = '';
        document.getElementById('styleModal').classList.remove('hidden');
        if (typeof lockBodyScroll === 'function') lockBodyScroll();
        this.render();
        const list = document.getElementById('styleList');
        if (list) list.scrollTop = 0;
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
            
            const lines = ret.data.split('\n');
            const parsed = lines.slice(1).filter(l => l.trim()).map(line => {
                const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                return {
                    name: parts[0]?.replace(/^"|"$/g, '').trim(),
                    prompt: parts[1]?.replace(/^"|"$/g, '').trim(),
                    negative_prompt: parts[2]?.replace(/^"|"$/g, '').trim()
                };
            });
            
            if (parsed.length > 0) this.styles = parsed;
        } catch (e) {
            console.log("No local file found, using cache.");
        }
    },

    writeToDisk: async function() {
        // 1. Immediate save to LocalStorage (Reliable on restart)
        localStorage.setItem('resolver_styles_fallback', JSON.stringify(this.styles));

        // 2. Generate CSV for Filesystem
        let csv = "name,prompt,negative_prompt\n";
        this.styles.forEach(s => {
            csv += `"${s.name}","${(s.prompt || '').replace(/"/g, '""')}","${(s.negative_prompt || '').replace(/"/g, '""')}"\n`;
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
            } catch(e) { console.error("FS Write failed", e); }
        }
    },

    // --- UI RENDERING ---
    // Lazily creates each mode's Set on first use.
    getSelectedStylesForMode: function(mode) {
        if (!this.selectedStylesByMode[mode]) this.selectedStylesByMode[mode] = new Set();
        return this.selectedStylesByMode[mode];
    },

    render: function() {
        const container = document.getElementById('styleList');
        const rawQuery = document.getElementById('styleSearch').value;
        const query = searchQuery(rawQuery);
        const clearBtn = document.getElementById('styleSearchClear');
        if (clearBtn) clearBtn.classList.toggle('hidden', !rawQuery);
        container.innerHTML = '';

        const mode = typeof currentMode !== 'undefined' ? currentMode : 'xl';
        const selectedForMode = this.getSelectedStylesForMode(mode);
        this.styles
            .filter(s => searchKey(s.name).includes(query))
            // Active styles first, as in the LoRA list.
            .sort((a, b) => (selectedForMode.has(b.name) - selectedForMode.has(a.name)) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
            .forEach(style => {
            const isActive = selectedForMode.has(style.name);
            // Tapped but missing some of its tags: dashed outline and a count, no glow.
            const count = isActive ? this.styleCount(mode, style) : null;
            const isPartial = isActive && this.isPartial(count);

            const div = document.createElement('div');
            div.className = `glass-box style-card ${isActive && !isPartial ? 'selected-glow' : ''}`;
            div.style.cssText = `margin-bottom:10px; padding:12px; transition: 0.3s; border: 1px ${isPartial ? 'dashed' : 'solid'} ${isActive ? '#ffd700' : 'var(--border-color)'}; box-shadow: ${isActive && !isPartial ? '0 0 15px rgba(255, 215, 0, 0.3)' : 'none'};`;
            
            div.innerHTML = `
                <div class="row" style="justify-content:space-between; align-items:center;">
                    <div class="style-select-target" style="flex:1; min-width:0; cursor:pointer;">
                        <div style="font-weight:900; color:${isActive ? '#ffd700' : 'var(--accent-primary)'}; font-size:12px;">${escapeHtmlAttr(style.name.toUpperCase())}${isPartial ? `<span class="style-partial-count" style="font-weight:700; color:var(--text-muted); margin-left:6px;">${count.present}/${count.total}</span>` : ''}</div>
                        <div style="font-size:10px; color:var(--text-muted); display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden;">
                            ${escapeHtmlAttr(style.prompt || '...')}
                        </div>
                    </div>
                    <div class="row" style="width:auto; gap:10px;">
                        <button class="style-edit-btn" style="background:none; border:none; color:var(--text-muted); padding:4px;">
                            <i data-lucide="edit-2" size="14"></i>
                        </button>
                        <button class="style-delete-btn" style="background:none; border:none; color:#ff4444; padding:4px;">
                            <i data-lucide="trash-2" size="14"></i>
                        </button>
                    </div>
                </div>
            `;
            // Real closures rather than inline onclick strings, so names with apostrophes work.
            div.querySelector('.style-select-target').onclick = () => window.StyleManager.toggleSelection(style.name);
            div.querySelector('.style-edit-btn').onclick = (event) => {
                event.stopPropagation();
                window.StyleManager.openEditor(style.name);
            };
            div.querySelector('.style-delete-btn').onclick = (event) => {
                event.stopPropagation();
                window.StyleManager.deleteStyle(style.name);
            };
            container.appendChild(div);
        });
        if (window.lucide) lucide.createIcons();
        this.fitListHeight();
    },

    // As many whole cards as fit on screen (ui.js).
    fitListHeight: function() {
        const list = document.getElementById('styleList');
        if (list) fitListToWholeRows(list, list.children);
    },

    // --- TOGGLE & INJECT ---
    // Tapping a style: adds it; a partly present one gets its missing tags back; a complete one is removed.
    toggleSelection: function(name) {
        const mode = typeof currentMode !== 'undefined' ? currentMode : 'xl';
        const selectedForMode = this.getSelectedStylesForMode(mode);
        const style = this.styles.find(s => s.name === name);
        if (!selectedForMode.has(name)) {
            selectedForMode.add(name);
            this.applyStyleToPrompts(name, true);
        } else if (style && this.isPartial(this.styleCount(mode, style))) {
            this.applyStyleToPrompts(name, true);
        } else {
            selectedForMode.delete(name);
            this.applyStyleToPrompts(name, false);
        }
        this.render();
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
        return { present: counted.filter(t => t.present).length, total: counted.length, anyLeft: leftIn.some(t => t.present) };
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

    // Adds a style's missing tags to the active mode (an existing tag, in any weight or case, isn't doubled), or removes the tags it added.
    // Removal keeps tags the default prompt, another tapped style or an active LoRA also wants. Each box ends in ", " afterwards (withTrailingComma(), utils.js).
    applyStyleToPrompts: function(name, add) {
        const mode = typeof currentMode !== 'undefined' ? currentMode : 'xl';
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
            const record = this.appliedInsertions[mode][name];
            if (record) {
                delete this.appliedInsertions[mode][name];
                sides.forEach(([side, key]) => {
                    const el = document.getElementById(`${mode}_${side}`);
                    if (!el || !record[key]) return;
                    const defaults = this.defaultTagSet(mode, side);
                    const lora = window.LoraManager;
                    const toRemove = new Set();
                    withFormattedPieces(parseTagList(record[key])).forEach(t => {
                        const n = normaliseTag(t);
                        if (defaults.has(n) || this.claimTag(mode, side, n, name)) return;
                        if (lora && (side === 'neg' ? lora.claimNegative(mode, n) : lora.claimTrigger(mode, n, null, el.value))) return;
                        toRemove.add(n);
                    });
                    if (toRemove.size) el.value = withTrailingComma(removeTagsFromText(el.value, toRemove, true));
                });
            }
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

    // Removes tags from a field, one segment per tag, exact match (an edited segment is kept whole). Used for LoRAs' additional negatives.
    removeStyleTags: function(text, segment) {
        const remainingTags = segment.split(",").map(t => t.trim()).filter(t => t.length > 0);
        const rawSegments = text.split(",");
        const kept = [];
        rawSegments.forEach(raw => {
            const trimmedVal = raw.trim();
            const idx = trimmedVal.length > 0 ? remainingTags.indexOf(trimmedVal) : -1;
            if (idx !== -1) {
                remainingTags.splice(idx, 1);
            } else {
                kept.push(raw);
            }
        });
        return kept.join(",").replace(/,\s*,/g, ",").replace(/^,\s*/, "").trim();
    },


    // --- EDITOR ---
    openCreatePopup: function() {
        this.editingOldName = null;
        document.getElementById('styleEditorModal').classList.remove('hidden');
        if (typeof lockBodyScroll === 'function') lockBodyScroll();
        document.getElementById('styleEditorTitle').innerText = "NEW STYLE";
        document.getElementById('styleEditName').value = "";
        document.getElementById('styleEditPrompt').value = "";
        document.getElementById('styleEditNeg').value = "";
    },

    openEditor: function(name) {
        const style = this.styles.find(s => s.name === name);
        this.editingOldName = name;
        document.getElementById('styleEditorModal').classList.remove('hidden');
        if (typeof lockBodyScroll === 'function') lockBodyScroll();
        document.getElementById('styleEditorTitle').innerText = "EDIT STYLE";
        document.getElementById('styleEditName').value = style.name;
        document.getElementById('styleEditPrompt').value = style.prompt || "";
        document.getElementById('styleEditNeg').value = style.negative_prompt || "";
    },

    copyFromTab: function() {
        const mode = typeof currentMode !== 'undefined' ? currentMode : 'xl';
        document.getElementById('styleEditPrompt').value = document.getElementById(`${mode}_prompt`).value;
        const neg = document.getElementById(`${mode}_neg`);
        if(neg) document.getElementById('styleEditNeg').value = neg.value;
    },

    saveStyle: async function() {
        const newName = document.getElementById('styleEditName').value.trim();
        const prompt = document.getElementById('styleEditPrompt').value.trim();
        const neg = document.getElementById('styleEditNeg').value.trim();

        if (!newName) {
            await window.appAlert("Name required");
            return;
        }

        if (this.editingOldName) {
            const idx = this.styles.findIndex(s => s.name === this.editingOldName);
            this.styles[idx] = { name: newName, prompt, negative_prompt: neg };
            // A renamed style stays selected, with the tags it added, in every mode.
            const oldName = this.editingOldName;
            if (newName !== oldName) {
                Object.keys(this.selectedStylesByMode).forEach(mode => {
                    const set = this.selectedStylesByMode[mode];
                    if (set.delete(oldName)) set.add(newName);
                    const records = this.appliedInsertions[mode];
                    if (records && records[oldName]) { records[newName] = records[oldName]; delete records[oldName]; }
                });
                this.saveSelectionState();
            }
        } else {
            this.styles.push({ name: newName, prompt, negative_prompt: neg });
        }

        await this.writeToDisk();
        this.render();
        window.closeStyleEditor();
    },

    deleteStyle: async function(name) {
        if (!(await window.appConfirm(`Delete style "${name}"?`, { title: 'Delete Style', okText: 'DELETE', danger: true }))) return;
        this.styles = this.styles.filter(s => s.name !== name);
        // Deleting an active style also removes its text from the current mode's prompt boxes (current mode only).
        const mode = typeof currentMode !== 'undefined' ? currentMode : 'xl';
        const selectedForMode = this.getSelectedStylesForMode(mode);
        if (selectedForMode.has(name)) {
            selectedForMode.delete(name);
            this.applyStyleToPrompts(name, false);
        }
        await this.writeToDisk();
        this.render();
    }
};

// One close function for both close paths; also unlocks body scroll.
window.closeStyleModal = function() {
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