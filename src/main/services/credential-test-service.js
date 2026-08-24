const OPENROUTER_KEY_URL = 'https://openrouter.ai/api/v1/key';
const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';

function emptyResult() {
  return { ok: false, status: null, message: 'Enter a key' };
}

function sanitizeMessage(text) {
  return String(text || '')
    .replace(/sk-or-[^\s"'\\]+/gi, '[key]')
    .replace(/tvly-[^\s"'\\]+/gi, '[key]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function resultFromStatus(status, bodyText) {
  if (status === 401 || status === 403) {
    return { ok: false, status, message: 'Invalid' };
  }
  if (status >= 200 && status < 300) {
    return { ok: true, status, message: 'Valid' };
  }
  const detail = sanitizeMessage(bodyText);
  return {
    ok: false,
    status,
    message: detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}`,
  };
}

async function probe(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    return {
      ok: false,
      status: null,
      message: sanitizeMessage(err?.message) || 'Network error',
    };
  }
  let bodyText = '';
  try {
    bodyText = await res.text();
  } catch {
    bodyText = '';
  }
  return resultFromStatus(res.status, bodyText);
}

function readApiKey(payload) {
  const raw = payload && typeof payload === 'object' ? payload.apiKey : '';
  return String(raw ?? '').replace(/[\r\n]/g, '').trim();
}

async function testOpenRouterKey(payload) {
  const apiKey = readApiKey(payload);
  if (!apiKey) return emptyResult();
  return probe(OPENROUTER_KEY_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
}

async function testTavilyKey(payload) {
  const apiKey = readApiKey(payload);
  if (!apiKey) return emptyResult();
  return probe(TAVILY_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: 'ping',
      max_results: 1,
      search_depth: 'basic',
    }),
  });
}

module.exports = { testOpenRouterKey, testTavilyKey };
