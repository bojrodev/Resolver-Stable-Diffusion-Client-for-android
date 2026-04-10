// www/js/updater.js

// 1. Notify the phone that the web app has loaded
if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorUpdater) {
    try {
        window.Capacitor.Plugins.CapacitorUpdater.notifyAppReady();
    } catch(e) { console.warn("Updater notify failed", e); }
}

/**
 * TOOL: Resets the app to the original installation (Code Fixer)
 */
window.resetNativeUpdater = async function() {
    if (!window.Capacitor || !window.Capacitor.Plugins.CapacitorUpdater) {
        console.warn("Capacitor Updater not found.");
        return;
    }
    
    // We assume the user already confirmed in cfg.js
    try {
        await window.Capacitor.Plugins.CapacitorUpdater.reset();
        // Reloading will switch back to the built-in bundle
        window.location.reload(); 
    } catch (e) {
        console.error(e);
        alert("Reset failed: " + e.message);
    }
};

/**
 * Checks for updates
 */
async function checkForAppUpdate(silent = false) {
    const Updater = window.Capacitor && window.Capacitor.Plugins ? window.Capacitor.Plugins.CapacitorUpdater : null;

    if (!Updater) {
        if (!silent) console.warn("Updater plugin missing (Web Mode?)");
        return;
    }

    try {
        if (!silent && typeof Toast !== 'undefined') {
            Toast.show({text: 'Checking for updates...', duration: 'short'});
        }

        const UPDATE_URL = 'https://raw.githubusercontent.com/bojrodev/Resolver-Stable-Diffusion-Client-for-android/dev/v2ersion.json';
        
        // IMPORTANT: Update this number manually when you release a new version
        const currentVersion = '2.1';
        // ---------------------

        const response = await fetch(UPDATE_URL + '?t=' + new Date().getTime());
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        
        const remoteData = await response.json();
        const skippedVersion = localStorage.getItem('bojro_skip_version');

        if (isNewer(currentVersion, remoteData.version)) {
            if (silent && skippedVersion === remoteData.version) {
                console.log(`Skipping update v${remoteData.version}`);
                return; 
            }
            showUpdateModal(remoteData, Updater);
        } else {
             if (!silent && typeof Toast !== 'undefined') {
                 Toast.show({text: 'You are up to date (v' + currentVersion + ')', duration: 'short'});
             }
        }

    } catch (error) {
        console.error(error);
        if (!silent && typeof Toast !== 'undefined') {
            Toast.show({text: 'Update check failed', duration: 'short'});
        }
    }
}

function showUpdateModal(data, UpdaterPlugin) {
    const modal = document.getElementById('updateModal');
    const badge = document.getElementById('updateVersionBadge');
    const notes = document.getElementById('updateNotes');
    const btnUpdate = document.getElementById('btnDoUpdate');
    const btnSkip = document.getElementById('btnSkipUpdate');
    const skipTag = document.getElementById('skipVersionTag');

    if (!modal) return;

    if (badge) badge.innerText = `v${data.version}`;
    if (notes) notes.innerText = data.note || "New features and improvements.";
    if (skipTag) skipTag.innerText = data.version;

    btnUpdate.onclick = async () => {
        btnUpdate.disabled = true;
        btnUpdate.innerHTML = `<div class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:8px;"></div> DOWNLOADING...`;
        
        try {
            const update = await UpdaterPlugin.download({
                url: data.url,
                version: data.version
            });
            btnUpdate.innerHTML = `RESTARTING...`;
            await UpdaterPlugin.set(update);
        } catch (e) {
            console.error(e);
            alert("Download Failed: " + e.message);
            btnUpdate.disabled = false;
            btnUpdate.innerHTML = `<i data-lucide="download-cloud"></i> RETRY`;
        }
    };

    if (btnSkip) {
        btnSkip.onclick = () => {
            localStorage.setItem('bojro_skip_version', data.version);
            modal.classList.add('hidden');
        };
    }
    modal.classList.remove('hidden');
}

function isNewer(current, remote) {
    const c = current.split('.').map(Number);
    const r = remote.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if ((r[i] || 0) > (c[i] || 0)) return true;
        if ((r[i] || 0) < (c[i] || 0)) return false;
    }
    return false;
}