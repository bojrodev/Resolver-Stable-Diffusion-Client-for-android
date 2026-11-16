// Import Wildcards window: from files, a URL, a Civitai link or a saved library link (CHECK looks for updates to those),
// then a preview (new; same name: replace, merge or keep; the same) before anything is saved. Content is only ever data:
// names cleaned, shown as text, never run.
(function () {
    const LINKS_KEY = 'bojroWcLinks', SAME_KEY = 'bojroWcImportSame', SEEN_KEY = 'bojroWcLinkSeen';
    // Bungles' library, there until removed.
    const BUNGLES = 'https://raw.githubusercontent.com/Bungles/resolver-wildcards/refs/heads/main/library.json';
    const DEFAULT_LINKS = [{ name: 'Bungles library', url: BUNGLES }];
    const MAX_BYTES = 10 * 1024 * 1024, TIMEOUT_MS = 20000;
    const $ = id => document.getElementById(id);
    const E = () => window.WcEngine;
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = text => { if (typeof Toast !== 'undefined') Toast.show({ text, duration: 'short' }); };
    const clean = n => String(n || '').toLowerCase().replace(/[\/\\]+/g, ' ').replace(/[^a-z0-9 _()-]/g, '').replace(/\s+/g, ' ').trim();

    // ---- saved links ----
    function links() {
        // Saved before the library was published: its link filled in.
        try { const v = JSON.parse(localStorage.getItem(LINKS_KEY)); if (Array.isArray(v)) return v.filter(l => l && typeof l.name === 'string' && typeof l.url === 'string').map(l => (l.name === 'Bungles library' && !l.url ? { ...l, url: BUNGLES } : l)); } catch (e) {}
        return DEFAULT_LINKS.map(l => ({ ...l }));
    }
    const saveLinks = ls => { try { localStorage.setItem(LINKS_KEY, JSON.stringify(ls)); } catch (e) {} };
    const okUrl = u => /^https:\/\/[^\s]+$/i.test(u);
    function paintLinks() {
        const box = $('wiLinks');
        const ls = links();
        box.innerHTML = '';
        // The app's own starter set (wildcards.js), always there.
        const own = document.createElement('div');
        own.className = 'inset-card wi-link';
        own.innerHTML = `<div class="wi-link-main"><div class="wi-link-name">Starter set</div><div class="wi-link-url">Built in • ${Wildcards.defaults().length} wildcards</div></div><button type="button" class="btn-small" style="flex: 0 0 auto;">LOAD</button>`;
        own.insertAdjacentHTML('beforeend', '<button type="button" class="wc-x" style="margin-left: 0;" aria-label="Uninstall the Starter set">×</button>');
        const [ownLoad, ownX] = own.querySelectorAll('button');
        ownLoad.onclick = () => preview(Wildcards.defaults(), 'Starter set', '', { url: STARTER });
        ownX.onclick = () => uninstall(null);
        box.appendChild(own);
        ls.forEach((l, i) => {
            const row = document.createElement('div');
            row.className = 'inset-card wi-link';
            const where = l.url ? esc(l.url.replace(/^https:\/\//i, '')) : 'Not published yet';
            // After CHECK: what it found instead of the link.
            const c = l.url && checks.get(l.url);
            const line = !c ? where : c.upd ? `<span class="wi-upd">${esc(c.upd)}</span>${c.had ? ` • you have ${esc(c.had)}` : ''}`
                : c.ok !== undefined ? `<span class="wi-key-set">Up to date</span>${c.ok ? ` • ${esc(c.ok)}` : ''}` : esc(c.say);
            row.innerHTML = `<div class="wi-link-main"><div class="wi-link-name">${esc(l.name)}</div><div class="wi-link-url">${line}</div></div>`
                + `<button type="button" class="btn-small${c && c.upd ? ' wi-upd-btn' : ''}" style="flex: 0 0 auto;"${l.url ? '' : ' disabled'}>${c && c.upd ? 'UPDATE' : 'LOAD'}</button><button type="button" class="wc-x" style="margin-left: 0;" aria-label="Remove link">×</button>`;
            const [load, del] = row.querySelectorAll('button');
            load.onclick = () => fromUrl(c && c.load || l.url, l.name, l.url);
            del.onclick = () => uninstall(l);
            box.appendChild(row);
        });
        paintChecked();
    }
    // ---- updates: CHECK (only when tapped) ----
    // What each saved link gave when imported: { sets: {file: version} } (a library), { civ, civName } (Civitai), or
    // { hash, version } (a file); checks: url -> what CHECK found.
    const seen = () => { try { const v = JSON.parse(localStorage.getItem(SEEN_KEY)); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } };
    const saveSeen = v => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(v)); } catch (e) {} };
    const hash = t => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + t.length; };
    const checks = new Map();
    function remember(src) {
        if (!src || !src.url) return;
        const all = seen(), { url, ...rec } = src;
        // The wildcards this import brought in (for Uninstall), added to any from earlier imports of the same link.
        const names = pending && pending.src === src ? packNames() : null;
        if (names) rec.names = { ...((all[url] && all[url].names) || {}), ...names };
        else if (all[url] && all[url].names) rec.names = all[url].names;
        all[url] = { ...rec, at: Date.now() };
        saveSeen(all);
        checks.delete(url);
    }
    let checkedAt = 0, checking = false;
    const why = e => { const m = String((e && e.message) || e || ''); return e && e.name === 'AbortError' || /timed out/i.test(m) ? 'timed out' : /HTTP 404|no such/i.test(m) ? 'not found'
        : /login|API key|HTTP 40[13]/i.test(m) ? 'needs a login' : /HTTP \d+/.test(m) ? m.match(/HTTP \d+/)[0] : e instanceof TypeError ? 'no connection' : m.slice(0, 40) || 'error'; };
    // Where a Civitai link is looked up: civitai.red for its links (mature content since the split), else civitai.com.
    const civApi = url => (/^https:\/\/(www\.)?civitai\.red\//i.test(String(url)) ? 'https://civitai.red' : 'https://civitai.com');
    // A Civitai link's newest version: { id, name, page }.
    async function civNewest(url) {
        const u = new URL(url), dl = u.pathname.match(/^\/api\/download\/models\/(\d+)/), m = u.pathname.match(/^\/models\/(\d+)/);
        let id = m && m[1];
        if (!id) {
            const vid = dl ? dl[1] : '';
            if (!vid) throw new Error('not a model link');
            id = JSON.parse((await civGet(`${civApi(url)}/api/v1/model-versions/${vid}`, 'text', 'header')).data).modelId;
        }
        // The newest version with a wildcard file (as an import takes them).
        const vs = JSON.parse((await civGet(`${civApi(url)}/api/v1/models/${id}`, 'text', 'header')).data).modelVersions || [];
        const v = vs.find(x => Array.isArray(x.files) && x.files.some(f => WC_EXT.test(f.name || ''))) || vs[0];
        if (!v) throw new Error('no versions');
        return { id: v.id, name: String(v.name || '').slice(0, 40), page: `${civApi(url)}/models/${id}` };
    }
    // { upd: text, had, load } / { ok: version } / { say: text }.
    async function checkOne(l) {
        const rec = seen()[l.url];
        if (!rec) return { say: 'Not loaded with this app yet' };
        try {
            if (rec.civ) {
                const c = await civNewest(l.url);
                return String(c.id) === String(rec.civ) ? { ok: c.name } : { upd: `${c.name || 'A new version'} available`, had: rec.civName, load: c.page };
            }
            const text = await get(l.url), lib = library(text);
            const vs = rec.sets ? Object.entries(rec.sets).filter(([, v]) => v) : [];
            if (lib && vs.length) {
                for (const [file, v] of vs) { const x = lib.sets.find(y => y.file === file); if (x && x.version && x.version !== v) return { upd: `${x.version} available`, had: v }; }
                return { ok: vs[0][1] };
            }
            if (rec.hash && hash(text) !== rec.hash) return { upd: 'Changed since you loaded it' };
            return { ok: rec.version || '' };
        } catch (e) { return { say: `Couldn't check (${why(e)})` }; }
    }
    async function check() {
        if (checking) return;
        const ls = links().filter(l => l.url);
        if (!ls.length) return;
        checking = true;
        paintChecked();
        try {
            const got = await Promise.all(ls.map(l => checkOne(l)));
            ls.forEach((l, k) => checks.set(l.url, got[k]));
            checkedAt = Date.now();
        } finally { checking = false; paintLinks(); }
    }
    function paintChecked() {
        const b = $('wiCheckBtn'), t = $('wiChecked');
        if (!b) return;
        b.classList.toggle('hidden', !links().some(l => l.url));
        b.disabled = checking;
        const min = Math.floor((Date.now() - checkedAt) / 60000);
        t.textContent = checking ? 'Checking…' : !checkedAt ? '' : min < 1 ? 'Checked just now' : `Checked ${min} min ago`;
    }
    function showAdd(on) {
        $('wiAddForm').classList.toggle('hidden', !on);
        $('wiAddBtn').classList.toggle('hidden', on);
        clearTimeout(nameTimer); named = ''; looking = null;
        $('wiAddName').placeholder = 'Name';
        if (on) {
            $('wiAddName').value = ''; $('wiAddUrl').value = '';
            // No box takes the focus, so the keyboard waits for a tap.
            addInView();
            // Again once the keyboard is up (it may cover them).
            setTimeout(addInView, 400);
        }
    }
    // The ADD LINK form's buttons in sight: nothing moves when they are; else at once, just far enough.
    function addInView() {
        const f = $('wiAddForm');
        if (!f || f.classList.contains('hidden')) return;
        const list = $('wiSources'), lr = list ? list.getBoundingClientRect() : { top: 0, bottom: Infinity };
        const h = Math.min(window.visualViewport ? window.visualViewport.height : window.innerHeight, lr.bottom), r = f.getBoundingClientRect();
        if (list && r.bottom > h - 8) list.scrollTop += r.bottom - (h - 8);
        else if (r.bottom > h - 8 || r.top < Math.max(0, lr.top)) f.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => addInView());
    // ---- a new link's name, from the link: named = the one filled in (replaced when the link changes) ----
    let named = '', looking = null, nameTimer = 0;
    const fileOf = url => { try { return decodeURIComponent(new URL(url).pathname.split('/').pop() || ''); } catch (e) { return ''; } };
    const plainName = url => fileOf(url).replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
    // { name, from } or null.
    async function nameOf(url) {
        if (isCivitai(url)) {
            const u = new URL(url), dl = u.pathname.match(/^\/api\/download\/models\/(\d+)/), m = u.pathname.match(/^\/models\/(\d+)(?:\/([^/?#]+))?/);
            const vid = dl ? dl[1] : u.searchParams.get('modelVersionId');
            try {
                if (!dl && !m) return null;
                const info = JSON.parse((await civGet(vid && /^\d+$/.test(vid) ? `${civApi(url)}/api/v1/model-versions/${vid}` : `${civApi(url)}/api/v1/models/${m[1]}`, 'text', 'header')).data);
                const n = String((vid ? info.model && info.model.name : info.name) || '').trim();
                if (n) return { name: n, from: 'Civitai' };
            } catch (e) {}
            const slug = m && m[2] ? m[2].replace(/[-_]+/g, ' ').trim() : '';
            return slug ? { name: slug, from: 'the link' } : null;
        }
        if (/\.json$/i.test(fileOf(url))) {
            try {
                const j = JSON.parse(await get(url));
                if (j && typeof j.name === 'string' && j.name.trim()) return { name: j.name.trim(), from: j.type === 'wildcard-library' ? 'the library' : 'the file' };
            } catch (e) {}
        }
        const n = plainName(url);
        return n ? { name: n, from: 'the file name' } : null;
    }
    function lookUp() {
        const url = $('wiAddUrl').value.trim(), box = $('wiAddName');
        if (!okUrl(url) || (box.value.trim() && box.value.trim() !== named)) return looking;
        box.value = ''; named = '';
        box.placeholder = 'Looking up the name…';
        const me = looking = nameOf(url).then(r => {
            if (me !== looking || $('wiAddUrl').value.trim() !== url) return;
            box.placeholder = 'Name';
            if (!r || box.value.trim()) return;
            box.value = named = r.name.slice(0, 40);
        });
        return me;
    }
    function nameSoon() { clearTimeout(nameTimer); nameTimer = setTimeout(lookUp, 600); }
    async function addLink() {
        const url = $('wiAddUrl').value.trim();
        if (!okUrl(url)) { await window.appAlert('Give it an https:// link.', { title: 'Add Link' }); return; }
        // No name yet: the lookup's, or the file name.
        if (!$('wiAddName').value.trim()) { clearTimeout(nameTimer); await (looking || lookUp()); }
        const name = $('wiAddName').value.trim() || plainName(url) || url.replace(/^https:\/\//i, '');
        saveLinks(links().concat([{ name: name.slice(0, 40), url }]));
        showAdd(false);
        paintLinks();
    }

    // ---- reading ----
    // Wildcards from a file's text: Resolver JSON (with an optional name and version), .yaml, or one .txt per wildcard.
    function parse(text, fileName) {
        const t = String(text).replace(/^﻿/, '');
        if (/\.json$/i.test(fileName) || /^\s*[\[{]/.test(t)) {
            const j = JSON.parse(t);
            // Not the app's own (a Dynamic Prompts tree of names): read like YAML.
            if (!Array.isArray(j) && !Array.isArray(j.wildcards)) return { list: foreign(WcAdvanced.treeToWildcards(j)), name: '', version: '' };
            const list = (Array.isArray(j) ? j : j.wildcards || []).filter(w => w && typeof w.name === 'string' && Array.isArray(w.lines))
                .map(w => ({ name: w.name, lines: w.lines.map(String), ...(w.inOrder ? { inOrder: true } : {}) }));
            return { list, name: !Array.isArray(j) && typeof j.name === 'string' ? j.name : '', version: !Array.isArray(j) && j.version != null ? String(j.version) : '' };
        }
        if (/\.ya?ml$/i.test(fileName)) return { list: foreign(WcAdvanced.parseYaml(t)), name: '', version: '' };
        return { list: foreign([{ name: fileName.replace(/^.*\//, '').replace(/\.[^.]+$/, ''), lines: t.split(/\r?\n/).map(l => l.trim()).filter(Boolean) }]), name: '', version: '' };
    }
    // ---- password-protected zips: WinZip AES (method 99) and the older ZipCrypto ----
    const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
    const crcStep = (c, b) => (CRC_T[(c ^ b) & 0xff] ^ (c >>> 8)) >>> 0;
    const crc32 = d => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = crcStep(c, d[i]); return (c ^ 0xffffffff) >>> 0; };
    // ZipCrypto: the data without its 12-byte header, or null when the header's check byte says the password is wrong.
    function zipCrypto(data, pw, check) {
        let k0 = 0x12345678, k1 = 0x23456789, k2 = 0x34567890;
        const upd = b => { k0 = crcStep(k0, b); k1 = (Math.imul((k1 + (k0 & 0xff)) >>> 0, 134775813) + 1) >>> 0; k2 = crcStep(k2, k1 >>> 24); };
        for (const b of pw) upd(b);
        const out = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) { const t = (k2 | 2) & 0xffff, c = data[i] ^ ((Math.imul(t, t ^ 1) >>> 8) & 0xff); out[i] = c; upd(c); }
        return data.length >= 12 && out[11] === check ? out.subarray(12) : null;
    }
    // WinZip AES (128 / 192 / 256): salt, 2-byte check, data, 10-byte HMAC-SHA1. Null when the password is wrong.
    async function zipAes(data, pw, strength) {
        const kl = [0, 16, 24, 32][strength] || 0, sl = kl / 2;
        if (!kl || data.length < sl + 12) return null;
        const S = crypto.subtle, salt = data.slice(0, sl), body = data.subarray(sl + 2, data.length - 10), mac = data.subarray(data.length - 10);
        const bits = new Uint8Array(await S.deriveBits({ name: 'PBKDF2', hash: 'SHA-1', salt, iterations: 1000 }, await S.importKey('raw', pw, 'PBKDF2', false, ['deriveBits']), (kl * 2 + 2) * 8));
        if (bits[kl * 2] !== data[sl] || bits[kl * 2 + 1] !== data[sl + 1]) return null;
        const sig = new Uint8Array(await S.sign('HMAC', await S.importKey('raw', bits.slice(kl, kl * 2), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']), body));
        for (let i = 0; i < 10; i++) if (sig[i] !== mac[i]) return null;
        // WinZip counts its AES-CTR blocks little-endian from 1 (WebCrypto counts big-endian): one block at a time.
        const key = await S.importKey('raw', bits.slice(0, kl), 'AES-CTR', false, ['encrypt']), out = new Uint8Array(body.length), zero = new Uint8Array(16);
        const n = Math.ceil(body.length / 16);
        for (let b0 = 0; b0 < n; b0 += 512) {
            const run = [];
            for (let b = b0; b < Math.min(n, b0 + 512); b++) {
                const ctr = new Uint8Array(16); let x = b + 1;
                for (let j = 0; j < 8 && x; j++) { ctr[j] = x & 0xff; x = Math.floor(x / 256); }
                run.push(S.encrypt({ name: 'AES-CTR', counter: ctr, length: 64 }, key, zero).then(ks => {
                    const k = new Uint8Array(ks), at = b * 16;
                    for (let j = 0; j < 16 && at + j < body.length; j++) out[at + j] = body[at + j] ^ k[j];
                }));
            }
            await Promise.all(run);
        }
        return out;
    }
    const wrongPw = () => Object.assign(new Error('wrong password'), { badPassword: true });
    // A .zip's files (stored or deflated), as [{ name, text }]. Password-protected ones: read with pw (a wrong one throws
    // { badPassword }); without it skipped and counted in out.locked (out.how: AES / ZipCrypto).
    async function unzip(buf, pw) {
        const v = new DataView(buf), u8 = new Uint8Array(buf), out = [];
        out.locked = 0; out.how = '';
        const key = pw ? new TextEncoder().encode(pw) : null;
        let end = -1;
        for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65558); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
        if (end < 0) throw new Error('not a zip');
        let at = v.getUint32(end + 16, true);
        const n = v.getUint16(end + 10, true), dec = new TextDecoder();
        for (let k = 0; k < n && v.getUint32(at, true) === 0x02014b50; k++) {
            let method = v.getUint16(at + 10, true);
            const flags = v.getUint16(at + 8, true), time = v.getUint16(at + 12, true), crc = v.getUint32(at + 16, true);
            const size = v.getUint32(at + 20, true), nameLen = v.getUint16(at + 28, true);
            const extra = v.getUint16(at + 30, true), note = v.getUint16(at + 32, true), local = v.getUint32(at + 42, true);
            const name = dec.decode(u8.subarray(at + 46, at + 46 + nameLen));
            // WinZip AES's extra field (0x9901): its strength and the real method.
            let aes = null;
            for (let e = at + 46 + nameLen, end2 = e + extra; e + 4 <= end2;) {
                const id = v.getUint16(e, true), len = v.getUint16(e + 2, true);
                if (id === 0x9901 && len >= 7) aes = { strength: u8[e + 8], method: v.getUint16(e + 9, true) };
                e += 4 + len;
            }
            at += 46 + nameLen + extra + note;
            if (name.endsWith('/') || !/\.(txt|ya?ml)$/i.test(name) || /(^|\/)(__MACOSX|\.)/.test(name)) continue;
            const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
            let raw = u8.subarray(start, start + size), plain = false;
            if (flags & 1) {
                if (!key) { out.locked++; out.how = method === 99 ? 'AES' : 'ZipCrypto'; continue; }
                if (method === 99) {
                    if (!aes) continue;
                    // The phone's AES has no 192-bit keys (7-Zip, WinRAR and WinZip use 256 or 128).
                    if (aes.strength === 2) throw said("This zip uses 192-bit AES, which can't be opened here.");
                    raw = await zipAes(raw, key, aes.strength); method = aes.method;
                }
                else { raw = zipCrypto(raw, key, flags & 8 ? (time >>> 8) & 0xff : crc >>> 24); plain = true; }
                if (!raw) throw wrongPw();
            }
            let data = raw;
            try {
                if (method === 8) data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
                else if (method !== 0) continue;
            } catch (e) { if (plain) throw wrongPw(); throw e; }
            // ZipCrypto's check byte lets 1 wrong password in 256 through: the file's CRC catches it.
            if (plain && crc32(data) !== crc) throw wrongPw();
            out.push({ name, text: dec.decode(data) });
        }
        return out;
    }
    // A zip's files; a password-protected one: passwords from the pack's Civitai page tried first, then asked for.
    // CANCEL throws { cancelled } (callers stop quietly).
    async function openZip(buf, { name = 'This zip', page = '', hints = [] } = {}) {
        const files = await unzip(buf);
        if (!files.locked) return files;
        if (window.dbg) dbg(`Zip ${name}: ${files.locked} file${files.locked === 1 ? '' : 's'} password-protected (${files.how})`);
        for (const h of hints) {
            try { const f = await unzip(buf, h); if (window.dbg) dbg(`Zip ${name}: opened with a password from its Civitai page`); return f; } catch (e) { if (!e.badPassword) throw e; }
        }
        if (hints.length && window.dbg) dbg(`Zip ${name}: ${hints.length} password${hints.length === 1 ? '' : 's'} from its Civitai page didn't work`);
        let err = '';
        try {
            for (;;) {
                const pw = await askPassword(name, page, err);
                if (pw == null) throw Object.assign(new Error('cancelled'), { cancelled: true });
                try { const f = await unzip(buf, pw); if (window.dbg) dbg(`Zip ${name}: opened with the password typed`); return f; } catch (e) { if (!e.badPassword) throw e; err = "That password didn't work."; }
            }
        } finally { $('wiPwText').value = ''; }
    }
    // Password Needed clear of the keyboard: moved up just far enough (not past the top); a screen too short for
    // that scrolls inside the window.
    function pwClear() {
        const m = $('wiPwModal'), box = m && m.querySelector('.modal-content');
        if (!box) return;
        box.style.maxHeight = ''; box.style.overflowY = '';
        if (m.classList.contains('hidden')) { box.style.transform = ''; return; }
        const vv = window.visualViewport, bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
        // Where it rests (without the move it may still be sliding through).
        const rest = () => { const t = getComputedStyle(box).transform, r = box.getBoundingClientRect(), y = t && t !== 'none' ? new DOMMatrix(t).m42 : 0; return { top: r.top - y, bottom: r.bottom - y, height: r.height }; };
        let r = rest();
        // Taller than the room left: as tall as that, scrolling inside.
        if (r.height > bottom - 20) { box.style.maxHeight = `${Math.max(160, bottom - 20)}px`; box.style.overflowY = 'auto'; r = rest(); }
        const over = r.bottom - (bottom - 12);
        box.style.transform = over > 0 ? `translateY(${-Math.min(over, Math.max(0, r.top - 8))}px)` : '';
    }
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', () => pwClear()); window.visualViewport.addEventListener('scroll', () => pwClear()); }
    // Password Needed: the password typed, or null (CANCEL / back). Never kept.
    function askPassword(name, page, err) {
        return new Promise(res => {
            const m = $('wiPwModal'), inp = $('wiPwText'), ok = $('wiPwOk');
            $('wiPwMsg').textContent = `${name} is password-protected by its author.${page ? " Authors often put the password on the pack's Civitai page." : ''}`;
            $('wiPwPage').classList.toggle('hidden', !page);
            $('wiPwPage').onclick = () => window.openExternalLink && window.openExternalLink(page);
            $('wiPwErr').textContent = err || '';
            if (!err) inp.value = '';
            // Hidden, not emptied: a wrong one comes back to be corrected (openZip() empties it when it's done).
            const done = v => { m.classList.add('hidden'); inp.onkeydown = null; pwClear(); res(v); };
            $('wiPwCancel').onclick = () => done(null);
            ok.onclick = () => { const v = inp.value; if (v) done(v); else inp.focus(); };
            inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); ok.onclick(); } };
            if (window.lucide) lucide.createIcons();
            m.classList.remove('hidden');
            pwClear();
            // Once the keyboard is up (resize events cover the rest).
            setTimeout(() => { inp.focus(); if (err) inp.select(); }, 60);
            setTimeout(pwClear, 450);
        });
    }
    // Passwords a Civitai description mentions ("password: x", "pw - x", "パスワード：x"), to try before asking.
    function pwHints(...html) {
        const t = html.map(h => String(h || '').replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')).join('\n');
        const out = new Set(), re = /(?<![a-z])(?:password|passwd|passcode|pass|pwd|pw|解凍パスワード|パスワード|解凍パス|密码|密碼)(?![a-z])\s*(?:is\s*)?[:：=\-–]?\s*["'「『“`]?([^\s"'」』”`<>]{1,64})/gi;
        for (const m of t.matchAll(re)) { const w = m[1].replace(/[.,;!)\]]+$/, ''); if (w) out.add(w); }
        return [...out].slice(0, 8);
    }
    // A zip's wildcards: named by their path, without a folder every file shares ("wildcards/").
    function fromZip(files) {
        const parts = files.map(f => f.name.split('/'));
        while (parts.length && parts.every(p => p.length > 1 && p[0] === parts[0][0])) parts.forEach(p => p.shift());
        return files.flatMap((f, i) => {
            const path = parts[i].join('/'), base = path.replace(/\.[^.\/]+$/, '');
            if (/\.ya?ml$/i.test(path)) { const dir = base.split('/').slice(0, -1).join(' '); return foreign(WcAdvanced.parseYaml(f.text).map(w => ({ ...w, name: (dir ? dir + ' ' : '') + w.name }))); }
            return foreign([{ name: base.split('/').join(' '), lines: f.text.split(/\r?\n/).map(l => l.trim()).filter(Boolean) }]);
        });
    }
    // __folder/name__ (Dynamic Prompts) as the app names it: __folder name__.
    const slashRefs = list => list.map(w => ({ ...w, lines: w.lines.map(l => String(l).replace(/__([^\s_/](?:(?!__)[^\n])*?)__/g, (m, n) => (n.indexOf('/') >= 0 ? `__${n.split('/').filter(Boolean).join(' ')}__` : m))) }));
    // ---- other apps' wildcards (Dynamic Prompts .txt, .yaml, .json) ----
    const foreign = list => list.map(w => ({ ...w, foreign: true }));
    // Emoticon tags keep their underscore (^_^, o_o, >_<).
    const EMOTE = /^[a-z0-9^>=;@-]_[a-z0-9^<=;@-]$/i;
    // One option as the app writes it: no comments or leftover YAML block markers, underscores as spaces (not in
    // __wildcards__, <lora:...> or ${...}), (smile1.5) as (smile:1.5), no trailing commas.
    function tidyOption(line) {
        let t = String(line);
        if (/^\s*#/.test(t)) return '';
        t = t.replace(/\s+#.*$/, '').replace(/#+\s*$/, '');
        t = t.replace(/^\s*[>|][-+]?(?:\s+|$)/, '');
        t = t.split(/(__(?:(?!__)[^\n])+?__|<[^<>]*>|\$\{[^}]*\})/).map((part, i) => (i % 2 ? part
            : part.split(',').map(tag => (EMOTE.test(tag.trim()) ? tag : tag.replace(/_/g, ' '))).join(','))).join('');
        t = t.replace(/\(([^():]*?[A-Za-z)\]])\s*(\d+\.\d+)\)/g, '($1:$2)');
        // A space after each comma (not between digits: 1,000).
        return t.replace(/\s+/g, ' ').replace(/\s+,/g, ',').replace(/,(?=[^\s\d])|(?<!\d),(?=\d)/g, ', ').replace(/^[\s,]+|[\s,]+$/g, '');
    }
    // Everything found, ready for the preview: folder references, __folder/name__ names, other apps' options tidied,
    // short references completed. The foreign mark goes.
    function prepare(found) {
        const lib = Wildcards._lib.read(), names = [...new Set(found.map(w => clean(w.name)).concat(lib.map(w => w.name)))];
        // __folder/*__ and __folder/**__ (any wildcard in that folder): a choice of each one, this import's or the library's.
        const glob = l => String(l).replace(/__([^\s_](?:(?!__)[^\n])*?)\/\*\*?__/g, (m, dir) => {
            const pre = clean(dir) + ' ', hits = names.filter(n => n.startsWith(pre));
            return hits.length ? `{${hits.map(n => `__${n}__`).join('|')}}` : m;
        });
        let out = slashRefs(found.map(w => ({ ...w, raw: w.raw || w.lines.slice(), lines: w.foreign ? w.lines.map(glob) : w.lines })));
        out = out.map(w => {
            if (!w.foreign) return w;
            const t = w.lines.map(tidyOption), keep = t.map((x, n) => (x ? n : -1)).filter(n => n >= 0);
            return { ...w, lines: keep.map(n => t[n]), raw: keep.map(n => w.raw[n]) };
        });
        // __casual__ where the set's wildcard is "outfits casual": the one name ending with it.
        const known = new Set(names.map(n => E().nameKey(n)));
        const ending = n => names.filter(x => x.endsWith(' ' + n));
        out = out.map(w => (!w.foreign ? w : { ...w, lines: w.lines.map(l => l.replace(new RegExp(E().CALL.source, 'g'), (m, n) => {
            if (known.has(E().nameKey(n)) || /\$\{/.test(n)) return m;
            const e = ending(clean(n));
            return e.length === 1 ? m.replace(n, e[0]) : m;
        })) }));
        return out.map(({ foreign: f, ...w }) => w);
    }
    async function fromFiles(files) {
        const found = [];
        let cancelled = false;
        let one = null;
        for (const f of files) {
            if (f.size > (/\.zip$/i.test(f.name) ? MAX_BYTES * 5 : MAX_BYTES)) { toast(`${f.name} is too big`); continue; }
            try {
                if (/\.zip$/i.test(f.name)) { one = { list: fromZip(await openZip(await f.arrayBuffer(), { name: f.name })), name: f.name.replace(/\.zip$/i, ''), version: '' }; found.push(...one.list); }
                else { one = parse(await f.text(), f.name); found.push(...one.list); }
            } catch (e) { if (e && e.cancelled) cancelled = true; else toast(`Couldn't read ${f.name}`); }
        }
        if (cancelled && !found.length) return;
        found.splice(0, found.length, ...prepare(found));
        // One library file: its own name and version.
        const single = files.length === 1 && one;
        preview(found, single && one.name ? one.name : files.length === 1 ? files[0].name : `${files.length} files`, single ? one.version : '');
    }
    // The size a server gives for a link (a HEAD request), or 0 when it doesn't say.
    async function sizeOf(url) {
        try {
            const http = typeof CapacitorHttp !== 'undefined' && CapacitorHttp;
            const r = http ? await Promise.race([http.request({ url, method: 'HEAD', connectTimeout: TIMEOUT_MS, readTimeout: TIMEOUT_MS }), new Promise((_, no) => setTimeout(() => no(new Error('timed out')), TIMEOUT_MS))])
                : await fetch(url, { method: 'HEAD' });
            const h = r.headers || {};
            const v = typeof h.get === 'function' ? h.get('content-length') : h[Object.keys(h).find(k => k.toLowerCase() === 'content-length')];
            return Number(v) || 0;
        } catch (e) { return 0; }
    }
    async function get(url) {
        if ((await sizeOf(url)) > MAX_BYTES) throw new Error('the file is too big');
        const http = typeof CapacitorHttp !== 'undefined' && CapacitorHttp;
        if (http) {
            const r = await Promise.race([http.get({ url, responseType: 'text', readTimeout: TIMEOUT_MS, connectTimeout: TIMEOUT_MS }),
                new Promise((_, no) => setTimeout(() => no(new Error('timed out')), TIMEOUT_MS + 1000))]);
            if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
            return typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
        }
        const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
            const r = await fetch(url, { signal: ctrl.signal });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return await r.text();
        } finally { clearTimeout(timer); }
    }
    // ---- Civitai (Config > Connection: an API key, used only when Civitai asks for a login) ----
    const CIVITAI_KEY = 'bojroCivitaiKey';
    const civKey = () => { try { return (localStorage.getItem(CIVITAI_KEY) || '').trim(); } catch (e) { return ''; } };
    function saveKey(v) {
        const k = String(v || '').trim();
        try { if (k) localStorage.setItem(CIVITAI_KEY, k); else localStorage.removeItem(CIVITAI_KEY); } catch (e) {}
        paintKey();
    }
    function showKey() {
        const i = $('cfgCivitaiKey'), b = $('cfgCivitaiKeyShow');
        if (!i) return;
        i.type = i.type === 'password' ? 'text' : 'password';
        if (b) b.textContent = i.type === 'password' ? 'SHOW' : 'HIDE';
    }
    function paintKey() {
        const i = $('cfgCivitaiKey');
        if (i && document.activeElement !== i) i.value = civKey();
    }
    // Model files, never wildcards; the files that can be.
    const MODEL_EXT = /\.(safetensors|sft|ckpt|pt|pth|bin|onnx|gguf|pkl|h5|tflite|engine)$/i, WC_EXT = /\.(zip|txt|ya?ml|json)$/i;
    // Civitai's model types that aren't wildcards, as people call them.
    const NOT_WC = { checkpoint: 'checkpoint', lora: 'LoRA', locon: 'LyCORIS (LoCon)', dora: 'DoRA', textualinversion: 'textual inversion (embedding)',
        hypernetwork: 'hypernetwork', aestheticgradient: 'aesthetic gradient', controlnet: 'ControlNet model', upscaler: 'upscaler',
        motionmodule: 'motion module', vae: 'VAE', poses: 'pose pack', workflows: 'workflow', detection: 'detection (ADetailer) model' };
    const aOr = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
    // Any of Civitai's domains (civitai.com, .green, .red...): only the link's path is used, asked of civitai.com.
    const isCivitai = u => /^https:\/\/(www\.)?civitai\.[a-z]{2,}\//i.test(u);
    const said = text => Object.assign(new Error(text), { said: true });
    const b64Bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    // One request: { status, type, name (from Content-Disposition), data (text, or bytes for 'bytes') }. key: as an
    // Authorization header ('header') or Civitai's token parameter ('query').
    async function civRaw(url, kind, key, how) {
        let u = url;
        const headers = {};
        if (key && how === 'query') u += (u.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(key);
        else if (key) headers.Authorization = `Bearer ${key}`;
        const http = typeof CapacitorHttp !== 'undefined' && CapacitorHttp;
        const head = (h, n) => { if (!h) return ''; if (typeof h.get === 'function') return h.get(n) || ''; const k = Object.keys(h).find(x => x.toLowerCase() === n); return k ? String(h[k]) : ''; };
        const fileOf = cd => { const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd || ''); return m ? decodeURIComponent(m[1]) : ''; };
        if (http) {
            const r = await Promise.race([http.get({ url: u, headers, responseType: kind === 'bytes' ? 'arraybuffer' : 'text', readTimeout: TIMEOUT_MS * 3, connectTimeout: TIMEOUT_MS }),
                new Promise((_, no) => setTimeout(() => no(new Error('timed out')), TIMEOUT_MS * 3 + 1000))]);
            let data = r.data;
            if (kind === 'bytes') data = typeof data === 'string' ? b64Bytes(data) : data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(0);
            else if (typeof data !== 'string') data = JSON.stringify(data);
            return { status: r.status, type: head(r.headers, 'content-type'), name: fileOf(head(r.headers, 'content-disposition')), data };
        }
        const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS * 3);
        try {
            const r = await fetch(u, { headers, signal: ctrl.signal });
            const data = kind === 'bytes' ? new Uint8Array(await r.arrayBuffer()) : await r.text();
            return { status: r.status, type: r.headers.get('content-type') || '', name: fileOf(r.headers.get('content-disposition')), data };
        } finally { clearTimeout(timer); }
    }
    // Without the key first; with it only when Civitai asks for a login (a 401 / 403, or its login page instead of a file).
    // Refused by civitai.com: tried once on civitai.red (mature content since Civitai's split).
    const civWhere = u => { try { const x = new URL(u); return x.host + x.pathname; } catch (e) { return String(u).slice(0, 80); } };
    async function civGet(url, kind, how) {
        try { return await civGetOn(url, kind, how); } catch (e) {
            const alt = String(url).replace(/^https:\/\/(www\.)?civitai\.com\//i, 'https://civitai.red/');
            if (!e.refused || alt === url) throw e;
            if (window.dbg) dbg(`Civitai: civitai.com refused ${civWhere(url)}, trying civitai.red`);
            // civitai.red no better (or not reachable): what civitai.com said.
            try { return await civGetOn(alt, kind, how); } catch (e2) { if (window.dbg) dbg(`Civitai: civitai.red: ${(e2 && e2.message) || e2}`); throw e; }
        }
    }
    async function civGetOn(url, kind, how) {
        const page = r => kind === 'bytes' && /text\/html/i.test(r.type);
        const login = r => r.status === 401 || r.status === 403 || page(r);
        // Civitai's own words (a JSON error or a short text), never more than a line.
        const reason = r => {
            if (/text\/html/i.test(r.type)) return '';
            // A download's reply is bytes: read as text only when Civitai said it's JSON or text.
            let t = kind !== 'bytes' ? String(r.data || '') : r.data instanceof Uint8Array && /json|text\/plain/i.test(r.type) ? new TextDecoder().decode(r.data.slice(0, 2000)) : '';
            try { const j = JSON.parse(t); t = (j && (j.error || j.message || (j.error && j.error.message))) || ''; if (typeof t !== 'string') t = JSON.stringify(t); } catch (e) {}
            return t.replace(/\s+/g, ' ').trim().slice(0, 160);
        };
        const note = (r, keyed) => { if (window.dbg) dbg(`Civitai ${civWhere(url)}: HTTP ${r.status}, ${r.type || 'no type'}${keyed ? ', with the key' : ''}${reason(r) ? ` (${reason(r)})` : ''}`); };
        let r = await civRaw(url, kind, '', how);
        if (login(r)) {
            note(r, false);
            const k = civKey();
            if (!k) throw Object.assign(said('This pack needs a Civitai login: add your API key in Config › Connection.'), { login: true, refused: true });
            r = await civRaw(url, kind, k, how);
            // Refused with the key in the link: once more with it in the Authorization header.
            if (r.status === 403 && how === 'query') { note(r, true); if (window.dbg) dbg('Civitai: trying the key in the header'); r = await civRaw(url, kind, k, 'header'); }
            if (login(r)) {
                note(r, true);
                const why = reason(r);
                throw Object.assign(said(r.status === 401 ? "Civitai didn't accept the API key. Check it in Config › Connection."
                    : page(r) ? 'Civitai sent its sign-in page instead of the file.' : `Civitai refused this download${why ? `: "${why}"` : ' (early access, or a setting on your Civitai account)'}.`), { refused: true });
            }
        }
        if (r.status === 404) { note(r, false); throw Object.assign(said('Civitai has no such model or file.'), { refused: true }); }
        if (r.status >= 400) { note(r, false); throw new Error(`HTTP ${r.status}`); }
        return r;
    }
    // A Civitai link looked up: the pack and its versions with wildcards (a model page; newest first), or the one version
    // a link names (?modelVersionId=, a download link).
    async function civInfo(url) {
        const u = new URL(url);
        const dl = u.pathname.match(/^\/api\/download\/models\/(\d+)/), m = u.pathname.match(/^\/models\/(\d+)/);
        if (!dl && !m) throw said('Paste a Civitai model page or download link.');
        // A download link is looked up by its version first, so what it is can be checked before anything comes down.
        const vid = dl ? dl[1] : u.searchParams.get('modelVersionId');
        const r = await civGet(vid && /^\d+$/.test(vid) ? `${civApi(url)}/api/v1/model-versions/${vid}` : `${civApi(url)}/api/v1/models/${m[1]}`, 'text', 'header');
        let info;
        try { info = JSON.parse(r.data); } catch (e) { throw new Error('unreadable reply from Civitai'); }
        const type = String((vid ? info.model && info.model.type : info.type) || '').toLowerCase();
        if (type && type !== 'wildcards' && type !== 'other') throw said(`This is ${aOr(NOT_WC[type] || type)}, not a wildcard pack.`);
        const mod = vid ? info.model || {} : info, adult = mod.nsfw === true || (Number(mod.nsfwLevel) || 0) >= 4;
        // A model page: its versions with a wildcard file (newest first, as Civitai lists them); a version link: that one.
        const all = vid ? [info] : (info.modelVersions || []), hasWc = v => Array.isArray(v.files) && v.files.some(x => WC_EXT.test(x.name || ''));
        const vers = vid ? all : all.filter(hasWc);
        return { url, info, vid, adult, mid: vid ? info.modelId : info.id, title: info.name || (info.model && info.model.name) || '', vers: vers.length ? vers : all.slice(0, 1) };
    }
    // One version's file to fetch: { url, name, title, civ, civName, page, hints }.
    function civPick(c, ver) {
        const { info, vid, adult, mid, url } = c;
        if (!ver || !Array.isArray(ver.files) || !ver.files.length) throw said('No file in this Civitai version.');
        const wc = x => WC_EXT.test(x.name || '');
        const f = ver.files.find(x => x.primary && wc(x)) || ver.files.find(wc) || ver.files.find(x => x.primary) || ver.files[0];
        if (MODEL_EXT.test(f.name || '')) throw said(`This file (${f.name}) is a model, not wildcards.`);
        if (f.name && !wc(f)) throw said('Only .zip, .txt, .yaml and .json files can be imported.');
        if (Number(f.sizeKB) * 1024 > MAX_BYTES * 5) throw said('This file is too big to be wildcards.');
        let file = f.downloadUrl || `https://civitai.com/api/download/models/${ver.id}`;
        if (adult || civApi(url) === 'https://civitai.red') file = file.replace(/^https:\/\/(www\.)?civitai\.com\//i, 'https://civitai.red/');
        return { url: file, name: f.name || '', title: c.title,
            civ: ver.id, civName: String(ver.name || '').slice(0, 40),
            // For a password-protected zip: its page (this version's, when there are several), and passwords its
            // description or version notes mention.
            page: mid ? `${adult ? 'https://civitai.red' : 'https://civitai.com'}/models/${mid}${vid || c.vers.length > 1 ? `?modelVersionId=${ver.id}` : ''}` : '',
            hints: pwHints(vid ? '' : info.description, ver.description) };
    }
    // A version's file, downloaded and read: { list, version, title } or { lib, title } (a library file).
    async function civRead(f, label) {
        const r = await civGet(f.url, 'bytes', 'query');
        const bytes = r.data, name = f.name || r.name || '';
        if (bytes.length > MAX_BYTES * 5) throw new Error('the file is too big');
        const title = label || f.title || name.replace(/\.[^.]+$/, '') || 'Civitai';
        if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
            const list = fromZip(await openZip(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { name: name || `${title}.zip`, page: f.page, hints: f.hints }));
            if (!list.length) throw said('No wildcard file in this pack.');
            return { list, version: '', title };
        }
        if (bytes.length > MAX_BYTES) throw new Error('the file is too big');
        const text = new TextDecoder().decode(bytes);
        if (/^\s*</.test(text)) throw said('Civitai sent a web page, not a file.');
        if (text.indexOf('\u0000') >= 0) throw said("This file isn't text, so it isn't wildcards.");
        const lib = library(text);
        if (lib) return { lib, title };
        const p = parse(text, name || (/^\s*[\[{]/.test(text) ? 'civitai.json' : 'civitai.txt'));
        if (!p.list.length) throw said('No wildcard file in this pack.');
        return { list: p.list, version: p.version, title };
    }
    async function fromCivitai(url, label, key) {
        const busy = toastBusy();
        try {
            const c = await civInfo(url);
            // Several versions (each often a set of its own): which to import, as a library's sets.
            if (c.vers.length > 1 && !capture) { showVersions(c, label, key); return; }
            const f = civPick(c, c.vers[0]);
            const src = { url: key || url, civ: f.civ, civName: f.civName };
            const got = await civRead(f, label);
            if (got.lib) { await showSets(got.lib, f.url, got.title, src); return; }
            preview(prepare(got.list), got.title, got.version, src);
        } catch (e) {
            if (e && e.cancelled) return;
            // No key set for a login pack: a toast.
            if (e && e.login && typeof Toast !== 'undefined') { busy(); Toast.show({ text: e.message, duration: 'long' }); return; }
            await window.appAlert(e && e.said ? e.message : `Couldn't load it: ${e && e.name === 'AbortError' ? 'timed out' : (e && e.message) || e}.`, { title: 'Civitai', danger: true });
        } finally { busy(); }
    }
    // key: the saved link it's for (UPDATE of a Civitai pack loads its newest version's page).
    async function fromUrl(url, label, key) {
        url = String(url || $('wiUrl').value).trim();
        if (isCivitai(url)) return fromCivitai(url, label, key);
        if (!okUrl(url)) { await window.appAlert('Paste an https:// link to a .json, .txt or .yaml file.', { title: 'From URL' }); return; }
        if (MODEL_EXT.test(url.split(/[?#]/)[0])) { await window.appAlert("This link is to a model file, not wildcards.", { title: 'From URL', danger: true }); return; }
        const busy = toastBusy();
        try {
            const text = await get(url);
            if (text.length > MAX_BYTES) throw new Error('the file is too big');
            if (text.indexOf('\u0000') >= 0) throw new Error("it isn't a text file");
            const lib = library(text);
            if (lib) { await showSets(lib, url, label, { url: key || url, hash: hash(text) }); return; }
            const plain = (() => { try { return decodeURIComponent(url.split(/[?#]/)[0]); } catch (e) { return url.split(/[?#]/)[0]; } })();
            const r = parse(text, plain);
            preview(prepare(r.list), label || r.name || url.replace(/^https:\/\//i, ''), r.version, { url: key || url, hash: hash(text), version: r.version || '' });
        } catch (e) {
            await window.appAlert(`Couldn't load it: ${e && e.name === 'AbortError' ? 'timed out' : (e && e.message) || e}.`, { title: 'From URL', danger: true });
        } finally { busy(); }
    }
    function toastBusy() {
        if (typeof Toast === 'undefined') return () => {};
        Toast.show({ text: 'Loading...', duration: 'long' });
        return () => { if (Toast.dismiss) Toast.dismiss('Loading...'); };
    }

    // ---- library: sets to pick from ----
    // library.json: { "type": "wildcard-library", "name", "sets": [{ "name", "file", "version", "count", "description" }] };
    // a set's file is next to library.json (or a full https:// link).
    let shelf = null;
    function library(text) {
        let j = null;
        try { j = JSON.parse(text); } catch (e) { return null; }
        if (!j || j.type !== 'wildcard-library' || !Array.isArray(j.sets)) return null;
        const sets = j.sets.filter(x => x && typeof x.file === 'string' && x.file.trim()).slice(0, 50).map(x => ({
            name: String(x.name || x.file).slice(0, 60), file: x.file.trim(), version: x.version ? String(x.version).slice(0, 20) : '',
            count: Number.isFinite(+x.count) && +x.count > 0 ? Math.round(+x.count) : 0, description: String(x.description || '').slice(0, 200) }));
        return sets.length ? { name: String(j.name || '').slice(0, 60), sets } : null;
    }
    // A Civitai pack's versions to pick from (the newest ticked): name, date, size.
    function showVersions(c, label, key) {
        const lib = { name: label || c.title, sets: c.vers.map(v => ({ name: String(v.name || `Version ${v.id}`), description: [day(v.publishedAt), packSize(v)].filter(Boolean).join(' • '), civVer: v })) };
        showSets(lib, c.url, label || c.title, { url: key || c.url, civ: c.vers[0].id, civName: String(c.vers[0].name || '').slice(0, 40) });
        if (shelf) shelf.civ = c;
    }
    function showSets(lib, url, label, src) {
        if (capture) return captureSets(lib, url);
        if (cs.viewing) { cs.viewing = false; csPark(); }
        shelf = { lib, url, src, from: lib.name || label || url.replace(/^https:\/\//i, ''), on: new Set([0]) };
        $('wiSources').classList.add('hidden');
        $('wiPreview').classList.add('hidden');
        $('wiSets').classList.remove('hidden');
        $('wiSetsFrom').textContent = shelf.from;
        $('wiSetList').innerHTML = lib.sets.map((x, i) => `<div class="br-pick" data-i="${i}">
            <div class="br-pick-icon"><i data-lucide="${x.civVer ? 'package' : 'book-open'}" width="17" height="17"></i></div>
            <div class="br-pick-text"><div class="br-pick-name">${esc(x.name)}</div>${x.description ? `<div class="br-pick-sub">${esc(x.description)}</div>` : ''}${x.count || x.version ? `<div class="br-pick-sub">${[x.count ? `${x.count.toLocaleString()} wildcards` : '', x.version ? `v${esc(x.version)}` : ''].filter(Boolean).join(' • ')}</div>` : ''}</div>
            <span class="lg-check"></span></div>`).join('');
        $('wiSetList').querySelectorAll('.br-pick').forEach(row => {
            row.onclick = () => { const i = +row.dataset.i; if (shelf.on.has(i)) shelf.on.delete(i); else shelf.on.add(i); paintSets(); };
        });
        paintSets();
        if (window.lucide) lucide.createIcons();
    }
    function paintSets() {
        $('wiSetList').querySelectorAll('.br-pick').forEach(row => {
            const on = shelf.on.has(+row.dataset.i), tick = row.querySelector('.lg-check');
            row.classList.toggle('on', on);
            tick.classList.toggle('on', on);
            tick.innerHTML = on ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' : '';
        });
        $('wiSetsGo').textContent = `NEXT (${shelf.on.size})`;
        $('wiSetsGo').disabled = !shelf.on.size;
    }
    // The picked sets, downloaded and read, to the preview as one import.
    async function loadSets() {
        if (!shelf || !shelf.on.size) return;
        const picked = shelf.lib.sets.filter((x, i) => shelf.on.has(i));
        const busy = toastBusy();
        try {
            const found = [];
            for (const x of picked) {
                // A Civitai version: its file (a library file in it: all its sets).
                if (x.civVer) {
                    const f = civPick(shelf.civ, x.civVer), got = await civRead(f, shelf.from);
                    if (got.list) { found.push(...got.list); continue; }
                    for (const y of got.lib.sets) { const u = new URL(y.file, f.url).href; if (okUrl(u)) found.push(...parse(await get(u), u.split(/[?#]/)[0]).list); }
                    continue;
                }
                const u = new URL(x.file, shelf.url).href;
                if (!okUrl(u)) throw new Error(`"${x.name}" isn't an https:// file`);
                const text = await get(u);
                if (text.length > MAX_BYTES) throw new Error(`"${x.name}" is too big`);
                found.push(...parse(text, u.split(/[?#]/)[0]).list);
            }
            const versions = [...new Set(picked.map(x => x.version).filter(Boolean))];
            // For CHECK: each set's version as imported; a Civitai pack: its newest version then (a newer one is an
            // update, whichever were picked), named after the newest picked.
            const top = picked.filter(x => x.civVer).sort((a, b) => b.civVer.id - a.civVer.id)[0];
            const src = shelf.src && (top ? { ...shelf.src, civ: shelf.civ.vers[0].id, civName: String(top.civVer.name || '').slice(0, 40) }
                : shelf.src.civ ? shelf.src : { ...shelf.src, sets: Object.fromEntries(picked.map(x => [x.file, x.version])) });
            preview(prepare(found), `${shelf.from}: ${picked.map(x => x.name).join(', ')}`, versions.length === 1 ? versions[0] : '', src);
            if (pending) $('wiSets').classList.add('hidden');
        } catch (e) {
            if (e && e.cancelled) return;
            await window.appAlert(e && e.said ? e.message : `Couldn't load it: ${e && e.name === 'AbortError' ? 'timed out' : (e && e.message) || e}.`, { title: shelf && shelf.civ ? 'Civitai' : 'Library', danger: true });
        } finally { busy(); }
    }

    // ---- preview ----
    let pending = null;
    const same = () => { const v = localStorage.getItem(SAME_KEY); return v === 'keep' || v === 'merge' ? v : 'replace'; };
    // One with the same name: its own choice (set in its comparison) or the one for all.
    const how = i => i.choice || same();
    // Options by their words (no weight, condition or tags; any case or spacing); # lines aren't options.
    const isOpt = l => { const t = String(l).trim(); return !!t && !t.startsWith('#'); };
    const words = l => String(E().parseOption(l).text).toLowerCase().replace(/\s+/g, ' ').trim();
    const optsOf = w => w.lines.filter(isOpt);
    // Their options whose words yours don't have.
    function added(i) {
        const mine = new Set(optsOf(i.old).map(words));
        return optsOf(picked(i)).filter(l => { const k = words(l); if (!k || mine.has(k)) return false; mine.add(k); return true; });
    }
    // Merge: yours as it is, then their new options.
    const merged = i => ({ ...i.old, lines: i.old.lines.concat(added(i)) });
    // Theirs as picked (options left out gone; # lines kept), without the file's own wording.
    const picked = i => { const { raw, ...w } = i.w; return i.skip && i.skip.size ? { ...w, lines: w.lines.filter((l, x) => !i.skip.has(x)) } : w; };
    // The options that can be picked: theirs coming in (MERGE: only their new ones). Indexes into i.w.lines.
    function pool(i, h) {
        if (i.empty || i.status === 'same' || (i.status === 'replaces' && h === 'keep')) return [];
        const xs = i.w.lines.map((l, x) => (isOpt(l) ? x : -1)).filter(x => x >= 0);
        if (i.status !== 'replaces' || h === 'replace') return xs;
        const mine = new Set(optsOf(i.old).map(words));
        return xs.filter(x => !mine.has(words(i.w.lines[x])));
    }
    const pickedOf = (i, P) => (i.off ? 0 : P.filter(x => !(i.skip && i.skip.has(x))).length);
    function preview(found, from, version, src) {
        // Uninstall reading a pack: just what's in it.
        if (capture) { const c = capture; capture = null; c(found); return; }
        // IMPORT from Civitai Search: the results step aside now there's something to show.
        if (cs.viewing) { cs.viewing = false; csPark(); }
        const have = new Map(Wildcards._lib.read().map(w => [E().nameKey(w.name), w]));
        const byName = new Map();
        // An empty one is shown (EMPTY) and imported, never over one of the same name.
        found.forEach(w => { const name = clean(w.name); if (name && (w.lines.length || !have.has(E().nameKey(name)))) byName.set(E().nameKey(name), { ...w, name }); });
        const items = [...byName.values()].map(w => {
            const old = have.get(E().nameKey(w.name));
            const status = !old ? 'new' : JSON.stringify(old.lines) === JSON.stringify(w.lines) && !!old.inOrder === !!w.inOrder ? 'same' : 'replaces';
            return { w, status, empty: !w.lines.length, old };
        }).sort((a, b) => a.w.name.localeCompare(b.w.name));
        if (!items.length) { window.appAlert('Nothing to import: no wildcards with a name.', { title: 'Import' }); return; }
        pending = { items, from, version, src: src || null, skipped: found.length - items.length, filter: 'all' };
        // All of it there already: nothing to import, but that version counts as loaded.
        if (items.every(i => i.status === 'same')) remember(pending.src);
        $('wiSources').classList.add('hidden');
        $('wiPreview').classList.remove('hidden');
        paintPreview();
    }
    function paintPreview() {
        const p = pending, mode = same();
        const n = k => p.items.filter(i => (k === 'empty' ? i.empty : i.status === k)).length;
        $('wiFrom').innerHTML = `From <b>${esc(p.from)}</b>${p.version ? ` • v${esc(p.version)}` : ''} • ${p.items.length.toLocaleString()} wildcard${p.items.length === 1 ? '' : 's'}`;
        // Each count is a chip showing only those below; ALL shows every one.
        if (p.filter !== 'all' && !n(p.filter)) p.filter = 'all';
        const chip = (k, t, cls, c) => (c ? `<button type="button" class="wc-badge wi-chip ${cls}${p.filter === k ? ' sel' : ''}" data-f="${k}">${c.toLocaleString()} ${t}</button>` : '');
        $('wiSummary').innerHTML = chip('all', 'ALL', 'all', p.items.length) + chip('new', 'NEW', '', n('new')) + chip('replaces', 'SAME NAME', 'bad', n('replaces'))
            + chip('same', 'HAVE', 'muted', n('same')) + chip('empty', 'EMPTY', 'bad', n('empty')) + (p.skipped ? `<span class="wc-badge muted" style="margin: 0;">${p.skipped} SKIPPED</span>` : '');
        $('wiSummary').querySelectorAll('.wi-chip').forEach(b => { b.onclick = () => { p.filter = b.dataset.f; paintPreview(); $('wiRows').scrollTop = 0; }; });
        $('wiSameRow').classList.toggle('hidden', !n('replaces'));
        document.querySelectorAll('#wiSameSeg .toggle-opt').forEach(b => b.classList.toggle('active', b.dataset.same === mode));
        const label = i => (i.status === 'new' ? ['NEW', ''] : i.status === 'same' ? ['HAVE', 'muted']
            : how(i) === 'keep' ? ['KEPT', 'muted'] : how(i) === 'merge' ? [`MERGES +${added(i).length}`, ''] : ['REPLACES', 'bad']);
        const list = p.filter === 'all' ? p.items : p.items.filter(i => (p.filter === 'empty' ? i.empty : i.status === p.filter)), shown = list.slice(0, 300);
        // The tick: left out (SKIP) or brought back; ones that will be imported have a highlighted border. The rest of
        // the row opens it.
        $('wiRows').innerHTML = shown.map((i, n) => {
            const P = pool(i, how(i)), got = pickedOf(i, P), part = would(i) && !i.off && P.length && got < P.length;
            const lb = i.off && would(i) ? ['SKIP', 'muted'] : part ? [`${got.toLocaleString()} of ${P.length.toLocaleString()}`, i.status === 'replaces' ? 'bad' : ''] : label(i), on = would(i) && !i.off;
            return `<div class="inset-card wi-row${!would(i) ? ' keep' : i.off ? ' off' : ' on'}" data-n="${n}"><span class="lg-check${part ? ' some' : on ? ' on' : ''}">${on && !part ? TICK : ''}</span><span class="wi-row-name">${esc(i.w.name)}</span>${i.empty ? '<span class="wc-badge bad" style="margin: 0;">EMPTY</span>' : ''}<span class="wc-badge ${lb[1]}" style="margin: 0;">${lb[0]}</span>${CHEV}</div>`;
        }).join('') + (list.length > shown.length ? `<p class="wc-hint" style="margin: 0;">and ${(list.length - shown.length).toLocaleString()} more</p>` : '');
        const again = () => { const top = $('wiRows').scrollTop; paintPreview(); $('wiRows').scrollTop = top; };
        $('wiRows').querySelectorAll('.wi-row').forEach(r => {
            const i = shown[+r.dataset.n];
            r.onclick = () => openDetail(i);
            r.querySelector('.lg-check').onclick = e => {
                e.stopPropagation();
                if (!would(i)) return;
                if (i.off || (i.skip && i.skip.size)) { i.off = false; i.skip = null; } else i.off = true;
                again();
            };
        });
        // Names the import calls that won't exist afterwards.
        const after = result(), lib = E().compile(after), missing = new Set();
        toWrite().forEach(w => w.lines.filter(l => !String(l).trim().startsWith('#')).forEach(l => { for (const m of String(l).matchAll(new RegExp(E().CALL.source, 'g'))) if (!E().entry(lib, m[1]) && !/\$\{/.test(m[1])) missing.add(m[1]); }));
        $('wiMissing').textContent = missing.size ? `Calls ${missing.size} that don't exist: ${[...missing].slice(0, 5).join(', ')}${missing.size > 5 ? '…' : ''}` : '';
        $('wiMissing').classList.toggle('hidden', !missing.size);
        const k = toWrite().length;
        $('wiGo').textContent = k ? `IMPORT ${k.toLocaleString()}` : 'NOTHING NEW';
        $('wiGo').disabled = !k;
    }
    // Imported: a new one, or one with the same name replaced, or merged when that adds any of theirs.
    const would = i => i.status === 'new' || i.status === 'replaces' && (how(i) === 'replace' || how(i) === 'merge' && added(i).length > 0);
    const toWrite = () => pending.items.filter(i => would(i) && !i.off).map(i => (i.status === 'replaces' && how(i) === 'merge' ? merged(i) : picked(i)));
    const TICK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    const CHEV = '<svg class="wi-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

    // ---- one opened: its options, or (same name as yours) a comparison and its own choice ----
    let detail = null;
    const DETAIL_MAX = 300;
    function openDetail(i) {
        detail = { i, how: how(i), top: $('wiRows').scrollTop, open: new Set(), orig: false };
        $('wiPreview').classList.add('hidden');
        $('wiDetail').classList.remove('hidden');
        paintDetail();
        $('wiDetailRows').scrollTop = 0;
        if (window.lucide) lucide.createIcons();
    }
    const colour = t => (window.PromptColors && PromptColors.on() ? PromptColors.html(t, false) : esc(t));
    function paintDetail() {
        const { i } = detail, cmp = i.status === 'replaces', h = detail.how, raw = i.w.raw || i.w.lines;
        const P = pool(i, h), inP = new Set(P), got = pickedOf(i, P);
        const isOn = x => !i.off && !(i.skip && i.skip.has(x));
        const changed = i.w.lines.some((l, x) => isOpt(l) && raw[x] !== undefined && raw[x] !== l);
        if (!changed) detail.orig = false;
        $('wiDetailView').classList.toggle('hidden', !changed);
        document.querySelectorAll('#wiDetailView .toggle-opt').forEach(b => b.classList.toggle('active', (b.dataset.v === '1') === detail.orig));
        $('wiDetailSeg').classList.toggle('hidden', !cmp);
        $('wiDetailSay').classList.toggle('hidden', !cmp);
        const n = x => x.toLocaleString();
        // Rows: { key, x (theirs) or line (yours), badge }.
        let rows;
        const xs = i.w.lines.map((l, x) => (isOpt(l) ? x : -1)).filter(x => x >= 0);
        if (!cmp) {
            $('wiDetailHead').innerHTML = `<b>${esc(i.w.name)}</b> • ${i.status === 'new' ? 'NEW' : 'HAVE'} • ${P.length ? `${n(got)} of ${n(P.length)}` : n(xs.length)} option${xs.length === 1 ? '' : 's'}`;
            rows = xs.map(x => ({ key: 'x' + x, x }));
        } else {
            const mine = optsOf(i.old), t = new Set(xs.map(x => words(i.w.lines[x]))), m = new Set(mine.map(words));
            const fresh = xs.filter(x => !m.has(words(i.w.lines[x]))), both = xs.filter(x => m.has(words(i.w.lines[x]))), gone = mine.filter(l => !t.has(words(l)));
            $('wiDetailHead').innerHTML = `<b>${esc(i.w.name)}</b> • yours ${n(mine.length)} • theirs ${P.length && got < P.length ? `${n(got)} of ` : ''}${n(xs.length)}`;
            document.querySelectorAll('#wiDetailSeg .toggle-opt').forEach(b => b.classList.toggle('active', b.dataset.how === h));
            const add = h === 'merge' ? fresh.filter(isOn).length : 0, take = xs.filter(x => isOn(x)).length;
            $('wiDetailSay').textContent = h === 'replace' ? `Replace: theirs${gone.length ? `, ${n(gone.length)} of yours removed` : ''} (${n(take)} option${take === 1 ? '' : 's'}).`
                : h === 'merge' ? (add ? `Merge: yours, then their ${n(add)} new one${add === 1 ? '' : 's'} (${n(mine.length + add)} option${mine.length + add === 1 ? '' : 's'}).` : 'Merge: none of theirs are new, so yours stays as it is.')
                : `Keep mine: yours stays as it is (${n(mine.length)} option${mine.length === 1 ? '' : 's'}).`;
            rows = fresh.map(x => ({ key: 'x' + x, x, badge: ['NEW', h === 'keep' ? 'muted' : ''] }))
                .concat(gone.map((l, g) => ({ key: 'g' + g, line: l, badge: h === 'replace' ? ['REMOVED', 'bad'] : ['YOURS', 'muted'] })), both.map(x => ({ key: 'x' + x, x, badge: ['BOTH', 'muted'] })));
        }
        const ring = $('wiDetailRing');
        ring.classList.toggle('hidden', !P.length);
        ring.classList.toggle('on', P.length > 0 && got === P.length);
        ring.classList.toggle('some', got > 0 && got < P.length);
        ring.innerHTML = P.length && got === P.length ? TICK : '';
        const shown = rows.slice(0, DETAIL_MAX);
        $('wiDetailRows').innerHTML = shown.map(r => {
            const line = r.x !== undefined ? i.w.lines[r.x] : r.line, o = E().parseOption(line);
            const text = r.x !== undefined && detail.orig ? String(raw[r.x] !== undefined ? raw[r.x] : line) : o.text;
            const can = r.x !== undefined && inP.has(r.x), on = can && isOn(r.x);
            const cls = can ? (on ? ' on' : ' off') : (r.badge && (r.badge[0] === 'REMOVED' || (h === 'keep' && r.badge[0] === 'NEW')) ? ' dim' : '');
            const wt = !detail.orig && o.weight !== 1 ? `<span class="wo-w">${o.weight}×</span>` : '';
            return `<div class="inset-card wo-row${cls}${detail.open.has(r.key) ? ' open' : ''}" data-k="${r.key}">${can ? `<span class="lg-check${on ? ' on' : ''}">${on ? TICK : ''}</span>` : ''}`
                + `<span class="wo-text pc-text">${colour(text)}</span>${wt}${r.badge ? `<span class="wc-badge ${r.badge[1]}" style="margin: 0;">${r.badge[0]}</span>` : ''}</div>`;
        }).join('') + (rows.length > shown.length ? `<p class="wc-hint" style="margin: 0;">and ${n(rows.length - shown.length)} more</p>` : '')
            + (xs.length || cmp ? '' : '<p class="wc-hint" style="margin: 0;">No options: it\'s empty.</p>');
        $('wiDetailRows').querySelectorAll('.wo-row').forEach(el => {
            const k = el.dataset.k, x = k[0] === 'x' ? +k.slice(1) : null;
            el.onclick = () => { if (detail.open.has(k)) detail.open.delete(k); else detail.open.add(k); el.classList.toggle('open'); };
            const c = el.querySelector('.lg-check');
            if (c) c.onclick = e => { e.stopPropagation(); pickOne(x); };
        });
        detail.rows = rows.map(r => r.key);
        $('wiDetailHint').textContent = detail.orig ? 'How the file wrote them. Picks are the same in both views.'
            : P.length ? 'Tick: import or leave out. Tap one to see all of it.' : 'Tap one to see all of it.';
    }
    // One option picked or left out; none left: the whole wildcard skipped.
    function pickOne(x) {
        const { i } = detail, P = pool(i, detail.how);
        if (i.off) { i.off = false; i.skip = new Set(P.filter(y => y !== x)); }
        else { i.skip = i.skip || new Set(); if (i.skip.has(x)) i.skip.delete(x); else i.skip.add(x); }
        if (P.every(y => i.skip && i.skip.has(y))) { i.off = true; i.skip = null; }
        const top = $('wiDetailRows').scrollTop; paintDetail(); $('wiDetailRows').scrollTop = top;
    }
    function pickAll() {
        if (!detail) return;
        const { i } = detail, P = pool(i, detail.how);
        if (!P.length) return;
        if (pickedOf(i, P) === P.length) { i.off = true; i.skip = null; } else { i.off = false; if (i.skip) P.forEach(y => i.skip.delete(y)); }
        const top = $('wiDetailRows').scrollTop; paintDetail(); $('wiDetailRows').scrollTop = top;
    }
    function openAll() {
        if (!detail || !detail.rows) return;
        if (detail.open.size < detail.rows.length) detail.rows.forEach(k => detail.open.add(k)); else detail.open.clear();
        const top = $('wiDetailRows').scrollTop; paintDetail(); $('wiDetailRows').scrollTop = top;
    }
    function setView(orig) { if (!detail) return; detail.orig = !!orig; const top = $('wiDetailRows').scrollTop; paintDetail(); $('wiDetailRows').scrollTop = top; }
    // That one's own choice, at once (and ticked when it's imported).
    function setHow(v) {
        if (!detail) return;
        const { i } = detail;
        detail.how = v;
        if (i.status === 'replaces') { i.choice = v; if (would(i)) i.off = false; }
        paintDetail();
    }
    function closeDetail() {
        if (!detail) return;
        const { top } = detail;
        detail = null;
        $('wiDetail').classList.add('hidden');
        if (!pending) return;
        $('wiPreview').classList.remove('hidden');
        paintPreview();
        $('wiRows').scrollTop = top;
    }
    function result() {
        const add = toWrite(), keys = new Set(add.map(w => E().nameKey(w.name)));
        return Wildcards._lib.read().filter(w => !keys.has(E().nameKey(w.name))).concat(add);
    }
    function setSame(v) { localStorage.setItem(SAME_KEY, v); if (pending) paintPreview(); }
    function go() {
        if (!pending) return;
        const k = toWrite().length, empty = toWrite().filter(w => !w.lines.length).length;
        const mixed = pending.items.filter(i => would(i) && !i.off && i.status === 'replaces' && how(i) === 'merge').length;
        if (!k) return;
        Wildcards._lib.write(result());
        // What was loaded from where, for CHECK.
        remember(pending.src);
        pending = null;
        const fromSearch = cs.parked;
        cs.parked = false;
        close();
        if (fromSearch) $('civSearchModal').classList.remove('hidden');
        Wildcards.render();
        if (window.WcAdvanced) WcAdvanced.paint();
        toast(`Imported ${k.toLocaleString()}${mixed ? ` • ${mixed.toLocaleString()} merged` : ''}${empty ? ` • ${empty} ${empty === 1 ? 'is' : 'are'} empty` : ''}`);
    }
    function back() {
        pending = null;
        detail = null;
        $('wiDetail').classList.add('hidden');
        $('wiPreview').classList.add('hidden');
        // From a library's preview, back to its sets; from the sets, back to the start.
        if (shelf && !$('wiSets').classList.contains('hidden')) shelf = null;
        if (shelf) { $('wiSets').classList.remove('hidden'); return; }
        $('wiSets').classList.add('hidden');
        $('wiUninst').classList.add('hidden');
        un = null;
        $('wcImportModal').querySelector('h3').textContent = 'Import Wildcards';
        $('wiSources').classList.remove('hidden');
        csUnpark();
    }

    // ---- the window ----
    function open() {
        const m = $('wcImportModal');
        shelf = null;
        back();
        showAdd(false);
        $('wiUrl').value = '';
        paintLinks();
        paintKey();
        if (m.classList.contains('hidden') && typeof lockBodyScroll === 'function') lockBodyScroll();
        m.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    }
    function close() {
        const m = $('wcImportModal');
        // A pack opened from Civitai Search: back to its results (the Import window as it was under them).
        if (cs.parked && !m.classList.contains('hidden')) { shelf = null; back(); return; }
        if (cs.parked) csClose();
        if (m.classList.contains('hidden')) return;
        m.classList.add('hidden');
        if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
    }

    // ---- Uninstall: a library's wildcards (or the Starter set's), those you've changed or use kept unless ticked ----
    const STARTER = 'builtin:starter';
    const lhash = w => hash(JSON.stringify((w && w.lines) || []));
    // From the preview being imported: { nameKey: { h } } or { merged: true } (merged with yours); KEEP MINE isn't theirs.
    function packNames() {
        const out = {};
        pending.items.forEach(i => {
            const k = E().nameKey(i.w.name);
            if (i.status === 'same') out[k] = { h: lhash(i.w) };
            else if (!would(i) || i.off) return;
            else if (i.status === 'replaces' && how(i) === 'merge') out[k] = { merged: true };
            else out[k] = { h: lhash(picked(i)) };
        });
        return out;
    }
    // A pack read again (imported before names were noted): its wildcards, or null.
    let capture = null;
    async function packOf(url) {
        let got = null;
        capture = f => { got = f; };
        try { await fromUrl(url, '', url); } finally { capture = null; }
        return got;
    }
    async function captureSets(lib, url) {
        const found = [];
        for (const x of lib.sets) {
            const u = new URL(x.file, url).href;
            if (!okUrl(u)) continue;
            try { found.push(...parse(await get(u), u.split(/[?#]/)[0]).list); } catch (e) {}
        }
        preview(found);
    }
    let un = null;
    async function uninstall(l) {
        const url = l ? l.url : STARTER, rec = seen()[url];
        let from = null;
        if (rec && rec.names) from = Object.entries(rec.names).map(([k, v]) => ({ k, ...v }));
        else if (!l) from = Wildcards.defaults().map(w => ({ k: E().nameKey(clean(w.name)), lines: w.lines }));
        else if (url) {
            const found = await packOf(url);
            if (found) from = found.filter(w => clean(w.name)).map(w => ({ k: E().nameKey(clean(w.name)), lines: w.lines }));
        }
        const lib = Wildcards._lib.read(), byKey = new Map(lib.map(w => [E().nameKey(w.name), w])), favs = new Set(Wildcards.favKeys());
        const keys = new Set((from || []).map(e => e.k).filter(k => byKey.has(k)));
        // Who calls each (option lines only), from outside the pack.
        const callers = new Map();
        lib.forEach(w => {
            const me = E().nameKey(w.name);
            if (keys.has(me)) return;
            w.lines.filter(x => !String(x).trim().startsWith('#')).forEach(x => {
                for (const m of String(x).matchAll(/__([^_\n](?:[^\n]*?[^_\n])?)__/g)) {
                    const k = E().nameKey(m[1].trim());
                    if (keys.has(k)) { if (!callers.has(k)) callers.set(k, new Set()); callers.get(k).add(w.name); }
                }
            });
        });
        const items = (from || []).filter(e => keys.has(e.k)).map(e => {
            const w = byKey.get(e.k);
            const edited = e.merged ? false : e.h ? lhash(w) !== e.h : JSON.stringify(w.lines) !== JSON.stringify(e.lines);
            const used = [...(callers.get(e.k) || [])].sort((a, b) => a.localeCompare(b));
            const why = { edited, merged: !!e.merged, used, fav: favs.has(e.k) };
            return { w, k: e.k, why, on: !edited && !why.merged && !used.length && !why.fav };
        }).sort((a, b) => a.w.name.localeCompare(b.w.name));
        un = { l, url, name: l ? l.name : 'Starter set', items, filter: 'all', unread: !!l && !from };
        $('wiSources').classList.add('hidden');
        $('wiUninst').classList.remove('hidden');
        $('wcImportModal').querySelector('h3').textContent = l ? 'Uninstall Library' : 'Uninstall Starter Set';
        paintUn();
    }
    const tags = i => [i.why.edited && ['EDITED', 'muted'], i.why.merged && ['MERGED', 'muted'], i.why.used.length && [`USED BY ${i.why.used.length}`, 'muted'], i.why.fav && ['FAVORITE', 'muted']].filter(Boolean);
    function paintUn() {
        const u = un, on = u.items.filter(i => i.on).length, all = u.items.length;
        const n = f => u.items.filter(f).length;
        const kinds = { remove: i => i.on, edited: i => i.why.edited, used: i => i.why.used.length > 0, merged: i => i.why.merged, fav: i => i.why.fav };
        if (u.filter !== 'all' && !n(kinds[u.filter])) u.filter = 'all';
        $('wuFrom').innerHTML = all ? `${on && on < all ? `${on} of ` : ''}${all.toLocaleString()} from <b>${esc(u.name)}</b>`
            : `<b>${esc(u.name)}</b>: ${u.unread ? "couldn't be read" : 'none of its wildcards are left'}`;
        const ring = $('wuAll');
        ring.classList.toggle('hidden', !all);
        ring.classList.toggle('all', all > 0 && on === all);
        ring.classList.toggle('some', on > 0 && on < all);
        const chip = (k, t, cls, c) => (c ? `<button type="button" class="wc-badge wi-chip ${cls}${u.filter === k ? ' sel' : ''}" data-f="${k}">${c.toLocaleString()} ${t}</button>` : '');
        $('wuChips').innerHTML = all ? chip('all', 'ALL', 'all', all) + chip('remove', 'REMOVE', 'bad', on) + chip('edited', 'EDITED', 'muted', n(kinds.edited))
            + chip('used', 'USED', 'muted', n(kinds.used)) + chip('merged', 'MERGED', 'muted', n(kinds.merged)) + chip('fav', 'FAVORITE', 'muted', n(kinds.fav)) : '';
        $('wuChips').querySelectorAll('.wi-chip').forEach(b => { b.onclick = () => { u.filter = b.dataset.f; paintUn(); $('wuRows').scrollTop = 0; }; });
        const list = u.filter === 'all' ? u.items : u.items.filter(kinds[u.filter]);
        $('wuRows').innerHTML = list.map((i, x) => {
            const t = i.on ? [['REMOVE', 'bad']] : tags(i).length ? tags(i) : [['KEEP', 'muted']];
            return `<div class="inset-card wi-row ${i.on ? 'on' : 'keep'}" data-n="${x}"><span class="lg-check${i.on ? ' on' : ''}">${i.on ? TICK : ''}</span><span class="wi-row-name">${esc(i.w.name)}</span>${t.map(b => `<span class="wc-badge ${b[1]}" style="margin: 0;">${b[0]}</span>`).join('')}${CHEV}</div>`;
        }).join('');
        $('wuRows').querySelectorAll('.wi-row').forEach(r => {
            const i = list[+r.dataset.n];
            r.querySelector('.lg-check').onclick = e => { e.stopPropagation(); i.on = !i.on; const top = $('wuRows').scrollTop; paintUn(); $('wuRows').scrollTop = top; };
            r.onclick = () => {
                const said = [i.why.edited && 'Edited since it was imported.', i.why.merged && 'Merged with yours when it was imported, so it holds your options too.',
                    i.why.used.length && `Used by ${i.why.used.slice(0, 8).join(', ')}${i.why.used.length > 8 ? ` and ${i.why.used.length - 8} more` : ''}.`, i.why.fav && 'One of your favorites.'].filter(Boolean);
                const opts = i.w.lines.filter(x => !String(x).trim().startsWith('#')).length;
                window.appAlert(`${said.length ? said.join(' ') : 'As it was imported, and nothing else uses it.'} ${opts.toLocaleString()} option${opts === 1 ? '' : 's'}.`, { title: i.w.name });
            };
        });
        const starter = !u.l;
        $('wuHint').textContent = starter ? 'Ticked ones go to Recently deleted. Tap a name to see why one is kept. The Starter set stays under Libraries, to load again.'
            : u.unread ? "Its wildcards couldn't be checked, so only the link can go." : 'Ticked ones go to Recently deleted. Tap a name to see why one is kept. Nothing ticked: only the link goes.';
        const go = $('wuGo');
        go.textContent = on ? `UNINSTALL ${on.toLocaleString()}` : starter ? 'NOTHING TICKED' : 'REMOVE LINK ONLY';
        go.classList.toggle('wu-red', on > 0);
        go.disabled = starter && !on;
    }
    function unAll() {
        if (!un) return;
        const every = un.items.every(i => i.on);
        un.items.forEach(i => { i.on = !every; });
        paintUn();
    }
    async function unGo() {
        if (!un) return;
        const u = un, going = new Set(u.items.filter(i => i.on).map(i => i.k));
        if (!going.size && !u.l) return;
        if (going.size) {
            const list = Wildcards._lib.read(), gone = list.filter(w => going.has(E().nameKey(w.name)));
            Wildcards._lib.write(list.filter(w => !going.has(E().nameKey(w.name))));
            if (window.WcHistory) WcHistory.deletedMany(gone);
        }
        const all = seen();
        if (u.l) {
            const now = links(), at = now.findIndex(x => x.url === u.l.url && x.name === u.l.name);
            if (at >= 0) { now.splice(at, 1); saveLinks(now); }
            if (u.url) { delete all[u.url]; checks.delete(u.url); }
        } else delete all[STARTER];
        saveSeen(all);
        if (!going.size) toast(`Removed "${u.name}"`);
        Wildcards.render();
        if (window.WcAdvanced) WcAdvanced.paint();
        back();
        paintLinks();
    }

    // ---- Civitai Search (Import Wildcards > Search Civitai): wildcard packs, 20 a page ----
    const CS_NSFW = 'bojroCivSearchNsfw', CS_SORT = 'bojroCivSearchSort';
    const SORTS = { relevance: 'RELEVANCE', Newest: 'NEWEST', 'Highest Rated': 'TOP RATED', 'Most Downloaded': 'DOWNLOADS' };
    const csNsfw = () => localStorage.getItem(CS_NSFW) !== 'false';
    const csSort = () => { const v = localStorage.getItem(CS_SORT); return SORTS[v] ? v : 'relevance'; };
    // Civitai pages a search by "next" only: the cursor of each page seen, for BACK.
    const cs = { q: '', cursors: [null], page: 0, next: null, run: 0, parked: false, viewing: false };
    function csPark() { const m = $('civSearchModal'); if (!m || m.classList.contains('hidden')) return; m.classList.add('hidden'); cs.parked = true; }
    function csUnpark() { if (!cs.parked) return; cs.parked = false; $('civSearchModal').classList.remove('hidden'); csFit(); }
    // An 18+ pack's page is on civitai.red (civitai.com only says it has moved there).
    const civPage = m => `${adultOf(m) ? 'https://civitai.red' : 'https://civitai.com'}/models/${m.id}`;
    const adultOf = m => m.nsfw === true || (Number(m.nsfwLevel) || 0) >= 4;
    // A picture at 160px (a still frame if animated): its options part replaced, or added before the file name.
    const thumbOf = u => {
        const t = String(u || '');
        if (!/^https:\/\/image\.civitai\.com\//i.test(t)) return t;
        const opts = /\/((?:[a-z]+=[^/,]*,?)+)\/(?=[^/]*$)/i;
        return opts.test(t) ? t.replace(opts, '/anim=false,width=160/') : t.replace(/\/([^/]+)$/, '/anim=false,width=160/$1');
    };
    // The file an IMPORT would take (as civPick() picks it): its size.
    const packSize = v => {
        const fs = Array.isArray(v.files) ? v.files : [], wc = x => WC_EXT.test(x.name || '');
        const f = fs.find(x => x.primary && wc(x)) || fs.find(wc) || fs.find(x => x.primary) || fs[0];
        const kb = f ? Number(f.sizeKB) || 0 : 0;
        return !kb ? '' : kb < 1 ? '1 KB' : kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1).replace(/\.0$/, '')} MB`;
    };
    const short = n => { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k' : String(n); };
    const day = d => { const t = new Date(d); return isNaN(t) ? '' : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
    function csPaintBar() {
        document.querySelectorAll('#csNsfwSeg .toggle-opt').forEach(b => b.classList.toggle('active', (b.dataset.v === 'all') === csNsfw()));
        $('csSort').value = csSort();
        $('csSortLabel').textContent = SORTS[csSort()];
        $('csQClear').classList.toggle('hidden', !$('csQ').value);
    }
    // The list as many whole rows (112px, 8px apart) as the screen has room for; the window as tall as that.
    const CS_ROW = 120;
    function csFit() {
        const m = $('civSearchModal'), list = $('csList');
        if (!m || m.classList.contains('hidden')) return;
        const box = m.querySelector('.modal-content');
        list.style.height = '0px';
        const r = box.getBoundingClientRect(), pad = parseFloat(getComputedStyle(m).paddingTop) || 40;
        const room = (window.visualViewport ? window.visualViewport.height : window.innerHeight) - r.top - r.height - Math.max(16, pad / 2);
        let rows = Math.max(1, Math.floor((room + 8) / CS_ROW));
        list.style.height = `${rows * CS_ROW - 8}px`;
        // The window has a limit of its own (85% of the screen): fewer rows until BACK / NEXT are inside it.
        while (rows > 1 && box.scrollHeight > box.clientHeight + 1) { rows--; list.style.height = `${rows * CS_ROW - 8}px`; }
    }
    window.addEventListener('resize', () => csFit());
    function csOpen(q) {
        const m = $('civSearchModal');
        $('csQ').value = String(q || '').trim();
        csPaintBar();
        if (m.classList.contains('hidden') && typeof lockBodyScroll === 'function') lockBodyScroll();
        m.classList.remove('hidden');
        csFit();
        if (window.lucide) lucide.createIcons();
        csSearch();
    }
    function csClose() {
        const m = $('civSearchModal');
        cs.run++;
        if (cs.parked) { cs.parked = false; if (typeof unlockBodyScroll === 'function') unlockBodyScroll(); return; }
        if (!m || m.classList.contains('hidden')) return;
        m.classList.add('hidden');
        if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
    }
    function csSearch() {
        cs.q = $('csQ').value.trim();
        $('wiCivQ').value = cs.q;
        $('wiCivQClear').classList.toggle('hidden', !cs.q);
        $('csQClear').classList.toggle('hidden', !cs.q);
        cs.cursors = [null]; cs.page = 0;
        csLoad();
    }
    function csFoot() {
        $('csPage').textContent = `Page ${cs.page + 1}`;
        $('csBack').disabled = cs.page === 0;
        $('csNext').disabled = !cs.next;
    }
    async function csLoad() {
        const run = ++cs.run, list = $('csList');
        list.innerHTML = '<div class="empty-note" style="padding: 15px;">Searching Civitai…</div>';
        cs.next = null; $('csBack').disabled = true; $('csNext').disabled = true;
        const p = new URLSearchParams({ types: 'Wildcards', limit: '20', nsfw: csNsfw() ? 'true' : 'false' });
        if (cs.q) p.set('query', cs.q);
        // Relevance: no sort sent (Civitai's order for the words).
        if (csSort() !== 'relevance') p.set('sort', csSort());
        if (cs.cursors[cs.page]) p.set('cursor', cs.cursors[cs.page]);
        const what = `"${cs.q}", ${SORTS[csSort()].toLowerCase()}, ${csNsfw() ? 'all' : 'SFW only'}, page ${cs.page + 1}`;
        try {
            const r = await civGet(`https://civitai.com/api/v1/models?${p}`, 'text', 'header');
            if (run !== cs.run) return;
            let j;
            try { j = JSON.parse(r.data); } catch (e) { throw new Error('unreadable reply from Civitai'); }
            const all = (Array.isArray(j.items) ? j.items : []).filter(m => m && m.id);
            // SFW ONLY: Civitai leaves out packs marked mature, but not ones with R-rated pictures: those too.
            const items = csNsfw() ? all : all.filter(m => !adultOf(m));
            cs.next = (j.metadata && j.metadata.nextCursor) || null;
            if (window.dbg) dbg(`Civitai search ${what}: ${items.length} result${items.length === 1 ? '' : 's'}${items.length < all.length ? ` (${all.length - items.length} 18+ left out)` : ''} (${Math.round(String(r.data).length / 1024)} KB)${cs.next ? ', more' : ''}`);
            csPaint(items);
        } catch (e) {
            if (run !== cs.run) return;
            if (window.dbg) dbg(`Civitai search ${what} failed: ${(e && e.message) || e}`);
            list.innerHTML = `<div class="empty-note" style="padding: 15px;">Couldn't search Civitai: ${esc(why(e))}.</div>`;
        }
        csFoot();
    }
    function csPaint(items) {
        const list = $('csList');
        list.innerHTML = '';
        list.scrollTop = 0;
        if (!items.length) { list.innerHTML = `<div class="empty-note" style="padding: 15px;">${cs.page ? 'No more results' : 'No wildcard packs found'}</div>`; return; }
        const mine = new Set(links().map(l => l.url));
        items.forEach(m => {
            const v = (m.modelVersions || [])[0] || {}, st = m.stats || {};
            const img = (v.images || []).find(i => i && i.url && (!i.type || i.type === 'image'));
            const src = img ? thumbOf(img.url) : '';
            const mature = adultOf(m), size = packSize(v);
            const row = document.createElement('div');
            row.className = 'cs-row';
            row.innerHTML = `<div class="cs-thumb">${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<i data-lucide="image-off" width="20" height="20"></i>'}${mature ? '<span class="cs-18">18+</span>' : ''}</div>`
                + `<div class="cs-info"><div class="cs-name">${esc(m.name || 'Untitled')}</div><div class="cs-sub">by ${esc((m.creator && m.creator.username) || 'unknown')}</div>`
                + `<div class="cs-sub">↓ ${short(st.downloadCount)} • ♥ ${short(st.thumbsUpCount)}${size ? ` • ${size}` : ''}</div><div class="cs-sub">${esc([v.name, day(v.publishedAt)].filter(Boolean).join(' • '))}</div>`
                + `<div class="cs-btns"><button type="button" class="btn-small cs-imp">IMPORT</button><button type="button" class="btn-small">${mine.has(civPage(m)) ? 'ADDED' : 'ADD LINK'}</button></div></div>`;
            const pic = row.querySelector('img');
            const NOPIC = '<i data-lucide="image-off" width="20" height="20"></i>';
            if (pic) pic.onerror = () => { pic.insertAdjacentHTML('afterend', NOPIC); pic.remove(); if (window.lucide) lucide.createIcons(); };
            const [imp, add] = row.querySelectorAll('.cs-btns button');
            // Nothing to show (the pack couldn't be loaded): the results again.
            const shown = () => !$('wiPreview').classList.contains('hidden') || !$('wiSets').classList.contains('hidden');
            // IMPORT: the pack's contents (or its versions) first; nothing is added until IMPORT there.
            imp.onclick = async () => { if (cs.viewing) return; cs.viewing = true; try { await fromCivitai(civPage(m), m.name); } finally { cs.viewing = false; } if (cs.parked && !shown()) csUnpark(); };
            add.disabled = mine.has(civPage(m));
            add.onclick = () => {
                if (links().some(l => l.url === civPage(m))) return;
                saveLinks(links().concat([{ name: String(m.name || 'Civitai').slice(0, 40), url: civPage(m) }]));
                paintLinks();
                add.textContent = 'ADDED'; add.disabled = true;
                toast('Added to Libraries');
            };
            list.appendChild(row);
        });
        if (window.lucide) lucide.createIcons();
    }
    function csNext() { if (!cs.next) return; cs.cursors[cs.page + 1] = cs.next; cs.page++; csLoad(); }
    function csBack() { if (!cs.page) return; cs.page--; csLoad(); }
    function csSetNsfw(on) { try { localStorage.setItem(CS_NSFW, on ? 'true' : 'false'); } catch (e) {} csPaintBar(); csSearch(); }
    function csSetSortTo(v) { try { localStorage.setItem(CS_SORT, SORTS[v] ? v : 'relevance'); } catch (e) {} csPaintBar(); csSearch(); }
    window.CivSearch = { open: csOpen, close: csClose, search: csSearch, next: csNext, back: csBack, setNsfw: csSetNsfw, setSort: csSetSortTo };

    // The key's box in Config, filled once the page is there.
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintKey); else setTimeout(paintKey, 0);
    window.WcImport = { unzip, openZip, pwHints, fromZip, slashRefs, open, close, fromFiles, fromUrl, showAdd, addLink, setSame, setHow, closeDetail, check, nameSoon, go, back, links, parse, loadSets, saveKey, showKey, unAll, unGo, pickAll, openAll, setView, DEFAULT_LINKS };
})();

// Export Wildcards (item 21): picked wildcards (and every wildcard they call, NEEDED) as the app's own .json, which
// Import reads back. Saved to Documents or sent through the share sheet.
(function () {
    const $ = id => document.getElementById(id);
    const E = () => window.WcEngine;
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (text, duration = 'short') => { if (typeof Toast !== 'undefined') Toast.show({ text, duration }); };
    let picked = new Set(), content = false, openGroup = null, shown = [];
    const SNAP_KEY = 'bojroWcExportSnap';
    const lib = () => Wildcards._lib.read().slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    const key = n => E().nameKey(n);
    // The wildcards one calls directly, globs (__outfits/*__) included.
    function calls(list) {
        const byKey = new Map(list.map(w => [key(w.name), w])), compiled = E().compile(list), out = new Map();
        list.forEach(w => {
            // Option lines only (a __name__ in a note calls nothing).
            const text = w.lines.filter(l => !String(l).trim().startsWith('#')).join('\n'), set = new Set();
            E().callsIn(text).forEach(k => { if (byKey.has(k) && k !== key(w.name)) set.add(k); });
            for (const m of text.matchAll(new RegExp(E().GLOB.source, 'g'))) E().globNames(compiled, m[1]).forEach(n => { const k = key(n); if (byKey.has(k) && k !== key(w.name)) set.add(k); });
            out.set(key(w.name), set);
        });
        return out;
    }
    let graph = new Map(), names = new Map();
    // Everything going out: the picked ones and all they call, however deep.
    function closure() {
        const all = new Set(), stack = [...picked];
        while (stack.length) { const k = stack.pop(); if (all.has(k)) continue; all.add(k); (graph.get(k) || []).forEach(n => stack.push(n)); }
        return all;
    }
    function open() {
        const list = lib();
        graph = calls(list);
        names = new Map(list.map(w => [key(w.name), w.name]));
        picked = new Set();
        openGroup = null;
        $('wxpName').value = $('wxpName').value || 'wildcards';
        $('wxpSearch').value = '';
        const m = $('wcExportModal');
        if (m.classList.contains('hidden') && typeof lockBodyScroll === 'function') lockBodyScroll();
        m.classList.remove('hidden');
        render();
    }
    function close() {
        const m = $('wcExportModal');
        if (m.classList.contains('hidden')) return;
        m.classList.add('hidden');
        document.getElementById('thumbMenu')?.remove();
        if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
    }
    function toggleContent() {
        content = !content;
        toast(content ? 'Searching options too' : 'Searching names only');
        render();
    }
    function render() {
        const box = $('wxpList');
        if (!box) return;
        const raw = $('wxpSearch').value, q = typeof searchQuery === 'function' ? searchQuery(raw) : raw.trim().toLowerCase();
        const btn = $('wxpSearchContent');
        if (btn) { btn.classList.toggle('active', content); btn.setAttribute('aria-pressed', content ? 'true' : 'false'); }
        let list = lib();
        if (q) {
            const named = searchFilter(list, w => [w.name], q), has = new Set(named);
            list = content ? named.concat(list.filter(w => !has.has(w) && searchMatches(w.lines.join('\n'), q + ' '))) : named;
        }
        const out = closure();
        shown = list.map(w => key(w.name));
        const gOn = Wildcards.groupsOn(), gb = $('wxpGroups');
        if (gb) { gb.classList.toggle('on', gOn); gb.setAttribute('aria-pressed', gOn ? 'true' : 'false'); }
        const row = (w, child) => {
            const k = key(w.name), on = out.has(k), need = on && !picked.has(k);
            const n = w.lines.filter(l => l.trim() && !l.trim().startsWith('#')).length;
            return `<div class="wxp-row${on ? ' picked' : ''}${child ? ' child' : ''}" data-k="${esc(k)}"><span class="n">${esc(w.name)}</span>${need ? '<span class="need">NEEDED</span>' : ''}<span class="c">${n}</span></div>`;
        };
        const ring = ks => { const c = ks.filter(k => out.has(k)).length; return c && c === ks.length ? 'all' : c ? 'some' : ''; };
        let html = '';
        if (!list.length) html = `<div class="empty-note">${q ? 'No wildcards match.' : 'No wildcards yet.'}</div>`;
        else if (gOn && !q) {
            // Groups as in the Wildcards window (one open at a time); a header's circle picks the whole group.
            const G = Wildcards.groupsOf(list);
            [...G.groups.keys()].sort((a, b) => (a === 'other') - (b === 'other') || a.localeCompare(b, undefined, { sensitivity: 'base' })).forEach(g => {
                const m = G.groups.get(g).slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })), open = openGroup === g;
                html += `<div class="lora-item-row wc-group${open ? ' open' : ''}" data-g="${esc(g)}"><i data-lucide="${open ? 'chevron-down' : 'chevron-right'}" width="18" height="18"></i><span>${esc(G.shown(g))}</span><span class="wc-count">${m.length}</span><button type="button" class="wxp-gring" aria-label="Pick the group"><span class="wxp-ring ${ring(m.map(w => key(w.name)))}"></span></button></div>`;
                if (open) html += m.map(w => row(w, true)).join('');
            });
            box._groups = G.groups;
        } else html = list.map(w => row(w)).join('');
        box.innerHTML = html;
        box.querySelectorAll('.wxp-row').forEach(r => { r.onclick = () => tap(r.dataset.k); });
        box.querySelectorAll('.wc-group').forEach(h => {
            h.onclick = () => { openGroup = openGroup === h.dataset.g ? null : h.dataset.g; render(); };
            h.querySelector('.wxp-gring').onclick = e => { e.stopPropagation(); pickMany(box._groups.get(h.dataset.g).map(w => key(w.name))); };
        });
        if (window.lucide && box.querySelector('[data-lucide]')) lucide.createIcons();
        $('wxpCount').textContent = `${out.size} selected`;
        const all = $('wxpAll').firstChild;
        all.className = 'wxp-ring' + (shown.length && shown.every(k => out.has(k)) ? ' all' : '');
        const ex = $('wxpExport');
        ex.disabled = !out.size;
        ex.textContent = out.size ? `EXPORT (${out.size})` : 'EXPORT';
    }
    // Several at once (a group, everything shown): all of them go if they all are already; else they all come.
    function pickMany(ks) {
        const out = closure();
        if (ks.length && ks.every(k => out.has(k))) ks.forEach(k => picked.delete(k));
        else ks.forEach(k => picked.add(k));
        render();
    }
    const toggleAll = () => pickMany(shown.slice());
    function toggleGroups() {
        localStorage.setItem('bojroWcGroups', Wildcards.groupsOn() ? 'false' : 'true');
        render();
    }
    // ---- the SELECT menu ----
    const sig = w => { let h = 2166136261; const t = w.name + '\u0001' + w.lines.join('\n') + (w.inOrder ? '\u0001o' : ''); for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
    const snap = () => { try { return JSON.parse(localStorage.getItem(SNAP_KEY) || 'null'); } catch (e) { return null; } };
    // The wildcards a text calls, globs too, that are in the library.
    function calledIn(text) {
        const list = lib(), has = new Set(list.map(w => key(w.name))), outK = new Set();
        E().callsIn(text).forEach(k => { if (has.has(k)) outK.add(k); });
        const compiled = E().compile(list);
        for (const m of String(text).matchAll(new RegExp(E().GLOB.source, 'g'))) E().globNames(compiled, m[1]).forEach(n => { const k = key(n); if (has.has(k)) outK.add(k); });
        return [...outK];
    }
    const promptText = () => [...document.querySelectorAll(typeof currentTask !== 'undefined' && currentTask === 'inp' ? '#view-inp textarea' : `#mode-${typeof currentMode !== 'undefined' ? currentMode : 'xl'}-container textarea`)].map(t => t.value).join('\n');
    const SETS = {
        favorites: () => Wildcards.favKeys().filter(k => names.has(k)),
        styles: () => calledIn(window.StyleManager && StyleManager.styles ? JSON.stringify(StyleManager.styles) : ''),
        prompt: () => calledIn(promptText()),
        changed: () => { const sn = snap(), old = sn && sn.sigs ? sn.sigs : {}; return lib().filter(w => old[key(w.name)] !== sig(w)).map(w => key(w.name)); },
        own: () => { const d = new Map(Wildcards.defaults().map(w => [key(w.name), sig(w)])); return lib().filter(w => d.get(key(w.name)) !== sig(w)).map(w => key(w.name)); }
    };
    const LABEL = { favorites: 'favorites', styles: 'from your styles', prompt: 'from the prompt', changed: 'changed', own: 'of your own' };
    // How many a set would add: what the export would gain, wildcards they call included.
    function gain(ks) { const before = closure(), was = new Set(picked); ks.forEach(k => picked.add(k)); const n = closure().size - before.size; picked = was; return n; }
    function add(kind) {
        const before = closure().size;
        SETS[kind]().forEach(k => picked.add(k));
        render();
        const n = closure().size - before;
        toast(n ? `Added ${n} ${LABEL[kind]} · ${closure().size} selected` : `Nothing to add · ${closure().size} selected`);
    }
    function invert() {
        const out = closure();
        shown.forEach(k => { if (out.has(k)) picked.delete(k); else picked.add(k); });
        render();
    }
    function clear() { picked = new Set(); render(); }
    function menu(btn) {
        document.getElementById('thumbMenu')?.remove();
        const m = document.createElement('div');
        m.id = 'thumbMenu';
        m.className = 'modal wxp-menu';
        const sn = snap();
        const items = [['favorites', 'star', 'FAVORITES'], ['styles', 'palette', 'USED IN MY STYLES'], ['prompt', 'file-text', 'USED IN THE PROMPT'], ['changed', 'history', 'CHANGED SINCE LAST EXPORT'], ['own', 'user', 'ONLY MY OWN']];
        m.innerHTML = '<div class="thumb-menu-box">' + items.map(([k, ic, t]) => { const n = gain(SETS[k]()); return `<button type="button" class="btn-small" data-k="${k}"${n ? '' : ' disabled'}><i data-lucide="${ic}" width="16" height="16"></i>${t}<small>${k === 'changed' && !sn ? 'ALL' : n}</small></button>`; }).join('') +
            '<hr><button type="button" class="btn-small" data-k="invert"><i data-lucide="repeat" width="16" height="16"></i>INVERT</button><button type="button" class="btn-small" data-k="clear"' + (picked.size ? '' : ' disabled') + '><i data-lucide="x" width="16" height="16"></i>CLEAR</button></div>';
        const shut = () => m.remove();
        m.querySelectorAll('button[data-k]').forEach(b => { b.onclick = () => { shut(); const k = b.dataset.k; if (k === 'invert') invert(); else if (k === 'clear') clear(); else add(k); }; });
        document.body.appendChild(m);
        if (window.lucide) lucide.createIcons();
        const r = btn.getBoundingClientRect(), box = m.firstChild;
        box.style.left = `${Math.max(8, Math.min(r.right - box.offsetWidth, window.innerWidth - box.offsetWidth - 8))}px`;
        box.style.top = `${Math.min(r.bottom + 6, window.innerHeight - box.offsetHeight - 8)}px`;
    }
    // After an export: what the library looked like, for CHANGED SINCE LAST EXPORT.
    function remember() {
        const sigs = {};
        lib().forEach(w => { sigs[key(w.name)] = sig(w); });
        try { localStorage.setItem(SNAP_KEY, JSON.stringify({ at: Date.now(), sigs })); } catch (e) { }
    }
    // A tap picks it (and what it calls); a picked one goes unless a wildcard going out calls it.
    function tap(k) {
        const out = closure();
        if (!out.has(k)) { picked.add(k); render(); return; }
        const user = [...out].find(o => o !== k && (graph.get(o) || new Set()).has(k));
        if (user) { toast(`${names.get(k) || k} is used by ${names.get(user) || user}`); return; }
        picked.delete(k);
        render();
    }
    function fileName() {
        const n = ($('wxpName').value || '').trim().replace(/\.json$/i, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'wildcards';
        return `${n}.json`;
    }
    function payload() {
        const out = closure(), name = fileName().replace(/\.json$/i, '');
        const ver = typeof appVersionLabel === 'function' ? appVersionLabel() : '';
        return {
            app: 'Resolver', type: 'wildcards', name, version: '1', exportedAt: new Date().toISOString(), ...(ver ? { appVersion: ver } : {}),
            wildcards: lib().filter(w => out.has(key(w.name))).map(w => ({ name: w.name, lines: w.lines.slice(), ...(w.inOrder ? { inOrder: true } : {}) }))
        };
    }
    const b64 = text => btoa(unescape(encodeURIComponent(text)));
    async function save() {
        const name = fileName(), text = JSON.stringify(payload(), null, 2);
        try {
            const fs = typeof Filesystem !== 'undefined' ? Filesystem : null;
            if (fs) {
                await fs.writeFile({ path: name, data: b64(text), directory: 'DOCUMENTS' });
                remember();
                toast(`Saved to Documents as ${name}`);
            } else {
                const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
                const a = document.createElement('a');
                a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
                URL.revokeObjectURL(url);
                remember();
            }
            close();
        } catch (e) { toast("Couldn't save the file"); }
    }
    async function share() {
        const name = fileName(), text = JSON.stringify(payload(), null, 2);
        const device = window.Capacitor?.Plugins?.ResolverDevice;
        try {
            if (device && device.shareStage && device.shareStaged) {
                await device.shareStage({ data: b64(text), name, mime: 'application/json', reset: true });
                await device.shareStaged({ mime: 'application/json' });
            } else await navigator.share({ files: [new File([text], name, { type: 'application/json' })] });
            remember();
        } catch (e) { if (!(e && e.name === 'AbortError')) toast("Couldn't share the file"); }
    }
    // EXPORT: SAVE TO DEVICE or SHARE, over the button (the thumbnail menu's look; the back gesture closes it).
    function choose(btn) {
        document.getElementById('thumbMenu')?.remove();
        const m = document.createElement('div');
        m.id = 'thumbMenu';
        m.className = 'modal';
        m.innerHTML = '<div class="thumb-menu-box"><button type="button" class="btn-small" data-k="save"><i data-lucide="download" width="16" height="16"></i>SAVE TO DEVICE</button><button type="button" class="btn-small" data-k="share"><i data-lucide="share-2" width="16" height="16"></i>SHARE</button></div>';
        const shut = () => m.remove();
        m.querySelector('[data-k="save"]').onclick = () => { shut(); save(); };
        m.querySelector('[data-k="share"]').onclick = () => { shut(); share(); };
        document.body.appendChild(m);
        if (window.lucide) lucide.createIcons();
        const r = btn.getBoundingClientRect(), box = m.firstChild;
        box.style.left = `${Math.max(8, Math.min(r.right - box.offsetWidth, window.innerWidth - box.offsetWidth - 8))}px`;
        box.style.top = `${Math.max(8, r.top - 6 - box.offsetHeight)}px`;
    }
    window.WcExport = { open, close, render, toggleContent, choose, tap, payload, fileName, toggleAll, toggleGroups, menu, add, invert, clear, _sets: SETS, _picked: () => [...closure()] };
})();
