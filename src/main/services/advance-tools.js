const webSearch = require('./web-search-service');

const QUESTION_TYPES = new Set(['text', 'single_select', 'multi_select', 'slider', 'range']);
const MAX_QUESTIONS = 12;
const MAX_OPTIONS = 20;

const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the live web when current facts, news, or sources are needed.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
      },
      required: ['query'],
    },
  },
};

const FIND_TOPIC_URLS_TOOL = {
  type: 'function',
  function: {
    name: 'find_topic_urls',
    description: 'Find web URLs related to the user issue or topic. Always use this first in research mode, then extract_url on the best URLs.',
    parameters: {
      type: 'object',
      required: ['topic'],
      properties: {
        topic: { type: 'string', description: 'The user issue or subject to find related pages for' },
      },
    },
  },
};

const EXTRACT_URL_TOOL = {
  type: 'function',
  function: {
    name: 'extract_url',
    description: 'Extract content from one or more specific web URLs the user provided or asked to read.',
    parameters: {
      type: 'object',
      required: ['urls'],
      properties: {
        urls: { type: 'array', items: { type: 'string' } },
        query: { type: 'string', description: 'Optional focus query for the extract' },
      },
    },
  },
};

const ASK_USER_TOOL = {
  type: 'function',
  function: {
    name: 'ask_user',
    description: 'Ask the user one or more questions with form controls. Use when you need structured answers.',
    parameters: {
      type: 'object',
      required: ['questions'],
      properties: {
        questions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['question', 'type'],
            properties: {
              question: { type: 'string' },
              type: {
                type: 'string',
                enum: ['text', 'single_select', 'multi_select', 'slider', 'range'],
              },
              options: { type: 'array', items: { type: 'string' } },
              min: { type: 'number' },
              max: { type: 'number' },
              step: { type: 'number' },
              labels: {
                type: 'object',
                properties: {
                  min: { type: 'string' },
                  max: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
};

const ADVANCE_TOOLS = [FIND_TOPIC_URLS_TOOL, WEB_SEARCH_TOOL, EXTRACT_URL_TOOL, ASK_USER_TOOL];

const MAX_EXTRACT_URLS = 5;
const MAX_TOPIC_URLS = 8;
const TOPIC_SEARCH_PREFIX = 'authoritative medical sources and research related to: ';

function sanitizeExtractUrls(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (out.length >= MAX_EXTRACT_URLS) break;
    if (typeof item !== 'string') continue;
    const url = item.trim();
    if (!url) continue;
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
    if (seen.has(parsed.href)) continue;
    seen.add(parsed.href);
    out.push(parsed.href);
  }
  return out;
}

/**
 * Normalize model-emitted questions into the questionnaire control schema.
 * @param {unknown} raw
 * @returns {object[]}
 */
function sanitizeQuestions(raw) {
  if (!Array.isArray(raw)) return [];

  const out = [];
  for (const item of raw) {
    if (out.length >= MAX_QUESTIONS) break;
    if (!item || typeof item !== 'object') continue;

    const type = String(item.type || '').toLowerCase();
    const question = typeof item.question === 'string' ? item.question.trim() : '';
    if (!question || !QUESTION_TYPES.has(type)) continue;

    const q = { question, type };

    if (type === 'single_select' || type === 'multi_select') {
      const options = Array.isArray(item.options) ? item.options : [];
      q.options = options
        .filter((o) => typeof o === 'string' && o.trim())
        .map((o) => o.trim())
        .slice(0, MAX_OPTIONS);
      if (q.options.length === 0) continue;
    }

    if (type === 'slider' || type === 'range') {
      const min = Number(item.min);
      const max = Number(item.max);
      const step = Number(item.step);
      q.min = Number.isFinite(min) ? min : 0;
      q.max = Number.isFinite(max) ? max : (type === 'range' ? 100 : 10);
      q.step = Number.isFinite(step) && step > 0 ? step : 1;
      const labels = item.labels && typeof item.labels === 'object' ? item.labels : {};
      q.labels = {
        min: typeof labels.min === 'string' ? labels.min : '',
        max: typeof labels.max === 'string' ? labels.max : '',
      };
    }

    out.push(q);
  }
  return out;
}

/**
 * Run Tavily search and return the evidence shape QueryEnhancer keeps.
 * Failures become a JSON error string so the model can still reply.
 * @param {{ query?: unknown }} args
 * @returns {Promise<string>}
 */
async function executeWebSearch(args = {}) {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) {
    return JSON.stringify({ error: 'web_search requires a non-empty query string.' });
  }

  try {
    const res = await webSearch.search(query, {
      includeAnswer: true,
      maxResults: 5,
    });
    return JSON.stringify({
      answer: res?.answer || null,
      results: Array.isArray(res?.results)
        ? res.results.map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content,
        }))
        : [],
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[advance-tools] web_search failed:', error);
    return JSON.stringify({ error });
  }
}

function sanitizeTopicUrl(raw) {
  if (typeof raw !== 'string') return '';
  const url = raw.trim();
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.href;
  } catch {
    return '';
  }
}

/**
 * Search for URLs related to a topic using a fixed Tavily query.
 * @param {{ topic?: unknown }} args
 * @returns {Promise<string>}
 */
async function executeFindTopicUrls(args = {}) {
  const topic = typeof args.topic === 'string' ? args.topic.trim() : '';
  if (!topic) {
    return JSON.stringify({ error: 'find_topic_urls requires a non-empty topic string.' });
  }

  const query = `${TOPIC_SEARCH_PREFIX}${topic}`;

  try {
    const res = await webSearch.search(query, {
      searchDepth: 'advanced',
      includeAnswer: false,
      maxResults: MAX_TOPIC_URLS,
    });

    const seen = new Set();
    const urls = [];
    const results = Array.isArray(res?.results) ? res.results : [];
    for (const item of results) {
      if (urls.length >= MAX_TOPIC_URLS) break;
      const href = sanitizeTopicUrl(item?.url);
      if (!href || seen.has(href)) continue;
      seen.add(href);
      urls.push({
        title: typeof item?.title === 'string' ? item.title : '',
        url: href,
      });
    }

    return JSON.stringify({ topic, query, urls });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[advance-tools] find_topic_urls failed:', error);
    return JSON.stringify({ error });
  }
}

/**
 * Extract page content for specific URLs via Tavily.
 * @param {{ urls?: unknown, query?: unknown }} args
 * @returns {Promise<string>}
 */
async function executeExtractUrl(args = {}) {
  const urls = sanitizeExtractUrls(args.urls);
  if (!urls.length) {
    return JSON.stringify({ error: 'extract_url requires one or more http(s) URLs.' });
  }

  const query = typeof args.query === 'string' ? args.query.trim() : '';

  try {
    const res = await webSearch.extract(urls, {
      ...(query ? { query } : {}),
      extractDepth: 'advanced',
      includeImages: true,
      includeFavicon: true,
      includeUsage: true,
    });
    return JSON.stringify({
      results: Array.isArray(res?.results) ? res.results : [],
      failedResults: Array.isArray(res?.failedResults) ? res.failedResults : [],
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[advance-tools] extract_url failed:', error);
    return JSON.stringify({ error });
  }
}

/**
 * Dispatch a single immediate tool. ask_user is handled by the chat loop, not here.
 * @param {string} name
 * @param {unknown} args
 * @returns {Promise<string>}
 */
async function executeTool(name, args) {
  const payload = args && typeof args === 'object' ? args : {};
  if (name === 'find_topic_urls') {
    return executeFindTopicUrls(payload);
  }
  if (name === 'web_search') {
    return executeWebSearch(payload);
  }
  if (name === 'extract_url') {
    return executeExtractUrl(payload);
  }
  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

module.exports = {
  WEB_SEARCH_TOOL,
  FIND_TOPIC_URLS_TOOL,
  EXTRACT_URL_TOOL,
  ASK_USER_TOOL,
  ADVANCE_TOOLS,
  sanitizeQuestions,
  executeWebSearch,
  executeFindTopicUrls,
  executeExtractUrl,
  executeTool,
};
