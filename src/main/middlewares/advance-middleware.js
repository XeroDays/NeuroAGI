const channels = require('../../shared/ipc/channels');
const { askModelChat, isAbortError } = require('../services/advance-chat-service');
const modelConfigService = require('../services/model-config-service');

/** @type {Map<number, Map<string, AbortController>>} */
const controllers = new Map();

const ALLOWED_ROLES = new Set(['user', 'assistant']);
const REASONING_LEVELS = new Set(['none', 'low', 'medium', 'high', 'very_high']);
const DEFAULT_REASONING_LEVEL = 'very_high';

function sanitizeReasoningLevel(raw) {
  return REASONING_LEVELS.has(raw) ? raw : DEFAULT_REASONING_LEVEL;
}

/**
 * Keep only well-formed chat turns. Drops unknown roles and non-string content.
 * @param {unknown} raw
 * @returns {{ role: 'user'|'assistant', content: string }[]}
 */
function sanitizeMessages(raw) {
  if (!Array.isArray(raw)) return [];

  const cleaned = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const role = item.role;
    const content = item.content;
    if (!ALLOWED_ROLES.has(role)) continue;
    if (typeof content !== 'string') continue;
    const trimmed = content.trim();
    if (!trimmed) continue;
    cleaned.push({ role, content: trimmed });
  }
  return cleaned;
}

function sanitizeModel(raw) {
  const model = typeof raw === 'string' ? raw.trim() : '';
  if (!model) return '';
  const enabled = modelConfigService.getActiveModelIds();
  return enabled.includes(model) ? model : '';
}

function senderMap(senderId) {
  let map = controllers.get(senderId);
  if (!map) {
    map = new Map();
    controllers.set(senderId, map);
  }
  return map;
}

function abortModel(senderId, model) {
  const map = controllers.get(senderId);
  if (!map) return;
  const controller = map.get(model);
  if (controller) controller.abort();
}

function abortAll(senderId) {
  const map = controllers.get(senderId);
  if (!map) return;
  for (const controller of map.values()) controller.abort();
}

function emitProgress(sender, payload) {
  if (!sender || sender.isDestroyed?.()) return;
  try {
    sender.send(channels.ADVANCE_PROGRESS, payload);
  } catch (err) {
    console.warn('[advance] emitProgress failed:', err?.message || err);
  }
}

/**
 * Advance-screen chat turn for one enabled model. May run web_search or
 * pause for ask_user.
 *
 * @param {{ messages?: unknown, model?: unknown, resume?: object, reasoningLevel?: unknown }} payload
 * @param {Electron.WebContents} [sender]
 * @returns {Promise<object>}
 */
async function SendAdvanceChat(payload = {}, sender) {
  const messages = sanitizeMessages(payload.messages);
  const model = sanitizeModel(payload.model);
  const resume = payload.resume && typeof payload.resume === 'object'
    ? payload.resume
    : null;
  const reasoningLevel = sanitizeReasoningLevel(payload.reasoningLevel);

  if (messages.length === 0) {
    return { ok: false, error: 'Message is required.' };
  }
  if (messages[messages.length - 1].role !== 'user') {
    return { ok: false, error: 'Last message must be from the user.' };
  }
  if (!model) {
    return { ok: false, error: 'No enabled model selected. Toggle a model in the Models popup.' };
  }

  const senderId = sender?.id;
  if (senderId != null) abortModel(senderId, model);

  const controller = new AbortController();
  if (senderId != null) senderMap(senderId).set(model, controller);

  try {
    const result = await askModelChat(messages, {
      model,
      onProgress: (event) => emitProgress(sender, { ...event, model }),
      reasoningLevel,
      signal: controller.signal,
    }, resume);

    if (controller.signal.aborted) {
      return { ok: false, aborted: true, model };
    }

    if (result?.pendingAsk) {
      return {
        ok: true,
        model: result.model,
        preface: result.preface || '',
        pendingAsk: result.pendingAsk,
      };
    }

    return { ok: true, reply: result?.reply ?? '', model: result?.model };
  } catch (err) {
    if (isAbortError(err) || controller.signal.aborted) {
      return { ok: false, aborted: true, model };
    }
    const error = err instanceof Error ? err.message : String(err);
    console.error('[advance] SendAdvanceChat failed:', error);
    emitProgress(sender, {
      type: 'step',
      id: '',
      tool: 'model',
      state: 'error',
      label: error,
      model,
    });
    return { ok: false, error, model };
  } finally {
    if (senderId != null) {
      const map = controllers.get(senderId);
      if (map && map.get(model) === controller) {
        map.delete(model);
        if (map.size === 0) controllers.delete(senderId);
      }
    }
  }
}

function CancelAdvanceChat(sender, payload = {}) {
  const senderId = sender?.id;
  if (senderId == null) return { ok: true };
  const model = typeof payload.model === 'string' ? payload.model.trim() : '';
  if (model) abortModel(senderId, model);
  else abortAll(senderId);
  return { ok: true };
}

module.exports = { SendAdvanceChat, CancelAdvanceChat };
