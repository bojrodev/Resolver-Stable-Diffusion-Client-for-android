package com.resolver.client;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class ResolverForegroundService extends Service {
    
    // Normal importance, silent. New ID as Android never raises a channel's importance; the old one is deleted.
    private static final String CHANNEL_ID = "RESOLVER_PROGRESS_CHANNEL";
    private static final String OLD_CHANNEL_ID = "RESOLVER_FG_CHANNEL";
    private static final int NOTIFICATION_ID = 1002;
    
    // Actions
    public static final String ACTION_START_FOREGROUND_SERVICE = "ACTION_START_FOREGROUND_SERVICE";
    public static final String ACTION_STOP_FOREGROUND_SERVICE = "ACTION_STOP_FOREGROUND_SERVICE";
    public static final String ACTION_UPDATE_PROGRESS = "ACTION_UPDATE_PROGRESS";
    
    // Extras
    public static final String EXTRA_TITLE = "EXTRA_TITLE";
    public static final String EXTRA_BODY = "EXTRA_BODY";
    public static final String EXTRA_PROGRESS = "EXTRA_PROGRESS";
    
    // Locks (CRITICAL: These keep the CPU and WiFi hardware awake)
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    
    // --- Public Service Control Methods ---
    
    public static void startOrUpdateService(Context context, String title, String body, int progress) {
        Intent intent = new Intent(context, ResolverForegroundService.class);
        
        if (progress == 0) {
            intent.setAction(ACTION_START_FOREGROUND_SERVICE);
        } else {
            intent.setAction(ACTION_UPDATE_PROGRESS);
        }
        
        intent.putExtra(EXTRA_TITLE, title);
        intent.putExtra(EXTRA_BODY, body);
        intent.putExtra(EXTRA_PROGRESS, progress);
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }
    
    public static void stopService(Context context) {
        Intent intent = new Intent(context, ResolverForegroundService.class);
        intent.setAction(ACTION_STOP_FOREGROUND_SERVICE);
        context.startService(intent);
    }

    // --- Service Lifecycle & Lock Management ---

    @Override
    public void onCreate() {
        super.onCreate();
        // 1. Setup the WakeLock (Keeps CPU running)
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Resolver:ServiceWakeLock");
            wakeLock.setReferenceCounted(false);
        }

        // 2. Setup the WifiLock (Keeps Internet active)
        WifiManager wifiManager = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifiManager != null) {
            wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Resolver:ServiceWifiLock");
            wifiLock.setReferenceCounted(false);
        }
    }

    private void acquireLocks() {
        if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire();
        if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
    }

    private void releaseLocks() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // CRITICAL: Acquire locks immediately when the service runs
        acquireLocks();

        if (intent != null) {
            String action = intent.getAction();
            
            if (action != null) {
                String title = intent.getStringExtra(EXTRA_TITLE);
                String body = intent.getStringExtra(EXTRA_BODY);
                if (title == null) title = "Processing";
                if (body == null) body = "Initializing...";

                switch (action) {
                    case ACTION_START_FOREGROUND_SERVICE:
                        startForegroundServiceCompat(title, body, 0);
                        break;
                    case ACTION_UPDATE_PROGRESS:
                        int progress = intent.getIntExtra(EXTRA_PROGRESS, 0);
                        // startForeground, not notify(): also covers an update arriving before the start.
                        startForegroundServiceCompat(title, body, progress);
                        break;
                    case ACTION_STOP_FOREGROUND_SERVICE:
                        // Release locks when we explicitly stop
                        releaseLocks();
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                            stopForeground(STOP_FOREGROUND_REMOVE);
                        } else {
                            stopForeground(true);
                        }
                        stopSelf();
                        break;
                }
            }
        }
        // Not restarted after the app's process dies: with no page to update it, the notification would be stuck.
        return START_NOT_STICKY;
    }

    // Swiping the app away from Recents ends the job's notification too (the page that ran it is gone),
    // and tells GenerationWatchdogWorker not to bring it back.
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        interruptJobOnServer();
        getSharedPreferences("ResolverPrefs", Context.MODE_PRIVATE).edit().putBoolean("should_be_generating", false).apply();
        androidx.work.WorkManager.getInstance(this).cancelUniqueWork("GenerationWatchdog");
        releaseLocks();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    // Abort Job If App Closes: tells Forge to stop the job (set by ResolverDevicePlugin.setJobServer while one runs).
    // Waits up to 3 seconds, as the process may end soon after.
    private void interruptJobOnServer() {
        android.content.SharedPreferences prefs = getSharedPreferences(ResolverDevicePlugin.PREFS, Context.MODE_PRIVATE);
        final String server = prefs.getString(ResolverDevicePlugin.KEY_JOB_SERVER, "");
        final String headers = prefs.getString(ResolverDevicePlugin.KEY_JOB_HEADERS, "{}");
        prefs.edit().putString(ResolverDevicePlugin.KEY_JOB_SERVER, "").apply();
        if (server == null || server.isEmpty()) return;
        Thread t = new Thread(() -> {
            java.net.HttpURLConnection conn = null;
            try {
                conn = (java.net.HttpURLConnection) new java.net.URL(server + "/sdapi/v1/interrupt").openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(2500);
                conn.setReadTimeout(2500);
                org.json.JSONObject h = new org.json.JSONObject(headers);
                java.util.Iterator<String> keys = h.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    conn.setRequestProperty(k, h.optString(k));
                }
                conn.setDoOutput(true);
                conn.getOutputStream().close();
                conn.getResponseCode();
            } catch (Exception ignored) {
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
        t.start();
        try { t.join(3000); } catch (InterruptedException ignored) {}
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        releaseLocks(); 
    }

    // --- Notification Management ---

    private boolean channelReady = false;

    private void createNotificationChannel() {
        if (channelReady) return;
        channelReady = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Generation Progress",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Background generation status.");
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.deleteNotificationChannel(OLD_CHANNEL_ID);
                manager.createNotificationChannel(channel);
            }
        }
    }

    // Tap opens the running app (MainActivity is singleTask).
    private PendingIntent openApp;

    private PendingIntent openAppIntent() {
        if (openApp != null) return openApp;
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch == null) return null;
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        // Tells the page the progress notification was tapped (ResolverDevicePlugin).
        launch.putExtra(ResolverDevicePlugin.EXTRA_TAP, "progress");
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        openApp = PendingIntent.getActivity(this, 0, launch, flags);
        return openApp;
    }

    private Notification buildNotification(String title, String body, int progress) {
        createNotificationChannel();
        
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setProgress(100, progress, false)
                .setOnlyAlertOnce(true)
                .setShowWhen(false) // the time would truncate the step count
                .setOngoing(true)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                // Show at once; Android 12+ otherwise delays it up to 10 s, missing quick jobs.
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        PendingIntent open = openAppIntent();
        if (open != null) builder.setContentIntent(open);
        // An empty body leaves the title on its own line ("Generating: Step 42 / 50").
        if (body != null && !body.isEmpty()) builder.setContentText(body);
        // Android 16 Live Update (raw extra, as compileSdk is 35); Config > Experimental.
        if (Build.VERSION.SDK_INT >= 36 && getSharedPreferences(ResolverDevicePlugin.PREFS, Context.MODE_PRIVATE)
                .getBoolean(ResolverDevicePlugin.KEY_LIVE_UPDATE, false)) {
            builder.getExtras().putBoolean("android.requestPromotedOngoing", true);
        }
        return builder.build();
    }
    
    private void startForegroundServiceCompat(String title, String body, int progress) {
        Notification notification = buildNotification(title, body, progress);
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Uses DATA_SYNC to comply with Android 14
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }
    
    
    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}