// -----------------------------------------------------------
// APPLICATION ENTRY POINT
// -----------------------------------------------------------

// Runs immediately (the textareas already exist); CSS hides content until then. finally always removes the class.
try {
    if (window.LoraManager && typeof window.LoraManager.loadInsertions === 'function') window.LoraManager.loadInsertions();
    if (typeof loadSavedPrompts === 'function') loadSavedPrompts();
    // Reflect each mode's restored CFG in its negative prompt dimming.
    if (typeof updateNegPromptDimming === 'function' && typeof NEG_PROMPT_CFG_MODES !== 'undefined') {
        NEG_PROMPT_CFG_MODES.forEach(mode => updateNegPromptDimming(mode));
    }
    // Reflect each mode's restored width/height in the aspect ratio highlight.
    if (typeof updateResSwitchHighlight === 'function') {
        ['xl', 'flux', 'qwen', 'anima', 'krea'].forEach(mode => updateResSwitchHighlight(mode));
    }
} catch (e) {
    console.error("Immediate prompt restore failed:", e);
} finally {
    document.body.classList.remove('prompts-loading');
}

// The app is shown in one go once boot has applied the saved settings (end of window.onload), or after 3 seconds.
// Android's splash screen stays up until then (ResolverBootPlugin), so the first frame is the finished app.
function revealApp() {
    if (!document.body.classList.contains('app-loading')) return;
    // Without transitions while it appears: controls with "transition: all" would fade their visibility in.
    document.body.classList.add('app-revealing');
    document.body.classList.remove('app-loading');
    void document.body.offsetWidth;
    setTimeout(() => document.body.classList.remove('app-revealing'), 0);
    try { Promise.resolve(window.Capacitor?.Plugins?.ResolverBoot?.ready?.()).catch(() => {}); } catch (e) {}
    if (typeof paintNativeBg === 'function') paintNativeBg();
}
setTimeout(revealApp, 3000);

// Restore the Inpaint tab's last-used mode (Inpaint/img2img/Upscale) early, before an early Crop & Edit can use the wrong one.
try {
    if (typeof setInpaintTopMode === 'function') {
        const savedTopMode = localStorage.getItem('bojroInpaintTopMode');
        const validTopModes = ['inpaint', 'img2img', 'upscale'];
        setInpaintTopMode(validTopModes.includes(savedTopMode) ? savedTopMode : 'inpaint');
    }
    // Restore the Whole/Masked mask mode. Needs setInpaintMode() (editor.js, loaded late), so it is done here rather than in an inline script.
    if (typeof setInpaintMode === 'function') {
        const savedMaskMode = localStorage.getItem('bojro_inp_mask_mode');
        if (savedMaskMode === 'fill' || savedMaskMode === 'mask') setInpaintMode(savedMaskMode);
    }
} catch (e) {
    console.error("Immediate Inpaint top-mode restore failed:", e);
}

// Restores the main tab last used to generate an image.
try {
    const savedGenTab = localStorage.getItem('bojroLastGenTab');
    if (typeof setMode === 'function' && ['xl', 'flux', 'qwen', 'anima', 'krea'].includes(savedGenTab)) {
        setMode(savedGenTab);
    }
} catch (e) {
    console.error("Immediate last-gen-tab restore failed:", e);
}

// Restore the main tabs' Generation Params fields. Sampler/scheduler are restored by fetchSamplers()/fetchSchedulers() (network.js).
try {
    if (typeof restoreLiveGenParams === 'function') {
        ['xl', 'flux', 'qwen', 'anima', 'krea'].forEach(mode => restoreLiveGenParams(mode));
    }
} catch (e) {
    console.error("Immediate main-tab live gen-params restore failed:", e);
}

// Restore Upscaler 2 Visibility.
try {
    const savedUpscaler2Vis = localStorage.getItem('bojro_upscaler2_visibility');
    const upscaler2VisEl = document.getElementById('upscale_upscaler_2_visibility');
    if (savedUpscaler2Vis !== null && upscaler2VisEl) upscaler2VisEl.value = savedUpscaler2Vis;
} catch (e) {
    console.error("Immediate Upscaler 2 Visibility restore failed:", e);
}

// Restore Upscale's Copy Metadata from Source switch (off by default).
try {
    const copyMetaEl = document.getElementById('upscale_copy_metadata');
    if (copyMetaEl) copyMetaEl.checked = localStorage.getItem('bojro_upscale_copy_metadata') === '1';
} catch (e) {
    console.error("Immediate Upscale Copy Metadata restore failed:", e);
}

// Restore Upscale's Scale Factor (BY FACTOR mode).
try {
    const savedUpscaleFactor = localStorage.getItem('bojro_upscale_factor');
    const upscaleFactorEl = document.getElementById('upscale_factor');
    if (savedUpscaleFactor !== null && upscaleFactorEl) upscaleFactorEl.value = savedUpscaleFactor;
} catch (e) {
    console.error("Immediate Upscale Factor restore failed:", e);
}

