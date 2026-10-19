// Debug log (Config > Experimental > Enable Debug Log). Records job, network and background events to help
// diagnose problems. V/H = app in view/hidden. Kept in memory only, so it starts empty each time the app opens.
(function () {
    const ENABLED_KEY = 'bojroDebugLogEnabled', MAX = 1500;
    let lines = [];
    const enabled = () => localStorage.getItem(ENABLED_KEY) === 'true';
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    function stamp() {
        const d = new Date();
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
    }
    window.dbg = function (msg) {
        if (!enabled()) return;
        lines.push(`${stamp()} ${document.hidden ? 'H' : 'V'} ${msg}`);
        if (lines.length > MAX) lines.splice(0, lines.length - MAX);
    };

    function header() {
        const c = typeof connectionConfig !== 'undefined' ? connectionConfig : {};
        const pick = k => localStorage.getItem(k);
        dbg(`app started: version ${typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?'}, ${navigator.userAgent}`);
        dbg(`settings: ${c.isRemote ? 'remote' : 'local'}${c.isCloudflare ? ' (Cloudflare)' : ''}, polling ${typeof getGenerationPollingRate === 'function' ? getGenerationPollingRate() : '?'}ms, background polling ${typeof getBackgroundPollingRate === 'function' ? getBackgroundPollingRate() : '?'}ms, live preview ${pick('bojroLivePreviewOn') === 'true' ? 'on' : 'off'}, progress bridge ${pick('bojroProgressBridgeEnabled') === 'true' ? 'on' : 'off'}, live update ${pick('bojroLiveUpdate') === 'true' ? 'on' : 'off'}, data usage ${pick('bojroDataUsageTracker') === 'true' ? 'on' : 'off'}`);
        const d = window.Capacitor?.Plugins?.ResolverDevice;
        if (d?.getDeviceInfo) d.getDeviceInfo().then(i => dbg(`device: ${i.manufacturer}, Android SDK ${i.sdk}`)).catch(() => { });
    }

    document.addEventListener('visibilitychange', () => {
        dbg(document.hidden ? 'app hidden' : 'app visible');
        if (!document.hidden && enabled() && typeof runDiag === 'function' && typeof activeJobs !== 'undefined' && activeJobs.size) runDiag('back in view');
    });
    window.addEventListener('error', e => dbg(`script error: ${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
    window.addEventListener('unhandledrejection', e => dbg(`unhandled rejection: ${e.reason && e.reason.message || e.reason}`));

    window.openDebugLog = function () {
        const box = document.getElementById('debugLogText');
        box.textContent = lines.join('\n') || '(empty)';
        document.getElementById('debugLogModal').classList.remove('hidden');
        box.scrollTop = box.scrollHeight;
    };
    window.closeDebugLog = () => document.getElementById('debugLogModal').classList.add('hidden');
    window.copyDebugLog = async function () {
        const text = lines.join('\n');
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            const r = document.createRange();
            r.selectNodeContents(document.getElementById('debugLogText'));
            const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
            document.execCommand('copy');
            sel.removeAllRanges();
        }
        if (typeof Toast !== 'undefined' && Toast) Toast.show({ text: 'Debug log copied', duration: 'short' });
    };
    window.clearDebugLog = function () {
        lines = [];
        openDebugLog();
    };

    function syncSwitch() {
        const sw = document.getElementById('cfgDebugLogSwitch');
        if (sw) sw.checked = enabled();
        document.getElementById('cfgDebugLogBtn')?.classList.toggle('hidden', !enabled());
    }
    // Switching it off also clears the log.
    window.toggleDebugLog = function () {
        const on = document.getElementById('cfgDebugLogSwitch').checked;
        localStorage.setItem(ENABLED_KEY, on ? 'true' : 'false');
        if (on) header();
        else lines = [];
        syncSwitch();
    };
    syncSwitch();
    if (enabled()) document.addEventListener('DOMContentLoaded', header);
})();
