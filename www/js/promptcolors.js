// Color-coded prompts (item 77, Config > Interface): the text of every prompt and negative box drawn in colors on a
// clear layer over the box (taps go through), whose own text is made clear; its caret and selection still show.
// Brackets take a color per level of nesting and white on red when they have no partner; weights, LoRA tags, wildcards
// and {a|b} choices, BREAK / AND (a highlight) and commas have colors of their own; [tag:0.5] (read by Forge as "add
// after 50%", not a weight) is underlined. Nothing in the box changes.
(function () {
    const KEY = 'bojroPromptColors';
    const on = () => localStorage.getItem(KEY) !== 'false';
    // Prompt and negative boxes: the tabs', ADetailer's, Hi-Res', Forge Couple's, the style, LoRA and wildcard editors'.
    const MODE = '(?:xl|flux|qwen|anima|krea|inp|img2img)';
    const BOX = new RegExp(`^(?:${MODE}_(?:prompt|neg|adetailer_\\d+_(?:prompt|neg)|more_hr_(?:prompt|negative)|fc\\d+)|styleEditPrompt|styleEditNeg|img2imgPresetEdPrompt|img2imgPresetEdNeg|styleFcBg|styleFcR\\d+|cfgTrigger|cfgLoraAdditionalNegative|lvTrigger|lvNegative|wcEditorText|wcTryText|wxText)$`);
    // Wildcard text: each line its own option (brackets don't run across lines) and # lines are notes.
    const WC_TEXT = new Set(['wcEditorText', 'wcTryText', 'wxText']);
    const esc = c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c);

    // The classes of each character, then runs of the same classes as spans.
    function paint(t, perLine) {
        const n = t.length, cls = new Array(n).fill(''), taken = new Uint8Array(n);
        const mark = (a, b, c) => { for (let i = a; i < b; i++) { cls[i] = c; taken[i] = 1; } };
        const add = (a, b, c) => { for (let i = a; i < b; i++) cls[i] = cls[i] ? cls[i] + ' ' + c : c; };
        let m;
        if (perLine) {
            // A wildcard's own lines: "# comment", "#! rule", "## labels"; and on an option line "3::", "?cond::", "## labels".
            const re = /^[ \t]*(#!|##|#)?.*$/gm;
            while ((m = re.exec(t))) {
                const a = m.index, line = m[0];
                if (!line) { re.lastIndex++; continue; }
                const lead = line.length - line.trimStart().length;
                if (m[1] === '#') { mark(a, a + line.length, 'pc-cm'); continue; }
                if (m[1] === '##') { mark(a + lead, a + lead + 2, 'pc-kw'); mark(a + lead + 2, a + line.length, 'pc-lab'); continue; }
                if (m[1] === '#!') {
                    mark(a + lead, a + lead + 2, 'pc-kw');
                    // "last" is a rule only on its own.
                    const k = /^\s*last\s*$/i.test(line.slice(lead + 2)) ? /last/gi : /\b(excludes|requires|one of)\b/gi;
                    let km; while ((km = k.exec(line))) mark(a + km.index, a + km.index + km[0].length, 'pc-kw');
                    for (let i = a + lead + 2; i < a + line.length; i++) if (!taken[i]) mark(i, i + 1, 'pc-rule');
                    continue;
                }
                let i = lead;
                const w = /^(\d+(?:\.\d+)?)\s*::\s*/.exec(line.slice(i));
                if (w) { mark(a + i, a + i + w[0].length, 'pc-wt'); i += w[0].length; }
                const c = /^\?([^:]*(?::(?!:)[^:]*)*)::/.exec(line.slice(i));
                if (c) {
                    for (let j = 0; j < c[0].length; j++) { const ch = line[i + j]; mark(a + i + j, a + i + j + 1, /[?:&,|!=()]/.test(ch) ? 'pc-kw' : 'pc-cond'); }
                    i += c[0].length;
                }
                const h = line.indexOf('##', i);
                if (h > i) { mark(a + h, a + h + 2, 'pc-kw'); mark(a + h + 2, a + line.length, 'pc-lab'); }
            }
        }
        let re = /<(?:lora|lyco|lycoris|hypernet|embedding):[^<>\n]*>/gi;
        while ((m = re.exec(t))) if (!taken[m.index]) mark(m.index, m.index + m[0].length, 'pc-lo');
        // __name__ (no commas inside, so o__o, ^__^ don't pair up with each other).
        re = /__(?=[^\s_,])[^,\n]*?[^\s,]__|__[^\s_,]__/g;
        while ((m = re.exec(t))) if (!taken[m.index]) mark(m.index, m.index + m[0].length, 'pc-wc');
        re = /\b(?:BREAK|AND)\b/g;
        while ((m = re.exec(t))) if (!taken[m.index]) mark(m.index, m.index + m[0].length, 'pc-brk');
        // Brackets: one stack for all three kinds; \( \) are text.
        const pair = { ')': '(', ']': '[', '}': '{' }, stack = [], pairs = [];
        for (let i = 0; i < n; i++) {
            if (taken[i]) continue;
            const c = t[i];
            if (c === '\n' && perLine) { stack.forEach(([, j]) => mark(j, j + 1, 'pc-bad')); stack.length = 0; continue; }
            if (c !== '(' && c !== ')' && c !== '[' && c !== ']' && c !== '{' && c !== '}') continue;
            if (i > 0 && t[i - 1] === '\\') continue;
            if (c === '(' || c === '[' || c === '{') { stack.push([c, i]); continue; }
            if (stack.length && stack[stack.length - 1][0] === pair[c]) {
                const [, j] = stack.pop();
                pairs.push([j, i, stack.length]);
            } else mark(i, i + 1, 'pc-bad');
        }
        stack.forEach(([, j]) => mark(j, j + 1, 'pc-bad'));
        pairs.forEach(([a, b, d]) => {
            // {a|b}: a choice, all in the wildcard color.
            if (t[a] === '{' && t.slice(a + 1, b).includes('|')) { mark(a, a + 1, 'pc-wcb'); mark(b, b + 1, 'pc-wcb'); add(a + 1, b, 'pc-wcin'); return; }
            const c = 'pc-d' + (d % 3);
            mark(a, a + 1, c); mark(b, b + 1, c);
        });
        // A weight: :1.2 just before a closing bracket.
        re = /:\s*-?\d*\.?\d+(?=\s*[)\]])/g;
        while ((m = re.exec(t))) if (!taken[m.index]) mark(m.index, m.index + m[0].length, 'pc-wt');
        re = /\|/g;
        // A pipe inside a choice takes the choice's color (pc-wcin, set above).
        while ((m = re.exec(t))) if (!taken[m.index]) mark(m.index, m.index + 1, /\bpc-wcin\b/.test(cls[m.index]) ? 'pc-pipe pc-wcin' : 'pc-pipe');
        re = /,/g;
        while ((m = re.exec(t))) if (!taken[m.index]) mark(m.index, m.index + 1, 'pc-cm');
        // [tag:0.5]: one tag and a number in square brackets. Its wavy line goes on one span around the colored parts, so
        // it doesn't break where they meet.
        re = /\[[^\[\]:|\n]+:\s*\d*\.?\d+\s*\]/g;
        const warnAt = new Uint8Array(n + 1);
        while ((m = re.exec(t))) { warnAt[m.index] = 1; warnAt[m.index + m[0].length] |= 2; }
        let h = '', cur = '', buf = '';
        const flush = () => { if (buf) h += cur ? `<span class="${cur}">${buf}</span>` : buf; buf = ''; };
        for (let i = 0; i <= n; i++) {
            if (warnAt[i] & 2) { flush(); h += '</span>'; }
            if (warnAt[i] & 1) { flush(); h += '<span class="pc-warn">'; }
            if (i === n) break;
            if (cls[i] !== cur) { flush(); cur = cls[i]; }
            buf += esc(t[i]);
        }
        flush();
        return h + '\n';
    }

    // paint() as HTML for one line or text shown elsewhere (the LIST view, Analyze, the Prompt Guide), without the layer's last newline.
    const html = (t, perLine) => paint(String(t || ''), !!perLine).replace(/\n$/, '');
    const COPY = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent', 'textTransform', 'tabSize',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius', 'boxSizing', 'textAlign', 'wordBreak', 'overflowWrap'];
    const boxes = new Set();
    const valueDesc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    let ro = null, mo = null;
    // Text put in by the app (a style, a wildcard, a restore) sets .value without an input event.
    Object.defineProperty(HTMLTextAreaElement.prototype, 'value', { ...valueDesc, set(x) { valueDesc.set.call(this, x); if (this._pcView) soon(this); } });
    // The layer's font size, checked against how wide the box itself draws text. The same font and size can still draw
    // wider in the layer than in the box: Android's WebView can enlarge page text (the phone's font size, text
    // autosizing) but never a text box. The caret then falls behind the colored text as a line grows, and the colored
    // text wraps lower than the box's own (taps below the box's last line find no text). Measured once per font: the
    // growth of one line, so the box's fixed caret room doesn't count; within 0.4% it's left as it is.
    const fitted = new Map();
    const UNIT = 'masterpiece, best quality, 1girl, (looking at viewer:1.2), ';
    function fittedSize(ta, v, cs) {
        const key = [cs.fontFamily, cs.fontSize, cs.fontWeight, cs.fontStyle, cs.letterSpacing, cs.wordSpacing, window.innerWidth].join('|');
        if (fitted.has(key)) return fitted.get(key);
        const base = parseFloat(cs.fontSize);
        let size = cs.fontSize;
        try {
            const box = ta.cloneNode(false);
            box.removeAttribute('id');
            box.setAttribute('wrap', 'off');
            box.setAttribute('aria-hidden', 'true');
            box.tabIndex = -1;
            Object.assign(box.style, { position: 'absolute', left: '0', top: '0', visibility: 'hidden', pointerEvents: 'none', whiteSpace: 'pre', width: '40px', height: '30px', overflow: 'scroll' });
            ta.parentElement.appendChild(box);
            const boxWidth = s => { valueDesc.set.call(box, s); return box.scrollWidth; };
            const boxGrowth = boxWidth(UNIT.repeat(6)) - boxWidth(UNIT);
            box.remove();
            const span = document.createElement('span');
            span.style.whiteSpace = 'pre';
            v.appendChild(span);
            const layerGrowth = () => { span.textContent = UNIT.repeat(6); const a = span.getBoundingClientRect().width; span.textContent = UNIT; return a - span.getBoundingClientRect().width; };
            let ratio = boxGrowth > 0 ? layerGrowth() / boxGrowth : 1;
            const first = ratio;
            // Corrected, then measured again (an enlargement isn't always in proportion to the size asked for).
            for (let i = 0; i < 3 && boxGrowth > 0 && Math.abs(ratio - 1) > 0.004; i++) {
                const now = parseFloat(v.style.fontSize || cs.fontSize);
                v.style.fontSize = (now / ratio).toFixed(3) + 'px';
                ratio = layerGrowth() / boxGrowth;
            }
            span.remove();
            if (Math.abs(first - 1) > 0.004) {
                size = v.style.fontSize;
                if (window.dbg) window.dbg(`prompt colors: the layer drew text x${first.toFixed(3)} the box's width (${cs.fontSize} ${cs.fontFamily.split(',')[0]}); set to ${size}, now x${ratio.toFixed(3)}`);
            }
        } catch (e) {
            size = base + 'px';
        }
        fitted.set(key, size);
        return size;
    }
    // Measured again when anything could change it: the window's size, the web fonts arriving after start-up, and a box
    // being focused to type in (cheap: two measurements).
    window.addEventListener('resize', () => fitted.clear());
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { fitted.clear(); boxes.forEach(soon); });

    // Lines the layer up with its box (size, place, scroll) and copies how the box draws text.
    function place(ta) {
        const v = ta._pcView;
        if (!v) return;
        if (!ta.offsetParent) { v.style.display = 'none'; return; }
        // The box moved into another parent (a SHOW ALL wrap, cfg.js capPill()): the layer goes with it.
        const parent = ta.parentElement;
        if (parent && v.parentElement !== parent) {
            if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
            parent.appendChild(v);
            if (ro) ro.observe(parent);
        }
        v.style.display = '';
        const cs = getComputedStyle(ta);
        COPY.forEach(k => { v.style[k] = cs[k]; });
        v.style.fontSize = fittedSize(ta, v, cs);
        v.style.left = ta.offsetLeft + 'px';
        v.style.top = ta.offsetTop + 'px';
        v.style.width = ta.offsetWidth + 'px';
        v.style.height = ta.offsetHeight + 'px';
        // A scroll bar takes room from the box's text; the layer gives up the same.
        const bar = ta.offsetWidth - ta.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
        if (bar > 0) v.style.paddingRight = (parseFloat(cs.paddingRight) + bar) + 'px';
        // A box shown faded (the negative at CFG 1) fades its colors too.
        v.style.opacity = cs.opacity;
        v.classList.toggle('pc-muted', ta.classList.contains('neg-prompt-inert') || ta.disabled);
        v.scrollTop = ta.scrollTop;
    }
    function draw(ta) {
        const v = ta._pcView;
        if (!v) return;
        if (!ta.isConnected) { boxes.delete(ta); return; }
        const t = valueDesc.get.call(ta);
        if (t !== ta._pcLast) { ta._pcLast = t; v.innerHTML = paint(t, WC_TEXT.has(ta.id)); }
        place(ta);
    }
    const queue = new Set();
    let raf = 0;
    function soon(ta) { queue.add(ta); if (!raf) raf = requestAnimationFrame(() => { raf = 0; const q = [...queue]; queue.clear(); q.forEach(draw); }); }
    function attach(ta) {
        if (ta._pcView || !ta.id || !BOX.test(ta.id)) return;
        const parent = ta.parentElement;
        if (!parent) return;
        if (getComputedStyle(parent).position === 'static') { parent.style.position = 'relative'; ta._pcParentPos = true; }
        const v = document.createElement('div');
        v.className = 'pc-view';
        v.setAttribute('aria-hidden', 'true');
        // At the end of the box's parent, out of the way of what the app keeps just after the box (the BACKGROUND tag,
        // LoRA sliders); placed over the box by position.
        parent.appendChild(v);
        ta._pcView = v;
        ta.classList.add('pc-on');
        // A box with its own .value (LoRA sliders, scene.js): that one wrapped too, as the prototype's is (below).
        const own = Object.getOwnPropertyDescriptor(ta, 'value');
        if (own && own.set && !ta._pcOwn) {
            ta._pcOwn = own;
            Object.defineProperty(ta, 'value', { configurable: true, enumerable: own.enumerable, get: own.get, set(x) { own.set.call(this, x); if (this._pcView) soon(this); } });
        }
        // Typing redraws the colored text at once, in the same frame as the caret moves; on the next frame it would
        // trail the caret on every key. (The box is already fitted by then: auto-grow's listener runs first, cfg.js.)
        ta._pcIn = () => { queue.delete(ta); draw(ta); };
        ta._pcFocus = () => { fitted.clear(); queue.delete(ta); draw(ta); };
        ta._pcScroll = () => { v.scrollTop = ta.scrollTop; };
        ta.addEventListener('input', ta._pcIn);
        ta.addEventListener('scroll', ta._pcScroll, { passive: true });
        ta.addEventListener('focus', ta._pcFocus);
        if (ro) { ro.observe(ta); ro.observe(parent); }
        if (mo) mo.observe(ta, { attributes: true, attributeFilter: ['class', 'disabled', 'style'] });
        boxes.add(ta);
        draw(ta);
    }
    function detach(ta) {
        if (!ta._pcView) return;
        ta._pcView.remove();
        delete ta._pcView;
        ta.classList.remove('pc-on');
        ta.removeEventListener('input', ta._pcIn);
        ta.removeEventListener('scroll', ta._pcScroll);
        ta.removeEventListener('focus', ta._pcFocus);
        if (ta._pcParentPos) { ta.parentElement.style.position = ''; delete ta._pcParentPos; }
        delete ta._pcLast;
        boxes.delete(ta);
    }
    function scan(root) {
        if (!on()) return;
        (root && root.querySelectorAll ? root : document).querySelectorAll('textarea[id]').forEach(attach);
        if (root && root.tagName === 'TEXTAREA') attach(root);
    }
    function apply() {
        if (on()) { scan(document); boxes.forEach(soon); } else [...boxes].forEach(detach);
        // The Wildcards editor's LIST view draws its options with these colors too.
        if (window.WcList && document.getElementById('wcListRows')) try { WcList.paint(); } catch (e) { }
    }
    window.togglePromptColors = function (v) {
        localStorage.setItem(KEY, v ? 'true' : 'false');
        apply();
    };
    window.openPromptColorsHelp = function (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        const m = document.getElementById('promptColorsHelpModal');
        if (m) m.classList.remove('hidden');
    };
    window.closePromptColorsHelp = function () { document.getElementById('promptColorsHelpModal')?.classList.add('hidden'); };
    // The Prompt Guide: its examples colored as the prompt boxes are (whether or not the setting is on).
    window.openPromptGuide = function (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        const m = document.getElementById('promptGuideModal');
        if (!m) return;
        m.querySelectorAll('.pg-ex').forEach(x => { if (!x.dataset.done) { x.innerHTML = html(x.dataset.ex, false); x.classList.add('pc-text'); x.dataset.done = '1'; } });
        if (m.classList.contains('hidden') && typeof lockBodyScroll === 'function') lockBodyScroll();
        m.classList.remove('hidden');
        const g = m.querySelector('.wc-guide');
        if (g) g.scrollTop = 0;
    };
    window.closePromptGuide = function () {
        const m = document.getElementById('promptGuideModal');
        if (!m || m.classList.contains('hidden')) return;
        m.classList.add('hidden');
        if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
    };
    window.PromptColors = { paint, html, on, apply, refresh: () => boxes.forEach(soon) };
    function start() {
        const sw = document.getElementById('cfgPromptColorsSwitch');
        if (sw) sw.checked = on();
        // A box's class or style changing (faded, shown) without a resize.
        mo = new MutationObserver(ms => ms.forEach(mu => { if (mu.target._pcView) soon(mu.target); }));
        if (window.ResizeObserver) ro = new ResizeObserver(entries => entries.forEach(en => { const t = en.target; if (t.tagName === 'TEXTAREA') soon(t); else t.querySelectorAll(':scope > textarea.pc-on').forEach(soon); }));
        apply();
        // Boxes made later (LoRA and style editors, Forge Couple regions, More Settings).
        new MutationObserver(ms => { if (!on()) return; ms.forEach(mu => mu.addedNodes.forEach(nd => { if (nd.nodeType === 1) scan(nd); })); }).observe(document.body, { childList: true, subtree: true });
        // Sections opening and closing move boxes without resizing them.
        document.addEventListener('click', () => { if (boxes.size) setTimeout(() => boxes.forEach(soon), 0); }, true);
        window.addEventListener('resize', () => boxes.forEach(soon));
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { boxes.forEach(ta => { delete ta._pcLast; soon(ta); }); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
