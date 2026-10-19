// -----------------------------------------------------------
// CONFIGURATION & SETTINGS PAGE LOGIC
// -----------------------------------------------------------

// Load configuration from localStorage
function loadConnectionConfig() {
    const saved = localStorage.getItem('bojroConnectionConfig');
    if (saved) {
        connectionConfig = { ...connectionConfig, ...JSON.parse(saved) };
    }
    
    // 1. Load Local Inputs
    if (document.getElementById('cfgBaseIp')) document.getElementById('cfgBaseIp').value = connectionConfig.baseIp || '';
    if (document.getElementById('cfgPortWebUI')) document.getElementById('cfgPortWebUI').value = connectionConfig.portWebUI || 7860;
    if (document.getElementById('cfgPortLlm')) document.getElementById('cfgPortLlm').value = connectionConfig.portLlm || 1234;
    if (document.getElementById('cfgPortComfy')) document.getElementById('cfgPortComfy').value = connectionConfig.portComfy || 8188;
    // Bojro Dev Power (PC Server wake/kill signals), a separate optional companion app; restored independently of the Forge connection.
    if (document.getElementById('cfgPortWake')) document.getElementById('cfgPortWake').value = connectionConfig.portWake || 5000;

    // 2. Load External Inputs
    if (document.getElementById('extUrlForge')) document.getElementById('extUrlForge').value = connectionConfig.extForge || '';
    if (document.getElementById('extUrlWake')) document.getElementById('extUrlWake').value = connectionConfig.extWake || '';
    
    // Cloudflare inputs
    if (document.getElementById('cfgCloudflareSwitch')) {
        document.getElementById('cfgCloudflareSwitch').checked = connectionConfig.isCloudflare || false;
        toggleCloudflareUI();
    }
    if (document.getElementById('cfgCfClientId')) document.getElementById('cfgCfClientId').value = connectionConfig.cfClientId || '';
    if (document.getElementById('cfgCfClientSecret')) document.getElementById('cfgCfClientSecret').value = connectionConfig.cfClientSecret || '';
    
    // 3. Update Toggle Switch
    const elMode = document.getElementById('cfgModeSwitch');
    if (elMode) {
        elMode.checked = connectionConfig.isRemote || false;
        elMode.addEventListener('change', toggleConnectionModeUI);
        toggleConnectionModeUI(); 
    }
    // Saac
    const saacEnabled = localStorage.getItem('bojroSaacEnabled') === 'true';
    const saacBtn = document.getElementById('btn-saac-trigger');
    if(saacBtn) {
        if(saacEnabled) saacBtn.classList.remove('hidden');
        else saacBtn.classList.add('hidden');
    }
    const saacSwitch = document.getElementById('cfgSaacSwitch');
    if(saacSwitch) saacSwitch.checked = saacEnabled;

    // Additional Upscale Features (GFPGAN/CodeFormer blend fields): off by default (legacy parameters Forge Neo no longer shows).
    const upscaleExpEnabled = localStorage.getItem('bojroUpscaleExpEnabled') === 'true';
    const upscaleExpSwitch = document.getElementById('cfgUpscaleExpSwitch');
    if (upscaleExpSwitch) upscaleExpSwitch.checked = upscaleExpEnabled;
    document.getElementById('upscaleExpFields')?.classList.toggle('hidden', !upscaleExpEnabled);

    // Never OOM (Tiled VAE Decode / UNet Always Offload): off by default; shown or hidden as one unit via .neveroom-box.
    const neverOomEnabled = localStorage.getItem('bojroNeverOomVisible') === 'true';
    const neverOomSwitch = document.getElementById('cfgNeverOomSwitch');
    if (neverOomSwitch) neverOomSwitch.checked = neverOomEnabled;
    document.querySelectorAll('.neveroom-box').forEach(el => el.classList.toggle('hidden', !neverOomEnabled));

    // Hide Model-Specific Hints & Labels: inverted like Dev Power, so off means visible.
    const hideModelHints = localStorage.getItem('bojroHideModelHints') === 'true';
    const hideModelHintsSwitch = document.getElementById('cfgHideModelHintsSwitch');
    if (hideModelHintsSwitch) hideModelHintsSwitch.checked = hideModelHints;
    document.querySelectorAll('.model-hint').forEach(el => el.classList.toggle('hidden', hideModelHints));
    if (typeof updateGenerateButtonLabel === 'function') updateGenerateButtonLabel();

    // Update Notifications: on or absent (default) runs the launch update check and notice board; stored as the OFF state.
    const updateNoticesSwitch = document.getElementById('cfgUpdateNoticesSwitch');
    if (updateNoticesSwitch) updateNoticesSwitch.checked = localStorage.getItem('bojroUpdateNoticesOff') !== 'true';

    // Low Bits rows under the checkpoint (off by default; set in the Checkpoint Manager).
    const showLowBits = localStorage.getItem('bojroShowLowBitsRows') === 'true';
    const showLowBitsSwitch = document.getElementById('cfgShowLowBitsSwitch');
    if (showLowBitsSwitch) showLowBitsSwitch.checked = showLowBits;
    applyLowBitsRowsVisible(showLowBits);

    // Abort Job If App Closes or Disconnects (off by default, jobabort.js).
    const abortOnCloseSwitch = document.getElementById('cfgAbortJobOnCloseSwitch');
    if (abortOnCloseSwitch) abortOnCloseSwitch.checked = localStorage.getItem('bojroAbortJobOnClose') === 'true';

    // Auto-Collapse Config Sections (off by default).
    const oneSectionSwitch = document.getElementById('cfgOneSectionSwitch');
    if (oneSectionSwitch) oneSectionSwitch.checked = localStorage.getItem('bojroCfgOneSection') === 'true';

    // Floating Brush Size (off by default).
    const floatingBrushSwitch = document.getElementById('cfgFloatingBrushSwitch');
    if (floatingBrushSwitch) floatingBrushSwitch.checked = localStorage.getItem('bojroFloatingBrushSize') === 'true';

    // Gallery Badges switch.
    const galleryBadgesOff = localStorage.getItem('bojroGalleryBadgesOff') === 'true';
    const galleryBadgesSwitch = document.getElementById('cfgGalleryBadgesSwitch');
    if (galleryBadgesSwitch) galleryBadgesSwitch.checked = !galleryBadgesOff;
    document.body.classList.toggle('hide-gallery-badges', galleryBadgesOff);

    // Hide Loading Circle: off/absent (the default) means the circle shows.
    const hideGenSpinner = localStorage.getItem('bojroHideGenSpinner') === 'true';
    const hideGenSpinnerSwitch = document.getElementById('cfgHideGenSpinnerSwitch');
    if (hideGenSpinnerSwitch) hideGenSpinnerSwitch.checked = hideGenSpinner;
    applyGenSpinnerHidden(hideGenSpinner);

    // Show & Download Batch Grids: off/absent (the default) means no grids.
    const showBatchGridsSwitch = document.getElementById('cfgShowBatchGridsSwitch');
    const showBatchGrids = localStorage.getItem('bojroShowBatchGrids') === 'true';
    if (showBatchGridsSwitch) showBatchGridsSwitch.checked = showBatchGrids;
    const limitBatchGridSwitch = document.getElementById('cfgLimitBatchGridSwitch');
    if (limitBatchGridSwitch) limitBatchGridSwitch.checked = localStorage.getItem('bojroLimitBatchGrid') === 'true';
    document.getElementById('batchGridLimitRow')?.classList.toggle('hidden', !showBatchGrids);

    // Prompt Auto-Formatting (ui.js): off by default; its on-blur option shows only while it's on.
    const promptFormat = localStorage.getItem('bojroPromptFormat') === 'true';
    const promptFormatSwitch = document.getElementById('cfgPromptFormatSwitch');
    if (promptFormatSwitch) promptFormatSwitch.checked = promptFormat;
    const promptFormatBlurSwitch = document.getElementById('cfgPromptFormatBlurSwitch');
    if (promptFormatBlurSwitch) promptFormatBlurSwitch.checked = localStorage.getItem('bojroPromptFormatOnBlur') === 'true';
    document.getElementById('promptFormatBlurRow')?.classList.toggle('hidden', !promptFormat);

    // Recent Results Shown (engine.js).
    const resultStripLimitEl = document.getElementById('cfgResultStripLimit');
    if (resultStripLimitEl && typeof resultStripLimit === 'function') resultStripLimitEl.value = resultStripLimit();

    // Auto-Delete Warning: on unless switched off (utils.js).
    const autoDeleteWarningSwitch = document.getElementById('cfgAutoDeleteWarningSwitch');
    if (autoDeleteWarningSwitch) autoDeleteWarningSwitch.checked = localStorage.getItem('bojroAutoDeleteWarning') !== 'false';

    const keepSourceSeedSwitch = document.getElementById('cfgKeepSourceSeedSwitch');
    if (keepSourceSeedSwitch) keepSourceSeedSwitch.checked = localStorage.getItem('bojroKeepSourceSeed') === 'true';

    const progressBridgeSwitch = document.getElementById('cfgProgressBridgeSwitch');
    if (progressBridgeSwitch) progressBridgeSwitch.checked = localStorage.getItem('bojroProgressBridgeEnabled') === 'true';

    // Show ADetailer/ControlNet default to OFF, split into SDXL/Anima and Other toggles. A one-time migration carries an old single "on" toggle into both, while neither has been touched.
    try {
        if (localStorage.getItem('bojroShowAdetailer') === 'true' &&
            localStorage.getItem('bojroShowAdetailerSdxlAnima') === null &&
            localStorage.getItem('bojroShowAdetailerOther') === null) {
            localStorage.setItem('bojroShowAdetailerSdxlAnima', 'true');
            localStorage.setItem('bojroShowAdetailerOther', 'true');
        }
        if (localStorage.getItem('bojroShowControlnet') === 'true' &&
            localStorage.getItem('bojroShowControlnetSdxlAnima') === null &&
            localStorage.getItem('bojroShowControlnetOther') === null) {
            localStorage.setItem('bojroShowControlnetSdxlAnima', 'true');
            localStorage.setItem('bojroShowControlnetOther', 'true');
        }
    } catch (e) {
        console.error("Show ADetailer/ControlNet split migration failed:", e);
    }
    const showAdetailerSdxlAnima = localStorage.getItem('bojroShowAdetailerSdxlAnima') === 'true';
    const showAdetailerSdxlAnimaSwitch = document.getElementById('cfgShowAdetailerSdxlAnimaSwitch');
    if (showAdetailerSdxlAnimaSwitch) showAdetailerSdxlAnimaSwitch.checked = showAdetailerSdxlAnima;
    document.querySelectorAll('.adetailer-section-sdxl-anima').forEach(el => el.classList.toggle('feature-hidden', !showAdetailerSdxlAnima));

    const showAdetailerOther = localStorage.getItem('bojroShowAdetailerOther') === 'true';
    const showAdetailerOtherSwitch = document.getElementById('cfgShowAdetailerOtherSwitch');
    if (showAdetailerOtherSwitch) showAdetailerOtherSwitch.checked = showAdetailerOther;
    document.querySelectorAll('.adetailer-section-other').forEach(el => el.classList.toggle('feature-hidden', !showAdetailerOther));

    // Restored after both switches above, because updateExtraAdetailerPassesToggleState() reads their .checked state.
    const showExtraAdetailerPasses = localStorage.getItem('bojroShowExtraAdetailerPasses') === 'true';
    const showExtraAdetailerPassesSwitch = document.getElementById('cfgShowExtraAdetailerPassesSwitch');
    if (showExtraAdetailerPassesSwitch) showExtraAdetailerPassesSwitch.checked = showExtraAdetailerPasses;
    document.querySelectorAll('.ad-pass-row-extra').forEach(el => el.classList.toggle('hidden', !showExtraAdetailerPasses));

    // Restored here too: its row visibility depends on the same two switches, and it runs before updateExtraAdetailerPassesToggleState().
    const adetailerControlNetEnabled = localStorage.getItem('bojroAdetailerControlNet') === 'true';
    const adetailerControlNetSwitch = document.getElementById('cfgAdetailerControlNetSwitch');
    if (adetailerControlNetSwitch) adetailerControlNetSwitch.checked = adetailerControlNetEnabled;
    document.querySelectorAll('.adetailer-cn-section').forEach(el => el.classList.toggle('feature-hidden', !adetailerControlNetEnabled));

    if (typeof updateExtraAdetailerPassesToggleState === 'function') updateExtraAdetailerPassesToggleState();

    const showControlnetSdxlAnima = localStorage.getItem('bojroShowControlnetSdxlAnima') === 'true';
    const showControlnetSdxlAnimaSwitch = document.getElementById('cfgShowControlnetSdxlAnimaSwitch');
    if (showControlnetSdxlAnimaSwitch) showControlnetSdxlAnimaSwitch.checked = showControlnetSdxlAnima;
    document.querySelectorAll('.controlnet-section-sdxl-anima').forEach(el => el.classList.toggle('feature-hidden', !showControlnetSdxlAnima));

    // Show Upload History (Analyze / Edit): on unless switched off (analyzerhistory.js).
    const analyzerHistorySwitch = document.getElementById('cfgAnalyzerHistorySwitch');
    if (analyzerHistorySwitch) analyzerHistorySwitch.checked = localStorage.getItem('bojroAnalyzerHistory') !== 'false';
    const editHistorySwitch = document.getElementById('cfgEditHistorySwitch');
    if (editHistorySwitch) editHistorySwitch.checked = localStorage.getItem('bojroEditHistory') !== 'false';
    if (window.AnalyzerHistory) AnalyzerHistory.applyVisibility();
    if (window.EditHistory) EditHistory.applyVisibility();

    // Analyzer sticky action bar: OFF unless switched on here (see analyzer.js)
    const analyzerStickyBarSwitch = document.getElementById('cfgAnalyzerStickyBarSwitch');
    if (analyzerStickyBarSwitch) analyzerStickyBarSwitch.checked = localStorage.getItem('bojroAnalyzerStickyBar') === 'true';

    const showControlnetOther = localStorage.getItem('bojroShowControlnetOther') === 'true';
    const showControlnetOtherSwitch = document.getElementById('cfgShowControlnetOtherSwitch');
    if (showControlnetOtherSwitch) showControlnetOtherSwitch.checked = showControlnetOther;
    document.querySelectorAll('.controlnet-section-other').forEach(el => el.classList.toggle('feature-hidden', !showControlnetOther));
    if (typeof updateFsControlNetButtons === 'function') updateFsControlNetButtons();

    // Checkpoint Manager count beside MANAGE.
    if (typeof updateCheckpointManagerCount === 'function') updateCheckpointManagerCount();

    // Bojro Dev Power: inverted, so unchecked (default) means visible.
    const hideDevPower = localStorage.getItem('bojroHideDevPower') === 'true';
    const hideDevPowerSwitch = document.getElementById('cfgHideDevPowerSwitch');
    if (hideDevPowerSwitch) hideDevPowerSwitch.checked = hideDevPower;
    document.getElementById('devPowerSection')?.classList.toggle('hidden', hideDevPower);

    const showFluxCache = localStorage.getItem('bojroShowFluxCache') === 'true';
    const fluxCacheSwitch = document.getElementById('cfgFluxCacheSwitch');
    if (fluxCacheSwitch) fluxCacheSwitch.checked = showFluxCache;
    document.getElementById('fluxCacheSection')?.classList.toggle('hidden', !showFluxCache);

    const showLivePreview = localStorage.getItem('bojroShowLivePreviewToggle') === 'true';
    const livePreviewSwitch = document.getElementById('cfgShowLivePreviewSwitch');
    if (livePreviewSwitch) livePreviewSwitch.checked = showLivePreview;
    // livePreviewToggleRow visibility/position is handled by reorganizeGenRowLayout() (utils.js).
    document.querySelectorAll('.lp-option-row').forEach(r => r.classList.toggle('hidden', !showLivePreview));

    // Always interactive when visible; a standing preference, not tied to the main toggle.
    const mobileDataAllowed = localStorage.getItem('bojroLivePreviewMobileDataAllowed') === 'true';
    const mobileDataSwitch = document.getElementById('cfgLivePreviewMobileDataSwitch');
    if (mobileDataSwitch) mobileDataSwitch.checked = mobileDataAllowed;

    // Custom checkpoint/upscaler picker (always on). A no-op at boot; the lists are filled later by fetchModels()/fetchUpscalers().
    if (typeof initModelPickers === 'function') initModelPickers();
}

