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

    // LoRA variant thumbnails, read into memory once the app is idle (loravariants.js).
    if (window.LoraVariants) window.LoraVariants.preload();

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

    // Show Magic Prompt (on by default; stored as the hidden state).
    const hideMagicPrompt = localStorage.getItem('bojroHideMagicPrompt') === 'true';
    const showMagicPromptSwitch = document.getElementById('cfgShowMagicPromptSwitch');
    if (showMagicPromptSwitch) showMagicPromptSwitch.checked = !hideMagicPrompt;
    document.body.classList.toggle('hide-magic-prompt', hideMagicPrompt);

    // Show model hints (on by default; stored as the hidden state).
    const hideModelHints = localStorage.getItem('bojroHideModelHints') === 'true';
    const showModelHintsSwitch = document.getElementById('cfgShowModelHintsSwitch');
    if (showModelHintsSwitch) showModelHintsSwitch.checked = !hideModelHints;
    // Show UI hints (the model lines among them); the old Show model hints setting now names the GENERATE buttons only.
    const hideUiHints = localStorage.getItem('bojroHideUiHints') === 'true';
    const uiHintsSwitch = document.getElementById('cfgShowUiHintsSwitch');
    if (uiHintsSwitch) uiHintsSwitch.checked = !hideUiHints;
    document.body.classList.toggle('no-ui-hints', hideUiHints);
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

    const promptHistorySwitch = document.getElementById('cfgPromptHistorySwitch');
    if (promptHistorySwitch) promptHistorySwitch.checked = localStorage.getItem('bojroPromptHistory') !== 'false';

    const confirmVramSwitch = document.getElementById('cfgConfirmClearVramSwitch');
    if (confirmVramSwitch) confirmVramSwitch.checked = localStorage.getItem('bojroConfirmClearVram') !== 'false';

    // Floating Brush Size (on by default).
    const floatingBrushSwitch = document.getElementById('cfgFloatingBrushSwitch');
    if (floatingBrushSwitch) floatingBrushSwitch.checked = localStorage.getItem('bojroFloatingBrushSize') !== 'false';

    // Show loading circle (on by default; stored as the hidden state).
    const hideGenSpinner = localStorage.getItem('bojroHideGenSpinner') === 'true';
    const showGenSpinnerSwitch = document.getElementById('cfgShowGenSpinnerSwitch');
    if (showGenSpinnerSwitch) showGenSpinnerSwitch.checked = !hideGenSpinner;
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
    // History Images Per Page (globals.js).
    const galleryPerPageEl = document.getElementById('cfgGalleryPerPage');
    if (galleryPerPageEl && typeof galleryPerPageSetting === 'function') galleryPerPageEl.value = galleryPerPageSetting();

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

    // Recent Uploads: one switch for both RECENT histories (analyzerhistory.js); on if either key is.
    const uploadsOn = localStorage.getItem('bojroAnalyzerHistory') !== 'false' || localStorage.getItem('bojroEditHistory') !== 'false';
    ['bojroAnalyzerHistory', 'bojroEditHistory'].forEach(k => { if (localStorage.getItem(k) !== null) localStorage.setItem(k, uploadsOn ? 'true' : 'false'); });
    const uploadHistorySwitch = document.getElementById('cfgUploadHistorySwitch');
    if (uploadHistorySwitch) uploadHistorySwitch.checked = uploadsOn;
    if (window.AnalyzerHistory) AnalyzerHistory.applyVisibility();
    if (window.EditHistory) EditHistory.applyVisibility();

    // Analyzer Sticky Bar: on unless switched off (analyzer.js).
    const analyzerStickyBarSwitch = document.getElementById('cfgAnalyzerStickyBarSwitch');
    if (analyzerStickyBarSwitch) analyzerStickyBarSwitch.checked = localStorage.getItem('bojroAnalyzerStickyBar') !== 'false';

    const showControlnetOther = localStorage.getItem('bojroShowControlnetOther') === 'true';
    const showControlnetOtherSwitch = document.getElementById('cfgShowControlnetOtherSwitch');
    if (showControlnetOtherSwitch) showControlnetOtherSwitch.checked = showControlnetOther;
    document.querySelectorAll('.controlnet-section-other').forEach(el => el.classList.toggle('feature-hidden', !showControlnetOther));
    if (typeof updateFsControlNetButtons === 'function') updateFsControlNetButtons();

    // Checkpoint Manager count beside MANAGE.
    if (typeof updateCheckpointManagerCount === 'function') updateCheckpointManagerCount();

    // Show Dev Power (on by default; stored as the hidden state).
    const hideDevPower = localStorage.getItem('bojroHideDevPower') === 'true';
    const showDevPowerSwitch = document.getElementById('cfgShowDevPowerSwitch');
    if (showDevPowerSwitch) showDevPowerSwitch.checked = !hideDevPower;
    document.getElementById('devPowerSection')?.classList.toggle('hidden', hideDevPower);

    const showFluxCache = localStorage.getItem('bojroShowFluxCache') === 'true';
    const fluxCacheSwitch = document.getElementById('cfgFluxCacheSwitch');
    if (fluxCacheSwitch) fluxCacheSwitch.checked = showFluxCache;
    document.getElementById('fluxCacheSection')?.classList.toggle('hidden', !showFluxCache);

    // Unused keys.
    localStorage.removeItem('bojroShowLivePreviewToggle');
    localStorage.removeItem('bojroCfgOneSection');
    window.syncLpMobileMethodRow?.();

    // A standing preference, not tied to the Preview switch.
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


    document.getElementById('container-local').classList.toggle('hidden', isRemote);
    document.getElementById('container-external').classList.toggle('hidden', !isRemote);
    document.getElementById('connModeLocal')?.classList.toggle('active', !isRemote);
    document.getElementById('connModeRemote')?.classList.toggle('active', isRemote);
}
// Connection mode's LOCAL / REMOTE buttons set the (hidden) cfgModeSwitch.
window.setConnectionMode = function(remote) {
    const el = document.getElementById('cfgModeSwitch');
    if (!el || el.checked === remote) return;
    el.checked = remote;
    el.dispatchEvent(new Event('change'));
};

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
        if (!btn) return;
        btn.classList.remove('connecting', 'connected', 'disconnected');
        // The engine button's icons: zap once connected, zap-off otherwise.
        const label = (icon, text) => `<i data-lucide="${icon}" width="16" height="16"></i>${text}`;
        if (status === 'connecting') {
            btn.classList.add('connecting');
            btn.innerHTML = label('zap-off', 'LINKING...');
        } else if (status === 'connected') {
            btn.classList.add('connected');
            btn.innerHTML = label('zap', 'CONNECTED');
        } else {
            btn.classList.add('disconnected');
            btn.innerHTML = label('zap-off', 'LINK');
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
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
    'bojroTheme', 'bojroResultStripLimit', 'bojroAnalyzerHistory', 'bojroEditHistory',
    'bojroFloatingBrushSize', 'bojroHideModelHints', 'bojroHideUiHints', 'bojroHideMagicPrompt', 'bojroHideGenSpinner', 'bojroGalleryBadgesOff', 'bojroGalleryBadgeOff', 'bojroHideDevPower',
    'bojro_model_visibility', 'bojroTallPrompt', 'bojroTallNeg', 'bojroAutoGrowPrompt', 'bojroGalleryPerPage', 'bojroGalDates', 'bojroGalDatesBy', 'bojroWildcardsOn',
    'bojroPromptColors', 'bojroGalleryCols', 'bojroGalleryWide', 'bojroAdChipNames',
    // Generation
    'bojroAutoDeleteWarning', 'bojroAutoSave', 'bojroGenerationPollingRate', 'bojroBackgroundPollingRate',
    'bojroKeepSourceSeed', 'bojroProgressBridgeEnabled', 'bojroShowBatchGrids', 'bojroLimitBatchGrid',
    'bojroLivePreviewMobileDataAllowed', 'bojroLpMethod', 'bojroLpMethodMobile', 'bojroLpEveryN', 'bojroLpBorder',
    'bojroVramProfile', 'bojroConfirmClearVram', 'bojroDockStyle',
    // Models
    'bojroShowAdetailer', 'bojroShowAdetailerOther', 'bojroShowAdetailerSdxlAnima', 'bojroAdetailerControlNet',
    'bojroShowControlnet', 'bojroShowControlnetOther', 'bojroShowControlnetSdxlAnima', 'bojroShowExtraAdetailerPasses',
    'bojroShowLowBitsRows', 'bojroShowFluxCache', 'bojroForgeCouple', 'bojroNeverOomVisible', 'bojro_upscaler2_visibility',
    // Experimental
    'bojroUpscaleExpEnabled', 'bojroPromptFormat', 'bojroPromptFormatOnBlur', 'bojroSaacEnabled',
    'bojroAbortJobOnClose', 'bojroDataUsageTracker', 'bojroDataUsagePill', 'bojroDebugLogEnabled',
    'bojroHideFromAccessibility', 'bojroLiveUpdate', 'bojroNotificationIcon',
    // View, and prompts shown once (battery optimisation, update notices, a skipped update)
    'bojroLoraViewMode', 'bojroStyleSearchPrompts', 'bojroAnalyzerStickyBar', 'bojroBatteryOpt', 'bojroUpdateNoticesOff', 'bojro_skip_version',
    'bojroMpPrompt', 'bojroMpDescribe', 'bojroMpWcGen', 'bojroMpScene', 'bojroSceneOn', 'bojroSceneModel', 'bojroSceneUnload',
    'bojroSceneRecolor', 'bojroSceneRecolorBg', 'bojroSceneDrop', 'bojroSceneNeg',
];
// Which Config and tab sections are open.
const RESET_PREFIXES = ['bojro_vis_', 'bojro_collapse_'];

