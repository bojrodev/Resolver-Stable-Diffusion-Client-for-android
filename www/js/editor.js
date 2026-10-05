// -----------------------------------------------------------
// IMAGE EDITOR LOGIC (CROPPER & TRANSFORM)
// -----------------------------------------------------------

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

    // Mouse
    cvs.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}

window.openEditorFromFile = function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        const img = new Image();
        img.src = evt.target.result;
        img.onload = () => {
            editorImage = img;

            // 1. Show modal FIRST to ensure canvas has dimensions
            document.getElementById('editorModal').classList.remove('hidden');

            // 2. Wait for layout, then calculate dimensions and force center (Late Init)
            setTimeout(() => {
                editorTargetW = 1024;
                editorTargetH = 1024;
                recalcEditorLayout();
                resetEditorView();
            }, 50);
        };
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

window.setEditorRatio = function(targetW, targetH) {
    editorTargetW = targetW;
    editorTargetH = targetH;
    recalcEditorLayout();
    resetEditorView();
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

    // Reset Sliders
    document.getElementById('editScale').value = 1;
    document.getElementById('editX').value = 0;
    document.getElementById('editY').value = 0;

    drawEditor();
}

window.updateEditorTransform = function() {
    if (!editorImage) return;

    const scaleMult = parseFloat(document.getElementById('editScale').value);
    const offX = parseFloat(document.getElementById('editX').value);
    const offY = parseFloat(document.getElementById('editY').value);

    const cvs = document.getElementById('editorCanvas');

    // Calculate current dimensions
    const currentW = editorImage.naturalWidth * (editorMinScale * scaleMult);
    const currentH = editorImage.naturalHeight * (editorMinScale * scaleMult);

    // Base is centered relative to canvas
    const baseX = (cvs.width - currentW) / 2;
    const baseY = (cvs.height - currentH) / 2;

    editorScale = editorMinScale * scaleMult;
    editorTranslateX = baseX + offX;
    editorTranslateY = baseY + offY;

    drawEditor();
}

function drawEditor() {
    if (!editorImage) return;
    const cvs = document.getElementById('editorCanvas');
    const ctx = cvs.getContext('2d');

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
        isEditorActive = true;
        panStart = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY
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
        editorScale = startScale * scaleFactor;

        const cvs = document.getElementById('editorCanvas');
        const centerX = cvs.width / 2;
        const centerY = cvs.height / 2;
        editorTranslateX = centerX - (centerX - startTranslate.x) * scaleFactor;
        editorTranslateY = centerY - (centerY - startTranslate.y) * scaleFactor;
        drawEditor();
    } else if (e.touches.length === 1 && isEditorActive) {
        const dx = e.touches[0].clientX - panStart.x;
        const dy = e.touches[0].clientY - panStart.y;
        editorTranslateX = startTranslate.x + dx;
        editorTranslateY = startTranslate.y + dy;
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
    editorTranslateX = startTranslate.x + dx;
    editorTranslateY = startTranslate.y + dy;
    drawEditor();
}

function handleMouseUp() {
    isEditorActive = false;
}

function getDist(t1, t2) {
    return Math.sqrt(Math.pow(t1.clientX - t2.clientX, 2) + Math.pow(t1.clientY - t2.clientY, 2));
}

window.applyEditorChanges = function() {
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

    sourceImageB64 = finalCvs.toDataURL('image/png');
    resetInpaintCanvas();

    document.getElementById('img-input-container').style.display = 'none';
    document.getElementById('canvasWrapper').classList.remove('hidden');
    document.getElementById('editorModal').classList.add('hidden');

    const mode = currentMode;
    document.getElementById(`${mode}_width`).value = editorTargetW;
    document.getElementById(`${mode}_height`).value = editorTargetH;
}

window.closeEditor = () => document.getElementById('editorModal').classList.add('hidden');

