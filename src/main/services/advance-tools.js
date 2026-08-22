const webSearch = require('./web-search-service');

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

const ADVANCE_TOOLS = [WEB_SEARCH_TOOL];

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
 * Dispatch a single tool call by name.
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
  ADVANCE_TOOLS,
  executeWebSearch,
  executeTool,
};
