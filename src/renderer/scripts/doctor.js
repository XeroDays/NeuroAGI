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
    summaryEl.textContent = issue
      ? `${age}-year-old ${gender} — ${issue}`
      : `${age}-year-old ${gender}`;
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

      const paneStatus = document.createElement('div');
      paneStatus.className = 'doc-pane-status';
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
        buffer: '',
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
    renderPane(state);
  }

  function handleDone({ model }) {
    const state = tabState.get(model);
    if (!state) return;
    state.status = 'done';
    state.tabEl.classList.add('is-complete');
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
  const offDone = window.electronAPI.onDoctorStreamDone?.(handleDone) || (() => {});
  const offError = window.electronAPI.onDoctorStreamError?.(handleError) || (() => {});

  window.addEventListener('beforeunload', () => {
    try { offDelta(); } catch {}
    try { offDone(); } catch {}
    try { offError(); } catch {}
  });

  (async () => {
    try {
      const result = await window.electronAPI.startDoctor({
        issue,
        gender,
        age,
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
        throw new Error('No doctor models are configured. Add at least one model to OPENROUTER_WORKER_MODELS.');
      }

      buildTabs(models);
      if (loadingEl) loadingEl.hidden = true;
      if (tabsEl) tabsEl.hidden = false;
      if (panesEl) panesEl.hidden = false;
    } catch (err) {
      console.error('startDoctor failed:', err);
      showError(humanizeError(err));
    }
  })();
});
