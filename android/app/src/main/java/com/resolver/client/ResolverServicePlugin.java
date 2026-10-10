package com.resolver.client;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "ResolverService")
public class ResolverServicePlugin extends Plugin {

    // Registered in load() and unregistered in handleOnDestroy().
    private ConnectivityManager.NetworkCallback networkCallback;

    @Override
    public void load() {
        super.load();
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
                notifyListeners("networkTypeChanged", currentNetworkTypeResult());
            }
            @Override
            public void onLost(Network network) {
                notifyListeners("networkTypeChanged", currentNetworkTypeResult());
            }
        };
        // Tracks the system's active network, the same one getNetworkType() reads.
        cm.registerDefaultNetworkCallback(networkCallback);
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (networkCallback != null) {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null) {
                try {
                    cm.unregisterNetworkCallback(networkCallback);
                } catch (IllegalArgumentException e) {
                    // Already unregistered or never registered.
                }
            }
            networkCallback = null;
        }
    }

    // Returns "wifi", "cellular", "ethernet", "other", "none" (no active network) or "unknown".
    // Cellular generations are not distinguished; Live Preview only needs Wi-Fi or not.
    private String getCurrentNetworkTypeString() {
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return "unknown";
        Network network = cm.getActiveNetwork();
        if (network == null) return "none";
        NetworkCapabilities caps = cm.getNetworkCapabilities(network);
        if (caps == null) return "unknown";
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return "wifi";
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return "cellular";
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) return "ethernet";
        return "other";
    }

    private JSObject currentNetworkTypeResult() {
        JSObject ret = new JSObject();
        ret.put("type", getCurrentNetworkTypeString());
        return ret;
    }

    // One-off check, for before any networkTypeChanged event has fired.
    @PluginMethod()
    public void getNetworkType(PluginCall call) {
        call.resolve(currentNetworkTypeResult());
    }

    @PluginMethod()
    public void updateProgress(PluginCall call) {
        String title = call.getString("title", "Processing");
        String body = call.getString("body", "Preparing...");
        int progress = call.getInt("progress", 0);

        // 1. Tell Watchdog we EXPECT to be running (Logic Added)
        setExpectation(true, title, body);

        // 2. Start the Service
        ResolverForegroundService.startOrUpdateService(getContext(), title, body, progress);
        
        // 3. Schedule the Watchdog (Logic Added)
        scheduleWatchdog();

        call.resolve();
    }
    
    @PluginMethod()
    public void stop(PluginCall call) {
        // 1. Tell Watchdog we are stopping intentionally (Logic Added)
        setExpectation(false, null, null);
        
        // 2. Stop the Service
        ResolverForegroundService.stopService(getContext());

        // 3. Cancel the Watchdog so it doesn't restart us (Logic Added)
        WorkManager.getInstance(getContext()).cancelUniqueWork("GenerationWatchdog");

        call.resolve();
    }

    // --- Battery Optimization Request (Kept as is) ---
    @PluginMethod()
    public void requestBatteryOpt(PluginCall call) {
        Context context = getContext();
        String packageName = context.getPackageName();
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        
        if (pm != null && !pm.isIgnoringBatteryOptimizations(packageName)) {
            Intent intent = new Intent();
            intent.setAction(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + packageName));
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        }
        call.resolve();
    }

    // --- HELPER METHODS (These were missing!) ---

    private void setExpectation(boolean isRunning, String title, String body) {
        SharedPreferences prefs = getContext().getSharedPreferences("ResolverPrefs", Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putBoolean("should_be_generating", isRunning);
        if (title != null) editor.putString("last_title", title);
        if (body != null) editor.putString("last_body", body);
        editor.apply();
    }

    private void scheduleWatchdog() {
        // Schedule a check every 15 minutes (Android's minimum allowed interval)
        PeriodicWorkRequest watchdogRequest =
            new PeriodicWorkRequest.Builder(GenerationWatchdogWorker.class, 15, TimeUnit.MINUTES)
                .build();

        WorkManager.getInstance(getContext()).enqueueUniquePeriodicWork(
            "GenerationWatchdog",
            ExistingPeriodicWorkPolicy.KEEP, // Don't replace if it's already scheduled
            watchdogRequest
        );
    }
}