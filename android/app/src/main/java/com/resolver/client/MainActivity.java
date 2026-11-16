package com.resolver.client;

import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.splashscreen.SplashScreenViewProvider;
import android.webkit.WebView;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private final Handler ui = new Handler(Looper.getMainLooper());
    // The splash screen, kept over the app until the web app has shown itself (ResolverBootPlugin).
    private SplashScreenViewProvider splashView;
    private boolean bootReady = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app draws behind the splash screen, which goes once the app has shown itself, so no blank or half-built
        // frames show. Never longer than 4 seconds.
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setOnExitAnimationListener(view -> {
            splashView = view;
            if (bootReady) dismissSplash();
        });
        ui.postDelayed(this::onBootReady, 4000);

        registerPlugin(ResolverServicePlugin.class);
        registerPlugin(ResolverDevicePlugin.class);
        registerPlugin(ResolverBootPlugin.class);
        super.onCreate(savedInstanceState);
        
        // OLD LOCKS REMOVED:
        // The Service (ResolverForegroundService) now manages the CPU/WiFi locks.
        // This ensures the app stays alive even if this Activity is destroyed.
    }

    // Called on the main thread when the web app has shown itself (or the time limit passes).
    void onBootReady() {
        if (bootReady) return;
        bootReady = true;
        if (splashView != null) dismissSplash();
    }

    private void dismissSplash() {
        SplashScreenViewProvider view = splashView;
        splashView = null;
        // A few frames for the WebView to draw the app it has just shown.
        ui.postDelayed(view::remove, 100);
    }

    @Override
    public void onStart() {
        super.onStart();
        // Optimize WebView for background execution
        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebSettings settings = this.bridge.getWebView().getSettings();
            settings.setJavaScriptCanOpenWindowsAutomatically(true);
            settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

            // The app's background behind the page, so a reload doesn't flash black (ResolverBootPlugin.background()).
            this.bridge.getWebView().setBackgroundColor(getSharedPreferences(ResolverBootPlugin.PREFS, MODE_PRIVATE).getInt(ResolverBootPlugin.KEY_BG, 0xFF0F0518));
            // Hide the WebView's native scroll indicator (CSS cannot reach it).
            this.bridge.getWebView().setVerticalScrollBarEnabled(false);
            this.bridge.getWebView().setHorizontalScrollBarEnabled(false);
            // No overscroll stretch at the ends of the page.
            this.bridge.getWebView().setOverScrollMode(android.view.View.OVER_SCROLL_NEVER);

            // Hide From Accessibility Services, before anything can read the page (ResolverDevicePlugin).
            ResolverDevicePlugin.applyHideFromAccessibility(this.bridge.getWebView(),
                getSharedPreferences(ResolverDevicePlugin.PREFS, android.content.Context.MODE_PRIVATE).getBoolean(ResolverDevicePlugin.KEY_HIDE_A11Y, false));

            // Keep the WebView's renderer at full priority while hidden, so background jobs keep running.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                this.bridge.getWebView().setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
            }
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // CRITICAL: Force JS timers to continue running when backgrounded
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().resumeTimers();
        }
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        // No locks to release here anymore.
    }
}