// NEW: Helper to toggle UI visibility
function toggleConnectionModeUI() {
    const isRemote = document.getElementById('cfgModeSwitch').checked;
    if (typeof connectionConfig !== 'undefined') {
        connectionConfig.isRemote = isRemote;
        if (typeof buildWebUIUrl === 'function') {
            HOST = buildWebUIUrl();
        }
        }


    const localCont = document.getElementById('container-local');
    const extCont = document.getElementById('container-external');
    const label = document.getElementById('modeLabel');


    if (isRemote) {
        localCont.classList.add('hidden');
        extCont.classList.remove('hidden');
        if(label) label.innerText = "EXTERNAL (TUNNEL)";
        if(label) label.style.color = "var(--accent-primary)";
    } else {
        localCont.classList.remove('hidden');
        extCont.classList.add('hidden');
        if(label) label.innerText = "LOCAL NETWORK";
        if(label) label.style.color = "var(--text-muted)";
    }
}

// Save configuration to localStorage
function saveConnectionConfig() {
    localStorage.setItem('bojroConnectionConfig', JSON.stringify(connectionConfig));
}

// Build full URLs from base IP and ports
function buildWebUIUrl() {
    if (connectionConfig.isRemote) return connectionConfig.extForge || "";
    return constructLocalUrl(connectionConfig.portWebUI || 7860);
}

