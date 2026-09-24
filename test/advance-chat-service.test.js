'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { installElectronStub, freshService, removeDir } = require('./helpers/electron-stub');

function loadService() {
  const { documents, userData } = installElectronStub();
  const service = freshService('services/advance-chat-service.js');
  return { service, documents, userData };
}

test('sanitizeAssistantMessage returns null when there are no tool calls', () => {
  const { service, documents, userData } = loadService();
  const { sanitizeAssistantMessage } = service;
  try {
    assert.equal(sanitizeAssistantMessage(null), null);
    assert.equal(sanitizeAssistantMessage({ content: 'hi' }), null);
    assert.equal(sanitizeAssistantMessage({ tool_calls: [] }), null);
    assert.equal(sanitizeAssistantMessage({ tool_calls: [null, 'x'] }), null);
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('sanitizeAssistantMessage normalises tool calls and stringifies arguments', () => {
  const { service, documents, userData } = loadService();
  try {
    const out = service.sanitizeAssistantMessage({
      content: 'Working on it',
      tool_calls: [
        { id: 'call_1', function: { name: 'web_search', arguments: '{"query":"reflux"}' } },
        { id: 'call_2', function: { name: 'ask_user', arguments: { questions: [] } } },
      ],
    });

    assert.equal(out.role, 'assistant');
    assert.equal(out.content, 'Working on it');
    assert.equal(out.tool_calls.length, 2);
    assert.equal(out.tool_calls[0].type, 'function');
    assert.equal(out.tool_calls[0].function.arguments, '{"query":"reflux"}');
    assert.equal(
      out.tool_calls[1].function.arguments,
      '{"questions":[]}',
      'object arguments are serialised',
    );
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('sanitizeAssistantMessage coerces a non-string content to null', () => {
  const { service, documents, userData } = loadService();
  try {
    const out = service.sanitizeAssistantMessage({
      content: { unexpected: true },
      tool_calls: [{ id: 'c', function: { name: 'web_search', arguments: '{}' } }],
    });
    assert.equal(out.content, null);
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('sanitizeToolResults drops entries without a tool_call_id', () => {
  const { service, documents, userData } = loadService();
  const { sanitizeToolResults } = service;
  try {
    assert.deepEqual(sanitizeToolResults('nope'), []);
    assert.deepEqual(sanitizeToolResults([{ name: 'web_search', content: '{}' }]), []);

    const out = sanitizeToolResults([
      { tool_call_id: 'call_1', name: 'web_search', content: '{"ok":true}' },
      { id: 'call_2', name: 'extract_url', content: { results: [] } },
    ]);
    assert.equal(out.length, 2);
    assert.equal(out[0].role, 'tool');
    assert.equal(out[1].tool_call_id, 'call_2', 'falls back to `id`');
    assert.equal(out[1].content, '{"results":[]}', 'non-string content is serialised');
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('sanitizeAnswers normalises shape and caps at 12 entries', () => {
  const { service, documents, userData } = loadService();
  const { sanitizeAnswers } = service;
  try {
    assert.deepEqual(sanitizeAnswers(undefined), []);
    assert.deepEqual(sanitizeAnswers(['bad']), [{ question: '', type: 'text', value: '' }]);

    const out = sanitizeAnswers(Array.from({ length: 20 }, (_, i) => ({
      question: `Q${i}`,
      type: 'slider',
      value: i,
    })));
    assert.equal(out.length, 12);
    assert.deepEqual(out[0], { question: 'Q0', type: 'slider', value: 0 });
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('applyResume is a no-op without an askUserCallId', () => {
  const { service, documents, userData } = loadService();
  const { applyResume } = service;
  try {
    const working = [];
    assert.equal(applyResume(working, null), false);
    assert.equal(applyResume(working, {}), false);
    assert.equal(applyResume(working, { askUserCallId: '' }), false);
    assert.deepEqual(working, []);
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('applyResume replays the assistant turn, prior results, then the answers', () => {
  const { service, documents, userData } = loadService();
  try {
    const working = [{ role: 'user', content: 'My stomach hurts' }];
    const applied = service.applyResume(working, {
      askUserCallId: 'call_ask',
      assistantMessage: {
        content: null,
        tool_calls: [
          { id: 'call_search', function: { name: 'web_search', arguments: '{"query":"reflux"}' } },
          { id: 'call_ask', function: { name: 'ask_user', arguments: '{"questions":[]}' } },
        ],
      },
      priorToolResults: [
        { tool_call_id: 'call_search', name: 'web_search', content: '{"results":[]}' },
      ],
      answers: [{ question: 'How long?', type: 'text', value: 'Three weeks' }],
    });

    assert.equal(applied, true);
    assert.deepEqual(working.map((m) => m.role), ['user', 'assistant', 'tool', 'tool']);

    const last = working[working.length - 1];
    assert.equal(last.name, 'ask_user');
    assert.equal(last.tool_call_id, 'call_ask');
    assert.deepEqual(JSON.parse(last.content), [
      { question: 'How long?', type: 'text', value: 'Three weeks' },
    ]);
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('applyResume still records answers when the assistant turn is unusable', () => {
  const { service, documents, userData } = loadService();
  try {
    const working = [];
    const applied = service.applyResume(working, {
      askUserCallId: 'call_ask',
      assistantMessage: { content: 'no tool calls here' },
      priorToolResults: 'not an array',
      answers: [{ question: 'Q', type: 'text', value: 'A' }],
    });

    assert.equal(applied, true);
    assert.equal(working.length, 1);
    assert.equal(working[0].role, 'tool');
    assert.equal(working[0].name, 'ask_user');
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('isUnusableReply flags collapsed text and keeps a normal summary', () => {
  const { service, documents, userData } = loadService();
  try {
    const salad = 'she specialized specialized specialized specialized specialized specialized specialized specialized melody then \u0627\u0644\u0639\u0631\u0628\u064a\u0629 and \u043e\u0437\u043d\u0430\u0447\u0430 and \u4e2d\u6587 text';
    assert.equal(service.isUnusableReply(salad), true);
    assert.equal(service.isUnusableReply(
      'Burning after meals is the main pattern. It is worse with late food and better after the burn passes. This is not a diagnosis.',
    ), false);
    assert.equal(service.isUnusableReply(''), false);
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('needsReportFollowUp only when content is empty and reasoning was used', () => {
  const { service, documents, userData } = loadService();
  try {
    assert.equal(service.needsReportFollowUp({
      content: '',
      toolCalls: [],
      usage: { completion_tokens_details: { reasoning_tokens: 4969 } },
    }), true);
    assert.equal(service.needsReportFollowUp({
      content: '# Pre-doctor Clinical Analysis',
      toolCalls: [],
      usage: { completion_tokens_details: { reasoning_tokens: 100 } },
    }), false);
    assert.equal(service.needsReportFollowUp({
      content: '',
      toolCalls: [],
      usage: { completion_tokens_details: { reasoning_tokens: 0 } },
      reasoningChars: 0,
    }), false);
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('isAbortError recognises every abort shape the loop can raise', () => {
  const { service, documents, userData } = loadService();
  const { isAbortError, AdvanceAbortError } = service;
  try {
    assert.equal(isAbortError(null), false);
    assert.equal(isAbortError(new Error('OpenRouter 500')), false);
    assert.equal(isAbortError(new AdvanceAbortError()), true);

    const domAbort = new Error('The operation was aborted');
    domAbort.name = 'AbortError';
    assert.equal(isAbortError(domAbort), true);

    assert.equal(isAbortError({ aborted: true }), true);
    assert.equal(isAbortError(new Error('request aborted by user')), true);
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});
