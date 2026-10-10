// -----------------------------------------------------------
// IMAGE EDITOR LOGIC (CROPPER & TRANSFORM)
// -----------------------------------------------------------

// Hint under the Denoising slider showing the effective step count (Forge uses min(denoising, 0.999), so 1.0 shows the full count).
window.updateDenoiseStepHint = function() {
    const hint = document.getElementById('denoiseStepHint');
    if (!hint) return;
    const steps = parseInt(document.getElementById('inp_steps')?.value) || 0;
    const denoise = parseFloat(document.getElementById('denoisingStrength')?.value);
    if (!steps || isNaN(denoise)) { hint.textContent = ''; return; }
    const effective = Math.floor(Math.min(denoise, 0.999) * steps) + 1;
    hint.textContent = effective >= steps
        ? `All ${steps} steps will run`
        : `${steps} steps set \u2192 ~${effective} will actually run`;
}

// The main tabs' 1MP/2MP aspect ratio presets (index.html resGrid), stored in landscape form; portraitLabel is the same ratio the other way round. Sides are multiples of 8 (Forge rounds down otherwise); the revised exact-ratio sizes are kept identical to those grids.
const EDITOR_RATIO_PRESETS_1MP = [
    { w: 1024, h: 1024, landscapeLabel: '1:1', portraitLabel: '1:1' },
    { w: 1152, h: 768, landscapeLabel: '3:2', portraitLabel: '2:3' },
    { w: 1184, h: 888, landscapeLabel: '4:3', portraitLabel: '3:4' },
    { w: 1368, h: 768, landscapeLabel: '16:9', portraitLabel: '9:16' }
];
const EDITOR_RATIO_PRESETS_2MP = [
    { w: 1448, h: 1448, landscapeLabel: '1:1', portraitLabel: '1:1' },
    { w: 1776, h: 1184, landscapeLabel: '3:2', portraitLabel: '2:3' },
    { w: 1536, h: 1152, landscapeLabel: '4:3', portraitLabel: '3:4' },
    { w: 2048, h: 1152, landscapeLabel: '16:9', portraitLabel: '9:16' }
];

// 'landscape' or 'portrait': which form the preset buttons show. Set from the image's orientation, toggleable with the swap button.
let editorPresetOrientation = 'landscape';

// Highlights the preset matching the active crop (none when it matches no fixed preset; FIT TO IMAGE has its own indicator).
function renderEditorRatioPresets() {
    const c1 = document.getElementById('editorRatios1mp');
    const c2 = document.getElementById('editorRatios2mp');
    if (!c1 || !c2) return;
    const isPortrait = editorPresetOrientation === 'portrait';
    const build = (presets) => presets.map(p => {
        const w = isPortrait ? p.h : p.w;
        const h = isPortrait ? p.w : p.h;
        const label = isPortrait ? p.portraitLabel : p.landscapeLabel;
        const isActive = w === editorTargetW && h === editorTargetH;
        const style = isActive ? ' style="border-color: var(--accent-primary); color: var(--accent-primary);"' : '';
        return `<button class="btn-small"${style} onclick="setEditorRatio(${w},${h})">${label}</button>`;
    }).join('');
    c1.innerHTML = build(EDITOR_RATIO_PRESETS_1MP);
    c2.innerHTML = build(EDITOR_RATIO_PRESETS_2MP);
}

// Flips the preset button orientation and the active crop (via setEditorRatio()), swapping editorTargetW/H. Mirrors flipRes().
window.flipEditorOrientation = function() {
    editorPresetOrientation = editorPresetOrientation === 'landscape' ? 'portrait' : 'landscape';
    renderEditorRatioPresets();

    if (editorTargetW && editorTargetH) {
        setEditorRatio(editorTargetH, editorTargetW);
    }
}

// Called once per image load: default the preset buttons to the image's shape.
function detectAndSetEditorOrientation(img) {
    editorPresetOrientation = img.naturalHeight > img.naturalWidth ? 'portrait' : 'landscape';
    renderEditorRatioPresets();
}

// Halfway between the two tiers' 1:1 preset areas; decides which label highlightEditorMpLabel colours.
const EDITOR_MP_TIER_MIDPOINT = (1024 * 1024 + 1448 * 1448) / 2;

// Highlights "1MP Presets" or "2MP Presets", whichever the image's resolution is closer to.
function highlightEditorMpLabel(img) {
    const label1mp = document.getElementById('editorLabel1mp');
    const label2mp = document.getElementById('editorLabel2mp');
    if (!label1mp || !label2mp) return;
    const area = img.naturalWidth * img.naturalHeight;
    const isCloserTo2MP = area >= EDITOR_MP_TIER_MIDPOINT;
    label1mp.style.color = isCloserTo2MP ? '#777' : 'var(--accent-primary)';
    label2mp.style.color = isCloserTo2MP ? 'var(--accent-primary)' : '#777';
}