function buildComfyUrl() {
    if (connectionConfig.isRemote) return ""; 
    return constructLocalUrl(connectionConfig.portComfy || 8188);
}

function buildLlmUrl() {
    if (connectionConfig.isRemote) return "";
    return constructLocalUrl(connectionConfig.portLlm || 1234);
}

// Bojro Dev Power's URL: Wake keeps a remote/tunnel equivalent since the companion app can be tunnelled.
function buildWakeUrl() {
    if (connectionConfig.isRemote) return connectionConfig.extWake || "";
    return constructLocalUrl(connectionConfig.portWake || 5000);
}

function constructLocalUrl(port) {
    if (!connectionConfig.baseIp) return '';
    let url = connectionConfig.baseIp.trim();
    url = url.replace(/\/$/, ""); // Remove trailing slash
    url = url.replace(/^https?:\/\//, ''); // Remove protocol
    
    if (port && !url.includes(':')) {
        url += `:${port}`;
    }
    return `http://${url}`;
}

// Update connection status display
function updateConnectionStatus(service, status) {
    if(!connectionState) return;
    connectionState[service] = status;
    
    // Update UI elements based on service
    if (service === 'webui') {
        const btn = document.getElementById('webuiLinkBtn');
        const dot = document.getElementById('webuiStatusDot');
        const statusText = document.getElementById('connectionStatus');
        
        if (!btn || !dot || !statusText) return;
        
        // Remove all state classes
        btn.classList.remove('connecting', 'connected', 'disconnected');
        dot.classList.remove('connecting', 'connected', 'disconnected');
        
        if (status === 'connecting') {
            btn.classList.add('connecting');
            btn.innerText = 'LINKING...';
            dot.classList.add('connecting');
            statusText.innerText = 'Connecting...';
            statusText.style.color = 'var(--accent-primary)';
        } else if (status === 'connected') {
            btn.classList.add('connected');
            btn.innerText = 'CONNECTED';
            dot.classList.add('connected');
            statusText.innerText = `Connected to ${connectionConfig.baseIp}`;
            statusText.style.color = 'var(--success)';
        } else {
            btn.classList.add('disconnected');
            btn.innerText = 'LINK';
            dot.classList.add('disconnected');
            statusText.innerText = 'Not Connected';
            statusText.style.color = 'var(--text-muted)';
        }
    }
    
    if (service === 'llm') {
        const btn = document.getElementById('llmLinkBtn');
        const dot = document.getElementById('llmStatusDot');
        
        if (!btn || !dot) return;
        
        // Remove all state classes
        btn.classList.remove('connecting', 'connected', 'disconnected');
        dot.classList.remove('connecting', 'connected', 'disconnected');
        
        if (status === 'connecting') {
            btn.classList.add('connecting');
            btn.innerText = 'LINKING...';
            dot.classList.add('connecting');
        } else if (status === 'connected') {
            btn.classList.add('connected');
            btn.innerText = 'CONNECTED';
            dot.classList.add('connected');
        } else {
            btn.classList.add('disconnected');
            btn.innerText = 'LINK';
            dot.classList.add('disconnected');
        }
    }
}

// Settings page functions
// Configuration saves automatically on every change; the "Configuration Saved" toast fires once, when leaving the CFG tab (switchTab(), boot.js).
window.saveConfiguration = function(showToast = false) {
    // The auto-save path marks the config dirty, so the toast on leaving CFG only fires after a real edit (reset in switchTab()).
    if (!showToast) window.__cfgDirty = true;
    // Read Local Values
    const baseIp = document.getElementById('cfgBaseIp').value.trim();
    const isRemote = document.getElementById('cfgModeSwitch').checked;
    const portWebUI = document.getElementById('cfgPortWebUI').value;
    const portLlm = document.getElementById('cfgPortLlm').value;
    const portComfy = document.getElementById('cfgPortComfy').value;
    // Bojro Dev Power's port, independent of the Forge connection.
    const portWake = document.getElementById('cfgPortWake').value;

    // Read External Values
    const extForge = document.getElementById('extUrlForge').value.trim().replace(/\/$/, "");
    const extWake = document.getElementById('extUrlWake').value.trim().replace(/\/$/, "");

    // Cloudflare Values
    const isCloudflare = document.getElementById('cfgCloudflareSwitch').checked;
    const cfClientId = document.getElementById('cfgCfClientId').value.trim();
    const cfClientSecret = document.getElementById('cfgCfClientSecret').value.trim();

    // Save to Config Object
    connectionConfig.baseIp = baseIp;
    connectionConfig.isRemote = isRemote;
    connectionConfig.portWebUI = portWebUI;
    connectionConfig.portLlm = portLlm;
    connectionConfig.portComfy = portComfy;
    connectionConfig.portWake = portWake;
    
    // Save New Fields
    connectionConfig.extForge = extForge;
    // Comfy/LLM external configs stay removed in remote mode; Wake is kept for Bojro Dev Power signals.
    connectionConfig.extComfy = "";
    connectionConfig.extLlm = "";
    connectionConfig.extWake = extWake;
    
    connectionConfig.isCloudflare = isCloudflare;
    connectionConfig.cfClientId = cfClientId;
    connectionConfig.cfClientSecret = cfClientSecret;

    connectionConfig.isConfigured = true;
    
    saveConnectionConfig();
    
    // Update Global HOST
    HOST = buildWebUIUrl();
    localStorage.setItem('bojroHostIp', HOST);
    
    // Comfy is Local Only now, or empty if remote
    const comfyUrl = buildComfyUrl();
    if (comfyUrl) {
        localStorage.setItem('comfyHost', comfyUrl.replace('http://','').replace('https://',''));
    }

    if (showToast && Toast) Toast.show({ text: 'Configuration Saved', duration: 'short' });
}

// www/js/cfg.js

// What "Reset App Configuration" resets: the options in Config, which sections are open, and prompts shown once, as on
// first install. Everything else is kept: server connections, prompts and generation settings, the queue, the gallery,
// styles, LoRAs, the Checkpoint Manager, presets, default prompts, ComfyUI templates, Character Select and app updates.
// Gallery Cache Limit is kept too: the gallery is trimmed to it at launch, so a lower one would delete images at once.
const RESET_KEYS = [
    // Interface
    'bojroTheme', 'bojroResultStripLimit', 'bojroAnalyzerHistory', 'bojroEditHistory', 'bojroCfgOneSection',
    'bojroFloatingBrushSize', 'bojroHideModelHints', 'bojroHideGenSpinner', 'bojroGalleryBadgesOff', 'bojroHideDevPower',
    'bojro_model_visibility', 'bojroTallPrompt', 'bojroTallNeg',
    // Generation
    'bojroAutoDeleteWarning', 'bojroAutoSave', 'bojroGenerationPollingRate', 'bojroBackgroundPollingRate',
    'bojroKeepSourceSeed', 'bojroProgressBridgeEnabled', 'bojroShowBatchGrids', 'bojroLimitBatchGrid',
    'bojroShowLivePreviewToggle', 'bojroLivePreviewMobileDataAllowed', 'bojroLpMethod', 'bojroLpEveryN', 'bojroLpBorder',
    // Models
    'bojroShowAdetailer', 'bojroShowAdetailerOther', 'bojroShowAdetailerSdxlAnima', 'bojroAdetailerControlNet',
    'bojroShowControlnet', 'bojroShowControlnetOther', 'bojroShowControlnetSdxlAnima', 'bojroShowExtraAdetailerPasses',
    'bojroShowLowBitsRows', 'bojroShowFluxCache', 'bojroNeverOomVisible', 'bojro_upscaler2_visibility',
    // Experimental
    'bojroUpscaleExpEnabled', 'bojroPromptFormat', 'bojroPromptFormatOnBlur', 'bojroSaacEnabled',
    'bojroAbortJobOnClose', 'bojroDataUsageTracker', 'bojroDataUsagePill', 'bojroDebugLogEnabled',
    'bojroHideFromAccessibility', 'bojroLiveUpdate',
    // View, and prompts shown once (battery optimisation, update notices, a skipped update)
    'bojroLoraViewMode', 'bojroAnalyzerStickyBar', 'bojroBatteryOpt', 'bojroUpdateNoticesOff', 'bojro_skip_version',
];
// Which Config and tab sections are open.
const RESET_PREFIXES = ['bojro_vis_', 'bojro_collapse_'];

function isResetKey(key) {
    return RESET_KEYS.includes(key) || RESET_PREFIXES.some(p => key.startsWith(p));
}

window.resetAppConfig = async function() {
    if (!await window.appConfirm('Every option in Config goes back to its default. Your server connections, prompts, gallery, styles, LoRAs, presets and other saved content are kept.', { title: 'Reset App Configuration', okText: 'RESET', danger: true })) return;
    // Keys are collected first, as removing while iterating skips entries.
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (isResetKey(key)) keys.push(key);
    }
    keys.forEach(key => localStorage.removeItem(key));
    // The page reads everything afresh; settings Android keeps its own copy of are sent again at launch.
    window.location.reload();
};

