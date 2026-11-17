// Resolver docs: the page shell and the interactive parts. Each page holds only <main class="content">; this builds the
// top bar, sidebar, table of contents, search and prev / next around it, then wires the widgets (data-widget="...").
(function () {
    const S = window.SITE;
    const page = document.body.dataset.page || 'index';
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const store = {
        get(k, d) { try { const v = localStorage.getItem('rdocs-' + k); return v === null ? d : v; } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem('rdocs-' + k, v); } catch (e) { } },
    };
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const icon = (n, cls = '') => `<i data-lucide="${n}"${cls ? ` class="${cls}"` : ''}></i>`;
    const href = p => (p === 'index' ? 'index.html' : p + '.html');
    const drawIcons = () => { if (window.lucide) lucide.createIcons({ attrs: { 'stroke-width': 2 } }); };

    // ---------- accent (one per model, as the app) ----------
    const ACCENTS = [['xl', 'SDXL', '#ff9800'], ['anima', 'Anima', '#00c853'], ['qwen', 'Qwen', '#ff007f'], ['flux', 'Flux', '#00e5ff'], ['krea', 'Krea', '#b026ff']];
    function setAccent(a) {
        document.documentElement.dataset.accent = a;
        store.set('accent', a);
        $$('.accent-pick button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.a === a)));
        document.dispatchEvent(new CustomEvent('accent', { detail: a }));
    }
    window.DocsAccent = setAccent;

    // ---------- theme ----------
    const THEMES = ['system', 'dark', 'light'];
    function setTheme(t) {
        if (t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
        store.set('theme', t);
        const b = $('#themeBtn');
        if (b) { b.innerHTML = icon(t === 'light' ? 'sun' : t === 'dark' ? 'moon' : 'sun-moon'); b.title = 'Theme: ' + t; b.setAttribute('aria-label', 'Theme: ' + t + ' (tap to change)'); drawIcons(); }
    }

    // ---------- shell ----------
    const main = $('main.content');
    const pageInfo = S.pages[page] || { title: document.title };
    const nav = S.groups.map(g => `<div class="nav-group"><h4>${esc(g.name)}</h4>${g.pages.map(p => {
        const P = S.pages[p];
        return P.ready
            ? `<a href="${href(p)}"${p === page ? ' aria-current="page"' : ''}>${icon(P.icon)}<span>${esc(P.title)}</span></a>`
            : `<a class="is-soon" href="${href(p)}" aria-disabled="true" tabindex="-1" onclick="return false">${icon(P.icon)}<span>${esc(P.title)}</span><span class="soon">SOON</span></a>`;
    }).join('')}</div>`).join('');

    const top = document.createElement('header');
    top.className = 'topbar';
    top.innerHTML = `
        <button class="icon-btn menu-btn" id="menuBtn" aria-label="Menu" aria-expanded="false">${icon('menu')}</button>
        <a class="brand" href="index.html"><img src="assets/img/logo.webp" alt=""><b>RESOLVER</b><small>Docs · v${esc(S.version)}</small></a>
        <div class="spacer"></div>
        <button class="search-btn" id="searchBtn" aria-label="Search">${icon('search')}<span class="lbl">Search the docs</span><kbd>Ctrl K</kbd></button>
        <div class="accent-pick" role="group" aria-label="Accent color (as the app's model tabs)">${ACCENTS.map(([a, n, c]) => `<button data-a="${a}" style="--c:${c}" title="${n} accent" aria-label="${n} accent" aria-pressed="false"></button>`).join('')}</div>
        <button class="icon-btn" id="themeBtn" aria-label="Theme"></button>`;

    const layout = document.createElement('div');
    layout.className = 'layout';
    layout.innerHTML = `<nav class="sidebar" id="sidebar" aria-label="Pages">${nav}</nav><div class="main"><div class="content-wrap"></div><aside class="toc" aria-label="On this page"></aside></div>`;
    main.parentNode.insertBefore(top, main);
    main.parentNode.insertBefore(layout, main);
    $('.content-wrap', layout).replaceWith(main);
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    document.body.appendChild(scrim);

    // Prev / next among ready pages, and the footer.
    const order = S.groups.flatMap(g => g.pages).filter(p => S.pages[p].ready);
    const i = order.indexOf(page);
    const prev = order[i - 1], next = order[i + 1];
    const pager = document.createElement('nav');
    pager.className = 'pager';
    pager.innerHTML = (prev ? `<a class="prev" href="${href(prev)}"><small>← Previous</small><b>${esc(S.pages[prev].title)}</b></a>` : '') +
        (next ? `<a class="next" href="${href(next)}"><small>Next →</small><b>${esc(S.pages[next].title)}</b></a>` : '');
    main.appendChild(pager);
    const foot = document.createElement('footer');
    foot.className = 'site-foot';
    foot.innerHTML = `<span>Resolver v${esc(S.version)} documentation</span><span>GPLv3 License</span><a href="https://github.com/bojrodev/Resolver-Stable-Diffusion-Client-for-android" target="_blank" rel="noopener">GitHub</a><a href="https://github.com/bojrodev/Resolver-Stable-Diffusion-Client-for-android/releases" target="_blank" rel="noopener">Download</a>`;
    main.appendChild(foot);

    // Mobile menu.
    const menuBtn = $('#menuBtn');
    const closeNav = () => { document.body.classList.remove('nav-open'); menuBtn.setAttribute('aria-expanded', 'false'); };
    menuBtn.onclick = () => { const o = document.body.classList.toggle('nav-open'); menuBtn.setAttribute('aria-expanded', String(o)); };
    scrim.onclick = closeNav;
    $$('#sidebar a').forEach(a => a.addEventListener('click', closeNav));

    $$('.accent-pick button').forEach(b => b.onclick = () => setAccent(b.dataset.a));
    $('#themeBtn').onclick = () => setTheme(THEMES[(THEMES.indexOf(store.get('theme', 'system')) + 1) % THEMES.length]);
    setTheme(store.get('theme', 'system'));
    setAccent(store.get('accent', 'xl'));

    // ---------- headings: ids, anchors, table of contents ----------
    const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const heads = $$('h2, h3', main).filter(h => !h.closest('.no-toc'));
    heads.forEach(h => {
        if (!h.id) h.id = slug(h.textContent);
        const a = document.createElement('a');
        a.className = 'anchor'; a.href = '#' + h.id; a.textContent = '#'; a.setAttribute('aria-label', 'Link to this section');
        h.appendChild(a);
    });
    const toc = $('.toc');
    if (heads.length > 1) {
        toc.innerHTML = '<h4>On this page</h4>' + heads.map(h => `<a href="#${h.id}" class="${h.tagName === 'H3' ? 'sub' : ''}" data-id="${h.id}">${esc(h.firstChild.textContent.trim())}</a>`).join('');
        const links = $$('a', toc);
        const spy = () => {
            let cur = heads[0];
            // The section whose heading has reached the upper third of the screen.
            const line = Math.max(200, innerHeight * 0.33);
            for (const h of heads) if (h.getBoundingClientRect().top < line) cur = h;
            links.forEach(l => l.classList.toggle('on', l.dataset.id === cur.id));
        };
        addEventListener('scroll', spy, { passive: true });
        spy();
    } else toc.remove();
    document.title = (pageInfo.title === 'Welcome' ? 'Resolver Docs' : pageInfo.title + ' · Resolver Docs');

    // ---------- code blocks: copy ----------
    $$('.code').forEach(box => {
        const pre = $('pre', box);
        const b = document.createElement('button');
        b.className = 'copy'; b.type = 'button'; b.textContent = 'Copy';
        b.onclick = async () => {
            const text = pre.innerText.replace(/\n$/, '');
            try { await navigator.clipboard.writeText(text); } catch (e) {
                const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e2) { } t.remove();
            }
            b.textContent = 'Copied'; b.classList.add('done');
            setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('done'); }, 1400);
        };
        box.appendChild(b);
    });

    // ---------- tabs ----------
    $$('.tabs').forEach((tabs, n) => {
        const btns = $$('.tablist button', tabs), panels = $$(':scope > .tabpanel', tabs);
        const key = tabs.dataset.remember;
        const show = k => {
            btns.forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === k)));
            panels.forEach(p => p.hidden = p.dataset.tab !== k);
            if (key) store.set('tab-' + key, k);
        };
        btns.forEach(b => { b.setAttribute('role', 'tab'); b.onclick = () => show(b.dataset.tab); });
        $('.tablist', tabs).setAttribute('role', 'tablist');
        const saved = key && store.get('tab-' + key, '');
        show(btns.some(b => b.dataset.tab === saved) ? saved : btns[0].dataset.tab);
    });

    // ---------- lightbox ----------
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = '<img alt="">';
    document.body.appendChild(lb);
    const closeLb = () => lb.classList.remove('open');
    lb.onclick = closeLb;
    document.addEventListener('click', e => {
        const img = e.target.closest('img.zoomable');
        if (!img) return;
        $('img', lb).src = img.currentSrc || img.src; $('img', lb).alt = img.alt;
        lb.classList.add('open');
    });

    // ---------- checklists (kept in this browser) ----------
    // Progress bars and counts anywhere on the page follow a list by its key: data-progress-for / data-count-for, and
    // data-reset-for buttons clear it.
    function wireChecklist(list) {
        const key = list.dataset.checklist, items = $$('.check', list);
        const saved = new Set(store.get('check-' + key, '').split(',').filter(Boolean));
        const paint = () => {
            const on = items.filter(it => $('input', it).checked).length;
            $$(`[data-progress-for="${key}"] i`).forEach(bar => bar.style.width = (on / items.length * 100) + '%');
            $$(`[data-count-for="${key}"]`).forEach(c => c.textContent = on === items.length ? 'All done. You’re set up!' : `${on} of ${items.length} done`);
        };
        items.forEach(it => {
            const box = $('input', it);
            box.checked = saved.has(it.dataset.id);
            it.classList.toggle('on', box.checked);
            box.onchange = () => {
                it.classList.toggle('on', box.checked);
                if (box.checked) saved.add(it.dataset.id); else saved.delete(it.dataset.id);
                store.set('check-' + key, [...saved].join(','));
                const step = document.getElementById(it.dataset.step || '');
                if (step) step.classList.toggle('done', box.checked);
                paint();
            };
            const step = document.getElementById(it.dataset.step || '');
            if (step) step.classList.toggle('done', box.checked);
        });
        $$(`[data-reset-for="${key}"]`).forEach(b => b.onclick = () => { items.forEach(it => { $('input', it).checked = false; $('input', it).onchange(); }); });
        paint();
    }
    $$('[data-checklist]').forEach(wireChecklist);

    // ---------- search ----------
    const dlg = document.createElement('div');
    dlg.className = 'search-dlg';
    dlg.innerHTML = `<div class="search-box" role="dialog" aria-label="Search the docs"><div class="search-in">${icon('search')}<input type="search" placeholder="Search features, settings, buttons…" aria-label="Search" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div><div class="search-res" role="listbox"></div></div>`;
    document.body.appendChild(dlg);
    const sIn = $('input', dlg), sRes = $('.search-res', dlg);
    const entries = S.index.filter(e => S.pages[e.p] && S.pages[e.p].ready);
    let sel = 0;
    const norm = s => s.toLowerCase();
    function search(q) {
        const words = norm(q).split(/\s+/).filter(Boolean);
        if (!words.length) return entries.slice(0, 8);
        return entries.map(e => {
            const t = norm(e.t), k = norm(e.k + ' ' + S.pages[e.p].title);
            let score = 0;
            for (const w of words) {
                if (t.includes(w)) score += t.startsWith(w) ? 6 : 4;
                else if (k.includes(w)) score += 2;
                else return null;
            }
            return { e, score };
        }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 12).map(x => x.e);
    }
    const mark = (text, q) => {
        let h = esc(text);
        norm(q).split(/\s+/).filter(w => w.length > 1).forEach(w => { h = h.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); });
        return h;
    };
    function paintSearch() {
        const q = sIn.value, list = search(q);
        sel = Math.min(sel, Math.max(0, list.length - 1));
        sRes.innerHTML = list.length ? list.map((e, n) => `<a href="${href(e.p)}${e.h ? '#' + e.h : ''}" class="${n === sel ? 'sel' : ''}" role="option"><span class="where">${esc(S.pages[e.p].title)}</span><br>${mark(e.t, q)}</a>`).join('')
            : `<div class="none">Nothing found for “${esc(q)}”.<br><small>Try another word, or look in <a href="help.html">Troubleshooting &amp; FAQ</a>.</small></div>`;
    }
    const openSearch = () => { dlg.classList.add('open'); sIn.value = ''; sel = 0; paintSearch(); setTimeout(() => sIn.focus(), 10); };
    const closeSearch = () => dlg.classList.remove('open');
    $('#searchBtn').onclick = openSearch;
    dlg.addEventListener('click', e => { if (e.target === dlg) closeSearch(); });
    sRes.addEventListener('click', e => { if (e.target.closest('a')) closeSearch(); });
    sIn.addEventListener('input', () => { sel = 0; paintSearch(); });
    sIn.addEventListener('keydown', e => {
        const items = $$('a', sRes);
        if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); paintSearch(); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); paintSearch(); e.preventDefault(); }
        else if (e.key === 'Enter' && items[sel]) { location.href = items[sel].href; closeSearch(); }
    });
    document.addEventListener('keydown', e => {
        if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) { e.preventDefault(); openSearch(); }
        else if (e.key === 'Escape') { closeSearch(); closeLb(); closeNav(); }
    });

    // ---------- widgets ----------
    const W = {};

    // Home: the app tour. The dock switches the phone between tabs; on Generate, the model chips switch model (and accent).
    W.tour = el => {
        const TABS = {
            gen: { icon: 'zap', name: 'Generate', shot: 'gen-sdxl', text: 'Write a prompt, pick a model and settings, and generate. Five model tabs (SDXL, Anima, Qwen, Flux, Krea) each keep their own checkpoint, prompts and settings, and each has its own color.', link: 'generate' },
            inp: { icon: 'brush', name: 'Inpaint', shot: 'tab-inpaint', text: 'Load a picture, then repaint part of it (Inpaint), redraw all of it (img2img) or enlarge it (Upscale). Crop & Edit can also extend the picture (outpainting).', link: 'inpaint' },
            que: { icon: 'layers', name: 'Queue', shot: 'tab-queue', text: 'Line up many jobs and run them in one go. Each card shows its mode, model and settings; the running one shows its progress.', link: 'queue' },
            gal: { icon: 'image', name: 'History', shot: 'tab-history', text: 'Every image you make, with search, favourites, date sections, multi-select, sharing and comparing.', link: 'history' },
            ana: { icon: 'scan-line', name: 'Analyze', shot: 'tab-analyze', text: "Open any image to read how it was made (prompt, seed, model, LoRAs) and send those settings straight back to Generate.", link: 'analyze' },
            comfy: { icon: 'workflow', name: 'ComfyUI', shot: 'tab-comfy', text: 'Run your own ComfyUI workflows. Resolver builds controls for the workflow’s inputs. Hidden until you switch it on in Config.', link: 'comfyui' },
            cfg: { icon: 'settings', name: 'Config', shot: 'tab-config', text: 'Every setting, in 13 sections. It starts in Simple mode (Connection, theme, dock, visible tabs, System Settings); the Mode selector at the top switches on Advanced Control for the rest. Search with the icon beside it.', link: 'config' },
        };
        const MODELS = [['xl', 'SDXL', '#ff9800', 'gen-sdxl'], ['anima', 'ANIMA', '#00c853', 'gen-anima'], ['qwen', 'QWEN', '#ff007f', 'gen-qwen'], ['flux', 'FLUX', '#00e5ff', 'gen-flux'], ['krea', 'KREA', '#b026ff', 'gen-krea']];
        const img = $('.screen img', el), dock = $('.tour-dock', el), info = $('.tour-info', el);
        dock.innerHTML = Object.entries(TABS).map(([k, t]) => `<button data-k="${k}" aria-label="${t.name}" title="${t.name}" aria-pressed="false">${icon(t.icon)}</button>`).join('');
        let cur = 'gen', model = store.get('accent', 'xl');
        const swap = src => {
            if (img.getAttribute('src') === src) return;
            img.classList.add('out');
            const pre = new Image(); pre.onload = () => { img.src = src; img.classList.remove('out'); }; pre.src = src;
        };
        function show(k) {
            cur = k;
            const t = TABS[k];
            $$('button', dock).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
            const shot = k === 'gen' ? (MODELS.find(m => m[0] === model) || MODELS[0])[3] : t.shot;
            swap(`assets/img/shots/${shot}.webp`);
            img.alt = `Resolver's ${t.name} tab`;
            const ready = S.pages[t.link] && S.pages[t.link].ready;
            info.innerHTML = `<h3><span class="ic">${icon(t.icon)}</span>${t.name}</h3><p>${t.text}</p>` +
                (k === 'gen' ? `<p class="muted" style="font-size:14px;margin-bottom:6px">Try the model tabs:</p><div class="tour-models">${MODELS.map(([a, n, c]) => `<button data-a="${a}" style="--c:${c}" aria-pressed="${a === model}">${n}</button>`).join('')}</div>` : '') +
                `<p>${ready ? `<a href="${href(t.link)}">Read about ${t.name} →</a>` : `<span class="chip">Full guide coming soon</span>`}</p>`;
            $$('.tour-models button', info).forEach(b => b.onclick = () => { model = b.dataset.a; setAccent(model); show('gen'); });
            drawIcons();
        }
        $$('button', dock).forEach(b => b.onclick = () => show(b.dataset.k));
        document.addEventListener('accent', e => { if (e.detail !== model) { model = e.detail; if (cur === 'gen') show('gen'); } });
        show('gen');
    };

    // Getting started: builds the app's connection values from the PC's IP, and checks it looks right.
    W.connect = el => {
        const ip = $('#hIp', el), port = $('#hPort', el), help = $('#hHelp', el), out = $('#hOut', el);
        ip.value = store.get('ip', ''); port.value = store.get('port', '7860');
        function paint() {
            let v = ip.value.trim().replace(/\/+$/, '');
            const p = port.value.trim() || '7860';
            store.set('ip', ip.value.trim()); store.set('port', p);
            if (!v) { help.className = 'help'; help.textContent = 'Type the IPv4 address you found above, e.g. 192.168.1.20'; out.innerHTML = '<span class="muted">Your values will appear here.</span>'; return; }
            const bare = v.replace(/^https?:\/\//i, '').replace(/:\d+$/, '');
            const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);
            let msg = '', cls = 'good';
            if (!m || m.slice(1).some(n => +n > 255)) { cls = 'bad'; msg = 'That doesn’t look like an IPv4 address (four numbers 0–255 with dots, like 192.168.1.20).'; }
            else if (bare.startsWith('127.') || bare === '0.0.0.0') { cls = 'bad'; msg = 'That address only means “this computer” on the PC itself. Use the PC’s Wi-Fi / Ethernet IPv4 address instead.'; }
            else if (/^(192\.168|10)\./.test(bare) || /^172\.(1[6-9]|2\d|3[01])\./.test(bare)) msg = 'Looks right: a home-network address.';
            else { cls = ''; msg = 'This isn’t a usual home-network address. If your phone is away from home, use Remote mode (below) instead.'; }
            help.className = 'help ' + cls; help.textContent = msg;
            if (cls === 'bad') { out.innerHTML = '<span class="muted">Fix the address above first.</span>'; return; }
            const url = 'http://' + bare;
            out.innerHTML = `In the app, open <span class="ui">Config</span> → <span class="ui">Connection</span> and enter:<br>
                <span class="muted">Connection mode:</span> <span class="ui">LOCAL</span><br>
                <span class="muted">Local IP address:</span> <code>${esc(url)}</code><br>
                <span class="muted">WebUI port:</span> <code>${esc(p)}</code><br><br>
                Before that, check from the phone’s browser that Forge answers: <a href="${esc(url)}:${esc(p)}/docs" target="_blank" rel="noopener"><code>${esc(url)}:${esc(p)}/docs</code></a> should open Forge’s API page.`;
        }
        ip.addEventListener('input', paint); port.addEventListener('input', paint);
        paint();
    };

    // Getting started: the Forge launch flags for the chosen system.
    W.flags = el => {
        const out = $('pre', el), seg = $$('.seg button', el);
        const SNIPS = {
            win: '<span class="tok-c">:: webui-user.bat (in your Forge folder)</span>\n<span class="tok-k">set</span> COMMANDLINE_ARGS=<span class="tok-s">--listen --api --cors-allow-origins *</span>',
            linux: '<span class="tok-c"># webui-user.sh (in your Forge folder)</span>\n<span class="tok-k">export</span> COMMANDLINE_ARGS=<span class="tok-s">"--listen --api --cors-allow-origins *"</span>',
            pinokio: '<span class="tok-c"># Pinokio / one-click installs: add to the launch arguments</span>\n<span class="tok-s">--listen --api --cors-allow-origins *</span>',
        };
        const show = k => { seg.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.os === k))); out.innerHTML = SNIPS[k]; store.set('os', k); };
        seg.forEach(b => b.onclick = () => show(b.dataset.os));
        show(store.get('os', 'win'));
    };

    // A screenshot with numbered markers: tapping a marker (or its row) shows what that part does. Markers come from the
    // list's items: data-x / data-y in percent of the screenshot.
    W.hotspots = el => {
        const screen = $('.screen', el), items = $$('.hs-list li', el);
        items.forEach((li, n) => {
            const m = document.createElement('button');
            m.className = 'hs-dot'; m.type = 'button'; m.textContent = n + 1;
            m.style.left = li.dataset.x + '%'; m.style.top = li.dataset.y + '%';
            m.setAttribute('aria-label', `${n + 1}: ${$('b', li).textContent}`);
            screen.appendChild(m);
            li.dataset.n = n + 1;
            const pick = scroll => {
                items.forEach(x => x.classList.toggle('on', x === li));
                $$('.hs-dot', screen).forEach((d, k) => d.classList.toggle('on', k === n));
                if (scroll && matchMedia('(min-width: 761px)').matches) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            };
            m.onclick = () => pick(true);
            li.onclick = () => pick(false);
            li.tabIndex = 0;
            li.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(false); } };
        });
        if (items[0]) items[0].click();
    };

    // Image size: the app's presets (setRes), flip, and the phone-screen size (computeWallpaperRes, ui.js).
    W.aspect = el => {
        const P = { '1MP': { '1:1': [1024, 1024], '3:2': [1248, 832], '4:3': [1152, 864], '16:9': [1280, 720] }, '2MP': { '1:1': [1440, 1440], '3:2': [1776, 1184], '4:3': [1536, 1152], '16:9': [2048, 1152] } };
        let mp = '1MP', ratio = '1:1', flip = false, wall = false;
        const box = $('.ar-box', el), dims = $('.ar-dims', el), note = $('.ar-note', el);
        const wallpaper = () => {
            const r = screen.width / screen.height, L = Math.max(r, 1 / r), area = 1.06 * 1024 * 1024;
            const w = Math.max(16, Math.round(Math.sqrt(area * L) / 16) * 16), h = Math.max(16, Math.round(Math.sqrt(area / L) / 16) * 16);
            return [h, w];
        };
        function paint() {
            let [w, h] = wall ? wallpaper() : P[mp][ratio];
            if (flip) [w, h] = [h, w];
            $$('[data-mp]', el).forEach(b => b.setAttribute('aria-pressed', String(!wall && b.dataset.mp === mp)));
            $$('[data-r]', el).forEach(b => { b.setAttribute('aria-pressed', String(!wall && b.dataset.r === ratio)); b.textContent = flip && b.dataset.r !== '1:1' ? b.dataset.r.split(':').reverse().join(':') : b.dataset.r; });
            $('[data-wall]', el).setAttribute('aria-pressed', String(wall));
            $('[data-flip]', el).setAttribute('aria-pressed', String(flip));
            const max = 190, s = max / Math.max(w, h);
            box.style.width = Math.round(w * s) + 'px'; box.style.height = Math.round(h * s) + 'px';
            box.textContent = `${w} × ${h}`;
            dims.innerHTML = `Width <b>${w}</b> · Height <b>${h}</b> · <b>${(w * h / 1e6).toFixed(2)}</b> megapixels`;
            note.textContent = wall ? `Your screen’s shape (${screen.width}×${screen.height}), about 1 megapixel, in multiples of 16. In the app it’s the phone’s screen.` : (mp === '2MP' ? 'About twice the pixels: more detail, more time and memory.' : 'About one megapixel: the size SDXL-family models are trained at.');
        }
        $$('[data-mp]', el).forEach(b => b.onclick = () => { mp = b.dataset.mp; wall = false; paint(); });
        $$('[data-r]', el).forEach(b => b.onclick = () => { ratio = b.dataset.r; wall = false; paint(); });
        $('[data-wall]', el).onclick = () => { wall = true; flip = false; paint(); };
        $('[data-flip]', el).onclick = () => { flip = !flip; paint(); };
        paint();
    };

    // The LoRA tag the app puts in the prompt, as its colors show it (promptcolors.js: pc-lo).
    W.loratag = el => {
        const name = $('select', el), w = $('input[type=range]', el), out = $('.lt-out', el), val = $('.lt-val', el), trig = $('input[type=checkbox]', el), hint = $('.lt-hint', el);
        const TRIG = { detailTweaker_xl: '', watercolor_style: 'watercolor, soft washes', aria_character_v2: 'aria, silver hair, red eyes', cinematic_lighting: 'cinematic lighting' };
        function paint() {
            const v = (+w.value).toFixed(2).replace(/0$/, '').replace(/\.$/, '');
            val.textContent = v;
            const t = trig.checked && TRIG[name.value] ? `<span class="pc-plain">, ${esc(TRIG[name.value])}</span>` : '';
            out.innerHTML = `<span class="pc-plain">1girl, forest, </span><span class="pc-lo">&lt;lora:${esc(name.value)}:${v}&gt;</span>${t}`;
            const n = +w.value;
            hint.textContent = n === 0 ? 'Weight 0: the LoRA does nothing.' : n < 0.5 ? 'A light touch: only a hint of the LoRA.' : n <= 1 ? 'The usual range: the LoRA’s full effect at 1.' : 'Stronger than trained: can overdo it or distort the picture.';
        }
        [name, w, trig].forEach(x => x.addEventListener('input', paint)); trig.addEventListener('change', paint);
        paint();
    };

    // Forge Couple, BASIC: how the picture is split for 2–4 regions side by side or stacked, plus the background.
    W.couple = el => {
        let dir = 'h', n = 2;
        const COLORS = ['#40c4ff', '#ff4f8b', '#7cff6b', '#ffb300'];
        const NAMES = { h: ['Left', 'Right', 'Third', 'Fourth'], v: ['Top', 'Bottom', 'Third', 'Fourth'] };
        const area = $('.fc-area', el), legend = $('.fc-legend', el), bw = $('input[type=range]', el), bwv = $('.fc-bwv', el);
        function paint() {
            $$('[data-dir]', el).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dir === dir)));
            $$('[data-n]', el).forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.n === n)));
            area.style.flexDirection = dir === 'h' ? 'row' : 'column';
            const names = NAMES[dir].slice(0, n).map((x, i) => i >= 2 ? `Region ${i + 1}` : x);
            area.innerHTML = names.map((x, i) => `<div style="--c:${COLORS[i]}"><span>${x}</span></div>`).join('');
            area.style.setProperty('--bg', (+bw.value / 1.5 * .55).toFixed(2));
            bwv.textContent = (+bw.value).toFixed(2);
            legend.innerHTML = `<li><i style="background:linear-gradient(135deg,#888,#444)"></i><b>Background</b> (main prompt box): the whole picture, weight ${(+bw.value).toFixed(2)}</li>` +
                names.map((x, i) => `<li><i style="background:${COLORS[i]}"></i><b>${x}</b>: only its ${dir === 'h' ? 'column' : 'row'}</li>`).join('');
        }
        $$('[data-dir]', el).forEach(b => b.onclick = () => { dir = b.dataset.dir; paint(); });
        $$('[data-n]', el).forEach(b => b.onclick = () => { n = +b.dataset.n; paint(); });
        bw.addEventListener('input', paint);
        paint();
    };

    // A model switcher: the screenshot and what's different, per model tab.
    W.models = el => {
        const btns = $$('[data-model]', el), img = $('.screen img', el), panels = $$('[data-panel]', el);
        const show = m => {
            btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.model === m)));
            panels.forEach(p => p.hidden = p.dataset.panel !== m);
            img.src = `assets/img/shots/gen-${m === 'xl' ? 'sdxl' : m}.webp`;
            setAccent(m);
        };
        btns.forEach(b => b.onclick = () => show(b.dataset.model));
        show(store.get('accent', 'xl'));
    };

    // Colored text as the app's prompt boxes show it (promptpaint.js is the app's own code). Any element with
    // data-pc="text" is filled with it; the playground colors what you type.
    const paintPc = t => (window.PromptPaint ? PromptPaint.html(t, false) : esc(t));
    $$('[data-pc]').forEach(el => { el.innerHTML = paintPc(el.dataset.pc); el.classList.add('pc-text'); });

    // Config's two modes (the app's advcontrol.js). Simple, the default, shows Connection, System Settings and, in
    // Interface, Dock style, Light mode and Visible tabs; everything else shows with Advanced Control on.
    const CFG_SECTIONS = { 'connection': 'connection', 'interface': 'interface', 'prompts': 'prompts', 'magic prompt': 'magic',
        'generation': 'generation', 'live preview': 'livepreview', 'history & results': 'history', 'inpaint & analyze': 'inpana',
        'models': 'models', 'extensions': 'extensions', 'diagnostics': 'diag', 'experimental': 'experimental', 'system settings': 'sys' };
    const SIMPLE_IFACE = ['dock style', 'light mode', 'visible tabs'];
    const cfgAdvanced = (sec, item) => sec === 'interface'
        ? !SIMPLE_IFACE.some(n => String(item || '').trim().toLowerCase().startsWith(n))
        : !['connection', 'sys'].includes(sec);
    const ADV_TAG = `<a class="adv-tag" href="config.html#modes" title="Shown with Advanced Control on">${icon('cpu')}Advanced Control</a>`;
    // Each "Config → Section → Option" in the text gets that tag when the option is only in Advanced Control.
    (function tagAdvanced() {
        const main = $('main.content');
        if (!main) return;
        const walk = document.createTreeWalker(main, NodeFilter.SHOW_TEXT), hits = [];
        for (let n; (n = walk.nextNode());) {
            if (n.nodeValue.includes('Config →') && !n.parentElement.closest('th, code, pre, a, [data-widget="cfgexplorer"], .adv-tag')) hits.push(n);
        }
        hits.forEach(n => {
            const t = n.nodeValue, i = t.indexOf('Config →');
            const head = t.slice(i).match(/^Config →\s*/)[0];
            const after = t.slice(i + head.length);
            const key = Object.keys(CFG_SECTIONS).find(k => after.toLowerCase().startsWith(k));
            if (!key) return;
            const im = after.slice(key.length).match(/^\s*→\s*([^→·,;.()]+)/);
            let item = im && im[1];
            // "Config → Interface" under an option's name: that option.
            if (!item && key === 'interface') { const dt = n.parentElement.closest('dt'); if (dt && dt.firstChild) item = dt.firstChild.textContent; }
            if (!cfgAdvanced(CFG_SECTIONS[key], item)) return;
            const host = n.parentElement.closest('.ui, small');
            if (host) {
                if (host.tagName === 'SMALL') { if (!$('.adv-tag', host)) host.insertAdjacentHTML('beforeend', ' ' + ADV_TAG); }
                else if (!host.nextElementSibling || !host.nextElementSibling.classList.contains('adv-tag')) host.insertAdjacentHTML('afterend', ADV_TAG);
                return;
            }
            // In running text: right after the path.
            const rest = n.splitText(i + head.length + key.length + (im ? im[0].replace(/\s+$/, '').length : 0));
            const tmp = document.createElement('span');
            tmp.innerHTML = ADV_TAG;
            rest.parentNode.insertBefore(tmp.firstChild, rest);
        });
    })();

    // The weight each tag of a prompt gets, as Forge reads brackets: ( ) x1.1, [ ] /1.1, (tag:1.3) that number, nested
    // ones multiplied; \( \) are text; [a:b:0.5] / [tag:0.5] are timings, not weights.
    function tagWeights(text) {
        const out = [];
        text.split(/\n|\bBREAK\b|\bAND\b/).forEach(chunk => {
            // Commas inside brackets don't split a tag.
            let depth = 0, cur = '';
            const parts = [];
            for (let i = 0; i < chunk.length; i++) {
                const c = chunk[i];
                if (c === '\\') { cur += c + (chunk[i + 1] || ''); i++; continue; }
                if (c === '(' || c === '[' || c === '{') depth++;
                if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
                if (c === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += c;
            }
            parts.push(cur);
            parts.forEach(raw => {
                const t = raw.trim();
                if (!t) return;
                if (/^<lora:/i.test(t)) { const m = /:(-?[\d.]+)\s*>$/.exec(t); out.push({ tag: t, w: m ? +m[1] : 1, kind: 'lora' }); return; }
                if (/^\[[^\]]*:[^\]]*\]$/.test(t) && !/\|/.test(t)) { out.push({ tag: t, kind: 'timing' }); return; }
                if (/^\{.*\}$/.test(t) || /__.+__/.test(t)) { out.push({ tag: t, kind: 'pick' }); return; }
                let w = 1, s = t;
                // Peel brackets from the outside in.
                for (let guard = 0; guard < 20; guard++) {
                    let m;
                    if ((m = /^\((.*):\s*(-?\d*\.?\d+)\s*\)$/s.exec(s))) { w *= +m[2]; s = m[1].trim(); continue; }
                    if (/^\(.*\)$/s.test(s) && !/\\\)$/.test(s)) { w *= 1.1; s = s.slice(1, -1).trim(); continue; }
                    if (/^\[.*\]$/s.test(s) && !/\|/.test(s)) { w /= 1.1; s = s.slice(1, -1).trim(); continue; }
                    break;
                }
                out.push({ tag: s.replace(/\\([()[\]])/g, '$1'), w, kind: 'tag' });
            });
        });
        return out;
    }

    // Prompting: a box colored as the app's, and the weight Forge gives each tag.
    W.promptplay = el => {
        const ta = $('textarea', el), view = $('.prompt-demo', el), list = $('.wt-list', el);
        function paint() {
            view.innerHTML = paintPc(ta.value) || '<span style="color:#777">Type a prompt above.</span>';
            const tags = tagWeights(ta.value);
            list.innerHTML = tags.map(t => {
                if (t.kind === 'timing') return `<li class="odd">${esc(t.tag)} <b>timing, not a weight</b></li>`;
                if (t.kind === 'pick') return `<li>${esc(t.tag)} <b>picked per image</b></li>`;
                const w = Math.round(t.w * 100) / 100, cls = w > 1.001 ? 'up' : w < 0.999 ? 'down' : '';
                return `<li class="${cls}">${esc(t.tag)} <b>${t.kind === 'lora' ? 'LoRA ' : ''}×${w.toFixed(2)}</b></li>`;
            }).join('') || '<li>No tags yet</li>';
        }
        $$('[data-ex]', el).forEach(b => b.onclick = () => { ta.value = b.dataset.ex; paint(); });
        ta.addEventListener('input', paint);
        paint();
    };

    // Wildcards: the app's own engine (wcengine.js) picking from small example wildcards you can edit.
    const WC_SAMPLE = {
        'hair color': 'blonde hair\n3::black hair\nsilver hair\npink hair\n0.5::rainbow hair',
        'places': 'library ## indoor, quiet\ncafe ## indoor\nbeach ## outdoor\nforest path ## outdoor, quiet',
        'pose': 'sitting ## sitting\nstanding\nwalking',
        'mood': '?sitting:: relaxed\n?!sitting:: alert\nsmiling',
    };
    function wcLibrary(el) {
        return $$('.wc-lib', el).map(b => ({ name: $('b', b).textContent.replace(/^__|__$/g, ''), lines: $('textarea', b).value.split('\n') }));
    }
    W.wcsim = el => {
        const libs = $('.wc-libs', el), prompt = $('.wc-prompt', el), out = $('.out-list', el), count = $('.wc-n', el);
        libs.innerHTML = Object.entries(WC_SAMPLE).map(([n, v]) => `<div class="wc-lib"><b>__${esc(n)}__</b><textarea rows="5" spellcheck="false" aria-label="Options of ${esc(n)}">${esc(v)}</textarea></div>`).join('');
        function run() {
            const E = window.WcEngine;
            if (!E) { out.innerHTML = '<li>The wildcard engine didn’t load.</li>'; return; }
            const lib = E.compile(wcLibrary(el)), n = +count.value || 6, rows = [];
            for (let i = 0; i < n; i++) {
                const s = E.state({ index: i, trace: [], problems: [] });
                let r = E.resolve(prompt.value, lib, s);
                if (s.blank) r = E.tidyBlank(r);
                const probs = (s.problems || []).map(p => p.kind ? `${p.kind}: ${p.name || ''}` : String(p)).filter(Boolean);
                rows.push(`<li>${paintPc(r)}${probs.length ? `<span class="probs">⚠ ${esc([...new Set(probs)].join(' · '))}</span>` : ''}</li>`);
            }
            out.innerHTML = rows.join('');
            const c = E.combos(prompt.value, lib, 0);
            const tot = $('.wc-total', el);
            if (tot) tot.textContent = c && c.total ? c.total.toLocaleString('en') : '1';
        }
        $$('[data-ex]', el).forEach(b => b.onclick = () => { prompt.value = b.dataset.ex; $$('[data-ex]', el).forEach(x => x.setAttribute('aria-pressed', String(x === b))); run(); });
        $('.wc-go', el).onclick = run;
        prompt.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
        libs.addEventListener('input', () => { clearTimeout(libs.t); libs.t = setTimeout(run, 400); });
        run();
    };

    // Queue: All combinations, as the app counts and splits them (wildcards.js comboAsk()).
    W.combos = el => {
        const prompt = $('.cb-prompt', el), cap = $('.cb-cap', el), maxJobs = $('.cb-jobs', el), out = $('.stat-line', el), say = $('.cb-say', el);
        function paint() {
            const E = window.WcEngine;
            const lib = E.compile(Object.entries(WC_SAMPLE).map(([name, v]) => ({ name, lines: v.split('\n') })));
            const total = Math.max(1, (E.combos(prompt.value, lib, 0) || {}).total || 1);
            const capN = Math.min(999, Math.max(1, +cap.value || 100)), jobsN = Math.min(999, Math.max(1, +maxJobs.value || 50));
            const per = Math.min(total, capN), want = Math.ceil(total / per), jobs = Math.min(want, jobsN), imgs = Math.min(total, jobs * per);
            const f = x => x.toLocaleString('en');
            out.innerHTML = `<div><b>${f(total)}</b><span>combinations</span></div><div><b>${f(per)}</b><span>images per run</span></div><div><b>${f(jobs)}</b><span>job${jobs === 1 ? '' : 's'} queued</span></div><div><b>${f(imgs)}</b><span>images in all</span></div>`;
            say.innerHTML = total <= per ? `One run makes all ${f(total)}: GENERATE makes them right away.`
                : `<b>${f(total)} Combinations</b>: “${jobs < want ? `${f(per)} per run, ${f(jobsN)} jobs at most. Queue the first ${f(imgs)}?` : `${f(per)} per run. Queue all ${f(total)} as ${f(jobs)} job${jobs === 1 ? '' : 's'}?`}” with <span class="ui">QUEUE ${f(jobs)} JOB${jobs === 1 ? '' : 'S'}</span> or <span class="ui">GENERATE ${f(per)} NOW</span>.`;
        }
        [prompt, cap, maxJobs].forEach(x => x.addEventListener('input', paint));
        $$('[data-ex]', el).forEach(b => b.onclick = () => { prompt.value = b.dataset.ex; paint(); });
        paint();
    };

    // img2img / Inpaint: Denoising strength, and the steps that really run (editor.js updateDenoiseStepHint()).
    W.denoise = el => {
        const st = $('.dn-steps', el), dn = $('.dn-val', el), out = $('.dn-out', el), pic = $('.denoise-pic i', el), hint = $('.dn-hint', el), sv = $('.dn-sv', el), dv = $('.dn-dv', el);
        function paint() {
            const steps = +st.value, d = +dn.value;
            sv.textContent = steps; dv.textContent = d.toFixed(2);
            const eff = Math.floor(Math.min(d, 0.999) * steps) + 1;
            out.textContent = eff >= steps ? `All ${steps} steps will run` : `${steps} steps set → ~${eff} will actually run`;
            pic.style.setProperty('--n', Math.min(1, d * 1.05).toFixed(2));
            hint.textContent = d <= .3 ? 'Small touch-ups: colours, texture, small details. The picture stays the same.' : d <= .6 ? 'A redraw that keeps the layout and the main shapes: good for changing a style.' : d <= .85 ? 'Big changes: only the rough layout and colours are kept.' : 'Almost a new picture: very little of the original is left.';
        }
        [st, dn].forEach(x => x.addEventListener('input', paint));
        paint();
    };

    // Config: every option, searchable (data in config-data.js).
    W.cfgexplorer = el => {
        const D = window.CFG_DATA || [];
        const q = $('input', el), chips = $('.cfgx-chips:not(.cfgx-modes)', el), modes = $('.cfgx-modes', el), list = $('.cfgx-list', el), count = $('.cfgx-count', el);
        let sec = 'all', mode = 'all';
        const total = D.reduce((n, s) => n + s.items.length, 0);
        const MODE_NAME = { simple: 'in Simple', advanced: 'only in Advanced Control' };
        // A whole section in Advanced Control is marked once, on its heading; in Interface, each option.
        const secAdv = s => s.id !== 'interface' && cfgAdvanced(s.id);
        const inMode = (s, it) => mode === 'all' || (mode === 'advanced') === cfgAdvanced(s.id, it.n);
        chips.innerHTML = `<button data-s="all" aria-pressed="true">All</button>` + D.map(s => `<button data-s="${s.id}">${icon(s.icon)}${esc(s.name)}</button>`).join('');
        if (modes) {
            modes.innerHTML = `<button data-m="all" aria-pressed="true">Both modes</button><button data-m="simple">${icon('layout-list')}Simple</button><button data-m="advanced">${icon('cpu')}Advanced Control</button>`;
            modes.onclick = e => { const b = e.target.closest('button'); if (!b) return; mode = b.dataset.m; $$('button', modes).forEach(x => x.setAttribute('aria-pressed', String(x === b))); paint(); };
        }
        const hi = (text, words) => { let h = text; words.forEach(w => { if (w.length > 1) h = h.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![^<]*>)', 'ig'), '<mark>$1</mark>'); }); return h; };
        function paint() {
            const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
            let shown = 0;
            list.innerHTML = D.filter(s => sec === 'all' || s.id === sec).map(s => {
                const items = s.items.filter(it => { const hay = (it.n + ' ' + it.d + ' ' + (it.k || '') + ' ' + s.name).toLowerCase(); return inMode(s, it) && words.every(w => hay.includes(w)); });
                shown += items.length;
                if (!items.length) return '';
                const tag = `<span class="adv-tag">${icon('cpu')}Advanced Control</span>`;
                return `<div class="cfgx-sec" id="cfg-${s.id}">${icon(s.icon)}${esc(s.name)}<span class="muted" style="letter-spacing:0;text-transform:none;font-weight:600">· ${s.items.length}</span>${secAdv(s) ? tag : ''}${s.shot ? `<a href="assets/img/shots/${s.shot}.webp" class="cfgx-shot" data-shot="${s.shot}">SCREENSHOT</a>` : ''}</div>` +
                    items.map(it => `<div class="cfgx-item${it.sub ? ' cfgx-sub' : ''}"><b>${hi(esc(it.n), words)}${!secAdv(s) && cfgAdvanced(s.id, it.n) ? tag : ''}</b><span class="def${/^on$/i.test(it.v) ? ' on' : ''}">${esc(it.v || '')}</span><p>${hi(it.d, words)}</p></div>`).join('');
            }).join('') || `<div class="cfgx-none">No setting matches${q.value ? ` “${esc(q.value)}”` : ''}${mode !== 'all' ? ' ' + MODE_NAME[mode] : ''}.</div>`;
            count.textContent = words.length || sec !== 'all' || mode !== 'all' ? `${shown} of ${total} settings${mode !== 'all' ? ' ' + MODE_NAME[mode] : ''}` : `${total} settings in ${D.length} sections`;
            drawIcons();
        }
        chips.onclick = e => { const b = e.target.closest('button'); if (!b) return; sec = b.dataset.s; $$('button', chips).forEach(x => x.setAttribute('aria-pressed', String(x === b))); paint(); };
        list.addEventListener('click', e => {
            const a = e.target.closest('.cfgx-shot'); if (!a) return;
            e.preventDefault(); $('img', lb).src = a.getAttribute('href'); $('img', lb).alt = 'Config screenshot'; lb.classList.add('open');
        });
        q.addEventListener('input', paint);
        // A link such as config.html#cfg-prompts opens that section.
        const fromHash = () => {
            const h = location.hash.replace('#cfg-', '');
            if (!D.some(s => s.id === h)) return false;
            sec = h; q.value = '';
            $$('button', chips).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.s === h)));
            return true;
        };
        fromHash();
        addEventListener('hashchange', () => { if (fromHash()) { paint(); el.scrollIntoView({ block: 'start' }); } });
        paint();
    };

    // Help: questions filtered as you type.
    W.faq = el => {
        const q = $('input', el), items = $$('details', el), empty = $('.faq-empty', el);
        q.addEventListener('input', () => {
            const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
            let n = 0;
            items.forEach(d => {
                const ok = words.every(w => d.textContent.toLowerCase().includes(w));
                d.hidden = !ok; if (ok) n++;
                if (words.length && ok && words.join('').length > 2) d.open = true; else if (!words.length) d.open = false;
            });
            empty.style.display = n ? 'none' : 'block';
        });
        const b = $('[data-faq-all]', el);
        if (b) b.onclick = () => { const open = !items.every(d => d.open || d.hidden); items.forEach(d => { if (!d.hidden) d.open = open; }); b.textContent = open ? 'Close all' : 'Open all'; };
    };

    // Dev Power: what each button sends to the PC app (port 5000) and what it does there (desktop_server/main.py).
    W.power = el => {
        const svc = { forge: $('[data-svc="forge"] span', el), comfy: $('[data-svc="comfy"] span', el), lm: $('[data-svc="lm"] span', el) };
        const req = $('.pw-req', el), say = $('.pw-say', el);
        const NAMES = { forge: 'Forge', comfy: 'ComfyUI', lm: 'LM Studio' };
        const set = (k, on) => { svc[k].textContent = on ? 'RUNNING' : 'STOPPED'; svc[k].classList.toggle('run', on); };
        const ACT = {
            power: ['/power', 'Starts every service ticked “On” in the PC app.', () => Object.keys(svc).forEach(k => set(k, true))],
            kill: ['/power/off', 'Stops all three services (the PC itself stays on).', () => Object.keys(svc).forEach(k => set(k, false))],
        };
        $$('[data-act]', el).forEach(b => b.onclick = () => {
            const a = b.dataset.act;
            let path, text;
            if (ACT[a]) { [path, text] = ACT[a]; ACT[a][2](); }
            else { const [k, onoff] = a.split('-'); path = `/power/${k}/${onoff}`; text = `${onoff === 'on' ? 'Starts' : 'Kills'} ${NAMES[k]} only.`; set(k, onoff === 'on'); }
            $$('[data-act]', el).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
            req.textContent = `POST http://192.168.1.20:5000${path}`;
            say.textContent = text;
        });
    };

    // Backup: the parts ticked, and the file BACK UP saves (backup.js).
    W.backup = el => {
        const FILES = { presets: ['presets.json'], settings: ['settings.json'], styles: ['styles.json', 'couple-styles.json (with Forge Couple styles)'], wildcards: ['wildcards.json'], lora: ['lora/ (settings, names, thumbnails, variants, groups)'], comfy: ['comfy-templates.json'], favs: ['favorites.json', 'favorites/1.png, 2.png …'], civitai: ['civitai-key.json'] };
        // One part alone: its own file (backupParts(), backup.js); History favourites and the Civitai key always in the .zip.
        const ONE = { presets: ['resolver-presets-DATE.json'], settings: ['resolver-DATE.json'], styles: ['resolver-styles-DATE.json', 'resolver-couple-styles-DATE.json (only with Forge Couple styles)'], wildcards: ['resolver-wildcards-DATE.json'], lora: ['resolver-loras-DATE.zip'], comfy: ['resolver-comfy-templates-DATE.json'] };
        const out = $('.bk-files', el), note = $('.bk-note', el);
        const date = (() => { const iso = new Date().toISOString(); return iso.slice(0, 10).replace(/-/g, '') + iso.slice(11, 19).replace(/:/g, ''); })();
        function paint() {
            const ids = $$('input', el).filter(i => i.checked).map(i => i.value);
            if (!ids.length) { out.innerHTML = '<li>Nothing ticked</li>'; note.textContent = 'Tick at least one part.'; return; }
            if (ids.length === 1 && ONE[ids[0]]) {
                out.innerHTML = ONE[ids[0]].map(f => `<li>${esc(f.replace('DATE', date))}</li>`).join('');
                note.textContent = 'One part alone is saved as its own file, in the phone’s Documents folder.';
                return;
            }
            out.innerHTML = `<li>resolver-backup-${date}.zip</li><li class="in">manifest.json</li>` + ids.flatMap(id => FILES[id]).map(f => `<li class="in">${esc(f)}</li>`).join('');
            note.textContent = 'Several parts (or History Favorites / the Civitai key) go in one .zip, saved to the phone’s Documents folder. RESTORE then asks which parts to bring back.';
        }
        $$('input', el).forEach(i => i.addEventListener('change', paint));
        paint();
    };

    $$('[data-widget]').forEach(el => { const f = W[el.dataset.widget]; if (f) try { f(el); } catch (e) { console.error('widget', el.dataset.widget, e); } });
    drawIcons();
})();