function isResetKey(key) {
    return RESET_KEYS.includes(key) || RESET_PREFIXES.some(p => key.startsWith(p));
}

window.resetAppConfig = async function() {
    if (!await window.appConfirm('Every option in Config goes back to its default. Your server connections, prompts, gallery, styles, LoRAs, presets and other saved content are kept, and the example wildcards are put back.', { title: 'Reset App Configuration', okText: 'RESET', danger: true })) return;
    // Keys are collected first, as removing while iterating skips entries.
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (isResetKey(key)) keys.push(key);
    }
    keys.forEach(key => localStorage.removeItem(key));
    if (window.Wildcards) Wildcards.restoreDefaults();
    // The page reads everything afresh; settings Android keeps its own copy of are sent again at launch.
    try { sessionStorage.setItem('bojroReturnTo', 'button[onclick="resetAppConfig()"]'); } catch (e) {}
    if (typeof paintNativeBg === 'function') paintNativeBg();
    window.location.reload();
};

// Double Prompt Box Height / Double Negative Box Height (Config > Prompts): each tab's prompt and negative boxes are
// 3 rows tall, or 6 with the option on.
const PROMPT_BOX_MODES = ['xl', 'flux', 'qwen', 'anima', 'krea', 'inp'];
// The Style and LoRA editors' and ADetailer's boxes follow the same options (trigger words count as prompt).
const EDITOR_PROMPT_BOXES = ['styleEditPrompt', 'cfgTrigger', 'lvTrigger', 'img2imgPresetEdPrompt'];
const EDITOR_NEG_BOXES = ['styleEditNeg', 'cfgLoraAdditionalNegative', 'lvNegative', 'img2imgPresetEdNeg'];
function applyPromptBoxHeights() {
    const tall = key => localStorage.getItem(key) === 'true';
    const setRows = (id, key) => { const el = document.getElementById(id); if (el) el.rows = tall(key) ? 6 : 3; };
    PROMPT_BOX_MODES.forEach(m => {
        setRows(`${m}_prompt`, 'bojroTallPrompt');
        setRows(`${m}_neg`, 'bojroTallNeg');
    });
    EDITOR_PROMPT_BOXES.forEach(id => setRows(id, 'bojroTallPrompt'));
    EDITOR_NEG_BOXES.forEach(id => setRows(id, 'bojroTallNeg'));
    document.querySelectorAll('textarea.fc-text, #styleFcBg, textarea[id^="styleFcR"]').forEach(el => { el.rows = tall('bojroTallPrompt') ? 4 : 2; });
    document.querySelectorAll('textarea[id*="_adetailer_"][id$="_prompt"]').forEach(el => setRows(el.id, 'bojroTallPrompt'));
    document.querySelectorAll('textarea[id*="_adetailer_"][id$="_neg"]').forEach(el => setRows(el.id, 'bojroTallNeg'));
    if (typeof refitPromptBoxes === 'function' && typeof autoGrowOn !== 'undefined') refitPromptBoxes();
    const ps = document.getElementById('cfgTallPromptSwitch'), ns = document.getElementById('cfgTallNegSwitch');
    if (ps) ps.checked = tall('bojroTallPrompt');
    if (ns) ns.checked = tall('bojroTallNeg');
}
// Auto-Expand Prompt Boxes: prompt boxes grow to fit their text, never below their rows, and shrink back.
// Fitted on typing, on .value changes and when a box is shown or changes width.
const AUTOGROW_SELECTOR = PROMPT_BOX_MODES.flatMap(m => [`#${m}_prompt`, `#${m}_neg`]).concat([
    'textarea[id*="_adetailer_"][id$="_prompt"]', 'textarea[id*="_adetailer_"][id$="_neg"]',
    '#styleEditPrompt', '#styleEditNeg', '#img2imgPresetEdPrompt', '#img2imgPresetEdNeg', '#cfgTrigger', '#cfgLoraAdditionalNegative', '#lvTrigger', '#lvNegative', '#llmInput', '#llmOutput',
    'textarea[id^="in_"][id$="_text"]', 'textarea.fc-text', '#wcEditorText', '#wxText', '#styleFcBg', 'textarea[id^="styleFcR"]'
]).join(', ');
let autoGrowOn = false;
const autoGrowQueue = new Set();
let autoGrowFrame = 0;
const autoGrowWidths = new WeakMap();
const autoGrowObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
    // Only a width change (or being shown) can change the fit; the fit's own height change is ignored. Fitted here, after
    // layout and before the box is drawn, so a box just shown never appears at its empty size first.
    entries.forEach(e => {
        const w = Math.round(e.contentRect.width), was = autoGrowWidths.get(e.target);
        // Shown again (its window opened): a held box starts held again.
        if (!(was > 0) && w > 0) delete e.target.dataset.capOpen;
        if (was !== w) { autoGrowWidths.set(e.target, w); fitPromptBox(e.target); }
    });
}) : null;
// Editor boxes held at twice the main box's height (item 80): the pill opens the whole text.
const CAPPED_BOXES = ['cfgTrigger', 'cfgLoraAdditionalNegative', 'lvTrigger', 'lvNegative', 'styleEditPrompt', 'styleEditNeg', 'img2imgPresetEdPrompt', 'img2imgPresetEdNeg'];
function capPill(el) {
    let wrap = el.parentElement;
    if (!wrap.classList.contains('cap-wrap')) {
        wrap = document.createElement('div');
        wrap.className = 'cap-wrap';
        el.parentNode.insertBefore(wrap, el);
        wrap.appendChild(el);
    }
    let pill = wrap.querySelector(':scope > .cap-btn');
    if (!pill) {
        pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'cap-btn hidden';
        pill.addEventListener('mousedown', e => e.preventDefault());
        pill.addEventListener('click', () => { if (el.dataset.capOpen) delete el.dataset.capOpen; else el.dataset.capOpen = '1'; fitPromptBox(el); });
        wrap.appendChild(pill);
    }
    return pill;
}
function paintCap(el, state) {
    if (!CAPPED_BOXES.includes(el.id)) return;
    if (!state && !el.parentElement.classList.contains('cap-wrap')) return;
    const pill = capPill(el), wrap = el.parentElement;
    wrap.classList.toggle('capped', state === 'capped');
    pill.classList.toggle('hidden', !state);
    el.classList.toggle('cap-held', state === 'capped');
    if (!state) return;
    const n = el.value.split(/[,\n]/).filter(t => t.trim()).length;
    pill.innerHTML = state === 'capped'
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>SHOW ALL · ${n} TAG${n === 1 ? '' : 'S'}`
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>SHOW LESS';
}
function fitPromptBox(el) {
    const fc = el.classList.contains('fc-bg');
    if (!autoGrowOn) paintCap(el, null);
    if (!autoGrowOn && el.style.height) el.style.height = '';
    if (!el.offsetWidth || (!autoGrowOn && !fc)) return; // hidden: fitted when shown
    const grow = () => {
        if (!autoGrowOn) return;
        el.style.height = ''; // back to its rows, so it can shrink
        const cs = getComputedStyle(el);
        const extra = cs.boxSizing === 'border-box'
            ? parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
            : -(parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom));
        let need = Math.ceil(el.scrollHeight + extra);
        if (CAPPED_BOXES.includes(el.id)) {
            // Measured without the room the pill takes at the bottom.
            const held = el.classList.contains('cap-held');
            if (held) { el.classList.remove('cap-held'); need = Math.ceil(el.scrollHeight + extra); }
            const cap = el.offsetHeight * 2;
            if (need <= cap) paintCap(el, null);
            else if (el.dataset.capOpen) paintCap(el, 'open');
            else { paintCap(el, 'capped'); el.style.height = `${cap}px`; return; }
        }
        if (need > el.offsetHeight) el.style.height = `${need}px`;
    };
    // Forge Couple: fitted without the BACKGROUND tag's row, which is added only when the text would run under the tag.
    if (fc) el.classList.remove('fc-bg-row');
    grow();
    if (fc && window.ForgeCouple && ForgeCouple.needsRow(el)) { el.classList.add('fc-bg-row'); grow(); }
    if (fc || el.parentElement.classList.contains('wc-box')) placeBoxChips(el);
}
function queueAutoGrow(el) {
    autoGrowQueue.add(el);
    if (autoGrowObserver && !autoGrowWidths.has(el)) { autoGrowWidths.set(el, -1); autoGrowObserver.observe(el); }
    if (!autoGrowFrame) autoGrowFrame = requestAnimationFrame(() => {
        autoGrowFrame = 0;
        const els = [...autoGrowQueue]; autoGrowQueue.clear();
        els.forEach(fitPromptBox);
    });
}
function placeBoxChips(ta) {
    const btn = ta.parentElement && ta.parentElement.classList.contains('wc-box') ? ta.parentElement.querySelector('.wc-box-btn') : null;
    const tag = ta.nextElementSibling && ta.nextElementSibling.classList.contains('fc-bgtag') ? ta.nextElementSibling : null;
    const up = ta.scrollTop, down = Math.max(0, ta.scrollHeight - ta.clientHeight - ta.scrollTop);
    const move = (el, dy, cut) => {
        el.style.transform = dy ? `translateY(${dy}px)` : '';
        el.style.clipPath = cut > 0 ? (dy < 0 ? `inset(${cut}px 0 0 0)` : `inset(0 0 ${cut}px 0)`) : '';
        el.style.visibility = cut >= el.offsetHeight ? 'hidden' : '';
    };
    // How far each can move before it meets the box's edge (inside the border).
    if (btn) move(btn, -up, up - (btn.offsetTop - ta.offsetTop - ta.clientTop));
    if (tag) {
        tag.style.transform = '';
        const room = ta.getBoundingClientRect().bottom - ta.clientTop - tag.getBoundingClientRect().bottom;
        move(tag, down, down - room);
    }
}
// Scrolling a prompt box moves its wildcard button and BACKGROUND tag with the text.
document.addEventListener('scroll', e => { if (e.target && e.target.tagName === 'TEXTAREA') placeBoxChips(e.target); }, true);
function refitPromptBoxes() {
    document.querySelectorAll(AUTOGROW_SELECTOR).forEach(el => autoGrowOn ? queueAutoGrow(el) : fitPromptBox(el));
}
// Typing fits the box at once, not on the next frame: a frame late, a new line first scrolls the text up inside the
// too-short box and then drops it back as the box grows, so the text and caret hop at every line wrap.
function autoGrowNow(el) {
    if (autoGrowObserver && !autoGrowWidths.has(el)) { autoGrowWidths.set(el, -1); autoGrowObserver.observe(el); }
    autoGrowQueue.delete(el);
    fitPromptBox(el);
}
document.addEventListener('input', e => {
    if (e.target.matches && e.target.matches(AUTOGROW_SELECTOR) && (autoGrowOn || e.target.classList.contains('fc-bg'))) autoGrowNow(e.target);
}, true);
// Text put in by the app (LoRAs, styles, Analyze, presets, resets) sets .value, which fires no input event.
(() => {
    const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (!desc || !desc.set) return;
    Object.defineProperty(HTMLTextAreaElement.prototype, 'value', {
        ...desc,
        set(v) {
            desc.set.call(this, v);
            if ((autoGrowOn || this.classList.contains('fc-bg')) && this.matches(AUTOGROW_SELECTOR)) queueAutoGrow(this);
        }
    });
})();
function applyAutoGrowPromptBoxes() {
    autoGrowOn = localStorage.getItem('bojroAutoGrowPrompt') !== 'false';
    const sw = document.getElementById('cfgAutoGrowSwitch');
    if (sw) sw.checked = autoGrowOn;
    refitPromptBoxes();
}
window.toggleAutoGrowPromptBoxes = function(on) {
    localStorage.setItem('bojroAutoGrowPrompt', on ? 'true' : 'false');
    applyAutoGrowPromptBoxes();
};
window.togglePromptBoxHeight = function(field, on) {
    localStorage.setItem(field === 'neg' ? 'bojroTallNeg' : 'bojroTallPrompt', on ? 'true' : 'false');
    applyPromptBoxHeights();
};
applyPromptBoxHeights();
applyAutoGrowPromptBoxes();

// Preview Border: the ring round the preview image.
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

// Preview Method / Update Every N Steps (Config > Live Preview). Sent with each job while Live Preview is on, as
// per-job overrides that Forge Neo puts back afterwards, so its own settings are left alone. Empty = Forge's setting.
window.saveLivePreviewOverride = function(sel) {
    localStorage.setItem(sel.dataset.key, sel.value);
};
function livePreviewOverrides() {
    const out = {};
    let method = localStorage.getItem('bojroLpMethod');
    const everyN = parseInt(localStorage.getItem('bojroLpEveryN'), 10);
    // On mobile data its own method, if set ('forge' = no override).
    const mobile = localStorage.getItem('bojroLpMethodMobile') || '';
    const onMobile = window.currentNetworkType && window.currentNetworkType !== 'wifi';
    if (onMobile && mobile) method = mobile;
    if (['RGB', 'Approx NN', 'TAESD'].includes(method)) out.show_progress_type = method;
    if (everyN >= 1 && everyN <= 5) out.show_progress_every_n_steps = everyN;
    return out;
}
;(function () {
    // VRAM Profile defaults to Standard; the Live Preview ones to Forge's Setting.
    ['cfgLpMethod', 'cfgLpMethodMobile', 'cfgLpEveryN', 'vramProfile', 'cfgDockStyle'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const saved = localStorage.getItem(sel.dataset.key) || '';
        sel.value = [...sel.options].some(o => o.value === saved) ? saved : (id === 'vramProfile' ? 'mid' : '');
        if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText(id);
    });
})();

// Dock style: '' floating, 'bar', 'round', 'inset' (bar types) or 'fill'.
window.setDockStyle = function(v) {
    localStorage.setItem('bojroDockStyle', v || '');
    const b = document.body;
    b.classList.remove('dock-bar', 'dock-round', 'dock-inset', 'dock-fill');
    if (v === 'bar' || v === 'round' || v === 'inset') b.classList.add('dock-bar');
    if (v) b.classList.add('dock-' + v);
    if (typeof placeGalleryControls === 'function') requestAnimationFrame(placeGalleryControls);
};
setDockStyle(localStorage.getItem('bojroDockStyle') || '');

// Mobile Preview Method: only while Live Preview is allowed on mobile data.
window.syncLpMobileMethodRow = function () {
    const on = localStorage.getItem('bojroLivePreviewMobileDataAllowed') === 'true';
    document.getElementById('lpMobileMethodRow')?.classList.toggle('hidden', !on);
};
// Diagnostics buttons row: hidden when neither button is.
window.syncCfgToolsRow = function () {
    const row = document.getElementById('cfgToolsRow');
    if (row) row.classList.toggle('hidden', !row.querySelector('button:not(.hidden)'));
};
syncLpMobileMethodRow();
syncCfgToolsRow();

// Config search: shows options containing the query (or all of a section whose title does), opens their sections
// and marks the match. Clearing restores the sections.
let cfgSearchOpen = null; // which sections were open before searching
function cfgSearchUnmark() {
    document.querySelectorAll('#view-cfg label[data-search-text]').forEach(l => {
        l.textContent = l.dataset.searchText;
        delete l.dataset.searchText;
    });
}
window.filterCfgSearch = function (raw) {
    const q = raw.trim().toLowerCase();
    // Only what the current mode shows: in Simple, the Advanced Control options (.cfg-adv) aren't searched.
    const simple = !document.body.classList.contains('adv-control');
    const off = el => el.classList.contains('hidden') || (simple && el.classList.contains('cfg-adv'));
    const cards = [...document.querySelectorAll('#view-cfg .cfg-card')];
    cfgSearchUnmark();
    document.querySelectorAll('#view-cfg .cfg-search-miss').forEach(e => e.classList.remove('cfg-search-miss'));
    if (!q) {
        if (cfgSearchOpen) cards.forEach(card => {
            const c = card.querySelector('.cfg-accordion-content');
            c.classList.toggle('hidden', !cfgSearchOpen.has(c.id));
            const arrow = document.getElementById('arr-' + c.id);
            if (arrow) arrow.style.transform = cfgSearchOpen.has(c.id) ? 'rotate(0deg)' : 'rotate(-90deg)';
        });
        cfgSearchOpen = null;
        return;
    }
    if (!cfgSearchOpen) cfgSearchOpen = new Set(cards.map(c => c.querySelector('.cfg-accordion-content')).filter(c => !c.classList.contains('hidden')).map(c => c.id));
    const has = el => el.textContent.toLowerCase().includes(q);
    cards.forEach(card => {
        if (off(card)) { card.classList.add('cfg-search-miss'); return; }
        const title = card.querySelector('.cfg-accordion-header label');
        const content = card.querySelector('.cfg-accordion-content');
        const whole = has(title);
        const items = [...content.children];
        let any = whole;
        if (!whole) items.forEach((el, i) => {
            // A heading (a label on its own, as Visible Tabs) goes with what's under it.
            const next = el.tagName === 'LABEL' ? items[i + 1] : null;
            const hit = has(el) || (next && has(next)) || (items[i - 1]?.tagName === 'LABEL' && has(items[i - 1]));
            el.classList.toggle('cfg-search-miss', !hit);
            if (hit && !off(el)) any = true;
        });
        card.classList.toggle('cfg-search-miss', !any);
        if (any) {
            content.classList.remove('hidden');
            const arrow = document.getElementById('arr-' + content.id);
            if (arrow) arrow.style.transform = 'rotate(0deg)';
        }
    });
    // Mark the match in option names (plain labels only, so their switches keep working).
    document.querySelectorAll('#view-cfg .cfg-card:not(.cfg-search-miss) label').forEach(l => {
        if (l.children.length || l.closest('.cfg-search-miss')) return;
        const t = l.textContent, i = t.toLowerCase().indexOf(q);
        if (i < 0) return;
        const mark = document.createElement('mark');
        mark.className = 'cfg-search-hit';
        mark.textContent = t.slice(i, i + q.length);
        // In one span: labels are flex rows, which would space the pieces apart.
        const span = document.createElement('span');
        span.append(t.slice(0, i), mark, t.slice(i + q.length));
        l.dataset.searchText = t;
        l.textContent = '';
        l.append(span);
    });
};
window.clearCfgSearch = function () {
    const input = document.getElementById('cfgSearch');
    if (input) input.value = '';
    window.filterCfgSearch('');
};
// The search icon in the top bar's corner opens the box in the bar's place; its X clears the search and closes it.
window.openCfgSearch = function () {
    document.getElementById('cfgTopBar')?.classList.add('hidden');
    document.getElementById('cfgSearchWrap')?.classList.remove('hidden');
    document.getElementById('cfgSearch')?.focus();
};
window.closeCfgSearch = function () {
    window.clearCfgSearch();
    document.getElementById('cfgSearch')?.blur();
    document.getElementById('cfgSearchWrap')?.classList.add('hidden');
    document.getElementById('cfgTopBar')?.classList.remove('hidden');
};

// The Settings backup (Backup & Restore, backup.js): every option, without the presets, LoRA data and styles, which
// have their own.
window.backupAppSettings = async function() {
    try {
        const json = JSON.stringify(window.Backup.settingsPayload(), null, 2);
        // Shortened to resolver-YYYYMMDDHHMMSS.json.
        const iso = new Date().toISOString(); // e.g. "2026-09-06T17:45:33.717Z"
        const stamp = iso.slice(0, 10).replace(/-/g, '') + iso.slice(11, 19).replace(/:/g, '');
        const filename = `resolver-${stamp}.json`;

        const fs = typeof Filesystem !== 'undefined' ? Filesystem : null;
        if (fs) {
            await fs.writeFile({
                path: filename,
                data: json,
                directory: 'DOCUMENTS',
                encoding: 'utf8'
            });
            if (typeof Toast !== 'undefined') Toast.show({ text: 'Saved to Documents', duration: 'short' });
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

// Show Dev Power; the key stores the hidden state.
window.toggleDevPowerVisibility = function() {
    const hide = !document.getElementById('cfgShowDevPowerSwitch').checked;
    localStorage.setItem('bojroHideDevPower', hide ? 'true' : 'false');
    document.getElementById('devPowerSection')?.classList.toggle('hidden', hide);
}

// Magic Prompt: the button on every tab's Prompt title.
window.toggleMagicPromptHidden = function(on) {
    localStorage.setItem('bojroHideMagicPrompt', on ? 'true' : 'false');
    document.body.classList.toggle('hide-magic-prompt', on);
    if (window.Scene) Scene.paintVisibility();
};
// Show model hints: Flux's GGUF hint, Qwen's Z-Image Turbo hint and special GENERATE labels, which don't match every setup (Nunchaku/SVDQuant, Qwen-Image-Lightning, etc). The key stores the hidden state.
// Show UI hints: the grey how-to text across the app (body.no-ui-hints, style.css).
window.toggleUiHints = function() {
    const hide = !document.getElementById('cfgShowUiHintsSwitch').checked;
    localStorage.setItem('bojroHideUiHints', hide ? 'true' : 'false');
    document.body.classList.toggle('no-ui-hints', hide);
}
// Show model button names: QUANTUM / TURBO GENERATE on Flux / Z-Image (the setting was "Show model hints").
window.toggleModelHintsVisibility = function() {
    const hide = !document.getElementById('cfgShowModelHintsSwitch').checked;
    localStorage.setItem('bojroHideModelHints', hide ? 'true' : 'false');
    if (typeof updateGenerateButtonLabel === 'function') updateGenerateButtonLabel();
}

// Show loading circle: the spinner above the results of the main tabs and the Inpaint/img2img/Upscale tab while a job runs. On by default. Applied as a body class (see style.css) so the generation logic is untouched; takes effect immediately.
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
window.toggleGenSpinnerVisibility = function() {
    const hide = !document.getElementById('cfgShowGenSpinnerSwitch').checked;
    localStorage.setItem('bojroHideGenSpinner', hide ? 'true' : 'false');
    applyGenSpinnerHidden(hide);
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
        row.className = 'ad-label-card';
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
                <button class="card-btn card-btn-delete" title="Remove" onclick="removeAdetailerLabelRow(${i})"><i data-lucide="trash-2" width="16" height="16"></i></button>
            </div>
            <div class="col"><label>Chip name</label>
                <div class="row" style="gap:8px; align-items:stretch;">
                    <input type="text" class="ad-chip-name-input" value="${escapeHtmlAttr(entry.name || '')}" autocomplete="off" spellcheck="false" style="text-transform:uppercase; flex:1; min-width:0;" oninput="updateAdChipName(${i}, this)">
                    <div class="ad-pass-chip active ad-chip-preview"><span class="ad-pass-num">${i + 1}</span><input type="checkbox" checked tabindex="-1" onclick="return false"><span class="ad-pass-name"></span></div>
                </div>
            </div>
            <div class="row" style="gap:10px;">
                <div class="col"><label>Singular</label><input type="text" placeholder="face" value="${escapeHtmlAttr(entry.singular || '')}" oninput="updateAdetailerLabelField(${i}, 'singular', this.value)"></div>
                <div class="col"><label>Plural</label><input type="text" placeholder="faces" value="${escapeHtmlAttr(entry.plural || '')}" oninput="updateAdetailerLabelField(${i}, 'plural', this.value)"></div>
            </div>
            <div class="ad-label-preview"></div>
        `;
        row.querySelector('.ad-label-preview').textContent = adetailerLabelPreview(entry);
        row.querySelector('.ad-chip-preview .ad-pass-name').textContent = entry.name || '';
        list.appendChild(row);
    });
    const sw = document.getElementById('adChipNamesSwitch');
    if (sw) sw.checked = adChipNamesOn();
    const w = adChipWidth();
    list.querySelectorAll('.ad-chip-preview').forEach(c => { c.style.width = `${w}px`; });
    if (typeof lucide !== 'undefined') lucide.createIcons();
    // Re-runs initModelPickers() (safe to repeat) for the triggers just created.
    if (typeof initModelPickers === 'function') initModelPickers();
}

