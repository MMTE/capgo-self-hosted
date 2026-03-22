import { CapacitorUpdater, BundleInfo } from '@capgo/capacitor-updater';
import { App } from '@capacitor/app';

const APP_VERSION = '1.0.1';

// DOM
const versionEl = document.getElementById('current-version')!;
const checkBtn = document.getElementById('check-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status')!;
const progressBar = document.getElementById('progress-bar')!;
const progressFill = document.getElementById('progress-fill')!;
const banner = document.getElementById('update-banner')!;
const bannerText = document.getElementById('banner-text')!;
const bannerUpdateBtn = document.getElementById('banner-update-btn')!;
const bannerDismissBtn = document.getElementById('banner-dismiss-btn')!;

let pendingBundle: BundleInfo | null = null;
let bannerDismissedThisSession = false;

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

function showBanner(version: string) {
  bannerText.textContent = `Update v${version} is ready!`;
  banner.classList.add('visible');
}

function hideBanner() {
  banner.classList.remove('visible');
}

async function applyUpdate() {
  if (!pendingBundle) return;
  setStatus('Applying update...', 'info');
  bannerText.textContent = 'Applying update...';
  bannerUpdateBtn.setAttribute('disabled', 'true');
  try {
    await CapacitorUpdater.set(pendingBundle);
  } catch (err: any) {
    setStatus(`Failed to apply: ${err?.message || err}`, 'error');
    bannerUpdateBtn.removeAttribute('disabled');
  }
}

async function checkForUpdate() {
  try {
    const latest = await CapacitorUpdater.getLatest();

    if (!latest?.version || latest.version === APP_VERSION) {
      return null;
    }

    setStatus(`Downloading v${latest.version}...`, 'info');
    showProgress(0);

    const bundle = await CapacitorUpdater.download({
      version: String(latest.version),
      url: String(latest.url || ''),
    });

    showProgress(100);
    hideProgress();
    setStatus(`Update v${bundle.version} ready.`, 'success');
    return bundle;
  } catch (err: any) {
    hideProgress();
    const msg = err?.message || String(err);
    if (msg.includes('no_new_version') || msg.includes('No new version')) {
      return null;
    }
    console.error('[capgo] update check failed:', err);
    return null;
  }
}

async function backgroundCheck() {
  const bundle = await checkForUpdate();
  if (bundle) {
    pendingBundle = bundle;
    if (!bannerDismissedThisSession) {
      showBanner(bundle.version);
    }
  }
}

async function init() {
  versionEl.textContent = APP_VERSION;

  // REQUIRED: signals this bundle is healthy — without it Capgo rolls back
  try {
    await CapacitorUpdater.notifyAppReady();
    console.log('[capgo] notifyAppReady — bundle confirmed healthy');
  } catch (err) {
    console.warn('[capgo] notifyAppReady failed (expected in browser):', err);
  }

  CapacitorUpdater.addListener('download', (progress: any) => {
    showProgress(progress.percent || 0);
  });

  // Check on launch (non-blocking)
  backgroundCheck();

  // Re-check when app resumes from background
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      bannerDismissedThisSession = false;
      backgroundCheck();
    }
  });
}

// Banner: "Update now" button
bannerUpdateBtn.addEventListener('click', () => applyUpdate());

// Banner: dismiss (×) — hides for this session only, reappears on next resume
bannerDismissBtn.addEventListener('click', () => {
  bannerDismissedThisSession = true;
  hideBanner();
});

// Manual check button
checkBtn.addEventListener('click', async () => {
  checkBtn.disabled = true;
  hideProgress();
  setStatus('Checking for updates...', 'info');

  const bundle = await checkForUpdate();
  if (bundle) {
    pendingBundle = bundle;
    showBanner(bundle.version);
    bannerDismissedThisSession = false;
  } else if (!pendingBundle) {
    setStatus('You are on the latest version.', 'success');
  }

  checkBtn.disabled = false;
});

init();
