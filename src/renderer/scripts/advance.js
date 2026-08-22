import { APP_TITLE, SCREEN_ADVANCE } from './constants.js';
import { marked } from './vendor/marked.esm.js';
import { renderQuestionForm, collectAnswers, setFormDisabled, collapseQuestionForm } from './advance-questions.js';

marked.setOptions({
  gfm: true,
  breaks: true,
});

const SCRIPT_TAG_RE = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const ON_EVENT_ATTR_RE = /\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_HREF_RE = /\s(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi;

function sanitizeHtml(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(SCRIPT_TAG_RE, '')
    .replace(ON_EVENT_ATTR_RE, '')
    .replace(JS_HREF_RE, ' $1="#"');
}

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
  let awaitingAnswers = false;
  /** @type {object|null} */
  let pendingAsk = null;

  function appendBubble(role, content, isError = false) {
    if (!threadEl) return;
    const bubble = document.createElement('div');
    bubble.className = isError
      ? 'adv-bubble adv-bubble--error'
      : `adv-bubble adv-bubble--${role}`;

    if (!isError && role === 'assistant') {
      bubble.classList.add('adv-prose');
      try {
        bubble.innerHTML = sanitizeHtml(marked.parse(content || ''));
      } catch (err) {
        console.warn('[advance] marked.parse failed; falling back to text:', err);
        bubble.textContent = content;
      }
    } else {
      bubble.textContent = content;
    }

    threadEl.appendChild(bubble);
    threadEl.scrollTop = threadEl.scrollHeight;
    return bubble;
  }

  function setPopupLabel(text) {
    if (popupLabelEl) popupLabelEl.textContent = text;
  }

  function setComposerEnabled(enabled) {
    if (inputEl) inputEl.disabled = !enabled;
    if (sendBtn) sendBtn.disabled = !enabled;
  }

  function setBusy(busy) {
    inFlight = busy;
    setComposerEnabled(!busy && !awaitingAnswers);
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
      if (payload.status === 'extracting') {
        setPopupLabel('Extracting…');
        return;
      }
      if (payload.status === 'asking') {
        setPopupLabel('Asking questions…');
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

  function showPendingAsk(result) {
    pendingAsk = result.pendingAsk;
    awaitingAnswers = true;

    if (typeof result.preface === 'string' && result.preface.trim()) {
      appendBubble('assistant', result.preface);
    }

    const wrap = document.createElement('div');
    wrap.className = 'adv-q-form-wrap';
    const form = renderQuestionForm(wrap, result.pendingAsk.questions);
    threadEl.appendChild(wrap);
    threadEl.scrollTop = threadEl.scrollHeight;

    const submitBtn = form.querySelector('.adv-q-submit');
    submitBtn?.addEventListener('click', () => {
      handleFormSubmit(form);
    });

    setBusy(false);
  }

  async function runModel(payload) {
    if (typeof window.electronAPI?.advanceSend !== 'function') {
      appendBubble('assistant', 'Advance chat is not available.', true);
      return;
    }

    setBusy(true);
    try {
      const result = await window.electronAPI.advanceSend(payload);
      if (result?.ok && result.pendingAsk) {
        showPendingAsk(result);
        return;
      }
      awaitingAnswers = false;
      pendingAsk = null;
      if (result?.ok && typeof result.reply === 'string') {
        messages.push({ role: 'assistant', content: result.reply });
        appendBubble('assistant', result.reply);
      } else {
        const error = result?.error || 'The model did not return a reply.';
        appendBubble('assistant', error, true);
      }
    } catch (err) {
      awaitingAnswers = false;
      pendingAsk = null;
      const error = err instanceof Error ? err.message : String(err);
      appendBubble('assistant', error, true);
    } finally {
      if (!awaitingAnswers) {
        setBusy(false);
        inputEl?.focus();
      }
    }
  }

  async function handleFormSubmit(form) {
    if (inFlight || !pendingAsk) return;
    const answers = collectAnswers(form);
    const resume = {
      assistantMessage: pendingAsk.assistantMessage,
      priorToolResults: pendingAsk.priorToolResults,
      askUserCallId: pendingAsk.id,
      answers,
    };
    setFormDisabled(form, true);
    collapseQuestionForm(form.closest('.adv-q-form-wrap'), answers);
    awaitingAnswers = false;
    pendingAsk = null;
    await runModel({ messages, resume });
  }

  async function handleSend() {
    if (inFlight || awaitingAnswers || !inputEl) return;
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = '';
    messages.push({ role: 'user', content: text });
    appendBubble('user', text);
    await runModel({ messages });
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
