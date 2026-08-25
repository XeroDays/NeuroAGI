const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const CACHE_FILENAME = 'register-response.enc';

function getCachePath() {
  return path.join(app.getPath('userData'), CACHE_FILENAME);
}

function isEncryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch (err) {
    console.warn('[license-cache-store] encryption availability check failed', err);
    return false;
  }
}

function saveRegisterResponse(response) {
  if (!response || typeof response !== 'object') {
    return false;
  }
  if (!isEncryptionAvailable()) {
    console.warn('[license-cache-store] safeStorage encryption unavailable; skipping save');
    return false;
  }

  try {
    const json = JSON.stringify(response);
    const encrypted = safeStorage.encryptString(json);
    fs.writeFileSync(getCachePath(), encrypted);
    return true;
  } catch (err) {
    console.warn('[license-cache-store] failed to save register response', err);
    return false;
  }
}

function loadRegisterResponse() {
  if (!isEncryptionAvailable()) {
    console.warn('[license-cache-store] safeStorage encryption unavailable; cannot load cache');
    return null;
  }

  const cachePath = getCachePath();
  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    const encrypted = fs.readFileSync(cachePath);
    const json = safeStorage.decryptString(encrypted);
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err) {
    console.warn('[license-cache-store] failed to load register response', err);
    return null;
  }
}

module.exports = {
  saveRegisterResponse,
  loadRegisterResponse,
};
