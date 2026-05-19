const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'qwen/qwen3.6-plus-preview:free';

const fs = require('fs');
const path = require('path');

function loadOpenRouterApiKey() {
  // Prefer env var (recommended).
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;

  // Local dev fallback: file at repo root (git-ignored).
  const keyFilePath = path.join(__dirname, 'OPENROUTER_API_KEY.txt');
  try {
    const raw = fs.readFileSync(keyFilePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith('#')) continue;
      return t; // first non-empty non-comment line
    }
  } catch {
    // Missing file is fine; we'll show a helpful error below.
  }
  return null;
}

/**
 * Stream chat completions from OpenRouter (SSE).
 * @param {Array<{ role: string, content: string }>} messages
 * @param {(text: string) => void} onDelta
 * @param {() => void} onDone
 * @param {(err: Error) => void} onError
 */
async function streamChat(messages, onDelta, onDone, onError) {
  const apiKey = loadOpenRouterApiKey();
  if (!apiKey) {
    onError(
      new Error(
        'OpenRouter API key is not set. Set OPENROUTER_API_KEY in your environment, or put the key in OPENROUTER_API_KEY.txt (repo root).'
      )
    );
    return;
  }

  let doneCalled = false;
  const finish = () => {
    if (doneCalled) return;
    doneCalled = true;
    onDone();
  };

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/neuroagi',
        'X-Title': 'NeuroAGI'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages,
        stream: true
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      onError(new Error(`OpenRouter ${res.status}: ${errText.slice(0, 400)}`));
      return;
    }

    if (!res.body) {
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
            onDelta(delta);
          }
        } catch {
          // ignore non-JSON SSE lines
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
            if (typeof delta === 'string' && delta.length > 0) onDelta(delta);
          } catch {
            /* ignore */
          }
        }
      }
    }

    finish();
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

module.exports = {
  streamChat,
  OPENROUTER_MODEL
};
