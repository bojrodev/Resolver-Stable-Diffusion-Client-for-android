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
// Replaces the native confirm(). Promise-based, so callers use `await window.appConfirm(...)`.
window.appConfirm = function(message, options = {}) {
    return new Promise((resolve) => {
        __appConfirmResolveFn = resolve;
        const titleEl = document.getElementById('appConfirmTitle');
        const msgEl = document.getElementById('appConfirmMessage');
        const okBtn = document.getElementById('appConfirmOkBtn');
        const cancelBtn = document.getElementById('appConfirmCancelBtn');
        if (titleEl) titleEl.textContent = options.title || 'Confirm';
        if (msgEl) setDialogMessage(msgEl, message, options.link);
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
// Same modal as appConfirm() without the Cancel button (native alert() shape).
window.appAlert = function(message, options = {}) {
    return new Promise((resolve) => {
        __appConfirmResolveFn = resolve;
        const titleEl = document.getElementById('appConfirmTitle');
        const msgEl = document.getElementById('appConfirmMessage');
        const okBtn = document.getElementById('appConfirmOkBtn');
        const cancelBtn = document.getElementById('appConfirmCancelBtn');
        if (titleEl) titleEl.textContent = options.title || 'Notice';
        if (msgEl) setDialogMessage(msgEl, message, options.link);
        if (okBtn) {
            okBtn.textContent = options.okText || 'OK';
            okBtn.style.background = options.danger ? '#f44336' : 'var(--accent-gradient)';
        }
        if (cancelBtn) cancelBtn.classList.add('hidden');
        document.getElementById('appConfirmModal')?.classList.remove('hidden');
        if (typeof lockBodyScroll === 'function') lockBodyScroll();
    });
}
window.__appConfirmResolve = function(result) {
    document.getElementById('appConfirmModal')?.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
    if (__appConfirmResolveFn) {
        __appConfirmResolveFn(result);
        __appConfirmResolveFn = null;
    }
}

// --- BATTERY OPTIMIZATION HELPERS ---

window.requestBatteryPerm = function() {
    // FIX: Grab plugin dynamically to solve initialization race condition
    const svc = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ResolverService) ? window.Capacitor.Plugins.ResolverService : ResolverService;

    if (svc) {
        svc.requestBatteryOpt();
    } else {
        console.log("ResolverService plugin not found");
    }

    localStorage.setItem('bojroBatteryOpt', 'true');
    document.getElementById('batteryModal').classList.add('hidden');
    if (Toast) Toast.show({
        text: 'Opening Settings...',
        duration: 'short'
    });
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

function setupBackgroundListeners() {
    if (!App) return;
    App.addListener('resume', async () => {
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

async function updateBatchNotification(title, force = false, body = "") {
    let progressVal = 0;
    
    // 1. Calculate Progress %
    try {
        if (body && body.includes(" / ")) {
            const parts = body.split(" / ");
            const current = parseInt(parts[0].replace(/\D/g, '')) || 0;
            const total = parseInt(parts[1].replace(/\D/g, '')) || 1;
            if (total > 0) progressVal = Math.floor((current / total) * 100);
        }
    } catch (e) {
        progressVal = 0;
    }

    // 2. THROTTLING LOGIC (The Fix)
    const now = Date.now();
    // Only update if:
    // a. 'force' is true (e.g., Generation is Done)
    // b. OR it has been more than 1000ms (1 second) since the last update
    // c. OR progress is 0% (Start) or 100% (Finish)
    if (!force && (now - lastNotifTime < 1000) && progressVal !== 0 && progressVal !== 100) {
        return; // SKIP this update (Prevent freezing)
    }

    // 3. Update the Timers
    lastNotifTime = now;
    lastProgress = progressVal;

    // 4. Send to Native Service (Safely)
    // We check multiple places where the plugin might exist
    const svc = (typeof ResolverService !== 'undefined' ? ResolverService : null) || 
                (window.Capacitor && window.Capacitor.Plugins ? window.Capacitor.Plugins.ResolverService : null);

    if (svc) {
        try {
            await svc.updateProgress({
                title: title,
                body: body,
                progress: progressVal
            });
        } catch (e) {
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
                    title: "Mission Complete",
                    body: msg,
                    id: 2002,
                    channelId: 'gen_complete_channel',
                    smallIcon: "ic_launcher"
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

// <prefix>_YYMMDD_SEED.png. The seed is read from the image's embedded metadata (Forge writes it), so it works for fresh results and later saves from the viewer. prefix defaults to 'bojro' (Comfy passes 'comfy'). Falls back to a millisecond timestamp. The seed lookup is shared with the long-press "send seed" feature (engine.js).
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
    return `${prefix}_${dateStr}_${suffix}${tag ? '_' + tag : ''}.png`;
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

async function saveToMobileGallery(base64Data, prefix = 'bojro', tag = '', seedOverride = null) {
    try {
        const isNative = window.Capacitor && window.Capacitor.isNative;
        const fileName = await buildOutputFileName(base64Data, prefix, tag, seedOverride);
        if (isNative) {
            const cleanBase64 = base64Data.split(',')[1];
            try {
                await Filesystem.mkdir({
                    path: 'Resolver',
                    directory: 'DOCUMENTS',
                    recursive: false
                });
            } catch (e) {}
            // Queued so same-name saves get distinct names.
            const run = resolverSaveQueue.then(async () => {
                const finalName = await uniqueResolverFileName(fileName);
                await Filesystem.writeFile({
                    path: `Resolver/${finalName}`,
                    data: cleanBase64,
                    directory: 'DOCUMENTS'
                });
            });
            resolverSaveQueue = run.catch(() => {});
            await run;
            if (Toast) await Toast.show({
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
    } catch (e) {
        console.error("Save failed", e);
    }
}

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
function saveImageToDBInBackground(base64, upscale = null, badges = null) {
    imageSavesPending++;
    const saved = imageSaveChain.then(() => Promise.race([
        saveImageToDB(base64, upscale, badges),
        new Promise(resolve => setTimeout(() => resolve(null), IMAGE_SAVE_TIMEOUT_MS))
    ])).catch(() => null);
    imageSaveChain = saved.then(() => { imageSavesPending--; });
    return saved;
}

function saveImageToDB(base64, upscale = null, badges = null) {
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
            const req = store.add({
                data: base64,
                // null (not the full image) when generation failed; loadGallery() falls back to item.data.
                thumbnail: thumbnail,
                date: new Date().toLocaleString(),
                ...(upscale ? { upscale } : {}),
                ...(badges && badges.length ? { badges } : {})
            });
            req.onsuccess = (e) => {
                resolve(e.target.result);
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

// Runs on every edit (no SAVE button). Invalid input while typing isn't saved; enforceGalleryCacheLimitDefault() (boot.js) corrects it on leaving CFG. The setting is saved on every keystroke, but pruning and reloading the gallery is debounced (GALLERY_CACHE_DEBOUNCE_MS).
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

// Called on leaving CFG: corrects an invalid or too-low value back to the default (200) and saves it.
window.enforceGenerationPollingRateDefault = function() {
    const el = document.getElementById('cfgGenerationPollingRate');
    if (!el) return;
    const n = parseInt(el.value);
    if (isNaN(n) || n < MIN_GENERATION_POLLING_RATE) {
        el.value = '200';
        window.saveGenerationPollingRate('200');
    }
};

function loadGenerationPollingRateUI() {
    const el = document.getElementById('cfgGenerationPollingRate');
    if (el) el.value = getGenerationPollingRate();
}

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

// Show Abort/Clear View/the results area (inpResultsArea) only when an image is loaded (sourceImageB64), as canvasWrapper/upscaleWrapper do. Called wherever those wrappers' visibility changes (setInpaintTopMode and its editor.js fallback, two sites in comfy_logic.js).
function updateInpResultsAreaVisibility() {
    const el = document.getElementById('inpResultsArea');
    if (!el) return;
    el.classList.toggle('hidden', !sourceImageB64);
}

// Puts `wanted` inside `parent` in that order, moving nodes only if needed (repeat calls don't touch the DOM).
function ensureChildren(parent, wanted) {
    const current = Array.from(parent.children);
    if (current.length === wanted.length && current.every((node, i) => node === wanted[i])) return;
    wanted.forEach(node => parent.appendChild(node));
}

// Lays out the Auto-Save/Abort/Clear View/Preview area in one of two layouts.
// Preview hidden (Show Live Preview Toggle off): Auto-Save sits under QUEUE, and Abort and Clear View sit under GENERATE at half its width each via .under-generate (style.css, pure CSS). genRow2 stays hidden. The Inpaint/img2img/Upscale tab uses the same class and structure.
// Preview shown: Abort and Clear View take half of genRow1 each, and Auto-Save moves to genRow2 beside Preview.
// Real DOM nodes are moved (listeners and inline handlers survive); ensureChildren() only moves nodes when the order is wrong.
function reorganizeGenRowLayout() {
    const row1 = document.getElementById('genRow1');
    const row2 = document.getElementById('genRow2');
    const autoSaveGroup = document.getElementById('autoSaveGroup');
    const livePreviewGroup = document.getElementById('livePreviewToggleRow');
    const abortBtn = document.getElementById('abortGenBtn');
    const clearBtn = document.getElementById('clearViewBtn');
    if (!row1 || !row2 || !autoSaveGroup || !livePreviewGroup || !abortBtn || !clearBtn) return;

    const showPreview = localStorage.getItem('bojroShowLivePreviewToggle') === 'true';

    if (showPreview) {
        ensureChildren(row2, [autoSaveGroup, livePreviewGroup]);
        ensureChildren(row1, [abortBtn, clearBtn]);
        abortBtn.classList.remove('under-generate');
        clearBtn.classList.remove('under-generate');
        abortBtn.style.flex = '1';
        clearBtn.style.flex = '1';
        // Same 50/50 split as row1, so each toggle sits under its own button.
        autoSaveGroup.style.flex = '1';
        autoSaveGroup.style.minWidth = '';
        livePreviewGroup.style.flex = '1';
        // Centred within each half; the gap is set explicitly (space-between and centre alone don't give the right spacing).
        autoSaveGroup.style.justifyContent = 'center';
        autoSaveGroup.style.gap = '8px';
        livePreviewGroup.style.justifyContent = 'center';
        livePreviewGroup.style.gap = '8px';
        row2.classList.remove('hidden');
        livePreviewGroup.classList.remove('hidden');
    } else {
        ensureChildren(row1, [autoSaveGroup, abortBtn, clearBtn]);
        // Auto-Save fills the slot under QUEUE; min-width:0 keeps the slot QUEUE's width on very narrow screens.
        autoSaveGroup.style.flex = '1 1 0%';
        autoSaveGroup.style.minWidth = '0';
        // Back to the HTML's own layout: no justify-content, same 8px gap.
        autoSaveGroup.style.justifyContent = '';
        autoSaveGroup.style.gap = '8px';
        // Abort/Clear View sized by the class alone - no inline flex.
        abortBtn.style.flex = '';
        clearBtn.style.flex = '';
        abortBtn.classList.add('under-generate');
        clearBtn.classList.add('under-generate');
        row2.classList.add('hidden');
        livePreviewGroup.classList.add('hidden');
    }
}

// The Inpaint/img2img tab's Preview toggle (inpLivePreviewToggleRow), beside Abort. Shown when Show Live Preview Toggle is on, except in Upscale (no live preview). The slot stays put so Abort/Clear View never move. Called from boot, toggleLivePreviewButtonVisibility() (cfg.js) and setInpaintTopMode() (editor.js).
function updateInpPreviewToggleVisibility() {
    const row = document.getElementById('inpLivePreviewToggleRow');
    if (!row) return;
    const enabled = localStorage.getItem('bojroShowLivePreviewToggle') === 'true';
    const isUpscale = typeof currentInpaintTopMode !== 'undefined' && currentInpaintTopMode === 'upscale';
    row.classList.toggle('hidden', !(enabled && !isUpscale));
}

// Live Preview: the toggle sits in the shared Auto-Save/Abort row on the five main modes and, kept in step, beside Abort on the Inpaint/img2img tab (not Upscale). Both are gated by Show Live Preview Toggle (cfg.js); livePreviewCheck is the single source of truth for polling.

// Wraps the native ResolverService.getNetworkType(): 'wifi' | 'cellular' | 'ethernet' | 'other' | 'none' | 'unknown'. Defaults to 'wifi' without the native plugin (desktop browser testing).
async function getCurrentNetworkType() {
    try {
        if (window.Capacitor?.Plugins?.ResolverService?.getNetworkType) {
            const result = await Capacitor.Plugins.ResolverService.getNetworkType();
            return result?.type || 'wifi';
        }
    } catch (e) {}
    return 'wifi';
}

// The person's remembered on/off choice for Live Preview (bojroLivePreviewOn, written only when they tap a toggle; see toggleLivePreview()), separate from what the toggle shows: on disallowed mobile data it shows off but the choice is kept. Always false while the feature is hidden.
function getLivePreviewPreference() {
    return localStorage.getItem('bojroLivePreviewOn') === 'true'
        && localStorage.getItem('bojroShowLivePreviewToggle') === 'true';
}

// Re-evaluates whether the toggles are interactive. Off WiFi (mobile data not allowed): shown off, disabled and greyed out without touching the remembered choice; otherwise enabled and set to the remembered choice. Called at boot, on networkTypeChanged (initLivePreviewNetworkListener()) and when the "allow on mobile data" setting changes.
async function refreshLivePreviewToggleInteractivity() {
    // Both the main tab's toggle and the Inpaint tab's mirror of it.
    const pairs = ['livePreviewCheck', 'inpLivePreviewCheck']
        .map(id => ({ toggle: document.getElementById(id), label: document.querySelector(`label[for="${id}"]`) }))
        .filter(x => x.toggle);
    if (!pairs.length) return;
    const networkType = await getCurrentNetworkType();
    const mobileDataAllowed = localStorage.getItem('bojroLivePreviewMobileDataAllowed') === 'true';
    const shouldBeInteractive = networkType === 'wifi' || mobileDataAllowed;
    if (!shouldBeInteractive) {
        const wasOn = pairs.some(x => x.toggle.checked);
        pairs.forEach(({ toggle, label }) => {
            toggle.checked = false;
            toggle.disabled = true;
            // The label greys out with the switch (var(--text-muted), as Abort's disabled state).
            if (label) label.style.color = 'var(--text-muted)';
        });
        if (wasOn && typeof toggleLivePreview === 'function') toggleLivePreview();
    } else {
        const wanted = getLivePreviewPreference();
        pairs.forEach(({ toggle, label }) => {
            toggle.disabled = false;
            toggle.checked = wanted;
            if (label) label.style.color = 'var(--text-main)';
        });
    }
}

// The toggle's on/off state is remembered across restarts. Only a real tap stores it (called with the switch that changed); code that turns the toggles off itself (mobile data, feature hidden) passes no source. See getLivePreviewPreference(). "Allow on mobile data" is a standing preference, never gated on this toggle (see toggleLivePreviewButtonVisibility(), cfg.js).
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
        Capacitor.Plugins.ResolverService.addListener('networkTypeChanged', () => {
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
            const countReq = store.count();
            countReq.onsuccess = () => {
                const overflow = countReq.result - limit;
                if (overflow <= 0) return resolve();

                let deleted = 0;
                const cursorReq = store.openCursor();
                cursorReq.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (!cursor || deleted >= overflow) {
                        resolve();
                        return;
                    }
                    store.delete(cursor.primaryKey);
                    deleted++;
                    cursor.continue();
                };
                cursorReq.onerror = () => resolve();
            };
            countReq.onerror = () => resolve();
        } catch (e) {
            console.error("Gallery prune failed:", e);
            resolve();
        }
    });
}

window.clearDbGallery = async function() {
    const confirmed = await window.appConfirm("Delete entire history? This cannot be undone.", { title: 'Delete History', okText: 'DELETE', danger: true });
    if (confirmed) {
        const tx = db.transaction(["images"], "readwrite");
        tx.objectStore("images").clear();
        tx.oncomplete = () => {
            isSelectionMode = false;
            selectedImageIds.clear();
            document.getElementById('galDeleteBtn').classList.add('hidden');
            galleryPage = 1;
            // Delete All wipes every row, so both Generation Results strips are emptied outright.
            ['gallery', 'inpGallery'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '';
            });
            if (typeof loadGallery === 'function') loadGallery();
        };
    }
}

// --- METADATA UTILS ---

async function readPngMetadata(blob) {
    try {
        const buffer = await blob.arrayBuffer();
        const view = new DataView(buffer);
        let offset = 8;
        let metadata = "";
        while (offset < view.byteLength) {
            const length = view.getUint32(offset);
            const type = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7));
            if (type === 'tEXt') {
                const data = new Uint8Array(buffer, offset + 8, length);
                metadata += new TextDecoder().decode(data) + "\n";
            }
            if (type === 'iTXt') {
                const data = new Uint8Array(buffer, offset + 8, length);
                const text = new TextDecoder().decode(data);
                metadata += text + "\n";
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

// Appends tags to a prompt/negative box with a correct separator and the trailing ", " (withTrailingComma). Unlike StyleManager.appendSegment it does not skip text that is merely a substring; callers de-duplicate at tag level. Returns nothing (LoraManager.applyAdditionalNegative tracks the inserted tags).
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

// The same, from a file/blob. Only PNGs carry the text chunks readPngMetadata() reads; anything else is "no metadata".
async function readImportablePromptsFromBlob(blob) {
    try {
        const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
        const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
        if (head.length < 8 || !pngSignature.every((b, i) => head[i] === b)) return null;
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

// Inpaint and img2img share inp_prompt/inp_neg, so a saved default prompt/negative for 'inp' is keyed per sub-mode. Other modes key on their own name.
function defaultKeyMode(mode) {
    if (mode === 'inp' && typeof currentInpaintTopMode !== 'undefined' && currentInpaintTopMode) {
        return `inp_${currentInpaintTopMode}`;
    }
    return mode;
}