// Double Prompt Box Height / Double Negative Box Height (Config > Interface): each tab's prompt and negative boxes are
// 3 rows tall, or 6 with the option on.
const PROMPT_BOX_MODES = ['xl', 'flux', 'qwen', 'anima', 'krea', 'inp'];
function applyPromptBoxHeights() {
    const tall = key => localStorage.getItem(key) === 'true';
    PROMPT_BOX_MODES.forEach(m => {
        const p = document.getElementById(`${m}_prompt`), n = document.getElementById(`${m}_neg`);
        if (p) p.rows = tall('bojroTallPrompt') ? 6 : 3;
        if (n) n.rows = tall('bojroTallNeg') ? 6 : 3;
    });
    const ps = document.getElementById('cfgTallPromptSwitch'), ns = document.getElementById('cfgTallNegSwitch');
    if (ps) ps.checked = tall('bojroTallPrompt');
    if (ns) ns.checked = tall('bojroTallNeg');
}
window.togglePromptBoxHeight = function(field, on) {
    localStorage.setItem(field === 'neg' ? 'bojroTallNeg' : 'bojroTallPrompt', on ? 'true' : 'false');
    applyPromptBoxHeights();
};
applyPromptBoxHeights();

// Live Preview Border (Config > Generation, on by default): the ring round the preview image (style.css).
function applyLivePreviewBorder() {
    const on = localStorage.getItem('bojroLpBorder') !== 'false';
    document.body.classList.toggle('lp-border-off', !on);
    const sw = document.getElementById('cfgLpBorderSwitch');
    if (sw) sw.checked = on;
}
window.toggleLivePreviewBorder = function(on) {
    localStorage.setItem('bojroLpBorder', on ? 'true' : 'false');
    applyLivePreviewBorder();
};
applyLivePreviewBorder();

// Live Preview Method / Live Preview Every N Steps (Config > Generation). Sent with each job while Live Preview is on, as
// per-job overrides that Forge Neo puts back afterwards, so its own settings are left alone. Empty = Forge's setting.
window.saveLivePreviewOverride = function(sel) {
    localStorage.setItem(sel.dataset.key, sel.value);
};
function livePreviewOverrides() {
    const out = {};
    const method = localStorage.getItem('bojroLpMethod');
    const everyN = parseInt(localStorage.getItem('bojroLpEveryN'), 10);
    if (['RGB', 'Approx NN', 'TAESD'].includes(method)) out.show_progress_type = method;
    if (everyN >= 1 && everyN <= 5) out.show_progress_every_n_steps = everyN;
    return out;
}
;(function () {
    ['cfgLpMethod', 'cfgLpEveryN'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const saved = localStorage.getItem(sel.dataset.key) || '';
        sel.value = [...sel.options].some(o => o.value === saved) ? saved : '';
        if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText(id);
    });
})();

// Backs up every localStorage key, independent of what resetAppConfig() resets.
window.backupAppSettings = async function() {
    try {
        const settings = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            settings[key] = localStorage.getItem(key);
        }

        const payload = {
            app: 'Resolver',
            appVersion: APP_VERSION,
            exportedAt: new Date().toISOString(),
            settings: settings
        };
        const json = JSON.stringify(payload, null, 2);
        // Shortened to resolver-YYYYMMDDHHMMSS.json.
        const iso = new Date().toISOString(); // e.g. "2026-09-06T17:45:33.717Z"
        const stamp = iso.slice(0, 10).replace(/-/g, '') + iso.slice(11, 19).replace(/:/g, '');
        const filename = `resolver-${stamp}.json`;

        const fs = typeof Filesystem !== 'undefined' ? Filesystem : null;
        if (fs) {
            const result = await fs.writeFile({
                path: filename,
                data: json,
                directory: 'DOCUMENTS',
                encoding: 'utf8'
            });
            // A toast (without the filename) confirms the export.
            if (typeof Toast !== 'undefined') Toast.show({ text: 'Backup complete', duration: 'short' });
        } else {
            // Browser fallback (e.g. testing outside the native app): download link.
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    } catch (e) {
        await window.appAlert('Backup failed: ' + e.message, { title: 'Backup Failed', danger: true });
    }
}

// Restores an exported backup, replacing current settings (not merging).
window.restoreAppSettings = async function(event) {
    const file = event.target.files[0];
    event.target.value = ''; // reset so picking the same file again still fires onchange
    if (!file) return;

    // Another app's file (or not JSON at all): back on Config with a toast, no confirmation.
    const incompatible = () => {
        if (typeof window.switchTab === 'function') window.switchTab('cfg');
        if (typeof Toast !== 'undefined' && Toast) Toast.show({ text: 'Incompatible backup', duration: 'short' });
    };
    let payload;
    try { payload = JSON.parse(await file.text()); } catch (e) { incompatible(); return; }
    // backupAppSettings() writes app: 'Resolver' and the settings as strings.
    const settings = payload && payload.app === 'Resolver' && payload.settings && typeof payload.settings === 'object' && !Array.isArray(payload.settings) ? payload.settings : null;
    const keys = settings ? Object.keys(settings) : [];
    if (!keys.length || keys.some(k => typeof settings[k] !== 'string')) { incompatible(); return; }

    try {

        const when = payload && payload.exportedAt ? new Date(payload.exportedAt).toLocaleString() : 'this file';
        const backupVersion = payload && payload.appVersion;
        let versionNote = '';
        if (backupVersion && typeof APP_VERSION !== 'undefined' && backupVersion !== APP_VERSION) {
            // Can't auto-fix renamed or reshaped settings, but flag it.
            versionNote = `\n\nWarning: this backup is from version ${backupVersion}, but you're on ${APP_VERSION}. Some settings may have been renamed or restructured since then and might not restore correctly.`;
        }

        const confirmed = await window.appConfirm(`Restore settings from ${when}?${versionNote}\n\nThis replaces ALL current settings and cannot be undone. The app will reload afterward.`, { title: 'Restore Settings', okText: 'RESTORE', danger: true });
        if (!confirmed) {
            return;
        }

        localStorage.clear();
        keys.forEach(key => localStorage.setItem(key, settings[key]));

        await window.appAlert('Settings restored. Reloading...', { title: 'Restore Complete' });
        window.location.reload();
    } catch (e) {
        await window.appAlert('Restore failed: ' + e.message, { title: 'Restore Failed', danger: true });
    }
}

