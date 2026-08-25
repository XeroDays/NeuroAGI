const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { app, shell } = require('electron');
const { getMachineId } = require('../helpers/machine-id');
const { buildDeviceInfoString } = require('../helpers/device-info');
const licenseCacheStore = require('./license-cache-store');

const SOFTWARE_APP_ID = "NeuroAGI";
const BUILD_VERSION = 1;
const REGISTER_URL = "https://api.softasium.com/api/SoftwareLicencing/Register";
const REGISTER_AUTH_BEARER = "iamsyedidrees@gmail.com";
const FALLBACK_INSTALLER_NAME = "NeuroAGI-Update.exe";

const pkg = require('../../../package.json');
const VERSION_NAME = typeof pkg.version === 'string' ? pkg.version : '0.0.0';

/** @type {object | null} */
let cachedPayload = null;

/** @type {Promise<object> | null} */
let registerInFlight = null;

/** @type {boolean} */
let downloading = false;

function getBuildVersion() {
  return BUILD_VERSION;
}

function getVersionName() {
  return VERSION_NAME;
}

function getDownloadsDir() {
  return app.getPath('downloads');
}

function sanitizeFilenamePart(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim();
}

function sanitizeFileName(name) {
  const base = path.basename(String(name || '').trim());
  if (!base || base === '.' || base === '..') return '';
  return base;
}

function pickField(response, ...keys) {
  if (!response || typeof response !== 'object') return undefined;
  for (const key of keys) {
    if (response[key] != null && response[key] !== '') return response[key];
  }
  const lowerMap = Object.create(null);
  for (const [k, v] of Object.entries(response)) {
    lowerMap[String(k).toLowerCase()] = v;
  }
  for (const key of keys) {
    const v = lowerMap[String(key).toLowerCase()];
    if (v != null && v !== '') return v;
  }
  return undefined;
}

function getPayloadString(payload, camelKey, pascalKey) {
  const value = pickField(payload, camelKey, pascalKey);
  return typeof value === 'string' ? value.trim() : '';
}

function getPayloadNumber(payload, camelKey, pascalKey) {
  return Number(pickField(payload, camelKey, pascalKey));
}

function getDownloadExtension(downloadUrl) {
  if (!downloadUrl || typeof downloadUrl !== 'string') return '';
  try {
    const pathname = new URL(downloadUrl).pathname || '';
    return path.extname(pathname) || '';
  } catch {
    return '';
  }
}

function getInstallerFilenameFromUrl(downloadUrl) {
  if (!downloadUrl || typeof downloadUrl !== 'string') return '';
  try {
    const pathname = new URL(downloadUrl).pathname || '';
    const base = path.basename(pathname);
    if (base && base !== '/' && base !== '.') {
      return decodeURIComponent(base);
    }
  } catch {
    // fallback
  }
  return '';
}

function getInstallerFilename(payload, downloadUrl) {
  const ext = getDownloadExtension(downloadUrl);
  if (!payload || typeof payload !== 'object') {
    return getInstallerFilenameFromUrl(downloadUrl) || FALLBACK_INSTALLER_NAME;
  }

  const appId = getPayloadString(payload, 'appID', 'AppID') || SOFTWARE_APP_ID;
  const latestVersion = getPayloadString(payload, 'latestVersion', 'LatestVersion');
  const buildVersion = getPayloadNumber(payload, 'buildVersion', 'BuildVersion');

  if (!latestVersion || !Number.isFinite(buildVersion)) {
    return getInstallerFilenameFromUrl(downloadUrl) || FALLBACK_INSTALLER_NAME;
  }

  const safeAppId = sanitizeFilenamePart(appId);
  const safeVersion = sanitizeFilenamePart(latestVersion);
  return `${safeAppId}V.${safeVersion}+${buildVersion}${ext}`;
}

function getInstallerPath(filename) {
  const safeName = filename || FALLBACK_INSTALLER_NAME;
  return path.join(getDownloadsDir(), safeName);
}

function hasLocalInstaller(filename) {
  try {
    return fs.existsSync(getInstallerPath(filename));
  } catch {
    return false;
  }
}

function isPathInsideDownloads(filePath) {
  const downloads = path.resolve(getDownloadsDir());
  const resolved = path.resolve(filePath);
  return resolved === downloads || resolved.startsWith(downloads + path.sep);
}

function isAccessGranted(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const status = payload.status ?? payload.Status;
  return status === true;
}

function isUpdateAvailable(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const remoteBuild = getPayloadNumber(payload, 'buildVersion', 'BuildVersion');
  if (!Number.isFinite(remoteBuild)) return false;
  return getBuildVersion() < remoteBuild;
}

function buildRegisterResult(fromCache = false) {
  const base = getCachedUpdate();
  return {
    ...base,
    accessGranted: isAccessGranted(cachedPayload),
    fromCache,
  };
}

