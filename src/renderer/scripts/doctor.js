import { APP_TITLE, SCREEN_DOCTOR } from './constants.js';
import { marked } from './vendor/marked.esm.js';

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

function readSession(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`Failed to read ${key} from sessionStorage:`, err);
    return null;
  }
}

function humanizeError(err) {
  const msg = err?.message || String(err || '');
  if (/\b429\b/.test(msg) || /rate-?limit/i.test(msg)) {
    return 'The AI service is temporarily rate-limited. Please retry in a moment.';
  }
  if (/network|fetch failed|ENOTFOUND|ETIMEDOUT/i.test(msg)) {
    return 'Network error reaching the AI service. Check your connection and retry.';
  }
  return msg || 'Something went wrong.';
}

const PROMPT_COPY_LABEL = 'Copy doctor LLM prompt to clipboard';

function mountPromptCopyBubble(promptText) {
  if (typeof promptText !== 'string' || !promptText.trim()) return;

  const container = document.querySelector('.usage-bubbles');
  if (!container || container.querySelector('.prompt-copy-bubble')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'usage-bubble prompt-copy-bubble';
  btn.title = PROMPT_COPY_LABEL;
  btn.setAttribute('aria-label', PROMPT_COPY_LABEL);
  btn.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      btn.title = 'Copied!';
      btn.setAttribute('aria-label', 'Copied!');
      window.setTimeout(() => {
        btn.title = PROMPT_COPY_LABEL;
        btn.setAttribute('aria-label', PROMPT_COPY_LABEL);
      }, 2000);
    } catch (err) {
      console.warn('[doctor] clipboard copy failed:', err);
    }
  });

  container.insertBefore(btn, container.firstChild);
}