window.addAdetailerLabelRow = function() {
    const entries = getCustomAdetailerLabels();
    entries.push({ match: '', singular: '', plural: '' });
    setCustomAdetailerLabels(entries);
    renderAdetailerLabelsList();
    // The new row, at the bottom, scrolled into view.
    const list = document.getElementById('adetailerLabelsList');
    if (list) list.scrollTop = list.scrollHeight;
}

window.removeAdetailerLabelRow = function(index) {
    const entries = getCustomAdetailerLabels();
    entries.splice(index, 1);
    setCustomAdetailerLabels(entries);
    renderAdetailerLabelsList();
    paintAdChipNames();
}

// ---- Chip names (item 9) ----
const AD_CHIP_NAMES_KEY = 'bojroAdChipNames';
function adChipNamesOn() { return localStorage.getItem(AD_CHIP_NAMES_KEY) !== 'false'; }
window.toggleAdChipNames = function(on) {
    localStorage.setItem(AD_CHIP_NAMES_KEY, on ? 'true' : 'false');
    paintAdChipNames();
};
// The narrowest pass chip (four to a row): measured from one on screen, else worked out from the app's width.
function adChipWidth() {
    const c = [...document.querySelectorAll('.ad-pass-chip:not(.ad-chip-preview)')].find(x => x.offsetWidth > 0);
    if (c) { try { localStorage.setItem('bojroAdChipW', String(c.offsetWidth)); } catch (e) { } return c.offsetWidth; }
    const saved = Number(localStorage.getItem('bojroAdChipW'));
    if (saved > 0) return saved;
    return Math.floor((Math.min(window.innerWidth, 650) - 32 - 34 - 18) / 4);
}
// Whether a name fits on a chip's second line (its own font, upper case).
let adChipCanvas = null;
function adChipNameFits(text) {
    const probe = document.querySelector('.ad-chip-preview .ad-pass-name, .ad-pass-name');
    if (!probe) return true;
    const cs = getComputedStyle(probe);
    adChipCanvas = adChipCanvas || document.createElement('canvas').getContext('2d');
    adChipCanvas.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const room = adChipWidth() - 16 - 2;
    return adChipCanvas.measureText(String(text).toUpperCase()).width <= room;
}
// A typed name is kept only while it fits; past that the box shows the last one that did, and flashes.
window.updateAdChipName = function(index, input) {
    const entries = getCustomAdetailerLabels();
    if (!entries[index]) return;
    let v = input.value;
    if (!adChipNameFits(v)) {
        // Back to what was there before this keystroke (or, if that was too long too, cut to fit).
        const last = typeof input._last === 'string' ? input._last : (entries[index].name || '');
        const pos = Math.max(0, (input.selectionStart || 0) - (v.length - last.length));
        v = last;
        while (v && !adChipNameFits(v)) v = v.slice(0, -1);
        input.value = v;
        try { input.setSelectionRange(Math.min(pos, v.length), Math.min(pos, v.length)); } catch (e) { }
        input.classList.add('full');
        clearTimeout(input._full);
        input._full = setTimeout(() => input.classList.remove('full'), 700);
    }
    input._last = v;
    entries[index].name = v.trim();
    setCustomAdetailerLabels(entries);
    const prev = input.closest('.ad-label-card')?.querySelector('.ad-chip-preview .ad-pass-name');
    if (prev) prev.textContent = v;
    paintAdChipNames();
};
// Each pass chip: the name set for its detection model (blank when none).
window.paintAdChipNames = function() {
    const on = adChipNamesOn();
    document.body.classList.toggle('ad-chip-names', on);
    if (!on) return;
    const byModel = new Map(getCustomAdetailerLabels().filter(e => e.match).map(e => [e.match, e.name || '']));
    document.querySelectorAll('.ad-pass-chip[id*="-adetailer-pass-chip-"]').forEach(chip => {
        const m = chip.id.match(/^(.+)-adetailer-pass-chip-(\d+)$/);
        if (!m) return;
        const sel = document.getElementById(`${m[1]}_adetailer_${m[2]}_model`);
        const model = (sel && sel.value) || localStorage.getItem(`bojro_${m[1]}_adetailer_${m[2]}_model`) || '';
        let span = chip.querySelector('.ad-pass-name');
        if (!span) { span = document.createElement('span'); span.className = 'ad-pass-name'; chip.appendChild(span); }
        span.textContent = byModel.get(model) || '';
    });
};
document.addEventListener('change', e => { if (e.target && /_adetailer_\d+_model$/.test(e.target.id || '')) paintAdChipNames(); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => paintAdChipNames()); else setTimeout(() => paintAdChipNames(), 0);
window.addEventListener('load', () => setTimeout(() => paintAdChipNames(), 300));

// The toast a row produces, for its preview line.
function adetailerLabelPreview(entry) {
    const one = entry.singular || 'face', many = entry.plural || 'faces';
    return `1 ${one} detected • 3 ${many} detected`;
}
// Updates one field of one row in place (a full re-render would drop focus mid-keystroke), and its preview.
window.updateAdetailerLabelField = function(index, field, value) {
    const entries = getCustomAdetailerLabels();
    if (!entries[index]) return;
    entries[index][field] = value;
    setCustomAdetailerLabels(entries);
    if (field === 'match') paintAdChipNames();
    const preview = document.querySelectorAll('#adetailerLabelsList .ad-label-preview')[index];
    if (preview) preview.textContent = adetailerLabelPreview(entries[index]);
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


// Recent Uploads off: hides both RECENT buttons, stops saving and, once confirmed, clears them.
window.toggleRecentUploads = async function(on, el) {
    const histories = [window.AnalyzerHistory, window.EditHistory].filter(Boolean);
    if (!on) {
        const counts = await Promise.all(histories.map(async h => (await h.list()).length));
        if (counts.some(n => n)) {
            const ok = await window.appConfirm('Analyze and Crop & Edit upload history will be cleared.',
                { title: 'Recent Uploads', okText: 'TURN OFF', cancelText: 'CANCEL', danger: true });
            if (!ok) { if (el) el.checked = true; return; }
            await Promise.all(histories.map(h => h.clear()));
        }
    }
    ['bojroAnalyzerHistory', 'bojroEditHistory'].forEach(k => localStorage.setItem(k, on ? 'true' : 'false'));
    histories.forEach(h => h.applyVisibility());
}

// Analyzer Sticky Bar: applies at once; an open panel closes when switched off.
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

// Not tied to the Preview switch.
window.saveLivePreviewMobileDataAllowed = function() {
    const isChecked = document.getElementById('cfgLivePreviewMobileDataSwitch').checked;
    localStorage.setItem('bojroLivePreviewMobileDataAllowed', isChecked ? 'true' : 'false');
    syncLpMobileMethodRow();
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

// Status bar icon of the progress and Generation Complete notifications (in the app only); the service reads the native copy.
;(function () {
    const KEY = 'bojroNotificationIcon';
    const ICONS = ['logo', 'badge', 'bold', 'sparkles'];
    const device = () => window.Capacitor?.Plugins?.ResolverDevice;
    const saved = () => { const v = localStorage.getItem(KEY); return ICONS.includes(v) ? v : 'logo'; };
    function show(icon) {
        document.querySelectorAll('#cfgNotifIconRow .notif-icon-btn').forEach(b => {
            const on = b.dataset.icon === icon;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }
    async function sendToNative(icon) {
        try { await device()?.setNotificationIcon({ icon }); } catch (e) { }
    }
    window.setNotificationIcon = function (icon) {
        if (!ICONS.includes(icon)) return;
        localStorage.setItem(KEY, icon);
        show(icon);
        sendToNative(icon);
    };
    (function init() {
        show(saved());
        if (!device()) return;
        document.getElementById('cfgNotifIconRow')?.classList.remove('hidden');
        // Keeps the native copy in step, e.g. after Reset App Configuration.
        sendToNative(saved());
    })();
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

// ---- Gallery columns (item 82) ----
window.setGalleryColumns = function(c) {
    localStorage.setItem('bojroGalleryCols', c);
    applyGalleryLayout();
};
window.setGalleryWide = function(on) {
    localStorage.setItem('bojroGalleryWide', on ? 'true' : 'false');
    applyGalleryLayout();
};
function applyGalleryLayout() {
    const c = localStorage.getItem('bojroGalleryCols') || 'auto', wide = localStorage.getItem('bojroGalleryWide') !== 'false';
    ['3', '4', '5'].forEach(n => document.body.classList.toggle('gal-cols-' + n, c === n));
    document.body.classList.toggle('gal-wide', wide);
    document.querySelectorAll('#cfgGalleryCols .toggle-opt').forEach(b => b.classList.toggle('active', b.dataset.c === c));
    const sw = document.getElementById('cfgGalleryWideSwitch');
    if (sw) sw.checked = wide;
    checkGalleryColumns();
}
// The columns the grid shows; a change re-pages the gallery so the last row stays full.
function checkGalleryColumns() {
    const grid = document.getElementById('savedGalleryGrid');
    if (!grid || !grid.offsetParent) return;
    const n = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 3;
    if (n === galleryColumnCount) return;
    // Keep the first image shown on the page it lands on.
    const first = (galleryPage - 1) * galleryPerPage();
    galleryColumnCount = n;
    galleryPage = Math.floor(first / galleryPerPage()) + 1;
    if (typeof window.loadGallery === 'function') window.loadGallery();
}
(function () {
    const go = () => {
        applyGalleryLayout();
        const grid = document.getElementById('savedGalleryGrid');
        if (grid && window.ResizeObserver) new ResizeObserver(() => checkGalleryColumns()).observe(grid);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
