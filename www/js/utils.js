// --- BODY SCROLL LOCK (foreground picker/browser modals) ---
// A counter, so lock/unlock calls nest safely.
let bodyScrollLockCount = 0;
window.lockBodyScroll = function() {
    bodyScrollLockCount++;
    // Only the first lock captures the pre-lock scroll position (see body.scroll-locked, style.css).
    if (bodyScrollLockCount === 1) {
        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        document.body.dataset.scrollLockY = String(scrollY);
        document.body.style.top = `-${scrollY}px`;
    }
    document.body.classList.add('scroll-locked');
}
window.unlockBodyScroll = function() {
    bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
    if (bodyScrollLockCount === 0) {
        document.body.classList.remove('scroll-locked');
        const scrollY = parseInt(document.body.dataset.scrollLockY || '0', 10);
        document.body.style.top = '';
        delete document.body.dataset.scrollLockY;
        window.scrollTo(0, scrollY);
    }
}

// Opens an external URL in a Chrome Custom Tab via Capacitor Browser (as updater.js). window.open(url, '_system') traps the user inside the WebView; window.open(url, '_blank') is only the non-native fallback.
window.openExternalLink = function(url) {
    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
            window.Capacitor.Plugins.Browser.open({ url });
        } else {
            window.open(url, '_blank');
        }
    } catch (e) {
        window.open(url, '_blank');
    }
}

let __appConfirmResolveFn = null;

// Renders a dialog's message as plain text (textContent). With link {text, url}, the first occurrence of link.text becomes a DOM-built clickable span that opens through window.openExternalLink().
function setDialogMessage(el, message, link) {
    el.textContent = '';
    if (!link || !message.includes(link.text)) {
        el.textContent = message;
        return;
    }
    const idx = message.indexOf(link.text);
    el.appendChild(document.createTextNode(message.slice(0, idx)));
    const linkEl = document.createElement('span');
    linkEl.textContent = link.text;
    linkEl.style.color = 'var(--accent-primary)';
    linkEl.style.textDecoration = 'underline';
    linkEl.style.cursor = 'pointer';
    linkEl.onclick = () => window.openExternalLink(link.url);
    el.appendChild(linkEl);
    el.appendChild(document.createTextNode(message.slice(idx + link.text.length)));
}

// --- IN-APP CONFIRM MODAL ---
// Replaces the native confirm(): `await window.appConfirm(...)`; CANCEL or back closes it. options.checkbox adds a
// checkbox (read with appConfirmChecked()).
function setAppConfirmCheckbox(text) {
    const row = document.getElementById('appConfirmCheckRow');
    if (!row) return;
    row.classList.toggle('hidden', !text);
    document.getElementById('appConfirmModal')?.classList.toggle('has-check', !!text);
    document.getElementById('appConfirmCheck').checked = false;
    document.getElementById('appConfirmCheckText').textContent = text || '';
}
// extra: an element shown under the message (appConfirm()), e.g. images to untick; cleared otherwise.
function setAppConfirmExtra(el) {
    const box = document.getElementById('appConfirmExtra');
    if (!box) return;
    box.textContent = '';
    if (el) box.appendChild(el);
    box.classList.toggle('hidden', !el);
}
window.appConfirmChecked = () => document.getElementById('appConfirmCheck')?.checked === true;
window.appConfirm = function(message, options = {}) {
    return new Promise((resolve) => {
        __appConfirmResolveFn = resolve;
        __appConfirmKeepOpen = !!options.keepOpenOnOk;
        const titleEl = document.getElementById('appConfirmTitle');
        const msgEl = document.getElementById('appConfirmMessage');
        const okBtn = document.getElementById('appConfirmOkBtn');
        const cancelBtn = document.getElementById('appConfirmCancelBtn');
        if (titleEl) titleEl.textContent = options.title || 'Confirm';
        setAppConfirmCheckbox(options.checkbox);
        setAppConfirmExtra(options.extra);
        if (msgEl) setDialogMessage(msgEl, message, options.link);
        document.getElementById('appConfirmModal')?.classList.toggle('no-sub', !message);
        if (okBtn) {
            okBtn.textContent = options.okText || 'CONFIRM';
            okBtn.style.background = options.danger ? '#f44336' : 'var(--accent-gradient)';
        }
        if (cancelBtn) {
            // Explicitly shown, since appAlert() hides this button for its single-OK case.
            cancelBtn.classList.remove('hidden');
            cancelBtn.textContent = options.cancelText || 'CANCEL';
        }
        document.getElementById('appConfirmModal')?.classList.remove('hidden');
        if (typeof lockBodyScroll === 'function') lockBodyScroll();
    });
}
// The page's background also behind the WebView (ResolverBootPlugin), so a reload doesn't flash black.
window.paintNativeBg = function () {
    try {
        const c = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(document.body).backgroundColor);
        if (!c) return;
        const color = '#' + c.slice(1, 4).map(n => (+n).toString(16).padStart(2, '0')).join('');
        Promise.resolve(window.Capacitor?.Plugins?.ResolverBoot?.background?.({ color })).catch(() => {});
    } catch (e) {}
};
// Same modal as appConfirm() without the Cancel button (native alert() shape).
window.appAlert = function(message, options = {}) {
    return new Promise((resolve) => {
        __appConfirmResolveFn = resolve;
        __appConfirmKeepOpen = false;
        setAppConfirmExtra(null);
        const titleEl = document.getElementById('appConfirmTitle');
        const msgEl = document.getElementById('appConfirmMessage');
        const okBtn = document.getElementById('appConfirmOkBtn');
        const cancelBtn = document.getElementById('appConfirmCancelBtn');
        if (titleEl) titleEl.textContent = options.title || 'Notice';
        setAppConfirmCheckbox(null);
        if (msgEl) setDialogMessage(msgEl, message, options.link);
        document.getElementById('appConfirmModal')?.classList.toggle('no-sub', !message);
        if (okBtn) {
            okBtn.textContent = options.okText || 'OK';
            okBtn.style.background = options.danger ? '#f44336' : 'var(--accent-gradient)';
        }
        if (cancelBtn) cancelBtn.classList.add('hidden');
        document.getElementById('appConfirmModal')?.classList.remove('hidden');
        if (typeof lockBodyScroll === 'function') lockBodyScroll();
    });
}
// With appConfirm(..., { keepOpenOnOk: true }), OK leaves the dialog up (its buttons disabled) until the caller's
// closeAppConfirm(), so it can go in the same frame as the change it confirmed.
let __appConfirmKeepOpen = false;
window.closeAppConfirm = function() {
    __appConfirmKeepOpen = false;
    document.querySelectorAll('#appConfirmOkBtn, #appConfirmCancelBtn').forEach(b => { b.disabled = false; });
    document.getElementById('appConfirmModal')?.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
};
window.__appConfirmResolve = function(result) {
    if (result && __appConfirmKeepOpen) {
        if (!__appConfirmResolveFn) return;
        document.querySelectorAll('#appConfirmOkBtn, #appConfirmCancelBtn').forEach(b => { b.disabled = true; });
    } else {
        window.closeAppConfirm();
    }
    if (__appConfirmResolveFn) {
        __appConfirmResolveFn(result);
        __appConfirmResolveFn = null;
    }
}

// --- BATTERY OPTIMIZATION HELPERS ---

window.requestBatteryPerm = async function() {
    localStorage.setItem('bojroBatteryOpt', 'true');
    document.getElementById('batteryModal').classList.add('hidden');
    const say = text => { if (typeof Toast !== 'undefined') Toast.show({ text, duration: 'short' }); };
    // Asks Android first (item 75): nothing opens when Resolver is already exempt.
    const device = window.Capacitor?.Plugins?.ResolverDevice;
    if (device && device.requestBatteryExemption) {
        try {
            const r = await device.requestBatteryExemption();
            say(r && r.already ? 'Background mode is already on' : r && r.opened ? 'Opening Settings...' : "Couldn't open Settings");
            return;
        } catch (e) { }
    }
    // An older app build: the old way.
    const svc = window.Capacitor?.Plugins?.ResolverService || (typeof ResolverService !== 'undefined' ? ResolverService : null);
    if (svc) svc.requestBatteryOpt();
    say('Opening Settings...');
}

window.skipBatteryPerm = function() {
    localStorage.setItem('bojroBatteryOpt', 'true');
    document.getElementById('batteryModal').classList.add('hidden');
}

// --- QUEUE PERSISTENCE HELPERS ---

function loadQueueState() {
    const saved = localStorage.getItem('bojroQueueState');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.ongoing) queueState.ongoing = parsed.ongoing;
            if (parsed.next) queueState.next = parsed.next;
            if (parsed.completed) queueState.completed = parsed.completed;
            updateQueueBadge();

            // One-time cleanup of oversized completed-job data from older versions: strips large image fields and caps the list length.
            if (typeof stripLargePayloadFields === 'function' && queueState.completed.length > 0) {
                let changed = false;
                queueState.completed.forEach(job => {
                    if (job.payload && (job.payload.init_images || job.payload.mask)) {
                        job.payload = stripLargePayloadFields(job.payload);
                        changed = true;
                    }
                });
                if (typeof MAX_COMPLETED_HISTORY !== 'undefined' && queueState.completed.length > MAX_COMPLETED_HISTORY) {
                    queueState.completed.splice(0, queueState.completed.length - MAX_COMPLETED_HISTORY);
                    changed = true;
                }
                if (changed && typeof saveQueueState === 'function') saveQueueState();
            }
        } catch (e) {}
    }
}

async function saveQueueState() {
    try {
        localStorage.setItem('bojroQueueState', JSON.stringify(queueState));
    } catch (e) {
        console.error(e);
        await window.appAlert("Couldn't save queue state: " + e.message, { title: 'Error', danger: true });
    }
    updateQueueBadge();
}

function updateQueueBadge() {
    const totalPending = queueState.ongoing.length + queueState.next.length;
    const badge = document.getElementById('queueBadge');
    if (badge) {
        badge.innerText = totalPending;
        badge.classList.toggle('hidden', totalPending === 0);
    }
}

// --- NOTIFICATIONS & BACKGROUND ---

async function createNotificationChannel() {
    if (!LocalNotifications) return;
    try {
        await LocalNotifications.createChannel({
            id: 'gen_complete_channel',
            name: 'Generation Complete',
            importance: 4,
            visibility: 1,
            vibration: true
        });
        await LocalNotifications.createChannel({
            id: 'batch_channel',
            name: 'Generation Status',
            importance: 2,
            visibility: 1,
            vibration: false
        });
    } catch (e) {}
}

function clearCompletionNotification() {
    LocalNotifications?.removeDeliveredNotifications?.({ notifications: [{ id: 2002, title: '', body: '' }] })?.catch(() => {});
}