// Test connection functions
window.connectToLlmService = async function() {
    if (!connectionConfig.baseIp) {
        await window.appAlert('Please configure your connection settings first');
        switchTab('cfg');
        return;
    }
    
    const btn = document.getElementById('llmLinkBtn');
    
    updateConnectionStatus('llm', 'connecting');
    
    try {
        const url = buildLlmUrl();
        
        if (!CapacitorHttp) {
            throw new Error("Native HTTP Plugin not loaded!");
        }
        
        const response = await CapacitorHttp.get({
            url: `${url}/v1/models`,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status >= 400) throw new Error(`HTTP ${response.status}`);
        
        const data = response.data;
        if (data.data && Array.isArray(data.data)) {
            const select = document.getElementById('llmModelSelect');
            select.innerHTML = "";
            data.data.forEach(m => {
                select.appendChild(new Option(m.id, m.id));
            });

            const lastModel = localStorage.getItem('bojroLastLlmModel');
            if (lastModel && Array.from(select.options).some(o => o.value === lastModel)) {
                select.value = lastModel;
            }
            if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText('llmModelSelect');
            
            // Update LLM settings for backward compatibility
            llmSettings.baseUrl = url;
            localStorage.setItem('bojroLlmConfig', JSON.stringify(llmSettings));
            
            updateConnectionStatus('llm', 'connected');
            
            if (Toast) Toast.show({
                text: `Found ${data.data.length} models`,
                duration: 'short'
            });
        } else {
            throw new Error("Invalid model format");
        }
    } catch (e) {
        updateConnectionStatus('llm', 'disconnected');
        await window.appAlert("Link Error: " + (e.message || JSON.stringify(e)), { title: 'Link Error', danger: true });
    }
}

window.saveLastLlmModel = function() {
    const select = document.getElementById('llmModelSelect');
    if (select && select.value) localStorage.setItem('bojroLastLlmModel', select.value);
}

// Initialize configuration on page load
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('cfgBaseIp')) {
        loadConnectionConfig();
    }
    
    loadModelVisibility(); 

    // Initialize connection status displays
    updateConnectionStatus('webui', 'disconnected');
    updateConnectionStatus('llm', 'disconnected');
});

// --- INTERFACE VISIBILITY LOGIC (UPDATED FOR COMFY) ---

window.loadModelVisibility = function() {
    const saved = localStorage.getItem('bojro_model_visibility');
    const config = saved ? JSON.parse(saved) : { xl: true, flux: true, qwen: true, anima: true, krea: true, comfy: false };
    if (config.anima === undefined) config.anima = true; // migrate old configs
    if (config.krea === undefined) config.krea = true;

    const elXl = document.getElementById('cfgShowXl');
    const elFlux = document.getElementById('cfgShowFlux');
    const elQwen = document.getElementById('cfgShowQwen');
    const elAnima = document.getElementById('cfgShowAnima');
    const elKrea = document.getElementById('cfgShowKrea');
    const elComfy = document.getElementById('cfgShowComfy'); 

    if (elXl) elXl.checked = config.xl;
    if (elFlux) elFlux.checked = config.flux;
    if (elQwen) elQwen.checked = config.qwen;
    if (elAnima) elAnima.checked = config.anima;
    if (elKrea) elKrea.checked = config.krea;
    if (elComfy) elComfy.checked = config.comfy; 

    applyModelVisibility(config);
}

window.saveModelVisibility = function() {
    const config = {
        xl: document.getElementById('cfgShowXl').checked,
        flux: document.getElementById('cfgShowFlux').checked,
        qwen: document.getElementById('cfgShowQwen').checked,
        anima: document.getElementById('cfgShowAnima').checked,
        krea: document.getElementById('cfgShowKrea').checked,
        comfy: document.getElementById('cfgShowComfy').checked 
    };
    localStorage.setItem('bojro_model_visibility', JSON.stringify(config));
    applyModelVisibility(config);
    // Keep the Analyzer's "Use In" buttons in sync if tab visibility changes.
    if (typeof renderUseInButtons === 'function') renderUseInButtons();
}

function applyModelVisibility(config) {
    const btnXl = document.getElementById('btn-xl');
    const btnFlux = document.getElementById('btn-flux');
    const btnQwen = document.getElementById('btn-qwen');
    const btnAnima = document.getElementById('btn-anima');
    const btnKrea = document.getElementById('btn-krea');
    const dockComfy = document.getElementById('dock-comfy'); 

    if (btnXl) config.xl ? btnXl.classList.remove('hidden') : btnXl.classList.add('hidden');
    if (btnFlux) config.flux ? btnFlux.classList.remove('hidden') : btnFlux.classList.add('hidden');
    if (btnQwen) config.qwen ? btnQwen.classList.remove('hidden') : btnQwen.classList.add('hidden');
    if (btnAnima) config.anima ? btnAnima.classList.remove('hidden') : btnAnima.classList.add('hidden');
    if (btnKrea) config.krea ? btnKrea.classList.remove('hidden') : btnKrea.classList.add('hidden');
    
    if (dockComfy) config.comfy ? dockComfy.classList.remove('hidden') : dockComfy.classList.add('hidden');

    if (typeof updateModeSwitcherDensity === 'function') updateModeSwitcherDensity();
}

// Only tightens padding when all tabs are visible; text size is unchanged.
function updateModeSwitcherDensity() {
    const switcher = document.getElementById('modeSwitcher');
    if (!switcher) return;
    const visibleCount = Array.from(switcher.children).filter(el => !el.classList.contains('hidden')).length;
    switcher.classList.toggle('compact', visibleCount >= 5);
}

window.toggleCloudflareUI = function() {
    const isOn = document.getElementById('cfgCloudflareSwitch').checked;
    const cont = document.getElementById('container-cloudflare');
    if (cont) {
        if(isOn) cont.classList.remove('hidden');
        else cont.classList.add('hidden');
    }
}
window.toggleProgressBridge = async function() {
    const isChecked = document.getElementById('cfgProgressBridgeSwitch').checked;
    if (isChecked) {
        const confirmed = await window.appConfirm(
            "Enable real ADetailer/upscale progress? Requires the forge-neo-progress-bridge extension installed on your Forge Neo server.",
            { title: 'Progress Bridge', okText: 'ENABLE', link: { text: 'forge-neo-progress-bridge', url: 'https://github.com/Bungles/forge-neo-progress-bridge' } }
        );
        if (confirmed) {
            localStorage.setItem('bojroProgressBridgeEnabled', 'true');
        } else {
            document.getElementById('cfgProgressBridgeSwitch').checked = false;
        }
    } else {
        localStorage.setItem('bojroProgressBridgeEnabled', 'false');
    }
}
window.toggleSaac = async function() {
    const isChecked = document.getElementById('cfgSaacSwitch').checked;

    if (isChecked) {
        const hasDb = window.SaacManager ? await window.SaacManager.hasCachedDb() : false;
        const message = hasDb
            ? "Enable Character Select?"
            : "Enable Character Selector for WAI-IL Models? (This will download approx 125MB of data on first use and will show all available characters for v16+ models.)";

        const confirmed = await window.appConfirm(message, { title: 'Character Select', okText: 'ENABLE' });
        if (confirmed) {
            localStorage.setItem('bojroSaacEnabled', 'true');
            document.getElementById('btn-saac-trigger')?.classList.remove('hidden');
            if(window.SaacManager) window.SaacManager.init(); 
        } else {
            // If they cancel, turn the switch back off
            document.getElementById('cfgSaacSwitch').checked = false;
        }
    } else {
        localStorage.setItem('bojroSaacEnabled', 'false');
        document.getElementById('btn-saac-trigger')?.classList.add('hidden');
    }
}

