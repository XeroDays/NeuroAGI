const usageTracker = require('./usage-tracker');
const logService = require('./log-service');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function streamChat(
  messages,
  model,
  onDelta,
  onDone,
  onError,
  options = {},
  onReasoningDelta = () => {}
) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('[api-helper] streamChat: OPENROUTER_API_KEY is not set');
    onError(
      new Error(
        'OPENROUTER_API_KEY is not set. Add it to the .env file in the project root.'
      )
    );
    return;
  }
  if (!model) {
    console.error('[api-helper] streamChat: missing model id');
    onError(new Error('streamChat requires a model id'));
    return;
  }

  const startedAt = Date.now();
  const messageCount = Array.isArray(messages) ? messages.length : 0;
  const promptChars = Array.isArray(messages)
    ? messages.reduce((sum, m) => sum + (typeof m?.content === 'string' ? m.content.length : 0), 0)
    : 0;
  const queryText = Array.isArray(messages)
    ? messages.map((m) => (typeof m?.content === 'string' ? m.content : '')).join('\n\n')
    : '';
  let deltaCount = 0;
  let deltaChars = 0;
  let accumulatedContent = '';
  let reasoningCount = 0;
  let reasoningChars = 0;

  const { maxTokens, reasoning } = options || {};

  console.log('[api-helper] streamChat → request', {
    url: OPENROUTER_URL,
    model,
    stream: true,
    messageCount,
    promptChars,
    maxTokens: maxTokens ?? null,
    reasoning: reasoning ?? null,
  });

  let lastUsage = null;

  let doneCalled = false;
  const finish = () => {
    if (doneCalled) return;
    doneCalled = true;
    const durationMs = Date.now() - startedAt;
    console.log('[api-helper] streamChat ✓ done', {
      model,
      deltaCount,
      deltaChars,
      reasoningCount,
      reasoningChars,
      usage: lastUsage,
      totalElapsedMs: durationMs,
    });
    usageTracker.recordUsage(lastUsage);
    logService.addLog({
      type: 'ai',
      status: 'success',
      model,
      query: queryText,
      reasoningEffort: reasoning?.effort ?? null,
      maxTokens: maxTokens ?? null,
      promptTokens: lastUsage?.prompt_tokens ?? null,
      completionTokens: lastUsage?.completion_tokens ?? null,
      totalTokens: lastUsage?.total_tokens ?? null,
      cost: lastUsage?.cost ?? null,
      response: accumulatedContent,
      durationMs,
    });
    onDone();
  };

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/xerodays/neuroAGI',
        'X-Title': 'NeuroAGI'
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        usage: { include: true },
        ...(typeof maxTokens === 'number' ? { max_tokens: maxTokens } : {}),
        ...(reasoning ? { reasoning } : {}),
      })
    });

    console.log('[api-helper] streamChat ← response', {
      model,
      status: res.status,
      ok: res.ok,
      elapsedMs: Date.now() - startedAt,
    });

    if (!res.ok) {
      const errText = await res.text();
      const durationMs = Date.now() - startedAt;
      console.error('[api-helper] streamChat ✗ HTTP error', {
        model,
        status: res.status,
        bodyPreview: errText.slice(0, 400),
      });
      const errMsg = `OpenRouter ${res.status}: ${errText.slice(0, 400)}`;
      logService.addLog({
        type: 'ai',
        status: 'error',
        model,
        query: queryText,
        reasoningEffort: reasoning?.effort ?? null,
        maxTokens: maxTokens ?? null,
        durationMs,
        error: errMsg,
      });
      onError(new Error(errMsg));
      return;
    }

    if (!res.body) {
      console.error('[api-helper] streamChat ✗ no response body', { model });
      logService.addLog({
        type: 'ai',
        status: 'error',
        model,
        query: queryText,
        reasoningEffort: reasoning?.effort ?? null,
        maxTokens: maxTokens ?? null,
        durationMs: Date.now() - startedAt,
        error: 'OpenRouter response has no body',
      });
      onError(new Error('OpenRouter response has no body'));
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() || '';

      for (const rawLine of parts) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          finish();
          return;
        }
        try {
          const json = JSON.parse(data);
          const err = json.error;
          if (err) {
            onError(new Error(err.message || String(err)));
            return;
          }
          const delta = json.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            deltaCount += 1;
            deltaChars += delta.length;
            accumulatedContent += delta;
            onDelta(delta);
          }
          const reasoning = json.choices?.[0]?.delta?.reasoning;
          if (typeof reasoning === 'string' && reasoning.length > 0) {
            reasoningCount += 1;
            reasoningChars += reasoning.length;
            onReasoningDelta(reasoning);
          }
          if (json.usage && typeof json.usage === 'object') {
            lastUsage = json.usage;
          }
        } catch {
        }
      }
    }

    if (buffer.trim()) {
      const line = buffer.trim();
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data !== '[DONE]') {
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta.length > 0) {
              deltaCount += 1;
              deltaChars += delta.length;
              accumulatedContent += delta;
              onDelta(delta);
            }
            const reasoning = json.choices?.[0]?.delta?.reasoning;
            if (typeof reasoning === 'string' && reasoning.length > 0) {
              reasoningCount += 1;
              reasoningChars += reasoning.length;
              onReasoningDelta(reasoning);
            }
            if (json.usage && typeof json.usage === 'object') {
              lastUsage = json.usage;
            }
          } catch {
          }
        }
      }
    }

    finish();
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    console.error('[api-helper] streamChat ✗ exception', {
      model,
      elapsedMs: durationMs,
      error: err?.message || String(err),
    });
    logService.addLog({
      type: 'ai',
      status: 'error',
      model,
      query: queryText,
      reasoningEffort: reasoning?.effort ?? null,
      maxTokens: maxTokens ?? null,
      durationMs,
      error: err?.message || String(err),
    });
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

