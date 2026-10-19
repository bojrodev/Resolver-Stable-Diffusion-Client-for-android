package com.resolver.client;

import android.app.ActivityManager;
import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkManager;
import androidx.work.WorkerParameters;

public class GenerationWatchdogWorker extends Worker {

    public GenerationWatchdogWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        
        // 1. Check if we EXPECT to be running (Set by Plugin)
        SharedPreferences prefs = context.getSharedPreferences("ResolverPrefs", Context.MODE_PRIVATE);
        boolean shouldBeRunning = prefs.getBoolean("should_be_generating", false);

        if (shouldBeRunning) {
            // 2. Check if we ARE running
            if (!isServiceRunning(context, ResolverForegroundService.class)) {
                // 3. The service only stops while a job is expected when the app's process died with it, and the
                // page that drove the job is gone too, so a restarted notification would never update or clear.
                // Clear the expectation and stop checking instead.
                prefs.edit().putBoolean("should_be_generating", false).apply();
                WorkManager.getInstance(context).cancelUniqueWork("GenerationWatchdog");
            }
        }
        return Result.success();
    }

    private boolean isServiceRunning(Context context, Class<?> serviceClass) {
        ActivityManager manager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        for (ActivityManager.RunningServiceInfo service : manager.getRunningServices(Integer.MAX_VALUE)) {
            if (serviceClass.getName().equals(service.service.getClassName())) {
                return true;
            }
        }
        return false;
    }
}