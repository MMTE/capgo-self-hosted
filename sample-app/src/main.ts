import { CapacitorUpdater } from '@capgo/capacitor-updater';

const APP_VERSION = '1.0.1';

// DOM elements
const versionEl = document.getElementById('current-version')!;
const checkBtn = document.getElementById('check-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status')!;
const progressBar = document.getElementById('progress-bar')!;
const progressFill = document.getElementById('progress-fill')!;

function setStatus(msg: string, type: '' | 'success' | 'error' | 'info' = '') {
  statusEl.textContent = msg;
  statusEl.className = type ? `status-${type}` : '';
}

function showProgress(percent: number) {
  progressBar.style.display = 'block';
  progressFill.style.width = `${Math.min(100, Math.round(percent))}%`;
}

function hideProgress() {
  progressBar.style.display = 'none';
  progressFill.style.width = '0%';
}

async function init() {
  versionEl.textContent = APP_VERSION;

  // REQUIRED: Call notifyAppReady within 10 seconds of app start
  // This tells Capgo the current bundle loaded successfully
  // If not called, the plugin will auto-rollback to the previous bundle
  try {
    await CapacitorUpdater.notifyAppReady();
    console.log('[capgo] notifyAppReady called - bundle is healthy');
  } catch (err) {
    console.warn('[capgo] notifyAppReady failed (expected in browser):', err);
  }

  // Listen for download progress events
  CapacitorUpdater.addListener('download', (progress: any) => {
    const pct = progress.percent || 0;
    showProgress(pct);
    setStatus(`Downloading update... ${Math.round(pct)}%`, 'info');
  });
}

// Manual update check button
// Note: With autoUpdate: true, this is optional - updates are checked automatically
checkBtn.addEventListener('click', async () => {
  checkBtn.disabled = true;
  hideProgress();
  setStatus('Checking for updates...', 'info');

  try {
    // Get the latest bundle info from the server
    const latest = await CapacitorUpdater.getLatest();
    
    if (latest && latest.version && latest.version !== APP_VERSION) {
      showProgress(0);
      const newVersion = String(latest.version);
      setStatus(`Update v${newVersion} found. Downloading...`, 'info');
      
      // Download the bundle
      const downloaded = await CapacitorUpdater.download({
        version: newVersion,
        url: String(latest.url || '')
      });
      
      showProgress(100);
      setStatus(`Update v${downloaded.version} downloaded!`, 'success');
      
      // Ask user before applying
      const apply = confirm(`Update to v${downloaded.version} is ready. Apply and reload the app?`);
      if (apply) {
        setStatus('Applying update...', 'info');
        await CapacitorUpdater.set(downloaded);
        // App will reload automatically
      } else {
        setStatus('Update downloaded but not applied.', 'info');
      }
    } else {
      setStatus('✓ You are on the latest version.', 'success');
    }
  } catch (err: any) {
    hideProgress();
    const msg = err?.message || String(err);
    if (msg.includes('no_new_version') || msg.includes('No new version')) {
      setStatus('✓ You are on the latest version.', 'success');
    } else {
      setStatus(`Error: ${msg}`, 'error');
      console.error('[capgo] update check failed:', err);
    }
  } finally {
    checkBtn.disabled = false;
  }
});

init();
