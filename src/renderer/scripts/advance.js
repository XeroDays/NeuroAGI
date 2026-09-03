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

const SEND_ICON_HTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
const PAUSE_ICON_HTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';

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

function toRuntimeId(entry) {
  if (!entry || typeof entry.name !== 'string') return '';
  if (entry.name.includes(':')) return entry.name;
  return entry.type === 'Free' ? `${entry.name}:free` : entry.name;
}

function chipLabel(name) {
  const text = String(name || '');
  const parts = text.split('/');
  return parts[parts.length - 1] || text;
}

document.addEventListener('DOMContentLoaded', () => {
  document.title = `${SCREEN_ADVANCE} — ${APP_TITLE}`;

  const titleEl = document.getElementById('app-title');
  const screenTitleEl = document.getElementById('screen-title');
  const chipsEl = document.getElementById('adv-chips');
  const threadsEl = document.getElementById('adv-threads');
  const inputEl = document.getElementById('adv-input');
  const sendBtn = document.getElementById('adv-send');

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

  function getReasoningLevel() {
    return readStoredReasoningLevel();
  }

  /** @type {Map<string, object>} */
  const sessions = new Map();
  let activeModel = '';

  function activeSession() {
    return sessions.get(activeModel) || null;
  }

  function appendBubble(session, role, content, isError = false) {
    const threadEl = session?.threadEl;
    if (!threadEl) return null;
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

  function setSendBusy(busy) {
    if (!sendBtn) return;
    sendBtn.classList.toggle('is-busy', busy);
    sendBtn.setAttribute('aria-label', busy ? 'Pause' : 'Send');
    sendBtn.innerHTML = busy ? PAUSE_ICON_HTML : SEND_ICON_HTML;
  }

  function setComposerEnabled(enabled) {
    if (inputEl) inputEl.disabled = !enabled;
  }

  function syncComposer() {
    const session = activeSession();
    if (!session) {
      setComposerEnabled(false);
      setSendBusy(false);
      return;
    }
    setComposerEnabled(!session.inFlight && !session.awaitingAnswers);
    setSendBusy(session.inFlight);
  }

  function setBusy(session, busy) {
    session.inFlight = busy;
    syncComposer();
  }

  function truncateDetail(detail) {
    const text = typeof detail === 'string' ? detail.trim() : '';
    if (!text) return '';
    return text.length > 64 ? `${text.slice(0, 64)}…` : text;
  }

  function statusCaption(label, detail) {
    const title = typeof label === 'string' && label.trim() ? label.trim() : 'Working…';
    const extra = truncateDetail(detail);
    return extra ? `${title} ${extra}` : title;
  }

  function renderStatusIcon(el, state) {
    el.className = 'adv-status-icon';
    el.replaceChildren();
    if (state === 'running') {
      const spinner = document.createElement('div');
      spinner.className = 'adv-status-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      el.appendChild(spinner);
      return;
    }
    const mark = document.createElement('span');
    mark.setAttribute('aria-hidden', 'true');
    if (state === 'error') {
      mark.className = 'adv-status-fail';
      mark.textContent = '✕';
    } else {
      mark.className = 'adv-status-check';
      mark.textContent = '✓';
    }
    el.appendChild(mark);
  }

  function upsertStatusBlock(session, payload) {
    const threadEl = session?.threadEl;
    if (!threadEl || !payload || payload.type !== 'step') return;
    const id = typeof payload.id === 'string' && payload.id
      ? payload.id
      : '';
    const state = payload.state === 'error' || payload.state === 'done'
      ? payload.state
      : 'running';

    if (!id) {
      if (state === 'error') failRunningStatusBlocks(session, payload.label);
      return;
    }

    let block = session.statusBlocks.get(id);
    const prior = block?.dataset.state;
    if (block && (prior === 'done' || prior === 'error') && state === 'running') {
      return;
    }

    const tool = typeof payload.tool === 'string' ? payload.tool : '';
    if (tool === 'model' && (state === 'done' || state === 'error')) {
      if (block) {
        block.remove();
        session.statusBlocks.delete(id);
      }
      return;
    }

    if (!block) {
      block = document.createElement('div');
      block.className = 'adv-status';
      block.dataset.stepId = id;
      if (tool) block.dataset.tool = tool;
      const icon = document.createElement('div');
      icon.className = 'adv-status-icon';
      const text = document.createElement('span');
      text.className = 'adv-status-text';
      block.append(icon, text);
      threadEl.appendChild(block);
      session.statusBlocks.set(id, block);
    }

    if (tool) block.dataset.tool = tool;
    block.classList.toggle('is-error', state === 'error');
    block.dataset.state = state;
    renderStatusIcon(block.querySelector('.adv-status-icon'), state);
    const textEl = block.querySelector('.adv-status-text');
    if (textEl) textEl.textContent = statusCaption(payload.label, payload.detail);
    threadEl.scrollTop = threadEl.scrollHeight;
  }

  function failRunningStatusBlocks(session, message) {
    for (const [id, block] of session.statusBlocks.entries()) {
      if (block.dataset.state !== 'running') continue;
      const text = block.querySelector('.adv-status-text')?.textContent || '';
      if (block.dataset.tool === 'model' || text.startsWith('Loading')) {
        hideStatusBlock(session, id, block);
        continue;
      }
      block.dataset.state = 'error';
      block.classList.add('is-error');
      renderStatusIcon(block.querySelector('.adv-status-icon'), 'error');
      const textEl = block.querySelector('.adv-status-text');
      if (textEl) {
        textEl.textContent = typeof message === 'string' && message.trim()
          ? message.trim()
          : 'Failed';
      }
    }
  }

  function completedLabel(current) {
    const text = typeof current === 'string' ? current.trim() : '';
    if (text.startsWith('Finding sources')) return text.replace(/^Finding sources…?/, 'Found sources').trim();
    if (text.startsWith('Searching')) return text.replace(/^Searching…?/, 'Searched').trim();
    if (text.startsWith('Extracting')) return text.replace(/^Extracting…?/, 'Extracted').trim();
    if (text.startsWith('Asking questions')) return 'Questions asked';
    if (text.endsWith('…')) return text.slice(0, -1).trim();
    return text || 'Complete';
  }

  function hideStatusBlock(session, id, block) {
    block.remove();
    session.statusBlocks.delete(id);
  }

  function hideRunningStatusBlocks(session) {
    for (const [id, block] of session.statusBlocks.entries()) {
      if (block.dataset.state === 'running') hideStatusBlock(session, id, block);
    }
  }

  function restorePausedQuery(session) {
    if (!session.restoreOnAbort) {
      hideRunningStatusBlocks(session);
      return;
    }
    if (session.lastUserBubble) {
      session.lastUserBubble.remove();
      session.lastUserBubble = null;
    }
    if (
      session.lastSentText
      && session.messages.length
      && session.messages[session.messages.length - 1].role === 'user'
      && session.messages[session.messages.length - 1].content === session.lastSentText
    ) {
      session.messages.pop();
    }
    if (inputEl && session.lastSentText && session.model === activeModel) {
      inputEl.value = session.lastSentText;
    }
    session.lastSentText = '';
    session.restoreOnAbort = false;
    hideRunningStatusBlocks(session);
  }

  function completeRunningStatusBlocks(session) {
    for (const [id, block] of session.statusBlocks.entries()) {
      if (block.dataset.state !== 'running') continue;
      const text = block.querySelector('.adv-status-text')?.textContent || '';
      if (block.dataset.tool === 'model' || text.startsWith('Loading')) {
        hideStatusBlock(session, id, block);
        continue;
      }
      block.dataset.state = 'done';
      block.classList.remove('is-error');
      renderStatusIcon(block.querySelector('.adv-status-icon'), 'done');
      const textEl = block.querySelector('.adv-status-text');
      if (textEl) textEl.textContent = completedLabel(textEl.textContent);
    }
  }

  if (typeof window.electronAPI?.onAdvanceProgress === 'function') {
    window.electronAPI.onAdvanceProgress((payload) => {
      if (!payload || typeof payload.model !== 'string') return;
      const session = sessions.get(payload.model);
      if (!session) return;
      upsertStatusBlock(session, payload);
    });
  }

  function showPendingAsk(session, result) {
    completeRunningStatusBlocks(session);
    session.pendingAsk = result.pendingAsk;
    session.awaitingAnswers = true;

    if (typeof result.preface === 'string' && result.preface.trim()) {
      appendBubble(session, 'assistant', result.preface);
    }

    const wrap = document.createElement('div');
    wrap.className = 'adv-q-form-wrap';
    const form = renderQuestionForm(wrap, result.pendingAsk.questions);
    session.threadEl.appendChild(wrap);
    session.threadEl.scrollTop = session.threadEl.scrollHeight;

    const submitBtn = form.querySelector('.adv-q-submit');
    submitBtn?.addEventListener('click', () => {
      handleFormSubmit(session, form);
    });

    setBusy(session, false);
  }

  async function runModel(session, payload) {
    if (typeof window.electronAPI?.advanceSend !== 'function') {
      appendBubble(session, 'assistant', 'Advance chat is not available.', true);
      return;
    }

    setBusy(session, true);
    try {
      const result = await window.electronAPI.advanceSend({
        ...payload,
        model: session.model,
        reasoningLevel: getReasoningLevel(),
      });
      if (result?.aborted) {
        restorePausedQuery(session);
        return;
      }
      session.restoreOnAbort = false;
      session.lastSentText = '';
      session.lastUserBubble = null;
      if (result?.ok && result.pendingAsk) {
        showPendingAsk(session, result);
        return;
      }
      session.awaitingAnswers = false;
      session.pendingAsk = null;
      if (result?.ok && typeof result.reply === 'string') {
        completeRunningStatusBlocks(session);
        session.messages.push({ role: 'assistant', content: result.reply });
        appendBubble(session, 'assistant', result.reply);
      } else {
        const error = result?.error || 'The model did not return a reply.';
        failRunningStatusBlocks(session, error);
        appendBubble(session, 'assistant', error, true);
      }
    } catch (err) {
      session.awaitingAnswers = false;
      session.pendingAsk = null;
      if (session.restoreOnAbort) {
        restorePausedQuery(session);
        return;
      }
      const error = err instanceof Error ? err.message : String(err);
      failRunningStatusBlocks(session, error);
      appendBubble(session, 'assistant', error, true);
    } finally {
      if (!session.awaitingAnswers) {
        setBusy(session, false);
        if (session.model === activeModel) inputEl?.focus();
      }
    }
  }

  async function handleFormSubmit(session, form) {
    if (session.inFlight || !session.pendingAsk) return;
    const answers = collectAnswers(form);
    const resume = {
      assistantMessage: session.pendingAsk.assistantMessage,
      priorToolResults: session.pendingAsk.priorToolResults,
      askUserCallId: session.pendingAsk.id,
      answers,
    };
    setFormDisabled(form, true);
    collapseQuestionForm(form.closest('.adv-q-form-wrap'), answers);
    session.awaitingAnswers = false;
    session.pendingAsk = null;
    session.lastSentText = '';
    session.lastUserBubble = null;
    session.restoreOnAbort = false;
    await runModel(session, { messages: session.messages, resume });
  }

  function handlePause() {
    const session = activeSession();
    if (!session?.inFlight) return;
    if (typeof window.electronAPI?.advanceCancel === 'function') {
      window.electronAPI.advanceCancel({ model: session.model });
    }
    restorePausedQuery(session);
    setBusy(session, false);
    inputEl?.focus();
  }

  async function handleSend() {
    const session = activeSession();
    if (!session) return;
    if (session.inFlight) {
      handlePause();
      return;
    }
    if (session.awaitingAnswers || !inputEl) return;
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = '';
    session.lastSentText = text;
    session.restoreOnAbort = true;
    session.messages.push({ role: 'user', content: text });
    session.lastUserBubble = appendBubble(session, 'user', text);
    await runModel(session, { messages: session.messages });
  }

  function selectModel(model) {
    activeModel = model;
    for (const session of sessions.values()) {
      const on = session.model === model;
      session.chipEl.classList.toggle('is-active', on);
      session.chipEl.setAttribute('aria-selected', on ? 'true' : 'false');
      session.threadEl.hidden = !on;
    }
    syncComposer();
    const session = activeSession();
    if (session?.threadEl) session.threadEl.scrollTop = session.threadEl.scrollHeight;
  }

  function createSession(entry) {
    const model = toRuntimeId(entry);
    const chipEl = document.createElement('button');
    chipEl.type = 'button';
    chipEl.className = 'adv-chip';
    chipEl.setAttribute('role', 'tab');
    chipEl.textContent = chipLabel(entry.name);
    chipEl.title = entry.name;
    chipEl.addEventListener('click', () => selectModel(model));

    const threadEl = document.createElement('div');
    threadEl.className = 'adv-thread';
    threadEl.hidden = true;
    threadEl.setAttribute('aria-live', 'polite');

    chipsEl.appendChild(chipEl);
    threadsEl.appendChild(threadEl);

    const session = {
      model,
      messages: [],
      inFlight: false,
      awaitingAnswers: false,
      pendingAsk: null,
      lastSentText: '',
      lastUserBubble: null,
      restoreOnAbort: false,
      threadEl,
      chipEl,
      statusBlocks: new Map(),
    };
    sessions.set(model, session);
    return session;
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      const session = activeSession();
      if (session?.inFlight) {
        handlePause();
        return;
      }
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

  async function bootstrap() {
    let config = [];
    try {
      config = await window.electronAPI?.getModelsConfig?.() || [];
    } catch (err) {
      console.warn('[advance] Failed to read models config:', err);
    }
    const enabled = Array.isArray(config) ? config.filter((m) => m.enabled === true) : [];
    if (!enabled.length) {
      const threadEl = document.createElement('div');
      threadEl.className = 'adv-thread';
      threadsEl.appendChild(threadEl);
      appendBubble({ threadEl }, 'assistant', 'Turn on at least one model in the Models popup.', true);
      syncComposer();
      return;
    }

    for (const entry of enabled) createSession(entry);
    selectModel(toRuntimeId(enabled[0]));

    const params = new URLSearchParams(location.search);
    const issue = params.get('issue')?.trim();
    if (!issue) return;

    const age = params.get('age');
    const gender = params.get('gender');
    const name = params.get('name')?.trim();
    let text = issue;
    if (age && gender) {
      text = name
        ? `${issue}\n\nPatient: ${name}, ${age}-year-old ${gender}.`
        : `${issue}\n\nPatient: ${age}-year-old ${gender}.`;
    }
    if (inputEl) inputEl.value = '';

    const pending = [];
    for (const session of sessions.values()) {
      session.lastSentText = text;
      session.restoreOnAbort = true;
      session.messages.push({ role: 'user', content: text });
      session.lastUserBubble = appendBubble(session, 'user', text);
      pending.push(runModel(session, { messages: session.messages }));
    }
    await Promise.all(pending);
  }

  bootstrap();
});