// Batch Size/Count and Seed always start at their HTML defaults, whatever the WebView restores.
try {
    ['xl', 'flux', 'qwen', 'anima', 'krea'].forEach(mode => {
        const batchSizeEl = document.getElementById(`${mode}_batch_size`);
        const batchCountEl = document.getElementById(`${mode}_batch_count`);
        const seedEl = document.getElementById(`${mode}_seed`);
        if (batchSizeEl) batchSizeEl.value = '1';
        if (batchCountEl) batchCountEl.value = '1';
        if (seedEl) seedEl.value = '-1';
    });
    const inpBatchCountEl = document.getElementById('inp_batch_count');
    if (inpBatchCountEl) inpBatchCountEl.value = '1';
} catch (e) {
    console.error("Immediate Batch Size/Count/Seed reset failed:", e);
}

window.onload = function() {
    try {
        console.log("Booting Resolver...");

        // 1. Initialize Icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // 1b. Gallery cache limit and lightbox swipe setup (own try/catch so earlier failures don't skip it).
        try {
            if (typeof loadGalleryCacheLimitUI === 'function') loadGalleryCacheLimitUI();
            if (typeof loadGenerationPollingRateUI === 'function') loadGenerationPollingRateUI();
            if (typeof loadInpaintColorCorrectionUI === 'function') loadInpaintColorCorrectionUI();
            if (typeof updateInpPreviewToggleVisibility === 'function') updateInpPreviewToggleVisibility();
            if (typeof initLivePreviewNetworkListener === 'function') initLivePreviewNetworkListener();
            if (typeof refreshLivePreviewToggleInteractivity === 'function') refreshLivePreviewToggleInteractivity();
            if (typeof setupLightboxSwipe === 'function') setupLightboxSwipe();
        } catch (e) {
            console.error("Gallery cache limit / lightbox swipe setup failed:", e);
        }

        // Battery Optimization Check
        // Only when Resolver isn't exempt already (item 75: after a config reset it usually is).
        if (!localStorage.getItem('bojroBatteryOpt')) {
            const show = () => {
                const batteryModal = document.getElementById('batteryModal');
                if (batteryModal) {
                    batteryModal.classList.remove('hidden');
                    console.log("Battery Modal Triggered");
                }
            };
            const device = window.Capacitor?.Plugins?.ResolverDevice;
            if (device && device.batteryOptStatus) {
                device.batteryOptStatus().then(r => {
                    if (r && r.exempt) localStorage.setItem('bojroBatteryOpt', 'true');
                    else show();
                }).catch(show);
            } else show();
        }

        // 2. Initialize Database
        if (typeof initDatabase === 'function') {
            initDatabase();
        }

        // 3. Load Centralized Configuration
        loadConnectionConfig();    // cfg.js
        
        // 4. First-Run Check
        if (!connectionConfig.isConfigured) {
            console.log("First run detected - showing configuration");
            setTimeout(() => {
                switchTab('cfg');
                if (typeof Toast !== 'undefined') Toast.show({
                    text: 'Welcome! Please configure your connection settings',
                    duration: 'long',
                    position: 'center'
                });
            }, 500);
        }
        
        // Each tab's last checkpoint, until the server's list arrives (network.js).
        if (typeof showCachedCheckpoints === 'function') showCachedCheckpoints();

        // 5. Load Saved Settings & State
        // ControlNet Weight/Guidance sliders (rangeslider.js): built around the number inputs before any values are restored into them.
        if (typeof upgradeControlNetSliders === 'function') upgradeControlNetSliders();
        if (typeof injectConfigModal === 'function') injectConfigModal();
        // initModelPickers() ran before this modal's Sampler/Schedule triggers existed and is incremental, so run it again for them.
        if (typeof initModelPickers === 'function') initModelPickers();
        // MORE SETTINGS cards on the generation tabs (moresettings.js), before the number boxes are set up.
        if (window.MoreSettings) window.MoreSettings.start();
        if (window.ForgeCouple) window.ForgeCouple.start();
        if (window.Scene) window.Scene.start();
        // Number boxes that put right what's typed (numberboxes.js), once the slider boxes above are marked.
        if (window.NumberBoxes) window.NumberBoxes.start();
        if (typeof loadHostIp === 'function') loadHostIp();
        if (typeof loadQueueState === 'function') loadQueueState();
        // The app closed mid-job: stop Forge's job if that's turned on (jobabort.js).
        if (window.JobAbort) JobAbort.checkOnLaunch();
        if (typeof renderQueueAll === 'function') renderQueueAll();
        if (typeof loadAutoDlState === 'function') loadAutoDlState();
        if (typeof loadLlmSettings === 'function') loadLlmSettings();

        // Restore cached LoRA sidecar configs from last session
        try {
            const savedLoraConfigs = localStorage.getItem('bojroLoraConfigs');
            if (savedLoraConfigs) Object.assign(loraConfigs, JSON.parse(savedLoraConfigs));
            // Slider ranges: 0.5 to 1.5 by default now; ones saved at the old -5 to 5 are moved over, once.
            if (!localStorage.getItem('bojroSliderRange15')) {
                Object.values(loraConfigs).forEach(c => { if (c && parseFloat(c.sliderMin) === -5 && parseFloat(c.sliderMax) === 5) { c.sliderMin = 0.5; c.sliderMax = 1.5; } });
                localStorage.setItem('bojroLoraConfigs', JSON.stringify(loraConfigs));
                localStorage.setItem('bojroSliderRange15', '1');
            }
        } catch (e) {}
        // Sliders for LoRAs already in the prompt boxes, now their settings are known (lorasliders.js).
        if (window.LoraSliders) window.LoraSliders.refreshAll();

        // The Inpaint tab's mode is restored earlier; initControlNet() needs a server connection.
        if (typeof initControlNet === 'function') initControlNet();

        // 6. Setup Background & Notifications
        if (typeof setupBackgroundListeners === 'function') setupBackgroundListeners();
        if (typeof createNotificationChannel === 'function') createNotificationChannel();

        // 7. Initialize Graphics Engine
        if (typeof initMainCanvas === 'function') initMainCanvas();
        if (typeof setupEditorEvents === 'function') setupEditorEvents();
        
        // 8. Request Capacitor Notification Access (Android) - System Check
        if (typeof LocalNotifications !== 'undefined' && LocalNotifications) {
            LocalNotifications.checkPermissions().then(perm => {
                console.log("Notification Perm Status:", perm.display);
                // Asked once on first launch; Android remembers a refusal ('denied') and doesn't ask again.
                if (perm.display === 'prompt' || perm.display === 'prompt-with-rationale') return LocalNotifications.requestPermissions();
            }).catch(e => console.warn("Notif check failed:", e));
        }
        
        // 9. Acquire Wake Lock
        if ("wakeLock" in navigator) {
            navigator.wakeLock.request('screen').then(wakeLock => {
                console.log("Wake lock acquired");
                globalWakeLock = wakeLock;
            }).catch(error => {
                console.log("Wake lock not available:", error);
            });
        } else {
            console.log("Wake Lock API not supported");
        }
        
        // 10. Acquire WiFi Lock
        if ('connection' in navigator && 'saveData' in navigator.connection) {
            try {
                navigator.connection.saveData = false;
                console.log("WiFi lock enabled");
            } catch (error) {
                console.log("WiFi lock not available:", error);
            }
        }
        
        // 11. Release locks on visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && globalWakeLock) {
                globalWakeLock.release();
                globalWakeLock = null;
            }
        });

        // 12. Auto-Connect
        if (connectionConfig.isConfigured && connectionConfig.baseIp) {
            console.log("Auto-connecting...");
            window.connect(true);
        } else if (document.getElementById('hostIp') && document.getElementById('hostIp').value) {
            window.connect(true);
        }

        // =========================================================================
        // 13. SPA NAVIGATION OVERRIDE (CRITICAL FOR SEAMLESS COMFYUI)
        // =========================================================================
        // The dock (DockGlide below): tap an item, or put a finger down and slide along the dock; the item under the finger
        // lights up (a tick of haptics each time it changes) and the tab switches as the finger lifts, with a confirm
        // haptic. Lifting well above the dock cancels, so a system swipe up from the bottom edge changes nothing.
        // dockClick() stays for keyboard use and ignores the click that follows a handled touch.
        window.__dockHandledAt = 0;
        document.addEventListener('touchmove', e => {
            if (e.cancelable && e.target.closest && e.target.closest('.dock-wrapper')) e.preventDefault();
        }, { passive: false });
        window.dockClick = function(view) {
            if (Date.now() - window.__dockHandledAt < 400) return;
            window.switchTab(view);
        };

        // Tabs that keep their scroll position; History starts at the top once per launch.
        const TAB_SCROLL_KEPT = ['gen', 'inp', 'gal', 'cfg'];
        const tabScrollY = {};
        window.switchTab = function(view) {
            // "Configuration Saved" fires when CFG is left for another tab (checked before views are hidden).
            const cfgViewEl = document.getElementById('view-cfg');
            const leavingCfg = view !== 'cfg' && cfgViewEl && !cfgViewEl.classList.contains('hidden');
            // window.__cfgDirty (set by saveConfiguration() auto-save) marks a real edit since CFG was entered.
            if (leavingCfg && window.__cfgDirty && typeof saveConfiguration === 'function') saveConfiguration(true);
            if (view === 'cfg') window.__cfgDirty = false;
            // Correct an invalid or 0 gallery cache limit to the default (30) when CFG is left.
            if (leavingCfg && typeof enforceGalleryCacheLimitDefault === 'function') enforceGalleryCacheLimitDefault();
            if (leavingCfg && typeof enforceGenerationPollingRateDefault === 'function') enforceGenerationPollingRateDefault();
            if (leavingCfg && typeof enforceBackgroundPollingRateDefault === 'function') enforceBackgroundPollingRateDefault();

            // List of all valid view IDs
            const views = ['gen', 'inp', 'que', 'gal', 'ana', 'cfg', 'comfy'];
            // Each tab keeps its scroll position (the page is one scroll shared by every tab).
            const leaving = views.find(v => { const el = document.getElementById('view-' + v); return el && !el.classList.contains('hidden'); });
            if (leaving && leaving !== view && TAB_SCROLL_KEPT.includes(leaving)) tabScrollY[leaving] = window.scrollY;
            if (leaving === 'gal' && view !== 'gal' && typeof isSelectionMode !== 'undefined' && isSelectionMode && typeof toggleGallerySelectionMode === 'function') toggleGallerySelectionMode();
            
            // 1. Hide all views and deactivate all dock items
            views.forEach(v => {
                const el = document.getElementById('view-' + v);
                if (el) el.classList.add('hidden');
                
                const dock = document.getElementById('dock-' + v);
                if (dock) dock.classList.remove('active');
            });

            // 2. Show the selected view
            const target = document.getElementById('view-' + view);
            if (target) target.classList.remove('hidden');
            
            const targetDock = document.getElementById('dock-' + view);
            if (targetDock) targetDock.classList.add('active');
            if (leaving !== view && view === 'gal' && tabScrollY.gal == null) window.scrollTo({ top: 0, behavior: 'instant' });
            if (leaving !== view && TAB_SCROLL_KEPT.includes(view) && tabScrollY[view] != null) {
                const want = tabScrollY[view];
                window.scrollTo({ top: want, behavior: 'instant' });
                // Again once laid out, unless something else has scrolled since (e.g. a notification tap).
                const at = window.scrollY;
                requestAnimationFrame(() => { if (window.scrollY === at && at !== want) window.scrollTo({ top: want, behavior: 'instant' }); });
            }

            // --- RESTORED MISSING LOGIC START ---
            if (view === 'gen') {
                currentTask = 'txt';
            }
            if (view === 'inp') {
                currentTask = 'inp';
                // Trigger Inpaint Sampler default check if needed (ported from ui.js)
                const inpSamplerEl = document.getElementById('inp_sampler');
                if (inpSamplerEl && !localStorage.getItem('bojro_inp_sampler')) {
                     inpSamplerEl.value = "DPM++ 2M SDE";
                     // inp_sampler's picker trigger needs a refresh; it is also watched by the img2img Preset Manager.
                     if (typeof refreshAllModelPickerTriggers === 'function') refreshAllModelPickerTriggers();
                     if (typeof clearActiveImg2imgPreset === 'function') clearActiveImg2imgPreset();
                }
            }
            // --- RESTORED MISSING LOGIC END ---

            // 3. Trigger specific view logic
            if (view === 'cfg') loadConnectionConfig();
            // Again once the grid is drawn: before that the page may be too short to get there.
            const galY = leaving !== view ? tabScrollY.gal : null;
            if (view === 'gal' && typeof loadGallery === 'function') loadGallery(galY ? () => window.scrollTo({ top: galY, behavior: 'instant' }) : undefined);
            // Shown again: the page controls' place is measured on screen.
            if (view === 'gal' && typeof placeGalleryControls === 'function') placeGalleryControls();
            
            // 4. Auto-Connect ComfyUI if opened and not connected
            if (view === 'comfy' && typeof connectToComfy === 'function') {
                // Only connect if we have a host but no active socket
                const savedHost = localStorage.getItem('comfyHost');
                if(savedHost && (!window.comfySocket || window.comfySocket.readyState !== WebSocket.OPEN)) {
                    // Slight delay to allow UI to render
                    setTimeout(connectToComfy, 100); 
                }
            }

            // The thumb-only sliders' fake thumbs are positioned from rendered width (0 while hidden), so resync when the tab is shown.
            if (view === 'inp' && typeof syncThumbOnlySliderPosition === 'function' && typeof THUMB_ONLY_SLIDER_IDS !== 'undefined') {
                THUMB_ONLY_SLIDER_IDS.forEach(syncThumbOnlySliderPosition);
            }
        };

        // =========================================================================
        // 14. NEO BRIDGE
        // =========================================================================
        if (!window.Neo) window.Neo = {};
        
        // variant (LoRA variants, loravariants.js): { id, weight, trigger, negative } used instead of the LoRA's own; its
        // negative is added after the LoRA's.
        window.Neo.appInjectConfig = async function(alias, name, textArea, variant = null) {
            const loraEntry = window.LoraManager && window.LoraManager.allLoras 
                ? window.LoraManager.allLoras.find(l => l.name === name) 
                : null;

            let config = loraConfigs[name];

            if (!config && loraEntry && loraEntry.path) {
                if (typeof Toast !== 'undefined') Toast.show({ text: 'Fetching config...', duration: 'short' });
                config = await loadSidecarConfig(name, loraEntry.path);
            }

            const hasVariantWeight = variant && variant.id && variant.weight !== undefined && variant.weight !== null && variant.weight !== '';
            const weight = hasVariantWeight ? variant.weight : (config ? config.weight : 1.0);
            const triggerSource = variant && variant.id ? variant.trigger : (config && config.trigger);
            // Trigger text may use line breaks to separate "pick one" groups; keep them, tidy other whitespace.
            const rawTrigger = triggerSource
                ? String(triggerSource).split('\n').map(line => line.trim().replace(/[ \t]+/g, ' ')).filter(line => line.length > 0).join('\n')
                : "";
            // Trigger words already in the box (in any weight or case) aren't added again.
            // Removed segment by segment, so the trigger's own line breaks stay.
            // With Forge Couple on, they go to the region box last tapped instead (forgecouple.js).
            // Tool, Artstyle, Background and Slider LoRAs are for the whole image: always the background (prompt box).
            const wholeImage = !!(config && ['tool', 'artstyle', 'background', 'slider'].includes(config.type));
            const triggerBox = (!wholeImage && window.ForgeCouple && window.ForgeCouple.triggerBox(textArea.id.replace(/_prompt$/, ''))) || textArea;
            const presentTags = boxTagSet(triggerBox);
            const formattedTrigger = window.formatInsertedTags ? window.formatInsertedTags(rawTrigger, textArea.id.replace(/_prompt$/, '')) : rawTrigger;
            const triggerText = removeTagsFromText(formattedTrigger, new Set(parseTagList(formattedTrigger).map(normaliseTag).filter(n => presentTags.has(n))));
            const addedTriggers = parseTagList(triggerText);
            // Its trigger words missing from every box: other LoRAs listing them lost them (they were deleted).
            if (window.LoraManager && !textArea.value.includes(`<lora:${alias}:`)) {
                const everywhere = new Set([...presentTags, ...boxTagSet(textArea), ...(window.ForgeCouple ? window.ForgeCouple.regionTags(textArea.id.replace(/_prompt$/, '')) : [])]);
                const missing = [...new Set(withFormattedPieces(parseTagList(formattedTrigger)).map(normaliseTag))].filter(n => !everywhere.has(n));
                window.LoraManager.releaseMissing(textArea.id.replace(/_prompt$/, ''), alias, missing, textArea.value);
            }
            const trigger = triggerText && triggerBox === textArea ? ` ${triggerText}` : "";
            const loraTag = `<lora:${alias}:${weight}>${trigger}`;

            if (!textArea.value.includes(`<lora:${alias}:`)) {
                // Add a leading separator only when there is content to separate from (as appendTagsToBox(), utils.js).
                const trimmed = textArea.value.replace(/\s+$/, "");
                let sep;
                if (!trimmed) sep = "";
                else if (trimmed.endsWith(",")) sep = " ";
                else sep = ", ";
                const insertion = sep + loraTag;
                textArea.value = trimmed + insertion;
                // End the box with ", " (withTrailingComma(), utils.js). Applied after `insertion` is fixed, so the tracked string stays separator + tag for toggle().
                textArea.value = withTrailingComma(textArea.value);
                if (triggerText && triggerBox !== textArea) window.ForgeCouple.addTo(triggerBox, triggerText);

                // Remember exactly what was inserted (persisted) so toggle() can remove precisely that; trigger is kept for word-by-word fallback.
                const mode = textArea.id.replace(/_prompt$/, '');
                if (window.LoraManager) {
                    if (!window.LoraManager.appliedInsertions[mode]) window.LoraManager.appliedInsertions[mode] = {};
                    // inserted: the trigger words it added, which are the ones removed with it (toggle()). variant: which one (null: the default).
                    window.LoraManager.appliedInsertions[mode][alias] = { insertion, trigger: rawTrigger, inserted: addedTriggers, variant: variant && variant.id ? variant.id : null };
                    window.LoraManager.saveInsertions(mode);
                }

                // Setting .value fires no 'input' event, so save the prompt explicitly.
                if (typeof savePrompt === 'function') savePrompt(mode);

                // This LoRA's "Additional Negative Prompts" override is appended to the Negative box and removed by LoraManager.toggle(). Only when the LoRA is actually being added.
                const additionalNegative = [config && config.additionalNegative, variant && variant.id && variant.negative].filter(Boolean).join(', ');
                if (window.LoraManager && additionalNegative) {
                    window.LoraManager.applyAdditionalNegative(mode, alias, additionalNegative);
                }

                // Apply this LoRA's Sampler/Schedule/Steps/CFG overrides to the current tab when it is added. Each is applied only if the LoRA set a non-empty value.
                if (config) {
                    const overrideFieldMap = {
                        overrideSampler: 'sampler',
                        overrideScheduler: 'scheduler',
                        overrideSteps: 'steps',
                        overrideCfg: 'cfg'
                    };
                    let anyOverrideApplied = false;
                    for (const cfgKey in overrideFieldMap) {
                        const overrideVal = config[cfgKey];
                        if (overrideVal === undefined || overrideVal === null || overrideVal === '') continue;
                        const fieldId = `${mode}_${overrideFieldMap[cfgKey]}`;
                        const fieldEl = document.getElementById(fieldId);
                        if (!fieldEl) continue;
                        fieldEl.value = overrideVal;
                        anyOverrideApplied = true;
                        // Refresh the picker trigger overlay for Sampler/Schedule after setting .value.
                        if ((cfgKey === 'overrideSampler' || cfgKey === 'overrideScheduler') && typeof updateModelPickerTriggerText === 'function') {
                            updateModelPickerTriggerText(fieldId);
                        }
                        // Call the CFG field's oninput handler (distilled-model dimming) explicitly.
                        if (cfgKey === 'overrideCfg' && typeof updateNegPromptDimming === 'function') {
                            updateNegPromptDimming(mode);
                        }
                    }
                    if (anyOverrideApplied) {
                        // inp persists through its own live-state system, not saveLiveGenParams() (see LIVE_GEN_PARAM_MODES, defaults.js).
                        if (mode === 'inp') {
                            if (typeof saveCurrentInpaintModeStateLive === 'function') saveCurrentInpaintModeStateLive();
                        } else if (typeof saveLiveGenParams === 'function') {
                            saveLiveGenParams(mode);
                        }
                        if (typeof Toast !== 'undefined') Toast.show({ text: 'LoRA overrides applied', duration: 'short' });
                    }
                }
            }
        };

        // Back on Config at the Restore or Reset button that reloaded the app (backup.js, cfg.js).
        let returnTo = null;
        try { returnTo = sessionStorage.getItem('bojroReturnTo'); sessionStorage.removeItem('bojroReturnTo'); } catch (e) {}
        const returnEl = returnTo && document.querySelector(returnTo);
        if (returnEl) {
            switchTab('cfg');
            const section = returnEl.closest('.cfg-accordion-content');
            if (section && section.classList.contains('hidden')) section.previousElementSibling?.click();
            requestAnimationFrame(() => returnEl.scrollIntoView({ block: 'center', behavior: 'instant' }));
        }

        // --- 15. HANDLE HASH NAVIGATION (Fallback) ---
        const hash = window.location.hash.replace('#', '');
        if (hash && ['gen','inp','que','gal','ana','cfg','comfy'].includes(hash)) {
            setTimeout(() => switchTab(hash), 150);
        }

        // =========================================================================
        // 16. SILENT AUTO-UPDATE CHECK
        // =========================================================================
        setTimeout(async () => {
            // "Update Notifications" off: no automatic update popup or notice board (manual CHECK FOR UPDATES still works).
            if (localStorage.getItem('bojroUpdateNoticesOff') === 'true') {
                console.log("Boot: Update and notice board checks are switched off.");
                return;
            }
            if (typeof checkForAppUpdate === 'function') {
                console.log("Boot: Running silent update check...");
                await checkForAppUpdate(true); // TRUE means "Silent Mode"
            }
            if (typeof checkForNoticeBoard === 'function') {
                console.log("Boot: Checking the notice board...");
                await checkForNoticeBoard();
            }
        }, 3000); // Waits 3 seconds after boot

        console.log("App Initialized Successfully");
        revealApp();
    } catch (e) {
        console.error("Initialization Error:", e);
        revealApp();
        // Falls back to native alert() because the boot sequence's catch-all may run when appAlert()'s script didn't load.
        if (typeof window.appAlert === 'function') {
            window.appAlert("App Init Failed: " + e.message, { title: 'Initialization Failed', danger: true });
        } else {
            alert("App Init Failed: " + e.message);
        }
    }
}


