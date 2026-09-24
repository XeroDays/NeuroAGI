'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { installElectronStub, freshService, removeDir } = require('./helpers/electron-stub');

function loadTools() {
  const { documents, userData } = installElectronStub();
  const tools = freshService('services/advance-tools.js');
  return { tools, documents, userData };
}

test('ADVANCE_TOOLS exposes every tool the system prompt relies on', () => {
  const { tools, documents, userData } = loadTools();
  try {
    const names = tools.ADVANCE_TOOLS.map((t) => t.function.name);
    assert.deepEqual(names, [
      'get_available_users',
      'get_profile_by_id',
      'create_update_user_profile',
      'manage_user_issues',
      'find_topic_urls',
      'web_search',
      'extract_url',
      'ask_user',
    ]);
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('sanitizeQuestions rejects non-arrays and malformed entries', () => {
  const { tools, documents, userData } = loadTools();
  const { sanitizeQuestions } = tools;
  try {
    assert.deepEqual(sanitizeQuestions(undefined), []);
    assert.deepEqual(sanitizeQuestions('nope'), []);
    assert.deepEqual(sanitizeQuestions([null, 42, 'text']), []);
    assert.deepEqual(sanitizeQuestions([{ question: '', type: 'text' }]), []);
    assert.deepEqual(sanitizeQuestions([{ question: 'Valid?', type: 'wat' }]), []);
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('sanitizeQuestions keeps text questions and trims the prompt', () => {
  const { tools, documents, userData } = loadTools();
  try {
    const out = tools.sanitizeQuestions([{ question: '  How long?  ', type: 'TEXT' }]);
    assert.deepEqual(out, [{ question: 'How long?', type: 'text' }]);
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('sanitizeQuestions drops select questions with no usable options', () => {
  const { tools, documents, userData } = loadTools();
  const { sanitizeQuestions } = tools;
  try {
    assert.deepEqual(sanitizeQuestions([{ question: 'Which?', type: 'single_select' }]), []);
    assert.deepEqual(
      sanitizeQuestions([{ question: 'Which?', type: 'multi_select', options: ['', '  '] }]),
      [],
    );

    const kept = sanitizeQuestions([
      { question: 'Which?', type: 'single_select', options: [' Morning ', 'Night', 7] },
    ]);
    assert.deepEqual(kept[0].options, ['Morning', 'Night'], 'non-strings are discarded');
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('sanitizeQuestions applies slider and range defaults', () => {
  const { tools, documents, userData } = loadTools();
  const { sanitizeQuestions } = tools;
  try {
    const [slider] = sanitizeQuestions([{ question: 'Severity?', type: 'slider' }]);
    assert.deepEqual(slider, {
      question: 'Severity?',
      type: 'slider',
      min: 0,
      max: 10,
      step: 1,
      labels: { min: '', max: '' },
    });

    const [range] = sanitizeQuestions([
      { question: 'Range?', type: 'range', step: 0, labels: { min: 'Low', max: 9 } },
    ]);
    assert.equal(range.max, 100, 'range defaults to 100 rather than 10');
    assert.equal(range.step, 1, 'a non-positive step falls back to 1');
    assert.deepEqual(range.labels, { min: 'Low', max: '' });
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('sanitizeQuestions caps questions at 12 and options at 20', () => {
  const { tools, documents, userData } = loadTools();
  try {
    const many = Array.from({ length: 30 }, (_, i) => ({
      question: `Q${i}`,
      type: 'single_select',
      options: Array.from({ length: 40 }, (_, j) => `opt-${j}`),
    }));
    const out = tools.sanitizeQuestions(many);
    assert.equal(out.length, 12);
    assert.equal(out[0].options.length, 20);
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('executeTool reports unknown tool names as an error payload', async () => {
  const { tools, documents, userData } = loadTools();
  try {
    const raw = await tools.executeTool('not_a_tool', {});
    assert.deepEqual(JSON.parse(raw), { error: 'Unknown tool: not_a_tool' });
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('profile tools round-trip through the profiles service', async () => {
  const { tools, documents, userData } = loadTools();
  try {
    const empty = JSON.parse(await tools.executeTool('get_available_users', {}));
    assert.deepEqual(empty, { users: [] });

    const created = JSON.parse(await tools.executeTool('create_update_user_profile', {
      content: 'Prilosec each morning.',
      name: 'Sayed',
      age: 29,
      gender: 'male',
    }));
    assert.equal(created.ok, true);

    const id = created.profile.id;
    const issue = JSON.parse(await tools.executeTool('manage_user_issues', {
      userid: id,
      action: 'create',
      text: 'Post-meal vomiting.',
    }));
    assert.equal(issue.ok, true);

    const loaded = JSON.parse(await tools.executeTool('get_profile_by_id', { id }));
    assert.equal(loaded.profile.issues.length, 1);

    const bad = JSON.parse(await tools.executeTool('manage_user_issues', {
      userid: id,
      action: 'shrug',
    }));
    assert.deepEqual(bad, {
      ok: false,
      error: 'action must be list, create, update, or delete.',
    });
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('web tools validate their arguments before calling Tavily', async () => {
  const { tools, documents, userData } = loadTools();
  try {
    assert.match(JSON.parse(await tools.executeTool('web_search', {})).error, /non-empty query/);
    assert.match(JSON.parse(await tools.executeTool('find_topic_urls', {})).error, /non-empty topic/);
    assert.match(
      JSON.parse(await tools.executeTool('extract_url', { urls: ['ftp://nope', 'not a url'] })).error,
      /one or more http\(s\) URLs/,
    );
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});
