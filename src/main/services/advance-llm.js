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

function buildRequestBody(messages, model, options = {}) {
  const { maxTokens, reasoning, tools, toolChoice } = options;
  return {
    model,
    messages,
    stream: false,
    ...(typeof maxTokens === 'number' ? { max_tokens: maxTokens } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
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
    throw new Error('OPENROUTER_API_KEY is not set. Add it to the .env file in the project root.');
  }
  if (!model) {
    throw new Error('chatCompletionWithTools requires a model id');
  }

  const startedAt = Date.now();
  const { messageCount, promptChars } = summarizeMessages(messages);
  const { maxTokens, reasoning, timeoutMs, signal: externalSignal, tools } = options || {};
  const requestBody = buildRequestBody(messages, model, options || {});
  const requestQuery = JSON.stringify(requestBody, null, 2);

  let timeoutSignal;
  if (typeof timeoutMs === 'number' && timeoutMs > 0) {
    timeoutSignal = createTimeoutSignal(timeoutMs);
  }
  const abortSignal = combineAbortSignals(externalSignal, timeoutSignal);

  console.log('[advance-llm] chatCompletionWithTools → request', {
    url: OPENROUTER_URL,
    model,
    stream: false,
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

  const json = await res.json();
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

  const message = json?.choices?.[0]?.message || { role: 'assistant', content: '' };
  const content = typeof message.content === 'string' ? message.content : '';
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const finishReason = json?.choices?.[0]?.finish_reason || null;
  const usage = json?.usage || null;
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

  return { content, toolCalls, message, finishReason };
}

module.exports = { chatCompletionWithTools };
