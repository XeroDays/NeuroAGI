const { safeStorage } = require('electron');
const documentsStore = require('./neuroagi-documents-store');

function encryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function seal(value) {
  if (!encryptionAvailable()) {
    return {
      ok: true,
      encrypted: false,
      payload: value,
      warning: 'Saved without encryption because secure storage is unavailable.',
    };
  }
  const data = Buffer.from(safeStorage.encryptString(JSON.stringify(value))).toString('base64');
  return {
    ok: true,
    encrypted: true,
    payload: { version: 1, encrypted: true, data },
    warning: '',
  };
}

function open(raw, fallback) {
  if (raw == null) return { ok: true, value: fallback, migrated: false, warning: '' };
  if (raw && typeof raw === 'object' && raw.encrypted === true && typeof raw.data === 'string') {
    if (!encryptionAvailable()) {
      return { ok: false, value: fallback, warning: 'Encrypted data could not be unlocked on this device.' };
    }
    try {
      const json = safeStorage.decryptString(Buffer.from(raw.data, 'base64'));
      return { ok: true, value: JSON.parse(json), migrated: false, warning: '' };
    } catch (err) {
      return { ok: false, value: fallback, warning: err?.message || 'Decrypt failed.' };
    }
  }
  return { ok: true, value: raw, migrated: true, warning: '' };
}

function readSecure(filename, fallback) {
  const raw = documentsStore.readJson(filename, null);
  return open(raw, fallback);
}

function writeSecure(filename, value) {
  const sealed = seal(value);
  documentsStore.writeJson(filename, sealed.payload);
  return sealed;
}

module.exports = {
  encryptionAvailable,
  seal,
  open,
  readSecure,
  writeSecure,
};
