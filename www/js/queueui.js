// Queue tab (item 79): compact cards (mode, model, settings chips; NEXT on the first waiting one; the running one's
// image count and a progress line along its bottom; finished ones with a thumbnail that shows its images), a details window on tap (the
// prompt and negative, or Forge Couple's background and regions, each with copy; settings; REMOVE / CLOSE), the last
// tapped card kept outlined, and the waiting ones put in order by holding and dragging.
(function () {
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const icon = (n, s = 18) => `<i data-lucide="${n}" width="${s}" height="${s}"></i>`;
    const list = type => (typeof queueState !== 'undefined' && queueState[type]) || [];
    let lastTapped = null; // the id of the card last opened
    // The running job: how far it is.
    let run = { frac: 0, image: 0, images: 0 };

    // ---- what a card shows ----
    const modelName = j => String(j.modelTitle || '').replace(/\s*\[[0-9a-f]+\]\s*$/i, '').replace(/\.(safetensors|ckpt|gguf|pt)$/i, '').replace(/_/g, ' ') || '—';
    const modeName = j => (j.mode === 'inp' ? ((j.inpSubMode || (j.payload && j.payload.mask ? 'inpaint' : 'img2img')) === 'img2img' ? 'IMG2IMG' : 'INPAINT') : (j.mode === 'xl' ? 'XL' : String(j.mode || '').toUpperCase()));
    const imagesOf = j => ((j.payload && j.payload.n_iter) || 1) * ((j.payload && j.payload.batch_size) || 1);
    function adPasses(p) {
        const ad = p.alwayson_scripts && (p.alwayson_scripts.ADetailer || p.alwayson_scripts.adetailer);
        if (!ad || !Array.isArray(ad.args) || ad.args[0] === false) return [];
        return ad.args.filter(a => a && typeof a === 'object' && a.ad_model && a.ad_model !== 'None' && a.ad_tab_enable !== false);
    }
    const coupleOf = p => { const fc = p.alwayson_scripts && p.alwayson_scripts['forge couple']; return fc && Array.isArray(fc.args) && fc.args[0] ? fc.args : null; };
    function chips(j) {
        const p = j.payload || {}, t = [], n = imagesOf(j);
        if (j.comboPart) t.push(['hi', `COMBOS ${j.comboPart[0]}/${j.comboPart[1]}`]);
        t.push(['', `${n} IMAGE${n === 1 ? '' : 'S'}`]);
        if (p.width && p.height) t.push(['', `${p.width}×${p.height}`]);
        if (p.steps) t.push(['', `${p.steps} STEPS`]);
        if (p.cfg_scale != null) t.push(['', `CFG ${p.cfg_scale}`]);
        if (p.enable_hr) t.push(['', `HIRES ×${p.hr_scale || 2}`]);
        const ad = adPasses(p).length;
        if (ad) t.push(['', `ADETAILER ${ad}`]);
        if (coupleOf(p)) t.push(['', 'COUPLE']);
        return t.map(([c, x]) => `<span class="qc-chip ${c}">${x}</span>`).join('');
    }
    const timeOf = s => { const d = s ? new Date(s) : null; return d && !isNaN(d) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''; };

    function card(j, type, i) {
        const running = type === 'ongoing' && i === 0 && typeof isQueueRunning !== 'undefined' && isQueueRunning;
        const status = running ? `<span class="qc-status">${run.images > 1 ? `IMAGE ${Math.max(1, run.image)} OF ${run.images}` : 'RUNNING'}</span>`
            : type === 'completed' ? `<span class="qc-status done">DONE ${esc(timeOf(j.finishedAt))}</span>` : '';
        const side = type === 'completed' || running ? '' : `<button type="button" class="qc-btn qc-x" data-act="remove" aria-label="Remove">${icon('x')}</button>`;
        const thumb = type === 'completed' ? `<div class="qc-thumb" data-act="images"${j.thumb ? ` style="background-image:url('${j.thumb}')"` : ''}></div>` : '';
        const grip = type === 'next' ? `<span class="qc-grip" aria-hidden="true">${icon('grip-vertical', 16)}</span>` : '';
        const next = type === 'next' && i === 0 ? '<span class="qc-next">NEXT</span>' : '';
        return `<div class="q-card qc${j.id && j.id === lastTapped ? ' sel' : ''}${type === 'completed' ? ' done' : ''}" data-type="${type}" data-i="${i}">${thumb}${grip}
            <div class="qc-body"><div class="qc-top">${next}<span class="qc-mode">${esc(modeName(j))}</span><span class="qc-model">${esc(modelName(j))}</span>${status}</div><div class="qc-chips">${chips(j)}</div></div>
            ${side ? `<div class="qc-side">${side}</div>` : ''}${running ? `<div class="qc-prog" style="width:${Math.round(run.frac * 1000) / 10}%"></div>` : ''}</div>`;
    }

    function renderList(type, data) {
        const box = $(`list-${type}`);
        if (!box) return;
        if (!data.length) box.innerHTML = '<div class="empty-note" style="padding:10px;">Empty</div>';
        else box.innerHTML = data.map((j, i) => card(j, type, i)).join('');
        box.querySelectorAll('.qc').forEach(el => wire(el));
        const n = $(`qCount-${type}`);
        if (n) n.textContent = data.length ? String(data.length) : '';
        if (window.lucide) lucide.createIcons();
    }

    function wire(el) {
        const type = el.dataset.type, i = +el.dataset.i;
        el.querySelector('[data-act="remove"]')?.addEventListener('click', e => { e.stopPropagation(); removeJob(type, i); });
        el.querySelector('[data-act="images"]')?.addEventListener('click', e => { e.stopPropagation(); images(type, i); });
        el.addEventListener('click', () => { if (el._dragged) { el._dragged = false; return; } open(type, i); });
        if (type === 'next') dragWire(el);
    }

    // ---- the details window ----
    function modal() {
        let m = $('queueJobModal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'queueJobModal';
        m.className = 'modal hidden';
        m.style.zIndex = '3000';
        m.onclick = e => { if (e.target === m) close(); };
        m.innerHTML = `<div class="modal-content qd-content"><div class="modal-header"><h3 id="qdTitle"></h3><button type="button" class="close-btn" onclick="QueueUI.close()">×</button></div>
            <div id="qdSub" class="qd-sub"></div><div id="qdBody" class="qd-body"></div>
            <div class="row qd-foot"><button type="button" id="qdRemove" class="btn-small btn-cancel qd-remove">REMOVE</button><button type="button" class="btn-small qd-close" onclick="QueueUI.close()">CLOSE</button></div></div>`;
        document.body.appendChild(m);
        return m;
    }
    const COPY = '<button type="button" class="card-btn card-btn-accent qd-copy" aria-label="Copy"><i data-lucide="copy" width="16" height="16"></i></button>';
    const colored = t => (window.PromptColors ? PromptColors.html(t, false) : esc(t));
    const textCard = (name, where, text, bg) => `<div class="fc-ana-reg qd-card${bg ? ' bg' : ''}"><div class="h"><b>${esc(name)}</b><span class="where">${esc(where || '')}</span>${COPY}</div><div class="t pc-text">${text && text.trim() ? colored(text) : '<span style="opacity:.5">(empty)</span>'}</div></div>`;
    const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`;
    function open(type, i) {
        const j = list(type)[i];
        if (!j) return;
        lastTapped = j.id || null;
        document.querySelectorAll('#view-que .qc.sel').forEach(c => c.classList.remove('sel'));
        document.querySelector(`#list-${type} .qc[data-i="${i}"]`)?.classList.add('sel');
        const m = modal(), p = j.payload || {};
        const running = type === 'ongoing' && i === 0 && typeof isQueueRunning !== 'undefined' && isQueueRunning;
        $('qdTitle').innerHTML = `<span class="qc-mode">${esc(modeName(j))}</span>${type === 'completed' ? 'Finished Job' : running ? 'Running Job' : 'Queued Job'}`;
        const where = type === 'next' ? (i === 0 ? 'next in the queue' : `${ordinal(i + 1)} in the queue`) : type === 'ongoing' ? (running ? 'running now' : 'waiting in this batch') : `finished ${timeOf(j.finishedAt)}`;
        $('qdSub').textContent = [modelName(j), j.timestamp ? `added ${timeOf(j.timestamp)}` : '', where].filter(Boolean).join(' · ');
        const texts = [];
        let h = '';
        const fc = coupleOf(p), info = j.fcInfo;
        if (fc && info && Array.isArray(info.regions)) {
            const names = (info.names || []).slice(info.bg ? 1 : 0), dir = fc[4] === 'Vertical' ? 'TOP TO BOTTOM' : fc[4] === 'Horizontal' ? 'LEFT TO RIGHT' : '';
            h += `<div class="qd-label">FORGE COUPLE · ${[String(fc[2] || 'Basic').toUpperCase(), `${info.regions.length} REGION${info.regions.length === 1 ? '' : 'S'}`, dir].filter(Boolean).join(', ')}</div>`;
            if (info.bg) { texts.push(info.bg); h += textCard('Background', 'whole image', info.bg, true); }
            info.regions.forEach((r, k) => { texts.push(r); h += textCard(names[k] || `Region ${k + 1}`, '', r); });
        } else {
            const pr = j.typedPrompt != null ? j.typedPrompt : p.prompt;
            texts.push(pr || '');
            h += textCard('Prompt', '', pr || '', true);
        }
        texts.push(p.negative_prompt || '');
        h += textCard('Negative', '', p.negative_prompt || '', true);
        const n = imagesOf(j), ad = adPasses(p);
        const kv = [['SIZE', p.width && p.height ? `${p.width}×${p.height}` : '—'], ['IMAGES', `${p.n_iter || 1} × ${p.batch_size || 1}`], ['STEPS', p.steps || '—'], ['CFG', p.cfg_scale != null ? p.cfg_scale : '—'],
            ['SAMPLER', p.sampler_name || '—'], ['SCHEDULE', p.scheduler || '—'], ['SEED', p.seed == null || +p.seed === -1 ? 'Random' : p.seed]];
        if (j.comboPart) kv.push(['COMBOS', `part ${j.comboPart[0]} of ${j.comboPart[1]}`]);
        if (p.enable_hr) kv.push(['HIRES', `×${p.hr_scale || 2}${p.hr_second_pass_steps ? ` · ${p.hr_second_pass_steps} steps` : ''}${p.denoising_strength != null ? ` · ${p.denoising_strength}` : ''}`]);
        if (ad.length) kv.push(['ADETAILER', ad.map(a => String(a.ad_model).replace(/\.(pt|safetensors)$/i, '')).join(', ')]);
        // A finished job's settings fold (folded each time); a waiting or running one's are shown.
        const fold = type === 'completed';
        h += fold ? `<button type="button" class="qd-label qd-fold folded">SETTINGS${icon('chevron-down', 16)}</button>` : '<div class="qd-label">SETTINGS</div>';
        h += `<div class="qd-grid${fold ? ' hidden' : ''}">${kv.map(([k, v]) => `<div><b>${k}</b>${esc(v)}</div>`).join('')}</div>`;
        $('qdBody').innerHTML = h;
        $('qdBody').querySelectorAll('.qd-copy').forEach((b, k) => { b.onclick = () => copy(texts[k]); });
        const fb = $('qdBody').querySelector('.qd-fold');
        if (fb) fb.onclick = () => { const shut = fb.classList.toggle('folded'); fb.nextElementSibling.classList.toggle('hidden', shut); };
        const rm = $('qdRemove');
        rm.classList.toggle('hidden', running);
        rm.onclick = () => { const at = list(type).findIndex(x => x === j); close(); if (at >= 0) removeJob(type, at); };
        if (m.classList.contains('hidden') && typeof lockBodyScroll === 'function') lockBodyScroll();
        m.classList.remove('hidden');
        m.querySelector('.modal-content').scrollTop = 0;
        if (window.lucide) lucide.createIcons();
        foldLong();
    }
    // Long texts folded to about four lines with SHOW MORE, as in Analyze.
    function foldLong() {
        $('qdBody').querySelectorAll('.qd-card').forEach(c => {
            const t = c.querySelector('.t');
            if (t.scrollHeight <= 74) return;
            t.classList.add('ana-collapsed');
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'ana-more-btn';
            b.textContent = 'Show more';
            b.onclick = () => { const f = !t.classList.contains('ana-collapsed'); t.classList.toggle('ana-collapsed', f); b.textContent = f ? 'Show more' : 'Show less'; };
            c.appendChild(b);
        });
    }
    async function copy(text) {
        try { await navigator.clipboard.writeText(text); } catch (e) {
            const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
        }
        if (typeof Toast !== 'undefined' && !(window.androidShowsOwnClipboardToast && androidShowsOwnClipboardToast())) Toast.show({ text: 'Copied', duration: 'short' });
    }
    function close() {
        const m = $('queueJobModal');
        if (!m || m.classList.contains('hidden')) return;
        m.classList.add('hidden');
        if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
    }

    // ---- holding and dragging a waiting job into place (Queue only) ----
    let drag = null;
    function dragWire(el) {
        let timer = 0, at = null;
        const cancelHold = () => { clearTimeout(timer); timer = 0; };
        el.addEventListener('pointerdown', e => {
            if (drag || e.button > 0 || e.target.closest('.qc-btn')) return;
            at = [e.clientX, e.clientY];
            cancelHold();
            timer = setTimeout(() => { timer = 0; start(el, at[1]); }, 450);
        });
        el.addEventListener('pointermove', e => { if (timer && at && Math.hypot(e.clientX - at[0], e.clientY - at[1]) > 10) cancelHold(); });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => el.addEventListener(t, () => { if (timer) cancelHold(); }));
        el.oncontextmenu = e => e.preventDefault();
    }
    function start(el, y) {
        const box = $('list-next'), r = el.getBoundingClientRect();
        const slot = document.createElement('div');
        slot.className = 'qc-slot';
        slot.style.height = `${r.height}px`;
        el.before(slot);
        const lift = el.cloneNode(true);
        lift.classList.add('qc-lift');
        lift.classList.remove('sel');
        lift.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;z-index:2000;pointer-events:none;`;
        document.body.appendChild(lift);
        el.classList.add('qc-hidden');
        drag = { el, slot, lift, from: +el.dataset.i, dy: y - r.top, y, box, scroll: 0 };
        el._dragged = true;
        document.body.classList.add('qc-dragging');
        if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) { }
        if (window.lucide) lucide.createIcons();
    }
    function move(y) {
        if (!drag) return;
        drag.y = y;
        drag.lift.style.top = `${y - drag.dy}px`;
        // The gap goes before the first card whose middle is below the finger.
        const cards = [...drag.box.querySelectorAll('.qc:not(.qc-hidden)')];
        const mid = y - drag.dy + drag.lift.offsetHeight / 2;
        const before = cards.find(c => { const b = c.getBoundingClientRect(); return mid < b.top + b.height / 2; });
        if (before) { if (drag.slot.nextElementSibling !== before) before.before(drag.slot); }
        else if (drag.box.lastElementChild !== drag.slot) drag.box.appendChild(drag.slot);
        // Near the screen's top or bottom: the page scrolls.
        const edge = 70, vh = window.innerHeight;
        drag.scroll = y < edge ? -Math.ceil((edge - y) / 6) : y > vh - edge ? Math.ceil((y - (vh - edge)) / 6) : 0;
        if (drag.scroll && !drag.raf) { const tick = () => { if (!drag || !drag.scroll) { if (drag) drag.raf = 0; return; } window.scrollBy(0, drag.scroll); move(drag.y); drag.raf = requestAnimationFrame(tick); }; drag.raf = requestAnimationFrame(tick); }
    }
    function end(cancel) {
        if (!drag) return;
        const d = drag;
        drag = null;
        if (d.raf) cancelAnimationFrame(d.raf);
        document.body.classList.remove('qc-dragging');
        // Where the gap is, counting the waiting cards before it.
        const to = [...d.box.children].filter(c => c === d.slot || (c.classList.contains('qc') && !c.classList.contains('qc-hidden'))).indexOf(d.slot);
        d.lift.remove();
        d.slot.remove();
        d.el.classList.remove('qc-hidden');
        setTimeout(() => { d.el._dragged = false; }, 0);
        if (cancel || to < 0 || to === d.from) { renderList('next', list('next')); return; }
        const q = list('next'), [job] = q.splice(d.from, 1);
        q.splice(to, 0, job);
        if (typeof saveQueueState === 'function') saveQueueState();
        renderList('next', q);
    }
    document.addEventListener('pointermove', e => { if (drag && e.pointerType !== 'touch') move(e.clientY); }, { passive: true });
    document.addEventListener('pointerup', e => { if (drag && e.pointerType !== 'touch') end(false); });
    // A finger: touch events, which keep coming however the card moves; the page doesn't scroll while it drags.
    document.addEventListener('touchmove', e => { if (drag) { e.preventDefault(); move(e.touches[0].clientY); } }, { passive: false });
    document.addEventListener('touchend', () => { if (drag) end(false); });
    document.addEventListener('touchcancel', () => { if (drag) end(true); });

    // ---- the running job's progress (engine.js: its steps done and total, with ADetailer's, and which batch) ----
    function jobStart() { run = { frac: 0, image: 0, images: 0 }; }
    function progress(done, total, batch, job) {
        if (!job) return;
        const per = (job.payload && job.payload.batch_size) || 1;
        run.frac = Math.min(1, Math.max(0, done) / Math.max(1, total));
        run.images = imagesOf(job);
        run.image = (batch - 1) * per + 1;
        const c = document.querySelector('#list-ongoing .qc[data-i="0"]');
        if (!c) return;
        const bar = c.querySelector('.qc-prog');
        if (bar) bar.style.width = `${Math.round(run.frac * 1000) / 10}%`;
        const s = c.querySelector('.qc-status');
        if (s && run.images > 1) s.textContent = `IMAGE ${Math.max(1, run.image)} OF ${run.images}`;
    }
    // A job's image arriving: its History id is kept (once saved) for the thumbnail's viewer; the first, small, is the thumbnail.
    // The batch grid (made last) is kept apart, shown first and made the thumbnail.
    function thumb(job, b64, saved, grid) {
        if (!job) return;
        if (grid) {
            if (saved) saved.then(id => { if (id != null) { job.gridId = id; job.thumbOf = id; if (typeof saveQueueState === 'function') saveQueueState(); } });
            if (b64) small(job, b64);
            return;
        }
        const make = !job.thumb && !!b64 && job.thumbOf === undefined;
        if (make) job.thumbOf = null;
        if (saved) saved.then(id => { if (id != null) { (job.imgIds = job.imgIds || []).push(id); if (make) job.thumbOf = id; if (typeof saveQueueState === 'function') saveQueueState(); } });
        if (!make) return;
        job.thumb = '';
        small(job, b64);
    }
    // The thumbnail, made from an image (160px on its long side).
    function small(job, src) {
        const img = new Image();
        img.onload = () => {
            const s = 160 / Math.max(img.width, img.height), c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            try { job.thumb = c.toDataURL('image/jpeg', 0.7); } catch (e) { }
            if (typeof saveQueueState === 'function') saveQueueState();
            if (list('completed').includes(job)) renderList('completed', list('completed'));
        };
        img.src = src;
    }
    // A job's images in viewing order: the grid, then the rest as they were made.
    const ordered = j => [...(j.gridId != null ? [j.gridId] : []), ...[...(j.imgIds || [])].sort((a, b) => a - b)];
    // History's light copies by id (no full images read; kept in memory after History's first read), or null.
    async function lite() {
        const all = window.GalleryLite ? await GalleryLite.list() : null;
        return all ? new Map(all.map(it => [it.id, it])) : null;
    }
    // Finished jobs whose thumbnail image is gone: the next one left's (none left: the last is kept). thumbOf is the image it was made
    // from; a job without one (kept before it was) is checked once against its first image left.
    let checking = false;
    async function followThumbs() {
        if (checking) return;
        checking = true;
        let changed = false;
        try {
            const have = await lite();
            if (!have) return;
            for (const j of list('completed').slice()) {
                const ids = ordered(j);
                if (!ids.length || !j.thumb) continue;
                if (j.thumbOf != null && ids.includes(j.thumbOf) && have.has(j.thumbOf)) continue;
                const first = have.get(ids.find(id => have.has(id)));
                if (j.gridId != null && !have.has(j.gridId)) j.gridId = null;
                if (first && first.id === j.thumbOf) continue;
                j.thumbOf = first ? first.id : null;
                if (first) small(j, first.thumbnail || await GalleryLite.load(first.id));
                else j.imgIds = [];
                changed = true;
            }
        } finally { checking = false; }
        if (changed) {
            if (typeof saveQueueState === 'function') saveQueueState();
            renderList('completed', list('completed'));
        }
    }
    // When the Queue page opens, and when the viewer over it closes.
    (function () {
        const que = $('view-que'), fs = $('fullScreenModal');
        const shown = el => el && !el.classList.contains('hidden');
        let queWas = shown(que), fsWas = shown(fs);
        const watch = new MutationObserver(() => {
            const q = shown(que), f = shown(fs);
            if ((q && !queWas) || (q && fsWas && !f)) followThumbs();
            queWas = q; fsWas = f;
        });
        [que, fs].forEach(el => el && watch.observe(el, { attributes: true, attributeFilter: ['class'] }));
    })();

    // The thumbnail: the job's images still in History, full screen, from the first (the viewer loops through only them;
    // as History's own viewer, each shows its small copy until its full image is read).
    // A job finished before ids were kept opens its details instead.
    async function images(type, i) {
        const j = list(type)[i];
        if (!j) return;
        if (!j.imgIds) { open(type, i); return; }
        const have = await lite();
        if (!have) return;
        const items = ordered(j).map(id => have.get(id)).filter(Boolean);
        if (j.gridId != null && !have.has(j.gridId)) j.gridId = null;
        j.imgIds = items.map(x => x.id).filter(id => id !== j.gridId);
        if (typeof saveQueueState === 'function') saveQueueState();
        if (!items.length) { if (typeof Toast !== 'undefined' && Toast) Toast.show({ text: 'These images were deleted', duration: 'short' }); return; }
        window.openFullscreen(items, 0);
    }

    window.QueueUI = { renderList, open, close, jobStart, progress, thumb, images, followThumbs, dragging: () => !!drag, cancelDrag: () => end(true), _drag: { start, move, end } };
})();
