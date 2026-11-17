// The prompt colors of the app (www/js/promptcolors.js, Resolver v3.0), copied unchanged: paint() gives the same colored
// spans as the app's prompt boxes. Used by the Prompting page's playground and the colored examples.
(function () {
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
    window.PromptPaint = { html };
})();
