// www/js/advcontrol.js
// Config's Mode selector. Simple (the default, for everyone) shows the essentials: Connection, Dock style, Light mode,
// Visible tabs and System Settings. Advanced Control shows every option as well. The Config parts it adds are marked
// .cfg-adv in index.html and hidden by body:not(.adv-control) (style.css); hidden options keep working as they are set.
// Holding the CPU in the Mode Selector window until its bar fills switches Advanced Control on; the choice is remembered.
window.AdvControl = (function () {
    const KEY = 'bojroCfgMode';      // 'advanced', or absent for Simple
    const HOLD_MS = 1600;            // how long the CPU is held to switch on
    const ENGAGE_MS = 1100;          // the window stays open this long after, as the energy reaches the app

    let hold = null, engageTimer = 0;
    const $ = id => document.getElementById(id);
    const isAdvanced = () => document.body.classList.contains('adv-control');

    function haptic(kind) {
        try {
            const d = window.Capacitor?.Plugins?.ResolverDevice;
            if (d && typeof d.haptic === 'function') { d.haptic({ kind }).catch(() => {}); return; }
        } catch (e) { }
        try { if (navigator.vibrate) navigator.vibrate(kind === 'confirm' ? 14 : 5); } catch (e) { }
    }

    function save(adv) {
        try { adv ? localStorage.setItem(KEY, 'advanced') : localStorage.removeItem(KEY); } catch (e) { }
    }

    // Shows the mode in the Config tab and in the window.
    function apply(adv) {
        document.body.classList.toggle('adv-control', adv);
        const name = adv ? 'Advanced Control' : 'Simple';
        const bar = $('cfgModeName');
        if (bar) { bar.textContent = name; bar.classList.toggle('adv', adv); }
        if ($('acStatusName')) $('acStatusName').textContent = name;
        $('acBoard')?.classList.toggle('live', adv);
        $('acSimpleBtn')?.classList.toggle('hidden', !adv);
        if ($('acCpuHint')) $('acCpuHint').textContent = adv ? 'ACTIVE' : 'HOLD TO ACTIVATE';
        if ($('acCpuFill')) $('acCpuFill').style.width = adv ? '100%' : '0%';
        if ($('acInfo')) $('acInfo').innerHTML = adv
            ? '<b>Advanced Control</b> is on: Config shows every option. Switch back to Simple to show only the essentials; your settings stay as they are.'
            : 'Simple shows only the essentials: Connection, theme, dock, visible tabs and System Settings. Hold the CPU\'s bar to activate <b>Advanced Control</b> and show every option. Hidden options keep working as they are set.';
    }

    // The Advanced Control sections fade in one after another.
    function reveal() {
        const view = $('view-cfg');
        if (!view) return;
        [...view.querySelectorAll('.cfg-card.cfg-adv, .cfg-card .cfg-adv')].forEach((el, i) => el.style.setProperty('--ac-i', i));
        view.classList.remove('ac-reveal');
        void view.offsetWidth;
        view.classList.add('ac-reveal');
        $('cfgModeBar')?.classList.add('ac-flash');
        setTimeout(() => { view.classList.remove('ac-reveal'); $('cfgModeBar')?.classList.remove('ac-flash'); }, 1600);
    }

    function cancelHold() {
        if (!hold) return;
        cancelAnimationFrame(hold.raf);
        hold = null;
        const board = $('acBoard');
        board?.classList.remove('charging');
        if (!isAdvanced() && !board?.classList.contains('engaged')) {
            $('acCpuFill').style.width = '0%';
            $('acCpuHint').textContent = 'HOLD TO ACTIVATE';
        }
    }

    function step() {
        if (!hold) return;
        const p = Math.min(1, (performance.now() - hold.t0) / HOLD_MS);
        $('acCpuFill').style.width = (p * 100).toFixed(1) + '%';
        const quarter = Math.floor(p * 4);
        if (quarter > hold.quarter && p < 1) { hold.quarter = quarter; haptic('tick'); }
        if (p >= 1) { hold = null; engage(); return; }
        hold.raf = requestAnimationFrame(step);
    }

    // Held to the end: the energy runs to the app, then Config shows every option.
    function engage() {
        const board = $('acBoard');
        board.classList.remove('charging');
        board.classList.add('engaged');
        $('acCpuHint').textContent = 'ACTIVATED';
        haptic('confirm');
        save(true);
        engageTimer = setTimeout(finishEngage, ENGAGE_MS);
    }
    function finishEngage() {
        if (!engageTimer) return;
        clearTimeout(engageTimer);
        engageTimer = 0;
        $('acBoard')?.classList.remove('engaged');
        apply(true);
        $('advControlModal')?.classList.add('hidden');
        reveal();
        if (typeof Toast !== 'undefined') Toast.show({ text: 'Advanced Control activated', duration: 'short' });
    }

    function onDown(e) {
        if (isAdvanced() || engageTimer || hold) return;
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { }
        hold = { t0: performance.now(), quarter: 0, raf: 0 };
        $('acBoard').classList.add('charging');
        $('acCpuHint').textContent = 'CHARGING...';
        haptic('tick');
        hold.raf = requestAnimationFrame(step);
    }

    function init() {
        let adv = false;
        try { adv = localStorage.getItem(KEY) === 'advanced'; } catch (e) { }
        apply(adv);
        const cpu = $('acCpu');
        if (cpu) {
            cpu.addEventListener('pointerdown', onDown);
            ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => cpu.addEventListener(ev, cancelHold));
            cpu.addEventListener('contextmenu', e => e.preventDefault());
        }
    }

    return {
        isAdvanced,
        open() {
            cancelHold();
            apply(isAdvanced());
            $('advControlModal')?.classList.remove('hidden');
            if (window.lucide) window.lucide.createIcons();
        },
        // The × (and back, or a tap outside): an activation already reached finishes at once.
        close() {
            cancelHold();
            if (engageTimer) { finishEngage(); return; }
            $('advControlModal')?.classList.add('hidden');
        },
        setSimple() {
            save(false);
            apply(false);
            $('advControlModal')?.classList.add('hidden');
            if (typeof window.closeCfgSearch === 'function' && !$('cfgSearchWrap')?.classList.contains('hidden')) window.closeCfgSearch();
            if (typeof Toast !== 'undefined') Toast.show({ text: 'Simple mode', duration: 'short' });
        },
        init,
    };
})();
AdvControl.init();
