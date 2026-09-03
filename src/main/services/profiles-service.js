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

function toIssueEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = String(raw.text || '').trim();
  if (!text) return null;
  const id = String(raw.id || '').trim() || crypto.randomUUID();
  const datetime = String(raw.datetime || '').trim() || new Date().toISOString();
  return { id, text, datetime };
}

function toIssues(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const entry = toIssueEntry(item);
    if (entry) out.push(entry);
  }
  return out;
}

function toRecord(raw, fallbackId) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || fallbackId || '').trim();
  if (!id) return null;
  const name = normalizeName(raw.name);
  const age = toAge(raw.age);
  const gender = String(raw.gender || '').trim();
  const profile = raw.profile == null ? '' : String(raw.profile);
  const issues = toIssues(raw.issues);
  return { id, name, age, gender, profile, issues };
}

function appendIssueEntry(record, text) {
  const issueText = String(text || '').trim();
  if (!issueText || !record) return record;
  const issues = Array.isArray(record.issues) ? record.issues.slice() : [];
  const last = issues[issues.length - 1];
  if (last && String(last.text || '').trim() === issueText) {
    record.issues = issues;
    return record;
  }
  issues.push({
    id: crypto.randomUUID(),
    text: issueText,
    datetime: new Date().toISOString(),
  });
  record.issues = issues;
  return record;
}

function findByDemographics(name, age, gender) {
  const nextName = normalizeName(name);
  const nextAge = toAge(age);
  const nextGender = normalizeGender(gender);
  if (!nextName || nextAge == null || !nextGender) return null;
  return listAll().find((record) => (
    normalizeName(record.name) === nextName
    && record.age === nextAge
    && normalizeGender(record.gender) === nextGender
  )) || null;
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
      issues: [],
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

function loadRecord(userid) {
  const key = String(userid || '').trim();
  if (!key) return { ok: false, error: 'Profile id is required.' };
  const map = loadMap();
  const record = toRecord(map[key], key);
  if (!record) return { ok: false, error: 'Profile not found.' };
  return { ok: true, key, map, record };
}

function listIssues(userid) {
  const loaded = loadRecord(userid);
  if (!loaded.ok) return loaded;
  return { ok: true, issues: loaded.record.issues };
}

function createIssue(userid, text) {
  const issueText = String(text || '').trim();
  if (!issueText) return { ok: false, error: 'Issue text is required.' };
  const loaded = loadRecord(userid);
  if (!loaded.ok) return loaded;
  const issue = {
    id: crypto.randomUUID(),
    text: issueText,
    datetime: new Date().toISOString(),
  };
  const issues = loaded.record.issues.slice();
  issues.push(issue);
  loaded.record.issues = issues;
  loaded.map[loaded.key] = loaded.record;
  saveMap(loaded.map);
  return { ok: true, issue, issues };
}

function updateIssue(userid, issueId, text) {
  const issueText = String(text || '').trim();
  if (!issueText) return { ok: false, error: 'Issue text is required.' };
  const id = String(issueId || '').trim();
  if (!id) return { ok: false, error: 'Issue id is required.' };
  const loaded = loadRecord(userid);
  if (!loaded.ok) return loaded;
  const issues = loaded.record.issues.slice();
  const index = issues.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, error: 'Issue not found.' };
  const issue = {
    ...issues[index],
    text: issueText,
    datetime: new Date().toISOString(),
  };
  issues[index] = issue;
  loaded.record.issues = issues;
  loaded.map[loaded.key] = loaded.record;
  saveMap(loaded.map);
  return { ok: true, issue, issues };
}

function deleteIssue(userid, issueId) {
  const id = String(issueId || '').trim();
  if (!id) return { ok: false, error: 'Issue id is required.' };
  const loaded = loadRecord(userid);
  if (!loaded.ok) return loaded;
  const issues = loaded.record.issues.slice();
  const index = issues.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, error: 'Issue not found.' };
  issues.splice(index, 1);
  loaded.record.issues = issues;
  loaded.map[loaded.key] = loaded.record;
  saveMap(loaded.map);
  return { ok: true, issues };
}

function recordIssue({ name, age, gender, issue } = {}) {
  const issueText = String(issue || '').trim();
  if (!issueText) {
    return { ok: false, error: 'issue is required.' };
  }
  const nextName = normalizeName(name);
  const nextAge = toAge(age);
  const nextGender = String(gender || '').trim();
  if (!nextName || nextAge == null || !nextGender) {
    return { ok: false, error: 'name, age, and gender are required.' };
  }

  const map = loadMap();
  const existing = findByDemographics(nextName, nextAge, nextGender);
  if (existing) {
    const record = toRecord(map[existing.id], existing.id) || existing;
    appendIssueEntry(record, issueText);
    map[record.id] = record;
    saveMap(map);
    return { ok: true, created: false, profile: record };
  }

  const id = crypto.randomUUID();
  const record = {
    id,
    name: nextName,
    age: nextAge,
    gender: nextGender,
    profile: '',
    issues: [],
  };
  appendIssueEntry(record, issueText);
  map[id] = record;
  saveMap(map);
  return { ok: true, created: true, profile: record };
}

function getProfiles() {
  return { ok: true, profiles: listAll() };
}

function removeById(id) {
  const key = String(id || '').trim();
  if (!key) return { ok: false, error: 'Profile id is required.' };
  const map = loadMap();
  if (!map[key]) return { ok: false, error: 'Profile not found.' };
  delete map[key];
  saveMap(map);
  return { ok: true };
}

module.exports = {
  PROFILES_FILENAME,
  listAll,
  listSummaries,
  getById,
  upsert,
  listIssues,
  createIssue,
  updateIssue,
  deleteIssue,
  recordIssue,
  removeById,
  findByDemographics,
  getProfiles,
  normalizeName,
  normalizeGender,
};
