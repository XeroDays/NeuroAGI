'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { installElectronStub, freshService, removeDir } = require('./helpers/electron-stub');

function setup() {
  const { documents, userData } = installElectronStub();
  const service = freshService('services/profiles-service.js');
  return { service, documents, userData };
}

test('upsert requires name, age, and gender when creating', () => {
  const { service, documents, userData } = setup();
  try {
    assert.deepEqual(service.upsert({ content: '' }), {
      ok: false,
      error: 'content is required.',
    });

    const missing = service.upsert({ content: 'Takes Prilosec each morning.' });
    assert.equal(missing.ok, false);
    assert.match(missing.error, /name, age, and gender are required/);
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('upsert creates a record then merges updates without touching issues', () => {
  const { service, documents, userData } = setup();
  try {
    const created = service.upsert({
      content: 'Prilosec 20mg before breakfast.',
      name: 'Sayed',
      age: 29,
      gender: 'male',
    });
    assert.equal(created.ok, true);
    assert.equal(created.created, true);
    assert.equal(created.profile.name, 'Sayed');
    assert.equal(created.profile.age, 29);
    assert.deepEqual(created.profile.issues, []);

    const id = created.profile.id;
    service.createIssue(id, 'Post-meal vomiting for several weeks.');

    const updated = service.upsert({
      userid: id,
      content: 'Prilosec 20mg and Motilium before breakfast.',
      age: 30,
    });
    assert.equal(updated.ok, true);
    assert.equal(updated.created, false);
    assert.equal(updated.profile.age, 30);
    assert.equal(updated.profile.name, 'Sayed', 'name is preserved when omitted');
    assert.equal(updated.profile.issues.length, 1, 'profile upsert never rewrites issues');
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('upsert on an unknown id does not create a record', () => {
  const { service, documents, userData } = setup();
  try {
    const result = service.upsert({ userid: 'not-a-real-id', content: 'anything' });
    assert.deepEqual(result, { ok: false, error: 'Profile not found.' });
    assert.deepEqual(service.listAll(), []);
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('listSummaries exposes only id, name, age, and gender', () => {
  const { service, documents, userData } = setup();
  try {
    service.upsert({ content: 'notes', name: 'Zara', age: 41, gender: 'female' });
    service.upsert({ content: 'notes', name: 'Ali', age: 33, gender: 'male' });

    const summaries = service.listSummaries();
    assert.equal(summaries.length, 2);
    assert.deepEqual(Object.keys(summaries[0]).sort(), ['age', 'gender', 'id', 'name']);
    assert.deepEqual(summaries.map((s) => s.name), ['Ali', 'Zara'], 'sorted by name');
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('getById returns an error for a missing or blank id', () => {
  const { service, documents, userData } = setup();
  try {
    assert.deepEqual(service.getById(''), { ok: false, error: 'Profile id is required.' });
    assert.deepEqual(service.getById('missing'), { ok: false, error: 'Profile not found.' });
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('issue rows support the full create / list / update / delete cycle', () => {
  const { service, documents, userData } = setup();
  try {
    const { profile } = service.upsert({
      content: 'notes',
      name: 'Sayed',
      age: 29,
      gender: 'male',
    });
    const id = profile.id;

    assert.equal(service.createIssue(id, '   ').ok, false, 'blank text is rejected');

    const created = service.createIssue(id, 'Nightly reflux after dinner.');
    assert.equal(created.ok, true);
    assert.equal(created.issues.length, 1);
    assert.ok(created.issue.id);
    assert.ok(Date.parse(created.issue.datetime), 'datetime is an ISO timestamp');

    const listed = service.listIssues(id);
    assert.equal(listed.ok, true);
    assert.equal(listed.issues.length, 1);

    const updated = service.updateIssue(id, created.issue.id, 'Reflux after dinner, worse when lying down.');
    assert.equal(updated.ok, true);
    assert.equal(updated.issue.text, 'Reflux after dinner, worse when lying down.');
    assert.equal(updated.issues.length, 1);

    assert.equal(service.updateIssue(id, 'nope', 'text').ok, false);
    assert.equal(service.deleteIssue(id, 'nope').ok, false);

    const deleted = service.deleteIssue(id, created.issue.id);
    assert.equal(deleted.ok, true);
    assert.deepEqual(deleted.issues, []);
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('removeById deletes one profile and leaves the rest', () => {
  const { service, documents, userData } = setup();
  try {
    const a = service.upsert({ content: 'notes', name: 'Ali', age: 33, gender: 'male' });
    service.upsert({ content: 'notes', name: 'Zara', age: 41, gender: 'female' });

    assert.deepEqual(service.removeById(''), { ok: false, error: 'Profile id is required.' });
    assert.deepEqual(service.removeById('missing'), { ok: false, error: 'Profile not found.' });
    assert.deepEqual(service.removeById(a.profile.id), { ok: true });

    const remaining = service.listAll();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].name, 'Zara');
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('records survive a service reload from disk', () => {
  const { service, documents, userData } = setup();
  try {
    service.upsert({ content: 'Sleeps 5 hours.', name: 'Sayed', age: 29, gender: 'male' });

    installElectronStub({ documents, userData });
    const reloaded = freshService('services/profiles-service.js');
    const all = reloaded.listAll();
    assert.equal(all.length, 1);
    assert.equal(all[0].profile, 'Sleeps 5 hours.');
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('an existing profile can clear its notes and recent issues stay newest-first', () => {
  const { service, documents, userData } = setup();
  try {
    const created = service.upsert({
      content: 'notes',
      name: 'Sayed',
      age: 29,
      gender: 'male',
    });
    service.createIssue(created.profile.id, 'Older issue');
    const cleared = service.upsert({ userid: created.profile.id, content: '' });
    assert.equal(cleared.ok, true);
    assert.equal(cleared.profile.profile, '');

    const recent = service.listRecentIssues(3);
    assert.equal(recent[0].text, 'Older issue');
    assert.equal(recent[0].name, 'Sayed');
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('importSnapshot merges valid records and rejects junk', () => {
  const { service, documents, userData } = setup();
  try {
    assert.equal(service.importSnapshot([]).ok, false);
    const imported = service.importSnapshot({
      'keep-me': {
        id: 'keep-me',
        name: 'Nora',
        age: 44,
        gender: 'female',
        profile: 'notes',
        issues: [],
      },
      bad: { name: '' },
    });
    assert.equal(imported.ok, true);
    assert.equal(imported.imported, 1);
    assert.equal(service.getById('keep-me').profile.name, 'Nora');
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});