// Off by default. No confirmation needed: just a visibility toggle for fields that default to no effect.
window.toggleUpscaleExpFeatures = function() {
    const isChecked = document.getElementById('cfgUpscaleExpSwitch').checked;
    localStorage.setItem('bojroUpscaleExpEnabled', isChecked ? 'true' : 'false');
    document.getElementById('upscaleExpFields')?.classList.toggle('hidden', !isChecked);

    // On disable, reset the underlying values to their defaults as well as hiding the fields, since runUpscaleJob() reads them regardless of visibility.
    if (!isChecked) {
        const gfpgan = document.getElementById('upscale_gfpgan_visibility');
        const cfVisibility = document.getElementById('upscale_codeformer_visibility');
        const cfWeight = document.getElementById('upscale_codeformer_weight');
        if (gfpgan) gfpgan.value = 0;
        if (cfVisibility) cfVisibility.value = 0;
        if (cfWeight) cfWeight.value = 0;
    }
}

// Visibility only; disabling does not reset Never OOM's settings.
window.toggleNeverOomVisibility = function() {
    const isChecked = document.getElementById('cfgNeverOomSwitch').checked;
    localStorage.setItem('bojroNeverOomVisible', isChecked ? 'true' : 'false');
    document.querySelectorAll('.neveroom-box').forEach(el => el.classList.toggle('hidden', !isChecked));
}

// Inverted: unchecked (default) means Dev Power is visible; checking "Hide Dev Power" hides it.
window.toggleDevPowerVisibility = function() {
    const isChecked = document.getElementById('cfgHideDevPowerSwitch').checked;
    localStorage.setItem('bojroHideDevPower', isChecked ? 'true' : 'false');
    document.getElementById('devPowerSection')?.classList.toggle('hidden', isChecked);
}

// Hides Flux's GGUF hint and Qwen's Z-Image Turbo hint and special GENERATE labels for setups they don't match (Nunchaku/SVDQuant, Qwen-Image-Lightning, etc). Off by default.
window.toggleModelHintsVisibility = function() {
    const isChecked = document.getElementById('cfgHideModelHintsSwitch').checked;
    localStorage.setItem('bojroHideModelHints', isChecked ? 'true' : 'false');
    document.querySelectorAll('.model-hint').forEach(el => el.classList.toggle('hidden', isChecked));
    if (typeof updateGenerateButtonLabel === 'function') updateGenerateButtonLabel();
}

// Hide Loading Circle: hides the spinner above the results of the main tabs and the Inpaint/img2img/Upscale tab while a job runs. Off by default. Applied as a body class (see style.css) so the generation logic is untouched; takes effect immediately.
function applyGenSpinnerHidden(hidden) {
    document.body.classList.toggle('hide-gen-spinner', hidden);
}
// Show & Download Batch Grids (see batchGridsEnabled(), utils.js). Off by default; applies to jobs built after it is switched, since each job is stamped with the grid plan.
window.toggleBatchGrids = function() {
    const isChecked = document.getElementById('cfgShowBatchGridsSwitch').checked;
    localStorage.setItem('bojroShowBatchGrids', isChecked ? 'true' : 'false');
    // The size-limit row appears only with grids on (its setting is kept; see batchGridLimitEnabled(), utils.js).
    document.getElementById('batchGridLimitRow')?.classList.toggle('hidden', !isChecked);
}
window.togglePromptFormat = function() {
    const isChecked = document.getElementById('cfgPromptFormatSwitch').checked;
    localStorage.setItem('bojroPromptFormat', isChecked ? 'true' : 'false');
    document.getElementById('promptFormatBlurRow')?.classList.toggle('hidden', !isChecked);
}
// Limit Batch Grid to 1024px (see batchGridMaxEdge(), utils.js): caps the long edge at 1024px instead of 2048px.
window.toggleBatchGridLimit = function() {
    const isChecked = document.getElementById('cfgLimitBatchGridSwitch').checked;
    localStorage.setItem('bojroLimitBatchGrid', isChecked ? 'true' : 'false');
}
window.toggleUpdateNotices = function() {
    const isOn = document.getElementById('cfgUpdateNoticesSwitch').checked;
    localStorage.setItem('bojroUpdateNoticesOff', isOn ? 'false' : 'true');
}
function applyLowBitsRowsVisible(show) {
    ['lowbitsgenRow', 'lowbitsinpRow'].forEach(id => document.getElementById(id)?.classList.toggle('hidden', !show));
}
window.toggleLowBitsRows = function() {
    const isOn = document.getElementById('cfgShowLowBitsSwitch').checked;
    localStorage.setItem('bojroShowLowBitsRows', isOn ? 'true' : 'false');
    applyLowBitsRowsVisible(isOn);
}
window.toggleFloatingBrushBar = function() {
    const isOn = document.getElementById('cfgFloatingBrushSwitch').checked;
    localStorage.setItem('bojroFloatingBrushSize', isOn ? 'true' : 'false');
    if (typeof updateFloatingBrushBar === 'function') updateFloatingBrushBar();
}
// Gallery Badges switch (stored as the OFF state).
window.toggleGalleryBadges = function() {
    const isOn = document.getElementById('cfgGalleryBadgesSwitch').checked;
    localStorage.setItem('bojroGalleryBadgesOff', isOn ? 'false' : 'true');
    document.body.classList.toggle('hide-gallery-badges', !isOn);
}
window.toggleGenSpinnerHidden = function() {
    const isChecked = document.getElementById('cfgHideGenSpinnerSwitch').checked;
    localStorage.setItem('bojroHideGenSpinner', isChecked ? 'true' : 'false');
    applyGenSpinnerHidden(isChecked);
}

// Show ADetailer/ControlNet, split into SDXL/Anima and Other. Hiding a group also turns the feature off for its modes (.feature-hidden, see style.css); each toggle's auto-disable loop covers only its own modes.
window.toggleAdetailerSectionVisibilitySdxlAnima = function() {
    const isChecked = document.getElementById('cfgShowAdetailerSdxlAnimaSwitch').checked;
    localStorage.setItem('bojroShowAdetailerSdxlAnima', isChecked ? 'true' : 'false');
    document.querySelectorAll('.adetailer-section-sdxl-anima').forEach(el => el.classList.toggle('feature-hidden', !isChecked));
    if (!isChecked) {
        ['xl', 'anima'].forEach(mode => {
            const masterEl = document.getElementById(`${mode}_adetailer_master`);
            if (masterEl && masterEl.checked && typeof toggleAdetailerMaster === 'function') {
                toggleAdetailerMaster(mode, false);
                masterEl.checked = false;
            }
        });
    }
    if (typeof updateExtraAdetailerPassesToggleState === 'function') updateExtraAdetailerPassesToggleState();
}

window.toggleAdetailerSectionVisibilityOther = function() {
    const isChecked = document.getElementById('cfgShowAdetailerOtherSwitch').checked;
    localStorage.setItem('bojroShowAdetailerOther', isChecked ? 'true' : 'false');
    document.querySelectorAll('.adetailer-section-other').forEach(el => el.classList.toggle('feature-hidden', !isChecked));
    if (!isChecked) {
        ['flux', 'qwen', 'krea', 'inp', 'img2img'].forEach(mode => {
            const masterEl = document.getElementById(`${mode}_adetailer_master`);
            if (masterEl && masterEl.checked && typeof toggleAdetailerMaster === 'function') {
                toggleAdetailerMaster(mode, false);
                masterEl.checked = false;
            }
        });
    }
    if (typeof updateExtraAdetailerPassesToggleState === 'function') updateExtraAdetailerPassesToggleState();
}

