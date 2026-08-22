const channels = require('../../shared/ipc/channels');
const { askMasterChat } = require('../services/advance-chat-service');

const ALLOWED_ROLES = new Set(['user', 'assistant']);

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

function emitProgress(sender, payload) {
  if (!sender || sender.isDestroyed?.()) return;
  try {
    sender.send(channels.ADVANCE_PROGRESS, payload);
  } catch (err) {
    console.warn('[advance] emitProgress failed:', err?.message || err);
  }
}

/**
 * Advance-screen chat turn. Uses the starred master model and the full
 * conversation so prior messages are remembered. May run web_search or
 * pause for ask_user.
 *
 * @param {{ messages?: unknown, resume?: object }} payload
 * @param {Electron.WebContents} [sender]
 * @returns {Promise<object>}
 */
async function SendAdvanceChat(payload = {}, sender) {
  const messages = sanitizeMessages(payload.messages);
  const resume = payload.resume && typeof payload.resume === 'object'
    ? payload.resume
    : null;

  if (messages.length === 0) {
    return { ok: false, error: 'Message is required.' };
  }
  if (messages[messages.length - 1].role !== 'user') {
    return { ok: false, error: 'Last message must be from the user.' };
  }

  emitProgress(sender, { status: 'loading' });

  try {
    const result = await askMasterChat(messages, {
      onProgress: (event) => emitProgress(sender, event),
    }, resume);

    if (result?.pendingAsk) {
      emitProgress(sender, { status: 'asking' });
      return {
        ok: true,
        model: result.model,
        preface: result.preface || '',
        pendingAsk: result.pendingAsk,
      };
    }

    emitProgress(sender, { status: 'done' });
    return { ok: true, reply: result?.reply ?? '', model: result?.model };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[advance] SendAdvanceChat failed:', error);
    emitProgress(sender, { status: 'error', message: error });
    return { ok: false, error };
  }
}

module.exports = { SendAdvanceChat };
