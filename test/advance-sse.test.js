'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { installElectronStub, freshService, removeDir } = require('./helpers/electron-stub');

function load() {
  const { documents, userData } = installElectronStub();
  const llm = freshService('services/advance-llm.js');
  return { llm, documents, userData };
}

test('reasoning deltas stay out of the visible reply', () => {
  const { llm, documents, userData } = load();
  try {
    const text = [
      'data: {"choices":[{"delta":{"reasoning":"hidden report"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":""},"finish_reason":"stop"}],"usage":{"completion_tokens_details":{"reasoning_tokens":12}}}',
      '',
    ].join('\n');
    const parsed = llm.parseSseText(text);
    assert.equal(parsed.content, '');
    assert.equal(parsed.reasoningChars, 'hidden report'.length);
    assert.equal(parsed.finishReason, 'stop');
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('tool call deltas accumulate by index', () => {
  const { llm, documents, userData } = load();
  try {
    const slots = [];
    llm.applyToolCallDelta(slots, { index: 0, id: 'call_1', function: { name: 'web', arguments: '{"q":' } });
    llm.applyToolCallDelta(slots, { index: 0, function: { arguments: '"hi"}' } });
    llm.applyToolCallDelta(slots, { index: 1, id: 'call_2', function: { name: 'ask_user', arguments: '{}' } });
    assert.equal(slots[0].id, 'call_1');
    assert.equal(slots[0].function.name, 'web');
    assert.equal(slots[0].function.arguments, '{"q":"hi"}');
    assert.equal(slots[1].function.name, 'ask_user');
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('parseSseText joins content deltas and ignores the done marker', () => {
  const { llm, documents, userData } = load();
  try {
    const pieces = [];
    const text = [
      'data: {"choices":[{"delta":{"content":"Hel"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"lo"}}]}',
      '',
      'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":3}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    const parsed = llm.parseSseText(text, (piece) => pieces.push(piece));
    assert.deepEqual(pieces, ['Hel', 'lo']);
    assert.equal(parsed.content, 'Hello');
    assert.equal(parsed.reasoningChars, 0);
    assert.equal(parsed.finishReason, 'stop');
    assert.equal(parsed.usage.prompt_tokens, 3);
    assert.equal(parsed.toolCalls.length, 0);
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});
