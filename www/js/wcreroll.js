// Reroll (the viewer's Send menu): an image's wildcard picks, each kept or redrawn. REROLL puts its prompt in Generate
// with a strip under it; that tab's next images keep the kept picks (Wildcards.parts() gives them) until the strip's ×.
(function () {
    const $ = id => document.getElementById(id);
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const MODES = ['xl', 'flux', 'qwen', 'anima', 'krea'];
    let cur = null, redraw = new Set(), leave = new Set(), armed = null;

    // The viewed image's picks (saved with it since this version), or null.
    async function picksOfViewed() {
        const item = typeof currentGalleryImages !== 'undefined' ? currentGalleryImages[currentGalleryIndex] : null;
        if (!item) return null;
        const id = item.id != null ? item.id : item.domElement && item.domElement.dataset.dbId ? Number(item.domElement.dataset.dbId) : null;
        if (id == null || typeof db === 'undefined' || !db) return null;
        return new Promise(res => {
            try {
                const r = db.transaction(['images'], 'readonly').objectStore('images').get(id);
                r.onsuccess = () => res((r.result && r.result.wc) || null);
                r.onerror = () => res(null);
            } catch (e) { res(null); }
        });
    }
    // The picks in list order: a scene slot that is its whole wildcard is left out (the wildcard's own row is it), other
    // scene slots go straight under their wildcard (they were saved after every other pick).
    function tidyPicks(wc) {
        const map = byKey(wc);
        const lone = p => p.sceneSlot && map.get(p.parent) && Array.isArray(map.get(p.parent).bits) && map.get(p.parent).bits.length === 1;
        const list = wc.picks.filter(p => !lone(p)), kids = new Map(), out = [];
        list.forEach(p => { if (p.sceneSlot) { if (!kids.has(p.parent)) kids.set(p.parent, []); kids.get(p.parent).push(p); } });
        list.forEach(p => { if (!p.sceneSlot) { out.push(p); (kids.get(p.k) || []).forEach(c => out.push(c)); } });
        list.forEach(p => { if (p.sceneSlot && !out.includes(p)) out.push(p); });
        return Object.assign({}, wc, { picks: out });
    }
    // Rows: wildcards with more than one option, and random:: / order:: picks.
    const shown = wc => wc.picks.filter(p => p.random || (!p.variant && p.multi && p.name));
    const label = p => (p.random ? p.k.replace(/^(random|order):/, '$1::').replace(/#\d+$/, '') : p.name);
    const byKey = wc => new Map(wc.picks.map(p => [p.k, p]));
    // Left out: its ban button tapped, or inside one that is.
    function leftOut(p, map) {
        for (let x = p; x; x = x.parent ? map.get(x.parent) : null) if (leave.has(x.k)) return true;
        return false;
    }
    // Forge Couple: the prompt line a pick is on (random:: picks: their token's line in the prompt).
    function lineOf(wc, p) {
        if (!p.random) return p.line != null ? p.line : p.parent && byKey(wc).get(p.parent) ? lineOf(wc, byKey(wc).get(p.parent)) : 0;
        const m = /^(random|order):([a-z]+)/.exec(p.k), n = parseInt((/#(\d+)$/.exec(p.k) || [])[1], 10) || 1;
        if (!m) return 0;
        const at = [...String(wc.prompt || '').matchAll(new RegExp(`${m[1]}::${m[2]}`, 'gi'))][n - 1];
        return at ? (String(wc.prompt).slice(0, at.index).match(/\n/g) || []).length : 0;
    }
    // Redrawn: tapped, or inside one that is.
    function redrawn(p, map) {
        for (let x = p; x; x = x.parent ? map.get(x.parent) : null) if (redraw.has(x.k)) return true;
        return false;
    }
    async function check() {
        const btn = $('fsWcBtn');
        if (!btn) return;
        const wc = await picksOfViewed();
        btn.classList.toggle('hidden', !(wc && shown(wc).length));
    }
    async function open() {
        const wc = await picksOfViewed();
        if (!wc) return;
        cur = tidyPicks(wc);
        redraw = new Set();
        leave = new Set();
        paint();
        const m = $('wcRerollModal');
        if (m.classList.contains('hidden') && typeof lockBodyScroll === 'function') lockBodyScroll();
        m.classList.remove('hidden');
    }
    function close() {
        const m = $('wcRerollModal');
        if (!m.classList.contains('hidden') && typeof unlockBodyScroll === 'function') unlockBodyScroll();
        m.classList.add('hidden');
    }
    function paint() {
        const map = byKey(cur), fc = cur.fc && Array.isArray(cur.fc.names) ? cur.fc : null;
        // Forge Couple: in the prompt's line order, each region under its name (a pick stays with the ones inside it).
        let rows = shown(cur);
        if (fc) rows = rows.map((p, i) => ({ p, i, l: lineOf(cur, p) })).sort((a, b) => a.l - b.l || a.i - b.i).map(x => x.p);
        const depth = p => { let d = 0; for (let x = p.parent && map.get(p.parent); x; x = x.parent && map.get(x.parent)) if (rows.includes(x)) d++; return d; };
        let lastLine = -1;
        $('wcRerollList').innerHTML = rows.map((p, i) => {
            const out = leave.has(p.k), outUnder = !out && leftOut(p, map);
            const own = !out && !outUnder && redraw.has(p.k), under = !out && !outUnder && !own && redrawn(p, map);
            const l = fc ? lineOf(cur, p) : 0;
            const head = fc && l !== lastLine ? `<div class="wc-reroll-head">${esc(fc.names[l] || `Line ${l + 1}`)}</div>` : '';
            lastLine = l;
            return head + `<div class="wc-pick${own ? ' redraw' : ''}${under ? ' under' : ''}${out ? ' out' : ''}${outUnder ? ' out under' : ''}" data-i="${i}" style="margin-left:${Math.min(3, depth(p)) * 14}px">
                <div class="wc-pick-text"><b>${esc(label(p))}</b><span>${esc(String(p.pick || '').trim() || '(nothing)')}</span></div>
                <button type="button" class="wc-pick-btn wc-pick-out" aria-label="${out || outUnder ? 'Put back' : 'Leave out'}" aria-pressed="${out || outUnder}"><i data-lucide="ban" width="20" height="20"></i></button>
                <button type="button" class="wc-pick-btn wc-pick-keep" aria-label="${own || under ? 'Redraw' : 'Keep'}"><i data-lucide="${own || under ? 'dices' : 'lock'}" width="20" height="20"></i></button></div>`;
        }).join('');
        $('wcRerollList').querySelectorAll('.wc-pick').forEach(el => {
            const p = rows[+el.dataset.i];
            // The row (or its lock/dice): keep or redraw; a left-out one is put back first.
            el.onclick = () => {
                if (el.classList.contains('under')) return;
                if (leave.has(p.k)) leave.delete(p.k); else if (redraw.has(p.k)) redraw.delete(p.k); else redraw.add(p.k);
                paint();
            };
            el.querySelector('.wc-pick-out').onclick = e => {
                e.stopPropagation();
                if (el.classList.contains('under')) return;
                if (leave.has(p.k)) leave.delete(p.k); else { leave.add(p.k); redraw.delete(p.k); }
                paint();
            };
        });
        const n = rows.filter(p => !leftOut(p, map) && redrawn(p, map)).length, m = rows.filter(p => leave.has(p.k)).length;
        const go = $('wcRerollGo');
        go.disabled = !n && !m;
        go.textContent = n && m ? `REROLL ${n}, LEAVE OUT ${m}` : n ? `REROLL ${n} IN GENERATE` : m ? `LEAVE OUT ${m} IN GENERATE` : 'TAP ONE TO REDRAW IT';
        if (window.lucide) lucide.createIcons();
    }
    // The picks to give again: kept wildcards as their chosen option (their own wildcards then picked again unless kept
    // too), {choices} only with nothing redrawn inside, random:: as picked.
    function kept(wc) {
        const map = byKey(wc), memo = [];
        const below = p => wc.picks.some(x => { for (let y = x; y; y = y.parent ? map.get(y.parent) : null) if (y.parent === p.k && redrawn(x, map)) return true; return false; });
        wc.picks.forEach(p => {
            if (p.sceneSlot) return;
            // Left out: nothing (what's inside it goes with it).
            if (leftOut(p, map)) { if (leave.has(p.k)) { memo.push([p.k, '']); if (!p.random && !p.variant) memo.push(['#tags:' + p.k, []]); } return; }
            if (redrawn(p, map)) return;
            if (p.random) memo.push([p.k, p.pick]);
            // Scene optimization's text: its redrawn slots as their wildcard again.
            else if (p.bits) { memo.push([p.k, p.bits.map((b, j) => (b.slot && leave.has(`${p.k}/${j}`) ? '' : b.slot && redraw.has(`${p.k}/${j}`) ? `__${b.name}__` : b.text)).join('')]); memo.push(['#tags:' + p.k, p.tags || []]); }
            else if (p.variant) { if (!below(p)) memo.push([p.k, p.pick]); }
            else { memo.push([p.k, p.choice]); memo.push(['#tags:' + p.k, p.tags || []]); }
        });
        return memo;
    }
    function reroll() {
        const wc = cur, map = byKey(wc);
        const names = shown(wc).filter(p => redraw.has(p.k) && !leftOut(p, map)).map(label), out = shown(wc).filter(p => leave.has(p.k)).map(label);
        const mode = MODES.includes(wc.mode) ? wc.mode : (MODES.includes(typeof currentMode !== 'undefined' ? currentMode : '') ? currentMode : 'xl');
        armed = { mode, memo: kept(wc), keep: shown(wc).filter(p => !redrawn(p, map) && !leftOut(p, map)).length, names, out };
        close();
        if (typeof closeFsModal === 'function') closeFsModal();
        if (typeof switchTab === 'function') switchTab('gen');
        if (typeof setMode === 'function' && typeof currentMode !== 'undefined' && currentMode !== mode) setMode(mode);
        const box = $(`${mode}_prompt`);
        // Forge Couple: the background in the prompt box and each region's text in its own box (made without it: off).
        const text = wc.fc && Array.isArray(wc.fc.regions) ? wc.fc.bg || '' : wc.prompt;
        if ('fc' in wc && window.ForgeCouple && ForgeCouple.restore) ForgeCouple.restore(mode, wc.fc ? wc.fc.regions : null);
        if (box && text != null && box.value !== text) { box.value = text; box.dispatchEvent(new Event('input', { bubbles: true })); }
        strip();
    }
    // The strip under the prompt box while armed.
    function strip() {
        document.querySelectorAll('.wc-reroll-strip').forEach(e => e.remove());
        if (!armed) return;
        const box = $(`${armed.mode}_prompt`), at = box && (box.closest('.wc-box') || box);
        if (!at) return;
        const el = document.createElement('div');
        el.className = 'wc-reroll-strip';
        const parts = [`Keeping ${armed.keep} pick${armed.keep === 1 ? '' : 's'}`].concat(armed.names.length ? [`redrawing ${esc(armed.names.join(', '))}`] : [])
            .concat((armed.out || []).length ? [`<b class="wc-out">excluding ${esc(armed.out.join(', '))}</b>`] : []);
        el.innerHTML = `<i data-lucide="lock" width="16" height="16"></i><span>${parts.join(' • ')}</span><button type="button" aria-label="Stop keeping picks"><i data-lucide="x" width="18" height="18"></i></button>`;
        el.querySelector('button').onclick = () => { armed = null; strip(); };
        at.after(el);
        if (window.lucide) lucide.createIcons();
    }
    // A job built while armed (buildJobFromUI(), engine.js): its images keep the picks; Scene optimization sits it out.
    function mark(job) {
        if (!armed || !job || job.mode !== armed.mode) return;
        job.reroll = armed.memo;
        job.scene = false;
    }
    // The prompt box emptied (by hand or the trash button) or reset to the default prompt: picks no longer kept.
    function disarm(mode) {
        if (!armed || (mode && armed.mode !== mode)) return;
        armed = null;
        strip();
    }
    document.addEventListener('input', e => {
        if (!armed || !e.target || e.target.id !== `${armed.mode}_prompt`) return;
        if (!e.target.value.trim()) disarm(armed.mode);
    }, true);
    window.WcReroll = { disarm, check, open, close, reroll, mark, armed: () => armed, _tidy: tidyPicks };
})();
