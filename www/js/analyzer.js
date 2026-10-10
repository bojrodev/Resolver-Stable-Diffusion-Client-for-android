// The Analyzer tab below the uploaded image: (1) result cards (Prompt, Negative, a Settings card of
// tappable chips; renderAnalyzerMeta() is called from engine.js once metadata is read), (2) the
// "Send image to" actions, (3) an optional sticky action bar (Config > Interface, off by default).
// Everything shown comes from the image file, so it is set with textContent, never innerHTML.
(function () {
    'use strict';

    // ---- settings: parsing ----

    // Parses "Steps: 15, Sampler: Euler a, ..." into pairs, splitting on commas outside double quotes.
    function parseParamPairs(line) {
        const pieces = [];
        let current = '';
        let inQuotes = false;
        for (const ch of String(line || '')) {
            if (ch === '"') inQuotes = !inQuotes;
            if (ch === ',' && !inQuotes) { pieces.push(current); current = ''; } else { current += ch; }
        }
        pieces.push(current);

        const pairs = [];
        pieces.forEach(piece => {
            if (!piece.trim()) return; // also covers the empty piece after a trailing comma
            const m = piece.match(/^\s*([A-Za-z][A-Za-z0-9 _\-.\/()]*?):\s*([\s\S]*)$/);
            if (m) {
                pairs.push({ key: m[1].trim(), value: m[2].trim() });
            } else if (pairs.length) {
                pairs[pairs.length - 1].value += ', ' + piece.trim();
            }
        });
        pairs.forEach(p => { p.value = p.value.replace(/^"([\s\S]*)"$/, '$1').trim(); });
        return pairs.filter(p => p.value !== '');
    }

    const CANONICAL_LABEL = {
        'steps': 'Steps',
        'sampler': 'Sampler',
        'schedule type': 'Scheduler',
        'scheduler': 'Scheduler',
        'cfg scale': 'CFG',
        'cfg': 'CFG',
        'size': 'Size',
        'seed': 'Seed',
        'model': 'Model'
    };
    const PRIMARY_ORDER = ['Steps', 'Sampler', 'Scheduler', 'CFG', 'Size', 'Seed', 'Model'];

    // { primary: [{label, value}, ...in PRIMARY_ORDER], more: [...everything else] }
    function groupSettings(paramsLine, seed) {
        const pairs = parseParamPairs(paramsLine);
        if (seed) pairs.push({ key: 'Seed', value: String(seed) });
        const primaryByLabel = {};
        const more = [];
        pairs.forEach(p => {
            const label = CANONICAL_LABEL[p.key.toLowerCase()] || p.key;
            if (PRIMARY_ORDER.includes(label) && !primaryByLabel[label]) {
                primaryByLabel[label] = { label, value: p.value };
            } else {
                more.push({ label, value: p.value });
            }
        });
        return { primary: PRIMARY_ORDER.filter(l => primaryByLabel[l]).map(l => primaryByLabel[l]), more };
    }

    // ---- copying ----

    // Copy to clipboard (modern API, textarea fallback); no own toast where Android 13+ shows one.
    window.copyAnalyzerText = async function (text, chipEl) {
        let viaModernApi = false;
        try {
            await navigator.clipboard.writeText(text);
            viaModernApi = true;
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed; opacity:0; pointer-events:none;';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (err) {}
            ta.remove();
        }
        if (chipEl) {
            chipEl.classList.add('ana-chip-copied');
            setTimeout(() => chipEl.classList.remove('ana-chip-copied'), 600);
        }
        if (typeof Toast !== 'undefined' && Toast) {
            const systemAlreadyShowsOne = viaModernApi && typeof window.androidShowsOwnClipboardToast === 'function' && window.androidShowsOwnClipboardToast();
            if (!systemAlreadyShowsOne) Toast.show({ text: 'Copied', duration: 'short' });
        }
    };

    // ---- chips ----

    function makeChip(label, value, copyText, extraClass) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'ana-chip' + (extraClass ? ' ' + extraClass : '');
        const key = document.createElement('span');
        key.className = 'ana-chip-key';
        key.textContent = label;
        const val = document.createElement('span');
        val.className = 'ana-chip-val';
        val.textContent = value;
        chip.appendChild(key);
        chip.appendChild(val);
        chip.addEventListener('click', () => window.copyAnalyzerText(copyText, chip));
        return chip;
    }

    function renderSettings(info) {
        const box = document.getElementById('anaSettingsBox');
        const chips = document.getElementById('anaSettingsChips');
        const more = document.getElementById('anaSettingsMore');
        const moreBtn = document.getElementById('anaSettingsMoreBtn');
        chips.textContent = '';
        more.textContent = '';
        more.classList.add('hidden');

        const groups = groupSettings(info.params, info.seed);
        if (!groups.primary.length && !groups.more.length) {
            box.classList.add('hidden');
            moreBtn.classList.add('hidden');
            return;
        }
        box.classList.remove('hidden');
        groups.primary.forEach(g => chips.appendChild(makeChip(g.label, g.value, g.value)));
        groups.more.forEach(g => more.appendChild(makeChip(g.label, g.value, g.value)));
        if (groups.more.length) {
            moreBtn.textContent = `More (${groups.more.length})`;
            moreBtn.classList.remove('hidden');
        } else {
            moreBtn.classList.add('hidden');
        }
    }

    window.toggleAnaSettingsMore = function () {
        const more = document.getElementById('anaSettingsMore');
        const btn = document.getElementById('anaSettingsMoreBtn');
        const opening = more.classList.contains('hidden');
        more.classList.toggle('hidden', !opening);
        btn.textContent = opening ? 'Less' : `More (${more.children.length})`;
    };

    // ---- prompt cards: collapse when long ----

    const COLLAPSED_PX = 68; // keep in step with .ana-text.ana-collapsed (style.css)

    function setUpCollapsible(textareaId) {
        const el = document.getElementById(textareaId);
        const wrap = document.getElementById(textareaId + 'Wrap');
        const btn = document.getElementById(textareaId + 'Toggle');
        wrap.classList.remove('ana-collapsed');
        if (typeof autoResizeTextarea === 'function') autoResizeTextarea(el); // full height, so it can be measured
        if (el.scrollHeight > COLLAPSED_PX + 6) {
            wrap.classList.add('ana-collapsed');
            btn.textContent = 'Show more';
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    }

    window.toggleAnaCollapse = function (textareaId) {
        const wrap = document.getElementById(textareaId + 'Wrap');
        const btn = document.getElementById(textareaId + 'Toggle');
        const collapsing = !wrap.classList.contains('ana-collapsed');
        wrap.classList.toggle('ana-collapsed', collapsing);
        btn.textContent = collapsing ? 'Show more' : 'Show less';
    };

    // ---- LoRAs in the prompt ----

    const LORA_TAG = /<(?:lora|lyco):([^:>]+)(?::([^>]*))?>/gi;

    function namesFrom(list) {
        const names = new Set();
        (list || []).forEach(l => {
            if (l && l.name) names.add(String(l.name).toLowerCase());
            if (l && l.alias) names.add(String(l.alias).toLowerCase());
        });
        return names;
    }

    // Installed LoRA names from the server (cached for a few minutes), or null if unavailable.
    let installedCache = null; // { at, host, names }
    async function getInstalledLoraNames() {
        if (window.LoraManager && Array.isArray(window.LoraManager.allLoras) && window.LoraManager.allLoras.length) {
            return namesFrom(window.LoraManager.allLoras);
        }
        if (typeof HOST === 'undefined' || !HOST) return null;
        if (installedCache && installedCache.host === HOST && Date.now() - installedCache.at < 5 * 60 * 1000) {
            return installedCache.names;
        }
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 4000);
            const res = await fetch(`${HOST}/sdapi/v1/loras`, {
                headers: typeof getHeaders === 'function' ? getHeaders() : {},
                signal: controller.signal
            });
            clearTimeout(timer);
            if (!res.ok) return null;
            const names = namesFrom(await res.json());
            installedCache = { at: Date.now(), host: HOST, names };
            return names;
        } catch (e) {
            return null;
        }
    }

    function renderLoras(promptText) {
        const holder = document.getElementById('anaPromptLoras');
        holder.textContent = '';
        const found = [];
        LORA_TAG.lastIndex = 0;
        let m;
        while ((m = LORA_TAG.exec(promptText || '')) !== null) {
            found.push({ tag: m[0], name: m[1].trim(), weight: (m[2] || '').trim() });
        }
        if (!found.length) {
            holder.classList.add('hidden');
            return;
        }
        holder.classList.remove('hidden');
        const chips = found.map(f => {
            const chip = makeChip('LoRA', f.weight ? `${f.name} \u00b7 ${f.weight}` : f.name, f.tag, 'ana-chip-lora');
            holder.appendChild(chip);
            return { chip, name: f.name.toLowerCase() };
        });

        // Chips show as "not known yet" and are updated when the server answers.
        const myToken = typeof anaLoadToken !== 'undefined' ? anaLoadToken : null;
        getInstalledLoraNames().then(names => {
            if (!names) return;
            if (myToken !== null && myToken !== anaLoadToken) return;
            chips.forEach(({ chip, name }) => {
                const installed = names.has(name);
                chip.classList.add(installed ? 'lora-installed' : 'lora-missing');
                if (!installed) chip.querySelector('.ana-chip-key').textContent = 'LoRA \u00b7 not installed';
            });
        });
    }

    // ---- entry points ----

    window.renderAnalyzerMeta = function (info) {
        document.getElementById('anaMetaPos').value = info.pos || '(empty)';
        setUpCollapsible('anaMetaPos');
        renderLoras(info.pos);

        const negBox = document.getElementById('anaMetaNegBox');
        if (info.neg) {
            negBox.classList.remove('hidden');
            document.getElementById('anaMetaNeg').value = info.neg;
            setUpCollapsible('anaMetaNeg');
        } else {
            negBox.classList.add('hidden');
        }

        renderSettings(info);
    };

    window.resetAnalyzerMeta = function () {
        ['anaMetaPos', 'anaMetaNeg'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.value = ''; el.style.height = ''; }
            document.getElementById(id + 'Wrap')?.classList.remove('ana-collapsed');
            document.getElementById(id + 'Toggle')?.classList.add('hidden');
        });
        const loras = document.getElementById('anaPromptLoras');
        if (loras) { loras.textContent = ''; loras.classList.add('hidden'); }
        ['anaSettingsChips', 'anaSettingsMore'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '';
        });
        document.getElementById('anaSettingsMore')?.classList.add('hidden');
        document.getElementById('anaSettingsMoreBtn')?.classList.add('hidden');
        document.getElementById('anaSettingsBox')?.classList.add('hidden');
        document.getElementById('anaMetaNegBox')?.classList.add('hidden');
    };

    // ---- Send image to (image only; prompt/settings go through "Use In") ----
    // Uses the same entry points as the fullscreen viewer. A data-URL copy is sent, not the preview's
    // blob URL, which is released when the image is removed.
    async function analyzerImageDataUrl() {
        const preview = document.getElementById('anaPreview');
        const src = preview && preview.getAttribute('src');
        if (!src) return null;
        try {
            const blob = await (await fetch(src)).blob();
            return await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            return null;
        }
    }

    // One send at a time.
    let sendInFlight = false;
    async function guardedSend(send) {
        if (sendInFlight) return;
        sendInFlight = true;
        const buttons = Array.from(document.querySelectorAll('#anaSendButtons button'));
        buttons.forEach(b => { b.disabled = true; });
        try {
            const myToken = anaLoadToken;
            const dataUrl = await analyzerImageDataUrl();
            if (!dataUrl) {
                if (typeof Toast !== 'undefined' && Toast && myToken === anaLoadToken) Toast.show({ text: "Couldn't read the image", duration: 'short' });
                return;
            }
            // Removed or replaced while it was being copied: don't send what the user has since dismissed
            if (myToken !== anaLoadToken) return;
            send(dataUrl);
        } finally {
            sendInFlight = false;
            buttons.forEach(b => { b.disabled = false; });
        }
    }

    // topMode: 'img2img' | 'inpaint' | 'upscale'
    window.sendAnalyzedImageTo = function (topMode) {
        return guardedSend(dataUrl => {
            startEditorMetadataCapture(dataUrl); // so img2img's import-from-metadata buttons work afterwards
            window.switchTab('inp');
            window.setInpaintTopMode(topMode);
            showEditorWithImage(dataUrl);
        });
    };

    window.sendAnalyzedImageToControlNet = function () {
        return guardedSend(dataUrl => sendImageToControlNet(dataUrl, false));
    };

    // Shown when ControlNet is enabled in Settings (kept in step by updateFsControlNetButtons()).
    window.updateAnalyzerSendButtons = function () {
        document.getElementById('anaSendCnBtn')?.classList.toggle('hidden', !isControlNetEnabledAnywhere());
    };

    // ---- sticky action bar ----
    // A slim bar at the top (thumbnail, USE IN, SEND TO, remove) shown once the image has scrolled off.
    // Its panels use the same options as the full rows (getUseInModes() in engine.js).

    // Space the bar takes; the image counts as scrolled off once its bottom edge passes under it.
    const STICKY_BAR_PX = 64;
    let imageScrolledOff = false;
    let stickyMenuKind = null;

    function closeStickyMenu() {
        stickyMenuKind = null;
        const menu = document.getElementById('anaStickyMenu');
        if (menu) { menu.textContent = ''; menu.classList.add('hidden'); }
    }

    // Config > Interface > Analyzer Sticky Bar. Off unless switched on.
    function stickyBarEnabled() {
        return localStorage.getItem('bojroAnalyzerStickyBar') === 'true';
    }

    function applyStickyVisibility() {
        const preview = document.getElementById('anaPreview');
        const hasImage = !!(preview && preview.getAttribute('src'));
        const show = stickyBarEnabled() && hasImage && imageScrolledOff;
        document.getElementById('anaStickyBar')?.classList.toggle('hidden', !show);
        if (!show) closeStickyMenu();
    }

    // Keeps the bar in step with the loaded image and its metadata.
    window.updateAnalyzerStickyBar = function () {
        const preview = document.getElementById('anaPreview');
        const src = preview && preview.getAttribute('src');
        const thumb = document.getElementById('anaStickyThumb');
        if (thumb) { if (src) thumb.src = src; else thumb.removeAttribute('src'); }
        // Use In needs metadata; sending the image doesn't
        document.getElementById('anaStickyUseInBtn')?.classList.toggle('hidden', !currentAnalyzedPrompts);
        applyStickyVisibility();
    };

    window.scrollAnalyzerToTop = function () {
        window.scrollTo({ top: 0, behavior: 'instant' });
    };

    function stickyMenuItems(kind) {
        if (kind === 'usein') {
            return getUseInModes().map(m => ({ label: m.label, run: () => window[m.fn]() }));
        }
        const items = [
            { label: 'INPAINT', run: () => window.sendAnalyzedImageTo('inpaint') },
            { label: 'IMG2IMG', run: () => window.sendAnalyzedImageTo('img2img') },
            { label: 'UPSCALE', run: () => window.sendAnalyzedImageTo('upscale') }
        ];
        if (isControlNetEnabledAnywhere()) items.push({ label: 'CONTROLNET', run: () => window.sendAnalyzedImageToControlNet() });
        return items;
    }

    window.toggleAnaStickyMenu = function (kind) {
        if (stickyMenuKind === kind) { closeStickyMenu(); return; }
        const menu = document.getElementById('anaStickyMenu');
        if (!menu) return;
        menu.textContent = '';
        stickyMenuItems(kind).forEach(item => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-small ana-send-btn';
            btn.textContent = item.label;
            btn.addEventListener('click', () => { closeStickyMenu(); item.run(); });
            menu.appendChild(btn);
        });
        menu.classList.remove('hidden');
        stickyMenuKind = kind;
    };

    // A tap anywhere outside the bar puts the open panel away.
    document.addEventListener('pointerdown', (e) => {
        if (stickyMenuKind && !document.getElementById('anaStickyBar').contains(e.target)) closeStickyMenu();
    });

    // Leaving the Analyzer closes any open panel.
    (function watchLeavingTab() {
        const view = document.getElementById('view-ana');
        if (!view) return;
        new MutationObserver(() => {
            if (view.classList.contains('hidden')) closeStickyMenu();
        }).observe(view, { attributes: true, attributeFilter: ['class'] });
    })();

    // Shown or hidden depending on whether the image is on screen (also fires when it is removed).
    (function observeImage() {
        const gallery = document.getElementById('anaGallery');
        if (!gallery || typeof IntersectionObserver === 'undefined') return;
        new IntersectionObserver((entries) => {
            const entry = entries[entries.length - 1];
            imageScrolledOff = !entry.isIntersecting && entry.boundingClientRect.top < 0;
            applyStickyVisibility();
        }, { rootMargin: `-${STICKY_BAR_PX}px 0px 0px 0px`, threshold: 0 }).observe(gallery);
    })();

    // Exposed for the test suite.
    window.__analyzerInternals = { parseParamPairs, groupSettings };
})();
