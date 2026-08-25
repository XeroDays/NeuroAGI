/**
 * Home-screen software update / release popup.
 * Driven by Softasium license Register response (build number compare).
 */

/** @type {{
 *   payload: object | null,
 *   filename: string | null,
 *   installerExists: boolean,
 *   forceUpdate: boolean,
 *   downloading: boolean,
 *   mode: 'download' | 'install',
 * }} */
const state = {
  payload: null,
  filename: null,
  installerExists: false,
  forceUpdate: false,
  downloading: false,
  mode: 'download',
};

let unsubscribeProgress = null;
let uiWired = false;

function els() {
  return {
    btnNewRelease: document.getElementById('btn-new-release'),
    overlay: document.getElementById('release-overlay'),
    title: document.getElementById('release-title'),
    notes: document.getElementById('release-notes'),
    status: document.getElementById('release-status'),
    btnClose: document.getElementById('btn-release-close'),
    btnAction: document.getElementById('btn-release-download'),
    progress: document.getElementById('release-download-progress'),
    progressBar: document.getElementById('release-progress-bar'),
    percent: document.getElementById('release-download-percent'),
  };
}

function payloadField(payload, camelKey, pascalKey) {
  if (!payload) return undefined;
  const value = payload[camelKey] ?? payload[pascalKey];
  return value == null ? undefined : value;
}

function isForceUpdate(payload) {
  return payloadField(payload, 'forceUpdate', 'ForceUpdate') === true;
}

export function isForceUpdateLocked() {
  const { overlay } = els();
  return state.forceUpdate && overlay && !overlay.hidden;
}

function setStatus(message) {
  const { status } = els();
  if (!status) return;
  const text = message ? String(message) : '';
  status.hidden = !text;
  status.textContent = text;
}

function setProgress(percent) {
  const { progressBar, percent: percentEl } = els();
  const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  if (progressBar) progressBar.style.width = `${value}%`;
  if (percentEl) percentEl.textContent = `${value}%`;
}

function setProgressVisible(visible, percent) {
  const { progress } = els();
  if (progress) progress.hidden = !visible;
  if (visible) setProgress(percent ?? 0);
}

function setActionMode(mode) {
  const { btnAction } = els();
  state.mode = mode;
  if (!btnAction) return;

  if (mode === 'downloading') {
    btnAction.hidden = true;
    setProgressVisible(true, 0);
    return;
  }

  setProgressVisible(false);
  btnAction.hidden = false;
  btnAction.disabled = false;
  btnAction.textContent = mode === 'install' ? 'Install Now' : 'Download Now';
  btnAction.dataset.mode = mode;
}

function applyForceChrome(force) {
  state.forceUpdate = force;
  const { overlay } = els();
  if (overlay) overlay.classList.toggle('is-force-update', force);
}

async function quitApplication() {
  try {
    await window.electronAPI?.quitApp?.();
  } catch (err) {
    console.error('[release] quitApp failed:', err?.message || err);
  }
}

function formatReleaseTitle(payload) {
  const latest = payloadField(payload, 'latestVersion', 'LatestVersion');
  const build = payloadField(payload, 'buildVersion', 'BuildVersion');

  if (latest == null || latest === '') {
    return 'New Release';
  }

  const versionText = `Version ${String(latest)}`;
  if (build != null && build !== '' && Number.isFinite(Number(build))) {
    return `${versionText} (Build ${Number(build)})`;
  }

  return versionText;
}

function fillModalFromPayload(payload) {
  const { title, notes } = els();
  if (title) title.textContent = formatReleaseTitle(payload);

  if (notes) {
    const raw = payloadField(payload, 'releaseNotes', 'ReleaseNotes');
    notes.textContent = raw != null && String(raw).trim()
      ? String(raw)
      : 'No release notes provided.';
  }
}

async function refreshInstallerState() {
  if (!state.filename) {
    setActionMode('download');
    return;
  }

  try {
    const result = await window.electronAPI?.checkSoftwareInstaller?.(state.filename);
    state.filename = result?.filename || state.filename;
    state.installerExists = !!(result && (result.installerExists || result.exists));
    if (!state.downloading) {
      setActionMode(state.installerExists ? 'install' : 'download');
    }
  } catch (err) {
    console.error('[release] checkSoftwareInstaller failed:', err?.message || err);
    state.installerExists = false;
    setActionMode('download');
  }
}

function closeReleaseModal() {
  if (state.forceUpdate) return;
  const { overlay } = els();
  if (overlay) overlay.hidden = true;
}

