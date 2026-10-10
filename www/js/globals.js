// Initialize Icons
if (typeof lucide !== 'undefined') {
    lucide.createIcons();
}

// Single source of truth for the app version (used by the backup version check).
const APP_VERSION = '2.4';

// --- CAPACITOR PLUGINS ---
// We define these globally so all other modules can access them
const Filesystem = window.Capacitor ? window.Capacitor.Plugins.Filesystem : null;
const Browser = window.Capacitor ? window.Capacitor.Plugins.Browser : null;
// In-app toast replacing the native Capacitor Toast plugin, with the same .show({text, duration}) shape. Queues rather than stacks.
const appToastQueue = [];
let appToastIsShowing = false;
function showNextAppToast() {
    if (appToastQueue.length === 0) { appToastIsShowing = false; return; }
    appToastIsShowing = true;
    const { text, duration } = appToastQueue.shift();
    // Durations match the Capacitor Toast plugin's short/long.
    const durationMs = duration === 'long' ? 3500 : 2000;
    const FADE_MS = 250;

    const container = document.getElementById('appToastContainer');
    if (!container) { showNextAppToast(); return; }

    const el = document.createElement('div');
    el.className = 'app-toast';
    el.textContent = text;
    container.appendChild(el);

    requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(10px)';
        setTimeout(() => {
            el.remove();
            showNextAppToast();
        }, FADE_MS);
    }, durationMs);
}
const Toast = {
    show: function({ text, duration } = {}) {
        appToastQueue.push({ text, duration });
        if (!appToastIsShowing) showNextAppToast();
    }
};
const LocalNotifications = window.Capacitor ? window.Capacitor.Plugins.LocalNotifications : null;
const App = window.Capacitor ? window.Capacitor.Plugins.App : null;
const CapacitorHttp = window.Capacitor ? window.Capacitor.Plugins.CapacitorHttp : null;
const ResolverService = window.Capacitor ? window.Capacitor.Plugins.ResolverService : null;
// Add this under the existing plugins
const CapacitorUpdater = window.Capacitor ? window.Capacitor.Plugins.CapacitorUpdater : null;



// --- GLOBAL STATE ---
let currentMode = 'xl';
let currentTask = 'txt'; // 'txt', 'inp'
let currentInpaintMode = 'fill'; // 'fill' (Whole) or 'mask' (Only Masked) - only relevant when currentInpaintTopMode is 'inpaint'
let currentInpaintTopMode = 'inpaint'; // 'inpaint' (mask-based) or 'img2img' (whole-image, no mask at all)
let currentBrushMode = 'draw'; // 'draw' or 'erase'

// Shared by setMode() (ui.js), the post-generation button reset (engine.js) and toggleModelHintsVisibility() (cfg.js).
function getGenerateButtonLabel(mode) {
    if (currentTask === 'inp') return "GENERATE";
    const hideHints = localStorage.getItem('bojroHideModelHints') === 'true';
    if (!hideHints) {
        if (mode === 'flux') return "QUANTUM GENERATE";
        if (mode === 'qwen') return "TURBO GENERATE";
    }
    return "GENERATE";
}

function updateGenerateButtonLabel() {
    const btn = document.getElementById('genBtn');
    if (btn) btn.innerText = getGenerateButtonLabel(currentMode);
}

let db; // IndexedDB instance

// Lets the app-resume listener skip a reconnect while already connected (e.g. after a native file picker).
let isEngineConnected = false;

// EDITOR STATE (Graphics Engine)
let editorImage = null;
let editorScale = 1;
let editorTranslateX = 0;
let editorTranslateY = 0;
let editorMinScale = 1;
// When true, pan/zoom are clamped so the crop box never shows empty space beyond the image.
let confineToImageEnabled = true;
// True while the crop still represents the whole image (set by fitEditorToImage()).
let isFitToImageActive = false;
let editorTargetW = 1024;
let editorTargetH = 1024;
let cropBox = {
    x: 0,
    y: 0,
    w: 0,
    h: 0
};

