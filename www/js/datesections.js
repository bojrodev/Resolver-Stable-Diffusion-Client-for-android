// History date sections: the calendar button beside search turns labels on ("Nov 3 • 4"); a long press picks day,
// month or year. Each image's date also goes into History search (prompthistory.js).
(function () {
    const ON_KEY = 'bojroGalDates', BY_KEY = 'bojroGalDatesBy';
    const BYS = ['day', 'month', 'year'];
    const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
    const on = () => get(ON_KEY) === 'true';
    const by = () => (BYS.includes(get(BY_KEY)) ? get(BY_KEY) : 'day');
    const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // The order of day, month and year in this device's date text (images saved before ts was stored kept only
    // toLocaleString()).
    let order = null;
    function localOrder() {
        if (order) return order;
        try {
            order = new Intl.DateTimeFormat().formatToParts(new Date(2001, 10, 22)).map(p => p.type).filter(t => ['day', 'month', 'year'].includes(t));
        } catch (e) {}
        if (!order || order.length !== 3) order = ['month', 'day', 'year'];
        return order;
    }
    const cache = new Map();
    // An image's time in ms, or null when it can't be read.
    function timeOf(item) {
        if (!item) return null;
        if (typeof item.ts === 'number') return item.ts;
        if (cache.has(item.id)) return cache.get(item.id);
        let t = null;
        const s = String(item.date || '');
        const nums = s.match(/\d+/g);
        if (nums && nums.length >= 3) {
            // Year first (2026/11/3) whatever the locale; otherwise the locale's own order.
            const parts = nums[0].length === 4 ? { year: nums[0], month: nums[1], day: nums[2] }
                : Object.fromEntries(localOrder().map((k, i) => [k, nums[i]]));
            let y = +parts.year, m = +parts.month, d = +parts.day;
            if (y < 100) y += 2000;
            if (m > 12 && d <= 12) [m, d] = [d, m];
            const h = nums.length > 3 ? +nums[3] : 0, mi = nums.length > 4 ? +nums[4] : 0;
            const pm = /pm|午後/i.test(s) && h < 12 ? 12 : 0;
            const date = new Date(y, m - 1, d, h + pm, mi);
            if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && !isNaN(date)) t = date.getTime();
        }
        if (t === null) { const p = Date.parse(s); if (!isNaN(p)) t = p; }
        cache.set(item.id, t);
        return t;
    }

    function keyOf(item, mode) {
        const t = timeOf(item);
        if (t === null) return 'unknown';
        const d = new Date(t);
        return mode === 'year' ? `${d.getFullYear()}` : mode === 'month' ? `${d.getFullYear()}-${d.getMonth()}` : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }
    function labelOf(item, mode) {
        const t = timeOf(item);
        if (t === null) return 'Unknown date';
        const d = new Date(t);
        if (mode === 'year') return `${d.getFullYear()}`;
        if (mode === 'month') return `${LONG[d.getMonth()]} ${d.getFullYear()}`;
        const thisYear = d.getFullYear() === new Date().getFullYear();
        return `${SHORT[d.getMonth()]} ${d.getDate()}${thisYear ? '' : `, ${d.getFullYear()}`}`;
    }
    // Words History search matches an image's date by: "Nov 3", "November", "2026"...
    function searchText(item) {
        const t = timeOf(item);
        if (t === null) return '';
        const d = new Date(t);
        return `${SHORT[d.getMonth()]} ${LONG[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
    }

    // For loadGallery() (engine.js): adds a label before the first image of each date on the page, with how many
    // images that date has on the page.
    function sections(list) {
        if (!on()) return null;
        const mode = by();
        const counts = new Map();
        list.forEach(it => { const k = keyOf(it, mode); counts.set(k, (counts.get(k) || 0) + 1); });
        let last = null;
        return {
            before(item, parent) {
                const k = keyOf(item, mode);
                if (k === last) return;
                last = k;
                const h = document.createElement('div');
                h.className = 'gal-sec';
                h.textContent = labelOf(item, mode);
                const n = document.createElement('span');
                n.textContent = `• ${counts.get(k)}`;
                h.appendChild(n);
                parent.appendChild(h);
            }
        };
    }

    function paint() {
        const btn = document.getElementById('galDateBtn');
        if (btn) {
            btn.classList.toggle('active', on());
            btn.setAttribute('aria-pressed', String(on()));
        }
        document.querySelectorAll('#galDateSeg .toggle-opt').forEach(b => b.classList.toggle('active', b.dataset.by === by()));
    }
    function toggle() {
        set(ON_KEY, on() ? 'false' : 'true');
        paint();
        if (typeof loadGallery === 'function') loadGallery();
    }
    function setBy(v) {
        if (!BYS.includes(v)) return;
        set(BY_KEY, v);
        set(ON_KEY, 'true');
        paint();
        if (typeof loadGallery === 'function') loadGallery();
    }
    function openOptions() {
        paint();
        const m = document.getElementById('galDateModal');
        if (m.classList.contains('hidden') && typeof lockBodyScroll === 'function') lockBodyScroll();
        m.classList.remove('hidden');
    }
    function closeOptions() {
        const m = document.getElementById('galDateModal');
        if (m.classList.contains('hidden')) return;
        m.classList.add('hidden');
        if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
    }

    // Tap turns sections on or off; a long press opens Group by (the tap that ends it doesn't also toggle).
    function wire() {
        const btn = document.getElementById('galDateBtn');
        if (!btn) return;
        let timer = 0, held = false;
        const cancel = () => clearTimeout(timer);
        btn.addEventListener('pointerdown', () => {
            held = false;
            cancel();
            timer = setTimeout(() => { held = true; openOptions(); }, typeof LONG_PRESS_MS === 'number' ? LONG_PRESS_MS : 500);
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => btn.addEventListener(t, cancel));
        btn.addEventListener('contextmenu', e => e.preventDefault());
        btn.addEventListener('click', () => { if (held) { held = false; return; } toggle(); });
        paint();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();

    window.GalleryDates = { sections, searchText, setBy, closeOptions };
})();
