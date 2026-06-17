const logService = require('./log-service');

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const TAVILY_EXTRACT_URL = 'https://api.tavily.com/extract';

function getApiKey() {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not set. Add it to the .env file in the project root.');
  }
  return apiKey;
}

async function search(query, options = {}) {
  const apiKey = getApiKey();
  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new Error('webSearch.search requires a non-empty query string');
  }

  const {
    searchDepth = 'advanced',
    maxResults = 5,
    topic = 'general',
    includeAnswer = true,
    includeRawContent = false,
    includeImages = false,
    includeDomains,
    excludeDomains,
    days,
  } = options || {};

  const body = {
    query,
    search_depth: searchDepth,
    max_results: maxResults,
    topic,
    include_answer: includeAnswer,
    include_raw_content: includeRawContent,
    include_images: includeImages,
    ...(Array.isArray(includeDomains) ? { include_domains: includeDomains } : {}),
    ...(Array.isArray(excludeDomains) ? { exclude_domains: excludeDomains } : {}),
    ...(typeof days === 'number' ? { days } : {}),
  };

  const startedAt = Date.now();
  console.log('[web-search] search → request', {
    url: TAVILY_SEARCH_URL,
    queryChars: query.length,
    searchDepth,
    maxResults,
    topic,
  });

  let res;
  try {
    res = await fetch(TAVILY_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    console.error('[web-search] search ✗ network error', {
      elapsedMs: durationMs,
      error: err?.message || String(err),
    });
    logService.addLog({
      type: 'web',
      status: 'error',
      query,
      durationMs,
      error: err?.message || String(err),
    });
    throw err;
  }

  const elapsedMs = Date.now() - startedAt;
  console.log('[web-search] search ← response', {
    status: res.status,
    ok: res.ok,
    elapsedMs,
  });

  if (!res.ok) {
    const errText = await res.text();
    const durationMs = Date.now() - startedAt;
    const errMsg = `Tavily ${res.status}: ${errText.slice(0, 400)}`;
    console.error('[web-search] search ✗ HTTP error', {
      status: res.status,
      bodyPreview: errText.slice(0, 400),
    });
    logService.addLog({
      type: 'web',
      status: 'error',
      query,
      durationMs,
      error: errMsg,
    });
    throw new Error(errMsg);
  }

  const json = await res.json();
  const results = Array.isArray(json?.results) ? json.results : [];
  const durationMs = Date.now() - startedAt;
  console.log('[web-search] search ✓ done', {
    resultCount: results.length,
    hasAnswer: Boolean(json?.answer),
    totalElapsedMs: durationMs,
  });

  const response = {
    query,
    answer: json?.answer ?? null,
    results: results.map((r) => ({
      title: r?.title ?? '',
      url: r?.url ?? '',
      content: r?.content ?? '',
      score: typeof r?.score === 'number' ? r.score : null,
      rawContent: r?.raw_content ?? null,
    })),
    images: Array.isArray(json?.images) ? json.images : [],
    responseTime: json?.response_time ?? null,
  };

  logService.addLog({
    type: 'web',
    status: 'success',
    query,
    response,
    durationMs,
  });

  return response;
}

async function extract(urls, options = {}) {
  const apiKey = getApiKey();
  const urlList = Array.isArray(urls) ? urls : [urls];
  if (urlList.length === 0 || urlList.some((u) => typeof u !== 'string' || !u.trim())) {
    throw new Error('webSearch.extract requires one or more non-empty URL strings');
  }

  const { extractDepth = 'basic', includeImages = false } = options || {};

  const body = {
    urls: urlList,
    extract_depth: extractDepth,
    include_images: includeImages,
  };

  const startedAt = Date.now();
  console.log('[web-search] extract → request', {
    url: TAVILY_EXTRACT_URL,
    urlCount: urlList.length,
    extractDepth,
  });

  const extractQuery = urlList.join(', ');

  let res;
  try {
    res = await fetch(TAVILY_EXTRACT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    console.error('[web-search] extract ✗ network error', {
      elapsedMs: durationMs,
      error: err?.message || String(err),
    });
    logService.addLog({
      type: 'web',
      status: 'error',
      query: extractQuery,
      durationMs,
      error: err?.message || String(err),
    });
    throw err;
  }

  const elapsedMs = Date.now() - startedAt;
  console.log('[web-search] extract ← response', {
    status: res.status,
    ok: res.ok,
    elapsedMs,
  });

  if (!res.ok) {
    const errText = await res.text();
    const durationMs = Date.now() - startedAt;
    const errMsg = `Tavily ${res.status}: ${errText.slice(0, 400)}`;
    console.error('[web-search] extract ✗ HTTP error', {
      status: res.status,
      bodyPreview: errText.slice(0, 400),
    });
    logService.addLog({
      type: 'web',
      status: 'error',
      query: extractQuery,
      durationMs,
      error: errMsg,
    });
    throw new Error(errMsg);
  }

  const json = await res.json();
  const results = Array.isArray(json?.results) ? json.results : [];
  const durationMs = Date.now() - startedAt;
  console.log('[web-search] extract ✓ done', {
    resultCount: results.length,
    totalElapsedMs: durationMs,
  });

  const response = {
    results: results.map((r) => ({
      url: r?.url ?? '',
      rawContent: r?.raw_content ?? '',
      images: Array.isArray(r?.images) ? r.images : [],
    })),
    failedResults: Array.isArray(json?.failed_results) ? json.failed_results : [],
    responseTime: json?.response_time ?? null,
  };

  logService.addLog({
    type: 'web',
    status: 'success',
    query: extractQuery,
    response,
    durationMs,
  });

  return response;
}

module.exports = {
  search,
  extract,
};
