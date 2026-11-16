// Viewer: hold an Upscale, img2img or Inpaint result (made this session) to see the image it was made from, at the
// same zoom. And Share, through Android's share sheet.
(function() {
    const MAX = 30;
    const HOLD_MS = 400;
    const MOVE_PX = 10;
    const originals = new Map();
    const sources = new Map();

    function remember(result, original) {
        if (!result || !original || typeof imageDataKey !== 'function') return;
        const ok = imageDataKey(original);
        if (!sources.has(ok)) sources.set(ok, original);
        const k = imageDataKey(result);
        originals.delete(k);
        originals.set(k, ok);
        while (originals.size > MAX) originals.delete(originals.keys().next().value);
        const used = new Set(originals.values());
        sources.forEach((_, key) => { if (!used.has(key)) sources.delete(key); });
    }

    function originalOf(data) {
        if (!data || typeof imageDataKey !== 'function') return null;
        const k = originals.get(imageDataKey(data));
        return k ? sources.get(k) || null : null;
    }

    function setup() {
        const container = document.getElementById('lightboxContainer');
        const img = document.getElementById('fsImage');
        if (!container || !img) return;
        const over = document.createElement('img');
        over.className = 'lightbox-img fs-compare hidden';
        over.alt = '';
        const label = document.createElement('div');
        label.className = 'fs-compare-label hidden';
        label.textContent = 'ORIGINAL';
        container.append(over, label);
        let timer = 0, start = null, holding = false;

        const end = () => {
            clearTimeout(timer);
            start = null;
            if (!holding) return;
            holding = false;
            over.classList.add('hidden');
            label.classList.add('hidden');
            over.removeAttribute('src');
        };

        container.addEventListener('touchstart', e => {
            if (holding) { e.stopPropagation(); return; }
            clearTimeout(timer);
            start = null;
            if (e.touches.length !== 1) return;
            const item = currentGalleryImages[currentGalleryIndex];
            const original = originalOf(item && item.data);
            if (!original) return;
            start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            timer = setTimeout(() => {
                holding = true;
                over.src = original;
                over.style.transform = img.style.transform;
                over.classList.remove('hidden');
                label.classList.remove('hidden');
                // The viewer's own gesture (swipe, tap) is dropped.
                container.dispatchEvent(new Event('touchcancel'));
            }, HOLD_MS);
        }, { capture: true, passive: false });

        container.addEventListener('touchmove', e => {
            if (holding) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); return; }
            if (!start) return;
            const t = e.touches[0];
            if (e.touches.length !== 1 || Math.max(Math.abs(t.clientX - start.x), Math.abs(t.clientY - start.y)) >= MOVE_PX) {
                clearTimeout(timer);
                start = null;
            }
        }, { capture: true, passive: false });

        const release = e => {
            if (holding) {
                e.stopPropagation();
                if (e.cancelable) e.preventDefault();
                if (!e.touches || e.touches.length === 0) end();
                return;
            }
            clearTimeout(timer);
            start = null;
        };
        container.addEventListener('touchend', release, { capture: true, passive: false });
        container.addEventListener('touchcancel', e => { if (e.isTrusted) release(e); }, { capture: true });

        const modal = document.getElementById('fullScreenModal');
        new MutationObserver(() => { if (modal.classList.contains('hidden')) { end(); closeSendMenu(); } })
            .observe(modal, { attributes: true, attributeFilter: ['class'] });
    }

    // Base64 of the shown image, from a data URL or by fetching it.
    async function asDataUrl(src) {
        if (/^data:/.test(src)) return src;
        const blob = await fetch(src).then(r => r.blob());
        return await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsDataURL(blob);
        });
    }

    async function share() {
        if (window.GalleryLite) await GalleryLite.settle();
        const src = document.getElementById('fsImage').src;
        if (!src) return;
        try {
            const data = await asDataUrl(src);
            const upscale = currentGalleryImages[currentGalleryIndex]?.upscale;
            const name = await buildOutputFileName(data, 'bojro', upscale ? upscale.scale : '', upscale ? upscale.seed : null);
            const mime = (data.match(/^data:([^;]+);/) || [])[1] || 'image/png';
            const device = window.Capacitor?.Plugins?.ResolverDevice;
            if (device && device.shareImage) {
                await device.shareImage({ data: data.split(',')[1], name, mime });
            } else {
                const blob = await fetch(data).then(r => r.blob());
                await navigator.share({ files: [new File([blob], name, { type: mime })] });
            }
        } catch (e) {
            if (e && e.name === 'AbortError') return;
            console.warn('Share failed:', e);
            if (typeof Toast !== 'undefined' && Toast) Toast.show({ text: "Couldn't share the image", duration: 'short' });
        }
    }

    async function toggleSendMenu() {
        const menu = document.getElementById('fsSendMenu');
        if (!menu.classList.contains('hidden')) { menu.classList.add('hidden'); return; }
        // Wildcards only for an image with picks (wcreroll.js); then kept inside the screen however many show.
        if (window.WcReroll) await WcReroll.check();
        menu.style.marginLeft = '';
        menu.classList.remove('hidden');
        // Inpaint straight over Send, however many buttons show (item 7); kept inside the screen.
        const send = document.getElementById('fsSendBtn'), inp = document.getElementById('fsInpaintBtn');
        let dx = 0;
        if (send && inp) { const a = send.getBoundingClientRect(), b = inp.getBoundingClientRect(); dx = (a.left + a.width / 2) - (b.left + b.width / 2); }
        menu.style.marginLeft = `${dx}px`;
        const r = menu.getBoundingClientRect(), room = document.documentElement.clientWidth;
        if (r.left < 8) menu.style.marginLeft = `${dx + 8 - r.left}px`;
        else if (r.right > room - 8) menu.style.marginLeft = `${dx + room - 8 - r.right}px`;
    }
    function closeSendMenu() {
        document.getElementById('fsSendMenu')?.classList.add('hidden');
    }
    // Any tap outside the menu closes it.
    document.addEventListener('pointerdown', e => {
        const menu = document.getElementById('fsSendMenu');
        if (menu && !menu.classList.contains('hidden') && !e.target.closest('#fsSendMenu, #fsSendBtn')) closeSendMenu();
    }, true);

    window.toggleFsSendMenu = toggleSendMenu;
    window.closeFsSendMenu = closeSendMenu;
    window.ViewerCompare = { remember, originalOf };
    window.shareCurrentFs = share;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
    else setup();
})();