async function chatCompletion(messages, model, options = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('[api-helper] chatCompletion: OPENROUTER_API_KEY is not set');
    throw new Error('OPENROUTER_API_KEY is not set. Add it to the .env file in the project root.');
  }
  if (!model) {
    throw new Error('chatCompletion requires a model id');
  }

  const startedAt = Date.now();
  const messageCount = Array.isArray(messages) ? messages.length : 0;
  const promptChars = Array.isArray(messages)
    ? messages.reduce((sum, m) => sum + (typeof m?.content === 'string' ? m.content.length : 0), 0)
    : 0;
  const queryText = Array.isArray(messages)
    ? messages.map((m) => (typeof m?.content === 'string' ? m.content : '')).join('\n\n')
    : '';

  const { maxTokens, reasoning } = options || {};

  console.log('[api-helper] chatCompletion → request', {
    url: OPENROUTER_URL,
    model,
    stream: false,
    messageCount,
    promptChars,
    maxTokens: maxTokens ?? null,
    reasoning: reasoning ?? null,
  });

  let res;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/xerodays/neuroAGI',
        'X-Title': 'NeuroAGI'
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(typeof maxTokens === 'number' ? { max_tokens: maxTokens } : {}),
        ...(reasoning ? { reasoning } : {}),
      })
    });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    console.error('[api-helper] chatCompletion ✗ network error', {
      model,
      elapsedMs: durationMs,
      error: err?.message || String(err),
    });
    logService.addLog({
      type: 'ai',
      status: 'error',
      model,
      query: queryText,
      reasoningEffort: reasoning?.effort ?? null,
      maxTokens: maxTokens ?? null,
      durationMs,
      error: err?.message || String(err),
    });
    throw err;
  }

  const elapsedMs = Date.now() - startedAt;
  console.log('[api-helper] chatCompletion ← response', {
    model,
    status: res.status,
    ok: res.ok,
    elapsedMs,
  });

  if (!res.ok) {
    const errText = await res.text();
    const durationMs = Date.now() - startedAt;
    console.error('[api-helper] chatCompletion ✗ HTTP error', {
      model,
      status: res.status,
      bodyPreview: errText.slice(0, 400),
    });
    const errMsg = `OpenRouter ${res.status}: ${errText.slice(0, 400)}`;
    logService.addLog({
      type: 'ai',
      status: 'error',
      model,
      query: queryText,
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
    console.error('[api-helper] chatCompletion ✗ API error payload', { model, error: json.error });
    logService.addLog({
      type: 'ai',
      status: 'error',
      model,
      query: queryText,
      reasoningEffort: reasoning?.effort ?? null,
      maxTokens: maxTokens ?? null,
      durationMs,
      error: errMsg,
    });
    throw new Error(errMsg);
  }

  const content = json?.choices?.[0]?.message?.content ?? '';
  const usage = json?.usage || null;
  const durationMs = Date.now() - startedAt;
  console.log('[api-helper] chatCompletion ✓ done', {
    model,
    contentChars: content.length,
    finishReason: json?.choices?.[0]?.finish_reason || null,
    usage,
    totalElapsedMs: durationMs,
  });
  usageTracker.recordUsage(usage);
  logService.addLog({
    type: 'ai',
    status: 'success',
    model,
    query: queryText,
    reasoningEffort: reasoning?.effort ?? null,
    maxTokens: maxTokens ?? null,
    promptTokens: usage?.prompt_tokens ?? null,
    completionTokens: usage?.completion_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
    cost: usage?.cost ?? null,
    response: content,
    durationMs,
  });

  return content;
}

module.exports = {
  streamChat,
  chatCompletion,
};