let isEditorActive = false;
let pinchStartDist = 0;
let panStart = {
    x: 0,
    y: 0
};
let startScale = 1;
let startTranslate = {
    x: 0,
    y: 0
};
// Double-tap-to-zoom in Crop & Edit, same thresholds as the fullscreen viewer.
let editorLastTapTime = 0;
let editorLastTapX = 0;
let editorLastTapY = 0;
const EDITOR_DOUBLE_TAP_MAX_DELAY = 300;
const EDITOR_DOUBLE_TAP_MAX_DIST = 30;

// MAIN CANVAS STATE (Inpainting)
let mainCanvas, mainCtx;
let maskCanvas, maskCtx; // Hidden canvas for mask logic (Black/White)
// Offscreen canvas holding the accumulated full-opacity shape of all strokes; mainCanvas is rebuilt from it at 0.5 alpha (see painting(), editor.js).
let strokeLayerCanvas, strokeLayerCtx;
// Offscreen canvas holding the mask paint while the shared canvas is cleared for img2img/Upscale, so it can be restored on returning to Inpaint. Invalidated by resetInpaintCanvas().
let inpaintModeSwitchSnapshot, inpaintModeSwitchSnapshotCtx;
let inpaintModeSwitchMaskSnapshot, inpaintModeSwitchMaskSnapshotCtx;
let hasInpaintModeSwitchSnapshot = false;
let sourceImageB64 = null; // The final cropped image string - shared by Inpaint, img2img, AND Upscale, all three now use the same loaded/cropped image rather than each having their own upload
// Prompt/negative from the original image's PNG metadata ({pos, neg} or null) for the img2img import buttons. Captured when the image enters the editor, because PROCEED re-encodes it and drops PNG text chunks.
let inpSourceMetadata = null;
// The same read for the image open in the editor but not yet committed (a promise PROCEED can await).
let editorPendingMetadataPromise = null;
let isDrawing = false;
// Cached once per stroke (startPaint()).
let currentStrokeBrushSize = 40;
let historyStates = [];

// Paint canvas zoom/pan: one finger draws, two fingers pinch to zoom and pan (see initMainCanvas(), editor.js).
let paintZoomScale = 1;
let paintTranslateX = 0;
let paintTranslateY = 0;
let paintPinchStartDist = 0;
let paintPinchStartScale = 1;
let paintPinchStartTranslate = { x: 0, y: 0 };
let paintPinchStartMid = null;
const PAINT_MIN_ZOOM = 1;
const PAINT_MAX_ZOOM = 5;

// A single-finger touch is held for PAINT_START_DELAY_MS before painting, so a second finger arriving makes it a pinch rather than a stray dot.
let pendingPaintTouch = null;
let pendingPaintTimer = null;
const PAINT_START_DELAY_MS = 60;
// PAINT_MOVE_THRESHOLD_PX: travel needed before a pending touch counts as a drag.
const PAINT_MOVE_THRESHOLD_PX = 4;

// DATA & PAGINATION
// The full reversed gallery dataset across all pages, so the fullscreen viewer can navigate across page boundaries.
let allGalleryImagesData = [];
let currentGalleryImages = [];
// True only when the fullscreen viewer was opened from the paginated History grid (so closeFsModal() knows whether to re-sync galleryPage).
let fullscreenOpenedFromGalleryGrid = false;

// The mode last generated with (not the selected tab); runJob() uses it for the diffusers-to-SDXL unload. null = nothing generated yet.
let lastGeneratedMode = null;

// The LoRA set last generated with; runJob() unloads and settles if the next job's set differs. null = nothing generated yet.
let lastGeneratedLoraSet = null;

let currentGalleryIndex = 0;
let galleryPage = 1;
const ITEMS_PER_PAGE = 30;

// LoRA Configuration Storage
let loraConfigs = {};
let HOST = "";

