// Prompt history: the last 20 prompts per tab (Inpaint and img2img share one), saved when a job is built.
// History search: filters History by each image's saved prompt and checkpoint.
(function() {
    const MAX = 20;
    const enabled = () => localStorage.getItem('bojroPromptHistory') !== 'false';
    const listKey = mode => `bojro_prompt_history_${mode}`;
    const read = mode => { try { return JSON.parse(localStorage.getItem(listKey(mode))) || []; } catch (e) { return []; } };
    let openMode = null, viewing = null;
    // In the prompt colors when they're on (Config > Interface), as in the prompt boxes.
    const colors = () => !!(window.PromptColors && PromptColors.on());
    function putText(el, t) {
        if (colors()) { el.classList.add('pc-text'); el.innerHTML = PromptColors.html(t); } else el.textContent = t;
    }
    const COUPLE = '<span class="prompt-hist-couple"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18"/></svg>COUPLE</span>';
    const FULL = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>';

    // Inpaint / img2img: which one, and the checkpoint's type (its Checkpoint settings type, else from its name).
    function labels(mode, job) {
        if (mode !== 'inp' || !job) return {};
        const title = job.modelTitle || '';
        const type = (typeof getCheckpointConfig === 'function' && (getCheckpointConfig(title) || {}).type)
            || (title && window.LoraManager ? window.LoraManager.detectCheckpointArchitectureFromName(title) : '');
        const names = typeof CHECKPOINT_TYPE_LABELS !== 'undefined' ? CHECKPOINT_TYPE_LABELS : {};
        return { k: currentInpaintTopMode === 'img2img' ? 'img2img' : 'Inpaint', ...(names[type] ? { a: names[type] } : {}) };
    }

    function record(mode, job) {
        if (!enabled()) return;
        const text = (document.getElementById(`${mode}_prompt`)?.value || '').trim();
        if (!text) return;
        const negEl = document.getElementById(`${mode}_neg`);
        const neg = negEl ? negEl.value.trim() : null;
        // Forge Couple's region prompts (forgecouple.js) are part of the entry.
        const r = job && job.fcRegions ? job.fcRegions : null;
        const list = read(mode).filter(e => e.t !== text || (e.n ?? null) !== neg || JSON.stringify(e.r || null) !== JSON.stringify(r));
        list.unshift({ t: text, ...(r ? { r } : {}), ...(neg === null ? {} : { n: neg }), ...labels(mode, job), at: Date.now() });
        try { localStorage.setItem(listKey(mode), JSON.stringify(list.slice(0, MAX))); } catch (e) {}
    }

    // "Just now", "12 min ago", "Today 14:05", "Yesterday", "3 days ago", "3 Oct"
    function age(ts) {
        const now = Date.now(), diff = now - ts;
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
        const d = new Date(ts), today = new Date(now);
        today.setHours(0, 0, 0, 0);
        if (ts >= today.getTime()) return `Today ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const days = Math.floor((today.getTime() - ts) / 86400000) + 1;
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days} days ago`;
        return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}`;
    }

    function open(mode) {
        openMode = mode;
        const listEl = document.getElementById('promptHistoryList');
        const list = read(mode);
        document.getElementById('promptHistoryClearBtn').disabled = !list.length;
        listEl.innerHTML = '';
        if (!list.length) listEl.innerHTML = '<div class="empty-note">No prompts yet</div>';
        list.forEach(e => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'prompt-hist-row';
            row.innerHTML = '<div class="prompt-hist-age"></div><div class="prompt-hist-text"></div>';
            row.firstChild.textContent = age(e.at);
            const tags = [e.k, e.a].filter(Boolean);
            if (tags.length) {
                const t = document.createElement('span');
                t.className = 'prompt-hist-tags';
                t.textContent = ' · ' + tags.join(' · ');
                row.firstChild.appendChild(t);
            }
            // Forge Couple's: marked.
            if (e.r && e.r.length) row.firstChild.insertAdjacentHTML('beforeend', COUPLE);
            putText(row.children[1], e.t);
            (e.r || []).forEach((t, i) => {
                const reg = document.createElement('div');
                reg.className = 'prompt-hist-reg';
                reg.innerHTML = `<span class="fc-dot" style="background:${window.ForgeCouple ? ForgeCouple.colour(i) : '#888'}"></span><span class="t"></span>`;
                putText(reg.lastChild, t);
                row.appendChild(reg);
            });
            if (e.n) {
                const neg = document.createElement('div');
                neg.className = 'prompt-hist-neg';
                neg.innerHTML = '<b>Neg:</b> <span class="t"></span>';
                putText(neg.lastChild, e.n);
                row.appendChild(neg);
            }
            // The whole entry in a window.
            const full = document.createElement('span');
            full.className = 'prompt-hist-full';
            full.setAttribute('role', 'button');
            full.setAttribute('aria-label', 'Show all');
            full.innerHTML = FULL;
            full.onclick = ev => { ev.stopPropagation(); view(e); };
            row.appendChild(full);
            row.onclick = () => use(e);
            listEl.appendChild(row);
        });
        const modal = document.getElementById('promptHistoryModal');
        if (modal.classList.contains('hidden') && typeof lockBodyScroll === 'function') lockBodyScroll();
        modal.classList.remove('hidden');
    }

    // Empties this tab's list (Inpaint and img2img share one), after asking.
    async function clear() {
        const mode = openMode;
        if (!mode || !await window.appConfirm('', { title: 'Clear recent prompts?', okText: 'CLEAR', danger: true })) return;
        localStorage.removeItem(listKey(mode));
        if (openMode === mode) open(mode);
    }

    // One entry in full: its prompt (Forge Couple: the background, then each region), its negative; COPY (the prompt), USE.
    function view(e) {
        viewing = e;
        const tags = [e.k, e.a].filter(Boolean);
        const meta = document.getElementById('promptViewMeta');
        meta.textContent = [age(e.at)].concat(tags).join(' · ');
        if (e.r && e.r.length) meta.insertAdjacentHTML('beforeend', COUPLE);
        const body = document.getElementById('promptViewBody');
        body.innerHTML = '';
        const part = (label, t, dot) => {
            const d = document.createElement('div');
            d.innerHTML = `<label class="pv-reg-label">${dot ? `<span class="fc-dot" style="background:${dot}"></span>` : ''}<span></span></label><div class="inset-card pv-box"></div>`;
            d.querySelector('label span:last-child').textContent = label;
            putText(d.lastChild, t);
            body.appendChild(d);
        };
        part(e.r && e.r.length ? 'Prompt (background)' : 'Prompt', e.t);
        (e.r || []).forEach((t, i) => part(`Region ${i + 1}`, t, window.ForgeCouple ? ForgeCouple.colour(i) : '#888'));
        if (e.n) part('Negative', e.n);
        document.getElementById('promptViewModal').classList.remove('hidden');
    }
    function closeView() {
        viewing = null;
        document.getElementById('promptViewModal').classList.add('hidden');
    }
    async function copyView() {
        if (!viewing) return;
        const text = viewing.t;
        try { await navigator.clipboard.writeText(text); } catch (err) {
            const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
        }
        if (typeof Toast !== 'undefined' && !(window.androidShowsOwnClipboardToast && androidShowsOwnClipboardToast())) Toast.show({ text: 'Prompt copied', duration: 'short' });
    }
    function useView() {
        const e = viewing;
        closeView();
        if (e) use(e);
    }

    function close() {
        closeView();
        document.getElementById('promptHistoryModal').classList.add('hidden');
        if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
        openMode = null;
    }

    // Puts back the prompt and its negative; the tab's tapped styles are worked out again from the new text.
    function use(e) {
        const mode = openMode;
        const el = document.getElementById(`${mode}_prompt`);
        const negEl = document.getElementById(`${mode}_neg`);
        close();
        if (!el) return;
        const sm = window.StyleManager;
        if (sm && sm.getSelectedStylesForMode) {
            sm.getSelectedStylesForMode(mode).clear();
            if (sm.appliedInsertions) delete sm.appliedInsertions[mode];
        }
        el.value = e.t;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        if (window.ForgeCouple) ForgeCouple.restore(mode, e.r);
        if (negEl && typeof e.n === 'string') {
            negEl.value = e.n;
            negEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (sm && sm.detectAppliedStyles) {
            const target = sm.targetMode;
            sm.targetMode = mode;
            sm.detectAppliedStyles();
            sm.targetMode = target;
            if (sm.saveSelectionState) sm.saveSelectionState();
        }
    }

    function setEnabled(on) {
        localStorage.setItem('bojroPromptHistory', on ? 'true' : 'false');
        document.body.classList.toggle('no-prompt-history', !on);
    }

    // ---- History search ----
    const texts = new Map();
    let query = '';
    let timer = null;

    async function textsOf(item) {
        if (texts.has(item.id)) return texts.get(item.id);
        let out = [];
        // History's light copy has them already (gallerylite.js).
        if (Array.isArray(item.search)) out = item.search.slice();
        else try {
            const data = item.data || '';
            const b64 = data.slice(data.indexOf(',') + 1, data.indexOf(',') + 1 + 700000);
            const bin = atob(b64.slice(0, b64.length - (b64.length % 4)));
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const raw = parametersFromTextChunks(await readPngTextChunks(new Blob([bytes])));
            if (raw) {
                const info = parseGenInfo(raw);
                const model = (info.params.match(/Model:\s*([^,]+)/) || [])[1] || '';
                out = [info.pos, model].filter(Boolean);
            }
        } catch (e) {}
        // Its date too ("Nov 3", "November", "2026"; datesections.js).
        const date = window.GalleryDates ? GalleryDates.searchText(item) : '';
        if (date) out.push(date);
        texts.set(item.id, out);
        return out;
    }

    // The items matching the search, in order; all of them when there is none.
    async function filter(items) {
        const q = searchQuery(query);
        if (!q) return items;
        const all = await Promise.all(items.map(textsOf));
        const byId = new Map(items.map((it, i) => [it.id, all[i]]));
        return searchFilter(items, it => byId.get(it.id), q);
    }

    function toggleSearch() {
        const row = document.getElementById('galSearchRow');
        const opening = row.classList.contains('hidden');
        row.classList.toggle('hidden', !opening);
        document.getElementById('galSearchBtn').classList.toggle('active', opening);
        if (opening) document.getElementById('galSearchInput').focus();
        else clearSearch();
    }

    function clearSearch() {
        const input = document.getElementById('galSearchInput');
        if (input) input.value = '';
        if (!query) return;
        query = '';
        galleryPage = 1;
        loadGallery();
    }

    function onInput(el) {
        clearTimeout(timer);
        timer = setTimeout(() => {
            query = el.value;
            galleryPage = 1;
            loadGallery();
        }, 250);
    }

    window.PromptHistory = { record, open, close, clear, setEnabled, enabled, view, closeView, copyView, useView };
    window.HistorySearch = { filter, toggleSearch, clearSearch, onInput, active: () => !!searchQuery(query) };
    document.addEventListener('DOMContentLoaded', () => document.body.classList.toggle('no-prompt-history', !enabled()));
})();
