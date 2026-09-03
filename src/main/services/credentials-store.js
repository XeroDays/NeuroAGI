const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { safeStorage } = require('electron');
const documentsStore = require('./neuroagi-documents-store');

const CREDENTIALS_FILENAME = 'credentials.json';
const CREDENTIAL_KEYS = ['OPENROUTER_API_KEY', 'TAVILY_API_KEY'];

function emptyCredentials() {
  const result = {};
  for (const key of CREDENTIAL_KEYS) {
    result[key] = '';
  }
  return result;
}

function sanitizeValue(value) {
  return String(value ?? '').replace(/[\r\n]/g, '').trim();
}

function normalizeCredentials(raw) {
  const result = emptyCredentials();
  if (!raw || typeof raw !== 'object') return result;
  for (const key of CREDENTIAL_KEYS) {
    result[key] = sanitizeValue(raw[key]);
  }
  return result;
}

function applyToProcessEnv(creds) {
  const next = normalizeCredentials(creds);
  for (const key of CREDENTIAL_KEYS) {
    process.env[key] = next[key];
  }
  return next;
}

function isEncryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch (err) {
    console.warn('[credentials-store] encryption availability check failed', err);
    return false;
  }
}

function execDirEnvPath() {
  return path.join(path.dirname(process.execPath), '.env');
}

function projectRootEnvPath() {
  return path.join(__dirname, '..', '..', '..', '.env');
}

function envCandidates() {
  return [execDirEnvPath(), projectRootEnvPath()];
}

function collectEnvCredentials() {
  const merged = emptyCredentials();
  const paths = [];
  for (const envPath of envCandidates()) {
    if (!fs.existsSync(envPath)) continue;
    paths.push(envPath);
    let parsed = {};
    try {
      parsed = dotenv.parse(fs.readFileSync(envPath));
    } catch (err) {
      console.warn('[credentials-store] failed to parse .env', envPath, err?.message || err);
      continue;
    }
    for (const key of CREDENTIAL_KEYS) {
      if (merged[key]) continue;
      if (typeof parsed[key] === 'string' && parsed[key].trim()) {
        merged[key] = sanitizeValue(parsed[key]);
      }
    }
  }
  return { creds: merged, paths };
}

function hasAnyKey(creds) {
  return CREDENTIAL_KEYS.some((key) => Boolean(creds[key]));
}

function credentialsFileExists() {
  try {
    return fs.existsSync(path.join(documentsStore.ensureDir(), CREDENTIALS_FILENAME));
  } catch {
    return false;
  }
}

function encryptPayload(creds) {
  if (!isEncryptionAvailable()) {
    return { ok: false, error: 'Encryption is not available on this device.' };
  }
  try {
    const json = JSON.stringify(normalizeCredentials(creds));
    const encrypted = safeStorage.encryptString(json);
    return { ok: true, data: Buffer.from(encrypted).toString('base64') };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.warn('[credentials-store] encrypt failed:', error);
    return { ok: false, error: 'Failed to encrypt credentials.' };
  }
}

function decryptPayload(data) {
  if (!isEncryptionAvailable()) {
    return { ok: false, error: 'Encryption is not available on this device.' };
  }
  if (typeof data !== 'string' || !data.trim()) {
    return { ok: false, error: 'Credentials file is empty.' };
  }
  try {
    const encrypted = Buffer.from(data, 'base64');
    const json = safeStorage.decryptString(encrypted);
    const parsed = JSON.parse(json);
    return { ok: true, creds: normalizeCredentials(parsed) };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.warn('[credentials-store] decrypt failed:', error);
    return { ok: false, error: 'Failed to decrypt credentials.' };
  }
}

function persistEncrypted(creds) {
  const encrypted = encryptPayload(creds);
  if (!encrypted.ok) return encrypted;
  documentsStore.writeJson(CREDENTIALS_FILENAME, {
    version: 1,
    data: encrypted.data,
  });
  return { ok: true };
}

function readStoredCredentials() {
  if (!credentialsFileExists()) {
    return { ok: true, missing: true, creds: emptyCredentials() };
  }
  const wrapper = documentsStore.readJson(CREDENTIALS_FILENAME, null);
  if (!wrapper || typeof wrapper !== 'object' || typeof wrapper.data !== 'string') {
    return { ok: false, error: 'Credentials file is invalid.' };
  }
  const decrypted = decryptPayload(wrapper.data);
  if (!decrypted.ok) return decrypted;
  return { ok: true, creds: decrypted.creds };
}

function deleteEnvFiles(paths) {
  for (const envPath of paths) {
    try {
      if (fs.existsSync(envPath)) fs.unlinkSync(envPath);
    } catch (err) {
      console.warn('[credentials-store] failed to delete .env', envPath, err?.message || err);
    }
  }
}

function migrateFromEnv() {
  const { creds, paths } = collectEnvCredentials();
  if (!paths.length || !hasAnyKey(creds)) {
    return { ok: true, migrated: false, creds: emptyCredentials() };
  }
  const written = persistEncrypted(creds);
  if (!written.ok) return written;
  deleteEnvFiles(paths);
  return { ok: true, migrated: true, creds };
}

function loadCredentials() {
  if (credentialsFileExists()) {
    const stored = readStoredCredentials();
    if (stored.ok && stored.creds) {
      applyToProcessEnv(stored.creds);
      return { ok: true };
    }
    console.warn('[credentials-store] load failed:', stored.error || 'unknown error');
    return { ok: false, error: stored.error || 'Failed to load credentials.' };
  }

  const migrated = migrateFromEnv();
  if (!migrated.ok) {
    console.warn('[credentials-store] migrate failed:', migrated.error || 'unknown error');
    return migrated;
  }
  applyToProcessEnv(migrated.creds);
  return { ok: true, migrated: migrated.migrated === true };
}

function readCredentials() {
  const stored = readStoredCredentials();
  if (stored.ok && stored.creds) return stored.creds;
  return emptyCredentials();
}

function writeCredentials(payload = {}) {
  const current = readCredentials();
  const next = normalizeCredentials({
    ...current,
    ...payload,
  });
  for (const key of CREDENTIAL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      next[key] = sanitizeValue(payload[key]);
    }
  }
  const written = persistEncrypted(next);
  if (!written.ok) return written;
  applyToProcessEnv(next);
  return { ok: true };
}

module.exports = {
  CREDENTIALS_FILENAME,
  CREDENTIAL_KEYS,
  loadCredentials,
  readCredentials,
  writeCredentials,
};