// =========================================================================
// 17. WEBVIEW LIFESAVER (Samsung Workaround - "Heartbeat Edition")
// =========================================================================

// Global audio object
let keepAliveAudio = new Audio('silence.mp3');
keepAliveAudio.loop = true;
keepAliveAudio.volume = 0; // fully silent
// Muted so the WebView doesn't take Android audio focus from other apps while a generation runs.
keepAliveAudio.muted = true;

let isAudioUnlocked = false;
let keepAliveInterval = null; // The handle for our "Heartbeat" timer

// 1. One-time Unlocker
function unlockAudioEngine() {
    if (isAudioUnlocked) return;
    
    keepAliveAudio.play().then(() => {
        keepAliveAudio.pause();
        keepAliveAudio.currentTime = 0;
        isAudioUnlocked = true;
        console.log("[Audio] Engine Unlocked - Ready");
        
        document.removeEventListener('click', unlockAudioEngine);
        document.removeEventListener('touchstart', unlockAudioEngine);
    }).catch(e => {
        console.warn("[Audio] Unlock failed:", e);
    });
}

// 2. The Shield (Now with SELF-HEALING)
window.activateKeepAlive = function() {
    if (!isAudioUnlocked) return;
    
    // Prevent double-activation
    if (keepAliveInterval) return;

    console.log("[Audio] SHIELD ACTIVATED");
    
    // A. Play immediately
    keepAliveAudio.play().catch(e => console.error(e));

    // B. Start the "Heartbeat" (The 5-second recovery rule)
    keepAliveInterval = setInterval(() => {
        if (keepAliveAudio.paused) {
            console.warn("[Audio] Focus lost! Reclaiming...");
            keepAliveAudio.play().catch(e => console.error("Reclaim failed:", e));
        }
    }, 5000); // Check every 5 seconds
}