// Disabled unless at least one of the two switches above is on; force-unchecked (extra passes hidden) when both turn off. Also shows or hides the ADetailer Model Toast Text row, which has the same dependency.
window.updateExtraAdetailerPassesToggleState = function() {
    const sw = document.getElementById('cfgShowExtraAdetailerPassesSwitch');
    const sdxlAnimaOn = document.getElementById('cfgShowAdetailerSdxlAnimaSwitch')?.checked;
    const otherOn = document.getElementById('cfgShowAdetailerOtherSwitch')?.checked;
    const anyAdetailerVisible = sdxlAnimaOn || otherOn;
    if (sw) {
        sw.disabled = !anyAdetailerVisible;
        if (!anyAdetailerVisible && sw.checked) {
            sw.checked = false;
            if (typeof toggleExtraAdetailerPasses === 'function') toggleExtraAdetailerPasses();
        }
    }
    const labelsRow = document.getElementById('adetailerLabelsRow');
    if (labelsRow) labelsRow.classList.toggle('hidden', !anyAdetailerVisible);
    // ControlNet [ADetailer] shows only when ADetailer is visible somewhere, like the Toast Text row above.
    const cnRow = document.getElementById('adetailerControlNetRow');
    if (cnRow) cnRow.classList.toggle('hidden', !anyAdetailerVisible);
}

// Turning this off resets every pass's ControlNet model to "None" (the model field is the on/off switch) and persists it, so no hidden pass keeps sending a ControlNet override.
window.toggleAdetailerControlNet = function() {
    const isChecked = document.getElementById('cfgAdetailerControlNetSwitch').checked;
    localStorage.setItem('bojroAdetailerControlNet', isChecked ? 'true' : 'false');
    document.querySelectorAll('.adetailer-cn-section').forEach(el => el.classList.toggle('feature-hidden', !isChecked));
    if (!isChecked) {
        ['xl', 'img2img', 'inp', 'qwen', 'flux', 'anima', 'krea'].forEach(mode => {
            for (let n = 1; n <= 8; n++) {
                const modelEl = document.getElementById(`${mode}_adetailer_${n}_cn_model`);
                if (modelEl && modelEl.value !== 'None') {
                    modelEl.value = 'None';
                    if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText(`${mode}_adetailer_${n}_cn_model`);
                    if (typeof saveAdetailer === 'function') saveAdetailer(mode);
                }
            }
        });
    }
}