function setupBackgroundListeners() {
    if (!App) return;
    clearCompletionNotification();
    App.addListener('resume', async () => {
        clearCompletionNotification();
        if (LocalNotifications) {
            try {
                const pending = await LocalNotifications.getPending();
                if (pending.notifications.length > 0) await LocalNotifications.cancel(pending);
            } catch (e) {}
        }
        // Auto-connect only if models aren't loaded and isEngineConnected is false (a native file picker also backgrounds the app). Reads connectionConfig first, then the legacy key.
        const hasHost = (typeof connectionConfig !== 'undefined' && connectionConfig.baseIp) ||
                         localStorage.getItem('bojroHostIp');
        if (hasHost && !isEngineConnected) {
            window.connect(true);
        }
    });
}

let lastNotifTime = 0; // Tracks the last time we updated Android
let lastProgress = -1; // Tracks the last progress % we sent
let progressNotifStopped = false; // set by stopProgressService() (engine.js)

async function updateBatchNotification(title, force = false, body = "") {
    if (progressNotifStopped && !force) {
        if (window.dbg) window.dbg(`late notification update dropped: ${title}`);
        return;
    }
    progressNotifStopped = false;
    let progressVal = 0;
    
    // 1. Calculate Progress %
    try {
        // "Step 50 / 62 [1 face]": the numbers either side of the slash.
        const m = body ? /(\d+)\s*\/\s*(\d+)/.exec(body) : null;
        if (m) {
            const current = parseInt(m[1], 10) || 0, total = parseInt(m[2], 10) || 1;
            if (total > 0) progressVal = Math.min(100, Math.floor((current / total) * 100));
        }
    } catch (e) {
        progressVal = 0;
    }

    // 2. THROTTLING LOGIC (The Fix)
    const now = Date.now();
    // Only update if:
    // a. 'force' is true (e.g., Generation is Done)
    // b. OR it has been more than 250ms since the last update (Android drops updates beyond ~5 a second)
    // c. OR progress is 0% (Start) or 100% (Finish)
    if (!force && (now - lastNotifTime < 250) && progressVal !== 0 && progressVal !== 100) {
        return; // SKIP this update (Prevent freezing)
    }

    // 3. Update the Timers
    lastNotifTime = now;
    lastProgress = progressVal;

    // 4. Send to Native Service (Safely)
    // We check multiple places where the plugin might exist
    const svc = (typeof ResolverService !== 'undefined' ? ResolverService : null) || 
                (window.Capacitor && window.Capacitor.Plugins ? window.Capacitor.Plugins.ResolverService : null);

    // Step counts go in the title, which Android shows even when collapsed; "Step" dropped so 4-digit counts fit.
    if (body && body.includes(" / ")) {
        title = `${title.replace(/\.+$/, '')}: ${body.replace(/^Step /, '').replace(/\s*\/\s*/, '/')}`;
        body = "";
    }
    // One line, as the button reads; nothing under it (item 53).
    if (body) { title = `${title.replace(/\.+$/, '')}: ${body}`; body = ""; }

    if (svc) {
        try {
            const t0 = Date.now();
            await svc.updateProgress({
                title: title,
                body: body,
                progress: progressVal
            });
            // Debug log: a slow reply from the native side.
            if (window.dbg && Date.now() - t0 > 1000) window.dbg(`native notification update took ${Date.now() - t0}ms`);
        } catch (e) {
            if (window.dbg) window.dbg('native notification update failed: ' + e);
            console.error("Native Service Error:", e);
        }
    }
}

async function sendCompletionNotification(msg) {
    // Only fire an OS notification when the app isn't in the foreground.
    if (document.hidden && LocalNotifications) {
        try {
            await LocalNotifications.schedule({
                notifications: [{
                    title: "Generation Complete",
                    body: msg,
                    id: 2002,
                    channelId: 'gen_complete_channel',
                    // A drawable name (the plugin looks only there): the Notification icon chosen in Config > Experimental.
                    smallIcon: { badge: 'ic_stat_badge', bold: 'ic_stat_bold', sparkles: 'ic_stat_sparkles' }[localStorage.getItem('bojroNotificationIcon')] || 'ic_stat_resolver'
                }]
            });
        } catch (e) {}
    }
}

// --- FILE SYSTEM & NETWORK UTILS ---

const getHeaders = () => ({
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true'
});

// <prefix>_YYMMDD_SEED.png (.jpg / .webp for those). The seed is read from the image's embedded metadata (Forge writes it), so it works for fresh results and later saves from the viewer. prefix defaults to 'bojro' (Comfy passes 'comfy'). Falls back to a millisecond timestamp. The seed lookup is shared with the long-press "send seed" feature (engine.js).
async function extractSeedFromDataUrl(base64Data) {
    try {
        const blob = await (await fetch(base64Data)).blob();
        const meta = await readPngMetadata(blob);
        if (meta) {
            const seedMatch = meta.match(/Seed:\s*(-?\d+)/);
            if (seedMatch && seedMatch[1] !== '-1') return seedMatch[1];
        }
    } catch (e) {}
    return null;
}

// `tag` is appended to the name (Upscale: the scale); `seedOverride` replaces the image's seed.
async function buildOutputFileName(base64Data, prefix = 'bojro', tag = '', seedOverride = null) {
    const now = new Date();
    const dateStr = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    let suffix = String(Date.now());
    const seed = seedOverride !== null && seedOverride !== undefined ? seedOverride : await extractSeedFromDataUrl(base64Data);
    // A resolved seed is never -1 (extractSeedFromDataUrl() excludes it).
    if (seed !== null) suffix = seed;
    const ext = { 'image/jpeg': '.jpg', 'image/webp': '.webp' }[imageMimeFromBase64(base64Data)] || '.png';
    return `${prefix}_${dateStr}_${suffix}${tag ? '_' + tag : ''}${ext}`;
}

let resolverSaveQueue = Promise.resolve();

// fileName, or fileName with " (n)" if it already exists in Documents/Resolver.
async function uniqueResolverFileName(fileName) {
    const exists = async (name) => {
        try {
            await Filesystem.stat({ path: `Resolver/${name}`, directory: 'DOCUMENTS' });
            return true;
        } catch (e) {
            return false;
        }
    };
    if (!(await exists(fileName))) return fileName;
    const dot = fileName.lastIndexOf('.');
    const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
    const ext = dot > 0 ? fileName.slice(dot) : '';
    for (let n = 1; n < 1000; n++) {
        const candidate = `${stem} (${n})${ext}`;
        if (!(await exists(candidate))) return candidate;
    }
    return fileName;
}