// 3. The Release
window.deactivateKeepAlive = function() {
    console.log("[Audio] SHIELD DEACTIVATED");
    
    // A. Stop the Heartbeat
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }

    // B. Stop the Audio
    keepAliveAudio.pause();
    keepAliveAudio.currentTime = 0;
}

// Attach Unlocker
document.addEventListener('click', unlockAudioEngine);
document.addEventListener('touchstart', unlockAudioEngine);

// Detect the keyboard closing by the viewport growing back to full height.
if (window.visualViewport) {
    let lastViewportHeight = window.visualViewport.height;
    window.visualViewport.addEventListener('resize', () => {
        const newHeight = window.visualViewport.height;
        const grew = newHeight > lastViewportHeight + 50; // ignore tiny fluctuations
        lastViewportHeight = newHeight;
        if (!grew) return;

        const active = document.activeElement;
        if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
            active.blur();
        }
    });
}

// Drop a field's focus when the app view loses or regains focus without the keyboard, so a later touch can't revive it.
window.addEventListener('blur', () => { if (!isKeyboardUp()) blurActiveTextField(); });
window.addEventListener('focus', () => { if (!isKeyboardUp()) blurActiveTextField(); });
document.addEventListener('touchstart', () => {
    if (!document.hasFocus()) blurActiveTextField();
}, { capture: true, passive: true });

