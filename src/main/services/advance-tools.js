const webSearch = require('./web-search-service');
const profilesService = require('./profiles-service');

const QUESTION_TYPES = new Set(['text', 'single_select', 'multi_select', 'slider', 'range']);
const MAX_QUESTIONS = 12;
const MAX_OPTIONS = 20;

const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'On a new personal/diagnostic issue, use after find_topic_urls + extract_url for extra targeted facts (guidelines, differentials, named medicines). Also use for an unknown or likely-misspelled medicine, a time-sensitive fact, or when you are not confident. Not a replacement for find + extract. Do not use for simple definitions.',
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
    description: 'Required first step on a new personal/diagnostic issue. Pass topic as the user’s issue, then extract_url on the best URLs. Do not use for simple definitions or general “what is X” questions.',
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
    description: 'Required after find_topic_urls on a diagnostic turn (up to 5 URLs). Also extract URLs the user pasted or asked to read.',
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
    description: 'Ask issue-specific investigation questions that the loaded user profile does not already answer (onset, severity, associated symptoms, meds, labs). Check get_profile_by_id first. Do not re-ask facts already in the profile. Do not use on definitions or general-education questions. Do not re-ask after they just submitted answers. After answers, persist lasting facts with create_update_user_profile.',
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

const GET_AVAILABLE_USERS_TOOL = {
  type: 'function',
  function: {
    name: 'get_available_users',
    description: 'List saved user profiles as id, name, age, and gender only. Use first on a Home submit to match the current Patient line. Does not return the stored profile body.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

const GET_PROFILE_BY_ID_TOOL = {
  type: 'function',
  function: {
    name: 'get_profile_by_id',
    description: 'Load the full stored profile JSON (id, name, age, gender, profile) for context. Call after matching or creating a user, and before ask_user so you can skip questions the profile already answers.',
    parameters: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'User profile id' },
      },
    },
  },
};

const CREATE_UPDATE_USER_PROFILE_TOOL = {
  type: 'function',
  function: {
    name: 'create_update_user_profile',
    description: 'Create or update a user profile. Omit userid to create a new GUID. Pass userid to update that record. content must be short and to the point: medications and timings, other history, nutrition, food intake, daily routine. Merge new facts; do not wipe unrelated prior facts. name, age, and gender are required when creating.',
    parameters: {
      type: 'object',
      required: ['content'],
      properties: {
        userid: { type: 'string', description: 'Existing profile id. Omit to create.' },
        content: {
          type: 'string',
          description: 'Short profile body: meds/timings, history, nutrition, food, routine',
        },
        name: { type: 'string', description: 'Required when creating' },
        age: { type: 'number', description: 'Required when creating' },
        gender: { type: 'string', description: 'Required when creating' },
      },
    },
  },
};

const ADVANCE_TOOLS = [
  GET_AVAILABLE_USERS_TOOL,
  GET_PROFILE_BY_ID_TOOL,
  CREATE_UPDATE_USER_PROFILE_TOOL,
  FIND_TOPIC_URLS_TOOL,
  WEB_SEARCH_TOOL,
  EXTRACT_URL_TOOL,
  ASK_USER_TOOL,
];

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
function executeGetAvailableUsers() {
  return JSON.stringify({ users: profilesService.listSummaries() });
}

function executeGetProfileById(payload) {
  const result = profilesService.getById(payload.id);
  return JSON.stringify(result);
}

function executeCreateUpdateUserProfile(payload) {
  const result = profilesService.upsert({
    userid: payload.userid ?? payload.userId ?? payload.id,
    content: payload.content,
    name: payload.name,
    age: payload.age,
    gender: payload.gender,
  });
  return JSON.stringify(result);
}

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
  if (name === 'get_available_users') {
    return executeGetAvailableUsers();
  }
  if (name === 'get_profile_by_id') {
    return executeGetProfileById(payload);
  }
  if (name === 'create_update_user_profile') {
    return executeCreateUpdateUserProfile(payload);
  }
  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

module.exports = {
  WEB_SEARCH_TOOL,
  FIND_TOPIC_URLS_TOOL,
  EXTRACT_URL_TOOL,
  ASK_USER_TOOL,
  GET_AVAILABLE_USERS_TOOL,
  GET_PROFILE_BY_ID_TOOL,
  CREATE_UPDATE_USER_PROFILE_TOOL,
  ADVANCE_TOOLS,
  sanitizeQuestions,
  executeWebSearch,
  executeFindTopicUrls,
  executeExtractUrl,
  executeTool,
};
