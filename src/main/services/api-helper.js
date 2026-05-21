const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function streamChat(messages, model, onDelta, onDone, onError, options = {}) {
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
  let deltaCount = 0;
  let deltaChars = 0;

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

  let doneCalled = false;
  const finish = () => {
    if (doneCalled) return;
    doneCalled = true;
    console.log('[api-helper] streamChat ✓ done', {
      model,
      deltaCount,
      deltaChars,
      totalElapsedMs: Date.now() - startedAt,
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
      console.error('[api-helper] streamChat ✗ HTTP error', {
        model,
        status: res.status,
        bodyPreview: errText.slice(0, 400),
      });
      onError(new Error(`OpenRouter ${res.status}: ${errText.slice(0, 400)}`));
      return;
    }

    if (!res.body) {
      console.error('[api-helper] streamChat ✗ no response body', { model });
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
            onDelta(delta);
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
              onDelta(delta);
            }
          } catch {
          }
        }
      }
    }

    finish();
  } catch (err) {
    console.error('[api-helper] streamChat ✗ exception', {
      model,
      elapsedMs: Date.now() - startedAt,
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
    console.error('[api-helper] chatCompletion ✗ network error', {
      model,
      elapsedMs: Date.now() - startedAt,
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
    console.error('[api-helper] chatCompletion ✗ HTTP error', {
      model,
      status: res.status,
      bodyPreview: errText.slice(0, 400),
    });
    throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 400)}`);
  }

  const json = await res.json();
  if (json?.error) {
    console.error('[api-helper] chatCompletion ✗ API error payload', { model, error: json.error });
    throw new Error(json.error.message || String(json.error));
  }

  const content = json?.choices?.[0]?.message?.content ?? '';
  const usage = json?.usage || null;
  console.log('[api-helper] chatCompletion ✓ done', {
    model,
    contentChars: content.length,
    finishReason: json?.choices?.[0]?.finish_reason || null,
    usage,
    totalElapsedMs: Date.now() - startedAt,
  });

  return content;
}

module.exports = {
  streamChat,
  chatCompletion,
};
