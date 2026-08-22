const { chatCompletionWithTools } = require('./advance-llm');
const { ADVANCE_TOOLS, executeTool } = require('./advance-tools');
const modelConfigService = require('./model-config-service');

const ADVANCE_LLM_OPTIONS = {
  maxTokens: 16384,
  reasoning: { effort: 'medium' },
  tools: ADVANCE_TOOLS,
  toolChoice: 'auto',
};

const MAX_TOOL_ROUNDS = 3;

function parseToolArgs(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function toolQueryLabel(toolCalls) {
  for (const call of toolCalls) {
    if (call?.function?.name !== 'web_search') continue;
    const args = parseToolArgs(call.function.arguments);
    if (typeof args.query === 'string' && args.query.trim()) {
      return args.query.trim();
    }
  }
  return '';
}

/**
 * Send a multi-turn chat to the starred master model, with an optional
 * web_search tool loop. Progress stays on the main side for this request.
 *
 * @param {{ role: string, content: string }[]} messages
 * @param {{ onProgress?: (payload: { status: string, query?: string }) => void }} [hooks]
 * @returns {Promise<{ reply: string, model: string }>}
 */
async function askMasterChat(messages, hooks = {}) {
  const masterId = modelConfigService.getMasterModelRuntimeId();
  if (!masterId) {
    throw new Error('No master model selected. Star a model in the Models popup.');
  }

  const onProgress = typeof hooks.onProgress === 'function' ? hooks.onProgress : () => {};
  const working = messages.map((m) => ({ role: m.role, content: m.content }));

  console.log(`[advance-chat] master query → ${masterId} (${working.length} messages)`);
  onProgress({ status: 'loading' });

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const { content, toolCalls, message } = await chatCompletionWithTools(
      working,
      masterId,
      ADVANCE_LLM_OPTIONS
    );

    if (!toolCalls.length) {
      onProgress({ status: 'done' });
      return { reply: content, model: masterId };
    }

    if (round === MAX_TOOL_ROUNDS) {
      onProgress({ status: 'done' });
      return {
        reply: content || 'I reached the search limit before I could finish. Please try again.',
        model: masterId,
      };
    }

    const query = toolQueryLabel(toolCalls);
    onProgress({ status: 'searching', query });

    working.push({
      role: 'assistant',
      content: typeof message.content === 'string' ? message.content : null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const name = call?.function?.name || '';
      const args = parseToolArgs(call?.function?.arguments);
      const toolResult = await executeTool(name, args);
      working.push({
        role: 'tool',
        tool_call_id: call?.id || '',
        name,
        content: toolResult,
      });
    }

    onProgress({ status: 'loading' });
  }

  onProgress({ status: 'done' });
  return { reply: '', model: masterId };
}

module.exports = { askMasterChat };