// --- CENTRALIZED CONNECTION SYSTEM ---
let connectionConfig = {
    baseIp: "",                    // PC Link (e.g., 192.168.1.50)
    portWebUI: 7860,              // WebUI Port
    portLlm: 1234,                 // LLM Port  
    portWake: 5000,                // Bojro Dev Power (PC Server) Port
    isConfigured: false           // First-run flag
};

// Connection state tracking
let connectionState = {
    webui: false,                 // WebUI connection status
    llm: false,                   // LLM connection status
    wake: false                   // Wake signal status
};

// System locks for preventing sleep/power saving
let globalWakeLock = null;
let globalWifiLock = null;

// QUEUE PERSISTENCE
let queueState = {
    ongoing: [],
    next: [],
    completed: []
};
let isQueueRunning = false;
let isAborting = false; // true only during a deliberate abortQueue() call, so the loop can distinguish a user-cancelled job from a genuine error
let totalBatchSteps = 0;
let currentBatchProgress = 0;
// Sum of each finished job's real ADetailer growth, carried across jobs within one queue run.
let queueADetailerGrowthCarried = 0;
let isSingleJobRunning = false;

let isSelectionMode = false;
let selectedImageIds = new Set();
let currentAnalyzedPrompts = null;

// LLM / PROMPT GENERATION STATE
let llmSettings = {
    baseUrl: 'http://localhost:11434',
    key: '',
    model: '',
    system_xl: `You are an expert SDXL Prompt Engineer. Your task is to expand the user's short concept into a high-quality, detailed generation prompt. Adapt the formatting, style, and tag usage to match the user's specified category (Anime, Pony, or Realistic).`,
    system_flux: ` you are the Flux Photographic Director. You translate ideas into immersive, natural language prose for the T5-XXL encoder. Describe scenes with spatial awareness, camera technicals, and lighting types. OUTPUT ONLY THE PROSE`,
    system_qwen: ` You are the Z-Image Narrative Engine. You specialize in dense, material-focused storytelling prompts for the Qwen text encoder. Focus on textures, atmospheric effects, and sensory details. OUTPUT ONLY THE NARRATIVE.`
};

// MODIFIED: History and Persistent states are now isolated per mode to support your silo logic.
let llmState = {
    xl: {
        input: "",
        output: "",
        history: [],
        persistent: false
    },
    flux: {
        input: "",
        output: "",
        history: [],
        persistent: false
    },
    qwen: {
        input: "",
        output: "",
        history: [],
        persistent: false
    },
    anima: {
        input: "",
        output: "",
        history: [],
        persistent: false
    },
    krea: {
        input: "",
        output: "",
        history: [],
        persistent: false
    }
};

let activeLlmMode = 'xl';

// --- COMFY EDITOR STATE ---
// These flags help the app know if we are currently editing a mask for ComfyUI
var isComfyMaskingMode = false;
var comfyMaskTargetNodeId = null;

// --- UNIVERSAL ROUTER ---
// This function decides what happens when you click "PROCEED" in the editor.
// It checks if you are in "Comfy Mode" or "Standard Mode".
async function handleUniversalProceed() {
    // 1. Check if we are in "ComfyUI Masking Mode"
    if (typeof isComfyMaskingMode !== 'undefined' && isComfyMaskingMode) {
        // We are editing a mask for ComfyUI -> Send it back to Comfy
        if (typeof finishComfyMasking === 'function') {
            finishComfyMasking();
        } else {
            console.error("finishComfyMasking not found! Check comfy_logic.js");
            await window.appAlert("Error: Comfy Logic not loaded.", { title: 'Error', danger: true });
        }
    } 
    // 2. Otherwise, do the standard app behavior (Normal Generation)
    else {
        // We are just editing a normal generation -> Save to Gallery/Canvas
        if (typeof applyEditorChanges === 'function') {
            applyEditorChanges();
        } else {
            console.error("applyEditorChanges not found! Is editor.js loaded?");
        }
    }
}
// --- EDITOR MODES ---
var activeEditorMode = 'mask';    // Modes: 'mask' | 'paint'
var activePaintColor = '#ff0000'; // Default hex color for painting