// quiet: no "Image saved" (the caller shows one for several). True once saved.
async function saveToMobileGallery(base64Data, prefix = 'bojro', tag = '', seedOverride = null, quiet = false) {
    try {
        const isNative = window.Capacitor && window.Capacitor.isNative;
        const fileName = await buildOutputFileName(base64Data, prefix, tag, seedOverride);
        if (isNative) {
            const cleanBase64 = base64Data.split(',')[1];
            // Queued so same-name saves get distinct names.
            const run = resolverSaveQueue.then(async () => {
                const finalName = await uniqueResolverFileName(fileName);
                await Filesystem.writeFile({
                    path: `Resolver/${finalName}`,
                    data: cleanBase64,
                    directory: 'DOCUMENTS',
                    recursive: true
                });
            });
            resolverSaveQueue = run.catch(() => {});
            await run;
            if (Toast && !quiet) await Toast.show({
                text: 'Image saved',
                duration: 'short',
                position: 'bottom'
            });
        } else {
            const link = document.createElement('a');
            link.href = base64Data;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
        markImageSavedToPhone(base64Data);
        return true;
    } catch (e) {
        console.error("Save failed", e);
        return false;
    }
}

// --- AUTO-DELETE WARNING (Config > History & Results, on by default) ---
// Images saved to the phone, by a cheap key of their data (the last 500), for the warning's SAVED label.
const SAVED_IMAGE_KEYS = 'bojroSavedImageKeys';
function imageDataKey(data) {
    const s = String(data || '');
    const h = s.length >> 1;
    return `${s.length}|${s.slice(h, h + 48)}|${s.slice(-150, -100)}`;
}
function savedImageKeys() {
    try { return JSON.parse(localStorage.getItem(SAVED_IMAGE_KEYS) || '[]'); } catch (e) { return []; }
}
function markImageSavedToPhone(data) {
    const key = imageDataKey(data);
    try { localStorage.setItem(SAVED_IMAGE_KEYS, JSON.stringify([...savedImageKeys().filter(k => k !== key), key].slice(-500))); } catch (e) {}
}

// Gallery images a job of newCount images would delete (oldest first), and how many of the new ones go too. With a limit
// given (a lower Gallery Cache Limit), what that limit would delete now.
function galleryDeletionPreview(newCount, newLimit) {
    return new Promise(resolve => {
        const limit = newLimit || getGalleryCacheLimit();
        const done = old => resolve({ old, newLost: Math.max(0, newCount - limit), limit });
        if (!db || (newCount <= 0 && !newLimit)) return done([]);
        try {
            const store = db.transaction(['images'], 'readonly').objectStore('images');
            const favs = window.GalleryFavs ? GalleryFavs.ids() : new Set();
            const keysReq = store.getAllKeys();
            keysReq.onsuccess = () => {
                const keys = keysReq.result.filter(k => !favs.has(k));
                const total = keys.length;
                const goes = Math.max(0, Math.min(total, total + newCount - limit));
                if (!goes) return done([]);
                // Oldest first, as pruneGalleryOverflow() deletes them; favourites never.
                const old = [];
                keys.slice(0, goes).forEach((k, i) => {
                    const r = store.get(k);
                    r.onsuccess = () => { old[i] = r.result; if (old.filter(Boolean).length === goes) done(old); };
                    r.onerror = () => done(old.filter(Boolean));
                });
            };
            keysReq.onerror = () => done([]);
        } catch (e) { done([]); }
    });
}

// Before a job that will push unsaved images out of the gallery: shows all that go (tap one to view it) and asks to continue.
// Resolves true/false, or null with the warning off (the caller then keeps its own Gallery Cache Limit check).
let autoDeleteAnswer = null;
window.answerAutoDelete = function(ok) {
    if (autoDeleteAnswer) autoDeleteAnswer(ok);
};
// action: what the text says is about to happen ("Upscaling"); "Generating N images" by default. newLimit: a lower
// Gallery Cache Limit about to be set, warned about even when every image that goes is saved.
window.confirmAutoDelete = async function(newCount, action = null, newLimit = 0) {
    if (localStorage.getItem('bojroAutoDeleteWarning') === 'false') return null;
    if (autoDeleteAnswer) autoDeleteAnswer(false);
    let preview = await galleryDeletionPreview(newCount, newLimit);
    const savedNow = new Set(savedImageKeys());
    const autoSave = document.getElementById('autoDlCheck')?.checked;
    if (newLimit ? !preview.old.length : !preview.old.some(item => !savedNow.has(imageDataKey(item.data))) && !(preview.newLost && !autoSave)) return true;
    const modal = document.getElementById('autoDeleteModal');
    const viewer = document.getElementById('fullScreenModal');
    const render = () => {
        const { old, newLost, limit } = preview;
        const n = old.length, plural = c => c === 1 ? '' : 's';
        const doing = action || `Generating ${newCount} image${plural(newCount)}`;
        let text = n
            ? `${doing} will delete the ${n === 1 ? 'oldest image' : `${n} oldest images`} in the gallery${newLimit ? '' : ` (Gallery Cache Limit: ${limit})`}.`
            : newLost ? `${doing} is over the Gallery Cache Limit of ${limit}.` : 'Nothing in the gallery will be deleted now.';
        if (newLost) text += ` The first ${newLost} of the new images will be deleted before it finishes too.`;
        document.getElementById('autoDeleteText').textContent = text;
        const saved = new Set(savedImageKeys());
        const grid = document.getElementById('autoDeleteGrid');
        grid.textContent = '';
        old.forEach((item, i) => {
            const tile = document.createElement('div');
            tile.className = 'ana-history-tile';
            const img = document.createElement('img');
            img.alt = '';
            img.src = item.thumbnail || item.data;
            tile.appendChild(img);
            if (saved.has(imageDataKey(item.data))) {
                const label = document.createElement('div');
                label.className = 'autodel-saved';
                label.textContent = 'SAVED';
                tile.appendChild(label);
            }
            tile.addEventListener('click', () => {
                viewer.classList.add('fs-from-autodelete');
                openFullscreen(old.map(r => ({ id: r.id, data: r.data, upscale: r.upscale })), i);
            });
            grid.appendChild(tile);
        });
        grid.classList.toggle('hidden', !n);
    };
    render();
    modal.classList.remove('hidden');
    // Back from the viewer: an image deleted there changes the list.
    const watch = new MutationObserver(async () => {
        if (!viewer.classList.contains('hidden') || !viewer.classList.contains('fs-from-autodelete')) return;
        viewer.classList.remove('fs-from-autodelete');
        preview = await galleryDeletionPreview(newCount, newLimit);
        render();
    });
    watch.observe(viewer, { attributes: true, attributeFilter: ['class'] });
    let answer;
    const ok = await new Promise(resolve => { autoDeleteAnswer = answer = resolve; });
    watch.disconnect();
    // A newer warning may already be showing.
    if (autoDeleteAnswer === answer) {
        autoDeleteAnswer = null;
        modal.classList.add('hidden');
    }
    return ok;
};

// *** FIXED VRAM PROFILE LOGIC FOR FLUX (12GB 3060) ***
function getVramMapping() {
    const profile = document.getElementById('vramProfile').value;
    switch (profile) {
        case 'low':
            // "Neo" Safety Mode: Reserves 6GB.
            return 6144; 
        case 'mid':
            // "Goldilocks Zone": Reserves 4.5 GB.
            return 4608; 
        case 'high':
            // "Risky": Reserves 1GB.
            return 1024; 
        default:
            return 4608;
    }
}

// --- DATABASE (IndexedDB) ---

// Wrapper function to initialize DB (called in boot.js)
function initDatabase() {
    const request = indexedDB.open("BojroHybridDB", 2)
    request.onupgradeneeded = e => {
        db = e.target.result;
        if (!db.objectStoreNames.contains("images")) {
            db.createObjectStore("images", { keyPath: "id", autoIncrement: true });
        }

        if (!db.objectStoreNames.contains("comfy_templates")) {
            db.createObjectStore("comfy_templates", { keyPath: "name" });
        }
    };
    request.onsuccess = e => {
        db = e.target.result;
        // Trim any backlog to the cache limit before the gallery's first read.
        pruneGalleryOverflow().finally(() => {
            // Call loadGallery if it exists (it will be in engine.js)
            if (typeof loadGallery === 'function') {
                loadGallery();
            }
        });
    };
}

// Makes a small JPEG thumbnail via canvas, sized from devicePixelRatio (capped at 640px). Resolves to null on failure so callers use the full image.
function generateThumbnail(base64) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const ESTIMATED_CELL_CSS_SIZE = 150;
            const THUMB_MAX_DIMENSION = Math.min(640, Math.round(ESTIMATED_CELL_CSS_SIZE * (window.devicePixelRatio || 2)));
            const scale = Math.min(1, THUMB_MAX_DIMENSION / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            try {
                resolve(canvas.toDataURL('image/jpeg', 0.82));
            } catch (e) {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = base64;
    });
}

// Results are shown first and saved to History in the background, as thumbnail creation is slow. Saves are chained so History keeps generation order. Resolves to the new History id (or null), never rejects, and waits at most IMAGE_SAVE_TIMEOUT_MS per image. loadGallery() waits for pending saves.
let imageSaveChain = Promise.resolve();
let imageSavesPending = 0;
let IMAGE_SAVE_TIMEOUT_MS = 15000;
// `upscale` ({scale, seed}) marks an Upscale result; `badges` lists its gallery badges.
// `wc`: the image's wildcard picks (Reroll, wcreroll.js).
function saveImageToDBInBackground(base64, upscale = null, badges = null, wc = null) {
    imageSavesPending++;
    const saved = imageSaveChain.then(() => Promise.race([
        saveImageToDB(base64, upscale, badges, wc),
        new Promise(resolve => setTimeout(() => resolve(null), IMAGE_SAVE_TIMEOUT_MS))
    ])).catch(() => null);
    imageSaveChain = saved.then(() => {
        imageSavesPending--;
        if (!imageSavesPending && typeof scheduleGalleryRefresh === 'function') scheduleGalleryRefresh();
    });
    return saved;
}

function saveImageToDB(base64, upscale = null, badges = null, wc = null) {
    return new Promise(async (resolve) => {
        // Anything that can throw here (e.g. db.transaction() on a closed connection) must resolve to null itself: an exception in an async executor leaves the promise unsettled and would stall the save queue.
        try {
            if (!db) {
                resolve(null);
                return;
            }
            // Awaited before opening the transaction, which would auto-close if left idle.
            const thumbnail = await generateThumbnail(base64);
            const tx = db.transaction(["images"], "readwrite");
            const store = tx.objectStore("images");
            const rec = {
                data: base64,
                // null (not the full image) when generation failed; loadGallery() falls back to item.data.
                thumbnail: thumbnail,
                date: new Date().toLocaleString(),
                ts: Date.now(),
                ...(upscale ? { upscale } : {}),
                ...(badges && badges.length ? { badges } : {}),
                ...(wc ? { wc } : {})
            };
            const req = store.add(rec);
            req.onsuccess = (e) => {
                resolve(e.target.result);
                // History's light copy (gallerylite.js).
                if (window.GalleryLite) GalleryLite.add({ ...rec, id: e.target.result });
                // Keep the cache trimmed as images arrive.
                pruneGalleryOverflow();
            };
            req.onerror = () => resolve(null);
        } catch (err) {
            console.warn('Could not save image to History:', err);
            resolve(null);
        }
    });
}

// --- GALLERY CACHE LIMIT ---
// Caps the IndexedDB store to the most recent N images and deletes older ones.

const DEFAULT_GALLERY_CACHE_LIMIT = 30;

function getGalleryCacheLimit() {
    const saved = parseInt(localStorage.getItem('bojroGalleryCacheLimit'));
    return (!isNaN(saved) && saved > 0) ? saved : DEFAULT_GALLERY_CACHE_LIMIT;
}

// Saves the limit, then prunes and reloads the gallery (debounced, GALLERY_CACHE_DEBOUNCE_MS). Invalid input isn't saved;
// enforceGalleryCacheLimitDefault() (boot.js) corrects it on leaving CFG.
const GALLERY_CACHE_DEBOUNCE_MS = 400;
let galleryCacheLimitDebounceTimer = null;
window.saveGalleryCacheLimit = function(value, showToast = false) {
    const n = parseInt(value);
    if (isNaN(n) || n <= 0) return;
    localStorage.setItem('bojroGalleryCacheLimit', String(n));
    if (showToast && Toast) Toast.show({ text: `Gallery cache limit set to ${n} images`, duration: 'short' });
    clearTimeout(galleryCacheLimitDebounceTimer);
    galleryCacheLimitDebounceTimer = setTimeout(() => {
        pruneGalleryOverflow().then(() => {
            if (typeof loadGallery === 'function') loadGallery();
        });
    }, GALLERY_CACHE_DEBOUNCE_MS);
};

// The Config box, on leaving it: a lower limit that would delete gallery images asks first (Auto-Delete Warning);
// CANCEL puts the old limit back.
window.commitGalleryCacheLimit = async function(el) {
    const n = parseInt(el.value), old = getGalleryCacheLimit();
    if (isNaN(n) || n <= 0 || n === old) return;
    if (n < old && await window.confirmAutoDelete(0, `Lowering the Gallery Cache Limit to ${n}`, n) === false) {
        el.value = String(old);
        el._numPrev = String(old);
        return;
    }
    window.saveGalleryCacheLimit(n);
};

// Called on leaving CFG: corrects an invalid or 0 value back to the default (30) and saves it.
window.enforceGalleryCacheLimitDefault = function() {
    const el = document.getElementById('cfgGalleryCacheLimit');
    if (!el) return;
    const n = parseInt(el.value);
    if (isNaN(n) || n <= 0) {
        el.value = '30';
        window.saveGalleryCacheLimit('30');
    }
};

function loadGalleryCacheLimitUI() {
    const el = document.getElementById('cfgGalleryCacheLimit');
    if (el) el.value = getGalleryCacheLimit();
}

const DEFAULT_GENERATION_POLLING_RATE = 200;
// Floor matches the fastest rate used elsewhere (50ms): responsive without hammering the server.
const MIN_GENERATION_POLLING_RATE = 50;
// Polling while the app is in the background (Config > Generation > Background Polling Rate).
const DEFAULT_BACKGROUND_POLLING_RATE = 4000;
// Android slows timers while the app is hidden, so faster checks gain nothing.
const MIN_BACKGROUND_POLLING_RATE = 500;

// Show & Download Batch Grids (Settings > Generation). Off by default: a batch returns just its images. Forge is never asked for a grid (return_grid false, do_not_save_grid true; see buildJobFromUI() and Neo.buildJob()) because it would roughly double the download. With this on, the grid is built on the device (buildLocalBatchGrid(), engine.js) and goes through the same path as other results (shown, saved to History, auto-saved).
function batchGridsEnabled() {
    return localStorage.getItem('bojroShowBatchGrids') === 'true';
}

