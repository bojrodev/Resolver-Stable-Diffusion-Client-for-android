package com.resolver.client;

import android.app.ActivityManager;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.webkit.WebView;

import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Iterator;

@CapacitorPlugin(name = "ResolverDevice")
public class ResolverDevicePlugin extends Plugin {

    static final String PREFS = "ResolverPrefs";
    static final String KEY_LIVE_UPDATE = "live_update";
    static final String KEY_NOTIFICATION_ICON = "notification_icon";
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

    // Battery optimization (item 75): whether Resolver is already exempt.
    @PluginMethod()
    public void batteryOptStatus(PluginCall call) {
        JSObject ret = new JSObject();
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        ret.put("exempt", pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        call.resolve(ret);
    }

    // Asks to be exempt: Android's own request screen, or its battery optimization list where that's blocked.
    // Resolves { already: true } when there is nothing to ask, else { opened: true/false }.
    @PluginMethod()
    public void requestBatteryExemption(PluginCall call) {
        Context context = getContext();
        String pkg = context.getPackageName();
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        JSObject ret = new JSObject();
        if (pm != null && pm.isIgnoringBatteryOptimizations(pkg)) {
            ret.put("already", true);
            call.resolve(ret);
            return;
        }
        boolean opened = false;
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + pkg));
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            opened = true;
        } catch (Exception e) {
            try {
                Intent list = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                list.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(list);
                opened = true;
            } catch (Exception e2) { }
        }
        ret.put("already", false);
        ret.put("opened", opened);
        call.resolve(ret);
    }

    @PluginMethod()
    public void getDeviceInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("manufacturer", Build.MANUFACTURER);
        ret.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(ret);
    }

    @PluginMethod()
    public void setNotificationIcon(PluginCall call) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString(KEY_NOTIFICATION_ICON, call.getString("icon", "logo")).apply();
        call.resolve();
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

    // System haptics (the dock's drag-to-switch): "tick" as the highlight moves to another item, "confirm" when a drag
    // ends on one, "tap" for a plain tap. performHapticFeedback needs no VIBRATE permission and follows the phone's own
    // touch-feedback setting, so it feels like the rest of Android.
    @PluginMethod()
    public void haptic(PluginCall call) {
        final String kind = call.getString("kind", "tick");
        getActivity().runOnUiThread(() -> {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                int constant;
                if ("confirm".equals(kind)) {
                    constant = Build.VERSION.SDK_INT >= 30 ? android.view.HapticFeedbackConstants.CONFIRM : android.view.HapticFeedbackConstants.VIRTUAL_KEY;
                } else if ("tap".equals(kind)) {
                    constant = android.view.HapticFeedbackConstants.VIRTUAL_KEY;
                } else {
                    constant = android.view.HapticFeedbackConstants.CLOCK_TICK;
                }
                webView.performHapticFeedback(constant);
            }
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

    // Shares an image (base64) through Android's share sheet, from a copy in the app's cache.
    @PluginMethod()
    public void shareImage(PluginCall call) {
        String data = call.getString("data");
        String name = call.getString("name", "image.png").replaceAll("[\\\\/:*?\"<>|]", "_");
        String mime = call.getString("mime", "image/png");
        if (data == null || data.isEmpty()) {
            call.reject("No image");
            return;
        }
        try {
            File dir = new File(getContext().getCacheDir(), "share");
            if (!dir.exists()) dir.mkdirs();
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) f.delete();
            File file = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(Base64.decode(data, Base64.DEFAULT));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.setClipData(ClipData.newRawUri("", uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, null);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("Share failed: " + e.getMessage());
        }
    }

    // Several images (History's selection): each written to the share folder by shareStage (reset with the first),
    // then shareStaged opens one share sheet for them all, so no single call carries them all at once.
    private File shareDir() {
        File dir = new File(getContext().getCacheDir(), "share");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    @PluginMethod()
    public void shareStage(PluginCall call) {
        String data = call.getString("data");
        String name = call.getString("name", "image.png").replaceAll("[\\\\/:*?\"<>|]", "_");
        if (data == null || data.isEmpty()) {
            call.reject("No image");
            return;
        }
        try {
            File dir = shareDir();
            if (call.getBoolean("reset", false)) {
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
            }
            try (FileOutputStream out = new FileOutputStream(new File(dir, name))) {
                out.write(Base64.decode(data, Base64.DEFAULT));
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Share failed: " + e.getMessage());
        }
    }

    @PluginMethod()
    public void shareStaged(PluginCall call) {
        try {
            File[] files = shareDir().listFiles();
            if (files == null || files.length == 0) {
                call.reject("No images");
                return;
            }
            Arrays.sort(files, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
            ArrayList<Uri> uris = new ArrayList<>();
            ClipData clip = null;
            for (File f : files) {
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
                uris.add(uri);
                if (clip == null) clip = ClipData.newRawUri("", uri);
                else clip.addItem(new ClipData.Item(uri));
            }
            Intent send;
            if (uris.size() == 1) {
                send = new Intent(Intent.ACTION_SEND);
                send.putExtra(Intent.EXTRA_STREAM, uris.get(0));
            } else {
                send = new Intent(Intent.ACTION_SEND_MULTIPLE);
                send.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
            }
            // Images by default; another type (an exported .json) when given.
            send.setType(call.getString("mime", "image/*"));
            send.setClipData(clip);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, null);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("Share failed: " + e.getMessage());
        }
    }
}
