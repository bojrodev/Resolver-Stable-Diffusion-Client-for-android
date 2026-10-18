// Data Usage tracker (Config > Experimental): approximate data per Generate, queue or Upscale job.
// Counts request/response bodies only (not headers, TLS or compression).
(function () {
    const ENABLED_KEY = 'bojroDataUsageTracker';
    const PILL_KEY = 'bojroDataUsagePill'; // stored as the OFF state: on by default
    const HISTORY_KEY = 'bojroDataUsageHistory';
    const MAX_HISTORY = 50;
    const active = {}; // kind ('gen' or 'up') -> session
    let pillHideTimer = null;
    let pillQueued = false;

    const enabled = () => localStorage.getItem(ENABLED_KEY) === 'true';
    const pillEnabled = () => localStorage.getItem(PILL_KEY) !== 'off';

    function formatBytes(n) {
        if (n < 1024) return `${n} B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
        if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
        return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
    }

    // WIFI / MOBILE etc. from the native check (as Live Preview uses), else the WebView; null if unknown.
    async function connectionType() {
        let t = null;
        try {
            if (window.Capacitor?.Plugins?.ResolverService?.getNetworkType) t = (await Capacitor.Plugins.ResolverService.getNetworkType())?.type;
        } catch (e) {}
        if (!t) t = navigator.connection && navigator.connection.type;
        if (!t || t === 'unknown') return null;
        return { wifi: 'WIFI', cellular: 'MOBILE', ethernet: 'ETHERNET', none: 'OFFLINE' }[t] || t.toUpperCase();
    }
    const MODE_COLOURS = { xl: '#ff9800', anima: '#00c853', qwen: '#ff007f', flux: '#00e5ff', krea: '#b026ff' };

    function bodySize(body) {
        if (body == null) return 0;
        if (typeof body === 'string') return new Blob([body]).size;
        if (body instanceof Blob) return body.size;
        if (body instanceof ArrayBuffer) return body.byteLength;
        if (ArrayBuffer.isView(body)) return body.byteLength;
        return 0;
    }

    // Upscale requests go to the upscale session, the rest to the generation one.
    function sessionFor(url) {
        if (/extra-single-image/.test(url) && active.up) return active.up;
        return active.gen || active.up || null;
    }

    const origFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const s = /^https?:/i.test(url) ? sessionFor(url) : null;
        if (!s) return origFetch(input, init);
        s.sent += bodySize(init && init.body);
        schedulePill();
        const res = await origFetch(input, init);
        if (res.body) {
            // Counted from a copy as it arrives, so the figure moves during a download.
            const reader = res.clone().body.getReader();
            (async () => {
                try {
                    for (;;) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        s.recv += value.byteLength;
                        schedulePill();
                    }
                } catch (e) { /* aborted or dropped */ }
            })();
        } else if (res && res.nativeBytes) {
            // Native replies arrive whole, so they're counted at the end.
            s.recv += res.nativeBytes;
            schedulePill();
        }
        return res;
    };

    // opts: { mode } for the label colour.
    function begin(kind, label, opts = {}) {
        if (!enabled()) return null;
        const s = { kind, label, mode: opts.mode || null, sent: 0, recv: 0, images: 0, steps: 0, live: false, firstImage: null, t: Date.now(), net: null };
        connectionType().then(n => { s.net = n; });
        active[kind] = s;
        schedulePill();
        return s;
    }

    function addSteps(kind, n) {
        if (active[kind] && n > 0) active[kind].steps += n;
    }
    function markLive(kind) {
        if (active[kind]) active[kind].live = true;
    }

    function addImages(kind, count, firstDataUrl) {
        const s = active[kind];
        if (!s || !count) return;
        if (!s.firstImage && firstDataUrl) s.firstImage = firstDataUrl;
        s.images += count;
    }

    // Small JPEG copy of the first image for the history list.
    function makeThumb(dataUrl) {
        return new Promise(resolve => {
            if (!dataUrl) return resolve(null);
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, 120 / Math.max(img.width, img.height));
                const c = document.createElement('canvas');
                c.width = Math.max(1, Math.round(img.width * scale));
                c.height = Math.max(1, Math.round(img.height * scale));
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                try { resolve(c.toDataURL('image/jpeg', 0.7)); } catch (e) { resolve(null); }
            };
            img.onerror = () => resolve(null);
            img.src = dataUrl;
        });
    }

    function readHistory() {
        try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch (e) { return []; }
    }
    function writeHistory(list) {
        // Drops the oldest entries if storage is full.
        while (list.length) {
            try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); return; } catch (e) { list.pop(); }
        }
        localStorage.removeItem(HISTORY_KEY);
    }

    async function end(s, status) {
        if (!s) return;
        if (active[s.kind] === s) delete active[s.kind];
        schedulePill(true);
        // Tracking switched off mid-job (which clears the history): don't record it.
        if (!enabled()) return;
        // Lets the last bytes of a download finish counting.
        await new Promise(r => setTimeout(r, 300));
        const thumb = await makeThumb(s.firstImage);
        // Start and end connection, e.g. "WIFI → MOBILE" if it switched during the job.
        const netEnd = await connectionType();
        const net = s.net && netEnd && s.net !== netEnd ? `${s.net} → ${netEnd}` : (s.net || netEnd);
        const list = readHistory();
        list.unshift({ t: s.t, label: s.label, mode: s.mode, kind: s.kind, sent: s.sent, recv: s.recv, images: s.images, steps: s.steps, live: s.live, status, thumb, net });
        writeHistory(list.slice(0, MAX_HISTORY));
        const modal = document.getElementById('dataUsageModal');
        if (modal && !modal.classList.contains('hidden')) renderHistory();
    }

    // Floating counter while a job runs; fades a few seconds after the last one ends.
    function schedulePill(ended) {
        if (pillQueued) return;
        pillQueued = true;
        requestAnimationFrame(() => {
            pillQueued = false;
            updatePill();
        });
        if (ended) setTimeout(updatePill, 350);
    }
    let lastTotals = { sent: 0, recv: 0 };
    function updatePill() {
        const pill = document.getElementById('dataUsagePill');
        if (!pill) return;
        const sessions = Object.values(active);
        if (!pillEnabled()) {
            pill.classList.remove('visible');
            return;
        }
        if (sessions.length) {
            lastTotals = sessions.reduce((a, s) => ({ sent: a.sent + s.sent, recv: a.recv + s.recv }), { sent: 0, recv: 0 });
            clearTimeout(pillHideTimer);
            pillHideTimer = null;
            pill.classList.add('visible');
        } else if (!pillHideTimer && pill.classList.contains('visible')) {
            pillHideTimer = setTimeout(() => { pill.classList.remove('visible'); pillHideTimer = null; }, 4000);
        }
        pill.textContent = `↑ ${formatBytes(lastTotals.sent)}  ↓ ${formatBytes(lastTotals.recv)}`;
    }

    function renderHistory() {
        const listEl = document.getElementById('dataUsageList');
        const sumEl = document.getElementById('dataUsageSummary');
        if (!listEl) return;
        const list = readHistory();
        document.getElementById('dataUsageClearBtn')?.classList.toggle('hidden', !list.length);
        listEl.innerHTML = '';
        if (!list.length) {
            listEl.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:12px; padding:20px 0;">No jobs recorded yet</div>';
            if (sumEl) sumEl.textContent = '';
            return;
        }
        let sent = 0, recv = 0;
        list.forEach(e => {
            sent += e.sent; recv += e.recv;
            const row = document.createElement('div');
            row.className = 'data-usage-row';
            const thumb = document.createElement('div');
            thumb.className = 'data-usage-thumb';
            if (e.thumb) {
                const img = document.createElement('img');
                img.src = e.thumb;
                thumb.appendChild(img);
            } else {
                thumb.innerHTML = '<i data-lucide="image-off" width="18" height="18"></i>';
            }
            if (e.images > 0) {
                const badge = document.createElement('span');
                badge.className = 'gal-badge data-usage-count';
                badge.textContent = `x${e.images}`;
                thumb.appendChild(badge);
            }
            const info = document.createElement('div');
            info.className = 'data-usage-info';
            const d = new Date(e.t);
            const when = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            info.innerHTML = `<div class="data-usage-title"></div><div class="data-usage-when"><span></span></div>
                <div class="data-usage-figures"><span>↑ ${formatBytes(e.sent)}</span><span>↓ ${formatBytes(e.recv)}</span><span class="data-usage-total">${formatBytes(e.sent + e.recv)}</span></div>`;
            // Title: mode in its accent colour, LIVE PREVIEW chip and step count.
            const title = info.querySelector('.data-usage-title');
            const label = document.createElement('span');
            label.textContent = e.label;
            if (MODE_COLOURS[e.mode]) label.style.color = MODE_COLOURS[e.mode];
            title.appendChild(label);
            if (e.live) {
                const chip = document.createElement('span');
                chip.className = 'gal-badge data-usage-live';
                chip.textContent = 'LIVE PREVIEW';
                title.appendChild(chip);
            }
            if (e.steps > 0) {
                const steps = document.createElement('span');
                steps.className = 'data-usage-steps';
                steps.textContent = `${e.steps} STEPS`;
                title.appendChild(steps);
            }
            // Aborted/failed goes on the thumbnail, keeping the title to one line.
            if (e.status && e.status !== 'ok') {
                const st = document.createElement('span');
                st.className = 'gal-badge data-usage-status';
                st.textContent = e.status.toUpperCase();
                thumb.appendChild(st);
            }
            info.querySelector('.data-usage-when span').textContent = when;
            if (e.net) {
                const chip = document.createElement('span');
                chip.className = 'gal-badge data-usage-net' + (/MOBILE/.test(e.net) ? ' mobile' : '');
                chip.textContent = e.net;
                info.querySelector('.data-usage-when').appendChild(chip);
            }
            row.append(thumb, info);
            listEl.appendChild(row);
        });
        if (sumEl) sumEl.textContent = `Last ${list.length} job${list.length === 1 ? '' : 's'}: ↑ ${formatBytes(sent)}  ↓ ${formatBytes(recv)}  = ${formatBytes(sent + recv)}`;
        if (window.lucide) lucide.createIcons();
        requestAnimationFrame(() => { fitLines(); fitDataUsageListHeight(); });
    }

    // One row per line on narrow screens: LIVE PREVIEW becomes LIVE, then the text shrinks.
    function fitLines() {
        const over = el => el.scrollWidth > el.clientWidth + 0.5;
        document.querySelectorAll('#dataUsageList .data-usage-info > div').forEach(line => {
            if (!over(line)) return;
            const live = line.querySelector('.data-usage-live');
            if (live) live.textContent = 'LIVE';
            if (over(line)) line.style.fontSize = '11px';
        });
    }

    // Whole rows only, clean at both ends of the scroll (as the other lists).
    function fitDataUsageListHeight() {
        const list = document.getElementById('dataUsageList');
        if (list && typeof fitListToWholeRows === 'function') fitListToWholeRows(list, list.querySelectorAll('.data-usage-row'));
    }
    window.fitDataUsageListHeight = fitDataUsageListHeight;

    window.openDataUsageHistory = function () {
        renderHistory();
        document.getElementById('dataUsageModal').classList.remove('hidden');
        if (typeof lockBodyScroll === 'function') lockBodyScroll();
    };
    window.closeDataUsageHistory = function () {
        document.getElementById('dataUsageModal').classList.add('hidden');
        if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
    };
    window.clearDataUsageHistory = async function () {
        if (!(await window.appConfirm('Clear the data usage history?', { title: 'Data Usage', okText: 'CLEAR', danger: true }))) return;
        localStorage.removeItem(HISTORY_KEY);
        // Closes the window, as Clear all in the Analyzer's Recent does.
        window.closeDataUsageHistory();
        if (typeof Toast !== 'undefined' && Toast) Toast.show({ text: 'Cleared', duration: 'short' });
    };
    // The Floating Data Counter switch only shows while tracking is on.
    function syncSwitches() {
        const sw = document.getElementById('cfgDataUsageSwitch');
        const pillSw = document.getElementById('cfgDataUsagePillSwitch');
        if (sw) sw.checked = enabled();
        if (pillSw) pillSw.checked = pillEnabled();
        document.getElementById('cfgDataUsagePillRow')?.classList.toggle('hidden', !enabled());
        document.getElementById('cfgDataUsageHistoryBtn')?.classList.toggle('hidden', !enabled());
    }
    // Switching tracking off also clears the history.
    window.toggleDataUsageTracker = function () {
        const on = document.getElementById('cfgDataUsageSwitch').checked;
        localStorage.setItem(ENABLED_KEY, on ? 'true' : 'false');
        if (!on) localStorage.removeItem(HISTORY_KEY);
        syncSwitches();
    };
    window.toggleDataUsagePill = function () {
        const on = document.getElementById('cfgDataUsagePillSwitch').checked;
        localStorage.setItem(PILL_KEY, on ? 'on' : 'off');
        updatePill();
    };
    syncSwitches();

    window.DataUsage = { begin, end, addImages, addSteps, markLive, formatBytes };
})();