// The grid's long edge is capped (never enlarged): 1024px with "Limit Batch Grid to 1024px" on, otherwise 2048px, since the grid is drawn and PNG-encoded on the phone. Stamped on each job when built (buildJobFromUI(), engine.js).
const BATCH_GRID_LIMIT_PX = 1024;
const BATCH_GRID_CEILING_PX = 2048;
function batchGridLimitEnabled() {
    return batchGridsEnabled() && localStorage.getItem('bojroLimitBatchGrid') === 'true';
}
// Long-edge cap for the grid built on the device; 0 means no grid is wanted.
function batchGridMaxEdge() {
    if (!batchGridsEnabled()) return 0;
    return batchGridLimitEnabled() ? BATCH_GRID_LIMIT_PX : BATCH_GRID_CEILING_PX;
}

function getGenerationPollingRate() {
    const saved = parseInt(localStorage.getItem('bojroGenerationPollingRate'));
    return (!isNaN(saved) && saved >= MIN_GENERATION_POLLING_RATE) ? saved : DEFAULT_GENERATION_POLLING_RATE;
}

// Same live-edit pattern as saveGalleryCacheLimit(): invalid or too-low input while typing isn't saved; enforceGenerationPollingRateDefault() (boot.js) corrects it on leaving CFG.
window.saveGenerationPollingRate = function(value, showToast = false) {
    const n = parseInt(value);
    if (isNaN(n) || n < MIN_GENERATION_POLLING_RATE) return;
    localStorage.setItem('bojroGenerationPollingRate', String(n));
    if (showToast && Toast) Toast.show({ text: `Generation polling rate set to ${n}ms`, duration: 'short' });
};

// On leaving the box or CFG: empty or invalid goes back to the default, too low up to the minimum (with a toast).
function enforcePollingRate(id, def, min, save) {
    const el = document.getElementById(id);
    if (!el) return;
    const n = parseInt(el.value);
    if (!isNaN(n) && n >= min) return;
    const v = isNaN(n) ? def : min;
    el.value = String(v);
    save(String(v));
    if (!isNaN(n) && Toast) Toast.show({ text: `Polling rate can't be below ${min}ms`, duration: 'short' });
}
window.enforceGenerationPollingRateDefault = function() {
    enforcePollingRate('cfgGenerationPollingRate', DEFAULT_GENERATION_POLLING_RATE, MIN_GENERATION_POLLING_RATE, window.saveGenerationPollingRate);
};

function loadGenerationPollingRateUI() {
    const el = document.getElementById('cfgGenerationPollingRate');
    if (el) el.value = getGenerationPollingRate();
    const bg = document.getElementById('cfgBackgroundPollingRate');
    if (bg) bg.value = getBackgroundPollingRate();
}

function getBackgroundPollingRate() {
    const saved = parseInt(localStorage.getItem('bojroBackgroundPollingRate'));
    return (!isNaN(saved) && saved >= MIN_BACKGROUND_POLLING_RATE) ? saved : DEFAULT_BACKGROUND_POLLING_RATE;
}

// Same live-edit pattern as saveGenerationPollingRate(); corrected by enforcePollingRate().
window.saveBackgroundPollingRate = function(value) {
    const n = parseInt(value);
    if (isNaN(n) || n < MIN_BACKGROUND_POLLING_RATE) return;
    localStorage.setItem('bojroBackgroundPollingRate', String(n));
};

window.enforceBackgroundPollingRateDefault = function() {
    enforcePollingRate('cfgBackgroundPollingRate', DEFAULT_BACKGROUND_POLLING_RATE, MIN_BACKGROUND_POLLING_RATE, window.saveBackgroundPollingRate);
};

// Colour Match (Forge's img2img_color_correction, sent per request via override_settings): two independent checkboxes, one for Inpaint and one for img2img, since it suits img2img but can cause colour bleeding at mask edges in inpainting.
window.saveInpaintColorCorrection = function(mode) {
    const el = document.getElementById(`${mode}_color_correction`);
    if (!el) return;
    localStorage.setItem(`bojro_${mode}_color_correction`, el.checked);
}

function loadInpaintColorCorrectionUI() {
    ['inp', 'img2img'].forEach(mode => {
        const el = document.getElementById(`${mode}_color_correction`);
        if (el) el.checked = localStorage.getItem(`bojro_${mode}_color_correction`) === 'true';
    });
}

// Window titles shrink to stay on one line; run when a window opens or is added, and on resize.
function fitModalTitles(scope) {
    (scope || document).querySelectorAll('.modal:not(.hidden) .modal-header h3').forEach(h => {
        if (getComputedStyle(h).whiteSpace !== 'nowrap') return;
        h.style.fontSize = '';
        let size = parseFloat(getComputedStyle(h).fontSize) || 17;
        while (h.scrollWidth > h.clientWidth + 1 && size > 14) {
            size -= 0.5;
            h.style.fontSize = `${size}px`;
        }
    });
}
new MutationObserver(records => {
    if (records.some(r => r.target.classList?.contains('modal') || [...(r.addedNodes || [])].some(n => n.classList?.contains('modal')))) fitModalTitles();
}).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
window.addEventListener('resize', () => fitModalTitles());

// ABORT and CLEAR (inpResultsArea) show only with an image loaded, as canvasWrapper/upscaleWrapper do.
function updateInpResultsAreaVisibility() {
    const el = document.getElementById('inpResultsArea');
    if (!el) return;
    el.classList.toggle('hidden', !sourceImageB64);
}

// JPEG / PNG / WEBP button (cycles; 7.4-checkpoint26): Forge's samples_format (a per-job override doesn't work: Forge resets it before encoding). Shows
// only what Forge reports; checked on connecting, each job, resuming and a result in another format.
window.ImageFormat = (() => {
    let current = null, quality = null, busy = false;
    const family = f => (f === 'jpg' || f === 'jpeg') ? 'jpg' : f;
    const label = f => !f ? '—' : family(f) === 'jpg' ? 'JPEG' : f.toUpperCase();
    function render() {
        document.querySelectorAll('.fmt-btn').forEach(b => {
            b.textContent = label(current);
            b.classList.toggle('fmt-png', current === 'png');
            b.classList.toggle('fmt-webp', current === 'webp');
            b.classList.toggle('fmt-unknown', !current);
        });
    }
    function note(f) {
        const v = typeof f === 'string' && f ? f.toLowerCase() : null;
        if (v !== current) { current = v; render(); }
    }
    // Config's JPEG quality box shows Forge's jpeg_quality (empty until Forge answers); not while it's being typed in.
    function noteQuality(q) {
        quality = Number.isFinite(q) ? q : null;
        const box = document.getElementById('cfgJpegQuality');
        if (box && document.activeElement !== box) box.value = quality ?? '';
    }
    function noteOptions(o) {
        note(o ? o.samples_format : null);
        noteQuality(o ? Number(o.jpeg_quality) : null);
    }
    async function call(opts) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        try {
            const res = await fetch(`${HOST}/sdapi/v1/options`, { ...opts, headers: getHeaders(), signal: ctrl.signal });
            if (!res.ok) throw new Error('Status ' + res.status);
            return opts.method === 'POST' ? null : ((await res.json()) || null);
        } finally {
            clearTimeout(t);
        }
    }
    async function refresh() {
        if (!HOST) return noteOptions(null);
        try { noteOptions(await call({})); } catch (e) { noteOptions(null); }
    }
    const say = text => { if (typeof Toast !== 'undefined' && Toast) Toast.show({ text, duration: 'short' }); };
    async function toggle() {
        if (busy) return;
        if (!current) {
            busy = true;
            await refresh();
            busy = false;
            if (!current) say("Couldn't reach Forge");
            return;
        }
        // PNG > JPEG > WEBP (largest file to smallest), then round again.
        const want = { png: 'jpg', jpg: 'webp' }[family(current)] || 'png';
        busy = true;
        let ok = false;
        try {
            await call({ method: 'POST', body: JSON.stringify({ samples_format: want }) });
            const now = await call({});
            noteOptions(now);
            ok = current === want;
        } catch (e) {
            await refresh();
        }
        busy = false;
        if (!ok) say("Couldn't change format");
    }
    // A result in another format than shown: ask Forge again.
    function checkResult(b64) {
        const f = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[imageMimeFromBase64(b64)];
        if (current && f && family(current) !== f) refresh();
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && typeof isEngineConnected !== 'undefined' && isEngineConnected) refresh();
    });
    async function setQuality(box) {
        const v = parseInt(box.value, 10);
        if (!(v >= 1 && v <= 100)) {
            box.value = quality ?? '';
            return say('JPEG quality must be 1-100');
        }
        if (v === quality) return;
        try {
            await call({ method: 'POST', body: JSON.stringify({ jpeg_quality: v }) });
            noteOptions(await call({}));
            if (quality !== v) say("Couldn't change JPEG quality");
        } catch (e) {
            box.value = quality ?? '';
            say("Couldn't reach Forge");
        }
    }
    return { note, refresh, toggle, setQuality, checkResult, get: () => current };
})();

// The Inpaint tab's settings row (JPEG, Auto-Save, Preview) sits above GENERATE or, in Upscale, above UPSCALE, where
// Preview is hidden. Called from boot and setInpaintTopMode().
function updateInpPreviewToggleVisibility() {
    const row = document.getElementById('inpLivePreviewToggleRow');
    if (!row) return;
    const isUpscale = typeof currentInpaintTopMode !== 'undefined' && currentInpaintTopMode === 'upscale';
    row.classList.toggle('hidden', isUpscale);
    const settings = document.getElementById('inpSettingsRow');
    const btn = document.getElementById(isUpscale ? 'upscaleBtn' : 'inpGenBtn');
    if (settings && btn) btn.parentElement.before(settings);
}
// Upscaler 2 Visibility shows only with an Upscaler 2 chosen.
window.syncUpscaler2VisRow = function() {
    const sel = document.getElementById('upscale_upscaler_2');
    document.getElementById('upscaler2VisRow')?.classList.toggle('hidden', !sel || sel.value === 'None');
};

// Live Preview: the toggle sits beside Auto-Save on the five main modes and, kept in step, on the Inpaint/img2img tab (not Upscale); livePreviewCheck is the single source of truth for polling.

// Wraps the native ResolverService.getNetworkType(): 'wifi' | 'cellular' | 'ethernet' | 'other' | 'none' | 'unknown'. Defaults to 'wifi' without the native plugin (desktop browser testing).
async function getCurrentNetworkType() {
    try {
        if (window.Capacitor?.Plugins?.ResolverService?.getNetworkType) {
            const result = await Capacitor.Plugins.ResolverService.getNetworkType();
            return (window.currentNetworkType = result?.type || 'wifi');
        }
    } catch (e) {}
    return 'wifi';
}

