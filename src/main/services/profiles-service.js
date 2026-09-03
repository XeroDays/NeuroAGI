const crypto = require('crypto');
const documentsStore = require('./neuroagi-documents-store');

const PROFILES_FILENAME = 'profiles.json';

function loadMap() {
  const raw = documentsStore.readJson(PROFILES_FILENAME, {});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  return raw;
}

function saveMap(map) {
  documentsStore.writeJson(PROFILES_FILENAME, map);
}

function toAge(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeName(value) {
  return String(value || '').trim();
}

function normalizeGender(value) {
  return String(value || '').trim().toLowerCase();
}

function toRecord(raw, fallbackId) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || fallbackId || '').trim();
  if (!id) return null;
  const name = normalizeName(raw.name);
  const age = toAge(raw.age);
  const gender = String(raw.gender || '').trim();
  const profile = raw.profile == null ? '' : String(raw.profile);
  return { id, name, age, gender, profile };
}

function listAll() {
  const map = loadMap();
  const records = [];
  for (const [key, value] of Object.entries(map)) {
    const record = toRecord(value, key);
    if (record) records.push(record);
  }
  records.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return records;
}

function listSummaries() {
  return listAll().map(({ id, name, age, gender }) => ({ id, name, age, gender }));
}

function getById(id) {
  const key = String(id || '').trim();
  if (!key) return { ok: false, error: 'Profile id is required.' };
  const map = loadMap();
  const record = toRecord(map[key], key);
  if (!record) return { ok: false, error: 'Profile not found.' };
  return { ok: true, profile: record };
}

function upsert({ userid, content, name, age, gender } = {}) {
  const profileText = content == null ? '' : String(content);
  if (!String(profileText).trim()) {
    return { ok: false, error: 'content is required.' };
  }

  const map = loadMap();
  const existingId = String(userid || '').trim();

  if (!existingId) {
    const nextName = normalizeName(name);
    const nextAge = toAge(age);
    const nextGender = String(gender || '').trim();
    if (!nextName || nextAge == null || !nextGender) {
      return { ok: false, error: 'name, age, and gender are required when creating a profile.' };
    }
    const id = crypto.randomUUID();
    const record = {
      id,
      name: nextName,
      age: nextAge,
      gender: nextGender,
      profile: profileText,
    };
    map[id] = record;
    saveMap(map);
    return { ok: true, created: true, profile: record };
  }

  const current = toRecord(map[existingId], existingId);
  if (!current) {
    return { ok: false, error: 'Profile not found.' };
  }
  const record = {
    ...current,
    profile: profileText,
  };
  if (normalizeName(name)) record.name = normalizeName(name);
  const nextAge = toAge(age);
  if (nextAge != null) record.age = nextAge;
  if (String(gender || '').trim()) record.gender = String(gender).trim();
  map[existingId] = record;
  saveMap(map);
  return { ok: true, created: false, profile: record };
}

function getProfiles() {
  return { ok: true, profiles: listAll() };
}

module.exports = {
  PROFILES_FILENAME,
  listAll,
  listSummaries,
  getById,
  upsert,
  getProfiles,
  normalizeName,
  normalizeGender,
};
