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

const ADVANCE_TOOLS = [WEB_SEARCH_TOOL, ASK_USER_TOOL];

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

/**
 * Dispatch a single immediate tool. ask_user is handled by the chat loop, not here.
 * @param {string} name
 * @param {unknown} args
 * @returns {Promise<string>}
 */
async function executeTool(name, args) {
  if (name === 'web_search') {
    return executeWebSearch(args && typeof args === 'object' ? args : {});
  }
  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

module.exports = {
  WEB_SEARCH_TOOL,
  ASK_USER_TOOL,
  ADVANCE_TOOLS,
  sanitizeQuestions,
  executeWebSearch,
  executeTool,
};
