const { chatCompletionWithTools } = require('./advance-llm');
const { ADVANCE_TOOLS, executeTool, sanitizeQuestions } = require('./advance-tools');
const { ADVANCE_SYSTEM_PROMPT } = require('./advance-system-prompt');
const modelConfigService = require('./model-config-service');

const LLM_OPTIONS_BY_LEVEL = {
  none: { maxTokens: 4096, reasoning: { effort: 'none' } },
  low: { maxTokens: 8192, reasoning: { effort: 'low' } },
  medium: { maxTokens: 16384, reasoning: { effort: 'medium' } },
  high: { maxTokens: 32768, reasoning: { effort: 'high' } },
  very_high: { maxTokens: 65536, reasoning: { effort: 'high' } },
};

const DEFAULT_REASONING_LEVEL = 'medium';

function resolveLlmOptions(level) {
  const mapped = LLM_OPTIONS_BY_LEVEL[level] || LLM_OPTIONS_BY_LEVEL[DEFAULT_REASONING_LEVEL];
  return {
    maxTokens: mapped.maxTokens,
    reasoning: mapped.reasoning,
    tools: ADVANCE_TOOLS,
    toolChoice: 'auto',
  };
}

const MAX_TOOL_ROUNDS = 4;

class AdvanceAbortError extends Error {
  constructor() {
    super('Aborted');
    this.name = 'AdvanceAbortError';
    this.aborted = true;
  }
}

function isAbortError(err) {
  if (!err) return false;
  if (err.name === 'AdvanceAbortError' || err.aborted === true) return true;
  if (err.name === 'AbortError') return true;
  const message = err instanceof Error ? err.message : String(err);
  return /aborted|abort/i.test(message);
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new AdvanceAbortError();
}
let stepClock = 0;

function nextStepId(prefix) {
  stepClock += 1;
  return `${prefix}-${stepClock}`;
}

function parseToolArgs(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function emitStep(onProgress, { id, tool, state, label, detail }) {
  onProgress({
    type: 'step',
    id: String(id || ''),
    tool,
    state,
    label,
    ...(typeof detail === 'string' && detail.trim() ? { detail: detail.trim() } : {}),
  });
}

function toolDetail(name, args) {
  if (name === 'find_topic_urls' && typeof args.topic === 'string') {
    return args.topic.trim();
  }
  if (name === 'web_search' && typeof args.query === 'string') {
    return args.query.trim();
  }
  if (name === 'extract_url') {
    const urls = Array.isArray(args.urls) ? args.urls : [];
    const first = urls.find((u) => typeof u === 'string' && u.trim());
    return first ? String(first).trim() : '';
  }
  return '';
}

function toolLabel(name, state) {
  if (name === 'find_topic_urls') return state === 'running' ? 'Finding sources…' : 'Found sources';
  if (name === 'web_search') return state === 'running' ? 'Searching…' : 'Searched';
  if (name === 'extract_url') return state === 'running' ? 'Extracting…' : 'Extracted';
  if (name === 'ask_user') return state === 'running' ? 'Asking questions…' : 'Questions asked';
  if (name === 'model') return state === 'running' ? 'Loading…' : 'Loaded';
  return state === 'running' ? `${name}…` : name;
}

function toolResultHasError(content) {
  if (typeof content !== 'string' || !content.trim()) return false;
  try {
    const parsed = JSON.parse(content);
    return Boolean(parsed && typeof parsed === 'object' && parsed.error);
  } catch {
    return false;
  }
}

function sanitizeAssistantMessage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const toolCalls = Array.isArray(raw.tool_calls) ? raw.tool_calls : [];
  const cleaned = [];
  for (const call of toolCalls) {
    if (!call || typeof call !== 'object') continue;
    const fn = call.function && typeof call.function === 'object' ? call.function : {};
    cleaned.push({
      id: String(call.id || ''),
      type: 'function',
      function: {
        name: String(fn.name || ''),
        arguments: typeof fn.arguments === 'string'
          ? fn.arguments
          : JSON.stringify(fn.arguments ?? {}),
      },
    });
  }
  if (!cleaned.length) return null;
  return {
    role: 'assistant',
    content: typeof raw.content === 'string' ? raw.content : null,
    tool_calls: cleaned,
  };
}

function sanitizeToolResults(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const id = String(item.tool_call_id || item.id || '');
    if (!id) continue;
    out.push({
      role: 'tool',
      tool_call_id: id,
      name: String(item.name || ''),
      content: typeof item.content === 'string'
        ? item.content
        : JSON.stringify(item.content ?? ''),
    });
  }
  return out;
}

function sanitizeAnswers(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 12).map((item) => {
    if (!item || typeof item !== 'object') {
      return { question: '', type: 'text', value: '' };
    }
    return {
      question: typeof item.question === 'string' ? item.question : '',
      type: typeof item.type === 'string' ? item.type : 'text',
      value: item.value,
    };
  });
}

function applyResume(working, resume) {
  if (!resume || typeof resume !== 'object') return false;
  const askUserCallId = typeof resume.askUserCallId === 'string'
    ? resume.askUserCallId
    : '';
  if (!askUserCallId) return false;

  const assistantMessage = sanitizeAssistantMessage(resume.assistantMessage);
  if (assistantMessage) working.push(assistantMessage);

  for (const result of sanitizeToolResults(resume.priorToolResults)) {
    working.push(result);
  }

  working.push({
    role: 'tool',
    tool_call_id: askUserCallId,
    name: 'ask_user',
    content: JSON.stringify(sanitizeAnswers(resume.answers)),
  });
  return true;
}

