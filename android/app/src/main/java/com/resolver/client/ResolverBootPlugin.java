package com.resolver.client;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// The web app calls ready() once it has shown itself (revealApp(), boot.js), so the splash screen can go.
@CapacitorPlugin(name = "ResolverBoot")
public class ResolverBootPlugin extends Plugin {

    static final String PREFS = "resolver_boot", KEY_BG = "bg";

    // The page's background (#rrggbb), kept behind the WebView so a reload doesn't flash black (MainActivity).
    @PluginMethod
    public void background(PluginCall call) {
        int parsed;
        try { parsed = android.graphics.Color.parseColor(call.getString("color", "")); } catch (Exception e) { call.reject("Bad colour"); return; }
        final int colour = parsed;
        getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE).edit().putInt(KEY_BG, colour).apply();
        getActivity().runOnUiThread(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().setBackgroundColor(colour);
        });
        call.resolve();
    }

    @PluginMethod
    public void ready(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (getActivity() instanceof MainActivity) ((MainActivity) getActivity()).onBootReady();
        });
        call.resolve();
    }
}
