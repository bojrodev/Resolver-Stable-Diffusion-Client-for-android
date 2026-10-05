// Initialize Icons
if (typeof lucide !== 'undefined') {
    lucide.createIcons();
}

// --- CAPACITOR PLUGINS ---
// We define these globally so all other modules can access them
const Filesystem = window.Capacitor ? window.Capacitor.Plugins.Filesystem : null;
const Browser = window.Capacitor ? window.Capacitor.Plugins.Browser : null;
const Toast = window.Capacitor ? window.Capacitor.Plugins.Toast : null;
const LocalNotifications = window.Capacitor ? window.Capacitor.Plugins.LocalNotifications : null;
const App = window.Capacitor ? window.Capacitor.Plugins.App : null;
const CapacitorHttp = window.Capacitor ? window.Capacitor.Plugins.CapacitorHttp : null;
const ResolverService = window.Capacitor ? window.Capacitor.Plugins.ResolverService : null;
// Add this under the existing plugins
const CapacitorUpdater = window.Capacitor ? window.Capacitor.Plugins.CapacitorUpdater : null;



// --- GLOBAL STATE ---
let currentMode = 'xl';
let currentTask = 'txt'; // 'txt', 'inp'
let currentInpaintMode = 'fill'; // 'fill' (Whole) or 'mask' (Only Masked)
let currentBrushMode = 'draw'; // 'draw' or 'erase'
let db; // IndexedDB instance

// EDITOR STATE (Graphics Engine)
let editorImage = null;
let editorScale = 1;
let editorTranslateX = 0;
let editorTranslateY = 0;
let editorMinScale = 1;
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

// MAIN CANVAS STATE (Inpainting)
let mainCanvas, mainCtx;
let maskCanvas, maskCtx; // Hidden canvas for mask logic (Black/White)
let sourceImageB64 = null; // The final cropped image string
let isDrawing = false;
let historyStates = [];

// DATA & PAGINATION
let historyImagesData = [];
let currentGalleryImages = [];
let currentGalleryIndex = 0;
let galleryPage = 1;
const ITEMS_PER_PAGE = 50;

// LoRA Configuration Storage
let loraConfigs = {};
let HOST = "";

// --- CENTRALIZED CONNECTION SYSTEM ---
let connectionConfig = {
    baseIp: "",                    // PC Link (e.g., 192.168.1.50)
    portWebUI: 7860,              // WebUI Port
    portLlm: 1234,                 // LLM Port  
    portWake: 5000,               // Wake Signal Port
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
let totalBatchSteps = 0;
let currentBatchProgress = 0;
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
function handleUniversalProceed() {
    // 1. Check if we are in "ComfyUI Masking Mode"
    if (typeof isComfyMaskingMode !== 'undefined' && isComfyMaskingMode) {
        // We are editing a mask for ComfyUI -> Send it back to Comfy
        if (typeof finishComfyMasking === 'function') {
            finishComfyMasking();
        } else {
            console.error("finishComfyMasking not found! Check comfy_logic.js");
            alert("Error: Comfy Logic not loaded.");
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