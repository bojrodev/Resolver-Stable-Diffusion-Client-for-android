// Abort Job If App Closes or Disconnects (Config > Experimental, off by default): Forge's job is stopped when the
// app is swiped away (native, ResolverForegroundService), on the next launch after the app closed or crashed
// mid-job, and once the connection is back after it was lost mid-job.
(function () {
    'use strict';

    const ENABLED_KEY = 'bojroAbortJobOnClose';
    // Set while a job runs here; still set at launch means the app closed mid-job.
    const RUNNING_KEY = 'bojroJobRunning';
    const RETRY_MS = 5000, GIVE_UP_MS = 10 * 60 * 1000;

    const enabled = () => localStorage.getItem(ENABLED_KEY) === 'true';
    const busyHere = () => isQueueRunning || isSingleJobRunning || activeJobs.size > 0;

    // While a job runs: the server the native side stops if the app is swiped away.
    function tellNative(running) {
        const dev = window.Capacitor?.Plugins?.ResolverDevice;
        if (!dev || typeof dev.setJobServer !== 'function') return;
        dev.setJobServer(running && enabled() ? { url: HOST, headers: getHeaders() } : { url: '' }).catch(() => {});
    }

    // Retries until Forge answers, for up to 10 minutes. Gives up if a job is started here meanwhile, as that's what it would stop.
    let retrying = false;
    async function interruptWhenReachable() {
        if (retrying) return;
        retrying = true;
        try {
            for (const end = Date.now() + GIVE_UP_MS; Date.now() < end;) {
                if (busyHere()) return;
                try {
                    const { res } = await timedFetch(`${HOST}/sdapi/v1/interrupt`, { method: 'POST', headers: getHeaders() }, RETRY_MS);
                    if (res.ok) return;
                } catch (e) {}
                await new Promise(r => setTimeout(r, RETRY_MS));
            }
        } finally {
            retrying = false;
            localStorage.removeItem(RUNNING_KEY);
        }
    }

    window.JobAbort = {
        started() {
            localStorage.setItem(RUNNING_KEY, '1');
            tellNative(true);
        },
        // connectionLost: the job failed because the connection dropped, so Forge may still be running it.
        ended(connectionLost) {
            tellNative(false);
            // After the job's own clean-up (it's still marked as running here).
            if (connectionLost && enabled()) setTimeout(interruptWhenReachable);
            else localStorage.removeItem(RUNNING_KEY);
        },
        checkOnLaunch() {
            if (!localStorage.getItem(RUNNING_KEY)) return;
            if (enabled()) interruptWhenReachable();
            else localStorage.removeItem(RUNNING_KEY);
        }
    };
})();