// Hardware back (or the back gesture) closes the topmost open window or selector the same way its own close button does, and only exits the app when nothing is open.
const BACK_CLOSERS = {
    appConfirmModal: () => window.__appConfirmResolve(false),
    wiPwModal: () => document.getElementById('wiPwCancel')?.click(),
    noticeBoardModal: () => document.getElementById('noticeBoardDismiss')?.click(),
    batteryModal: () => window.skipBatteryPerm && window.skipBatteryPerm(),
    'saac-img-modal': () => window.SaacManager.closeImage(),
    lpFullscreen: () => window.closeLivePreviewFullscreen(),
    autoDeleteModal: () => window.answerAutoDelete(false),
    thumbMenu: () => window.LoraVariants.closeThumbMenu(),
    // A nested wildcard: back a level; else closed, as CANCEL.
    wcEditorModal: () => window.Wildcards.closeX({ isTrusted: false }),
};

// Tapping outside these windows closes them, as their × does. The tap must start and end outside, so a drag that ends
// there (the scroll bar, selecting text) doesn't. The Auto-Delete Warning deliberately has no such close.
const BACKDROP_CLOSERS = {
    checkpointManagerModal: () => window.closeCheckpointManager(),
    img2imgPresetModal: () => window.closeImg2imgPresetModal(),
    loraModal: () => window.closeLoraModal(),
    saacModal: () => window.SaacManager.close(),
    styleModal: () => window.closeStyleModal(),
    dataUsageModal: () => window.closeDataUsageHistory(),
    debugLogModal: () => window.closeDebugLog(),
};
// Other windows close as back closes them (closeOverlay()); not Crop & Edit, the viewers or the Auto-Delete Warning.
const BACKDROP_SKIP = ['editorModal', 'fullScreenModal', 'lpFullscreen', 'autoDeleteModal'];
document.querySelectorAll('.modal').forEach(el => {
    if (!el.id || BACKDROP_SKIP.includes(el.id) || BACKDROP_CLOSERS[el.id]) return;
    BACKDROP_CLOSERS[el.id] = () => window.closeOverlay(el);
});
Object.entries(BACKDROP_CLOSERS).forEach(([id, close]) => {
    const el = document.getElementById(id);
    if (!el) return;
    let downOnBackdrop = false;
    el.addEventListener('pointerdown', e => { downOnBackdrop = e.target === el; });
    el.addEventListener('click', e => {
        if (downOnBackdrop && e.target === el) close();
        downOnBackdrop = false;
    });
});

