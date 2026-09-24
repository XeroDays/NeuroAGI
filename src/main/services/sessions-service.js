const crypto = require('crypto');
const secureStore = require('./secure-json-store');

const SESSIONS_FILENAME = 'sessions.json';
const MAX_SESSIONS = 50;

function loadAll() {
  const opened = secureStore.readSecure(SESSIONS_FILENAME, []);
  return Array.isArray(opened.value) ? opened.value : [];
}

function saveAll(rows) {
  const trimmed = rows
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, MAX_SESSIONS);
  secureStore.writeSecure(SESSIONS_FILENAME, trimmed);
  return trimmed;
}

function listSessions() {
  return { ok: true, sessions: loadAll().map(summary) };
}

function summary(row) {
  return {
    id: row.id,
    title: row.title || 'Analysis',
    name: row.name || '',
    updatedAt: row.updatedAt,
    models: Array.isArray(row.models) ? row.models : [],
  };
}

function getSession(id) {
  const row = loadAll().find((item) => item.id === id);
  if (!row) return { ok: false, error: 'Session not found.' };
  return { ok: true, session: row };
}

function upsertSession(payload = {}) {
  const rows = loadAll();
  const id = String(payload.id || '').trim() || crypto.randomUUID();
  const now = new Date().toISOString();
  const next = {
    id,
    title: String(payload.title || 'Analysis').slice(0, 160),
    name: String(payload.name || ''),
    age: payload.age ?? null,
    gender: String(payload.gender || ''),
    reasoningLevel: String(payload.reasoningLevel || ''),
    models: Array.isArray(payload.models) ? payload.models : [],
    threads: payload.threads && typeof payload.threads === 'object' ? payload.threads : {},
    createdAt: rows.find((item) => item.id === id)?.createdAt || now,
    updatedAt: now,
  };
  const rest = rows.filter((item) => item.id !== id);
  saveAll([next, ...rest]);
  return { ok: true, session: next };
}

module.exports = {
  MAX_SESSIONS,
  listSessions,
  getSession,
  upsertSession,
};