function getCachedUpdate() {
  const payload = cachedPayload;
  if (!payload) {
    return {
      ok: false,
      payload: null,
      updateAvailable: false,
      installerExists: false,
      filename: null,
      accessGranted: false,
    };
  }

  const downloadUrl = getPayloadString(payload, 'downloadUrl', 'DownloadUrl');
  const filename = getInstallerFilename(payload, downloadUrl);
  return {
    ok: true,
    payload,
    updateAvailable: isUpdateAvailable(payload),
    installerExists: hasLocalInstaller(filename),
    filename,
    accessGranted: isAccessGranted(payload),
  };
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      return reject(err);
    }

    const payload = JSON.stringify(body);
    const transport = parsed.protocol === 'http:' ? http : https;
    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Accept: 'application/json',
          Authorization: `Bearer ${REGISTER_AUTH_BEARER}`,
          "User-Agent": `NeuroAGI/${VERSION_NAME}`,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          const statusCode = res.statusCode ?? 0;
          if (statusCode < 200 || statusCode >= 300) {
            const detail = raw?.trim() ? ` ${raw.trim().slice(0, 300)}` : '';
            return reject(new Error(`License register failed (${statusCode}).${detail}`));
          }
          try {
            resolve(JSON.parse(raw || '{}'));
          } catch {
            reject(new Error('License register returned invalid JSON.'));
          }
        });
      },
    );

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error('License register request timed out.'));
    });
    req.write(payload);
    req.end();
  });
}

/**
 * Perform Softasium Register once. Subsequent calls return the cached result
 * for the lifetime of the process.
 * @returns {Promise<object>}
 */
async function register() {
  if (cachedPayload) {
    return buildRegisterResult(false);
  }
  if (registerInFlight) return registerInFlight;

  registerInFlight = (async () => {
    await new Promise((resolve) => setImmediate(resolve));

    const machine = getMachineId();
    const deviceInfo = buildDeviceInfoString(machine.machineId);
    const requestBody = {
      DeviceUUID: machine.machineId,
      DeviceInfo: deviceInfo,
      AppID: SOFTWARE_APP_ID,
      BuildVersion: BUILD_VERSION,
      VersionName: VERSION_NAME,
    };

    console.log(
      '[license] Register:',
      `AppID=${SOFTWARE_APP_ID}`,
      `BuildVersion=${BUILD_VERSION}`,
      `VersionName=${VERSION_NAME}`,
      `DeviceUUID=${machine.machineId}`,
    );

    try {
      const response = await postJson(REGISTER_URL, requestBody);
      cachedPayload = response && typeof response === 'object' ? response : null;
      if (cachedPayload) {
        licenseCacheStore.saveRegisterResponse(cachedPayload);
      }
      const result = buildRegisterResult(false);
      console.log(
        '[license] Register ok:',
        `remoteBuild=${getPayloadNumber(cachedPayload, 'buildVersion', 'BuildVersion')}`,
        `updateAvailable=${result.updateAvailable}`,
        `accessGranted=${result.accessGranted}`,
      );
      return result;
    } catch (err) {
      console.error('[license] Register failed:', err?.message || err);
      const cached = licenseCacheStore.loadRegisterResponse();
      if (cached) {
        console.warn('[license] using cached register response');
        cachedPayload = cached;
        return buildRegisterResult(true);
      }
      cachedPayload = null;
      return {
        ok: false,
        payload: null,
        updateAvailable: false,
        installerExists: false,
        filename: null,
        accessGranted: false,
        fromCache: false,
        error: String(err?.message || err),
      };
    } finally {
      registerInFlight = null;
    }
  })();

  return registerInFlight;
}

/** @deprecated use register — kept as alias */
function ensureRegisteredOnce() {
  return register();
}

function getLastLicenseResult() {
  return getCachedUpdate();
}

function checkInstaller(fileName) {
  const downloadUrl = cachedPayload
    ? getPayloadString(cachedPayload, 'downloadUrl', 'DownloadUrl')
    : '';
  const name = fileName || (cachedPayload
    ? getInstallerFilename(cachedPayload, downloadUrl)
    : FALLBACK_INSTALLER_NAME);
  const filePath = getInstallerPath(name);
  return {
    ok: true,
    filename: name,
    installerExists: hasLocalInstaller(name),
    exists: hasLocalInstaller(name),
    filePath,
    path: filePath,
  };
}

/**
 * Stream downloadUrl into the OS Downloads folder.
 * @param {string} url
 * @param {string} fileName
 * @param {(progress: { percent: number, received: number, total: number }) => void} [onProgress]
 * @returns {Promise<{ ok: true, filePath: string, filename: string } | { ok: false, error: string, reason?: string }>}
 */
