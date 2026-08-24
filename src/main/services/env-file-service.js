const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { app } = require('electron');

const CREDENTIAL_KEYS = ['OPENROUTER_API_KEY', 'TAVILY_API_KEY'];

function execDirEnvPath() {
  return path.join(path.dirname(process.execPath), '.env');
}

function projectRootEnvPath() {
  return path.join(__dirname, '..', '..', '..', '.env');
}

function envCandidates() {
  return [execDirEnvPath(), projectRootEnvPath()];
}

function resolveExistingEnvPath() {
  for (const envPath of envCandidates()) {
    if (fs.existsSync(envPath)) return envPath;
  }
  return null;
}

function resolveEnvPath() {
  const existing = resolveExistingEnvPath();
  if (existing) return existing;
  if (app && app.isPackaged) return execDirEnvPath();
  return projectRootEnvPath();
}

function loadEnv() {
  const envPath = resolveExistingEnvPath();
  if (envPath) dotenv.config({ path: envPath });
}

function parseEnvFile(envPath) {
  if (!envPath || !fs.existsSync(envPath)) return {};
  return dotenv.parse(fs.readFileSync(envPath));
}

function sanitizeValue(value) {
  return String(value ?? '').replace(/[\r\n]/g, '').trim();
}

function serializeEnv(parsed) {
  const lines = Object.entries(parsed).map(([key, value]) => `${key}=${value ?? ''}`);
  return lines.length ? `${lines.join('\n')}\n` : '';
}

function readCredentials() {
  const parsed = parseEnvFile(resolveExistingEnvPath());
  const result = {};
  for (const key of CREDENTIAL_KEYS) {
    result[key] = typeof parsed[key] === 'string' ? parsed[key] : '';
  }
  return result;
}

function writeCredentials(payload = {}) {
  const envPath = resolveEnvPath();
  const parsed = parseEnvFile(envPath);
  for (const key of CREDENTIAL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      parsed[key] = sanitizeValue(payload[key]);
    } else if (parsed[key] === undefined) {
      parsed[key] = '';
    }
  }
  fs.writeFileSync(envPath, serializeEnv(parsed), 'utf8');
  dotenv.config({ path: envPath, override: true });
  return { ok: true };
}

module.exports = {
  CREDENTIAL_KEYS,
  resolveEnvPath,
  loadEnv,
  readCredentials,
  writeCredentials,
};
