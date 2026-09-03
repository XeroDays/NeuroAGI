const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const FOLDER_NAME = 'NeuroAGI';

function getRootDir() {
  return path.join(app.getPath('documents'), FOLDER_NAME);
}

function ensureDir() {
  const root = getRootDir();
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  return root;
}

function resolveFile(filename) {
  const safe = path.basename(String(filename || '').trim());
  if (!safe || safe === '.' || safe === '..') {
    throw new Error('Invalid documents filename.');
  }
  return path.join(ensureDir(), safe);
}

function readJson(filename, fallback) {
  const filePath = resolveFile(filename);
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw || '');
    return parsed == null ? fallback : parsed;
  } catch (err) {
    console.warn('[documents-store] failed to read', filename, err?.message || err);
    return fallback;
  }
}

function writeJson(filename, data) {
  const filePath = resolveFile(filename);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
  return filePath;
}

module.exports = {
  FOLDER_NAME,
  getRootDir,
  ensureDir,
  readJson,
  writeJson,
};
