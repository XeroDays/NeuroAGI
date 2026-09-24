const usageTracker = require('./usage-tracker');
const logService = require('./log-service');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function combineAbortSignals(...signals) {
  const valid = signals.filter((s) => s && typeof s.aborted === 'boolean');
  if (valid.length === 0) return undefined;
  if (valid.length === 1) return valid[0];

  for (const sig of valid) {
    if (sig.aborted) return sig;
  }

  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    return AbortSignal.any(valid);
  }

  const controller = new AbortController();
  const onAbort = (evt) => {
    if (!controller.signal.aborted) {
      controller.abort(evt?.target?.reason);
    }
  };
  for (const sig of valid) {
    sig.addEventListener('abort', onAbort, { once: true });
  }
  return controller.signal;
}

function createTimeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => {
    const err = new Error('Request timed out');
    err.name = 'TimeoutError';
    controller.abort(err);
  }, timeoutMs);
  return controller.signal;
}

function summarizeMessages(messages) {
  if (!Array.isArray(messages)) return { messageCount: 0, promptChars: 0 };
  let promptChars = 0;
  for (const m of messages) {
    if (typeof m?.content === 'string') {
      promptChars += m.content.length;
    }
  }
  return {
    messageCount: messages.length,
    promptChars,
  };
}

function emptyToolSlot() {
  return { id: '', type: 'function', function: { name: '', arguments: '' } };
}

/** Merge one OpenRouter tool_call delta into slots keyed by index. */
function applyToolCallDelta(slots, delta) {
  if (!delta || typeof delta !== 'object' || !Array.isArray(slots)) return;
  const index = Number.isInteger(delta.index) ? delta.index : 0;
  if (!slots[index]) slots[index] = emptyToolSlot();
  const slot = slots[index];
  if (typeof delta.id === 'string' && delta.id) slot.id = delta.id;
  if (typeof delta.type === 'string' && delta.type) slot.type = delta.type;
  const fn = delta.function && typeof delta.function === 'object' ? delta.function : {};
  if (typeof fn.name === 'string') slot.function.name += fn.name;
  if (typeof fn.arguments === 'string') slot.function.arguments += fn.arguments;
}

/**
 * Apply one SSE event body. Returns the text fragment that should be shown.
 * @param {string} raw
 * @param {{ content: string, reasoning: string, toolSlots: object[], finishReason: string|null, usage: object|null }} state
 */
function consumeSseEvent(raw, state) {
  const data = String(raw || '')
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n');
  if (!data || data === '[DONE]') return '';

  let json;
  try {
    json = JSON.parse(data);
  } catch {
    return '';
  }
  if (json.usage) state.usage = json.usage;
  const choice = json.choices?.[0];
  if (!choice) return '';
  if (choice.finish_reason) state.finishReason = choice.finish_reason;
  const delta = choice.delta || {};
  if (Array.isArray(delta.tool_calls)) {
    for (const call of delta.tool_calls) applyToolCallDelta(state.toolSlots, call);
  }
  const text = typeof delta.content === 'string' ? delta.content : '';
  if (text) state.content += text;
  const reasoningPiece = typeof delta.reasoning === 'string'
    ? delta.reasoning
    : (typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '');
  if (reasoningPiece) state.reasoning = `${state.reasoning || ''}${reasoningPiece}`;
  return text;
}

function parseSseText(text, onDelta) {
  const state = { content: '', reasoning: '', toolSlots: [], finishReason: null, usage: null };
  const chunks = String(text || '').split(/\r?\n\r?\n/);
  for (const chunk of chunks) {
    const piece = consumeSseEvent(chunk, state);
    if (piece && typeof onDelta === 'function') onDelta(piece);
  }
  const toolCalls = state.toolSlots.filter(Boolean);
  const message = {
    role: 'assistant',
    content: state.content,
    ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
  };
  return {
    content: state.content,
    reasoningChars: (state.reasoning || '').length,
    toolCalls,
    message,
    finishReason: state.finishReason,
    usage: state.usage,
  };
}

async function readSseStream(res, onDelta) {
  if (!res?.body || typeof res.body.getReader !== 'function') return null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const state = { content: '', reasoning: '', toolSlots: [], finishReason: null, usage: null };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() || '';
    for (const part of parts) {
      const piece = consumeSseEvent(part, state);
      if (piece && typeof onDelta === 'function') onDelta(piece);
    }
  }
  if (buffer.trim()) {
    const piece = consumeSseEvent(buffer, state);
    if (piece && typeof onDelta === 'function') onDelta(piece);
  }
  const toolCalls = state.toolSlots.filter(Boolean);
  return {
    content: state.content,
    reasoningChars: (state.reasoning || '').length,
    toolCalls,
    message: {
      role: 'assistant',
      content: state.content,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    },
    finishReason: state.finishReason,
    usage: state.usage,
  };
}