// A touch held past Android's long-press time (about half a second) doesn't produce a click in the WebView, so a button
// held and then let go did nothing. As a native button does, it now fires on release if the finger is still on it and
// hasn't moved. Only for buttons, the dock and other tappable controls (not images, which can have their own long-press
// action, inputs, the canvas or text, which keeps its selection). The click goes to what was touched, so holding inside a
// window can't close it the way a tap on its backdrop does; if the WebView does send the click, nothing more is sent.
;(function () {
    const TAPPABLE = 'button, .dock-item, [role="button"], [onclick]:not(.modal)';
    const SKIP = 'img, input, textarea, select, canvas, [contenteditable="true"]';
    const HOLD_MS = 400, SLOP = 12;
    let press = null;
    document.addEventListener('pointerdown', e => {
        press = null;
        if (e.pointerType !== 'touch' || !e.isPrimary || !e.target.closest) return;
        const el = e.target.closest(TAPPABLE);
        if (!el || el.disabled || e.target.closest(SKIP)) return;
        press = { el, target: e.target, x: e.clientX, y: e.clientY, t: performance.now(), clicked: false };
    }, true);
    document.addEventListener('pointermove', e => {
        if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) press = null;
    }, true);
    document.addEventListener('pointercancel', () => { press = null; }, true);
    document.addEventListener('click', () => { if (press) press.clicked = true; }, true);
    // No context menu or text selection for a held control.
    document.addEventListener('contextmenu', e => { if (press) e.preventDefault(); }, true);
    document.addEventListener('pointerup', e => {
        const p = press;
        if (!p || performance.now() - p.t < HOLD_MS) return;
        const under = document.elementFromPoint(e.clientX, e.clientY);
        if (!under || !p.el.contains(under)) { press = null; return; }
        setTimeout(() => {
            if (press === p) press = null;
            if (p.clicked || !p.target.isConnected || p.el.disabled) return;
            p.target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: e.clientX, clientY: e.clientY }));
        }, 60);
    }, true);
})();

