// LoRA variants: alternative versions of a LoRA, each with its own name, weight, prompt, negatives, thumbnail and pin.
// Also LoRAs' own chosen thumbnails, and the LoRA Data backup / restore (backup.js).
(function () {
    const STORE_KEY = 'bojroLoraVariants';       // { loraName: [ { id, name, weight, trigger, negative, pinned } ] }
    const LORAS_KEY = 'bojroLoraVariantLoras';   // { loraName: { showAdd } }: LoRAs with variants turned on
    const DB_NAME = 'bojro_lora_variant_thumbs';
    const DB_STORE = 'thumbs';
    // A picked thumbnail is stored at this size, the LoRA list's thumbnail shape (2:3).
    const THUMB_W = 140, THUMB_H = 210;

    const readObj = key => {
        try {
            const v = JSON.parse(localStorage.getItem(key) || '{}');
            return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
        } catch (e) {
            return {};
        }
    };
    let data = readObj(STORE_KEY);
    let loras = readObj(LORAS_KEY);
    function save() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(data));
            localStorage.setItem(LORAS_KEY, JSON.stringify(loras));
        } catch (e) {}
    }
    // Which LoRAs' variants are open in the list. Not saved, so the app starts with them all closed.
    const expanded = new Set();

    const enabledFor = name => Object.prototype.hasOwnProperty.call(loras, name);
    const showAddFor = name => enabledFor(name) && loras[name].showAdd !== false;
    const esc = s => (typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr(String(s)) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const LM = () => window.LoraManager;
    const loraByName = name => (LM() && LM().allLoras || []).find(l => l.name === name) || null;
    const list = name => (Array.isArray(data[name]) ? data[name] : []);
    const getVariant = (name, id) => list(name).find(v => v.id === id) || null;
    const hasWeight = v => v && v.weight !== undefined && v.weight !== null && v.weight !== '';
    const parentCfg = name => (typeof loraConfigs !== 'undefined' && loraConfigs[name]) || {};
    // 0.6, 0.65, 1.0
    const weightText = w => Number(w).toFixed(2).replace(/(\.\d)0$/, '$1');

    // ---- thumbnails (IndexedDB, keyed by variant id, or "p:" + name for a LoRA's own) ----
    const thumbCache = {};
    let dbPromise = null;
    function openDb() {
        if (!dbPromise) {
            dbPromise = new Promise(resolve => {
                try {
                    const req = indexedDB.open(DB_NAME, 1);
                    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => resolve(null);
                } catch (e) {
                    resolve(null);
                }
            });
        }
        return dbPromise;
    }
    async function dbRun(mode, fn) {
        const db = await openDb();
        if (!db) return null;
        return new Promise(resolve => {
            try {
                const tx = db.transaction(DB_STORE, mode);
                const req = fn(tx.objectStore(DB_STORE));
                tx.oncomplete = () => resolve(req ? req.result : null);
                tx.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    }
    async function getThumb(id) {
        if (id in thumbCache) return thumbCache[id];
        const v = await dbRun('readonly', s => s.get(id));
        thumbCache[id] = v || null;
        return thumbCache[id];
    }
    function putThumb(id, url) {
        thumbCache[id] = url;
        return dbRun('readwrite', s => s.put(url, id));
    }
    function deleteThumb(id) {
        thumbCache[id] = null;
        return dbRun('readwrite', s => s.delete(id));
    }
    // range: only those keys (an IDBKeyRange).
    async function allThumbs(range) {
        const db = await openDb();
        const out = {};
        if (!db) return out;
        return new Promise(resolve => {
            try {
                const tx = db.transaction(DB_STORE, 'readonly');
                const req = tx.objectStore(DB_STORE).openCursor(range);
                req.onsuccess = () => {
                    const c = req.result;
                    if (c) { out[c.key] = c.value; c.continue(); }
                };
                tx.oncomplete = () => resolve(out);
                tx.onerror = () => resolve(out);
            } catch (e) {
                resolve(out);
            }
        });
    }
    // Every variant thumbnail read into memory in one pass, so opening a LoRA shows them at once.
    let preloaded = false;
    async function preloadThumbs() {
        if (preloaded) return;
        preloaded = true;
        const all = await allThumbs();
        Object.keys(data).forEach(n => (Array.isArray(data[n]) ? data[n] : []).forEach(v => { if (!(v.id in thumbCache)) thumbCache[v.id] = all[v.id] || null; }));
    }
    // LoRAs' own thumbnails, all read into memory once (not the variants', which are read when variants are on).
    const parentThumbs = {};
    const PARENT = 'p:';
    let parentsLoaded = null;
    function loadParentThumbs() {
        if (!parentsLoaded) parentsLoaded = allThumbs(IDBKeyRange.bound(PARENT, PARENT + '\uffff')).then(all => {
            Object.keys(all).forEach(k => { parentThumbs[k.slice(PARENT.length)] = all[k]; });
        });
        return parentsLoaded;
    }
    loadParentThumbs();
    const parentThumb = name => parentThumbs[name] || null;
    async function parentThumbLoaded(name) {
        await loadParentThumbs();
        return parentThumb(name);
    }
    // url null removes it.
    function setParentThumb(name, url) {
        if (url) {
            parentThumbs[name] = url;
            return dbRun('readwrite', s => s.put(url, PARENT + name));
        }
        delete parentThumbs[name];
        return dbRun('readwrite', s => s.delete(PARENT + name));
    }
    const parentThumbNames = () => Object.keys(parentThumbs);
    // A variant row's or the editor's picture without one of its own.
    const parentImg = name => LM().thumbFor(name);

    // Shows a variant's own thumbnail in imgEl; false if it has none.
    async function loadThumbInto(imgEl, id) {
        const url = await getThumb(id);
        if (url && imgEl) imgEl.src = url;
        return !!url;
    }

    // ---- which variant is in the prompt ----
    const currentMode = () => LM().resolvePromptId().replace(/_prompt$/, '');
    // The variant the LoRA was added with; for a LoRA from Analyze or a paste, the variant whose trigger tags are all in
    // the prompt (the one with most tags wins). null: none. undefined: the LoRA isn't in the prompt.
    function activeVariant(mode, alias, name) {
        const el = document.getElementById(`${mode}_prompt`);
        const text = el ? el.value : '';
        if (!new RegExp(`<lora:${LM().escapeRegExp(alias)}:[^>]+>`, 'i').test(text)) return undefined;
        const record = LM().appliedInsertions[mode] && LM().appliedInsertions[mode][alias];
        if (record && typeof record === 'object' && 'variant' in record) return getVariant(name, record.variant) ? record.variant : null;
        const present = el ? boxTagSet(el) : new Set();
        // Forge Couple on: the trigger tags can be in its region boxes.
        document.querySelectorAll(`#fc-${mode}-regions:not(.hidden) textarea`).forEach(b => boxTagSet(b).forEach(t => present.add(t)));
        let best = null, bestCount = 0;
        list(name).forEach(v => {
            const tags = parseTagList(v.trigger || '').map(normaliseTag);
            if (tags.length && tags.every(t => present.has(t)) && tags.length > bestCount) {
                best = v.id;
                bestCount = tags.length;
            }
        });
        return best;
    }
    // The trigger tags of the variant detected in the prompt, for a LoRA added without a record (Analyze, a paste).
    function detectedTags(mode, alias, name) {
        const v = getVariant(name, activeVariant(mode, alias, name));
        return v ? parseTagList(v.trigger || '') : [];
    }

    // ---- the LoRA list ----
    // Redraws the list in its place, keeping the first row on screen where it was (LoraManager.keyRow()).
    function rerender() {
        const box = document.getElementById('loraVerticalList');
        const modal = document.getElementById('loraModal');
        if (!box || !LM() || !modal || modal.classList.contains('hidden')) return;
        const L = LM();
        const boxTop = () => box.getBoundingClientRect().top;
        const offsets = {};
        let first = null;
        box.querySelectorAll('.lora-item-row[data-key]').forEach(r => {
            const rect = r.getBoundingClientRect();
            const keys = r.dataset.key.split('\n');
            offsets[keys[0]] = rect.top - boxTop();
            if (!first && rect.bottom > boxTop() + 1) first = keys;
        });
        L.renderChips();
        L.filterAndRender(L.currentFolder);
        const find = key => [...box.querySelectorAll('.lora-item-row[data-key]')].find(r => r.dataset.key.split('\n')[0] === key);
        let row = null, offset = 0;
        for (const key of first || []) {
            const at = L.filteredList.findIndex(x => L.rowKeys(x)[0] === key);
            if (at < 0) continue;
            while (L.displayedCount <= at) L.renderMore(true);
            row = find(key);
            if (row) { offset = key === first[0] ? offsets[key] : Math.max(0, offsets[key] || 0); break; }
        }
        const want = row ? row.offsetTop - box.offsetTop + box.clientHeight * 3 : box.clientHeight * 3;
        while (L.displayedCount < L.filteredList.length && box.scrollHeight < want) L.renderMore(true);
        L.fitListHeight();
        if (row) box.scrollTop += row.getBoundingClientRect().top - boxTop() - offset;
    }

    // As the list's search matched (LoraManager.searchLoose: mid-word).
    const matches = (text, query) => searchMatches(text, query, !!(LM() && LM().searchLoose));
    const variantMatches = (lora, query) => enabledFor(lora.name) && list(lora.name).some(v => matches(v.name, query));
    const currentQuery = () => searchQuery(document.getElementById('loraSearch')?.value || '');
    // Found by a variant's name only (not its own): opened by the search, showing just the matching variants.
    const foundByVariant = (lora, query) => !!query && !matches(LM().getDisplayName(lora), query) && variantMatches(lora, query);
    // LoRAs closed by hand while the search had opened them; forgotten when the search changes.
    const searchClosed = new Set();
    let lastQuery = '';
    const isOpen = (lora, query) => enabledFor(lora.name)
        && (foundByVariant(lora, query) ? !searchClosed.has(lora.name) : expanded.has(lora.name));

    // One open LoRA's rows: the variant in the prompt, then pinned ones, then the rest, each group alphabetical, then
    // ADD VARIANT. Found by a variant's name, only the matching variants.
    function childItems(l, query) {
        const active = activeVariant(currentMode(), LM().resolveTagIdentifier(l), l.name);
        const rank = v => (v.id === active ? 0 : v.pinned ? 1 : 2);
        let variants = list(l.name).slice().sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
        const byVariant = foundByVariant(l, query);
        if (byVariant) variants = variants.filter(v => matches(v.name, query));
        const out = variants.map(v => Object.assign({}, l, { _variant: v }));
        if (!byVariant && showAddFor(l.name)) out.push(Object.assign({}, l, { _addVariant: true }));
        return out;
    }
    function withChildRows(shown, query) {
        if (query !== lastQuery) { searchClosed.clear(); lastQuery = query; }
        const out = [];
        shown.forEach(l => {
            out.push(l);
            if (!l._variant && isOpen(l, query)) out.push(...childItems(l, query));
        });
        paintExpandButton();
        return out;
    }

    // Opens or closes one LoRA in place: its rows go in or out under it, and nothing above it moves.
    function toggleExpand(name) {
        const lora = loraByName(name);
        const query = currentQuery();
        if (lora && foundByVariant(lora, query)) {
            if (searchClosed.has(name)) searchClosed.delete(name); else searchClosed.add(name);
        } else if (expanded.has(name)) expanded.delete(name);
        else expanded.add(name);
        if (!refreshChildren(name)) rerender();
        paintExpandButton();
    }
    // Replaces a listed LoRA's variant rows with its current ones (none if closed). False if it isn't on screen.
    function refreshChildren(name) {
        const L = LM(), box = document.getElementById('loraVerticalList');
        const parentRow = box && [...box.querySelectorAll('.lv-parent')].find(r => r.dataset.lv === name);
        const at = L && L.filteredList ? L.filteredList.findIndex(x => x.name === name && !x._variant && !x._addVariant) : -1;
        if (!parentRow || at < 0 || at >= L.displayedCount) return false;
        // The listed entry, which says if it's in a group.
        const lora = L.filteredList[at];
        let n = 0;
        while (L.filteredList[at + 1 + n] && L.filteredList[at + 1 + n].name === name && (L.filteredList[at + 1 + n]._variant || L.filteredList[at + 1 + n]._addVariant)) n++;
        // Only the drawn ones come off the drawn count (a long list draws a page at a time).
        const drawn = Math.max(0, Math.min(n, L.displayedCount - (at + 1)));
        L.filteredList.splice(at + 1, n);
        L.displayedCount -= drawn;
        box.querySelectorAll('.lv-child').forEach(r => { if (r.dataset.lv === name) r.remove(); });
        const query = currentQuery();
        if (lora && isOpen(lora, query)) {
            const items = childItems(lora, query);
            L.filteredList.splice(at + 1, 0, ...items);
            L.displayedCount += items.length;
            let after = parentRow;
            items.forEach(it => { const row = L.keyRow(makeRow(it), it); after.after(row); after = row; });
            if (window.lucide) lucide.createIcons();
        }
        L.fitListHeight();
        return true;
    }
    // The header's open / close all button, for variants and groups (loragroups.js): closes all when any is open, else
    // opens all.
    const anyOpen = () => [...expanded].some(enabledFor) || !!(window.LoraGroups && window.LoraGroups.anyOpen());
    function toggleAll() {
        const close = anyOpen();
        if (close) expanded.clear();
        else Object.keys(loras).forEach(n => expanded.add(n));
        if (window.LoraGroups) window.LoraGroups.setAllOpen(!close);
        rerender();
    }
    function paintExpandButton() {
        const btn = document.getElementById('lvExpandToggle');
        if (!btn) return;
        const open = anyOpen();
        const label = open ? 'Close all' : 'Open all';
        btn.title = label;
        btn.setAttribute('aria-label', label);
        btn.innerHTML = `<i data-lucide="${open ? 'chevrons-down-up' : 'chevrons-up-down'}" width="16" height="16"></i>`;
        if (window.lucide) lucide.createIcons();
    }

    // A LoRA with variants on: its row opens and closes them instead of adding the LoRA, has a count badge on its
    // thumbnail and names the variant that's in.
    function decorateParent(row, lora, tagId, isActive) {
        const name = lora.name;
        const n = list(name).length;
        const v = isActive ? getVariant(name, activeVariant(currentMode(), tagId, name)) : null;
        const meta = row.querySelector('.lora-item-meta');
        const label = v ? loraActiveName(v.name) : '';
        // The dice (random::group::, loragroups.js) on one with two or more variants that's in no group.
        const dice = n >= 2 && window.LoraGroups && LoraGroups.diceHtml && !LoraGroups.groupOf(name);
        if (meta && dice) {
            meta.classList.add('lg-meta');
            meta.innerHTML = LoraGroups.diceHtml(LM().getDisplayName(lora), label);
            LoraGroups.wireDice(row, LM().getDisplayName(lora), [name]);
            if (LoraGroups.diceOn(LM().getDisplayName(lora))) row.classList.add('active');
        } else if (meta && v) meta.textContent = label;
        row.dataset.lv = name;
        const thumb = row.querySelector('.lora-item-thumb');
        if (thumb) {
            const wrap = document.createElement('div');
            wrap.className = 'lv-thumb-wrap';
            thumb.replaceWith(wrap);
            wrap.appendChild(thumb);
            const badge = document.createElement('span');
            badge.className = 'lv-thumb-count';
            // The count; the layers icon while there are none yet.
            badge.innerHTML = n ? String(n) : '<i data-lucide="layers" width="11" height="11"></i>';
            wrap.appendChild(badge);
        }
        row.classList.add('lv-parent');
        row.onclick = () => toggleExpand(name);
    }

    // A variant row (indented under its LoRA), or the dashed ADD VARIANT row.
    function makeRow(item) {
        const name = item.name;
        const row = document.createElement('div');
        row.style.cursor = 'pointer';
        row.dataset.lv = name;
        if (item._inGroup) row.dataset.lg = item._inGroup;
        if (item._addVariant) {
            row.className = 'lora-item-row lv-child lv-add-row';
            // The invisible buttons give it a LoRA row's height.
            row.innerHTML = '<i data-lucide="plus" width="15" height="15"></i>ADD VARIANT<div class="lora-star-toggle-stack lv-add-spacer" aria-hidden="true"><button class="lora-btn-star" tabindex="-1"><i data-lucide="star" size="16"></i></button><button class="lora-btn-action" tabindex="-1"><i data-lucide="settings-2" size="16"></i></button></div>';
            row.onclick = () => openEditor(name, null);
            return row;
        }
        const v = item._variant;
        const alias = LM().resolveTagIdentifier(item);
        const on = activeVariant(currentMode(), alias, name) === v.id;
        row.className = `lora-item-row lv-child${on ? ' active' : ''}`;
        row.innerHTML = `
            <img src="${thumbCache[v.id] || parentImg(name) || 'icon.png'}" class="lora-item-thumb" decoding="sync">
            <div class="lora-item-info">
                <div class="lora-item-name">${loraNameHtml(v.name)}</div>
                <div class="lv-sub">${hasWeight(v) ? `Weight: ${weightText(v.weight)}` : ''}</div>
            </div>
            <div class="lora-star-toggle-stack">
                <button class="lora-btn-star lv-pin${v.pinned ? ' pinned' : ''}" title="${v.pinned ? 'Unpin' : 'Pin to the top'}"><i data-lucide="pin" size="16" ${v.pinned ? 'fill="currentColor"' : ''}></i></button>
                <button class="lora-btn-action" style="color:var(--text-muted)"><i data-lucide="settings-2" size="16"></i></button>
            </div>`;
        row.onclick = () => apply(name, v.id);
        row.querySelector('.lv-pin').onclick = e => { e.stopPropagation(); togglePin(name, v.id); };
        row.querySelector('.lora-btn-action').onclick = e => { e.stopPropagation(); openEditor(name, v.id); };
        const img = row.querySelector('img');
        // Thumbnails are read into memory once (preloadThumbs()), so this is only for one not read yet.
        if (!(v.id in thumbCache)) loadThumbInto(img, v.id).then(has => { if (!has && !parentImg(name)) LM().smartLoadThumbnail(img, item); });
        else if (!thumbCache[v.id] && !parentImg(name)) LM().smartLoadThumbnail(img, item);
        return row;
    }

    // ---- applying ----
    let applying = false;
    // Adds the variant; if another one (or the LoRA without one) is in, swaps it out; if this one is in, removes it and
    // closes the LoRA. The list then redraws from the top, as when a LoRA is added or removed.
    async function apply(name, id) {
        if (applying) return;
        // One LoRA of a group at a time (loragroups.js).
        if (window.LoraGroups && activeVariant(currentMode(), LM().resolveTagIdentifier(loraByName(name) || { name, alias: name }), name) === undefined) await window.LoraGroups.clearOthers(name);
        const lora = loraByName(name);
        const promptEl = document.getElementById(LM().resolvePromptId());
        const v = getVariant(name, id);
        if (!lora || !v || !promptEl || !(window.Neo && window.Neo.appInjectConfig)) return;
        applying = true;
        try {
            const alias = LM().resolveTagIdentifier(lora);
            const current = activeVariant(currentMode(), alias, name);
            if (current !== undefined) {
                await LM().toggle(alias, name);
                if (current === id) {
                    expanded.delete(name);
                    return;
                }
            }
            await window.Neo.appInjectConfig(alias, name, promptEl, { id: v.id, weight: v.weight, trigger: v.trigger, negative: v.negative });
        } finally {
            applying = false;
            const box = document.getElementById('loraVerticalList');
            LM().renderChips();
            LM().filterAndRender(LM().currentFolder);
            if (box) box.scrollTop = 0;
            // Fitted again once the page has settled (a keyboard closing, say).
            setTimeout(() => LM().fitListHeight(), 350);
        }
    }

    function togglePin(name, id) {
        const v = getVariant(name, id);
        if (!v) return;
        v.pinned = !v.pinned;
        save();
        if (!refreshChildren(name)) rerender();
    }

    // ---- LoRA settings: the Variants and Show Add Variant switches ----
    function renderLoraSwitches(name) {
        const on = document.getElementById('cfgLoraVariantsSwitch');
        const add = document.getElementById('cfgLoraVariantsAddSwitch');
        if (!on || !add) return;
        on.checked = Object.prototype.hasOwnProperty.call(loras, name);
        add.checked = !on.checked || loras[name].showAdd !== false;
        syncLoraSwitches();
    }
    function syncLoraSwitches() {
        const on = document.getElementById('cfgLoraVariantsSwitch');
        document.getElementById('cfgLoraVariantsAddRow')?.classList.toggle('hidden', !(on && on.checked));
    }
    // From SAVE. Turning variants off for a LoRA keeps them saved.
    function saveLoraSwitches(name) {
        const on = document.getElementById('cfgLoraVariantsSwitch');
        const add = document.getElementById('cfgLoraVariantsAddSwitch');
        if (!on) return;
        const before = JSON.stringify(loras[name] || null);
        if (on.checked) loras[name] = { showAdd: add ? add.checked : true };
        else {
            delete loras[name];
            expanded.delete(name);
        }
        // Redrawn only if something changed, so closing the settings doesn't move the list.
        if (JSON.stringify(loras[name] || null) === before) return;
        save();
        rerender();
    }

    // ---- variant editor ----
    // A picked image cropped to the list thumbnail's shape and size, as a JPEG data URL.
    // Tapping a thumbnail: USE LAST IMAGE (History's newest) or CHOOSE FILE. Either goes through the file box, so each
    // window makes its thumbnail as it does from a file.
    function lastImageUrl() {
        return new Promise(resolve => {
            try {
                if (typeof db === 'undefined' || !db) return resolve(null);
                const req = db.transaction(['images'], 'readonly').objectStore('images').openCursor(null, 'prev');
                req.onsuccess = () => resolve(req.result ? (req.result.value.data || req.result.value.thumbnail) : null);
                req.onerror = () => resolve(null);
            } catch (e) { resolve(null); }
        });
    }
    function closeThumbMenu() { document.getElementById('thumbMenu')?.remove(); }
    function thumbMenu(btn, input) {
        closeThumbMenu();
        const say = t => { if (typeof Toast !== 'undefined') Toast.show({ text: t, duration: 'short' }); };
        const m = document.createElement('div');
        m.id = 'thumbMenu';
        m.className = 'modal';
        m.innerHTML = '<div class="thumb-menu-box"><button type="button" class="btn-small" data-k="last"><i data-lucide="history" width="16" height="16"></i>USE LAST IMAGE</button><button type="button" class="btn-small" data-k="file"><i data-lucide="image" width="16" height="16"></i>CHOOSE FILE</button></div>';
        m.querySelector('[data-k="file"]').onclick = () => { closeThumbMenu(); input.click(); };
        m.querySelector('[data-k="last"]').onclick = async () => {
            closeThumbMenu();
            const url = await lastImageUrl();
            if (!url) return say('No images in History yet');
            try {
                const blob = await (await fetch(url)).blob();
                const dt = new DataTransfer();
                dt.items.add(new File([blob], 'last.png', { type: blob.type || 'image/png' }));
                input.files = dt.files;
                input.dispatchEvent(new Event('change'));
            } catch (e) { say('That image could not be read.'); }
        };
        document.body.appendChild(m);
        if (window.lucide) lucide.createIcons();
        // Under the thumbnail, its left edge on the thumbnail's; above it if there isn't room below.
        const r = btn.getBoundingClientRect(), box = m.firstChild, h = box.offsetHeight;
        box.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - box.offsetWidth - 8))}px`;
        box.style.top = `${r.bottom + 6 + h > window.innerHeight - 8 ? Math.max(8, r.top - 6 - h) : r.bottom + 6}px`;
    }
    function makeThumb(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                const scale = Math.max(THUMB_W / img.width, THUMB_H / img.height);
                const w = img.width * scale, h = img.height * scale;
                const c = document.createElement('canvas');
                c.width = THUMB_W;
                c.height = THUMB_H;
                c.getContext('2d').drawImage(img, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h);
                URL.revokeObjectURL(url);
                resolve(c.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be read.')); };
            img.src = url;
        });
    }

    function closeEditor() {
        document.getElementById('loraVariantEditor')?.remove();
    }
    // Laid out as the LoRA's own settings: tap the title to rename, Weight slider, trigger text, additional negatives.
    function openEditor(name, id) {
        closeEditor();
        const existing = id ? getVariant(name, id) : null;
        const cfg = parentCfg(name);
        const lora = loraByName(name);
        const weight = hasWeight(existing) ? existing.weight : (cfg.weight !== undefined ? cfg.weight : 1);
        let vName = existing ? existing.name : '';
        let pendingThumb; // undefined: unchanged
        const modal = document.createElement('div');
        modal.id = 'loraVariantEditor';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content pin-scroll" style="max-height: 85vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3 id="lvTitle" class="lv-title" title="Tap to rename"></h3>
                    <div class="clear-field" style="flex:1; margin: 0 8px;">
                        <input type="text" id="lvTitleEdit" class="hidden" style="font-size:16px; font-weight:700;">
                        <button type="button" class="clear-field-btn hidden" aria-label="Clear"><i data-lucide="x" width="16" height="16"></i></button>
                    </div>
                    ${existing ? '<div class="row" style="width:auto; gap:8px; flex-shrink:0;"><button type="button" class="card-btn card-btn-delete" id="lvDeleteBtn" title="Delete variant"><i data-lucide="trash-2" width="16" height="16"></i></button></div>' : ''}
                </div>
                <div class="col" style="gap: 15px; padding: 10px 0 0;">
                    <div class="row" style="gap:12px; align-items:center;">
                        <button type="button" class="lv-thumb-pick" id="lvThumbPick" title="Choose a thumbnail">
                            <img id="lvThumbImg" src="${parentImg(name) || 'icon.png'}">
                            <span class="lv-thumb-badge"><i data-lucide="image-plus" width="13" height="13"></i></span>
                        </button>
                        <input type="file" id="lvThumbInput" accept="image/*" class="hidden">
                        <div class="lv-thumb-hint">Tap to choose a thumbnail. Without one, the variant uses the LoRA's.</div>
                    </div>
                    <div>
                        <label style="display:flex; justify-content:space-between;">
                            <span>Weight</span>
                            <span id="lvWeightDisplay" class="slider-val"></span>
                        </label>
                        <div class="slider-fake-thumb-wrap" style="margin-top:11px;"><input type="range" id="lvWeight" class="orange-slider thumb-only-slider" min="-2" max="2" step="0.05"><div class="slider-fake-thumb" data-for="lvWeight"></div></div>
                    </div>
                    <div>
                        <label for="lvTrigger">Prompt</label>
                        <textarea id="lvTrigger" rows="3" placeholder="trigger, words, here" style="margin-top:5px;"></textarea>
                    </div>
                    <div>
                        <label for="lvNegative">Additional Negative Prompts</label>
                        <textarea id="lvNegative" rows="3" style="margin-top:5px;"></textarea>
                    </div>
                    <div class="row pin-foot" style="gap:10px; margin-top:4px;">
                        <button type="button" class="btn-small btn-cancel" style="flex:1;" onclick="LoraVariants.closeEditor()">CANCEL</button>
                        <button type="button" class="btn-small btn-save" id="lvSaveBtn" style="flex:1;">SAVE</button>
                    </div>
                </div>
            </div>`;
        modal.addEventListener('click', e => { if (e.target === modal) closeEditor(); });
        document.body.appendChild(modal);

        // Name: the title, tapped to edit (as the LoRA's own name); "Variant Name" until named.
        const titleEl = modal.querySelector('#lvTitle');
        const titleEdit = modal.querySelector('#lvTitleEdit');
        if (typeof initClearField === 'function') initClearField(titleEdit);
        const paintTitle = () => {
            titleEl.textContent = vName || 'Variant Name';
            titleEl.classList.toggle('lv-title-empty', !vName);
        };
        paintTitle();
        titleEl.onclick = () => {
            titleEdit.value = vName;
            titleEl.classList.add('hidden');
            titleEdit.classList.remove('hidden');
            titleEdit.focus();
        };
        const commitTitle = () => {
            if (titleEdit.classList.contains('hidden')) return;
            vName = titleEdit.value.trim();
            titleEdit.classList.add('hidden');
            titleEl.classList.remove('hidden');
            paintTitle();
        };
        titleEdit.onblur = commitTitle;
        titleEdit.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); titleEdit.blur(); } };

        const weightEl = modal.querySelector('#lvWeight');
        const weightOut = modal.querySelector('#lvWeightDisplay');
        weightEl.value = weight;
        weightOut.textContent = Number(weightEl.value).toFixed(2);
        weightEl.addEventListener('input', () => { weightOut.textContent = Number(weightEl.value).toFixed(2); });
        if (typeof initThumbOnlySlider === 'function') initThumbOnlySlider('lvWeight');
        requestAnimationFrame(() => { if (typeof syncThumbOnlySliderPosition === 'function') syncThumbOnlySliderPosition('lvWeight'); });

        // A new variant starts from the LoRA's trigger text; its negatives are added after the LoRA's.
        const triggerEl = modal.querySelector('#lvTrigger');
        const negEl = modal.querySelector('#lvNegative');
        triggerEl.value = existing ? existing.trigger || '' : (cfg.trigger || '');
        negEl.value = existing ? existing.negative || '' : '';
        negEl.placeholder = "Added to the parent's negative prompts";
        // Rows and Auto-Expand Prompt Boxes as the LoRA's own boxes (cfg.js).
        if (typeof applyPromptBoxHeights === 'function') applyPromptBoxHeights();
        if (existing) loadThumbInto(modal.querySelector('#lvThumbImg'), existing.id);

        const thumbInput = modal.querySelector('#lvThumbInput');
        modal.querySelector('#lvThumbPick').onclick = e => thumbMenu(e.currentTarget, thumbInput);
        thumbInput.onchange = async () => {
            const file = thumbInput.files && thumbInput.files[0];
            thumbInput.value = '';
            if (!file) return;
            try {
                pendingThumb = await makeThumb(file);
                modal.querySelector('#lvThumbImg').src = pendingThumb;
            } catch (e) {
                if (typeof Toast !== 'undefined') Toast.show({ text: e.message, duration: 'short' });
            }
        };

        const del = modal.querySelector('#lvDeleteBtn');
        if (del) del.onclick = async () => {
            const ok = await window.appConfirm(`Delete the variant "${existing.name}"?`, { title: 'Delete Variant', okText: 'DELETE', danger: true });
            if (!ok) return;
            data[name] = list(name).filter(v => v.id !== existing.id);
            if (!data[name].length) delete data[name];
            save();
            deleteThumb(existing.id);
            closeEditor();
            rerender();
        };

        modal.querySelector('#lvSaveBtn').onclick = async () => {
            commitTitle();
            const w = parseFloat(weightEl.value);
            const entry = existing || { id: 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), pinned: false };
            // Unnamed: "Variant 2" and so on, so rows can be told apart.
            entry.name = vName || `Variant ${list(name).filter(v => v !== existing).length + 1}`;
            entry.weight = Number.isNaN(w) ? null : w;
            entry.trigger = triggerEl.value.trim();
            entry.negative = negEl.value.trim();
            if (!existing) data[name] = list(name).concat(entry);
            save();
            if (pendingThumb) await putThumb(entry.id, pendingThumb);
            closeEditor();
            rerender();
            if (typeof Toast !== 'undefined') Toast.show({ text: 'Saved', duration: 'short' });
        };
        if (window.lucide) lucide.createIcons();
    }

    // ---- Clean up model data ----
    const namesWithVariants = () => [...new Set(Object.keys(data).filter(n => list(n).length).concat(Object.keys(loras)))];
    function clearFor(isGone) {
        Object.keys(data).filter(isGone).forEach(n => {
            list(n).forEach(v => deleteThumb(v.id));
            delete data[n];
        });
        Object.keys(loras).filter(isGone).forEach(n => delete loras[n]);
        parentThumbNames().filter(isGone).forEach(n => setParentThumb(n, null));
        save();
    }

    // ---- backup / restore (zip, stored without compression) ----
    const CRC_TABLE = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            t[n] = c >>> 0;
        }
        return t;
    })();
    function crc32(bytes) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }
    function makeZip(files) {
        const enc = new TextEncoder();
        const parts = [], central = [];
        let offset = 0;
        files.forEach(f => {
            const nameBytes = enc.encode(f.name);
            const crc = crc32(f.data);
            const local = new DataView(new ArrayBuffer(30));
            local.setUint32(0, 0x04034b50, true);
            local.setUint16(4, 20, true);
            local.setUint16(8, 0, true);
            local.setUint32(14, crc, true);
            local.setUint32(18, f.data.length, true);
            local.setUint32(22, f.data.length, true);
            local.setUint16(26, nameBytes.length, true);
            parts.push(new Uint8Array(local.buffer), nameBytes, f.data);
            const cen = new DataView(new ArrayBuffer(46));
            cen.setUint32(0, 0x02014b50, true);
            cen.setUint16(4, 20, true);
            cen.setUint16(6, 20, true);
            cen.setUint32(16, crc, true);
            cen.setUint32(20, f.data.length, true);
            cen.setUint32(24, f.data.length, true);
            cen.setUint16(28, nameBytes.length, true);
            cen.setUint32(42, offset, true);
            central.push(new Uint8Array(cen.buffer), nameBytes);
            offset += 30 + nameBytes.length + f.data.length;
        });
        const centralSize = central.reduce((n, p) => n + p.length, 0);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true);
        end.setUint16(8, files.length, true);
        end.setUint16(10, files.length, true);
        end.setUint32(12, centralSize, true);
        end.setUint32(16, offset, true);
        const all = parts.concat(central, [new Uint8Array(end.buffer)]);
        const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
        let pos = 0;
        all.forEach(p => { out.set(p, pos); pos += p.length; });
        return out;
    }
    // Reads a zip made by makeZip() (stored entries only); null for anything else.
    function readZip(bytes) {
        try {
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            let endPos = -1;
            for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
                if (view.getUint32(i, true) === 0x06054b50) { endPos = i; break; }
            }
            if (endPos < 0) return null;
            const count = view.getUint16(endPos + 10, true);
            let pos = view.getUint32(endPos + 16, true);
            const dec = new TextDecoder();
            const files = {};
            for (let i = 0; i < count; i++) {
                if (view.getUint32(pos, true) !== 0x02014b50) return null;
                const method = view.getUint16(pos + 10, true);
                const size = view.getUint32(pos + 20, true);
                const nameLen = view.getUint16(pos + 28, true);
                const extraLen = view.getUint16(pos + 30, true);
                const commentLen = view.getUint16(pos + 32, true);
                const localPos = view.getUint32(pos + 42, true);
                const name = dec.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
                if (method !== 0) return null;
                const dataStart = localPos + 30 + view.getUint16(localPos + 26, true) + view.getUint16(localPos + 28, true);
                files[name] = bytes.subarray(dataStart, dataStart + size);
                pos += 46 + nameLen + extraLen + commentLen;
            }
            return files;
        } catch (e) {
            return null;
        }
    }
    const b64ToBytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    function bytesToB64(bytes) {
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(s);
    }
    // A file written through Capacitor in pieces: one base64 string of a big backup (tens of MB) can fail without an error.
    // 3 MB pieces (a multiple of 3 bytes, so each piece's base64 stands alone): the first written, the rest appended.
    const PIECE = 3 * 1024 * 1024;
    async function writeBig(fs, path, bytes, directory) {
        const log = m => { if (typeof dlog === 'function') dlog(m); };
        const n = Math.max(1, Math.ceil(bytes.length / PIECE));
        log(`[Backup] writing ${path}: ${(bytes.length / 1048576).toFixed(1)} MB in ${n} piece${n === 1 ? '' : 's'}`);
        try {
            for (let k = 0; k < n; k++) {
                const data = bytesToB64(bytes.subarray(k * PIECE, (k + 1) * PIECE));
                if (k === 0) await fs.writeFile({ path, data, directory });
                else await fs.appendFile({ path, data, directory });
            }
            log(`[Backup] ${path} written`);
        } catch (e) {
            log(`[Backup] ${path} failed: ${(e && e.message) || e}`);
            throw e;
        }
    }

    // Every custom per-LoRA setting: configs, names, ADetailer links, favourites (LoRA and folder) and variants.
    const BASE_KEYS = ['bojroLoraConfigs', 'bojroLoraUserRenames', 'bojroLoraLinkDisabled', 'bojroFolderFavs', 'bojroLoraGroups', STORE_KEY, LORAS_KEY];
    const isBackupKey = k => BASE_KEYS.includes(k) || k.startsWith('bojroLoraFavs');
    function backupKeys() {
        const keys = BASE_KEYS.slice();
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && isBackupKey(k) && !keys.includes(k)) keys.push(k);
        }
        return keys;
    }

    // Every custom LoRA setting with its thumbnails, as zip entries, manifest.json first (also part of a full backup,
    // backup.js).
    async function backupFiles() {
        const settings = {};
        backupKeys().forEach(k => { const v = localStorage.getItem(k); if (v !== null) settings[k] = v; });
        const thumbs = await allThumbs();
        const files = [];
        const thumbNames = [];
        // LoRAs' own thumbnails by number, as names can hold any character: { name: number }.
        const loraThumbs = {};
        const groupThumbs = [];
        Object.entries(thumbs).forEach(([id, url]) => {
            const m = /^data:image\/jpeg;base64,(.+)$/.exec(String(url));
            if (!m) return;
            // Groups' (loragroups.js), by group id.
            if (id.startsWith('g:')) {
                files.push({ name: `group-thumbs/${id.slice(2)}.jpg`, data: b64ToBytes(m[1]) });
                groupThumbs.push(id.slice(2));
                return;
            }
            if (id.startsWith(PARENT)) {
                const n = Object.keys(loraThumbs).length + 1;
                loraThumbs[id.slice(PARENT.length)] = n;
                files.push({ name: `lora-thumbs/${n}.jpg`, data: b64ToBytes(m[1]) });
                return;
            }
            files.push({ name: `thumbs/${id}.jpg`, data: b64ToBytes(m[1]) });
            thumbNames.push(id);
        });
        // The server's thumbnails as saved on the device, so a restore needn't download them: { name: [number, date] }.
        const serverThumbs = {};
        const L = LM();
        if (L && L.fs) {
            const names = Object.keys(L.metaCache || {}).filter(n => L.metaCache[n] && !n.startsWith('ckpt_'));
            for (const n of names) {
                try {
                    const file = await L.fs.readFile({ path: `${L.CACHE_DIR}/${n.replace(/[^a-zA-Z0-9.\-_]/g, '_')}.jpg`, directory: 'CACHE' });
                    const i = Object.keys(serverThumbs).length + 1;
                    files.push({ name: `server-thumbs/${i}.jpg`, data: b64ToBytes(file.data) });
                    serverThumbs[n] = [i, L.metaCache[n]];
                } catch (e) {}
            }
        }
        const manifest = { app: 'Resolver', kind: 'lora-data', appVersion: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '', exportedAt: new Date().toISOString(), settings, thumbs: thumbNames, loraThumbs, groupThumbs, serverThumbs };
        files.unshift({ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
        return files;
    }
    async function backup() {
        try {
            const zip = makeZip(await backupFiles());
            const iso = new Date().toISOString();
            const filename = `resolver-loras-${iso.slice(0, 10).replace(/-/g, '')}${iso.slice(11, 19).replace(/:/g, '')}.zip`;
            const fs = typeof Filesystem !== 'undefined' ? Filesystem : null;
            if (fs) {
                await writeBig(fs, filename, zip, 'DOCUMENTS');
                if (typeof Toast !== 'undefined') Toast.show({ text: 'Saved to Documents', duration: 'short' });
            } else {
                const blob = new Blob([zip], { type: 'application/zip' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
            }
            return true;
        } catch (e) {
            await window.appAlert('Backup failed: ' + e.message, { title: 'Backup Failed', danger: true });
            return false;
        }
    }

    // A LoRA data backup's entries (a zip's, by name) if it's one of ours: { manifest, settings, files }; else null.
    function readBackup(files) {
        let manifest = null;
        try { manifest = files && files['manifest.json'] ? JSON.parse(new TextDecoder().decode(files['manifest.json'])) : null; } catch (e) { manifest = null; }
        const settings = manifest && manifest.app === 'Resolver' && manifest.kind === 'lora-data' && manifest.settings && typeof manifest.settings === 'object' && !Array.isArray(manifest.settings) ? manifest.settings : null;
        // Only per-LoRA keys, all strings.
        if (!settings || Object.keys(settings).some(k => !isBackupKey(k) || typeof settings[k] !== 'string')) return null;
        return { manifest, settings, files };
    }
    // Replaces every custom LoRA setting and thumbnail with a backup's (readBackup()); the app reloads afterwards (Restore,
    // backup.js).
    async function restoreBackup({ manifest, settings, files }) {
        backupKeys().forEach(k => localStorage.removeItem(k));
        Object.entries(settings).forEach(([k, v]) => localStorage.setItem(k, v));
        await dbRun('readwrite', s => s.clear());
        const ids = Array.isArray(manifest.thumbs) ? manifest.thumbs : [];
        for (const id of ids) {
            const bytes = files[`thumbs/${id}.jpg`];
            if (bytes && /^[a-z0-9]+$/i.test(String(id))) await putThumb(String(id), 'data:image/jpeg;base64,' + bytesToB64(bytes));
        }
        const serverThumbs = manifest.serverThumbs && typeof manifest.serverThumbs === 'object' ? manifest.serverThumbs : {};
        const L = LM();
        if (L && L.fs) {
            for (const [name, entry] of Object.entries(serverThumbs)) {
                const bytes = Array.isArray(entry) && files[`server-thumbs/${entry[0]}.jpg`];
                if (!bytes || name.startsWith('ckpt_')) continue;
                try {
                    await L.fs.writeFile({ path: `${L.CACHE_DIR}/${name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}.jpg`, data: bytesToB64(bytes), directory: 'CACHE', recursive: true });
                    L.metaCache[name] = String(entry[1] || 'unknown');
                } catch (e) {}
            }
            await L.saveMetaCache();
        }
        for (const id of Array.isArray(manifest.groupThumbs) ? manifest.groupThumbs : []) {
            const bytes = files[`group-thumbs/${id}.jpg`];
            if (bytes && /^[a-z0-9]+$/i.test(String(id))) await putThumb('g:' + id, 'data:image/jpeg;base64,' + bytesToB64(bytes));
        }
        const loraThumbs = manifest.loraThumbs && typeof manifest.loraThumbs === 'object' ? manifest.loraThumbs : {};
        for (const [name, n] of Object.entries(loraThumbs)) {
            const bytes = files[`lora-thumbs/${n}.jpg`];
            if (bytes) await setParentThumb(name, 'data:image/jpeg;base64,' + bytesToB64(bytes));
        }
    }

    // Variant thumbnails, read into memory once the app is idle (cfg.js, at start).
    function preload() {
        (window.requestIdleCallback || setTimeout)(() => preloadThumbs());
    }

    const api = {
        enabledFor, list, getVariant, activeVariant, currentMode, detectedTags, apply, togglePin,
        withChildRows, variantMatches, matches, decorateParent, makeRow, toggleExpand, toggleAll,
        renderLoraSwitches, syncLoraSwitches, saveLoraSwitches, openEditor, closeEditor, loadThumbInto, makeThumb, thumbMenu, closeThumbMenu,
        parentThumb, parentThumbLoaded, setParentThumb, parentThumbNames, refreshList: rerender, paintExpand: paintExpandButton,
        // The thumbnail store for others (loragroups.js): every thumbnail whose key starts with prefix; url null removes one.
        readThumbs: prefix => allThumbs(IDBKeyRange.bound(prefix, prefix + '\uffff')),
        storeThumb: (key, url) => (url ? putThumb(key, url) : deleteThumb(key)),
        namesWithVariants, clearFor, backup, preload,
        // For Backup & Restore (backup.js).
        backupFiles, readBackup, restoreBackup, backupKeys, isBackupKey, makeZip, readZip, bytesToB64, writeBig,
        // For the checks in this repo's test runs.
        _reload: () => { data = readObj(STORE_KEY); loras = readObj(LORAS_KEY); }
    };
    window.LoraVariants = api;
})();