// The person's remembered on/off choice for Live Preview (bojroLivePreviewOn, written only when they tap a toggle; see toggleLivePreview()), separate from what the toggle shows: on disallowed mobile data it shows off but the choice is kept. Off until first switched on.
function getLivePreviewPreference() {
    return localStorage.getItem('bojroLivePreviewOn') === 'true';
}

// Re-evaluates whether the toggles are interactive. Off WiFi (mobile data not allowed): shown off, disabled and greyed out without touching the remembered choice; otherwise enabled and set to the remembered choice. Called at boot, on networkTypeChanged (initLivePreviewNetworkListener()) and when the "allow on mobile data" setting changes.
async function refreshLivePreviewToggleInteractivity() {
    // Both the main tab's toggle and the Inpaint tab's mirror of it.
    const toggles = ['livePreviewCheck', 'inpLivePreviewCheck'].map(id => document.getElementById(id)).filter(Boolean);
    if (!toggles.length) return;
    const networkType = await getCurrentNetworkType();
    const mobileDataAllowed = localStorage.getItem('bojroLivePreviewMobileDataAllowed') === 'true';
    const shouldBeInteractive = networkType === 'wifi' || mobileDataAllowed;
    if (!shouldBeInteractive) {
        const wasOn = toggles.some(t => t.checked);
        toggles.forEach(toggle => {
            toggle.checked = false;
            toggle.disabled = true;
        });
        if (wasOn && typeof toggleLivePreview === 'function') toggleLivePreview();
    } else {
        const wanted = getLivePreviewPreference();
        toggles.forEach(toggle => {
            toggle.disabled = false;
            toggle.checked = wanted;
        });
    }
}

// The toggle's on/off state is remembered across restarts. Only a real tap stores it (called with the switch that changed); code that turns the toggles off itself (mobile data) passes no source. See getLivePreviewPreference(). "Allow On Mobile Data" is a standing preference, never gated on this toggle.
window.toggleLivePreview = function(source) {
    // The main toggle is the single source of truth (pollProgressOnce reads it); the Inpaint tab's switch mirrors it. Setting .checked in code fires no change event, so they can't loop.
    const main = document.getElementById('livePreviewCheck');
    const inp = document.getElementById('inpLivePreviewCheck');
    if (source && main && source !== main) main.checked = source.checked;
    if (main && inp) inp.checked = main.checked;
    if (source && main) localStorage.setItem('bojroLivePreviewOn', main.checked ? 'true' : 'false');
}

// Registered once at boot: re-runs refreshLivePreviewToggleInteractivity() on a live WiFi/mobile-data change. No-op without the native plugin.
function initLivePreviewNetworkListener() {
    if (window.Capacitor?.Plugins?.ResolverService?.addListener) {
        Capacitor.Plugins.ResolverService.addListener('networkTypeChanged', (e) => {
            if (window.dbg) window.dbg('network changed: ' + (e?.type || '?'));
            if (typeof refreshLivePreviewToggleInteractivity === 'function') refreshLivePreviewToggleInteractivity();
        });
    }
}

// Deletes the oldest images beyond the cache limit (the auto-incrementing keyPath means an ascending cursor visits the oldest first).
function pruneGalleryOverflow() {
    return new Promise((resolve) => {
        if (!db) return resolve();
        try {
            const limit = getGalleryCacheLimit();
            const tx = db.transaction(["images"], "readwrite");
            const store = tx.objectStore("images");
            // Favourites (galleryfavs.js) neither count nor go.
            const favs = window.GalleryFavs ? GalleryFavs.ids() : new Set();
            const keysReq = store.getAllKeys();
            keysReq.onsuccess = () => {
                const keys = keysReq.result.filter(k => !favs.has(k));
                const overflow = keys.length - limit;
                if (overflow <= 0) return resolve();
                keys.slice(0, overflow).forEach(k => store.delete(k));
                tx.oncomplete = () => resolve();
                tx.onerror = tx.onabort = () => resolve();
            };
            keysReq.onerror = () => resolve();
        } catch (e) {
            console.error("Gallery prune failed:", e);
            resolve();
        }
    });
}

window.clearDbGallery = async function() {
    // Favourites stay unless the box (unticked each time) says otherwise.
    const favs = window.GalleryFavs ? GalleryFavs.ids() : new Set();
    const confirmed = await window.appConfirm("Delete entire history? This cannot be undone.", { title: 'Delete History', okText: 'DELETE', danger: true, checkbox: favs.size ? 'Delete favorites too' : null });
    if (confirmed) {
        const withFavs = !favs.size || window.appConfirmChecked();
        const tx = db.transaction(["images"], "readwrite");
        const store = tx.objectStore("images");
        if (withFavs) store.clear();
        else { const k = store.getAllKeys(); k.onsuccess = () => k.result.forEach(id => { if (!favs.has(id)) store.delete(id); }); }
        tx.oncomplete = () => {
            if (withFavs && window.GalleryFavs) GalleryFavs.save(new Set());
            if (isSelectionMode) toggleGallerySelectionMode();
            galleryPage = 1;
            // The Generation Results strips lose what was deleted (everything but kept favourites).
            ['gallery', 'inpGallery'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                if (withFavs) el.innerHTML = '';
                else el.querySelectorAll('.gen-result').forEach(img => { if (!favs.has(parseInt(img.dataset.dbId, 10))) img.remove(); });
            });
            if (typeof loadGallery === 'function') loadGallery();
        };
    }
}

// --- METADATA UTILS ---

// Image type from base64 (or a data URL): Forge sends PNG, JPEG or WEBP, depending on its Image Format setting.
function imageMimeFromBase64(b64) {
    const s = String(b64 || '').replace(/^data:[^,]*,/, '');
    if (s.startsWith('/9j/')) return 'image/jpeg';
    if (s.startsWith('UklGR')) return 'image/webp';
    return 'image/png';
}
function base64ToDataUrl(b64) {
    return `data:${imageMimeFromBase64(b64)};base64,${b64}`;
}

// The EXIF UserComment text of a JPEG or WEBP (where Forge puts "parameters" for those formats), or null.
function exifUserCommentFromBytes(b) {
    try {
        let tiff = -1;
        if (b[0] === 0xFF && b[1] === 0xD8) {
            let off = 2;
            while (off + 4 <= b.length && b[off] === 0xFF) {
                const marker = b[off + 1], len = (b[off + 2] << 8) | b[off + 3];
                if (marker === 0xDA || marker === 0xD9) break;
                if (marker === 0xE1 && String.fromCharCode(...b.subarray(off + 4, off + 8)) === 'Exif') { tiff = off + 10; break; }
                off += 2 + len;
            }
        } else if (String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') {
            let off = 12;
            while (off + 8 <= b.length) {
                const type = String.fromCharCode(...b.subarray(off, off + 4));
                const len = b[off + 4] | (b[off + 5] << 8) | (b[off + 6] << 16) | (b[off + 7] << 24);
                if (type === 'EXIF') {
                    tiff = off + 8;
                    if (String.fromCharCode(...b.subarray(tiff, tiff + 4)) === 'Exif') tiff += 6;
                    break;
                }
                off += 8 + len + (len & 1);
            }
        }
        if (tiff < 0) return null;
        const le = b[tiff] === 0x49;
        const u16 = o => le ? b[tiff + o] | (b[tiff + o + 1] << 8) : (b[tiff + o] << 8) | b[tiff + o + 1];
        const u32 = o => (le ? (b[tiff + o] | (b[tiff + o + 1] << 8) | (b[tiff + o + 2] << 16) | (b[tiff + o + 3] << 24))
            : ((b[tiff + o] << 24) | (b[tiff + o + 1] << 16) | (b[tiff + o + 2] << 8) | b[tiff + o + 3])) >>> 0;
        const find = (ifd, tag) => {
            const n = u16(ifd);
            for (let i = 0; i < n; i++) {
                const e = ifd + 2 + i * 12;
                if (u16(e) === tag) return { count: u32(e + 4), at: u32(e + 4) <= 4 ? e + 8 : u32(e + 8) };
            }
            return null;
        };
        const exifPtr = find(u32(4), 0x8769);
        if (!exifPtr) return null;
        const uc = find(u32(exifPtr.at), 0x9286);
        if (!uc || uc.count < 8) return null;
        const data = b.subarray(tiff + uc.at, tiff + uc.at + uc.count);
        const prefix = String.fromCharCode(...data.subarray(0, 8));
        const body = data.subarray(8);
        let text;
        if (prefix === 'UNICODE\0') {
            // UTF-16; Forge (piexif) writes big-endian, some tools little-endian.
            let even = 0, odd = 0;
            for (let i = 0; i + 1 < Math.min(body.length, 200); i += 2) { if (!body[i]) even++; if (!body[i + 1]) odd++; }
            text = new TextDecoder(even >= odd ? 'utf-16be' : 'utf-16le').decode(body);
        } else {
            text = new TextDecoder().decode(body);
        }
        text = text.replace(/\0+$/, '').trim();
        return text || null;
    } catch (e) {
        return null;
    }
}
async function readExifText(blob) {
    return exifUserCommentFromBytes(new Uint8Array(await blob.slice(0, 512 * 1024).arrayBuffer()));
}
function isPngBytes(b) {
    return b.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v);
}

async function readPngMetadata(blob) {
    try {
        // JPEG / WEBP: the EXIF comment.
        if (!isPngBytes(new Uint8Array(await blob.slice(0, 8).arrayBuffer()))) return await readExifText(blob);
        const buffer = await blob.arrayBuffer();
        const view = new DataView(buffer);
        let offset = 8;
        let metadata = "";
        while (offset < view.byteLength) {
            const length = view.getUint32(offset);
            const type = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7));
            if (type === 'tEXt') {
                const data = new Uint8Array(buffer, offset + 8, length);
                metadata += new TextDecoder('latin1').decode(data) + "\n";
            }
            if (type === 'iTXt') {
                const data = new Uint8Array(buffer, offset + 8, length);
                // keyword \0 compressed method language \0 translated \0 text (compressed text is skipped)
                const keyEnd = data.indexOf(0);
                const langEnd = keyEnd < 0 ? -1 : data.indexOf(0, keyEnd + 3);
                const transEnd = langEnd < 0 ? -1 : data.indexOf(0, langEnd + 1);
                if (transEnd >= 0 && data[keyEnd + 1] === 0) {
                    const keyword = new TextDecoder('latin1').decode(data.subarray(0, keyEnd));
                    metadata += keyword + '\0' + new TextDecoder().decode(data.subarray(transEnd + 1)) + "\n";
                }
            }
            offset += 12 + length;
        }
        metadata = metadata.trim();
        if (!metadata) return null;
        metadata = metadata.replace(/^parameters\0/, '');
        return metadata;
    } catch (e) {
        console.error("Metadata read error:", e);
        return null;
    }
}