function downloadInstaller(url, fileName, onProgress) {
  if (downloading) {
    return Promise.resolve({ ok: false, error: 'Download already in progress.', reason: 'already-downloading' });
  }

  const resolvedUrl = url || (cachedPayload
    ? getPayloadString(cachedPayload, 'downloadUrl', 'DownloadUrl')
    : '');
  if (!resolvedUrl) {
    return Promise.resolve({ ok: false, error: 'Download URL is missing.', reason: 'missing-url' });
  }

  const name = fileName || (cachedPayload
    ? getInstallerFilename(cachedPayload, resolvedUrl)
    : FALLBACK_INSTALLER_NAME);
  const filePath = getInstallerPath(name);
  if (!filePath) {
    return Promise.resolve({ ok: false, error: 'Invalid download file name.' });
  }

  downloading = true;

  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(resolvedUrl);
    } catch {
      downloading = false;
      return resolve({ ok: false, error: 'Invalid download URL.' });
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      downloading = false;
      return resolve({ ok: false, error: 'Download URL must be http(s).' });
    }

    const transport = parsed.protocol === 'http:' ? http : https;
    const tmpPath = `${filePath}.part`;

    const cleanup = () => {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        // ignore
      }
    };

    const finish = (result) => {
      downloading = false;
      resolve(result);
    };

    const doRequest = (requestUrl) => {
      let requestParsed;
      try {
        requestParsed = new URL(requestUrl);
      } catch {
        cleanup();
        return finish({ ok: false, error: 'Invalid download URL.' });
      }

      const requestTransport = requestParsed.protocol === 'http:' ? http : https;
      const req = requestTransport.get(requestUrl, (res) => {
        const statusCode = res.statusCode ?? 0;

        if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
          res.resume();
          return doRequest(res.headers.location);
        }

        if (statusCode < 200 || statusCode >= 300) {
          res.resume();
          cleanup();
          return finish({ ok: false, error: `Download failed (${statusCode}).`, reason: 'download-failed' });
        }

        const total = Number(res.headers['content-length']) || 0;
        let received = 0;
        const out = fs.createWriteStream(tmpPath);

        res.on('data', (chunk) => {
          received += chunk.length;
          const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
          onProgress?.({ percent, received, total, filename: name, path: filePath });
        });

        res.pipe(out);

        out.on('finish', () => {
          out.close(() => {
            try {
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
              fs.renameSync(tmpPath, filePath);
              onProgress?.({ percent: 100, received, total: total || received, filename: name, path: filePath });
              finish({ ok: true, filePath, filename: name });
            } catch (err) {
              cleanup();
              finish({ ok: false, error: err?.message ?? 'Failed to save installer.', reason: 'download-failed' });
            }
          });
        });

        out.on('error', (err) => {
          cleanup();
          finish({ ok: false, error: err?.message ?? 'Failed to write installer.', reason: 'download-failed' });
        });

        res.on('error', (err) => {
          cleanup();
          finish({ ok: false, error: err?.message ?? 'Download stream error.', reason: 'download-failed' });
        });
      });

      req.on('error', (err) => {
        cleanup();
        finish({ ok: false, error: err?.message ?? 'Download request failed.', reason: 'download-failed' });
      });

      req.setTimeout(120000, () => {
        req.destroy(new Error('Download timed out.'));
      });
    };

    doRequest(resolvedUrl);
  });
}

/**
 * Open the downloaded installer.
 * @param {string} filename
 * @returns {Promise<{ ok: true, filePath: string } | { ok: false, error: string, reason?: string }>}
 */
async function installInstaller(filename) {
  const downloadUrl = cachedPayload
    ? getPayloadString(cachedPayload, 'downloadUrl', 'DownloadUrl')
    : '';
  const name = filename || (cachedPayload
    ? getInstallerFilename(cachedPayload, downloadUrl)
    : FALLBACK_INSTALLER_NAME);
  const filePath = getInstallerPath(name);

  if (!fs.existsSync(filePath)) {
    return { ok: false, error: 'Installer file not found.', reason: 'file-missing', path: filePath };
  }
  if (!isPathInsideDownloads(filePath)) {
    return { ok: false, error: 'Installer path is not in the Downloads folder.' };
  }

  const openError = await shell.openPath(filePath);
  if (openError) {
    return { ok: false, error: openError, reason: 'open-failed', path: filePath };
  }
  return { ok: true, filePath, path: filePath };
}

module.exports = {
  SOFTWARE_APP_ID,
  BUILD_VERSION,
  VERSION_NAME,
  getBuildVersion,
  getVersionName,
  register,
  ensureRegisteredOnce,
  getLastLicenseResult,
  getCachedUpdate,
  isAccessGranted,
  isUpdateAvailable,
  getInstallerFilename,
  checkInstaller,
  downloadInstaller,
  installInstaller,
  getInstallerPath,
};