// User-editable model-filename to singular/plural toast wording, read by guessAdetailerLabel() (engine.js) before its built-in guesses. Stored as an array so row order is kept.
function getCustomAdetailerLabels() {
    try {
        const raw = localStorage.getItem('bojroCustomAdetailerLabels');
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
}
function setCustomAdetailerLabels(arr) {
    localStorage.setItem('bojroCustomAdetailerLabels', JSON.stringify(arr));
}

window.openAdetailerLabelsModal = function() {
    renderAdetailerLabelsList();
    document.getElementById('adetailerLabelsModal').classList.remove('hidden');
}
window.closeAdetailerLabelsModal = function() {
    document.getElementById('adetailerLabelsModal').classList.add('hidden');
}

// Reuses the installed-model list fetchAdetailerModels() (network.js) put on the detection-model selects.
function getInstalledAdetailerModelNames() {
    const source = document.getElementById('xl_adetailer_1_model');
    if (!source) return [];
    return Array.from(source.options).map(o => o.value).filter(Boolean);
}

function renderAdetailerLabelsList() {
    const list = document.getElementById('adetailerLabelsList');
    if (!list) return;
    const entries = getCustomAdetailerLabels();
    const installedModels = getInstalledAdetailerModelNames();
    list.innerHTML = '';
    entries.forEach((entry, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; flex-direction:column; gap:6px; padding:10px; border:1px solid var(--border-color); border-radius:8px;';
        // A saved value missing from the installed list is kept as its own option so opening this never changes it.
        const options = [...installedModels];
        if (entry.match && !options.includes(entry.match)) options.unshift(entry.match);
        // No placeholder option: the styled picker would list it as a real choice.
        const optionsHtml = options.map(m => `<option value="${escapeHtmlAttr(m)}"${m === entry.match ? ' selected' : ''}>${escapeHtml(m)}</option>`).join('');
        // A hidden <select> plus a styled trigger button (data-kind="detection-model"), as the Detection Model select. Each row's select id embeds the row index so its trigger's data-target is right; ids are recreated on every re-render.
        const selectId = `adetailerLabelMatch_${i}`;
        row.innerHTML = `
            <div class="row" style="gap:6px; align-items:center;">
                <select id="${selectId}" style="flex:1;" onchange="updateAdetailerLabelField(${i}, 'match', this.value)">${optionsHtml}</select>
                <button type="button" class="model-picker-trigger hidden" data-target="${selectId}" data-kind="detection-model" data-modal-title="Select Detection Model" onclick="openModelPicker(this)">
                    <span class="model-picker-trigger-primary"></span>
                    <span class="model-picker-trigger-subtitle hidden"></span>
                </button>
                <button class="btn-icon" style="width:28px; height:28px; padding:4px; color:#f44336;" title="Remove" onclick="removeAdetailerLabelRow(${i})"><i data-lucide="trash-2" width="16" height="16"></i></button>
            </div>
            <div class="row" style="gap:6px;">
                <input type="text" placeholder="Singular" value="${escapeHtmlAttr(entry.singular || '')}" style="flex:1;" oninput="updateAdetailerLabelField(${i}, 'singular', this.value)">
                <input type="text" placeholder="Plural" value="${escapeHtmlAttr(entry.plural || '')}" style="flex:1;" oninput="updateAdetailerLabelField(${i}, 'plural', this.value)">
            </div>
        `;
        list.appendChild(row);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
    // Re-runs initModelPickers() (safe to repeat) for the triggers just created.
    if (typeof initModelPickers === 'function') initModelPickers();
}

window.addAdetailerLabelRow = function() {
    const entries = getCustomAdetailerLabels();
    entries.push({ match: '', singular: '', plural: '' });
    setCustomAdetailerLabels(entries);
    renderAdetailerLabelsList();
}

window.removeAdetailerLabelRow = function(index) {
    const entries = getCustomAdetailerLabels();
    entries.splice(index, 1);
    setCustomAdetailerLabels(entries);
    renderAdetailerLabelsList();
}

// Updates one field of one row in place; a full re-render would drop focus mid-keystroke.
window.updateAdetailerLabelField = function(index, field, value) {
    const entries = getCustomAdetailerLabels();
    if (!entries[index]) return;
    entries[index][field] = value;
    setCustomAdetailerLabels(entries);
}

// Passes 5-8: a second row of chips, hidden by default and toggled with this switch for all modes. Only the chip row is touched here; selectAdetailerPass() handles each pass's fields. Turning it off resets every mode to pass 1 so an extra pass isn't left selected and hidden.
window.toggleExtraAdetailerPasses = function() {
    const isChecked = document.getElementById('cfgShowExtraAdetailerPassesSwitch').checked;
    localStorage.setItem('bojroShowExtraAdetailerPasses', isChecked ? 'true' : 'false');
    if (!isChecked && typeof selectAdetailerPass === 'function') {
        ['xl', 'flux', 'qwen', 'anima', 'krea', 'inp', 'img2img'].forEach(mode => selectAdetailerPass(mode, 1));
    }
    document.querySelectorAll('.ad-pass-row-extra').forEach(el => el.classList.toggle('hidden', !isChecked));
    if (isChecked) warnAdetailerMaxTabs();
}

// Forge passes ADetailer-Neo at most Max Tabs + 1 passes; no popup if all 8 already run.
async function warnAdetailerMaxTabs() {
    let tabs = null;
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(`${HOST}/sdapi/v1/options`, { headers: getHeaders(), signal: ctrl.signal });
        clearTimeout(t);
        tabs = Number((await res.json())?.ad_max_models) || null;
    } catch (e) { }
    if (tabs && tabs + 1 >= 8) return;
    const runs = tabs ? `Forge is set to run ${tabs + 1}` : 'By default, Forge runs 5';
    window.appAlert(`${runs} ADetailer passes. To use all 8, set Settings > ADetailer > Max Tabs to 8 in Forge, then reload the UI.`, { title: 'Extra ADetailer Passes' });
}


// Config > Interface > Show Upload History: off hides that RECENT, stops it saving and, once confirmed, clears it.
window.toggleUploadHistory = async function(key, on, el) {
    const history = key === 'bojroAnalyzerHistory' ? window.AnalyzerHistory : window.EditHistory;
    if (!on && history && (await history.list()).length) {
        const ok = await window.appConfirm(`${key === 'bojroAnalyzerHistory' ? 'Analyze' : 'Inpaint'} history will be cleared.`,
            { title: 'Show Upload History', okText: 'TURN OFF', cancelText: 'CANCEL', danger: true });
        if (!ok) { if (el) el.checked = true; return; }
        await history.clear();
    }
    localStorage.setItem(key, on ? 'true' : 'false');
    if (window.AnalyzerHistory) AnalyzerHistory.applyVisibility();
    if (window.EditHistory) EditHistory.applyVisibility();
}

// Config > Interface > Analyzer Sticky Bar. Applies immediately; an open panel closes when switched off.
window.toggleAnalyzerStickyBar = function() {
    const isChecked = document.getElementById('cfgAnalyzerStickyBarSwitch').checked;
    localStorage.setItem('bojroAnalyzerStickyBar', isChecked ? 'true' : 'false');
    if (typeof updateAnalyzerStickyBar === 'function') updateAnalyzerStickyBar();
}

window.toggleControlnetSectionVisibilitySdxlAnima = function() {
    const isChecked = document.getElementById('cfgShowControlnetSdxlAnimaSwitch').checked;
    localStorage.setItem('bojroShowControlnetSdxlAnima', isChecked ? 'true' : 'false');
    document.querySelectorAll('.controlnet-section-sdxl-anima').forEach(el => el.classList.toggle('feature-hidden', !isChecked));
    if (typeof updateFsControlNetButtons === 'function') updateFsControlNetButtons();
    if (!isChecked) {
        ['xl', 'anima'].forEach(mode => {
            const masterEl = document.getElementById(`${mode}_cn_master`);
            if (masterEl && masterEl.checked && typeof toggleControlNetMaster === 'function') {
                toggleControlNetMaster(mode, false);
                masterEl.checked = false;
            }
        });
    }
}

window.toggleControlnetSectionVisibilityOther = function() {
    const isChecked = document.getElementById('cfgShowControlnetOtherSwitch').checked;
    localStorage.setItem('bojroShowControlnetOther', isChecked ? 'true' : 'false');
    document.querySelectorAll('.controlnet-section-other').forEach(el => el.classList.toggle('feature-hidden', !isChecked));
    if (typeof updateFsControlNetButtons === 'function') updateFsControlNetButtons();
    if (!isChecked) {
        ['flux', 'qwen', 'krea', 'inp', 'img2img'].forEach(mode => {
            const masterEl = document.getElementById(`${mode}_cn_master`);
            if (masterEl && masterEl.checked && typeof toggleControlNetMaster === 'function') {
                toggleControlNetMaster(mode, false);
                masterEl.checked = false;
            }
        });
    }
}

// Standard "Show X" pattern: off by default.
window.toggleFluxCacheVisibility = function() {
    const isChecked = document.getElementById('cfgFluxCacheSwitch').checked;
    localStorage.setItem('bojroShowFluxCache', isChecked ? 'true' : 'false');
    document.getElementById('fluxCacheSection')?.classList.toggle('hidden', !isChecked);
}

// Show Live Preview Toggle: gates the livePreviewCheck row (Generate tab) and the Live Preview rows indented below it (.lp-option-row). Turning it off also switches live preview off (toggleLivePreview(), which stops fetching).
// Allow Live Preview On Mobile Data is deliberately not gated on livePreviewCheck, which is set on another screen; it is a standing preference.
window.toggleLivePreviewButtonVisibility = function() {
    const isChecked = document.getElementById('cfgShowLivePreviewSwitch').checked;
    localStorage.setItem('bojroShowLivePreviewToggle', isChecked ? 'true' : 'false');
    // reorganizeGenRowLayout() (utils.js) owns showing and positioning livePreviewToggleRow.
    if (typeof reorganizeGenRowLayout === 'function') reorganizeGenRowLayout();
    if (typeof updateInpPreviewToggleVisibility === 'function') updateInpPreviewToggleVisibility();
    document.querySelectorAll('.lp-option-row').forEach(r => r.classList.toggle('hidden', !isChecked));
    if (!isChecked) {
        // Switching the feature off also clears the remembered live preview choice (see toggleLivePreview(), utils.js).
        localStorage.setItem('bojroLivePreviewOn', 'false');
        const mainToggle = document.getElementById('livePreviewCheck');
        if (mainToggle && mainToggle.checked) {
            mainToggle.checked = false;
            if (typeof toggleLivePreview === 'function') toggleLivePreview();
        }
    }
}

window.saveLivePreviewMobileDataAllowed = function() {
    const isChecked = document.getElementById('cfgLivePreviewMobileDataSwitch').checked;
    localStorage.setItem('bojroLivePreviewMobileDataAllowed', isChecked ? 'true' : 'false');
    if (typeof refreshLivePreviewToggleInteractivity === 'function') refreshLivePreviewToggleInteractivity();
}

// Hide From Accessibility Services (off by default). The native side keeps its own copy, applied at launch.
;(function () {
    const KEY = 'bojroHideFromAccessibility';
    const send = hide => { try { window.Capacitor?.Plugins?.ResolverDevice?.setHideFromAccessibility?.({ hide }); } catch (e) { } };
    window.toggleHideFromAccessibility = function () {
        const hide = document.getElementById('cfgHideA11ySwitch').checked;
        localStorage.setItem(KEY, hide ? 'true' : 'false');
        send(hide);
    };
    const hide = localStorage.getItem(KEY) === 'true';
    const sw = document.getElementById('cfgHideA11ySwitch');
    if (sw) sw.checked = hide;
    // Keeps the native copy in step, e.g. after Restore Settings.
    send(hide);
})();

// Live Update progress notification (Android 16+, off by default); the service reads the native copy.
;(function () {
    const KEY = 'bojroLiveUpdate';
    const FILTER_PATH = 'Settings › Notifications › Sort and filter notifications (older One UI: Advanced settings › Filter notifications)';
    const device = () => window.Capacitor?.Plugins?.ResolverDevice;
    let isSamsung = false;

    async function sendToNative(on) {
        try { await device()?.setLiveUpdate({ enabled: on }); } catch (e) { }
    }
    async function openSettings() {
        try { await device().openNotificationSettings(); } catch (e) { }
    }

    window.toggleLiveUpdate = async function () {
        const on = document.getElementById('cfgLiveUpdateSwitch').checked;
        localStorage.setItem(KEY, on ? 'true' : 'false');
        sendToNative(on);
        if (!isSamsung) return;
        const message = on
            ? `On Samsung phones, the Live Update also leaves an empty "1 more notification" entry, and clearing either clears both.\n\nTo stop this, go to ${FILTER_PATH} and turn off Background activities.`
            : `If you turned off Background activities for Live Updates, you can turn it back on in ${FILTER_PATH}.`;
        if (await window.appConfirm(message, { title: 'Live Update Notification', okText: 'OPEN SETTINGS', cancelText: 'NOT NOW' })) openSettings();
    };

    (async function init() {
        const on = localStorage.getItem(KEY) === 'true';
        const sw = document.getElementById('cfgLiveUpdateSwitch');
        if (sw) sw.checked = on;
        if (!device()) return;
        try {
            const info = await device().getDeviceInfo();
            isSamsung = /samsung/i.test(info.manufacturer || '');
            if (info.sdk >= 36) document.getElementById('cfgLiveUpdateRow')?.classList.remove('hidden');
        } catch (e) { return; }
        // Keeps the native copy in step, e.g. after Reset App Configuration.
        sendToNative(on);
    })();
})();