function parseGenInfo(rawText) {
    if (!rawText) return {
        pos: "",
        neg: "",
        params: "",
        seed: ""
    };
    let pos = "";
    let neg = "";
    let paramsLine = "";
    const negSplit = rawText.split("Negative prompt:");
    if (negSplit.length > 1) {
        pos = negSplit[0].trim();
        const paramsSplit = negSplit[1].split(/(\nSteps: |Steps: )/);
        if (paramsSplit.length > 1) {
            neg = paramsSplit[0].trim();
            paramsLine = paramsSplit.slice(1).join('').trim();
        } else {
            neg = negSplit[1].trim();
        }
    } else {
        const paramSplit = rawText.split(/(\nSteps: |Steps: )/);
        if (paramSplit.length > 1) {
            pos = paramSplit[0].trim();
            paramsLine = paramSplit.slice(1).join('').trim();
        } else {
            pos = rawText.trim();
        }
    }

    // Pull the seed out into its own value, so it can be copied on its own.
    let seed = "";
    const seedMatch = paramsLine.match(/Seed:\s*(-?\d+)/);
    if (seedMatch) {
        seed = seedMatch[1];
        paramsLine = paramsLine.replace(/,?\s*Seed:\s*-?\d+/, '').trim();
        paramsLine = paramsLine.replace(/^,\s*/, '').replace(/,\s*,/g, ',');
    }

    // Individual fields for "Use In", matched with targeted regexes rather than a comma-split (model names can contain commas).
    const getField = (regex) => {
        const m = paramsLine.match(regex);
        return m ? m[1].trim() : "";
    };
    const steps = getField(/Steps:\s*(\d+)/);
    const cfg = getField(/CFG scale:\s*([\d.]+)/);
    const sampler = getField(/Sampler:\s*([^,]+)/);
    const scheduler = getField(/Schedule type:\s*([^,]+)/);
    const sizeMatch = paramsLine.match(/Size:\s*(\d+)x(\d+)/);
    const width = sizeMatch ? sizeMatch[1] : "";
    const height = sizeMatch ? sizeMatch[2] : "";

    return {
        pos,
        neg,
        params: paramsLine,
        seed,
        steps,
        cfg,
        sampler,
        scheduler,
        width,
        height
    };
}

// A prompt/negative box that has content ends with ", " so the next tag can be typed straight away. Applied to the whole box once (text already ending in "," is normalised to ", "); an empty box stays empty. Kept out of the recorded insertion strings, which must stay separator + tag.
function withTrailingComma(text) {
    const trimmed = String(text == null ? '' : text).replace(/\s+$/, '');
    if (!trimmed) return '';
    return (trimmed.endsWith(',') ? trimmed : trimmed + ',') + ' ';
}

// "a, b\nc," -> ['a', 'b', 'c']: comma and newline separate tags, whitespace is trimmed, empties dropped.
function parseTagList(text) {
    return String(text == null ? '' : text).split(/[,\n]/).map(t => t.trim()).filter(Boolean);
}

// Text as searches compare it: lower case, accents removed (é -> e), a few letters spelt out (ß -> ss).
const SEARCH_LETTERS = { 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 'th' };
function searchKey(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[ßæœøłđðþ]/g, c => SEARCH_LETTERS[c]);
}
// A search box's query: as searchKey(), leading spaces dropped and a trailing one kept (it marks the last word as
// whole); '' for nothing but spaces.
function searchQuery(text) {
    const k = searchKey(text);
    return /\S/.test(k) ? k.replace(/^\s+/, '').replace(/\s+$/, ' ') : '';
}
// Words: runs of letters and digits; anything else separates them ("Style: name (series)", "hatsune_miku").
const searchWords = s => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
// True when every query word matches a different word of the text, in any order: whole words, except the last one
// typed (its start). loose: anywhere in the text, the fallback when nothing matches (searchFilter()).
function searchMatches(text, query, loose = false) {
    const words = searchWords(query);
    if (!words.length) return true;
    const key = searchKey(text);
    if (loose) {
        const t = searchWords(key).join(' ');
        return words.every(w => t.includes(w));
    }
    const lastWhole = /[^\p{L}\p{N}]$/u.test(query);
    const tw = searchWords(key);
    const used = new Set();
    // Whole words first, so the word being typed can't take one they need.
    const order = words.map((w, i) => ({ w, whole: i < words.length - 1 || lastWhole })).sort((a, b) => b.whole - a.whole);
    return order.every(({ w, whole }) => {
        const i = tw.findIndex((t, j) => !used.has(j) && (whole ? t === w : t.startsWith(w)));
        if (i < 0) return false;
        used.add(i);
        return true;
    });
}
// The items with a text (textsOf(item) gives its texts) matching the query by words, or, if none does, anywhere.
function searchFilter(items, textsOf, query) {
    if (!query) return items;
    const strict = items.filter(it => textsOf(it).some(t => searchMatches(t, query)));
    return strict.length ? strict : items.filter(it => textsOf(it).some(t => searchMatches(t, query, true)));
}

