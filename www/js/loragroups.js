// LoRA groups: LoRAs under one header in the LoRA list, one of them in the prompt at a time (sliders excepted); a grouped LoRA is listed
// only in its group, with a pin instead of a star.
(function () {
    const KEY = 'bojroLoraGroups'; // [ { id, title, members: [name], pinned: [name], hideParents, fav, favWas: { name: [favourites key] } } ]
    const THUMB = 'g:';            // a group's thumbnail in the LoRA thumbnail store (loravariants.js), by id
    const HEAD = '\u0001group:';   // a header row's name in the list, never a LoRA's
    const readGroups = () => {
        try {
            const v = JSON.parse(localStorage.getItem(KEY) || '[]');
            return Array.isArray(v) ? v.filter(g => g && g.id && Array.isArray(g.members)) : [];
        } catch (e) {
            return [];
        }
    };
    let groups = readGroups();
    groups.forEach(g => { g.pinned = Array.isArray(g.pinned) ? g.pinned : []; g.favWas = g.favWas && typeof g.favWas === 'object' ? g.favWas : {}; });
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(groups)); } catch (e) {}
    }

    const LM = () => window.LoraManager;
    const LV = () => window.LoraVariants || null;
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const byId = id => groups.find(g => g.id === id) || null;
    const groupOf = name => groups.find(g => g.members.includes(name)) || null;
    const loraByName = name => (LM().allLoras || []).find(l => l.name === name) || null;
    const nameOf = l => LM().getDisplayName(l);
    const toast = text => { if (typeof Toast !== 'undefined') Toast.show({ text, duration: 'short' }); };
    const rerender = () => window.LoraVariants && window.LoraVariants.refreshList();

    // Group thumbnails, read into memory once.
    const thumbs = {};
    let thumbsRead = null;
    const readThumbs = () => (thumbsRead = thumbsRead || (window.LoraVariants ? window.LoraVariants.readThumbs(THUMB) : Promise.resolve({}))
        .then(all => Object.keys(all).forEach(k => { thumbs[k.slice(THUMB.length)] = all[k]; })));
    readThumbs();
    function setThumb(id, url) {
        if (url) thumbs[id] = url; else delete thumbs[id];
        return window.LoraVariants && window.LoraVariants.storeThumb(THUMB + id, url || null);
    }

    // ---- in the prompt ----
    const tagOf = l => LM().resolveTagIdentifier(l);
    const inPrompt = l => LM().getActivePrompt().toLowerCase().includes(`<lora:${String(tagOf(l)).toLowerCase()}:`);
    const activeVariantOf = l => { const lv = LV(); return lv && lv.enabledFor(l.name) ? lv.activeVariant(lv.currentMode(), tagOf(l), l.name) : null; };
    // Takes the group's other LoRAs out of the prompt before one of its LoRAs goes in (LoraManager.toggle(), LoraVariants.apply()).
    // LoRAs with Slider on are left out of this both ways, so a group's sliders can all be in together.
    const isSlider = n => !!(window.LoraSliders && window.LoraSliders.hasSlider(n));
    async function clearOthers(name) {
        const g = groupOf(name);
        if (!g || isSlider(name)) return;
        for (const m of g.members) {
            const l = m !== name && !isSlider(m) && loraByName(m);
            if (l && inPrompt(l)) await LM().toggle(tagOf(l), m);
        }
    }

    // ---- the list ----
    const open = new Set();          // groups open in the list; not saved, so the app starts with them closed
    const searchClosed = new Set();  // groups the search opened, closed by hand; forgotten when the search changes
    let lastQuery = '';
    let shown = {};                  // id: { members, titleHit, bySearch } as last listed, for opening in place
    const currentQuery = () => searchQuery(document.getElementById('loraSearch')?.value || '');
    // As the list's search matched (LoraManager.searchLoose: mid-word).
    const matches = (text, query) => searchMatches(text, query, !!(LM() && LM().searchLoose));

    // The group's rows when open: its LoRAs (or, with Hide Parents, a LoRA's variants in its place), the one in the
    // prompt first, then pinned ones, then the rest, each part in the list's order (a LoRA's variants by name).
    function memberItems(g, ls, query, titleHit) {
        const lv = LV();
        const items = [];
        ls.forEach(l => {
            if (g.hideParents && lv && lv.enabledFor(l.name)) {
                let vs = lv.list(l.name);
                if (query && !titleHit && !matches(nameOf(l), query)) vs = vs.filter(v => matches(v.name, query));
                const active = activeVariantOf(l);
                vs.forEach(v => items.push(Object.assign({}, l, { _variant: v, _inGroup: g.id, _flat: true, _rank: v.id === active ? 0 : v.pinned ? 1 : 2, _label: v.name })));
            } else {
                items.push(Object.assign({}, l, { _inGroup: g.id, _rank: inPrompt(l) ? 0 : g.pinned.includes(l.name) ? 1 : 2, _label: nameOf(l) }));
            }
        });
        const order = loraOrder(), byOrder = (a, b) => (a._variant || b._variant ? a._label.localeCompare(b._label) : order(a, b));
        items.sort((a, b) => a._rank - b._rank || byOrder(a, b));
        return items;
    }
    // The order chosen with the LoRA window's sort button (item 85): a group header by its newest LoRA, its most recently
    // used one, or its LoRAs' uses added up.
    function loraOrder() {
        const LS = window.ListSort, label = x => (x._groupHead ? x._title : (x._label || nameOf(x)));
        const key = l => LS.loraKey(LM().resolveTagIdentifier(l)), seenAt = LS.seen([]), u = LS.uses().lora || {};
        const membersOf = x => ((shown[x._groupHead] || {}).members || []);
        return LS.compare('lora', {
            name: label, key: x => (x._groupHead ? '' : key(x)),
            added: x => (x._groupHead ? Math.max(0, ...membersOf(x).map(l => seenAt[key(l)] || 0)) : seenAt[key(x)] || 0),
            use: x => (x._groupHead ? membersOf(x).reduce((t, l) => { const e = u[key(l)] || [0, 0]; return [t[0] + e[0], Math.max(t[1], e[1])]; }, [0, 0]) : u[key(x)])
        });
    }
    // On the sorted list (LoraManager.filterAndRender()): grouped LoRAs replaced by their group's header, placed in the
    // list's order, then its rows if open. A search opens a group with just its matches, or shows it whole if its title matches.
    function arrange(sorted, query, view, base, inView) {
        if (query !== lastQuery) { searchClosed.clear(); lastQuery = query; }
        shown = {};
        if (!groups.length) return sorted;
        const grouped = new Set(groups.flatMap(g => g.members));
        const rest = sorted.filter(l => !grouped.has(l.name));
        const inBase = new Set(base.map(l => l.name));
        const heads = [];
        groups.forEach(g => {
            if (view === 'starred' && !g.fav) return;
            const titleHit = !!query && matches(g.title, query);
            const lv = LV();
            let ls = g.members.map(loraByName).filter(l => l && (view === 'starred' || (inBase.has(l.name) && inView(l))));
            const content = window.LoraManager && window.LoraManager.contentHits;
            if (query && !titleHit) ls = ls.filter(l => matches(nameOf(l), query) || (lv && lv.variantMatches(l, query)) || (content && content.has(l.name)));
            if (!ls.length) return;
            const bySearch = !!query && !titleHit;
            shown[g.id] = { members: ls, titleHit, bySearch };
            heads.push({ name: HEAD + g.id, _groupHead: g.id, _title: g.title, _active: ls.some(inPrompt) });
        });
        const activeOf = x => (x._groupHead ? x._active : inPrompt(x));
        const order = loraOrder();
        const all = rest.concat(heads).sort((a, b) => (activeOf(b) - activeOf(a)) || order(a, b));
        const out = [];
        all.forEach(x => {
            out.push(x);
            if (!x._groupHead || !isOpen(x._groupHead)) return;
            const s = shown[x._groupHead];
            out.push(...memberItems(byId(x._groupHead), s.members, query, s.titleHit));
        });
        return out;
    }
    const isOpen = id => (shown[id] && shown[id].bySearch ? !searchClosed.has(id) : open.has(id));

    // ---- the dice (random::group::Name) ----
    const tokensFor = (text, key) => window.RandomTokens ? [...String(text || '').matchAll(new RegExp(RandomTokens.GROUP_TOKEN.source, 'gi'))].filter(m => RandomTokens.groupKey(m[2]) === key) : [];
    const diceOn = title => !!window.RandomTokens && tokensFor(LM().getActivePrompt(), RandomTokens.groupKey(title)).length > 0;
    // The status line: the dice, then the name of what's in the prompt.
    function diceHtml(title, label) {
        const on = diceOn(title);
        return `<button type="button" class="lr-dice${on ? ' on' : ''}" title="${on ? 'Take random::group out' : 'A random one each image'}" aria-label="${on ? 'Take random::group out' : 'A random one each image'}" aria-pressed="${on}"><i data-lucide="dices" width="12" height="12"></i></button><span class="lr-active">${esc(label || '')}</span>`;
    }
    // members: the LoRA names the token stands for (the group's, or the one LoRA with variants).
    async function diceTap(title, members) {
        if (!window.RandomTokens) return;
        const el = document.getElementById(LM().resolvePromptId());
        if (!el) return;
        const mode = el.id.replace(/_prompt$/, '');
        const key = RandomTokens.groupKey(title);
        if (tokensFor(el.value, key).length) {
            let v = el.value;
            tokensFor(v, key).reverse().forEach(m => { v = v.slice(0, m.index) + v.slice(m.index + m[0].length); });
            el.value = withTrailingComma(collapseBlankLines(v.replace(/,[ \t]*(?=,)/g, '').replace(/[ \t]{2,}/g, ' ')).replace(/^[\s,]+/, '').replace(/[\s,]+$/, ''));
        } else {
            for (const m of members) {
                const l = loraByName(m);
                if (l && !isSlider(m) && inPrompt(l)) await LM().toggle(tagOf(l), m);
            }
            appendTagsToBox(el, `random::group::${RandomTokens.groupName(title)}`);
        }
        if (typeof savePrompt === 'function') savePrompt(mode);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        LM().filterAndRender(LM().currentFolder);
    }
    function wireDice(row, title, members) {
        const b = row.querySelector('.lr-dice');
        if (b) b.onclick = e => { e.stopPropagation(); diceTap(title, members); };
    }

    // A header row: the group's thumbnail (its first LoRA's until one is chosen) with a count of what it holds (a LoRA
    // with variants counts as its variants, not itself); its title and what's in the prompt.
    function makeHead(item) {
        const g = byId(item._groupHead);
        const s = shown[g.id] || { members: [] };
        const ls = s.members;
        const actives = ls.filter(inPrompt), active = actives[0];
        let activeLabel = '';
        if (active) {
            const v = activeVariantOf(active);
            activeLabel = loraActiveName((v && window.LoraVariants.getVariant(active.name, v)?.name) || nameOf(active));
            if (actives.length > 1) activeLabel += ` +${actives.length - 1}`;
        }
        const first = g.members.map(loraByName).find(Boolean);
        const src = thumbs[g.id] || (first && LM().thumbFor(first.name)) || 'icon.png';
        const lv = LV();
        const n = g.members.reduce((sum, name) => sum + (lv && lv.enabledFor(name) ? lv.list(name).length : 1), 0);
        const row = document.createElement('div');
        row.className = `lora-item-row lg-head${active || diceOn(g.title) ? ' active' : ''}`;
        row.dataset.lghead = g.id;
        row.style.cursor = 'pointer';
        row.innerHTML = `
            <div class="lv-thumb-wrap"><img src="${src}" class="lora-item-thumb"><span class="lv-thumb-count"><i data-lucide="boxes" width="10" height="10"></i>${n}</span></div>
            <div class="lora-item-info">
                <div class="lora-item-name">${loraNameHtml(g.title)}</div>
                <div class="lora-item-meta lg-meta">${diceHtml(g.title, active ? activeLabel : '')}</div>
            </div>
            <div class="lora-star-toggle-stack">
                <button class="lora-btn-star" style="color:${g.fav ? '#ffc107' : 'var(--text-muted)'}" title="Favorite"><i data-lucide="star" size="16" ${g.fav ? 'fill="currentColor"' : ''}></i></button>
                <button class="lora-btn-action" style="color:var(--text-muted)"><i data-lucide="settings-2" size="16"></i></button>
            </div>`;
        row.onclick = () => toggleOpen(g.id);
        row.querySelector('.lora-btn-star').onclick = e => {
            e.stopPropagation();
            g.fav = !g.fav;
            save();
            LM().renderChips();
            rerender();
        };
        row.querySelector('.lora-btn-action').onclick = e => { e.stopPropagation(); openSettings(g.id); };
        wireDice(row, g.title, g.members.slice());
        // Thumbnails not shown yet this session are fetched as the list does.
        if (!thumbs[g.id] && first && !LM().thumbFor(first.name)) LM().smartLoadThumbnail(row.querySelector('.lora-item-thumb'), first);
        return row;
    }

    // A grouped LoRA's row (LoraManager.buildRow()): indented, with a pin for its place in the group; one without variants
    // shows its weight, as a variant does.
    function decorateMember(row, lora) {
        const g = byId(lora._inGroup);
        if (!g) return;
        row.classList.add('lg-child');
        row.dataset.lg = g.id;
        const meta = row.querySelector('.lora-item-meta');
        const cfg = typeof loraConfigs !== 'undefined' ? loraConfigs[lora.name] : null;
        if (meta && !row.classList.contains('lv-parent')) {
            const w = cfg && cfg.weight !== undefined && cfg.weight !== null && cfg.weight !== '' ? Number(cfg.weight) : NaN;
            meta.className = 'lv-sub';
            meta.textContent = isNaN(w) ? '' : `Weight: ${w.toFixed(2).replace(/(\.\d)0$/, '$1')}`;
        }
        const star = row.querySelector('.lora-btn-star');
        if (!star) return;
        const pinned = g.pinned.includes(lora.name);
        star.className = `lora-btn-star lv-pin${pinned ? ' pinned' : ''}`;
        star.style.color = '';
        star.title = pinned ? 'Unpin' : 'Pin to the top';
        star.innerHTML = `<i data-lucide="pin" size="16" ${pinned ? 'fill="currentColor"' : ''}></i>`;
        star.onclick = e => {
            e.stopPropagation();
            g.pinned = pinned ? g.pinned.filter(n => n !== lora.name) : g.pinned.concat(lora.name);
            save();
            if (!refreshGroup(g.id)) rerender();
        };
    }

    // Opens or closes one group in place: its rows go in or out under the header, and nothing above it moves.
    function toggleOpen(id) {
        if (shown[id] && shown[id].bySearch) {
            if (searchClosed.has(id)) searchClosed.delete(id); else searchClosed.add(id);
        } else if (open.has(id)) open.delete(id);
        else open.add(id);
        if (!refreshGroup(id)) rerender();
        if (window.LoraVariants) window.LoraVariants.paintExpand();
    }
    // Replaces a listed group's rows with its current ones (none if closed). False if its header isn't on screen.
    function refreshGroup(id) {
        const L = LM(), box = document.getElementById('loraVerticalList');
        const head = box && box.querySelector(`[data-lghead="${id}"]`);
        const at = L && L.filteredList ? L.filteredList.findIndex(x => x._groupHead === id) : -1;
        if (!head || at < 0 || at >= L.displayedCount || !shown[id]) return false;
        let n = 0;
        while (L.filteredList[at + 1 + n] && L.filteredList[at + 1 + n]._inGroup === id) n++;
        // Only the drawn ones come off the drawn count (a long list draws a page at a time).
        const drawn = Math.max(0, Math.min(n, L.displayedCount - (at + 1)));
        L.filteredList.splice(at + 1, n);
        L.displayedCount -= drawn;
        box.querySelectorAll(`[data-lg="${id}"]`).forEach(r => r.remove());
        if (isOpen(id)) {
            const query = currentQuery();
            let items = memberItems(byId(id), shown[id].members, query, shown[id].titleHit);
            const lv = LV();
            if (lv) items = lv.withChildRows(items, query);
            L.filteredList.splice(at + 1, 0, ...items);
            L.displayedCount += items.length;
            const prompt = L.getActivePrompt();
            let after = head;
            items.forEach(it => { const row = L.buildRow(it, prompt, lv); after.after(row); after = row; });
            if (window.lucide) lucide.createIcons();
        }
        L.fitListHeight();
        return true;
    }
    const anyOpen = () => groups.some(g => open.has(g.id));
    function setAllOpen(on) {
        if (on) groups.forEach(g => open.add(g.id)); else open.clear();
    }

    // ---- favourites: a favourite LoRA put in a group is pinned there instead, and is a favourite again when it leaves ----
    const FAV_PREFIX = 'bojroLoraFavs';
    function favouriteKeys() {
        const out = [];
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(FAV_PREFIX)) out.push(k); }
        return out;
    }
    const readList = k => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
    function takeFavourite(g, name) {
        const keys = favouriteKeys().filter(k => readList(k).includes(name));
        keys.forEach(k => localStorage.setItem(k, JSON.stringify(readList(k).filter(n => n !== name))));
        if (!keys.length) return;
        g.favWas[name] = keys;
        if (!g.pinned.includes(name)) g.pinned.push(name);
    }
    function giveBackFavourite(g, name) {
        (g.favWas[name] || []).forEach(k => {
            const list = readList(k);
            if (!list.includes(name)) localStorage.setItem(k, JSON.stringify(list.concat(name)));
        });
        delete g.favWas[name];
        g.pinned = g.pinned.filter(n => n !== name);
    }
    const reloadFavourites = () => { if (LM() && typeof LM().loadLoraFavorites === 'function') LM().loadLoraFavorites(); };

    // ---- group settings ----
    function closeSettings() {
        document.getElementById('loraGroupEditor')?.remove();
    }
    // id null: a new group of the given LoRAs.
    function openSettings(id, presetMembers) {
        closeSettings();
        const g = id ? byId(id) : null;
        let title = g ? g.title : '';
        const members = g ? g.members.slice() : (presetMembers || []).slice();
        let pendingThumb; // undefined: unchanged
        const modal = document.createElement('div');
        modal.id = 'loraGroupEditor';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content pin-scroll" style="max-height: 85vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3 id="lgTitle" class="lv-title" title="Tap to rename"></h3>
                    <div class="clear-field" style="flex:1; margin: 0 8px;">
                        <input type="text" id="lgTitleEdit" class="hidden" style="font-size:16px; font-weight:700;">
                        <button type="button" class="clear-field-btn hidden" aria-label="Clear"><i data-lucide="x" width="16" height="16"></i></button>
                    </div>
                    ${g ? '<div class="row" style="width:auto; gap:8px; flex-shrink:0;"><button type="button" class="card-btn card-btn-delete" id="lgUngroupBtn" title="Ungroup"><i data-lucide="ungroup" width="16" height="16"></i></button></div>' : ''}
                </div>
                <div class="col" style="gap: 15px; padding: 10px 0 0;">
                    <div class="lora-cfg-thumb-row">
                        <button type="button" class="lv-thumb-pick lora-cfg-thumb" id="lgThumbPick" title="Choose a thumbnail">
                            <img id="lgThumbImg" src="icon.png">
                            <span class="lv-thumb-badge"><i data-lucide="image-plus" width="13" height="13"></i></span>
                        </button>
                        <input type="file" id="lgThumbInput" accept="image/*" class="hidden">
                        <div class="lora-cfg-switches">
                            <div class="row" style="justify-content:space-between; align-items:center;">
                                <label for="lgHideParents" class="opt-name">Hide Parents</label>
                                <input type="checkbox" id="lgHideParents" class="bojro-switch">
                            </div>
                            <div class="row" style="justify-content:space-between; align-items:center; gap:10px;">
                                <label class="opt-name">Type</label>
                                <select id="lgType" style="display:none;"></select><button type="button" class="model-picker-trigger hidden lora-cfg-type" data-target="lgType" data-kind="lora-type" data-modal-title="LoRA Type" onclick="openModelPicker(this)"><span class="model-picker-trigger-primary"></span><span class="model-picker-trigger-subtitle hidden"></span></button>
                            </div>
                            <div class="wc-hint" id="lgTypeHint" style="margin:-2px 0 0; font-size:12px;"></div>
                        </div>
                    </div>
                    <div>
                        <label id="lgCount"></label>
                        <div class="lg-members" id="lgMembers"></div>
                        <button type="button" class="lg-add" id="lgAddBtn"><i data-lucide="plus" width="15" height="15"></i>ADD LORAS</button>
                    </div>
                    <div class="row pin-foot" style="gap:10px; margin-top:4px;">
                        <button type="button" class="btn-small btn-cancel" style="flex:1;" onclick="LoraGroups.closeSettings()">CANCEL</button>
                        <button type="button" class="btn-small btn-save" id="lgSaveBtn" style="flex:1;">SAVE</button>
                    </div>
                </div>
            </div>`;
        let downOnBackdrop = false;
        modal.addEventListener('pointerdown', e => { downOnBackdrop = e.target === modal; });
        modal.addEventListener('click', e => { if (downOnBackdrop && e.target === modal) closeSettings(); downOnBackdrop = false; });
        document.body.appendChild(modal);

        // Title: tapped to edit, as a LoRA's name; "Group Name" until named.
        const titleEl = modal.querySelector('#lgTitle');
        const titleEdit = modal.querySelector('#lgTitleEdit');
        if (typeof initClearField === 'function') initClearField(titleEdit);
        const paintTitle = () => {
            titleEl.textContent = title || 'Group Name';
            titleEl.classList.toggle('lv-title-empty', !title);
        };
        paintTitle();
        titleEl.onclick = () => {
            titleEdit.value = title;
            titleEl.classList.add('hidden');
            titleEdit.classList.remove('hidden');
            titleEdit.focus();
        };
        const commitTitle = () => {
            if (titleEdit.classList.contains('hidden')) return;
            title = titleEdit.value.trim();
            titleEdit.classList.add('hidden');
            titleEl.classList.remove('hidden');
            paintTitle();
        };
        titleEdit.onblur = commitTitle;
        titleEdit.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); titleEdit.blur(); } };

        const hideEl = modal.querySelector('#lgHideParents');
        hideEl.checked = !!(g && g.hideParents);

        // Type: the members' own (randomtokens.js), "Mixed" while they differ; SAVE sets it on every member.
        const TYPES = [["", "None"], ["artstyle", "Artstyle"], ["background", "Background"], ["character", "Character"], ["characterpack", "Character pack"], ["clothing", "Clothing"], ["concept", "Concept"], ["other", "Other"], ["pose", "Pose"], ["slider", "Slider"], ["tool", "Tool"]];
        const typeEl = modal.querySelector('#lgType');
        const kinds = [...new Set(members.map(typeOf))];
        const startType = kinds.length === 1 ? kinds[0] : 'mixed';
        // A members' type this list doesn't have is kept (shown as it is), not saved back as None.
        if (startType !== 'mixed' && !TYPES.some(t => t[0] === startType)) TYPES.push([startType.replace(/[^a-z0-9_-]/gi, ''), startType.replace(/[^a-z0-9_ -]/gi, '')]);
        typeEl.innerHTML = (startType === 'mixed' ? '<option value="mixed">Mixed</option>' : '') + TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
        typeEl.parentElement.querySelector('.model-picker-trigger').dataset.customOrder = (startType === 'mixed' ? 'mixed,' : '') + TYPES.map(t => t[0]).join(',');
        typeEl.value = startType;
        const paintType = () => { modal.querySelector('#lgTypeHint').textContent = typeEl.value === 'mixed' ? 'Members differ. Pick one to set them all.' : 'Sets every LoRA in the group.'; };
        typeEl.onchange = paintType;
        paintType();
        if (typeof initModelPickers === 'function') initModelPickers();
        if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText('lgType');

        const thumbImg = modal.querySelector('#lgThumbImg');
        const paintThumb = () => {
            const first = members.map(loraByName).find(Boolean);
            thumbImg.src = pendingThumb || (g && thumbs[g.id]) || (first && LM().thumbFor(first.name)) || 'icon.png';
        };
        const thumbInput = modal.querySelector('#lgThumbInput');
        modal.querySelector('#lgThumbPick').onclick = e => LV().thumbMenu(e.currentTarget, thumbInput);
        thumbInput.onchange = async () => {
            const file = thumbInput.files && thumbInput.files[0];
            thumbInput.value = '';
            if (!file) return;
            try {
                pendingThumb = await window.LoraVariants.makeThumb(file);
                paintThumb();
            } catch (err) {
                toast(err.message);
            }
        };

        const list = modal.querySelector('#lgMembers');
        const paintMembers = () => {
            modal.querySelector('#lgCount').textContent = `LoRAs (${members.length})`;
            const lv = LV();
            list.innerHTML = '';
            members.map(n => loraByName(n) || { name: n }).sort((a, b) => nameOf(a).localeCompare(nameOf(b))).forEach(l => {
                const nv = lv && lv.enabledFor(l.name) ? lv.list(l.name).length : 0;
                const row = document.createElement('div');
                row.className = 'lg-mem';
                row.innerHTML = `<img src="${LM().thumbFor(l.name) || 'icon.png'}"><div class="lg-mem-name">${esc(nameOf(l))}${nv ? `<div class="lv-sub">${nv} variant${nv === 1 ? '' : 's'}</div>` : ''}</div><button type="button" class="lg-mem-x" aria-label="Remove"><i data-lucide="x" width="16" height="16"></i></button>`;
                row.querySelector('.lg-mem-x').onclick = () => { members.splice(members.indexOf(l.name), 1); paintMembers(); };
                list.appendChild(row);
            });
            paintThumb();
            if (window.lucide) lucide.createIcons();
        };
        paintMembers();
        modal.querySelector('#lgAddBtn').onclick = () => openPicker({ title: 'Add LoRAs', verb: 'ADD', exclude: members, groupId: id }, names => {
            names.forEach(n => { if (!members.includes(n)) members.push(n); });
            paintMembers();
        });

        const ungroupBtn = modal.querySelector('#lgUngroupBtn');
        if (ungroupBtn) ungroupBtn.onclick = async () => {
            const ok = await window.appConfirm(`Ungroup "${g.title}"? Its LoRAs go back to their places in the list.`, { title: 'Ungroup', okText: 'UNGROUP', danger: true });
            if (!ok) return;
            ungroup(g);
            closeSettings();
            rerender();
        };

        modal.querySelector('#lgSaveBtn').onclick = async () => {
            commitTitle();
            if (!members.length) { toast('A group needs at least one LoRA'); return; }
            let group = g;
            if (!group) {
                group = { id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: '', members: [], pinned: [], hideParents: false, fav: false, favWas: {} };
                groups.push(group);
                open.add(group.id);
            }
            // Unnamed: "Group 2" and so on.
            group.title = title || `Group ${groups.length}`;
            group.members.filter(n => !members.includes(n)).forEach(n => giveBackFavourite(group, n));
            members.filter(n => !group.members.includes(n)).forEach(n => takeFavourite(group, n));
            group.members = members.slice();
            group.hideParents = hideEl.checked;
            if (typeEl.value !== 'mixed') await setType(members, typeEl.value);
            save();
            reloadFavourites();
            if (pendingThumb) await setThumb(group.id, pendingThumb);
            closeSettings();
            LM().renderChips();
            rerender();
            toast('Saved');
        };
        if (window.lucide) lucide.createIcons();
    }
    // A type on these LoRAs (their settings fetched first where there are none yet, so weight and trigger stay theirs).
    // A member's type as its settings have it (RandomTokens.typeOf() reads Slider as none, item 50).
    const typeOf = n => ((typeof loraConfigs !== 'undefined' && loraConfigs[n] && loraConfigs[n].type === 'slider') ? 'slider' : (window.RandomTokens ? RandomTokens.typeOf(n) : ''));
    async function setType(names, type) {
        names = names.filter(n => typeOf(n) !== type);
        if (!names.length) return;
        for (const n of names) {
            const l = loraByName(n);
            if (!loraConfigs[n]) {
                const cfg = typeof loadSidecarConfig === 'function' ? await loadSidecarConfig(n, l && l.path ? l.path.replace(/\\/g, '/') : '') : { weight: 1, trigger: '' };
                if (!loraConfigs[n]) loraConfigs[n] = { ...cfg };
            }
            const c = loraConfigs[n];
            c.type = type;
            c.userEdited = true;
        }
        try { localStorage.setItem('bojroLoraConfigs', JSON.stringify(loraConfigs)); } catch (e) {}
    }
    function ungroup(g) {
        g.members.forEach(n => giveBackFavourite(g, n));
        groups = groups.filter(x => x !== g);
        open.delete(g.id);
        setThumb(g.id, null);
        save();
        reloadFavourites();
        LM().renderChips();
    }

    // ---- picking LoRAs ----
    function closePicker() {
        document.getElementById('loraGroupPicker')?.remove();
    }
    // opts: { title, verb, exclude: [names], groupId }. LoRAs in another group are listed last, greyed out, under a
    // heading that opens and closes them (closed at first).
    function openPicker(opts, done) {
        closePicker();
        const selected = new Set();
        let othersOpen = false;
        const all = (LM().allLoras || []).filter(l => !opts.exclude.includes(l.name)).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
        const elsewhere = l => { const g = groupOf(l.name); return g && g.id !== opts.groupId ? g : null; };
        const modal = document.createElement('div');
        modal.id = 'loraGroupPicker';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header"><h3>${esc(opts.title)}</h3></div>
                <div class="clear-field" style="margin-top:4px;">
                    <input type="text" id="lgPickSearch" placeholder="Search LoRAs...">
                    <button type="button" class="clear-field-btn hidden" aria-label="Clear"><i data-lucide="x" width="16" height="16"></i></button>
                </div>
                <div class="scroll-indicator-wrap" style="margin-top: 12px;">
                    <div class="lg-members lg-pick-list has-scroll-indicator" id="lgPickList"></div>
                    <div class="scroll-indicator"><div class="scroll-indicator-thumb"></div></div>
                </div>
                <div class="row" style="gap:10px; margin-top:14px;">
                    <button type="button" class="btn-small btn-cancel" style="flex:1;" onclick="LoraGroups.closePicker()">CANCEL</button>
                    <button type="button" class="btn-small btn-save" id="lgPickOk" style="flex:1;" disabled></button>
                </div>
            </div>`;
        let downOnBackdrop = false;
        modal.addEventListener('pointerdown', e => { downOnBackdrop = e.target === modal; });
        modal.addEventListener('click', e => { if (downOnBackdrop && e.target === modal) closePicker(); downOnBackdrop = false; });
        document.body.appendChild(modal);
        if (typeof attachScrollIndicator === 'function') attachScrollIndicator(modal.querySelector('#lgPickList'));
        const okBtn = modal.querySelector('#lgPickOk');
        const paintOk = () => { okBtn.textContent = `${opts.verb} (${selected.size})`; okBtn.disabled = !selected.size; };
        const listEl = modal.querySelector('#lgPickList');
        // Server thumbnails not shown yet this session load as rows come into view.
        const seen = new IntersectionObserver(entries => entries.forEach(e => {
            if (!e.isIntersecting) return;
            seen.unobserve(e.target);
            const l = loraByName(e.target.dataset.name);
            if (l) LM().smartLoadThumbnail(e.target.querySelector('img'), l);
        }), { root: listEl, rootMargin: '200px' });
        const rowFor = (l, other) => {
            const row = document.createElement('div');
            const on = selected.has(l.name);
            row.className = `lg-mem lg-pick${on ? ' on' : ''}${other ? ' lg-pick-off' : ''}`;
            row.dataset.name = l.name;
            const thumb = LM().thumbFor(l.name);
            row.innerHTML = `<img src="${thumb || 'icon.png'}"><div class="lg-mem-name">${esc(nameOf(l))}${other ? `<div class="lv-sub">In ${esc(other.title)}</div>` : ''}</div>${other ? '' : `<span class="lg-check${on ? ' on' : ''}">${on ? '<i data-lucide="check" width="14" height="14"></i>' : ''}</span>`}`;
            row.onclick = () => {
                if (other) { toast(`Already in ${other.title}`); return; }
                if (selected.has(l.name)) selected.delete(l.name); else selected.add(l.name);
                const fresh = rowFor(l, null);
                row.replaceWith(fresh);
                if (window.lucide) lucide.createIcons();
                paintOk();
            };
            if (!thumb) seen.observe(row);
            return row;
        };
        const paint = () => {
            const query = searchQuery(modal.querySelector('#lgPickSearch').value || '');
            const found = query ? searchFilter(all, l => [nameOf(l)], query) : all;
            listEl.innerHTML = '';
            const free = found.filter(l => !elsewhere(l)), taken = found.filter(elsewhere);
            free.forEach(l => listEl.appendChild(rowFor(l, null)));
            if (taken.length) {
                const h = document.createElement('button');
                h.type = 'button';
                h.className = 'lg-pick-head';
                h.setAttribute('aria-expanded', String(othersOpen));
                h.innerHTML = `<span>In other groups (${taken.length})</span><i data-lucide="${othersOpen ? 'chevron-up' : 'chevron-down'}" width="14" height="14"></i>`;
                h.onclick = () => { othersOpen = !othersOpen; paint(); };
                listEl.appendChild(h);
                if (othersOpen) taken.forEach(l => listEl.appendChild(rowFor(l, elsewhere(l))));
            }
            if (!found.length) listEl.innerHTML = '<div class="lg-pick-empty">No LoRAs found</div>';
            if (window.lucide) lucide.createIcons();
        };
        const search = modal.querySelector('#lgPickSearch');
        if (typeof initClearField === 'function') initClearField(search);
        search.addEventListener('input', paint);
        okBtn.onclick = () => {
            const names = [...selected];
            closePicker();
            done(names);
        };
        paint();
        paintOk();
    }
    // The header's new-group button: pick the LoRAs, then name the group.
    function newGroup() {
        if (!(LM().allLoras || []).length) { toast('No LoRAs loaded'); return; }
        openPicker({ title: 'Group LoRAs', verb: 'GROUP', exclude: [], groupId: null }, names => openSettings(null, names));
    }

    // ---- Clean up model data ----
    const memberNames = () => [...new Set(groups.flatMap(g => g.members))];
    function clearFor(isGone) {
        groups.forEach(g => {
            g.members = g.members.filter(n => !isGone(n));
            g.pinned = g.pinned.filter(n => !isGone(n));
            Object.keys(g.favWas).filter(isGone).forEach(n => delete g.favWas[n]);
        });
        groups.filter(g => !g.members.length).forEach(g => { open.delete(g.id); setThumb(g.id, null); });
        groups = groups.filter(g => g.members.length);
        save();
    }

    window.LoraGroups = {
        arrange, makeHead, decorateMember, clearOthers, toggleOpen, anyOpen, setAllOpen, newGroup, openSettings,
        closeSettings, openPicker, closePicker, groupOf, memberNames, clearFor, diceHtml, wireDice, diceOn,
        favCount: () => groups.filter(g => g.fav).length,
        // The groups as saved (random::group::, randomtokens.js).
        list: () => groups.map(g => ({ id: g.id, title: g.title, members: g.members.slice() })),
        // For the checks in this repo's test runs.
        _reload: () => { groups = readGroups(); groups.forEach(g => { g.pinned = g.pinned || []; g.favWas = g.favWas || {}; }); }
    };
})();