// -----------------------------------------------------------
// INPAINTING CANVAS LOGIC (DRAWING/MASKING)
// -----------------------------------------------------------

function initMainCanvas() {
    mainCanvas = document.getElementById('paintCanvas');
    if (!mainCanvas) return;
    mainCtx = mainCanvas.getContext('2d');
    maskCanvas = document.createElement('canvas');
    maskCtx = maskCanvas.getContext('2d');

    mainCanvas.style.touchAction = 'none';

    mainCanvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startPaint(e.touches[0]);
    }, {
        passive: false
    });
    mainCanvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        painting(e.touches[0]);
    }, {
        passive: false
    });
    mainCanvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        stopPaint();
    }, {
        passive: false
    });

    mainCanvas.addEventListener('mousedown', startPaint);
    mainCanvas.addEventListener('mousemove', painting);
    mainCanvas.addEventListener('mouseup', stopPaint);
    mainCanvas.addEventListener('mouseleave', stopPaint);
}

// FIX: Set image as background instead of drawing it (allows real erasing)
function resetInpaintCanvas() {
    if (!sourceImageB64) return;

    // 1. Set CSS Background
    mainCanvas.width = editorTargetW;
    mainCanvas.height = editorTargetH;
    mainCanvas.style.backgroundImage = `url(${sourceImageB64})`;
    mainCanvas.style.backgroundSize = "100% 100%";

    // 2. Clear Visual Canvas (It should only hold strokes)
    mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);

    // 3. Reset Mask Canvas (Solid Black)
    maskCanvas.width = editorTargetW;
    maskCanvas.height = editorTargetH;
    maskCtx.fillStyle = "black";
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    historyStates = [];
    saveHistory();
}

function startPaint(e) {
    isDrawing = true;
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

    const size = document.getElementById('brushSize').value;

    mainCtx.lineWidth = size;
    mainCtx.lineCap = 'round';
    mainCtx.lineJoin = 'round';
    maskCtx.lineWidth = size;
    maskCtx.lineCap = 'round';
    maskCtx.lineJoin = 'round';

    if (currentBrushMode === 'draw') {
        // Draw Orange on Visual, White on Mask
        mainCtx.globalCompositeOperation = 'source-over';
        mainCtx.strokeStyle = 'rgba(255, 165, 0, 0.5)';
        maskCtx.globalCompositeOperation = 'source-over';
        maskCtx.strokeStyle = 'white';
    } else {
        // FIX: Erase mode should remove orange (destination-out) and paint black on mask
        mainCtx.globalCompositeOperation = 'destination-out';
        mainCtx.strokeStyle = 'rgba(0,0,0,1)'; // Color doesn't matter for dest-out

        maskCtx.globalCompositeOperation = 'source-over'; // Paint over with black
        maskCtx.strokeStyle = 'black';
    }

    mainCtx.lineTo(x, y);
    mainCtx.stroke();
    maskCtx.lineTo(x, y);
    maskCtx.stroke();
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
    if (historyStates.length > 10) historyStates.shift();
    historyStates.push({
        visual: mainCanvas.toDataURL(),
        mask: maskCanvas.toDataURL()
    });
}

window.undoLastStroke = function() {
    if (historyStates.length > 1) {
        historyStates.pop();
        const lastState = historyStates[historyStates.length - 1];
        const imgV = new Image();
        imgV.src = lastState.visual;
        const imgM = new Image();
        imgM.src = lastState.mask;
        imgV.onload = () => {
            mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
            mainCtx.drawImage(imgV, 0, 0);
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
    document.querySelectorAll('#inpaintControls .toggle-opt').forEach(el => el.classList.remove('active'));
    document.getElementById(`tool-${mode}`).classList.add('active');
}
window.setInpaintMode = function(mode) {
    currentInpaintMode = mode;
    document.getElementById('mode-fill').classList.toggle('active', mode === 'fill');
    document.getElementById('mode-mask').classList.toggle('active', mode === 'mask');
}
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