// A full stop that ends an initial or a short title ("c.c.", "jr.") isn't a stray one, so it stays before a comma (ui.js).
const KEEP_FULL_STOP_AFTER = /^(\p{L}|jr|sr|dr|mr|mrs|ms|st|no|ver|vs|vol|etc)$/iu;
const strayFullStop = before => !KEEP_FULL_STOP_AFTER.test((before.match(/\p{L}+$/u) || [''])[0]);
// Two or more full stops straight after a word, treated as one; "..." as a tag of its own isn't matched.
const STOP_RUN = /([^\s,.([:|])\.{2,}/g;
// "..." as a tag of its own (Danbooru's ellipsis), which the full-stop rules keep.
const ELLIPSIS_TAG = /(^|,)([ \t]*)\.\.\.(?=[ \t]*(?:,|$))/g;
// Full stops not attached to a word (at the start, or after a space, comma or opening bracket); not ".5".
const LOOSE_STOPS = /(^|[\s,([])\.+(?!\d)/g;

// Unmatched brackets in a line of tags: stray closers go, missing ones are added at the tag's (or weighted group's)
// end, and a half-escaped round pair is escaped on both sides.
function repairTagBrackets(line) {
    const chars = [...line];
    const open = []; // { i, esc, sq }
    const drop = new Set(), opens = new Map(); // insert position -> "(" for a weight's group
    for (let i = 0; i < chars.length; i++) {
        const esc = chars[i - 1] === '\\';
        if (chars[i] === '(') open.push({ i, esc });
        else if (chars[i] === '[' && !esc) open.push({ i, sq: true });
        else if (chars[i] === ')') {
            const at = open.map(o => !o.sq).lastIndexOf(true);
            const o = at < 0 ? null : open.splice(at, 1)[0];
            // No "(" for it: a tag with a weight ("open mouth:1.5)") gets one at its start; any other is dropped.
            if (!o) {
                if (esc) continue;
                let start = i;
                while (start > 0 && chars[start - 1] !== ',') start--;
                const tag = chars.slice(start, i).join('');
                if (/\p{L}\s*:\s*-?\d*\.?\d+\s*$/u.test(tag)) { const lead = tag.match(/^\s*/)[0].length; opens.set(start + lead, (opens.get(start + lead) || '') + '('); }
                else drop.add(i);
                continue;
            }
            if (o.esc && !esc) chars[i] = '\\)';
            else if (!o.esc && esc) chars[o.i] = '\\(';
        } else if (chars[i] === ']' && !esc) {
            const at = open.map(o => !!o.sq).lastIndexOf(true);
            if (at < 0) {
                // Prompt editing or alternating missing its "[": put back at the tag's start.
                let start = i;
                while (start > 0 && chars[start - 1] !== ',') start--;
                const tag = chars.slice(start, i).join('');
                if (/^[^\[\]()]*\p{L}[^\[\]()]*(?::[^\[\]()]*)?:\s*-?\d*\.?\d+\s*$|^[^\[\]()|]*\p{L}[^\[\]()]*\|[^\[\]()]*\p{L}[^\[\]()]*$/u.test(tag)) {
                    const lead = tag.match(/^\s*/)[0].length;
                    opens.set(start + lead, (opens.get(start + lead) || '') + '[');
                } else drop.add(i);
            }
            else open.splice(at, 1);
        }
    }
    const ends = new Map(); // insert position -> closers
    for (const o of open) {
        const rest = line.slice(o.i + 1);
        const comma = rest.search(/,/);
        const toLineEnd = comma < 0 || /:\s*-?\d*\.?\d+\s*$/.test(rest);
        // A weight further on closes the group after it ("(A, B, C:1.5, D").
        const weight = !o.sq && !o.esc && !toLineEnd ? /:\s*-?\d*\.?\d+(?=\s*(?:,|$))/.exec(rest) : null;
        let at = toLineEnd ? chars.length : weight ? o.i + 1 + weight.index + weight[0].length : o.i + 1 + comma;
        const closer = o.sq ? ']' : o.esc ? '\\)' : ')';
        ends.set(at, (ends.get(at) || '') + closer);
    }
    let out = '';
    for (let i = 0; i <= chars.length; i++) {
        if (ends.has(i)) out = out.replace(/[ \t]+$/, '') + ends.get(i);
        if (opens.has(i)) out += opens.get(i);
        if (i < chars.length && !drop.has(i)) out += chars[i];
    }
    return out;
}

// Weights (Prompt Auto-Formatting): "(open mouth:1 5)" -> "(open mouth:1.5)", "(smile1.5)" -> "(smile:1.5)", a bare
// "open mouth:1.5" outside brackets wrapped, and "((coat:1.5))" -> "(coat:1.5)" (extra brackets around one weighted
// tag). Tags grouped in one bracket ("(A, B, C:1.5)") are left alone.
function repairWeights(line, tagStyle) {
    let out = line
        .replace(/(\([^()\\]*?:)\s*(\d+)[ ,](\d+)\s*\)/g, '$1$2.$3)')
        .replace(/(^|[^\\])\(([^():\\]*?\p{L})[ \t]*(\d+\.\d+)\)/gu, '$1($2:$3)');
    for (let prev = null; prev !== out;) { prev = out; out = out.replace(/(^|[^\\])\(\((?!\\)([^()]*?:\s*-?\d*\.?\d+)\)\)/g, '$1($2)'); }
    // Bare weights (tag-style prompts only): tags at bracket depth 0 ending in ":number" (a word before it, so "16:9" stays).
    if (!tagStyle) return out;
    let depth = 0, start = 0, res = '';
    const flush = end => {
        const tag = out.slice(start, end), m = /^(\s*)([^()\[\]{}:\u0000]*\p{L})[ \t]*:[ \t]*(-?\d*\.?\d+)(\s*)$/u.exec(tag);
        res += m && !/::/.test(tag) ? `${m[1]}(${m[2]}:${m[3]})${m[4]}` : tag;
    };
    for (let i = 0; i < out.length; i++) {
        // Escaped brackets count too: what's inside them is text, not a tag to wrap.
        const c = out[i];
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
        else if (c === ',' && depth === 0) { flush(i); res += ','; start = i + 1; }
    }
    flush(out.length);
    return res;
}

// Choices (Prompt Auto-Formatting): a tag with "|" missing one or both braces gets them ("pants|bare legs" ->
// "{pants|bare legs}"). Not inside ( ) or [ ] (prompt editing's [cat|dog]), nor random:: / order:: tokens or ${...}.
function repairChoices(line) {
    if (line.indexOf('|') < 0) return line;
    const open = (line.match(/\{/g) || []).length, close = (line.match(/\}/g) || []).length;
    // Tags split on commas outside ( ) and [ ]; with balanced braces, outside { } too (a choice can hold commas).
    const tags = [];
    let p = 0, q = 0, c = 0, cur = '';
    for (const ch of line) {
        if (ch === '(') p++; else if (ch === ')') p = Math.max(0, p - 1);
        else if (ch === '[') q++; else if (ch === ']') q = Math.max(0, q - 1);
        else if (ch === '{') c++; else if (ch === '}') c = Math.max(0, c - 1);
        if (ch === ',' && !p && !q && (open !== close || !c)) { tags.push(cur); cur = ''; } else cur += ch;
    }
    tags.push(cur);
    return tags.map(t => {
        if (t.indexOf('|') < 0 || /::|\$\{|\u0000|[\[\]]/.test(t)) return t;
        // The "|" must be outside ( ) and [ ].
        let d = 0, bare = false;
        for (const ch of t) { if (ch === '(' || ch === '[') d++; else if (ch === ')' || ch === ']') d = Math.max(0, d - 1); else if (ch === '|' && !d) bare = true; }
        if (!bare) return t;
        const o = (t.match(/\{/g) || []).length, k = (t.match(/\}/g) || []).length;
        const lead = t.match(/^\s*/)[0], body = t.slice(lead.length).replace(/\s+$/, ''), tail = t.slice(lead.length + body.length);
        if (o === k) return o ? t : `${lead}{${body}}${tail}`;
        return o > k ? `${lead}${body}${'}'.repeat(o - k)}${tail}` : `${lead}${'{'.repeat(k - o)}${body}${tail}`;
    }).join(',');
}

// Commas beside BREAK taken out of text sent to Forge ("a, BREAK, b" -> "a BREAK b"; a line break stays one). Only
// BREAK in capitals as a whole word, as Forge reads it.
function breakForForge(text) {
    if (typeof text !== 'string' || text.indexOf('BREAK') < 0) return text;
    return text
        .replace(/[ \t]*,([ \t]*\n?[ \t]*)(?=\bBREAK\b)/g, (m, sp) => (sp.includes('\n') ? sp : ' '))
        .replace(/\bBREAK\b([ \t]*\n?[ \t]*),[ \t]*(\n?)/g, (m, sp, nl) => 'BREAK' + (sp.includes('\n') ? sp : nl || ' '));
}
// A request's payload with breakForForge() on its prompts (the job's own payload is left as it is).
function payloadForForge(payload) {
    const out = Object.assign({}, payload);
    ['prompt', 'negative_prompt', 'hr_prompt', 'hr_negative_prompt'].forEach(k => { if (typeof out[k] === 'string') out[k] = breakForForge(out[k]); });
    const ad = out.alwayson_scripts && out.alwayson_scripts.ADetailer;
    if (ad && Array.isArray(ad.args)) {
        out.alwayson_scripts = Object.assign({}, out.alwayson_scripts, { ADetailer: Object.assign({}, ad, {
            args: ad.args.map(a => (a && typeof a === 'object' && !Array.isArray(a) ? Object.assign({}, a, { ad_prompt: breakForForge(a.ad_prompt), ad_negative_prompt: breakForForge(a.ad_negative_prompt) }) : a))
        }) });
    }
    return out;
}

// A tag without its outer brackets, "(smile:1.2)" or "[smile]" -> "smile", "((smile))" -> "(smile)"; null when the
// first bracket doesn't close at the tag's end ("(a) (b)", "(a"). Escaped brackets are text.
function unwrapTag(t) {
    const open = t[0], close = open === '(' ? ')' : open === '[' ? ']' : '';
    if (!close || t.length < 2 || t[t.length - 1] !== close) return null;
    let depth = 0;
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (c === '\\') { i++; continue; }
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') { if (--depth === 0 && i < t.length - 1) return null; }
    }
    if (depth !== 0) return null;
    const inner = t.slice(1, -1);
    return (open === '(' ? inner.replace(/:\s*-?\d*\.?\d+$/, '') : inner).trim();
}

// A tag compared loosely: case, extra spaces and weight brackets ("(tag:1.2)", "[tag]", "((tag))") are ignored, and so is what
// Prompt Auto-Formatting changes (ui.js): unmatched or half-escaped brackets, escapes, underscores, a full stop between
// words, a stray full stop at the end, spaces around ":" and "|". <lora:...> tags stay exact apart from case.
function normaliseTag(tag) {
    let t = String(tag == null ? '' : tag).trim();
    if (t.startsWith('<')) return t.replace(/\s+/g, ' ').toLowerCase();
    if (t === '...') return t;
    t = repairTagBrackets(t).replace(LOOSE_STOPS, '$1').replace(STOP_RUN, '$1.').replace(/(^|[^.])\.(?=\s*\\?[):\]])/g, (m, pre, i, str) => strayFullStop(str.slice(0, i) + pre) ? pre : m);
    for (let inner; (inner = unwrapTag(t)) !== null;) t = inner;
    while (/[^.]\.$/.test(t) && strayFullStop(t.slice(0, -1))) t = t.slice(0, -1).trim();
    return t.replace(/\\([()])/g, '$1').replace(/_/g, ' ').replace(/(\p{L})\.\s*(?=\p{L})/gu, '$1 ').replace(/\s*([:|])\s*/g, '$1')
        .replace(/\s+/g, ' ').trim().toLowerCase();
}

// The text after a segment's <lora:...> tags ("<lora:x:1> nami" -> "nami"), or '' when there are none.
function textAfterLoraTags(segment) {
    return /<[^>]+>/.test(segment) ? segment.replace(/<[^>]+>/g, ' ').trim() : '';
}

// A box's tags, compared loosely (normaliseTag()). Words sharing a segment with a <lora:...> tag count separately too.
function boxTagSet(el) {
    const set = new Set();
    parseTagList(el ? el.value : '').forEach(t => {
        set.add(normaliseTag(t));
        const rest = textAfterLoraTags(t);
        if (rest) set.add(normaliseTag(rest));
    });
    return set;
}

// Tags as Prompt Auto-Formatting may have left them in the box: each one, plus the tags formatting splits it into.
function withFormattedPieces(tags) {
    const out = [];
    tags.forEach(t => {
        out.push(t);
        if (typeof formatPromptText === 'function') parseTagList(formatPromptText(t, true)).forEach(p => out.push(p));
    });
    return [...new Set(out)];
}

// Line breaks with only spaces or commas between them become one, so a removal never leaves an empty line or a doubled
// comma ("a,\n,\n\nb" -> "a,\nb"); each tag line stays on its own line. Spaces at line ends go.
function collapseBlankLines(text) {
    let out = String(text).replace(/\n[\s,]*\n/g, m => m.includes(',') ? ',\n' : '\n');
    for (let prev = null; prev !== out;) {
        prev = out;
        out = out.replace(/,[ \t]*(\n?)[ \t]*,/g, (m, nl) => ',' + nl);
    }
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n');
}

// Removes every comma/line segment whose tag (normaliseTag()) is in normSet. Ends tidied, without the closing ", ".
// dropBreaks (removing a LoRA, style or character): a line break belongs to the tag after it, so it goes with that tag and
// the rest of its line joins the line above. Otherwise (a trigger word skipped as already in the box) the line keeps it.
function removeTagsFromText(text, normSet, dropBreaks) {
    if (!normSet.size) return text;
    const parts = text.split(/([,\n])/);
    const kept = [];
    for (let i = 0; i < parts.length; i += 2) {
        const raw = parts[i], sep = parts[i + 1];
        if (raw.trim() && normSet.has(normaliseTag(raw))) {
            if (dropBreaks && kept[kept.length - 1] === '\n') kept[kept.length - 1] = ',';
            continue;
        }
        // "<lora:x:1> nami" with "nami" to remove keeps just the LoRA tag.
        const rest = textAfterLoraTags(raw);
        if (rest && normSet.has(normaliseTag(rest))) {
            kept.push(raw.match(/^\s*/)[0] + raw.match(/<[^>]+>/g).join(' '));
            if (sep !== undefined) kept.push(sep);
            continue;
        }
        kept.push(raw);
        if (sep !== undefined) kept.push(sep);
    }
    return collapseBlankLines(kept.join(''))
        .replace(/^[\s,]+/, '')
        .replace(/[\s,]+$/, '');
}

// Appends tags to a prompt/negative box with a correct separator and the trailing ", " (withTrailingComma). Callers de-duplicate at tag level and track what they added.
function appendTagsToBox(el, text) {
    const trimmed = el.value.replace(/\s+$/, '');
    const sep = !trimmed ? '' : (trimmed.endsWith(',') ? ' ' : ', ');
    el.value = withTrailingComma(trimmed + sep + text);
}

// Prompt + negative from an image's embedded text, for the img2img "import from image metadata" buttons, or null if nothing importable. parseGenInfo() treats any text as a prompt, so only text that looks like generation info qualifies (not e.g. ComfyUI workflow JSON). A prompt-less result is {pos:'', neg:...}.
function extractImportablePrompts(rawText) {
    if (!rawText) return null;
    if (!/Steps:\s*\d|Negative prompt:/.test(rawText)) return null;
    const parsed = parseGenInfo(rawText);
    return { pos: parsed.pos || '', neg: parsed.neg || '' };
}

// The same, from a file/blob: PNG text chunks, or a JPEG / WEBP's EXIF comment (readPngMetadata()).
async function readImportablePromptsFromBlob(blob) {
    try {
        return extractImportablePrompts(await readPngMetadata(blob));
    } catch (e) {
        return null;
    }
}

// --- PNG text chunks (Copy Metadata from Source) ---

let _crc32Table = null;
function crc32Bytes(bytes) {
    if (!_crc32Table) {
        _crc32Table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            _crc32Table[n] = c >>> 0;
        }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = _crc32Table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunkBytes(type, data) {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32Bytes(out.subarray(4, 8 + data.length)));
    return out;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const PNG_TEXT_CHUNK_TYPES = ['tEXt', 'iTXt', 'zTXt'];

// Lists the chunks before the first IDAT, or null if not a PNG.
async function scanPngHead(blob) {
    const head = new Uint8Array(await blob.slice(0, 4 * 1024 * 1024).arrayBuffer());
    if (head.length < 33 || !PNG_SIGNATURE.every((b, i) => head[i] === b)) return null;
    const view = new DataView(head.buffer);
    const chunks = [];
    let width = 0, height = 0, off = 8;
    while (off + 12 <= head.length) {
        const len = view.getUint32(off);
        const type = String.fromCharCode(head[off + 4], head[off + 5], head[off + 6], head[off + 7]);
        if (type === 'IDAT') return { width, height, idatOffset: off, chunks, head };
        if (off + 12 + len > head.length) return null;
        if (type === 'IHDR') { width = view.getUint32(off + 8); height = view.getUint32(off + 12); }
        chunks.push({ type, start: off, end: off + 12 + len });
        off += 12 + len;
    }
    return null;
}

// A PNG's tEXt / iTXt / zTXt chunks as [{type, data}], or null.
async function readPngTextChunks(blob) {
    try {
        if (!isPngBytes(new Uint8Array(await blob.slice(0, 8).arrayBuffer()))) {
            const text = await readExifText(blob);
            return text ? [parametersITXtChunk(text)] : null;
        }
        const scan = await scanPngHead(blob);
        if (!scan) return null;
        const out = [];
        for (const c of scan.chunks) {
            if (!PNG_TEXT_CHUNK_TYPES.includes(c.type)) continue;
            out.push({ type: c.type, data: scan.head.slice(c.start + 8, c.end - 4) });
        }
        return out.length ? out : null;
    } catch (e) {
        return null;
    }
}

// An iTXt "parameters" chunk (keyword, 0, uncompressed, method, empty language and translation, UTF-8 text).
function parametersITXtChunk(text) {
    const key = new TextEncoder().encode('parameters'), t = new TextEncoder().encode(text);
    const data = new Uint8Array(key.length + 5 + t.length);
    data.set(key, 0);
    data.set(t, key.length + 5);
    return { type: 'iTXt', data };
}
// The "parameters" text in text chunks, or null.
function parametersFromTextChunks(chunks) {
    try {
        for (const chunk of chunks || []) {
            const data = chunk.data;
            const keyEnd = data.indexOf(0);
            if (keyEnd < 0 || new TextDecoder('latin1').decode(data.subarray(0, keyEnd)) !== 'parameters') continue;
            if (chunk.type === 'tEXt') return new TextDecoder('latin1').decode(data.subarray(keyEnd + 1));
            if (chunk.type === 'iTXt' && data[keyEnd + 1] === 0) {
                let p = data.indexOf(0, keyEnd + 3);
                if (p >= 0) p = data.indexOf(0, p + 1);
                if (p >= 0) return new TextDecoder().decode(data.subarray(p + 1));
            }
        }
    } catch (e) {}
    return null;
}
// A JPEG's width and height from its frame header, or null.
function jpegSizeFromBytes(b) {
    if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
    let off = 2;
    while (off + 9 < b.length && b[off] === 0xFF) {
        const m = b[off + 1], len = (b[off + 2] << 8) | b[off + 3];
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { height: (b[off + 5] << 8) | b[off + 6], width: (b[off + 7] << 8) | b[off + 8] };
        off += 2 + len;
    }
    return null;
}
// Puts `text` in a JPEG's EXIF UserComment as Forge does (replacing any EXIF), with Size set to the JPEG's size.
async function embedJpegParameters(dataUrl, text) {
    const bytes = new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
    const size = jpegSizeFromBytes(bytes);
    if (size) text = text.replace(/Size: \d+x\d+(?![\s\S]*Size: \d+x\d+)/, `Size: ${size.width}x${size.height}`);
    const body = [0x55, 0x4E, 0x49, 0x43, 0x4F, 0x44, 0x45, 0];
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); body.push(c >> 8, c & 255); }
    // Big-endian TIFF: IFD0 with the Exif pointer, the Exif IFD with UserComment, then the comment.
    const tiff = [0x4D, 0x4D, 0, 42, 0, 0, 0, 8,
        0, 1, 0x87, 0x69, 0, 4, 0, 0, 0, 1, 0, 0, 0, 26, 0, 0, 0, 0,
        0, 1, 0x92, 0x86, 0, 7, ...[24, 16, 8, 0].map(s => (body.length >>> s) & 255), 0, 0, 0, 44, 0, 0, 0, 0, ...body];
    const app1Len = 2 + 6 + tiff.length;
    if (app1Len > 65535) return dataUrl;
    const app1 = new Uint8Array([0xFF, 0xE1, app1Len >> 8, app1Len & 255, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]);
    // Drop any existing EXIF (APP1 "Exif") segment.
    const parts = [bytes.subarray(0, 2), app1];
    let off = 2;
    while (off + 4 <= bytes.length && bytes[off] === 0xFF && bytes[off + 1] !== 0xDA) {
        const len = (bytes[off + 2] << 8) | bytes[off + 3];
        const isExif = bytes[off + 1] === 0xE1 && String.fromCharCode(...bytes.subarray(off + 4, off + 8)) === 'Exif';
        if (!isExif) parts.push(bytes.subarray(off, off + 2 + len));
        off += 2 + len;
    }
    parts.push(bytes.subarray(off));
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(new Blob(parts, { type: 'image/jpeg' }));
    });
}