// After a swipe in a full-screen viewer, the WebView's invisible fling swallows the next tap for up to a second.
// A tap on a viewer's control that gets no click is clicked here. Not elsewhere, where a tap should only stop a scroll.
;(function () {
    const VIEWERS = '#fullScreenModal, #lpFullscreen, #saac-img-modal';
    const TAPPABLE = 'button, [onclick]';
    const HOLD_MS = 400, SLOP = 12;
    let tap = null;
    document.addEventListener('pointerdown', e => {
        tap = null;
        if (e.pointerType !== 'touch' || !e.isPrimary || !e.target.closest) return;
        const viewer = e.target.closest(VIEWERS);
        const el = viewer && e.target.closest(TAPPABLE);
        if (!el || !viewer.contains(el) || el.disabled) return;
        tap = { el, target: e.target, x: e.clientX, y: e.clientY, t: performance.now(), clicked: false };
    }, true);
    document.addEventListener('pointermove', e => {
        if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > SLOP) tap = null;
    }, true);
    document.addEventListener('pointercancel', () => { tap = null; }, true);
    document.addEventListener('click', () => { if (tap) tap.clicked = true; }, true);
    document.addEventListener('pointerup', e => {
        const t = tap;
        if (!t || !e.isPrimary || performance.now() - t.t >= HOLD_MS) return;
        const under = document.elementFromPoint(e.clientX, e.clientY);
        if (!under || !t.el.contains(under)) { tap = null; return; }
        setTimeout(() => {
            if (tap === t) tap = null;
            if (t.clicked || !t.target.isConnected || t.el.disabled) return;
            t.target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: e.clientX, clientY: e.clientY }));
        }, 80);
    }, true);
})();