function buildRequestBody(messages, model, options = {}) {
  const { maxTokens, reasoning, tools, toolChoice, stream } = options;
  return {
    model,
    messages,
    stream: stream === true,
    ...(typeof maxTokens === 'number' ? { max_tokens: maxTokens } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
    ...(stream === true ? { stream_options: { include_usage: true } } : {}),
  };
}

/**
 * Advance-only OpenRouter completion that can carry tools.
 * Returns the full assistant message so the caller can run a tool loop.
 *
 * @param {object[]} messages
 * @param {string} model
 * @param {{ maxTokens?: number, reasoning?: object, timeoutMs?: number, signal?: AbortSignal, tools?: object[], toolChoice?: string|object }} options
 * @returns {Promise<{ content: string, toolCalls: object[], message: object, finishReason: string|null }>}
 */
async function chatCompletionWithTools(messages, model, options = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set. Add it in Settings → Credentials.');
  }
  if (!model) {
    throw new Error('chatCompletionWithTools requires a model id');
  }

  const startedAt = Date.now();
  const { messageCount, promptChars } = summarizeMessages(messages);
  const { maxTokens, reasoning, timeoutMs, signal: externalSignal, tools, onDelta } = options || {};
  const wantsStream = typeof onDelta === 'function';
  const requestBody = buildRequestBody(messages, model, { ...(options || {}), stream: wantsStream });
  const requestQuery = JSON.stringify(requestBody, null, 2);

  let timeoutSignal;
  if (typeof timeoutMs === 'number' && timeoutMs > 0) {
    timeoutSignal = createTimeoutSignal(timeoutMs);
  }
  const abortSignal = combineAbortSignals(externalSignal, timeoutSignal);

  console.log('[advance-llm] chatCompletionWithTools → request', {
    url: OPENROUTER_URL,
    model,
    stream: wantsStream,
    messageCount,
    promptChars,
    maxTokens: maxTokens ?? null,
    reasoning: reasoning ?? null,
    toolCount: Array.isArray(tools) ? tools.length : 0,
    timeoutMs: timeoutMs ?? null,
  });

  let res;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/xerodays/neuroAGI',
        'X-Title': 'NeuroAGI',
      },
      body: JSON.stringify(requestBody),
      ...(abortSignal ? { signal: abortSignal } : {}),
    });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    console.error('[advance-llm] ✗ network error', {
      model,
      elapsedMs: durationMs,
      error: err?.message || String(err),
    });
    logService.addLog({
      type: 'ai',
      status: 'error',
      model,
      query: requestQuery,
      reasoningEffort: reasoning?.effort ?? null,
      maxTokens: maxTokens ?? null,
      durationMs,
      error: err?.message || String(err),
    });
    throw err;
  }

  if (!res.ok) {
    const errText = await res.text();
    const durationMs = Date.now() - startedAt;
    const errMsg = `OpenRouter ${res.status}: ${errText.slice(0, 400)}`;
    console.error('[advance-llm] ✗ HTTP error', {
      model,
      status: res.status,
      bodyPreview: errText.slice(0, 400),
    });
    logService.addLog({
      type: 'ai',
      status: 'error',
      model,
      query: requestQuery,
      reasoningEffort: reasoning?.effort ?? null,
      maxTokens: maxTokens ?? null,
      durationMs,
      error: errMsg,
    });
    throw new Error(errMsg);
  }

  let json = null;
  let streamed = null;
  if (wantsStream) {
    streamed = await readSseStream(res, onDelta);
    if (!streamed) {
      streamed = parseSseText(await res.text(), onDelta);
    }
  } else {
    json = await res.json();
  }

  if (json?.error) {
    const durationMs = Date.now() - startedAt;
    const errMsg = json.error.message || String(json.error);
    console.error('[advance-llm] ✗ API error payload', { model, error: json.error });
    logService.addLog({
      type: 'ai',
      status: 'error',
      model,
      query: requestQuery,
      reasoningEffort: reasoning?.effort ?? null,
      maxTokens: maxTokens ?? null,
      durationMs,
      error: errMsg,
    });
    throw new Error(errMsg);
  }

  const message = streamed
    ? streamed.message
    : (json?.choices?.[0]?.message || { role: 'assistant', content: '' });
  const content = streamed
    ? streamed.content
    : (typeof message.content === 'string' ? message.content : '');
  const toolCalls = streamed
    ? streamed.toolCalls
    : (Array.isArray(message.tool_calls) ? message.tool_calls : []);
  const finishReason = streamed
    ? streamed.finishReason
    : (json?.choices?.[0]?.finish_reason || null);
  const usage = streamed ? streamed.usage : (json?.usage || null);
  const reasoningChars = streamed
    ? (streamed.reasoningChars || 0)
    : (typeof message.reasoning === 'string' ? message.reasoning.length : 0);
  const durationMs = Date.now() - startedAt;

  console.log('[advance-llm] ✓ done', {
    model,
    contentChars: content.length,
    toolCallCount: toolCalls.length,
    finishReason,
    usage,
    totalElapsedMs: durationMs,
  });

  usageTracker.recordUsage(usage);
  logService.addLog({
    type: 'ai',
    status: 'success',
    model,
    query: requestQuery,
    reasoningEffort: reasoning?.effort ?? null,
    maxTokens: maxTokens ?? null,
    promptTokens: usage?.prompt_tokens ?? null,
    completionTokens: usage?.completion_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
    cost: usage?.cost ?? null,
    response: toolCalls.length > 0 ? JSON.stringify({ content, toolCalls }) : content,
    durationMs,
  });

  return { content, toolCalls, message, finishReason, usage, reasoningChars };
}

module.exports = {
  chatCompletionWithTools,
  applyToolCallDelta,
  consumeSseEvent,
  parseSseText,
};
