import { APP_TITLE, SCREEN_ADVANCE } from './constants.js';

document.addEventListener('DOMContentLoaded', () => {
  document.title = `${SCREEN_ADVANCE} — ${APP_TITLE}`;

  const titleEl = document.getElementById('app-title');
  const screenTitleEl = document.getElementById('screen-title');
  const threadEl = document.getElementById('adv-thread');
  const inputEl = document.getElementById('adv-input');
  const sendBtn = document.getElementById('adv-send');
  const popupEl = document.getElementById('adv-task-popup');
  const popupLabelEl = document.getElementById('adv-task-label');

  if (titleEl) titleEl.textContent = APP_TITLE;
  if (screenTitleEl) screenTitleEl.textContent = SCREEN_ADVANCE;
  if (inputEl) inputEl.focus();

  /** @type {{ role: 'user'|'assistant', content: string }[]} */
  const messages = [];
  let inFlight = false;

  function appendBubble(role, content, isError = false) {
    if (!threadEl) return;
    const bubble = document.createElement('div');
    bubble.className = isError
      ? 'adv-bubble adv-bubble--error'
      : `adv-bubble adv-bubble--${role}`;
    bubble.textContent = content;
    threadEl.appendChild(bubble);
    threadEl.scrollTop = threadEl.scrollHeight;
  }

  function setPopupLabel(text) {
    if (popupLabelEl) popupLabelEl.textContent = text;
  }

  function setBusy(busy) {
    inFlight = busy;
    if (inputEl) inputEl.disabled = busy;
    if (sendBtn) sendBtn.disabled = busy;
    if (popupEl) popupEl.hidden = !busy;
    if (busy) setPopupLabel('Loading…');
  }

  function truncateQuery(query) {
    const text = typeof query === 'string' ? query.trim() : '';
    if (!text) return '';
    return text.length > 48 ? `${text.slice(0, 48)}…` : text;
  }

  if (typeof window.electronAPI?.onAdvanceProgress === 'function') {
    window.electronAPI.onAdvanceProgress((payload) => {
      if (!inFlight || !payload) return;
      if (payload.status === 'searching') {
        const query = truncateQuery(payload.query);
        setPopupLabel(query ? `Searching: ${query}` : 'Searching…');
        return;
      }
      if (payload.status === 'loading') {
        setPopupLabel('Loading…');
        return;
      }
      if (payload.status === 'error' && payload.message) {
        setPopupLabel(payload.message);
      }
    });
  }

  async function handleSend() {
    if (inFlight || !inputEl) return;
    const text = inputEl.value.trim();
    if (!text) return;

    if (typeof window.electronAPI?.advanceSend !== 'function') {
      appendBubble('assistant', 'Advance chat is not available.', true);
      return;
    }

    inputEl.value = '';
    messages.push({ role: 'user', content: text });
    appendBubble('user', text);
    setBusy(true);

    try {
      const result = await window.electronAPI.advanceSend({ messages });
      if (result?.ok && typeof result.reply === 'string') {
        messages.push({ role: 'assistant', content: result.reply });
        appendBubble('assistant', result.reply);
      } else {
        const error = result?.error || 'The model did not return a reply.';
        appendBubble('assistant', error, true);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      appendBubble('assistant', error, true);
    } finally {
      setBusy(false);
      inputEl.focus();
    }
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      handleSend();
    });
  }

  if (inputEl) {
    inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    });
  }
});