// The seed in the "parameters" chunk, or null.
function seedFromTextChunks(chunks) {
    try {
        for (const chunk of chunks || []) {
            const data = chunk.data;
            const keyEnd = data.indexOf(0);
            if (keyEnd < 0 || new TextDecoder('latin1').decode(data.subarray(0, keyEnd)) !== 'parameters') continue;
            let textStart;
            if (chunk.type === 'tEXt') {
                textStart = keyEnd + 1;
            } else if (chunk.type === 'iTXt' && data[keyEnd + 1] === 0) {
                let p = data.indexOf(0, keyEnd + 3);
                if (p >= 0) p = data.indexOf(0, p + 1);
                if (p < 0) continue;
                textStart = p + 1;
            } else {
                continue;
            }
            const text = new TextDecoder(chunk.type === 'iTXt' ? 'utf-8' : 'latin1').decode(data.subarray(textStart));
            const m = text.match(/Seed:\s*(-?\d+)/);
            if (m && m[1] !== '-1') return m[1];
        }
    } catch (e) {}
    return null;
}

// Sets the last "Size: WxH" in a "parameters" chunk.
function patchParametersChunkSize(chunk, width, height) {
    try {
        const data = chunk.data;
        const keyEnd = data.indexOf(0);
        if (keyEnd < 0) return chunk;
        if (new TextDecoder('latin1').decode(data.subarray(0, keyEnd)) !== 'parameters') return chunk;
        let textStart, utf8;
        if (chunk.type === 'tEXt') {
            textStart = keyEnd + 1; utf8 = false;
        } else if (chunk.type === 'iTXt') {
            if (data[keyEnd + 1] !== 0) return chunk;
            let p = keyEnd + 3;
            p = data.indexOf(0, p); if (p < 0) return chunk;
            p = data.indexOf(0, p + 1); if (p < 0) return chunk;
            textStart = p + 1; utf8 = true;
        } else {
            return chunk;
        }
        const text = new TextDecoder(utf8 ? 'utf-8' : 'latin1').decode(data.subarray(textStart));
        const re = /Size: *\d+ *x *\d+/g;
        let last = null, m;
        while ((m = re.exec(text)) !== null) last = m;
        if (!last) return chunk;
        const patched = text.slice(0, last.index) + `Size: ${width}x${height}` + text.slice(last.index + last[0].length);
        let textBytes;
        if (utf8) {
            textBytes = new TextEncoder().encode(patched);
        } else {
            textBytes = new Uint8Array(patched.length);
            for (let i = 0; i < patched.length; i++) textBytes[i] = patched.charCodeAt(i) & 0xFF;
        }
        const out = new Uint8Array(textStart + textBytes.length);
        out.set(data.subarray(0, textStart), 0);
        out.set(textBytes, textStart);
        return { type: chunk.type, data: out };
    } catch (e) {
        return chunk;
    }
}

// Replaces a PNG's text chunks with `chunks`, with Size set to the PNG's size.
async function embedPngTextChunks(dataUrl, chunks) {
    try {
        if (!chunks || !chunks.length) return dataUrl;
        // A JPEG result (Forge set to JPEG) gets the text in its EXIF instead.
        const mime = imageMimeFromBase64(dataUrl);
        if (mime === 'image/jpeg') {
            const text = parametersFromTextChunks(chunks);
            return text ? await embedJpegParameters(dataUrl, text) : dataUrl;
        }
        if (mime !== 'image/png') return dataUrl;
        const blob = await (await fetch(dataUrl)).blob();
        const scan = await scanPngHead(blob);
        if (!scan || !scan.width || !scan.height) return dataUrl;
        const parts = [scan.head.slice(0, 8)];
        for (const c of scan.chunks) {
            if (PNG_TEXT_CHUNK_TYPES.includes(c.type)) continue;
            parts.push(scan.head.slice(c.start, c.end));
        }
        for (const ch of chunks) {
            const patched = patchParametersChunkSize(ch, scan.width, scan.height);
            parts.push(pngChunkBytes(patched.type, patched.data));
        }
        parts.push(blob.slice(scan.idatOffset));
        const outBlob = new Blob(parts, { type: 'image/png' });
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(outBlob);
        });
    } catch (e) {
        console.error('Embedding source metadata failed:', e);
        return dataUrl;
    }
}

function gcd(a, b) {
    return b ? gcd(b, a % b) : a;
}
// Analyze's Ratio: a preset ratio when within 4% of one (1280x832 shows 3:2), else the exact one (9:20).
function ratioLabel(w, h, d) {
    d = d || gcd(w, h);
    const r = w / h, exact = `${w / d}:${h / d}`;
    const near = [[1, 1], [3, 2], [4, 3], [16, 9], [2, 3], [3, 4], [9, 16]].find(([a, b]) => Math.abs(r / (a / b) - 1) <= 0.04);
    return near ? near.join(':') : exact;
}

// Inpaint and img2img share inp_prompt/inp_neg, so a saved default prompt/negative for 'inp' is keyed per sub-mode. Other modes key on their own name.
function defaultKeyMode(mode) {
    if (mode === 'inp' && typeof currentInpaintTopMode !== 'undefined' && currentInpaintTopMode) {
        return `inp_${currentInpaintTopMode}`;
    }
    return mode;
}