function topmostOverlay() {
    const open = [...document.querySelectorAll('.modal:not(.hidden), #saac-img-modal.active')]
        .filter(el => el.getClientRects().length && getComputedStyle(el).display !== 'none');
    if (!open.length) return null;
    const z = el => parseInt(getComputedStyle(el).zIndex, 10) || 0;
    // Highest layer wins; on the same layer, the later one in the page sits on top.
    return open.reduce((top, el) => (z(el) > z(top) || (z(el) === z(top) && (top.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING))) ? el : top);
}

window.closeTopmostOverlay = function() {
    const el = topmostOverlay();
    if (!el) return typeof window.closeAnaStickyMenu === 'function' && window.closeAnaStickyMenu();
    return window.closeOverlay(el);
};
// Closes one window as its own close / cancel would.
window.closeOverlay = function(el) {
    if (BACK_CLOSERS[el.id]) {
        BACK_CLOSERS[el.id]();
        return true;
    }
    const btn = el.querySelector('.close-btn')
        || [...el.querySelectorAll('button[onclick]')].find(b => /close|classList\.add\('hidden'\)/i.test(b.getAttribute('onclick')));
    if (btn) btn.click();
    else el.classList.add('hidden');
    return true;
};

// Two back presses to exit. Closing a window or leaving a text box doesn't count.
const EXIT_WINDOW_MS = 2500;
let exitArmedUntil = 0;
function blurFocusedTextEntry() {
    const el = document.activeElement;
    if (!el) return false;
    const isText = el.tagName === 'TEXTAREA' || el.isContentEditable
        || (el.tagName === 'INPUT' && /^(text|search|number|email|url|password|tel)$/i.test(el.type || 'text'));
    if (!isText) return false;
    el.blur();
    return true;
}
window.handleBackPress = function() {
    if (window.closeTopmostOverlay() || blurFocusedTextEntry()) {
        exitArmedUntil = 0;
        return 'handled';
    }
    // History's selection mode.
    if (typeof isSelectionMode !== 'undefined' && isSelectionMode && typeof toggleGallerySelectionMode === 'function') {
        toggleGallerySelectionMode();
        exitArmedUntil = 0;
        return 'handled';
    }
    if (typeof isComfyMaskingMode !== 'undefined' && isComfyMaskingMode && typeof cancelComfyMasking === 'function') {
        cancelComfyMasking();
        exitArmedUntil = 0;
        return 'handled';
    }
    if (Date.now() < exitArmedUntil) {
        if (App) App.exitApp();
        return 'exit';
    }
    exitArmedUntil = Date.now() + EXIT_WINDOW_MS;
    Toast.show({ text: 'Back again to exit', duration: 'short' });
    return 'armed';
};
if (App) App.addListener('backButton', () => window.handleBackPress());