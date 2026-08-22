import { APP_TITLE, SCREEN_ADVANCE } from './constants.js';
import { marked } from './vendor/marked.esm.js';
import { renderQuestionForm, collectAnswers, setFormDisabled, collapseQuestionForm } from './advance-questions.js';

marked.setOptions({
  gfm: true,
  breaks: true,
});

const REASONING_LEVELS = new Set(['none', 'low', 'medium', 'high', 'very_high']);
const REASONING_STORAGE_KEY = 'neuroagi:advanceReasoningLevel';
const DEFAULT_REASONING_LEVEL = 'medium';

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
  const reasoningSelect = document.getElementById('adv-reasoning');
  const settingsOverlay = document.getElementById('adv-settings-overlay');
  const settingsCloseBtn = document.getElementById('adv-settings-close');
  const popupEl = document.getElementById('adv-task-popup');
  const popupLabelEl = document.getElementById('adv-task-label');

  if (titleEl) titleEl.textContent = APP_TITLE;
  if (screenTitleEl) screenTitleEl.textContent = SCREEN_ADVANCE;
  if (inputEl) inputEl.focus();

  function readStoredReasoningLevel() {
    try {
      const stored = sessionStorage.getItem(REASONING_STORAGE_KEY);
      if (REASONING_LEVELS.has(stored)) return stored;
    } catch {
      /* sessionStorage may be unavailable */
    }
    return DEFAULT_REASONING_LEVEL;
  }

  function persistReasoningLevel(level) {
    try {
      sessionStorage.setItem(REASONING_STORAGE_KEY, level);
    } catch {
      /* sessionStorage may be unavailable */
    }
  }

  function getReasoningLevel() {
    const value = reasoningSelect?.value || DEFAULT_REASONING_LEVEL;
    return REASONING_LEVELS.has(value) ? value : DEFAULT_REASONING_LEVEL;
  }

  if (reasoningSelect) {
    reasoningSelect.value = readStoredReasoningLevel();
    reasoningSelect.addEventListener('change', () => {
      persistReasoningLevel(getReasoningLevel());
    });
  }

  function setSettingsOpen(open) {
    if (!settingsOverlay) return;
    settingsOverlay.hidden = !open;
  }

  function onSettingsKeydown(event) {
    if (event.key === 'Escape' && settingsOverlay && !settingsOverlay.hidden) {
      setSettingsOpen(false);
    }
  }

  settingsOverlay?.addEventListener('click', (event) => {
    if (event.target === settingsOverlay) setSettingsOpen(false);
  });
  settingsCloseBtn?.addEventListener('click', () => setSettingsOpen(false));
  document.addEventListener('keydown', onSettingsKeydown);

  async function mountSettingsChip() {
    if (document.getElementById('adv-settings')) return;

    let logsBubble = null;
    for (let i = 0; i < 30; i += 1) {
      logsBubble = document.querySelector('.usage-bubbles .logs-bubble');
      if (logsBubble) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    const container = document.querySelector('.usage-bubbles');
    if (!container) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'adv-settings';
    btn.className = 'usage-bubble adv-settings-bubble';
    btn.setAttribute('aria-label', 'Settings');
    btn.setAttribute('title', 'Advance settings');
    btn.innerHTML = `<svg class="adv-settings-bubble-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg><span>Settings</span>`;
    btn.addEventListener('click', () => setSettingsOpen(true));

    if (logsBubble) {
      container.insertBefore(btn, logsBubble);
    } else {
      container.insertBefore(btn, container.firstChild);
    }
  }

  mountSettingsChip();

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
    if (reasoningSelect) reasoningSelect.disabled = !enabled;
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
      const result = await window.electronAPI.advanceSend({
        ...payload,
        reasoningLevel: getReasoningLevel(),
      });
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