document.addEventListener('DOMContentLoaded', () => {
  document.title = `${SCREEN_DOCTOR} — ${APP_TITLE}`;

  const titleEl = document.getElementById('app-title');
  const screenTitleEl = document.getElementById('screen-title');
  const summaryEl = document.getElementById('summary');
  const loadingEl = document.getElementById('doc-loading');
  const errorEl = document.getElementById('doc-error');
  const errorMessageEl = document.getElementById('doc-error-message');
  const errorRetryEl = document.getElementById('doc-error-retry');
  const tabsEl = document.getElementById('doc-tabs');
  const panesEl = document.getElementById('doc-panes');

  if (titleEl) titleEl.textContent = APP_TITLE;
  if (screenTitleEl) screenTitleEl.textContent = SCREEN_DOCTOR;

  const params = new URLSearchParams(window.location.search);
  const issue = params.get('issue') || '';
  const gender = params.get('gender') || 'male';
  const age = params.get('age') || '30';

  if (summaryEl) {
    const demoSpan = document.createElement('span');
    demoSpan.className = 'patient-summary__demo';
    demoSpan.textContent = `${age}-year-old ${gender}`;
    summaryEl.innerHTML = '';
    summaryEl.appendChild(demoSpan);

    if (issue) {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'patient-summary__toggle';
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.innerHTML = '<span>Patient Query</span>'
        + '<svg class="patient-summary__arrow" width="12" height="12" viewBox="0 0 12 12"'
        + ' fill="none" xmlns="http://www.w3.org/2000/svg">'
        + '<path d="M2 4L6 8L10 4" stroke="currentColor" stroke-width="1.5"'
        + ' stroke-linecap="round" stroke-linejoin="round"/></svg>';

      const queryDiv = document.createElement('div');
      queryDiv.className = 'patient-summary__query';
      queryDiv.hidden = true;
      queryDiv.textContent = issue;

      toggleBtn.addEventListener('click', () => {
        const isOpen = !queryDiv.hidden;
        queryDiv.hidden = isOpen;
        toggleBtn.setAttribute('aria-expanded', String(!isOpen));
        toggleBtn.classList.toggle('is-open', !isOpen);
      });

      summaryEl.appendChild(toggleBtn);
      summaryEl.appendChild(queryDiv);
    }
  }

  errorRetryEl?.addEventListener('click', () => window.location.reload());

  function showError(message) {
    if (loadingEl) loadingEl.hidden = true;
    if (tabsEl) tabsEl.hidden = true;
    if (panesEl) panesEl.hidden = true;
    if (errorMessageEl) errorMessageEl.textContent = message;
    if (errorEl) errorEl.hidden = false;
  }

  if (!window.electronAPI?.startDoctor) {
    showError('Internal error: doctor service not available.');
    return;
  }

  const intake = readSession('neuroagi:questionnaire');
  const lab = readSession('neuroagi:laboratory');
  const preDoc = readSession('neuroagi:preDoctorRoom');

  if (
    !intake ||
    !Array.isArray(intake.questions) ||
    !Array.isArray(intake.answers) ||
    !lab ||
    !Array.isArray(lab.questions) ||
    !Array.isArray(lab.answers) ||
    !preDoc ||
    !Array.isArray(preDoc.questions) ||
    !Array.isArray(preDoc.answers)
  ) {
    showError('Missing questionnaire, laboratory, or pre-doctor data. Please restart from the home screen.');
    return;
  }

  const tabState = new Map();
  let activeModel = null;

  function setActive(model) {
    activeModel = model;
    for (const [m, state] of tabState.entries()) {
      const isActive = m === model;
      state.tabEl.classList.toggle('is-active', isActive);
      state.tabEl.setAttribute('aria-selected', isActive ? 'true' : 'false');
      state.paneEl.classList.toggle('is-active', isActive);
    }
  }

  function buildTabs(models) {
    tabsEl.innerHTML = '';
    panesEl.innerHTML = '';

    models.forEach((model, i) => {
      const tabBtn = document.createElement('button');
      tabBtn.type = 'button';
      tabBtn.className = 'doc-tab';
      tabBtn.setAttribute('role', 'tab');
      tabBtn.setAttribute('aria-selected', 'false');
      tabBtn.dataset.model = model;
      tabBtn.title = model;

      const tabLabel = document.createElement('span');
      tabLabel.className = 'doc-tab-label';
      tabLabel.textContent = model;
      tabBtn.appendChild(tabLabel);

      const tabSpinner = document.createElement('span');
      tabSpinner.className = 'doc-tab-spinner';
      tabSpinner.setAttribute('aria-hidden', 'true');
      tabBtn.appendChild(tabSpinner);

      tabBtn.addEventListener('click', () => setActive(model));
      tabsEl.appendChild(tabBtn);

      const pane = document.createElement('section');
      pane.className = 'doc-pane';
      pane.setAttribute('role', 'tabpanel');
      pane.dataset.model = model;

      const paneHeader = document.createElement('div');
      paneHeader.className = 'doc-pane-header';
      const paneTag = document.createElement('span');
      paneTag.className = 'doc-model-tag';
      paneTag.textContent = `Analysis by ${model}`;
      paneHeader.appendChild(paneTag);
      pane.appendChild(paneHeader);

      const thinkingBubble = document.createElement('div');
      thinkingBubble.className = 'doc-thinking-bubble';
      thinkingBubble.hidden = true;
      const thinkingSpinner = document.createElement('span');
      thinkingSpinner.className = 'doc-thinking-spinner';
      thinkingSpinner.setAttribute('aria-hidden', 'true');
      const thinkingLabel = document.createElement('span');
      thinkingLabel.className = 'doc-thinking-label';
      thinkingLabel.textContent = 'Thinking\u2026';
      const thinkingCount = document.createElement('span');
      thinkingCount.className = 'doc-thinking-count';
      thinkingCount.textContent = '';
      thinkingBubble.append(thinkingSpinner, thinkingLabel, thinkingCount);
      pane.appendChild(thinkingBubble);

      const reasoningPanel = document.createElement('div');
      reasoningPanel.className = 'doc-reasoning-panel';
      reasoningPanel.hidden = true;
      const reasoningToggle = document.createElement('button');
      reasoningToggle.type = 'button';
      reasoningToggle.className = 'doc-reasoning-toggle';
      reasoningToggle.setAttribute('aria-expanded', 'false');
      const reasoningChevron = document.createElement('span');
      reasoningChevron.className = 'doc-reasoning-chevron';
      reasoningChevron.setAttribute('aria-hidden', 'true');
      reasoningChevron.textContent = '\u25B8';
      const reasoningToggleLabel = document.createElement('span');
      reasoningToggleLabel.className = 'doc-reasoning-toggle-label';
      reasoningToggleLabel.textContent = 'See thinking';
      reasoningToggle.append(reasoningChevron, reasoningToggleLabel);
      const reasoningBody = document.createElement('pre');
      reasoningBody.className = 'doc-reasoning-body';
      reasoningPanel.append(reasoningToggle, reasoningBody);
      pane.appendChild(reasoningPanel);

      reasoningToggle.addEventListener('click', () => {
        const isOpen = reasoningPanel.classList.toggle('is-open');
        reasoningToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });

      const paneStatus = document.createElement('div');
      paneStatus.className = 'doc-pane-status';
      paneStatus.hidden = true;
      const paneSpinner = document.createElement('span');
      paneSpinner.className = 'doc-pane-spinner';
      paneSpinner.setAttribute('aria-hidden', 'true');
      const paneStatusLabel = document.createElement('span');
      paneStatusLabel.className = 'doc-pane-status-label';
      paneStatusLabel.textContent = 'Streaming response\u2026';
      paneStatus.append(paneSpinner, paneStatusLabel);
      pane.appendChild(paneStatus);

      const prose = document.createElement('div');
      prose.className = 'doc-prose';
      pane.appendChild(prose);

      panesEl.appendChild(pane);

      tabState.set(model, {
        tabEl: tabBtn,
        paneEl: pane,
        proseEl: prose,
        statusEl: paneStatus,
        statusLabelEl: paneStatusLabel,
        spinnerEl: paneSpinner,
        thinkingEl: thinkingBubble,
        thinkingCountEl: thinkingCount,
        reasoningPanelEl: reasoningPanel,
        reasoningToggleEl: reasoningToggle,
        reasoningToggleLabelEl: reasoningToggleLabel,
        reasoningBodyEl: reasoningBody,
        buffer: '',
        reasoningBuffer: '',
        contentStarted: false,
        status: 'streaming',
      });

      if (i === 0) setActive(model);
    });
  }

  function renderPane(state) {
    try {
      const html = marked.parse(state.buffer || '');
      state.proseEl.innerHTML = sanitizeHtml(html);
    } catch (err) {
      console.warn('marked.parse failed; falling back to text:', err);
      state.proseEl.textContent = state.buffer;
    }
  }

  function handleDelta({ model, delta }) {
    const state = tabState.get(model);
    if (!state || typeof delta !== 'string' || delta.length === 0) return;
    state.buffer += delta;
    if (!state.contentStarted) {
      state.contentStarted = true;
      if (state.thinkingEl) state.thinkingEl.hidden = true;
      if (state.statusEl) {
        state.statusEl.hidden = false;
        state.statusLabelEl.textContent = 'Streaming response\u2026';
      }
      if (state.reasoningPanelEl && state.reasoningBuffer.length > 0) {
        state.reasoningPanelEl.classList.remove('is-open');
        state.reasoningToggleEl?.setAttribute('aria-expanded', 'false');
      }
    }
    renderPane(state);
  }

  function handleReasoningDelta({ model, delta }) {
    const state = tabState.get(model);
    if (!state || typeof delta !== 'string' || delta.length === 0) return;
    state.reasoningBuffer += delta;

    if (!state.contentStarted) {
      if (state.thinkingEl) state.thinkingEl.hidden = false;
      if (state.thinkingCountEl) {
        state.thinkingCountEl.textContent = `${state.reasoningBuffer.length} chars`;
      }
      if (state.statusEl) state.statusEl.hidden = true;
    }

    if (state.reasoningPanelEl) {
      state.reasoningPanelEl.hidden = false;
    }
    if (state.reasoningToggleLabelEl) {
      state.reasoningToggleLabelEl.textContent = `See thinking (${state.reasoningBuffer.length} chars)`;
    }
    if (state.reasoningBodyEl) {
      state.reasoningBodyEl.textContent = state.reasoningBuffer;
      if (state.reasoningPanelEl?.classList.contains('is-open')) {
        state.reasoningBodyEl.scrollTop = state.reasoningBodyEl.scrollHeight;
      }
    }
  }

  function handleDone({ model }) {
    const state = tabState.get(model);
    if (!state) return;
    state.status = 'done';
    state.tabEl.classList.add('is-complete');
    if (state.thinkingEl) state.thinkingEl.hidden = true;
    if (state.reasoningPanelEl && state.reasoningBuffer.length === 0) {
      state.reasoningPanelEl.hidden = true;
    }
    if (state.statusEl) state.statusEl.hidden = false;
    state.statusEl.classList.add('is-complete');
    state.statusLabelEl.textContent = 'Analysis complete';
    state.spinnerEl.hidden = true;
    renderPane(state);
  }

  function handleError({ model, error }) {
    const state = tabState.get(model);
    const message = humanizeError({ message: error });
    if (!state) return;
    state.status = 'error';
    state.tabEl.classList.add('is-failed');
    if (state.thinkingEl) state.thinkingEl.hidden = true;
    if (state.statusEl) state.statusEl.hidden = false;
    state.statusEl.classList.add('is-error');
    state.spinnerEl.hidden = true;
    state.statusLabelEl.textContent = 'This doctor could not respond';
    if (!state.buffer) {
      state.proseEl.innerHTML = '';
      const errCard = document.createElement('div');
      errCard.className = 'doc-pane-error';
      errCard.textContent = message;
      state.proseEl.appendChild(errCard);
    }
  }

  const offDelta = window.electronAPI.onDoctorStreamDelta?.(handleDelta) || (() => {});
  const offReasoning =
    window.electronAPI.onDoctorStreamReasoningDelta?.(handleReasoningDelta) ||
    (() => {});
  const offDone = window.electronAPI.onDoctorStreamDone?.(handleDone) || (() => {});
  const offError = window.electronAPI.onDoctorStreamError?.(handleError) || (() => {});

  window.addEventListener('beforeunload', () => {
    try { offDelta(); } catch {}
    try { offReasoning(); } catch {}
    try { offDone(); } catch {}
    try { offError(); } catch {}
  });

  const reasoningLevel =
    (() => {
      try {
        return sessionStorage.getItem('neuroagi:reasoningLevel') || 'medium';
      } catch {
        return 'medium';
      }
    })();

  (async () => {
    try {
      const result = await window.electronAPI.startDoctor({
        issue,
        gender,
        age,
        reasoningLevel,
        questionnaire: {
          questions: intake.questions,
          answers: intake.answers,
        },
        laboratory: {
          questions: lab.questions,
          answers: lab.answers,
        },
        preDoctorRoom: {
          questions: preDoc.questions,
          answers: preDoc.answers,
        },
      });

      if (!result || !result.ok) {
        throw new Error(result?.error || 'Failed to start doctor analysis.');
      }

      const models = Array.isArray(result.models) ? result.models : [];
      if (models.length === 0) {
        throw new Error('No doctor models are configured. Add at least one model to OPENROUTER_DOCTOR_MODELS.');
      }

      buildTabs(models);
      mountPromptCopyBubble(result.prompt);
      if (loadingEl) loadingEl.hidden = true;
      if (tabsEl) tabsEl.hidden = false;
      if (panesEl) panesEl.hidden = false;
    } catch (err) {
      console.error('startDoctor failed:', err);
      showError(humanizeError(err));
    }
  })();
});
