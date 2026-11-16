// Number boxes: text boxes with the number keyboard that drop unwanted characters as typed and tidy the number for its
// kind and limits on leaving (CFG one decimal, sizes multiples of 8). Slider boxes and the ComfyUI tab are left alone.
(function () {
    const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    const CFG_ID = /(^|_)(hr_)?cfg$|_distilled$|^ckptCfgCfg$|^cfgLoraOverrideCfg$/;
    const SNAP8_ID = /_(width|height)$|_cn_\d+_res$/;
    const NEGATIVE_ID = /_seed$|^cfgLoraSlider(Min|Max)$/;
    // Their lowest value has its own check and message (cfg.js).
    const OWN_MIN = /^cfg(Generation|Background)PollingRate$/;
    const isSliderBox = el => !!(el.dataset.cnSlider || el.dataset.sliderLabel !== undefined || el.dataset.cnLabel !== undefined);
    const attrNum = (el, a) => { const v = el.getAttribute(a); return v === null || v === '' || isNaN(Number(v)) ? null : Number(v); };
    const decimalsOf = s => (String(s).split('.')[1] || '').length;

    // { type: 'int' | 'dec', min, max, minDec, maxDec, snap, negative, optional }
    function kindOf(el) {
        const id = el.id || '';
        const step = el.getAttribute('step');
        const value = el.getAttribute('value');
        const k = {
            min: OWN_MIN.test(id) ? null : attrNum(el, 'min'),
            max: attrNum(el, 'max'),
            negative: NEGATIVE_ID.test(id),
            // Empty means "use the default" (a placeholder and nothing set to start with).
            optional: !!el.placeholder && value === null
        };
        if (k.min !== null && k.min < 0) k.negative = true;
        if (/_seed$/.test(id)) k.min = -1;
        if (/^cfgPort/.test(id)) { k.min = 1; k.max = 65535; }
        if (k.min === null && !k.negative) k.min = 0;
        if (CFG_ID.test(id) || /_more_subseed_strength$/.test(id)) return Object.assign(k, { type: 'dec', minDec: 1, maxDec: 2 });
        const stepDec = step && step !== 'any' ? decimalsOf(step) : 0;
        if (stepDec || (value && value.includes('.')) || /^cfgLoraSlider/.test(id)) {
            return Object.assign(k, { type: 'dec', minDec: k.max === 1 && k.min === 0 ? 2 : 0, maxDec: Math.max(2, stepDec) });
        }
        return Object.assign(k, { type: 'int', snap: SNAP8_ID.test(id) ? 8 : 1 });
    }

    // A number as the box shows it (decimals only; limits are applied on leaving the box).
    function format(k, n) {
        if (k.type === 'int') return String(Math.round(n));
        let s = n.toFixed(k.maxDec).replace(/0+$/, '').replace(/\.$/, '');
        if (s === '-0') s = '0';
        return decimalsOf(s) < k.minDec ? Number(s).toFixed(k.minDec) : s;
    }
    function tidy(k, n) {
        if (k.type === 'int') n = Math.round(n / k.snap) * k.snap;
        if (k.min !== null && n < k.min) n = k.type === 'int' ? Math.ceil(k.min / k.snap) * k.snap : k.min;
        if (k.max !== null && n > k.max) n = k.type === 'int' ? Math.floor(k.max / k.snap) * k.snap : k.max;
        return format(k, n);
    }
    // What's typed as a number, or null (nothing readable).
    function parse(raw) {
        const s = String(raw).trim().replace(/,/g, '.');
        if (!/\d/.test(s)) return null;
        const n = parseFloat(s);
        return isFinite(n) ? n : null;
    }

    // While typing: unwanted characters dropped, keeping the cursor where it was.
    function clean(el, k) {
        const raw = native.get.call(el);
        const caret = el.selectionStart;
        let out = '', dot = false, newCaret = 0;
        [...raw].forEach((ch, i) => {
            let keep = '';
            if (ch >= '0' && ch <= '9') keep = ch;
            else if ((ch === '.' || ch === ',') && !dot) { keep = '.'; dot = true; }
            else if (ch === '-' && k.negative && out === '') keep = '-';
            out += keep;
            if (i < caret) newCaret += keep.length;
        });
        if (out === raw) return;
        native.set.call(el, out);
        try { el.setSelectionRange(newCaret, newCaret); } catch (e) {}
    }

    function setUp(el) {
        if (el._numBox || el.type !== 'number' || isSliderBox(el) || el.closest('#view-comfy')) return;
        const k = kindOf(el);
        el._numBox = k;
        el.type = 'text';
        el.inputMode = k.type === 'int' && !k.negative ? 'numeric' : 'decimal';
        el.autocomplete = 'off';
        // Boxes with decimals show them however their value is set (5 as 5.0).
        if (k.type === 'dec' && k.minDec) {
            Object.defineProperty(el, 'value', {
                configurable: true,
                enumerable: true,
                get() { return native.get.call(this); },
                set(v) {
                    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*-?\d*\.?\d+\s*$/.test(v) ? Number(v) : NaN;
                    native.set.call(this, isFinite(n) ? format(k, n) : v);
                }
            });
            if (native.get.call(el) !== '') el.value = native.get.call(el);
        }
    }
    function setUpAll(root) {
        (root || document).querySelectorAll('input[type="number"]').forEach(setUp);
    }

    document.addEventListener('focusin', e => {
        if (e.target._numBox) e.target._numPrev = native.get.call(e.target);
    }, true);
    // First, before the box's own handlers.
    document.addEventListener('input', e => {
        const el = e.target;
        if (el._numBox) clean(el, el._numBox);
    }, true);
    document.addEventListener('change', e => {
        const el = e.target;
        const k = el._numBox;
        if (!k) return;
        const raw = native.get.call(el);
        const n = parse(raw);
        let out;
        if (n !== null) out = tidy(k, n);
        else if (k.optional && raw.trim() === '') out = '';
        else out = el._numPrev !== undefined ? el._numPrev : '';
        el._numPrev = out;
        if (out === raw) return;
        native.set.call(el, out);
        // The box's own input handlers (saving, say) see the tidied number too.
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }, true);

    // Boxes added later (windows built when opened).
    function watch() {
        new MutationObserver(records => records.forEach(r => r.addedNodes.forEach(n => {
            if (n.nodeType !== 1) return;
            if (n.matches && n.matches('input[type="number"]')) setUp(n);
            else if (n.querySelector && n.querySelector('input[type="number"]')) setUpAll(n);
        }))).observe(document.body, { childList: true, subtree: true });
    }

    window.NumberBoxes = {
        // At start, once the slider boxes are marked (boot.js).
        start: () => { setUpAll(); watch(); },
        _kindOf: kindOf, _tidy: tidy
    };
})();
