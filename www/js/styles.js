window.StyleManager = {
    styles: [],
    // Selected styles, one Set per mode (xl/flux/qwen/anima/krea/inp/img2img), so a style applied in one mode isn't highlighted in another.
    selectedStylesByMode: {},
    // The exact substring inserted per style, so deselecting removes precisely that.
    // { mode: { styleName: { promptSegment, negSegment, prompt, neg } } }: promptSegment/negSegment (tags actually inserted, after dedupe) drive removal and checkAndClearFullyRemovedStyles(); prompt/neg are recorded to keep the stored shape.
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
            try { 
                await this.fs.mkdir({ path: this.DIR, directory: 'DOCUMENTS', recursive: true }); 
                await this.loadLocalCSV();
            } catch(e) { console.log("FS init skipped"); }
        }
    },

    open: function() {
        document.getElementById('styleModal').classList.remove('hidden');
        if (typeof lockBodyScroll === 'function') lockBodyScroll();
        this.render();
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
        const query = document.getElementById('styleSearch').value.toLowerCase();
        const clearBtn = document.getElementById('styleSearchClear');
        if (clearBtn) clearBtn.classList.toggle('hidden', !query);
        container.innerHTML = '';

        const mode = typeof currentMode !== 'undefined' ? currentMode : 'xl';
        const selectedForMode = this.getSelectedStylesForMode(mode);
        this.styles
            .filter(s => s.name.toLowerCase().includes(query))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
            .forEach(style => {
            const isActive = selectedForMode.has(style.name);

            const div = document.createElement('div');
            div.className = `glass-box style-card ${isActive ? 'selected-glow' : ''}`;
            div.style.cssText = `margin-bottom:10px; padding:12px; transition: 0.3s; border: 1px solid ${isActive ? '#ffd700' : 'var(--border-color)'}; box-shadow: ${isActive ? '0 0 15px rgba(255, 215, 0, 0.3)' : 'none'};`;
            
            div.innerHTML = `
                <div class="row" style="justify-content:space-between; align-items:center;">
                    <div class="style-select-target" style="flex:1; min-width:0; cursor:pointer;">
                        <div style="font-weight:900; color:${isActive ? '#ffd700' : 'var(--accent-primary)'}; font-size:12px;">${escapeHtmlAttr(style.name.toUpperCase())}</div>
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
    },

    // --- TOGGLE & INJECT ---
    toggleSelection: function(name) {
        const mode = typeof currentMode !== 'undefined' ? currentMode : 'xl';
        const selectedForMode = this.getSelectedStylesForMode(mode);
        const wasSelected = selectedForMode.has(name);
        if (wasSelected) {
            selectedForMode.delete(name);
        } else {
            selectedForMode.add(name);
        }
        this.applyStyleToPrompts(name, !wasSelected);
        this.render();
    },

    // Adds or removes one style's prompt/negative text in the active mode. Add and remove mirror each other, except that a non-empty box ends in ", " afterwards (withTrailingComma(), utils.js).
    applyStyleToPrompts: function(name, add) {
        const mode = typeof currentMode !== 'undefined' ? currentMode : 'xl';
        const pEl = document.getElementById(`${mode}_prompt`);
        const nEl = document.getElementById(`${mode}_neg`);
        if (!this.appliedInsertions[mode]) this.appliedInsertions[mode] = {};

        if (add) {
            // Only add needs the style's current text; removal works from the stored record, so it works even for a just-deleted style.
            const s = this.styles.find(x => x.name === name);
            if (!s) return;
            // A tag already in the box is skipped on add and not tracked as this style's.
            const currentPromptTags = pEl ? pEl.value.split(",").map(t => t.trim()).filter(Boolean) : [];
            const currentNegTags = nEl ? nEl.value.split(",").map(t => t.trim()).filter(Boolean) : [];
            const dedupe = (text, existingTags) => {
                if (!text) return text;
                return text.split(",").map(t => t.trim()).filter(t => t.length > 0 && !existingTags.includes(t)).join(", ");
            };
            const promptToInsert = dedupe(s.prompt, currentPromptTags);
            const negToInsert = dedupe(s.negative_prompt, currentNegTags);
            const pInserted = (promptToInsert && pEl) ? this.appendSegment(pEl, promptToInsert) : "";
            const nInserted = (negToInsert && nEl) ? this.appendSegment(nEl, negToInsert) : "";
            // promptSegment/negSegment track only what was actually inserted (after dedupe).
            this.appliedInsertions[mode][name] = {
                prompt: pInserted, promptSegment: promptToInsert,
                neg: nInserted, negSegment: negToInsert
            };
        } else {
            const record = this.appliedInsertions[mode][name];
            if (record) {
                // Tags that are part of this mode's resolved default are not removed; only each side's extra tags.
                if (record.promptSegment && pEl) {
                    const promptDefault = localStorage.getItem(`bojro_custom_default_${defaultKeyMode(mode)}`) ?? (typeof DEFAULT_PROMPTS !== 'undefined' ? DEFAULT_PROMPTS[mode] : undefined) ?? '';
                    const promptDefaultTags = promptDefault.split(",").map(t => t.trim()).filter(Boolean);
                    const promptExtrasOnly = record.promptSegment.split(",").map(t => t.trim()).filter(t => t.length > 0 && !promptDefaultTags.includes(t)).join(", ");
                    if (promptExtrasOnly) pEl.value = withTrailingComma(this.removeStyleTags(pEl.value, promptExtrasOnly));
                }
                if (record.negSegment && nEl) {
                    const negDefault = localStorage.getItem(`bojro_custom_default_neg_${defaultKeyMode(mode)}`) ?? (typeof DEFAULT_NEGATIVE_PROMPTS !== 'undefined' ? DEFAULT_NEGATIVE_PROMPTS[mode] : undefined) ?? '';
                    const negDefaultTags = negDefault.split(",").map(t => t.trim()).filter(Boolean);
                    const negExtrasOnly = record.negSegment.split(",").map(t => t.trim()).filter(t => t.length > 0 && !negDefaultTags.includes(t)).join(", ");
                    if (negExtrasOnly) nEl.value = withTrailingComma(this.removeStyleTags(nEl.value, negExtrasOnly));
                }
                delete this.appliedInsertions[mode][name];
            }
        }

        if (typeof savePrompt === 'function') savePrompt(mode);
        if (typeof saveNegativePrompt === 'function') saveNegativePrompt(mode);
        this.saveSelectionState();
    },

    // Deselects a style whose tags were all deleted by hand. Called from savePrompt()/saveNegativePrompt().
    checkAndClearFullyRemovedStyles: function(mode) {
        const insertions = this.appliedInsertions[mode];
        if (!insertions) return;
        const pEl = document.getElementById(`${mode}_prompt`);
        const nEl = document.getElementById(`${mode}_neg`);
        // Own tag lists hold only inserted tags, so a tag-level survival check suffices.
        const currentPromptTags = pEl ? pEl.value.split(",").map(t => t.trim()).filter(Boolean) : [];
        const currentNegTags = nEl ? nEl.value.split(",").map(t => t.trim()).filter(Boolean) : [];
        let changed = false;
        const selectedForMode = this.getSelectedStylesForMode(mode);

        Object.keys(insertions).forEach(name => {
            if (!selectedForMode.has(name)) return;
            const record = insertions[name];
            const ownPromptTags = record.promptSegment ? record.promptSegment.split(",").map(t => t.trim()).filter(Boolean) : [];
            const ownNegTags = record.negSegment ? record.negSegment.split(",").map(t => t.trim()).filter(Boolean) : [];
            const anyPromptTagSurvives = ownPromptTags.some(t => currentPromptTags.includes(t));
            const anyNegTagSurvives = ownNegTags.some(t => currentNegTags.includes(t));
            const hadAnyTagsAtAll = ownPromptTags.length > 0 || ownNegTags.length > 0;
            if (hadAnyTagsAtAll && !anyPromptTagSurvives && !anyNegTagSurvives) {
                selectedForMode.delete(name);
                delete insertions[name];
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

    // Removes a style's tags from a field (the only removal path). Each comma segment is compared with the style's tags, consuming one match per tag; an edited segment is kept whole.
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


    // Appends a segment and returns the inserted substring (separator + segment). A comma is added only if the text doesn't already end with one.
    appendSegment: function(el, segment) {
        if (el.value.includes(segment)) return ""; // already present
        const trimmed = el.value.replace(/\s+$/, "");
        let sep;
        if (!trimmed) sep = "";
        else if (trimmed.endsWith(",")) sep = " ";
        else sep = ", ";
        const insertion = sep + segment;
        el.value = trimmed + insertion;
        // Ends the box with ", " (withTrailingComma(), utils.js), after `insertion` is fixed so the returned string stays separator + segment.
        el.value = withTrailingComma(el.value);
        return insertion;
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