// Applies the toggle button's appearance for confineToImageEnabled (shared by resetConfineToImageState() and toggleConfineToImage()).
function updateConfineToImageButtonAppearance() {
    const btn = document.getElementById('confineToImageBtn');
    if (!btn) return;
    btn.style.borderColor = confineToImageEnabled ? 'var(--accent-primary)' : 'var(--border-color)';
    btn.style.color = confineToImageEnabled ? 'var(--accent-primary)' : 'var(--text-main)';
    btn.style.background = confineToImageEnabled ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'var(--btn-bg)';
    // Rebuilt from scratch because lucide.createIcons() replaces the <i data-lucide> with an <svg>.
    btn.innerHTML = `<i data-lucide="${confineToImageEnabled ? 'lock' : 'lock-open'}" size="16"></i>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Resets confineToImageEnabled to on for every newly loaded image.
function resetConfineToImageState() {
    confineToImageEnabled = true;
    updateConfineToImageButtonAppearance();
}

function setupEditorEvents() {
    const cvs = document.getElementById('editorCanvas');
    if (!cvs) return;

    cvs.style.touchAction = 'none';

    // Touch
    cvs.addEventListener('touchstart', handleTouchStart, {
        passive: false
    });
    cvs.addEventListener('touchmove', handleTouchMove, {
        passive: false
    });
    cvs.addEventListener('touchend', handleTouchEnd);
    // The browser can cancel a touch sequence without touchend; reuse handleTouchEnd() to reset the gesture state.
    cvs.addEventListener('touchcancel', handleTouchEnd, {
        passive: false
    });

    // Mouse
    cvs.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}

window.openEditorFromFile = function(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Read the original file's embedded prompt/negative now, since PROCEED re-encodes the image and drops PNG text chunks (see inpSourceMetadata, globals.js). Held as a pending promise and committed by applyEditorChanges(), so backing out leaves the loaded image's metadata alone.
    editorPendingMetadataPromise = readImportablePromptsFromBlob(file);

    // Opened immediately, before the file is read (as editCurrentFs(), engine.js), so the underlying page can't flash.
    const editorCanvasEl = document.getElementById('editorCanvas');
    editorCanvasEl?.getContext('2d')?.clearRect(0, 0, editorCanvasEl.width, editorCanvasEl.height);
    document.getElementById('editorModal').classList.remove('hidden');

    const reader = new FileReader();
    reader.onload = (evt) => {
        const img = new Image();
        img.src = evt.target.result;
        img.onload = () => {
            editorImage = img;
            // Synchronous placeholder matching this image's shape, before anything renders.
            editorTargetW = img.naturalWidth;
            editorTargetH = img.naturalHeight;
            detectAndSetEditorOrientation(img);
            highlightEditorMpLabel(img);
            resetConfineToImageState();

            // 2. Wait for layout (double rAF), then fit the crop box to the image's aspect ratio rather than 1:1. editorTargetW/H are global and don't reset between images.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    fitEditorToImage();
                });
            });
        };
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

// Snaps the crop box to the image's aspect ratio and resolution. Extracted so matchesFitToImageState() uses the same target dimensions.
function computeFitToImageTargetDims() {
    const nativeRatio = editorImage.naturalWidth / editorImage.naturalHeight;

    // Scales to the source image's resolution (not a fixed ~1MP) to keep detail.
    const targetArea = editorImage.naturalWidth * editorImage.naturalHeight;
    let w = Math.sqrt(targetArea * nativeRatio);
    let h = Math.sqrt(targetArea / nativeRatio);

    w = Math.max(8, Math.round(w / 8) * 8);
    h = Math.max(8, Math.round(h / 8) * 8);
    return { w, h };
}

window.fitEditorToImage = function() {
    if (!editorImage) return;
    const { w, h } = computeFitToImageTargetDims();

    setEditorRatio(w, h);
    // setEditorRatio() cleared this; set it back for this path.
    isFitToImageActive = true;
    updateFitToImageButtonAppearance();
}

// isFitToImageActive: the crop still represents the whole image; cleared by anything that moves away from it.
window.setEditorRatio = function(targetW, targetH) {
    editorTargetW = targetW;
    editorTargetH = targetH;
    isFitToImageActive = false;
    updateFitToImageButtonAppearance();
    renderEditorRatioPresets();
    updateEditorResolutionReadout();
    recalcEditorLayout();
    resetEditorView();
}

// Live readout of the resolution that will be sent (pinch-zoom-only cropping sends the native resolution). Hooked into setEditorRatio(), which every preset/FIT TO IMAGE/flip goes through.
function updateEditorResolutionReadout() {
    const el = document.getElementById('editorResolutionReadout');
    if (el) el.textContent = `${editorTargetW} × ${editorTargetH}`;
}

function recalcEditorLayout() {
    if (!editorImage) return;
    const viewport = document.getElementById('editorViewport');
    const cvs = document.getElementById('editorCanvas');

    // 1. Resize canvas to match screen
    cvs.width = viewport.clientWidth;
    cvs.height = viewport.clientHeight;

    // 2. Calculate Box Size (fit within canvas with padding)
    const padding = 20;
    const availableW = cvs.width - (padding * 2);
    const availableH = cvs.height - (padding * 2);

    const targetRatio = editorTargetW / editorTargetH;

    let boxW = availableW;
    let boxH = boxW / targetRatio;

    if (boxH > availableH) {
        boxH = availableH;
        boxW = boxH * targetRatio;
    }

    // 3. Center the box
    cropBox = {
        x: (cvs.width - boxW) / 2,
        y: (cvs.height - boxH) / 2,
        w: boxW,
        h: boxH
    };

    drawEditor();
}

function resetEditorView() {
    if (!editorImage) return;

    // Calculate min scale to cover the crop box
    const scaleW = cropBox.w / editorImage.naturalWidth;
    const scaleH = cropBox.h / editorImage.naturalHeight;
    editorMinScale = Math.max(scaleW, scaleH);

    // Set current scale to min (cover)
    editorScale = editorMinScale;

    // Center image relative to the CANVAS center
    editorTranslateX = (document.getElementById('editorCanvas').width - (editorImage.naturalWidth * editorScale)) / 2;
    editorTranslateY = (document.getElementById('editorCanvas').height - (editorImage.naturalHeight * editorScale)) / 2;

    // Reset Sliders (guarded: the Scale/X/Y sliders were removed from the UI).
    const scaleEl = document.getElementById('editScale');
    const xEl = document.getElementById('editX');
    const yEl = document.getElementById('editY');
    if (scaleEl) scaleEl.value = 1;
    if (xEl) xEl.value = 0;
    if (yEl) yEl.value = 0;

    drawEditor();
}

// Prevents zooming past native resolution (scale=1), regardless of confineToImageEnabled. When confine is on, editorMinScale (cover) wins if the crop box is larger than the image.
function clampEditorScale(scale) {
    let s = Math.min(scale, 1);
    if (confineToImageEnabled) s = Math.max(s, editorMinScale);
    return s;
}

// With confine on, clamps translation so the image always fully contains the crop box.
function clampEditorTransform() {
    if (!editorImage) return;

    editorScale = clampEditorScale(editorScale);

    if (!confineToImageEnabled) return;

    const imgW = editorImage.naturalWidth * editorScale;
    const imgH = editorImage.naturalHeight * editorScale;

    // maxX/maxY: the image's left/top edge can't pass the crop box's. minX/minY: its right/bottom edge must reach the crop box's. No validity guard: Math.min/Math.max handle floating-point drift at editorMinScale.
    const minX = cropBox.x + cropBox.w - imgW;
    const maxX = cropBox.x;
    editorTranslateX = Math.min(maxX, Math.max(editorTranslateX, minX));

    const minY = cropBox.y + cropBox.h - imgH;
    const maxY = cropBox.y;
    editorTranslateY = Math.min(maxY, Math.max(editorTranslateY, minY));
}

// FIT TO IMAGE button accent shows only while the crop represents the whole image.
function updateFitToImageButtonAppearance() {
    const btn = document.getElementById('fitToImageBtn');
    if (!btn) return;
    btn.style.borderColor = isFitToImageActive ? 'var(--accent-primary)' : 'var(--border-color)';
    btn.style.color = isFitToImageActive ? 'var(--accent-primary)' : 'var(--text-main)';
}

// Threshold for a gesture that actually moved the crop, above floating-point noise from clampEditorTransform().
const FIT_TO_IMAGE_CHANGE_EPSILON = 0.01;

// Whether pan/zoom exactly matches what fitEditorToImage() would produce (target dimensions and centred position), using computeFitToImageTargetDims().
function matchesFitToImageState() {
    if (!editorImage) return false;

    const { w: fitW, h: fitH } = computeFitToImageTargetDims();
    // Both are rounded integers (multiples of 8), so an exact comparison.
    if (editorTargetW !== fitW || editorTargetH !== fitH) return false;

    const scaleW = cropBox.w / editorImage.naturalWidth;
    const scaleH = cropBox.h / editorImage.naturalHeight;
    const fitScale = Math.max(scaleW, scaleH);
    const cvs = getEditorCanvasEl();
    const fitTranslateX = (cvs.width - (editorImage.naturalWidth * fitScale)) / 2;
    const fitTranslateY = (cvs.height - (editorImage.naturalHeight * fitScale)) / 2;

    return Math.abs(editorScale - fitScale) <= FIT_TO_IMAGE_CHANGE_EPSILON &&
           Math.abs(editorTranslateX - fitTranslateX) <= FIT_TO_IMAGE_CHANGE_EPSILON &&
           Math.abs(editorTranslateY - fitTranslateY) <= FIT_TO_IMAGE_CHANGE_EPSILON;
}

// Re-derives isFitToImageActive on every pan/zoom, so zooming back to the fit position restores the highlight.
function clearFitToImageStateIfActive() {
    const matches = matchesFitToImageState();
    if (matches !== isFitToImageActive) {
        isFitToImageActive = matches;
        updateFitToImageButtonAppearance();
    }
}

// Toggles confineToImageEnabled and the button; re-clamps immediately when turned on.
window.toggleConfineToImage = function() {
    confineToImageEnabled = !confineToImageEnabled;
    updateConfineToImageButtonAppearance();
    if (confineToImageEnabled) {
        clampEditorTransform();
        drawEditor();
    }
}

// editorCanvas is static; cache it instead of re-querying during gestures.
let _editorCanvasElCache = null;
let _editorCanvasCtxCache = null;
function getEditorCanvasEl() {
    if (!_editorCanvasElCache) {
        _editorCanvasElCache = document.getElementById('editorCanvas');
    }
    return _editorCanvasElCache;
}
function drawEditor() {
    if (!editorImage) return;
    const cvs = getEditorCanvasEl();
    if (!_editorCanvasCtxCache) {
        _editorCanvasCtxCache = cvs.getContext('2d');
    }
    const ctx = _editorCanvasCtxCache;

    // 1. Clear
    ctx.clearRect(0, 0, cvs.width, cvs.height);

    // 2. Draw Image (Transformed)
    ctx.save();
    ctx.translate(editorTranslateX, editorTranslateY);
    ctx.scale(editorScale, editorScale);
    ctx.drawImage(editorImage, 0, 0);
    ctx.restore();

    // 3. Draw Dimmed Overlay with "Hole" using Path Winding
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    // Outer Rectangle (Clockwise)
    ctx.rect(0, 0, cvs.width, cvs.height);
    // Inner Rectangle (Counter-Clockwise) -> Creates Hole
    ctx.rect(cropBox.x + cropBox.w, cropBox.y, -cropBox.w, cropBox.h);
    ctx.fill();

    // 4. Draw Border
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.strokeRect(cropBox.x, cropBox.y, cropBox.w, cropBox.h);
}

// Touch Handling (Gestures)
function handleTouchStart(e) {
    if (e.target.closest('input')) return;
    e.preventDefault();
    if (e.touches.length === 2) {
        pinchStartDist = getDist(e.touches[0], e.touches[1]);
        startScale = editorScale;
        startTranslate = {
            x: editorTranslateX,
            y: editorTranslateY
        };
    } else if (e.touches.length === 1) {
        const t = e.touches[0];
        const now = Date.now();
        const dx = t.clientX - editorLastTapX, dy = t.clientY - editorLastTapY;
        const isDoubleTap = (now - editorLastTapTime < EDITOR_DOUBLE_TAP_MAX_DELAY) && Math.sqrt(dx * dx + dy * dy) < EDITOR_DOUBLE_TAP_MAX_DIST;
        editorLastTapTime = now;
        editorLastTapX = t.clientX;
        editorLastTapY = t.clientY;

        if (isDoubleTap) {
            editorLastTapTime = 0; // consumed - don't chain into a 3rd-tap toggle
            const cvs = getEditorCanvasEl();
            const rect = cvs.getBoundingClientRect();
            const scaleX = cvs.width / rect.width;
            const scaleY = cvs.height / rect.height;
            const tapX = (t.clientX - rect.left) * scaleX;
            const tapY = (t.clientY - rect.top) * scaleY;

            // Toggles between fully zoomed out (editorMinScale) and 100% (editorMaxScale, which equals editorMinScale if the crop box is larger than the source).
            const editorMaxScale = Math.max(editorMinScale, 1);
            const isNearMax = editorScale >= editorMaxScale - FIT_TO_IMAGE_CHANGE_EPSILON;
            const newScale = isNearMax ? editorMinScale : editorMaxScale;
            const scaleFactor = newScale / editorScale;

            // Anchors the zoom at the tapped point (same formula as the pinch handler).
            editorScale = newScale;
            editorTranslateX = tapX - (tapX - editorTranslateX) * scaleFactor;
            editorTranslateY = tapY - (tapY - editorTranslateY) * scaleFactor;
            clampEditorTransform();
            clearFitToImageStateIfActive();
            drawEditor();
            return; // don't also start a pan gesture from this same touch
        }

        isEditorActive = true;
        panStart = {
            x: t.clientX,
            y: t.clientY
        };
        startTranslate = {
            x: editorTranslateX,
            y: editorTranslateY
        };
    }
}

function handleTouchMove(e) {
    if (e.target.closest('input')) return;
    e.preventDefault();
    if (e.touches.length === 2 && pinchStartDist > 0) {
        const dist = getDist(e.touches[0], e.touches[1]);
        const scaleFactor = dist / pinchStartDist;
        // Clamp the proposed scale before the zoom-around-centre translation maths, so pinching past the cap doesn't slide the image.
        const clampedScale = clampEditorScale(startScale * scaleFactor);
        const effectiveScaleFactor = clampedScale / startScale;
        const prevScale = editorScale, prevX = editorTranslateX, prevY = editorTranslateY;
        editorScale = clampedScale;

        const cvs = getEditorCanvasEl();
        const centerX = cvs.width / 2;
        const centerY = cvs.height / 2;
        editorTranslateX = centerX - (centerX - startTranslate.x) * effectiveScaleFactor;
        editorTranslateY = centerY - (centerY - startTranslate.y) * effectiveScaleFactor;
        clampEditorTransform();
        // Only clears if the crop actually changed (tolerance, see the 1-finger pan branch below).
        if (Math.abs(editorScale - prevScale) > FIT_TO_IMAGE_CHANGE_EPSILON ||
            Math.abs(editorTranslateX - prevX) > FIT_TO_IMAGE_CHANGE_EPSILON ||
            Math.abs(editorTranslateY - prevY) > FIT_TO_IMAGE_CHANGE_EPSILON) {
            clearFitToImageStateIfActive();
        }
        drawEditor();
    } else if (e.touches.length === 1 && isEditorActive) {
        const dx = e.touches[0].clientX - panStart.x;
        const dy = e.touches[0].clientY - panStart.y;
        const prevX = editorTranslateX, prevY = editorTranslateY;
        editorTranslateX = startTranslate.x + dx;
        editorTranslateY = startTranslate.y + dy;
        clampEditorTransform();
        // Clear the FIT TO IMAGE highlight only if position changed beyond a floating-point tolerance (clamping can drift ~1e-13px even on a stationary tap).
        if (Math.abs(editorTranslateX - prevX) > FIT_TO_IMAGE_CHANGE_EPSILON ||
            Math.abs(editorTranslateY - prevY) > FIT_TO_IMAGE_CHANGE_EPSILON) {
            clearFitToImageStateIfActive();
        }
        drawEditor();
    }
}

function handleTouchEnd() {
    isEditorActive = false;
    pinchStartDist = 0;
}

function handleMouseDown(e) {
    isEditorActive = true;
    panStart = {
        x: e.clientX,
        y: e.clientY
    };
    startTranslate = {
        x: editorTranslateX,
        y: editorTranslateY
    };
}

function handleMouseMove(e) {
    if (!isEditorActive) return;
    e.preventDefault();
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    const prevX = editorTranslateX, prevY = editorTranslateY;
    editorTranslateX = startTranslate.x + dx;
    editorTranslateY = startTranslate.y + dy;
    clampEditorTransform();
    // Same tolerance as the touch pan handler above.
    if (Math.abs(editorTranslateX - prevX) > FIT_TO_IMAGE_CHANGE_EPSILON ||
        Math.abs(editorTranslateY - prevY) > FIT_TO_IMAGE_CHANGE_EPSILON) {
        clearFitToImageStateIfActive();
    }
    drawEditor();
}

function handleMouseUp() {
    isEditorActive = false;
}

function getDist(t1, t2) {
    return Math.sqrt(Math.pow(t1.clientX - t2.clientX, 2) + Math.pow(t1.clientY - t2.clientY, 2));
}

window.applyEditorChanges = async function() {
    // toDataURL('image/png') is synchronous and freezes the UI, so show feedback on tap, use toBlob() and read it back into the data-URL format downstream code expects.
    const proceedBtn = document.getElementById('editorProceedBtn');
    const originalBtnText = proceedBtn ? proceedBtn.textContent : '';
    if (proceedBtn) {
        proceedBtn.textContent = 'PROCESSING...';
        proceedBtn.disabled = true;
    }

    try {
        const finalCvs = document.createElement('canvas');
        finalCvs.width = editorTargetW;
        finalCvs.height = editorTargetH;
        const ctx = finalCvs.getContext('2d');

        // Map visual crop box coords to image coords
        const relX = cropBox.x - editorTranslateX;
        const relY = cropBox.y - editorTranslateY;

        const sourceX = relX / editorScale;
        const sourceY = relY / editorScale;
        const sourceW = cropBox.w / editorScale;
        const sourceH = cropBox.h / editorScale;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(editorImage, sourceX, sourceY, sourceW, sourceH, 0, 0, editorTargetW, editorTargetH);

        const blob = await new Promise(resolve => finalCvs.toBlob(resolve, 'image/png'));
        sourceImageB64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
        // Commit the metadata captured when this image entered the editor (inpSourceMetadata, globals.js) together with its image. Unconditional, so a path that captured none leaves null rather than the previous image's prompts. Awaited, since the read is async.
        inpSourceMetadata = editorPendingMetadataPromise ? await editorPendingMetadataPromise : null;
        editorPendingMetadataPromise = null;
    } finally {
        if (proceedBtn) {
            proceedBtn.textContent = originalBtnText;
            proceedBtn.disabled = false;
        }
    }

    resetInpaintCanvas();

    // As clearInpaintImage(): any uploaded ControlNet image was for the previous image.
    if (typeof clearControlNetImage === 'function') {
        ['inp', 'img2img'].forEach(mode => {
            for (let u = 0; u <= 2; u++) clearControlNetImage(mode, u);
        });
    }

    // classList, not inline style (a leftover inline display:none would override classList.remove('hidden')).
    document.getElementById('img-input-container').classList.add('hidden');
    document.getElementById('editorModal').classList.add('hidden');
    document.getElementById('inpTopModeSwitcher').classList.remove('hidden');

    // Re-applies visibility for the active mode via setInpaintTopMode(), which shows exactly one of canvasWrapper/upscaleWrapper.
    if (typeof setInpaintTopMode === 'function' && typeof currentInpaintTopMode !== 'undefined') {
        setInpaintTopMode(currentInpaintTopMode);
    } else {
        document.getElementById('canvasWrapper').classList.remove('hidden');
        // This fallback bypasses setInpaintTopMode()'s own sync (THUMB_ONLY_SLIDER_IDS), so repeat it for Brush Size.
        if (typeof syncThumbOnlySliderPosition === 'function') syncThumbOnlySliderPosition('brushSize');
        if (typeof updateInpResultsAreaVisibility === 'function') updateInpResultsAreaVisibility();
    }

    // The editor modal overlays the page, so scroll to the top on every completed crop.
    window.scrollTo(0, 0);

    // currentMode and currentTask are separate state: only run this for the main tabs' crop-before-generating flow. Inpaint/img2img read editorTargetW/H directly.
    if (currentTask !== 'inp') {
        const mode = currentMode;
        document.getElementById(`${mode}_width`).value = editorTargetW;
        document.getElementById(`${mode}_height`).value = editorTargetH;
        // Direct .value assignment fires no event; update the res-switch highlight.
        if (typeof updateResSwitchHighlight === 'function') updateResSwitchHighlight(mode);
    }
}

window.closeEditor = () => document.getElementById('editorModal').classList.add('hidden');

// -----------------------------------------------------------
// INPAINTING CANVAS LOGIC (DRAWING/MASKING)
// -----------------------------------------------------------

// Native scroll works in img2img (no mask painting) but touches stay captured in Inpaint. Called from initMainCanvas() and setInpaintTopMode().
function updateCanvasTouchBehavior() {
    if (!mainCanvas) return;
    mainCanvas.style.touchAction = (currentInpaintTopMode === 'img2img') ? 'pan-y' : 'none';
}

// The reset-zoom button is visible only once zoomed in.
function updatePaintResetZoomButtonVisibility() {
    const btn = document.getElementById('paintResetZoomBtn');
    if (btn) btn.classList.toggle('hidden', paintZoomScale <= PAINT_MIN_ZOOM);
}

// Keeps pinch-zoomed panning from showing empty space (like the crop editor's confine clamp). Padding is cached (getComputedStyle() is expensive); sizes are read fresh.
let _paintWrapperPaddingCache = null;
function clampPaintTransform() {
    paintZoomScale = Math.min(PAINT_MAX_ZOOM, Math.max(PAINT_MIN_ZOOM, paintZoomScale));
    if (!mainCanvas || !mainCanvas.parentElement || !mainCanvas.width || !mainCanvas.height) return;

    const wrapper = mainCanvas.parentElement;
    if (!_paintWrapperPaddingCache) {
        const wrapperStyle = getComputedStyle(wrapper);
        // Only X padding is used: viewportH is derived from viewportW's aspect ratio.
        _paintWrapperPaddingCache = parseFloat(wrapperStyle.paddingLeft) + parseFloat(wrapperStyle.paddingRight);
    }
    const paddingX = _paintWrapperPaddingCache;

    const viewportW = wrapper.clientWidth - paddingX;
    const viewportH = viewportW * (mainCanvas.height / mainCanvas.width);

    const scaledW = viewportW * paintZoomScale;
    const scaledH = viewportH * paintZoomScale;

    const maxX = Math.max(0, (scaledW - viewportW) / 2);
    const maxY = Math.max(0, (scaledH - viewportH) / 2);

    paintTranslateX = Math.min(maxX, Math.max(-maxX, paintTranslateX));
    paintTranslateY = Math.min(maxY, Math.max(-maxY, paintTranslateY));
}

// scale() after translate() makes paintTranslateX/Y plain on-screen pixel offsets, independent of zoom.
function applyPaintTransform() {
    if (!mainCanvas) return;
    mainCanvas.style.transform = `translate(${paintTranslateX}px, ${paintTranslateY}px) scale(${paintZoomScale})`;
    updatePaintResetZoomButtonVisibility();
}

window.resetPaintZoom = function() {
    paintZoomScale = 1;
    paintTranslateX = 0;
    paintTranslateY = 0;
    applyPaintTransform();
}

function getPaintTouchDist(t1, t2) {
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
}

function initMainCanvas() {
    mainCanvas = document.getElementById('paintCanvas');
    if (!mainCanvas) return;
    mainCtx = mainCanvas.getContext('2d');
    maskCanvas = document.createElement('canvas');
    maskCtx = maskCanvas.getContext('2d');
    // Created alongside maskCanvas (see painting()).
    strokeLayerCanvas = document.createElement('canvas');
    strokeLayerCtx = strokeLayerCanvas.getContext('2d');
    // Same pattern, separate purpose (see globals.js).
    inpaintModeSwitchSnapshot = document.createElement('canvas');
    inpaintModeSwitchSnapshotCtx = inpaintModeSwitchSnapshot.getContext('2d');
    inpaintModeSwitchMaskSnapshot = document.createElement('canvas');
    inpaintModeSwitchMaskSnapshotCtx = inpaintModeSwitchMaskSnapshot.getContext('2d');

    updateCanvasTouchBehavior();

    mainCanvas.addEventListener('touchstart', (e) => {
        // Let native scroll handle it (see updateCanvasTouchBehavior()).
        if (currentInpaintTopMode === 'img2img') return;
        e.preventDefault();
        blurActiveTextField();
        if (e.touches.length === 2) {
            // A pending single-finger paint with a second finger arriving was a pinch: discard it.
            if (pendingPaintTimer) {
                clearTimeout(pendingPaintTimer);
                pendingPaintTimer = null;
                pendingPaintTouch = null;
            }
            // A second finger mid-stroke means a pinch: cancel the stroke rather than drawing a stray line.
            if (isDrawing) stopPaint();
            paintPinchStartDist = getPaintTouchDist(e.touches[0], e.touches[1]);
            paintPinchStartScale = paintZoomScale;
            paintPinchStartTranslate = { x: paintTranslateX, y: paintTranslateY };
            paintPinchStartMid = {
                x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                y: (e.touches[0].clientY + e.touches[1].clientY) / 2
            };
        } else if (e.touches.length === 1) {
            // A pinch's fingers never land in the same event, so hold the first touch pending (PAINT_START_DELAY_MS, globals.js) and commit on touchmove, the timer, or touchend (a quick tap).
            pendingPaintTouch = { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
            pendingPaintTimer = setTimeout(() => {
                pendingPaintTimer = null;
                if (pendingPaintTouch) {
                    startPaint(pendingPaintTouch);
                    pendingPaintTouch = null;
                }
            }, PAINT_START_DELAY_MS);
        }
    }, {
        passive: false
    });
    mainCanvas.addEventListener('touchmove', (e) => {
        if (currentInpaintTopMode === 'img2img') return;
        e.preventDefault();
        if (e.touches.length === 2 && paintPinchStartDist > 0) {
            const dist = getPaintTouchDist(e.touches[0], e.touches[1]);
            const scaleFactor = dist / paintPinchStartDist;
            paintZoomScale = paintPinchStartScale * scaleFactor;

            // Pan follows the pinch midpoint as well as the distance change.
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            paintTranslateX = paintPinchStartTranslate.x + (midX - paintPinchStartMid.x);
            paintTranslateY = paintPinchStartTranslate.y + (midY - paintPinchStartMid.y);

            clampPaintTransform();
            applyPaintTransform();
        } else if (e.touches.length === 1) {
            if (pendingPaintTimer) {
                // Real movement past PAINT_MOVE_THRESHOLD_PX (globals.js) confirms a single-finger drag, so commit immediately instead of waiting out the delay.
                const dx = e.touches[0].clientX - pendingPaintTouch.clientX;
                const dy = e.touches[0].clientY - pendingPaintTouch.clientY;
                if (Math.hypot(dx, dy) >= PAINT_MOVE_THRESHOLD_PX) {
                    clearTimeout(pendingPaintTimer);
                    pendingPaintTimer = null;
                    startPaint(pendingPaintTouch);
                    pendingPaintTouch = null;
                } else {
                    return;
                }
            }
            // isDrawing is only true once a pending paint has committed, so a leftover finger after a pinch doesn't start drawing.
            if (isDrawing) painting(e.touches[0]);
        }
    }, {
        passive: false
    });
    mainCanvas.addEventListener('touchend', (e) => {
        if (currentInpaintTopMode === 'img2img') return;
        e.preventDefault();
        if (e.touches.length < 2) paintPinchStartDist = 0;
        if (e.touches.length === 0) {
            // A pending paint never confirmed by a move or the delay is a quick tap: commit via startPaint()+stopPaint() with no painting() call in between.
            if (pendingPaintTimer) {
                clearTimeout(pendingPaintTimer);
                pendingPaintTimer = null;
                if (pendingPaintTouch) {
                    startPaint(pendingPaintTouch);
                    pendingPaintTouch = null;
                }
            }
            stopPaint();
        }
    }, {
        passive: false
    });
    // As editorCanvas's touchcancel: reset isDrawing and paintPinchStartDist after an interrupted gesture.
    mainCanvas.addEventListener('touchcancel', () => {
        if (currentInpaintTopMode === 'img2img') return;
        // An interrupted gesture isn't a completed tap: discard a pending paint.
        if (pendingPaintTimer) {
            clearTimeout(pendingPaintTimer);
            pendingPaintTimer = null;
            pendingPaintTouch = null;
        }
        paintPinchStartDist = 0;
        stopPaint();
    }, {
        passive: false
    });

    mainCanvas.addEventListener('mousedown', (e) => { blurActiveTextField(); startPaint(e); });
    mainCanvas.addEventListener('mousemove', painting);
    mainCanvas.addEventListener('mouseup', stopPaint);
    mainCanvas.addEventListener('mouseleave', stopPaint);
}

// Blurring stops the view snapping back to the textarea on each stroke and the cursor blinking after the keyboard closes.
function blurActiveTextField() {
    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
        active.blur();
    }
}

// FIX: Set image as background instead of drawing it (allows real erasing)
// Clears the loaded Inpaint image and returns to the upload screen (without NEW IMAGE's file picker on top).
window.clearInpaintImage = function() {
    sourceImageB64 = null;
    editorImage = null;
    // Belongs to the image just cleared - see inpSourceMetadata (globals.js).
    inpSourceMetadata = null;
    editorPendingMetadataPromise = null;

    if (mainCtx && mainCanvas) mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    if (mainCanvas) mainCanvas.style.backgroundImage = 'none';
    historyStates.forEach(revokeHistoryState);
    historyStates = [];

    const uploadInput = document.getElementById('inpUpload');
    if (uploadInput) uploadInput.value = ''; // allow re-selecting the same file

    // A ControlNet image is tied to this source image; inp and img2img are cleared together (they share the canvas). Reuses clearControlNetImage() (network.js).
    if (typeof clearControlNetImage === 'function') {
        ['inp', 'img2img'].forEach(mode => {
            for (let u = 0; u <= 2; u++) clearControlNetImage(mode, u);
        });
    }

    document.getElementById('inpTopModeSwitcher').classList.add('hidden');
    // Clearing the image keeps the current sub-mode: re-apply its visibility rules via currentInpaintTopMode.
    if (typeof setInpaintTopMode === 'function') setInpaintTopMode(currentInpaintTopMode);
}

// Stand-in for a {visual, mask} history entry for the blank starting state (see resetInpaintCanvas()); undoLastStroke() checks for it by reference.
const BLANK_HISTORY_MARKER = { blank: true };

// Object URLs need explicit revocation. Called wherever a history entry becomes unreachable (oldest over the cap, undone, or array discarded).
function revokeHistoryState(state) {
    if (!state || state === BLANK_HISTORY_MARKER) return;
    try { URL.revokeObjectURL(state.strokeLayer); } catch (e) {}
    try { URL.revokeObjectURL(state.mask); } catch (e) {}
}

// Serialises saveHistory() pushes so overlapping saves commit in call order (toBlob() snapshots pixels synchronously but encodings may finish out of order).
let historySaveQueue = Promise.resolve();

function resetInpaintCanvas() {
    if (!sourceImageB64) return;

    // A fresh image or crop shouldn't inherit the previous zoom/pan.
    if (typeof resetPaintZoom === 'function') resetPaintZoom();

    // Nor the previous image's paint via the mode-switch snapshot (globals.js).
    hasInpaintModeSwitchSnapshot = false;

    // 1. Set CSS Background
    mainCanvas.width = editorTargetW;
    mainCanvas.height = editorTargetH;
    mainCanvas.style.backgroundImage = `url(${sourceImageB64})`;
    mainCanvas.style.backgroundSize = "100% 100%";
    // Sized alongside mainCanvas (see painting()).
    strokeLayerCanvas.width = editorTargetW;
    strokeLayerCanvas.height = editorTargetH;

    // 2. Clear Visual Canvas (It should only hold strokes)
    mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);

    // 3. Reset Mask Canvas (Solid Black)
    maskCanvas.width = editorTargetW;
    maskCanvas.height = editorTargetH;
    maskCtx.fillStyle = "black";
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    // A blank marker instead of saveHistory() skips toBlob() for this always-reproducible state (clear visual, solid black mask); undoLastStroke() never reads real data for the first entry.
    historyStates.forEach(revokeHistoryState);
    historyStates = [BLANK_HISTORY_MARKER];
}

function startPaint(e) {
    if (currentInpaintTopMode === 'img2img') return; // no mask painting in img2img mode
    isDrawing = true;
    // Cached once for the whole stroke (see globals.js).
    currentStrokeBrushSize = document.getElementById('brushSize').value;
    const rect = mainCanvas.getBoundingClientRect();
    const scaleX = mainCanvas.width / rect.width;
    const scaleY = mainCanvas.height / rect.height;

    const clientX = e.clientX;
    const clientY = e.clientY;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    mainCtx.beginPath();
    mainCtx.moveTo(x, y);
    maskCtx.beginPath();
    maskCtx.moveTo(x, y);

    // strokeLayerCanvas is not cleared here: it persists as the accumulated full-opacity shape of every stroke in the session, so separate strokes don't stack their 0.5-alpha passes (painting opaque over opaque with source-over never darkens). Only beginPath()/moveTo() runs, starting a fresh path; the canvas is cleared by saveHistory()/undoLastStroke() or a full reset (resetInpaintCanvas()).
    strokeLayerCtx.beginPath();
    strokeLayerCtx.moveTo(x, y);
}

function painting(e) {
    if (!isDrawing) return;
    const rect = mainCanvas.getBoundingClientRect();
    const scaleX = mainCanvas.width / rect.width;
    const scaleY = mainCanvas.height / rect.height;

    const clientX = e.clientX;
    const clientY = e.clientY;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    const size = currentStrokeBrushSize;

    maskCtx.lineWidth = size;
    maskCtx.lineCap = 'round';
    maskCtx.lineJoin = 'round';

    if (currentBrushMode === 'draw') {
        // Painted onto the persistent strokeLayerCanvas (see startPaint()); mainCanvas is rebuilt from the full accumulated shape at one 0.5 globalAlpha pass, so separate strokes don't compound.
        strokeLayerCtx.lineWidth = size;
        strokeLayerCtx.lineCap = 'round';
        strokeLayerCtx.lineJoin = 'round';
        strokeLayerCtx.globalCompositeOperation = 'source-over';
        strokeLayerCtx.strokeStyle = 'rgba(255, 165, 0, 1)';
        strokeLayerCtx.lineTo(x, y);
        strokeLayerCtx.stroke();

        mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
        mainCtx.globalAlpha = 0.5;
        mainCtx.drawImage(strokeLayerCanvas, 0, 0);
        mainCtx.globalAlpha = 1;

        maskCtx.globalCompositeOperation = 'source-over';
        maskCtx.strokeStyle = 'white';
        maskCtx.lineTo(x, y);
        maskCtx.stroke();
    } else {
        // Erase mode also cuts the shape out of strokeLayerCanvas, since mainCanvas is rebuilt from it on every draw stroke. destination-out has no double-erase stacking problem.
        strokeLayerCtx.lineWidth = size;
        strokeLayerCtx.lineCap = 'round';
        strokeLayerCtx.lineJoin = 'round';
        strokeLayerCtx.globalCompositeOperation = 'destination-out';
        strokeLayerCtx.strokeStyle = 'rgba(0,0,0,1)';
        strokeLayerCtx.lineTo(x, y);
        strokeLayerCtx.stroke();
        strokeLayerCtx.globalCompositeOperation = 'source-over';

        mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
        mainCtx.globalAlpha = 0.5;
        mainCtx.drawImage(strokeLayerCanvas, 0, 0);
        mainCtx.globalAlpha = 1;

        maskCtx.globalCompositeOperation = 'source-over'; // Paint over with black
        maskCtx.strokeStyle = 'black';
        maskCtx.lineTo(x, y);
        maskCtx.stroke();
    }
}

function stopPaint() {
    if (isDrawing) {
        isDrawing = false;
        mainCtx.closePath();
        maskCtx.closePath();
        mainCtx.globalCompositeOperation = 'source-over';
        // FIX: Removed destructive logic that was wiping the canvas
        saveHistory();
    }
}

function saveHistory() {
    // Async (toBlob + object URLs) instead of the synchronous toDataURL(), which blocked the main thread on every stroke end (as PROCEED). targetArray is captured now, so a stale save lands in the old array if the image resets while encoding.
    const targetArray = historyStates;
    // Saves strokeLayerCanvas (the accumulated full-opacity shape) rather than mainCanvas's rendering; mainCanvas is that layer at 0.5 alpha (see painting()), so restoring one and re-deriving the other keeps them in step.
    const strokeLayerBlobPromise = new Promise(resolve => strokeLayerCanvas.toBlob(resolve));
    const maskBlobPromise = new Promise(resolve => maskCanvas.toBlob(resolve));
    historySaveQueue = historySaveQueue.then(async () => {
        const [strokeLayerBlob, maskBlob] = await Promise.all([strokeLayerBlobPromise, maskBlobPromise]);
        if (targetArray.length > 10) revokeHistoryState(targetArray.shift());
        targetArray.push({
            strokeLayer: URL.createObjectURL(strokeLayerBlob),
            mask: URL.createObjectURL(maskBlob)
        });
    });
}

window.undoLastStroke = async function() {
    // Waits for still-encoding saveHistory() calls so a quick undo doesn't act on a stale array.
    await historySaveQueue;
    if (historyStates.length > 1) {
        revokeHistoryState(historyStates.pop());
        const lastState = historyStates[historyStates.length - 1];
        if (lastState === BLANK_HISTORY_MARKER) {
            // The same clear/fill as resetInpaintCanvas(), directly on the canvas (no snapshot to load).
            strokeLayerCtx.clearRect(0, 0, strokeLayerCanvas.width, strokeLayerCanvas.height);
            mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
            maskCtx.fillStyle = "black";
            maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
            return;
        }
        const imgS = new Image();
        imgS.src = lastState.strokeLayer;
        const imgM = new Image();
        imgM.src = lastState.mask;
        imgS.onload = () => {
            // Restores the accumulated shape layer, then re-derives mainCanvas from it.
            strokeLayerCtx.clearRect(0, 0, strokeLayerCanvas.width, strokeLayerCanvas.height);
            strokeLayerCtx.drawImage(imgS, 0, 0);
            mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
            mainCtx.globalAlpha = 0.5;
            mainCtx.drawImage(strokeLayerCanvas, 0, 0);
            mainCtx.globalAlpha = 1;
        };
        imgM.onload = () => {
            maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
            maskCtx.drawImage(imgM, 0, 0);
        }
    } else {
        resetInpaintCanvas();
    }
}

window.clearMask = () => resetInpaintCanvas();
window.setBrushMode = function(mode) {
    currentBrushMode = mode;
    // Scoped by ID (the old broad selector also cleared mode-fill/mode-mask when DRAW/ERASE was tapped).
    document.getElementById('tool-draw').classList.toggle('active', mode === 'draw');
    document.getElementById('tool-erase').classList.toggle('active', mode === 'erase');
}
window.setInpaintMode = function(mode) {
    currentInpaintMode = mode;
    document.getElementById('mode-fill').classList.toggle('active', mode === 'fill');
    document.getElementById('mode-mask').classList.toggle('active', mode === 'mask');
    // Whole/Masked is a plain global (currentInpaintMode) with no element to read a .value from, so it gets its own storage key, saved on every call here (toggle buttons, Load Default, restoreInpaintModeState).
    try { localStorage.setItem('bojro_inp_mask_mode', mode); } catch (e) {}
}

// Switches between mask-based Inpaint and whole-image img2img (no mask). They share the image and canvas, but Prompt, Negative, Generation Params and Denoising Strength are saved and restored separately per mode. Batch Size/Count are excluded (resetPerGenerationFieldsOnBoot(), boot.js).
const INPAINT_SHARED_STATE_FIELDS = ['inp_prompt', 'inp_neg', 'inp_steps', 'inp_cfg', 'inp_sampler', 'inp_scheduler', 'denoisingStrength'];

// Fallback defaults per mode, used only when nothing is saved.
const INPAINT_MODE_DEFAULTS = {
    inpaint: { inp_prompt: 'original', inp_neg: 'bad quality, blur', inp_steps: '25', inp_cfg: '7', denoisingStrength: '0.75', inp_batch_size: '1', inp_batch_count: '1' },
    img2img: { inp_prompt: '', inp_neg: 'bad quality, blur', inp_steps: '25', inp_cfg: '7', denoisingStrength: '0.5', inp_batch_size: '1', inp_batch_count: '1' }
};

function saveInpaintModeState(mode) {
    INPAINT_SHARED_STATE_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) localStorage.setItem(`bojro_${mode}_state_${id}`, el.value);
    });
}

// Persists every field here (steps/cfg/sampler/scheduler/denoising/batch size/count) as it changes, not only on mode-switch/preset events. Reads currentInpaintTopMode since the fields are shared. No-op on Upscale.
function saveCurrentInpaintModeStateLive() {
    if (typeof currentInpaintTopMode !== 'undefined' && currentInpaintTopMode) {
        saveInpaintModeState(currentInpaintTopMode);
    }
}

function restoreInpaintModeState(mode) {
    const defaults = INPAINT_MODE_DEFAULTS[mode] || {};
    INPAINT_SHARED_STATE_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const saved = localStorage.getItem(`bojro_${mode}_state_${id}`);
        if (saved !== null) {
            el.value = saved;
        } else if (defaults.hasOwnProperty(id)) {
            el.value = defaults[id];
        }
        // sampler/scheduler are populated from the server, so setting .value before the list exists is ignored.
        if (id === 'denoisingStrength') {
            const dv = document.getElementById('denoiseVal');
            if (dv) dv.innerText = el.value;
        }
    });

    // These are direct .value assignments with no events, so refresh inp_sampler/inp_scheduler's triggers and the preset active-border tracking (IMG2IMG_PRESET_FIELD_IDS).
    if (typeof refreshAllModelPickerTriggers === 'function') refreshAllModelPickerTriggers();
    if (typeof clearActiveImg2imgPreset === 'function') clearActiveImg2imgPreset();
}

let inpaintModeInitialized = false; // guards against the very first setInpaintTopMode() call (during boot) saving over real stored state with un-restored HTML defaults

window.setInpaintTopMode = function(mode) {
    // Captured before currentInpaintTopMode is overwritten: both the snapshot-and-clear and restore branches need the previous mode.
    const previousMode = currentInpaintTopMode;

    // Also decides whether the restore call below runs (it needs a genuine switch).
    const isGenuineSwitch = !inpaintModeInitialized || previousMode !== mode;

    // Save the outgoing mode's fields, but not on the very first call (the fields still hold HTML defaults).
    if (inpaintModeInitialized && currentInpaintTopMode && currentInpaintTopMode !== mode) {
        saveInpaintModeState(currentInpaintTopMode);
    }
    inpaintModeInitialized = true;

    // Inpaint and img2img share the canvas, so snapshot mainCanvas's paint and maskCanvas's mask data into offscreen canvases when leaving Inpaint and restore them on returning. Skipped for the boot-time call and same-mode "switches".
    if (previousMode && previousMode !== mode) {
        if (previousMode === 'inpaint' && mainCanvas && maskCanvas) {
            // Snapshots strokeLayerCanvas (the accumulated full-opacity shape), not mainCanvas, for the same reason as saveHistory().
            inpaintModeSwitchSnapshot.width = strokeLayerCanvas.width;
            inpaintModeSwitchSnapshot.height = strokeLayerCanvas.height;
            inpaintModeSwitchSnapshotCtx.clearRect(0, 0, inpaintModeSwitchSnapshot.width, inpaintModeSwitchSnapshot.height);
            inpaintModeSwitchSnapshotCtx.drawImage(strokeLayerCanvas, 0, 0);

            inpaintModeSwitchMaskSnapshot.width = maskCanvas.width;
            inpaintModeSwitchMaskSnapshot.height = maskCanvas.height;
            inpaintModeSwitchMaskSnapshotCtx.clearRect(0, 0, inpaintModeSwitchMaskSnapshot.width, inpaintModeSwitchMaskSnapshot.height);
            inpaintModeSwitchMaskSnapshotCtx.drawImage(maskCanvas, 0, 0);

            hasInpaintModeSwitchSnapshot = true;
            strokeLayerCtx.clearRect(0, 0, strokeLayerCanvas.width, strokeLayerCanvas.height);
            mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
        } else if (mode === 'inpaint' && hasInpaintModeSwitchSnapshot && mainCanvas && maskCanvas &&
                   inpaintModeSwitchSnapshot.width === mainCanvas.width && inpaintModeSwitchSnapshot.height === mainCanvas.height) {
            // The dimension check guards against a new image loaded while away; resetInpaintCanvas() also invalidates the flag.
            strokeLayerCtx.clearRect(0, 0, strokeLayerCanvas.width, strokeLayerCanvas.height);
            strokeLayerCtx.drawImage(inpaintModeSwitchSnapshot, 0, 0);
            mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
            mainCtx.globalAlpha = 0.5;
            mainCtx.drawImage(strokeLayerCanvas, 0, 0);
            mainCtx.globalAlpha = 1;
            maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
            maskCtx.drawImage(inpaintModeSwitchMaskSnapshot, 0, 0);
        }
    }

    currentInpaintTopMode = mode;
    if (typeof refreshLowBitsControls === 'function') refreshLowBitsControls(); // Low Bits follows the checkpoint of the view now in front
    document.getElementById('topmode-inpaint').classList.toggle('active', mode === 'inpaint');
    document.getElementById('topmode-img2img').classList.toggle('active', mode === 'img2img');
    document.getElementById('topmode-upscale').classList.toggle('active', mode === 'upscale');

    const isUpscale = mode === 'upscale';

    // Upscale has its own panel. The upload box hides based on sourceImageB64, not isUpscale alone.
    document.getElementById('img-input-container').classList.toggle('hidden', !!sourceImageB64);
    document.getElementById('canvasWrapper').classList.toggle('hidden', isUpscale || !sourceImageB64);
    document.getElementById('upscaleWrapper').classList.toggle('hidden', !isUpscale || !sourceImageB64);
    if (typeof updateInpResultsAreaVisibility === 'function') updateInpResultsAreaVisibility();
    // Preview toggle on this tab depends on the sub-mode (hidden for Upscale).
    if (typeof updateInpPreviewToggleVisibility === 'function') updateInpPreviewToggleVisibility();

    if (isUpscale) {
        if (typeof renderUpscalePreview === 'function') renderUpscalePreview();
        localStorage.setItem('bojroInpaintTopMode', mode);
        return; // none of the inpaint/img2img field restore/visibility logic below applies
    }

    // Gated by isGenuineSwitch so it only restores on a real mode switch (not discarding live edits).
    if (isGenuineSwitch) restoreInpaintModeState(mode);
    updateCanvasTouchBehavior();
    if (typeof updateInpaintNegativePromptVisibility === 'function') updateInpaintNegativePromptVisibility();
    // Checked for both sub-modes: the Flux CLIP/T5 row (ui.js) is a separate element per sub-mode with its own checkpoint.
    if (typeof updateInpFluxModuleVisibility === 'function') {
        updateInpFluxModuleVisibility('inp');
        updateInpFluxModuleVisibility('img2img');
    }
    // Refresh here too so the hint isn't blank until Steps/Denoising are touched.
    if (typeof updateDenoiseStepHint === 'function') updateDenoiseStepHint();

    const isInpaint = mode === 'inpaint';
    document.getElementById('inpaintOnlyControls').classList.toggle('hidden', !isInpaint);
    document.getElementById('maskOnlyControls').classList.toggle('hidden', !isInpaint);
    document.getElementById('maskedContentGroup').classList.toggle('hidden', !isInpaint);
    document.getElementById('maskToolButtons').classList.toggle('hidden', !isInpaint);
    document.getElementById('inpModelRow').classList.toggle('hidden', !isInpaint);
    document.getElementById('img2imgModelRow').classList.toggle('hidden', isInpaint);
    document.getElementById('inpVaeTeGroup').classList.toggle('hidden', !isInpaint);
    document.getElementById('inpAdetailerGroup').classList.toggle('hidden', !isInpaint);
    document.getElementById('inpControlnetGroup').classList.toggle('hidden', !isInpaint);
    document.getElementById('img2imgVaeTeGroup').classList.toggle('hidden', isInpaint);
    document.getElementById('img2imgAdetailerGroup').classList.toggle('hidden', isInpaint);
    document.getElementById('img2imgControlnetGroup').classList.toggle('hidden', isInpaint);
    document.getElementById('inp_add_lora_btn').classList.toggle('hidden', !isInpaint);
    document.getElementById('img2img_add_lora_btn').classList.toggle('hidden', isInpaint);
    document.getElementById('img2imgColorCorrectionRow').classList.toggle('hidden', isInpaint);
    document.getElementById('img2imgPresetsBtn').classList.toggle('hidden', isInpaint);
    // The import-from-image-metadata buttons are img2img only: there the prompt describes the whole image. In Inpaint the box describes only the masked region.
    document.getElementById('img2imgImportPromptBtn').classList.toggle('hidden', isInpaint);
    document.getElementById('img2imgImportNegBtn').classList.toggle('hidden', isInpaint);

    localStorage.setItem('bojroInpaintTopMode', mode);
    // The restore can change thumb-only sliders without their drag handler, so resync them all here.
    THUMB_ONLY_SLIDER_IDS.forEach(syncThumbOnlySliderPosition);
}

// The real <input> is inert (pointer-events:none, .thumb-only-slider); a .slider-fake-thumb is the only draggable element. The input's value/min/max/step stay the source of truth: the thumb is positioned from them and writes back via a real 'input' event.
const THUMB_ONLY_SLIDER_IDS = ['inp_mask_blur', 'inp_padding', 'denoisingStrength', 'brushSize', 'cfgWeight'];

function syncThumbOnlySliderPosition(sliderId) {
    const input = document.getElementById(sliderId);
    const thumb = document.querySelector(`.slider-fake-thumb[data-for="${sliderId}"]`);
    if (!input || !thumb) return;
    const wrap = thumb.parentElement;
    const wrapRect = wrap.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    if (inputRect.width === 0) return; // Not visible right now - nothing to position against.
    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 100;
    const value = parseFloat(input.value);
    const percent = max > min ? (value - min) / (max - min) : 0;
    const thumbX = (inputRect.left - wrapRect.left) + percent * inputRect.width;
    thumb.style.left = `${thumbX}px`;
}

function initThumbOnlySlider(sliderId) {
    const input = document.getElementById(sliderId);
    const thumb = document.querySelector(`.slider-fake-thumb[data-for="${sliderId}"]`);
    if (!input || !thumb) return;

    // Hysteresis stops a finger near a step boundary from flickering between values: a new step commits only once the finger passes the midpoint plus HYSTERESIS_STEP_FRACTION (0.4).
    let lastStepIndex = null;
    const HYSTERESIS_STEP_FRACTION = 0.4;

    function valueFromClientX(clientX) {
        const inputRect = input.getBoundingClientRect();
        const min = parseFloat(input.min) || 0;
        const max = parseFloat(input.max) || 100;
        const step = parseFloat(input.step) || 1;
        const rawPercent = inputRect.width > 0 ? (clientX - inputRect.left) / inputRect.width : 0;
        const clampedPercent = Math.min(1, Math.max(0, rawPercent));
        const rawValue = min + clampedPercent * (max - min);
        const rawStepIndex = (rawValue - min) / step;

        let steppedIndex;
        if (lastStepIndex === null || Math.abs(rawStepIndex - lastStepIndex) > 0.5 + HYSTERESIS_STEP_FRACTION) {
            // No committed step yet, or the finger moved well past the last one: plain nearest-step rounding.
            steppedIndex = Math.round(rawStepIndex);
        } else {
            // Within the sticky margin of the committed step: stay on it.
            steppedIndex = lastStepIndex;
        }
        lastStepIndex = steppedIndex;

        const stepped = steppedIndex * step + min;
        // Round to step's own number of decimals so floating-point steps don't leave values like 0.7300000000000001 (a no-op for integer steps).
        const decimals = (step.toString().split('.')[1] || '').length;
        return parseFloat(Math.min(max, Math.max(min, stepped)).toFixed(decimals));
    }

    thumb.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        thumb.setPointerCapture(e.pointerId);
        thumb.classList.add('dragging');
        lastStepIndex = null;
        input.value = valueFromClientX(e.clientX);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        syncThumbOnlySliderPosition(sliderId);
    });
    thumb.addEventListener('pointermove', (e) => {
        if (!thumb.classList.contains('dragging')) return;
        input.value = valueFromClientX(e.clientX);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        syncThumbOnlySliderPosition(sliderId);
    });
    const endDrag = (e) => {
        if (!thumb.classList.contains('dragging')) return;
        thumb.classList.remove('dragging');
        try { thumb.releasePointerCapture(e.pointerId); } catch (err) {}
    };
    thumb.addEventListener('pointerup', endDrag);
    thumb.addEventListener('pointercancel', endDrag);

    syncThumbOnlySliderPosition(sliderId);
}

THUMB_ONLY_SLIDER_IDS.forEach(initThumbOnlySlider);
// The thumb position comes from the input's rendered width, which a rotation, resize or the tab becoming visible can change without the value changing.
window.addEventListener('resize', () => THUMB_ONLY_SLIDER_IDS.forEach(syncThumbOnlySliderPosition));

// 1. Mode Switching & UI Logic
function setCanvasMode(mode) {
    activeEditorMode = mode;
    
    document.getElementById('canvas-mode-mask').classList.toggle('active', mode === 'mask');
    document.getElementById('canvas-mode-paint').classList.toggle('active', mode === 'paint');
    
    const colorPicker = document.getElementById('paintColorPicker');
    if (mode === 'paint') {
        colorPicker.classList.remove('hidden');
    } else {
        colorPicker.classList.add('hidden');
    }
}

function updatePaintColor(hexColor) {
    activePaintColor = hexColor;
}

// 2. The Engine Hijack (Forces the brush to change color)
const originalStroke = CanvasRenderingContext2D.prototype.stroke;
CanvasRenderingContext2D.prototype.stroke = function() {
    // Only hijack the color if we are inside ComfyUI editing mode
    if (typeof isComfyMaskingMode !== 'undefined' && isComfyMaskingMode) {
        if (typeof activeEditorMode !== 'undefined' && activeEditorMode === 'paint') {
            // Apply chosen paint color
            this.strokeStyle = typeof activePaintColor !== 'undefined' ? activePaintColor : '#ff0000';
        } else {
            // Force white for standard masking so cutouts keep working
            this.strokeStyle = '#ffffff'; 
        }
    }
    // Continue drawing the line normally
    originalStroke.apply(this, arguments);
};

// 3. Fail-Safe Patch for the Delete (Trash) Button
const originalClearMask = window.clearMask;
window.clearMask = function() {
    if (typeof isComfyMaskingMode !== 'undefined' && isComfyMaskingMode) {
        // Wipe visible canvas
        const canvas = document.getElementById('paintCanvas');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Redraw clean base image
        if (typeof comfyBaseImage !== 'undefined' && comfyBaseImage) {
            ctx.drawImage(comfyBaseImage, 0, 0);
        }
        
        // Wipe invisible mask canvas
        if (typeof maskCanvas !== 'undefined' && maskCanvas) {
            const mCtx = maskCanvas.getContext('2d');
            mCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        }
        
        // Reset brush stroke arrays if they exist in your editor.js
        if (typeof strokes !== 'undefined') strokes = [];
        if (typeof paths !== 'undefined') paths = [];
    } else if (typeof originalClearMask === 'function') {
        // Do normal behavior if not in Comfy Mode
        originalClearMask();
    }
};
