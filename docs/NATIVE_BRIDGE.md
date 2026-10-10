# Native Platform Integration & Android Bridge

## Table of Contents
- [1. Capacitor Bridge Architecture](#1-capacitor-bridge-architecture)
- [2. Native Hardware Intercepts](#2-native-hardware-intercepts)
  - [2.1 Hardware Back Button Handling](#21-hardware-back-button-handling)
- [3. Background Execution & Keep-Alive Service](#3-background-execution--keep-alive-service)
  - [3.1 Native Foreground Service](#31-native-foreground-service)
  - [3.2 Silent Audio Keep-Alive Loop](#32-silent-audio-keep-alive-loop)

---

## 1. Capacitor Bridge Architecture

Resolver leverages **Capacitor v6** to connect the client Webview to Android system calls.

```
┌─────────────────────────────────────────────────────────────┐
│ Client Webview Layer (Vanilla JS Engine)                    │
└──────────────────────────────┬──────────────────────────────┘
                               │
            Capacitor Bridge Execution Interface
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ Native Android Layer (Java)                                 │
│ ├── MainActivity.java           <-- Hardware Back Intercept │
│ └── ResolverServicePlugin.java  <-- Foreground & WakeLock   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Native Hardware Intercepts

### 2.1 Hardware Back Button Handling

To prevent the Android OS from terminating the application when back gestures are performed during overlay modal views, `MainActivity.java` passes back presses directly into the JavaScript layer:

```java
// android/app/src/main/java/com/resolver/client/MainActivity.java
@Override
public void onBackPressed() {
    this.bridge.getWebView().evaluateJavascript(
        "if (typeof window.handleHardwareBackButton === 'function') { window.handleHardwareBackButton(); }",
        null
    );
}
```

### JavaScript Intercept Cascade (`www/js/ui.js`)

When `handleHardwareBackButton()` executes, it traverses open UI elements in reverse z-index order before allowing the application to close:

```javascript
// www/js/ui.js
window.handleHardwareBackButton = function() {
    // 1. Close Lightbox / Fullscreen Image Modal if active
    const fsModal = document.getElementById('fullScreenModal');
    if (fsModal && !fsModal.classList.contains('hidden')) {
        window.closeFsModal();
        return;
    }
    
    // 2. Dismiss active Modals (Magic Prompt / LoRA Picker / Preset Managers)
    const openModals = document.querySelectorAll('.modal:not(.hidden)');
    if (openModals.length > 0) {
        openModals[openModals.length - 1].classList.add('hidden');
        if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
        return;
    }
    
    // 3. Application Exit Fallback
    if (window.Capacitor && window.Capacitor.Plugins.App) {
        window.Capacitor.Plugins.App.exitApp();
    }
};
```

---

## 3. Background Execution & Keep-Alive Service

### 3.1 Native Foreground Service

To prevent Android's Out-Of-Memory (`OOM`) process killer from terminating active jobs when the application is minimized, `ResolverServicePlugin.java` starts a persistent Android Foreground Service.

```java
// android/app/src/main/java/com/resolver/client/ResolverServicePlugin.java
@CapacitorPlugin(name = "ResolverService")
public class ResolverServicePlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, ResolverForegroundService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, ResolverForegroundService.class);
        context.stopService(intent);
        call.resolve();
    }
}
```

### 3.2 Silent Audio Keep-Alive Loop

To prevent the Android OS from suspending the JavaScript event loop in background states, `activateKeepAlive()` couples the native service with a muted audio loop (`www/silence.mp3`):

```javascript
// www/js/ui.js
window.activateKeepAlive = function() {
    // 1. Trigger Native Foreground Service & Acquire WakeLock
    if (window.Capacitor && window.Capacitor.Plugins.ResolverService) {
        window.Capacitor.Plugins.ResolverService.start();
    }
    
    // 2. Initialize Muted Audio Stream to preserve CPU execution thread
    const audio = document.getElementById('keepAliveAudio');
    if (audio) {
        audio.play().catch(err => console.log("Audio keep-alive prevented:", err));
    }
};

window.deactivateKeepAlive = function() {
    // 1. Halt Muted Audio Stream
    const audio = document.getElementById('keepAliveAudio');
    if (audio) {
        audio.pause();
    }
    
    // 2. Terminate Native Foreground Service
    if (window.Capacitor && window.Capacitor.Plugins.ResolverService) {
        window.Capacitor.Plugins.ResolverService.stop();
    }
};
```