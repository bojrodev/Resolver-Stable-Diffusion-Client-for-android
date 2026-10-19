package com.resolver.client;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Build;
import android.os.PowerManager;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;

@CapacitorPlugin(name = "ResolverDevice")
public class ResolverDevicePlugin extends Plugin {

    static final String PREFS = "ResolverPrefs";
    static final String KEY_LIVE_UPDATE = "live_update";
    static final String EXTRA_TAP = "resolverNotificationTap";
    static final String KEY_JOB_SERVER = "job_server_url";
    static final String KEY_JOB_HEADERS = "job_server_headers";
    static final String KEY_HIDE_A11Y = "hide_from_accessibility";

    // Progress notification tapped: tell the page (kept until a listener is added).
    @Override
    public void load() {
        reportTap(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        reportTap(intent);
    }

    private void reportTap(Intent intent) {
        if (intent == null || !intent.hasExtra(EXTRA_TAP)) return;
        JSObject data = new JSObject();
        data.put("target", intent.getStringExtra(EXTRA_TAP));
        intent.removeExtra(EXTRA_TAP);
        notifyListeners("notificationTap", data, true);
    }

    // While a job runs with Abort Job If App Closes on: the server to stop if the app is swiped away
    // (ResolverForegroundService.onTaskRemoved). An empty url clears it.
    @PluginMethod()
    public void setJobServer(PluginCall call) {
        String url = call.getString("url", "");
        JSObject headers = call.getObject("headers", new JSObject());
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_JOB_SERVER, url == null ? "" : url)
            .putString(KEY_JOB_HEADERS, headers.toString())
            .apply();
        call.resolve();
    }

    @PluginMethod()
    public void getDeviceInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("manufacturer", Build.MANUFACTURER);
        ret.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(ret);
    }

    @PluginMethod()
    public void setLiveUpdate(PluginCall call) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean(KEY_LIVE_UPDATE, call.getBoolean("enabled", false)).apply();
        call.resolve();
    }

    // Ticks while the page is hidden, waking job timers the WebView would slow to about one a minute.
    private final Handler tickHandler = new Handler(Looper.getMainLooper());
    private boolean ticking = false;
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (!ticking) return;
            notifyListeners("tick", new JSObject());
            tickHandler.postDelayed(this, 500);
        }
    };

    @PluginMethod()
    public void startTicks(PluginCall call) {
        if (!ticking) {
            ticking = true;
            tickHandler.post(tick);
        }
        call.resolve();
    }

    @PluginMethod()
    public void stopTicks(PluginCall call) {
        ticking = false;
        tickHandler.removeCallbacks(tick);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        ticking = false;
        tickHandler.removeCallbacks(tick);
    }

    // Debug log (Config > Experimental): process importance, network state and a native request to the server.
    @PluginMethod()
    public void diag(PluginCall call) {
        final String url = call.getString("url");
        final JSObject headers = call.getObject("headers", new JSObject());
        new Thread(() -> {
            JSObject r = new JSObject();
            try {
                ActivityManager.RunningAppProcessInfo info = new ActivityManager.RunningAppProcessInfo();
                ActivityManager.getMyMemoryState(info);
                r.put("importance", info.importance);
                ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
                if (cm != null) {
                    NetworkInfo ni = cm.getActiveNetworkInfo();
                    r.put("net", ni == null ? "none" : ni.getTypeName() + " " + ni.getDetailedState());
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) r.put("restrictBg", cm.getRestrictBackgroundStatus());
                }
                PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    r.put("powerSave", pm.isPowerSaveMode());
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) r.put("idle", pm.isDeviceIdleMode());
                }
            } catch (Exception e) {
                r.put("stateError", e.toString());
            }
            if (url != null) {
                long t0 = System.currentTimeMillis();
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(5000);
                    c.setReadTimeout(5000);
                    Iterator<String> keys = headers.keys();
                    while (keys.hasNext()) {
                        String k = keys.next();
                        c.setRequestProperty(k, headers.optString(k));
                    }
                    int code = c.getResponseCode();
                    r.put("probe", "HTTP " + code + " in " + (System.currentTimeMillis() - t0) + "ms");
                } catch (Exception e) {
                    r.put("probe", e.getClass().getSimpleName() + ": " + e.getMessage() + " after " + (System.currentTimeMillis() - t0) + "ms");
                } finally {
                    if (c != null) c.disconnect();
                }
            }
            call.resolve(r);
        }).start();
    }

    // Hide From Accessibility Services: accessibility services (screen readers, and apps like Bitdefender) can't read
    // the page. Reading a WebView's whole page runs on the main thread, so a service that keeps asking causes stalls.
    @PluginMethod()
    public void setHideFromAccessibility(PluginCall call) {
        final boolean hide = call.getBoolean("hide", false);
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_HIDE_A11Y, hide).apply();
        getActivity().runOnUiThread(() -> {
            applyHideFromAccessibility(getBridge().getWebView(), hide);
            call.resolve();
        });
    }

    static void applyHideFromAccessibility(WebView webView, boolean hide) {
        if (webView == null) return;
        webView.setImportantForAccessibility(hide ? View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS : View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
    }

    // Fullscreen viewer: hides or shows the status bar (swiping down shows it briefly).
    @PluginMethod()
    public void setStatusBarHidden(PluginCall call) {
        final boolean hidden = call.getBoolean("hidden", false);
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(window, window.getDecorView());
            c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            if (hidden) c.hide(WindowInsetsCompat.Type.statusBars());
            else c.show(WindowInsetsCompat.Type.statusBars());
            call.resolve();
        });
    }

    // Opens Settings > Notifications (Samsung's filter has no direct intent), else Settings.
    @PluginMethod()
    public void openNotificationSettings(PluginCall call) {
        String[] actions = { "android.settings.NOTIFICATION_SETTINGS", Settings.ACTION_SETTINGS };
        for (String action : actions) {
            try {
                Intent intent = new Intent(action);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
                return;
            } catch (Exception ignored) {
            }
        }
        call.reject("Settings unavailable");
    }
}
