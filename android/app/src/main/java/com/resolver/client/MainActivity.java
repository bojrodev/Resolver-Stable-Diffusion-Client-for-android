package com.resolver.client;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ResolverServicePlugin.class);
        super.onCreate(savedInstanceState);
        
        // OLD LOCKS REMOVED:
        // The Service (ResolverForegroundService) now manages the CPU/WiFi locks.
        // This ensures the app stays alive even if this Activity is destroyed.
    }

    @Override
    public void onStart() {
        super.onStart();
        // Optimize WebView for background execution
        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebSettings settings = this.bridge.getWebView().getSettings();
            settings.setJavaScriptCanOpenWindowsAutomatically(true);
            settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

            // Hide the WebView's native scroll indicator (CSS cannot reach it).
            this.bridge.getWebView().setVerticalScrollBarEnabled(false);
            this.bridge.getWebView().setHorizontalScrollBarEnabled(false);
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