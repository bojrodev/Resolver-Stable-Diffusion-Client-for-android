# Application Architecture & System Lifecycle

## Table of Contents
- [1. System Overview](#1-system-overview)
- [2. Boot Pipeline & Lifecycle](#2-boot-pipeline--lifecycle)
- [3. Workspace Tab Lifecycle & Navigation](#3-workspace-tab-lifecycle--navigation)
- [4. Dual-Tier Persistence Layer](#4-dual-tier-persistence-layer)
- [5. Component Architecture & Custom Controls](#5-component-architecture--custom-controls)

---

## 1. System Overview

Resolver operates as a hybrid architecture consisting of a native Android container (Capacitor v6) hosting a Single Page Application (SPA). The webview layer manages user input, parameter persistence, canvas painting, request payload serialization, and asynchronous result polling.

```
┌─────────────────────────────────────────────────────────────┐
│ Webview Front-End Layer (HTML5 / ES6 Vanilla JS / Canvas)   │
├──────────────────────────────┬──────────────────────────────┤
│ Core Workspace Orchestration │ Image Processing & Canvas    │
│ (ui.js, boot.js, globals.js) │ (editor.js, analyzer.js)     │
├──────────────────────────────┴──────────────────────────────┤
│ Bridge Integration Layer                                    │
│ (network.js, engine.js, comfy_logic.js)                      │
└──────────────────────────────┬──────────────────────────────┘
                               │
               Capacitor Hybrid Bridge Calls
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ Native Android Platform Layer (Java)                        │
│ (MainActivity.java, ResolverServicePlugin.java)             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Boot Pipeline & Lifecycle

The client initializes strictly through `www/js/boot.js` upon receiving the `DOMContentLoaded` event. Initializations execute in a non-blocking sequence to ensure immediate frame rendering before fetching remote server states.

```
[DOM Loaded]
   │
   ├── 1. Read LocalStorage Overrides & Renames
   ├── 2. Initialize Model Dropdowns & Native Pickers (`initModelPickers`)
   ├── 3. Bind UI Controllers & Event Handlers (`setupUI`)
   ├── 4. Configure Audio Keep-Alive Service (`initKeepAlive`)
   ├── 5. Restore Last Active Tab Workspace
   └── 6. Asynchronously Fetch Backend Server State
          ├── Checkpoints (`fetchModels`)
          ├── Samplers (`fetchSamplers`)
          └── Schedulers (`fetchSchedulers`)
```

### Critical Boot Routines (`www/js/boot.js`)

* `window.initApp()`: Primary entry executor.
* `resetPerGenerationFieldsOnBoot()`: Sanitizes temporary runtime fields on boot. Forces seed parameters to `-1` (randomized) and batch counts/sizes to `1` while preserving user-pinned system defaults (`defaults.js`).
* `restoreLiveGenParams(mode)`: Reads stored mode state (`bojro_{mode}_live_{field}`) from `localStorage` and hydrates active workspace inputs without overwriting pinned presets.

---

## 3. Workspace Tab Lifecycle & Navigation

Tab routing is driven by `window.switchTab(tabName)` inside `www/js/ui.js`. Modifying workspace tabs mutates the visible CSS layout while keeping the background generation engine uninterrupted.

```
                          ┌───> 'xl'    (SDXL Workspace)
                          ├───> 'flux'  (FLUX Workspace)
                          ├───> 'qwen'  (Qwen / Neo Workspace)
switchTab(tabName) ───────┼───> 'anima' (Anima Workspace)
                          ├───> 'krea'  (Krea 2 Workspace)
                          ├───> 'inp'   (Unified Inpaint / Img2Img / Upscale)
                          └───> 'cfg'   (Settings & System Preferences)
```

### Routing Implementation

```javascript
// www/js/ui.js
window.switchTab = function(tabName) {
    // 1. Persist active view route
    localStorage.setItem('resolver_active_tab', tabName);
    
    // 2. Hide all tab view containers and display target view
    document.querySelectorAll('.tab-view').forEach(view => view.classList.add('hidden'));
    document.getElementById(`view-${tabName}`).classList.remove('hidden');
    
    // 3. Re-sync top-level navigation button states
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.nav-btn[data-tab="${tabName}"]`)?.classList.add('active');
    
    // 4. Trigger context-specific workspace synchronization
    if (tabName === 'inp') {
        if (typeof setInpaintTopMode === 'function') setInpaintTopMode(currentInpaintTopMode);
    } else {
        if (typeof refreshLowBitsControls === 'function') refreshLowBitsControls();
    }
};
```

---

## 4. Dual-Tier Persistence Layer

Resolver separates fast parameter state caching from binary image storage across two distinct browser storage tiers:

| Storage Layer | Engine / Storage Target | Data Domains |
| :--- | :--- | :--- |
| **KeyValue Store** | `localStorage` | Live form states, pinned model defaults, LoRA insertions, preferred module pairings, UI preferences, notice board tokens. |
| **Object Store** | IndexedDB (`bojro_analyzer_history`) | Analyzed image blobs, thumbnail caches, image hash maps. |
| **Object Store** | IndexedDB (`images`) | Full-resolution local generation history and canvas states. |

### Analyzer History Database (`bojro_analyzer_history`)

- **Database Name:** `bojro_analyzer_history`
- **Object Store:** `entries`
- **Primary Key:** `id` (SHA-256 binary digest, falling back to FNV-1a hash in non-secure contexts)
- **Record Schema:**
  ```javascript
  {
    id: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ts: 1728518400000,
    size: 2048576,
    thumb: "data:image/jpeg;base64,...",
    blob: Blob
  }
  ```
- **Pruning Engine:** Automatically maintains the newest `MAX_ENTRIES = 20` using transactional record trimming.

---

## 5. Component Architecture & Custom Controls

To circumvent mobile Webview drop-down rendering inconsistencies, standard native `<select>` controls are augmented using a custom Modal Picker system (`www/js/modelpicker.js`).

```
┌─────────────────────────────────┐
│ <select id="xl_modelSelect">    │  <-- Source of truth (Hidden DOM element)
└─────────────────────────────────┘
                ▲
                │ (Dispatches 'change' event)
┌─────────────────────────────────┐
│ Custom Model Picker Modal       │  <-- Interactive Glassmorphism Overlay
│ [Primary Name | Technical Sub]  │
└─────────────────────────────────┘
```

### Picker Component Lifecycle

1. **Invocation:** `window.openModelPicker(trigger)` reads options from the bound `<select>` element.
2. **Parsing:** Subtitles are extracted via `splitCheckpointDisplayName()` to strip technical tokens (`FP8`, `GGUF`, `INT4`, `Lightning`, `Quant`).
3. **Selection:** `selectModelFromPicker(value)` updates the hidden `<select>`, clears overriding flags, and dispatches a synthetic `Event('change', { bubbles: true })` to trigger linked engine event listeners.