async function openReleaseModal() {
  if (!state.payload) return;

  const { overlay } = els();
  if (!overlay) return;

  fillModalFromPayload(state.payload);
  applyForceChrome(isForceUpdate(state.payload));
  setStatus('');

  if (!state.downloading) {
    await refreshInstallerState();
  }

  overlay.hidden = false;
}

async function startDownload() {
  if (!state.payload || state.downloading) return;

  const url = payloadField(state.payload, 'downloadUrl', 'DownloadUrl');
  if (!url) {
    setStatus('Download URL is missing from the license server.');
    return;
  }

  state.downloading = true;
  setStatus('');
  setActionMode('downloading');

  unsubscribeProgress?.();
  unsubscribeProgress = window.electronAPI?.onSoftwareDownloadProgress?.((data) => {
    setProgressVisible(true, data?.percent ?? 0);
  }) ?? null;

  try {
    const result = await window.electronAPI?.downloadSoftwareUpdate?.({
      url,
      fileName: state.filename,
    });

    if (!result?.ok) {
      throw new Error(result?.error || 'Download failed.');
    }

    state.filename = result.filename || state.filename;
    state.installerExists = true;
    setActionMode('install');
    setStatus('Installer is ready. Click Install Now.');
  } catch (err) {
    console.error('[release] download failed:', err?.message || err);
    setStatus(err?.message ?? 'Could not download the update.');
    setActionMode('download');
  } finally {
    unsubscribeProgress?.();
    unsubscribeProgress = null;
    state.downloading = false;
  }
}

async function startInstall() {
  if (!state.filename) {
    await refreshInstallerState();
    if (!state.filename) {
      setStatus('Installer file was not found in Downloads.');
      return;
    }
  }

  const { btnAction } = els();
  if (btnAction) btnAction.disabled = true;
  setStatus('');

  try {
    const result = await window.electronAPI?.installSoftwareUpdate?.(state.filename);
    if (!result?.ok) {
      throw new Error(result?.error || 'Install failed.');
    }
  } catch (err) {
    console.error('[release] install failed:', err?.message || err);
    setStatus(err?.message ?? 'Could not open the installer.');
    if (btnAction) btnAction.disabled = false;
  }
}

async function onActionClick() {
  if (state.mode === 'install') {
    await startInstall();
    return;
  }
  await startDownload();
}

function wireReleaseUiOnce() {
  if (uiWired) return;
  uiWired = true;

  const { btnNewRelease, overlay, btnClose, btnAction } = els();

  btnNewRelease?.addEventListener('click', () => {
    openReleaseModal();
  });

  btnClose?.addEventListener('click', () => {
    if (state.forceUpdate) {
      void quitApplication();
      return;
    }
    closeReleaseModal();
  });

  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay && !state.forceUpdate) {
      closeReleaseModal();
    }
  });

  btnAction?.addEventListener('click', () => {
    onActionClick();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!overlay || overlay.hidden || state.forceUpdate) return;
    closeReleaseModal();
  });
}

function applyLicenseResult(result) {
  const { btnNewRelease, overlay } = els();

  if (!result || !result.updateAvailable || !result.payload) {
    if (btnNewRelease) btnNewRelease.hidden = true;
    state.payload = null;
    state.filename = null;
    state.installerExists = false;
    if (overlay && !overlay.hidden && !state.forceUpdate) {
      overlay.hidden = true;
    }
    return;
  }

  state.payload = result.payload;
  state.filename = result.filename || null;
  state.installerExists = !!result.installerExists;

  if (btnNewRelease) btnNewRelease.hidden = false;

  if (isForceUpdate(result.payload)) {
    openReleaseModal();
  }
}

/**
 * Apply Softasium license snapshot (registered at app startup) to the home UI.
 */
export async function initReleaseUpdate() {
  wireReleaseUiOnce();

  if (typeof window.electronAPI?.onLicenseUpdate === 'function') {
    window.electronAPI.onLicenseUpdate((result) => applyLicenseResult(result));
  }

  try {
    const result = await window.electronAPI?.getLicenseUpdate?.()
      ?? await window.electronAPI?.registerSoftwareLicense?.();
    applyLicenseResult(result);
  } catch (err) {
    console.error('[release] initReleaseUpdate failed:', err?.message || err);
    const { btnNewRelease } = els();
    if (btnNewRelease) btnNewRelease.hidden = true;
  }
}