/**
 * Send a multi-turn chat to the starred master model, with web_search,
 * extract_url, and ask_user. ask_user pauses the loop until the renderer
 * resumes with answers.
 *
 * @param {{ role: string, content: string }[]} messages
 * @param {{ onProgress?: (payload: object) => void, reasoningLevel?: string, signal?: AbortSignal }} [hooks]
 * @param {object|null} [resume]
 * @returns {Promise<{ reply: string|null, model: string, preface?: string, pendingAsk?: object }>}
 */
async function askMasterChat(messages, hooks = {}, resume = null) {
  const masterId = modelConfigService.getMasterModelRuntimeId();
  if (!masterId) {
    throw new Error('No master model selected. Star a model in the Models popup.');
  }

  const onProgress = typeof hooks.onProgress === 'function' ? hooks.onProgress : () => {};
  const signal = hooks.signal;
  const llmOptions = {
    ...resolveLlmOptions(hooks.reasoningLevel),
    ...(signal ? { signal } : {}),
  };
  const working = [
    { role: 'system', content: ADVANCE_SYSTEM_PROMPT },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const resumed = applyResume(working, resume);

  console.log(
    `[advance-chat] master query → ${masterId} (${working.length} messages${resumed ? ', resume' : ''}, reasoning=${hooks.reasoningLevel || DEFAULT_REASONING_LEVEL})`
  );

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    throwIfAborted(signal);
    const modelId = nextStepId('model');
    emitStep(onProgress, {
      id: modelId,
      tool: 'model',
      state: 'running',
      label: toolLabel('model', 'running'),
    });

    let content;
    let toolCalls;
    let message;
    try {
      ({ content, toolCalls, message } = await chatCompletionWithTools(
        working,
        masterId,
        llmOptions
      ));
    } catch (err) {
      if (isAbortError(err) || signal?.aborted) {
        emitStep(onProgress, {
          id: modelId,
          tool: 'model',
          state: 'done',
          label: toolLabel('model', 'done'),
        });
        throw new AdvanceAbortError();
      }
      emitStep(onProgress, {
        id: modelId,
        tool: 'model',
        state: 'error',
        label: 'Failed',
      });
      throw err;
    }

    emitStep(onProgress, {
      id: modelId,
      tool: 'model',
      state: 'done',
      label: toolLabel('model', 'done'),
    });

    if (!toolCalls.length) {
      return { reply: content, model: masterId };
    }

    if (round === MAX_TOOL_ROUNDS) {
      return {
        reply: content || 'I reached the tool limit before I could finish. Please try again.',
        model: masterId,
      };
    }

    const assistantMessage = {
      role: 'assistant',
      content: typeof message.content === 'string' ? message.content : null,
      tool_calls: toolCalls,
    };
    working.push(assistantMessage);

    const priorToolResults = [];
    let askUserCall = null;

    for (const [index, call] of toolCalls.entries()) {
      throwIfAborted(signal);
      const name = call?.function?.name || '';
      if (name === 'ask_user') {
        if (!askUserCall) askUserCall = call;
        continue;
      }

      const stepId = nextStepId(call?.id || `tool-${index}`);
      const args = parseToolArgs(call?.function?.arguments);
      const detail = toolDetail(name, args);
      emitStep(onProgress, {
        id: stepId,
        tool: name || 'tool',
        state: 'running',
        label: toolLabel(name, 'running'),
        detail,
      });

      const toolResult = await executeTool(name, args);
      const failed = toolResultHasError(toolResult);
      emitStep(onProgress, {
        id: stepId,
        tool: name || 'tool',
        state: failed ? 'error' : 'done',
        label: failed ? 'Failed' : toolLabel(name, 'done'),
        detail,
      });

      const resultMsg = {
        role: 'tool',
        tool_call_id: call?.id || '',
        name,
        content: toolResult,
      };
      working.push(resultMsg);
      priorToolResults.push(resultMsg);
    }

    if (askUserCall) {
      const askId = nextStepId(askUserCall.id || 'ask');
      emitStep(onProgress, {
        id: askId,
        tool: 'ask_user',
        state: 'running',
        label: toolLabel('ask_user', 'running'),
      });

      const args = parseToolArgs(askUserCall.function?.arguments);
      const questions = sanitizeQuestions(args.questions);
      if (questions.length === 0) {
        emitStep(onProgress, {
          id: askId,
          tool: 'ask_user',
          state: 'error',
          label: 'Failed',
        });
        working.push({
          role: 'tool',
          tool_call_id: askUserCall.id || '',
          name: 'ask_user',
          content: JSON.stringify({ error: 'No valid questions were provided.' }),
        });
        continue;
      }

      emitStep(onProgress, {
        id: askId,
        tool: 'ask_user',
        state: 'done',
        label: toolLabel('ask_user', 'done'),
      });
      return {
        reply: null,
        preface: typeof content === 'string' ? content : '',
        pendingAsk: {
          id: askUserCall.id || '',
          questions,
          assistantMessage,
          priorToolResults,
        },
        model: masterId,
      };
    }
  }

  return { reply: '', model: masterId };
}

module.exports = { askMasterChat, isAbortError, AdvanceAbortError };
