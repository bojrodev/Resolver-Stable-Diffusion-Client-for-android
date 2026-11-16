// The dock's sliding highlight and drag-to-switch (style.css, "Dock glide").
// One pill (.dock-glider) slides to the lit item: the active tab, or while a finger is down, the item under it. Tap an
// item, or slide along the dock and lift on one; a label above names the item while sliding. The tab switches as the
// finger lifts (switchTab(), boot.js). Lifting well above the dock cancels, so a system swipe from the bottom edge
// changes nothing. Haptics come from Android itself (ResolverDevice.haptic), so they follow the phone's touch-feedback
// setting; without it (a browser) navigator.vibrate stands in where allowed.
window.DockGlide = (() => {
    const CANCEL_ABOVE = 60;   // px above the dock's top edge where a lift cancels
    const DRAG_SLOP = 8;       // px moved before a press counts as a slide (shows the label)
    let dock, glider, tip, press = null, lit = null, ready = false, raf = 0;

    function haptic(kind) {
        try {
            const d = window.Capacitor?.Plugins?.ResolverDevice;
            if (d && typeof d.haptic === 'function') { d.haptic({ kind }).catch(() => {}); return; }
        } catch (e) { }
        try { if (navigator.vibrate) navigator.vibrate(kind === 'confirm' ? 14 : kind === 'tap' ? 10 : 5); } catch (e) { }
    }

    const items = () => Array.from(dock.querySelectorAll('.dock-item')).filter(el => !el.classList.contains('hidden') && el.offsetWidth);
    const viewOf = el => el.id.replace(/^dock-/, '');

    // The item under a finger at x (the nearest by its centre, so a finger a little off the dock still counts), or null
    // above the cancel line.
    function itemAt(x, y) {
        const r = dock.getBoundingClientRect();
        if (y < r.top - CANCEL_ABOVE) return null;
        let best = null, bestD = Infinity;
        for (const el of items()) {
            const b = el.getBoundingClientRect(), d = Math.abs(x - (b.left + b.width / 2));
            if (d < bestD) { best = el; bestD = d; }
        }
        return best;
    }

    // Puts the pill (and the lit look) on el; the active tab when el is null.
    function place(el, instant) {
        if (!ready) return;
        const target = el || dock.querySelector('.dock-item.active:not(.hidden)');
        if (lit && lit !== target) lit.classList.remove('lit');
        lit = target;
        if (!target || !target.offsetWidth) { glider.style.opacity = '0'; return; }
        if (!target.classList.contains('lit')) target.classList.add('lit');
        if (instant) glider.classList.add('no-anim');
        glider.style.opacity = '1';
        glider.style.width = target.offsetWidth + 'px';
        glider.style.height = target.offsetHeight + 'px';
        glider.style.borderRadius = getComputedStyle(target).borderRadius;
        glider.style.setProperty('--gx', target.offsetLeft + 'px');
        glider.style.setProperty('--gy', target.offsetTop + 'px');
        if (instant) { void glider.offsetWidth; glider.classList.remove('no-anim'); }
        if (press && press.sliding) {
            tip.textContent = target.getAttribute('aria-label') || '';
            tip.style.setProperty('--tx', (target.offsetLeft + target.offsetWidth / 2) + 'px');
        }
    }
    const soon = instant => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => place(press ? press.over : null, instant)); };

    function end(commit) {
        const p = press;
        press = null;
        dock.classList.remove('pressing', 'sliding');
        if (!p) return;
        window.__dockHandledAt = Date.now();
        if (commit && p.over) {
            haptic(p.sliding ? 'confirm' : 'tap');
            if (typeof window.switchTab === 'function') window.switchTab(viewOf(p.over));
        }
        // On the (new) active tab.
        place(null);
    }

    function onDown(e) {
        if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
        if (dock.classList.contains('selecting') || (e.target.closest && e.target.closest('#galSelectBar'))) return;
        const over = itemAt(e.clientX, e.clientY);
        if (!over) return;
        press = { id: e.pointerId, x: e.clientX, y: e.clientY, over, sliding: false };
        try { dock.setPointerCapture(e.pointerId); } catch (err) { }
        dock.classList.add('pressing');
        place(over);
    }
    function onMove(e) {
        if (!press || e.pointerId !== press.id) return;
        if (!press.sliding && Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_SLOP) {
            press.sliding = true;
            dock.classList.add('sliding');
            place(press.over);   // shows the label over the pressed item
        }
        if (!press.sliding) return;
        const over = itemAt(e.clientX, e.clientY);
        if (over === press.over) return;
        press.over = over;
        dock.classList.toggle('cancelling', !over);
        if (over) haptic('tick');
        place(over);
    }
    function onUp(e) {
        if (!press || e.pointerId !== press.id) return;
        dock.classList.remove('cancelling');
        end(true);
    }
    function onCancel(e) {
        if (!press || e.pointerId !== press.id) return;
        dock.classList.remove('cancelling');
        end(false);
    }

    function init() {
        dock = document.querySelector('.glass-dock');
        if (!dock || dock.querySelector('.dock-glider')) return;
        glider = document.createElement('div');
        glider.className = 'dock-glider';
        glider.setAttribute('aria-hidden', 'true');
        tip = document.createElement('div');
        tip.className = 'dock-tip';
        tip.setAttribute('aria-hidden', 'true');
        dock.insertBefore(glider, dock.firstChild);
        dock.appendChild(tip);
        dock.classList.add('has-glider');
        ready = true;

        dock.addEventListener('pointerdown', onDown);
        dock.addEventListener('pointermove', onMove);
        dock.addEventListener('pointerup', onUp);
        dock.addEventListener('pointercancel', onCancel);
        dock.addEventListener('lostpointercapture', onCancel);

        // Follows the active tab wherever it's set (switchTab(), items shown or hidden, the Dock style option). Only a real
        // change counts: this module's own class changes (lit, pressing...) also reach the observers.
        const dockSig = () => Array.from(dock.querySelectorAll('.dock-item')).map(el => el.id + (el.classList.contains('active') ? '*' : '') + (el.classList.contains('hidden') ? '-' : '')).join() + (dock.classList.contains('selecting') ? '|s' : '');
        const bodySig = () => Array.from(document.body.classList).filter(c => c.startsWith('dock-') || c === 'app-loading').sort().join();
        let lastDock = dockSig(), lastBody = bodySig();
        new MutationObserver(() => {
            const s = dockSig();
            if (s === lastDock) return;
            lastDock = s;
            if (!press) soon(false);
        }).observe(dock, { subtree: true, attributes: true, attributeFilter: ['class'] });
        new MutationObserver(() => {
            const s = bodySig();
            if (s === lastBody) return;
            lastBody = s;
            soon(true);
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        if (window.ResizeObserver) new ResizeObserver(() => soon(true)).observe(dock);
        window.addEventListener('resize', () => soon(true));
        place(null, true);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    return { refresh: () => soon(true), haptic };
})();
