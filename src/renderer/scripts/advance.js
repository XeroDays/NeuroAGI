import { APP_TITLE, SCREEN_ADVANCE } from './constants.js';
import { marked } from './vendor/marked.esm.js';
import { renderQuestionForm, collectAnswers, setFormDisabled, collapseQuestionForm } from './advance-questions.js';
import { confirmDialog } from './ui/confirm-dialog.js';
import { openOverlay, closeOverlay } from './ui/overlay-controller.js';
import { parseReport, reportBadgeClass } from './advance-report.js';

marked.setOptions({
  gfm: true,
  breaks: true,
});

const REASONING_LEVELS = new Set(['none', 'low', 'medium', 'high', 'very_high']);
const REASONING_STORAGE_KEY = 'neuroagi:advanceReasoningLevel';
const DEFAULT_REASONING_LEVEL = 'very_high';

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

const REPORTED_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatReportedAt(date = new Date()) {
  const day = date.getDate();
  const month = REPORTED_MONTHS[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
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

  function pinEmergency(session, content) {
    const report = parseReport(content);
    if (!report?.emergency || !session?.threadEl) return;
    if (session.threadEl.querySelector('.adv-emergency')) return;
    const banner = document.createElement('div');
    banner.className = 'adv-emergency';
    banner.textContent = 'This reply is marked as needing emergency care. Contact local emergency services if symptoms are severe.';
    session.threadEl.prepend(banner);
  }

  function renderReport(bubble, content) {
    const report = parseReport(content);
    if (!report || report.sections.length < 2) return false;
    bubble.classList.add('adv-report');

    const toolbar = document.createElement('div');
    toolbar.className = 'adv-report-toolbar';
    if (report.urgency) {
      const badge = document.createElement('span');
      badge.className = reportBadgeClass('urgency', report.urgency);
      badge.textContent = report.urgency;
      toolbar.appendChild(badge);
    }
    if (report.confidence) {
      const badge = document.createElement('span');
      badge.className = reportBadgeClass('confidence', report.confidence);
      badge.textContent = `${report.confidence} confidence`;
      toolbar.appendChild(badge);
    }
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'adv-report-copy';
    copy.textContent = 'Copy';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(report.raw);
        copy.textContent = 'Copied';
      } catch {
        copy.textContent = 'Copy failed';
      }
    });
    const pdf = document.createElement('button');
    pdf.type = 'button';
    pdf.className = 'adv-report-copy';
    pdf.textContent = 'Save PDF';
    pdf.addEventListener('click', async () => {
      const result = await window.electronAPI?.saveReportPdf?.();
      pdf.textContent = result?.ok ? 'Saved' : (result?.canceled ? 'Save PDF' : 'Save failed');
    });
    toolbar.append(copy, pdf);
    bubble.appendChild(toolbar);

    const toc = document.createElement('nav');
    toc.className = 'adv-report-toc';
    for (const section of report.sections) {
      const link = document.createElement('a');
      link.href = `#${section.id}`;
      link.textContent = section.title;
      toc.appendChild(link);
    }
    bubble.appendChild(toc);

    for (const section of report.sections) {
      const details = document.createElement('details');
      details.className = 'adv-report-section';
      details.open = true;
      details.id = section.id;
      const summary = document.createElement('summary');
      summary.textContent = section.title;
      const body = document.createElement('div');
      body.className = 'adv-prose';
      try {
        body.innerHTML = sanitizeHtml(marked.parse(section.body || ''));
      } catch {
        body.textContent = section.body;
      }
      details.append(summary, body);
      bubble.appendChild(details);
    }

    if (report.sources.length) {
      const sources = document.createElement('div');
      sources.className = 'adv-report-sources';
      for (const url of report.sources) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'adv-source-chip';
        chip.textContent = url.replace(/^https?:\/\//, '').slice(0, 42);
        chip.title = url;
        chip.addEventListener('click', () => navigator.clipboard?.writeText(url));
        sources.appendChild(chip);
      }
      bubble.appendChild(sources);
    }
    return true;
  }

  function appendBubble(session, role, content, isError = false) {
    const threadEl = session?.threadEl;
    if (!threadEl) return null;
    if (!isError && role === 'assistant' && !String(content || '').trim()) return null;
    const bubble = document.createElement('div');
    bubble.className = isError
      ? 'adv-bubble adv-bubble--error'
      : `adv-bubble adv-bubble--${role}`;

    if (!isError && role === 'assistant' && renderReport(bubble, content)) {
      pinEmergency(session, content);
    } else if (!isError && role === 'assistant') {
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
    stickScroll(threadEl);
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
    if (busy) showThinking(session);
    else {
      hideThinking(session);
      commitLiveBubble(session);
    }
    syncComposer();
    syncChipDot(session);
    syncStopAll();
  }

  function showThinking(session) {
    if (!session?.threadEl || session.thinkingEl) return;
    const el = document.createElement('div');
    el.className = 'adv-thinking';
    el.setAttribute('aria-label', 'Thinking');
    el.innerHTML = '<span class="adv-thinking-dot"></span><span class="adv-thinking-dot"></span><span class="adv-thinking-dot"></span>';
    session.threadEl.appendChild(el);
    session.thinkingEl = el;
    stickScroll(session.threadEl);
  }

  function hideThinking(session) {
    session?.thinkingEl?.remove();
    if (session) session.thinkingEl = null;
  }

  function ensureLiveBubble(session) {
    if (session.liveBubble?.isConnected) return session.liveBubble;
    const bubble = document.createElement('div');
    bubble.className = 'adv-bubble adv-bubble--assistant adv-prose adv-bubble--live';
    const body = document.createElement('div');
    body.className = 'adv-live-body';
    const caret = document.createElement('span');
    caret.className = 'adv-caret';
    caret.setAttribute('aria-hidden', 'true');
    bubble.append(body, caret);
    session.threadEl.appendChild(bubble);
    session.liveBubble = bubble;
    return bubble;
  }

  function paintLiveBubble(session) {
    const bubble = session.liveBubble;
    if (!bubble) return;
    const body = bubble.querySelector('.adv-live-body');
    if (!body) return;
    try {
      body.innerHTML = sanitizeHtml(marked.parse(session.liveText || ''));
    } catch {
      body.textContent = session.liveText || '';
    }
  }

  function nearBottom(threadEl) {
    return threadEl.scrollHeight - threadEl.scrollTop - threadEl.clientHeight < 80;
  }

  function stickScroll(threadEl) {
    if (!threadEl) return;
    const pill = threadEl.querySelector(':scope > .adv-new-msgs');
    if (threadEl.dataset.follow === '0' && !nearBottom(threadEl)) {
      if (pill) pill.hidden = false;
      return;
    }
    threadEl.dataset.follow = '1';
    threadEl.scrollTo({ top: threadEl.scrollHeight, behavior: 'smooth' });
    if (pill) pill.hidden = true;
  }

  function appendDelta(session, text) {
    session.liveText = `${session.liveText || ''}${text}`;
    if (!String(session.liveText).trim()) return;
    hideThinking(session);
    ensureLiveBubble(session);
    clearTimeout(session.liveTimer);
    session.liveTimer = setTimeout(() => paintLiveBubble(session), 80);
    stickScroll(session.threadEl);
  }

  function commitLiveBubble(session) {
    if (!session) return;
    clearTimeout(session.liveTimer);
    const text = String(session.liveText || '').trim();
    if (!session.liveBubble || !text) {
      session.liveBubble?.remove();
      session.liveBubble = null;
      session.liveText = '';
      return;
    }
    paintLiveBubble(session);
    session.liveBubble.classList.remove('adv-bubble--live');
    session.liveBubble.querySelector('.adv-caret')?.remove();
    session.liveBubble = null;
    session.liveText = '';
  }

  function finishStreamedReply(session, reply, discardStreamed) {
    if (discardStreamed) {
      clearTimeout(session.liveTimer);
      session.liveBubble?.remove();
      session.liveBubble = null;
      session.liveText = '';
      appendBubble(session, 'assistant', reply);
      return;
    }
    const streamed = (session.liveText || '').trim();
    if (session.liveBubble && streamed === String(reply || '').trim()) {
      commitLiveBubble(session);
      return;
    }
    commitLiveBubble(session);
    appendBubble(session, 'assistant', reply);
  }

  function formatElapsed(startMs) {
    return `(${Math.round((Date.now() - startMs) / 1000)}s)`;
  }

  function clearStepTimer(session, id) {
    const entry = session.stepTimers.get(id);
    if (!entry) return;
    clearInterval(entry.intervalId);
    session.stepTimers.delete(id);
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
        clearStepTimer(session, id);
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
      const timer = document.createElement('span');
      timer.className = 'adv-status-timer';
      block.append(icon, text, timer);
      threadEl.appendChild(block);
      session.statusBlocks.set(id, block);
    }

    if (tool) block.dataset.tool = tool;
    block.classList.toggle('is-error', state === 'error');
    block.dataset.state = state;
    renderStatusIcon(block.querySelector('.adv-status-icon'), state);
    const textEl = block.querySelector('.adv-status-text');
    if (textEl) textEl.textContent = statusCaption(payload.label, payload.detail);

    const timerEl = block.querySelector('.adv-status-timer');

    if (state === 'running') {
      // Mark the start of the first tool step in this run
      if (session.toolsRunStart === null) session.toolsRunStart = Date.now();

      // Start a fresh timer for this step (clear any stale one)
      clearStepTimer(session, id);
      const startMs = Date.now();
      if (timerEl) timerEl.textContent = formatElapsed(startMs);
      const intervalId = setInterval(() => {
        if (timerEl) timerEl.textContent = formatElapsed(startMs);
      }, 1000);
      session.stepTimers.set(id, { startMs, intervalId });
    } else {
      // done / error — freeze the elapsed time
      const entry = session.stepTimers.get(id);
      const startMs = entry ? entry.startMs : null;
      clearStepTimer(session, id);
      if (timerEl && startMs !== null) {
        timerEl.textContent = formatElapsed(startMs);
      }
    }

    stickScroll(threadEl);
  }

  function failRunningStatusBlocks(session, message) {
    for (const [id, block] of session.statusBlocks.entries()) {
      if (block.dataset.state !== 'running') continue;
      const text = block.querySelector('.adv-status-text')?.textContent || '';
      if (block.dataset.tool === 'model' || text.startsWith('Loading')) {
        hideStatusBlock(session, id, block);
        continue;
      }

      // Freeze the elapsed timer before marking error
      const entry = session.stepTimers.get(id);
      const startMs = entry ? entry.startMs : null;
      clearStepTimer(session, id);
      const timerEl = block.querySelector('.adv-status-timer');
      if (timerEl && startMs !== null) timerEl.textContent = formatElapsed(startMs);

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
    session.toolsRunStart = null;
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
    clearStepTimer(session, id);
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
    let completedCount = 0;
    for (const [id, block] of session.statusBlocks.entries()) {
      if (block.dataset.state !== 'running') continue;
      const text = block.querySelector('.adv-status-text')?.textContent || '';
      if (block.dataset.tool === 'model' || text.startsWith('Loading')) {
        hideStatusBlock(session, id, block);
        continue;
      }

      // Freeze the elapsed timer before marking done
      const entry = session.stepTimers.get(id);
      const startMs = entry ? entry.startMs : null;
      clearStepTimer(session, id);
      const timerEl = block.querySelector('.adv-status-timer');
      if (timerEl && startMs !== null) timerEl.textContent = formatElapsed(startMs);

      block.dataset.state = 'done';
      block.classList.remove('is-error');
      renderStatusIcon(block.querySelector('.adv-status-icon'), 'done');
      const textEl = block.querySelector('.adv-status-text');
      if (textEl) textEl.textContent = completedLabel(textEl.textContent);
      completedCount++;
    }

    // Append total time summary if any steps actually completed
    const threadEl = session?.threadEl;
    if (completedCount > 0 && session.toolsRunStart !== null && threadEl) {
      const totalSec = Math.round((Date.now() - session.toolsRunStart) / 1000);
      const summary = document.createElement('div');
      summary.className = 'adv-status adv-status--summary';
      summary.dataset.state = 'done';
      summary.dataset.tool = 'summary';

      const icon = document.createElement('div');
      icon.className = 'adv-status-icon';
      renderStatusIcon(icon, 'done');

      const text = document.createElement('span');
      text.className = 'adv-status-text';
      text.textContent = `Total: ${totalSec}s`;

      summary.append(icon, text);
      threadEl.appendChild(summary);
      stickScroll(threadEl);
    }

    session.toolsRunStart = null;
  }

  if (typeof window.electronAPI?.onAdvanceProgress === 'function') {
    window.electronAPI.onAdvanceProgress((payload) => {
      if (!payload || typeof payload.model !== 'string') return;
      const session = sessions.get(payload.model);
      if (!session) return;
      if (payload.type === 'round') {
        const roundEl = document.getElementById('adv-round');
        if (roundEl && session.model === activeModel) {
          roundEl.hidden = false;
          roundEl.textContent = `Round ${payload.round}/${payload.max}`;
        }
        return;
      }
      if (payload.type === 'delta' && typeof payload.text === 'string') {
        appendDelta(session, payload.text);
        return;
      }
      if (payload.type === 'step' && payload.state === 'running') {
        commitLiveBubble(session);
        if (payload.tool === 'model') showThinking(session);
      }
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
    stickScroll(session.threadEl);

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

    // Clear any lingering step timers from a cancelled prior run
    for (const id of session.stepTimers.keys()) {
      clearStepTimer(session, id);
    }
    session.toolsRunStart = null;

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
        finishStreamedReply(session, result.reply, result.unusable === true);
      } else {
        const error = result?.error || 'The model did not return a reply.';
        failRunningStatusBlocks(session, error);
        session.lastError = error;
        appendBubble(session, 'assistant', error, true);
        addRetry(session);
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
      session.lastError = error;
      appendBubble(session, 'assistant', error, true);
      addRetry(session);
    } finally {
      if (!session.awaitingAnswers) {
        setBusy(session, false);
        if (session.model === activeModel) inputEl?.focus();
        void persistAdvanceSession(document.hidden || !document.hasFocus());
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

  function syncChipDot(session) {
    const dot = session.chipEl?.querySelector('.adv-chip-dot');
    if (!dot) return;
    let state = 'idle';
    if (session.inFlight) state = 'running';
    else if (session.awaitingAnswers) state = 'ask';
    else if (session.lastError) state = 'error';
    dot.dataset.state = state;
  }

  function moveChipIndicator() {
    const indicator = document.getElementById('adv-chip-indicator');
    const session = activeSession();
    if (!indicator || !session?.chipEl) return;
    const chip = session.chipEl;
    indicator.style.width = `${chip.offsetWidth}px`;
    indicator.style.transform = `translateX(${chip.offsetLeft}px)`;
  }

  function anyInFlight() {
    for (const session of sessions.values()) {
      if (session.inFlight) return true;
    }
    return false;
  }

  function syncStopAll() {
    const btn = document.getElementById('adv-stop-all');
    if (btn) btn.hidden = !anyInFlight();
  }

  function selectModel(model) {
    activeModel = model;
    for (const session of sessions.values()) {
      const on = session.model === model;
      session.chipEl.classList.toggle('is-active', on);
      session.chipEl.setAttribute('aria-selected', on ? 'true' : 'false');
      session.threadEl.hidden = !on;
      if (on) session.threadEl.classList.add('is-entering');
    }
    syncComposer();
    moveChipIndicator();
    const roundEl = document.getElementById('adv-round');
    if (roundEl && !activeSession()?.inFlight) roundEl.hidden = true;
  }

  function addRetry(session) {
    const bubbles = session.threadEl?.querySelectorAll('.adv-bubble--error') || [];
    const bubble = bubbles[bubbles.length - 1];
    if (!bubble || bubble.querySelector('.adv-retry')) return;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'adv-retry';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => {
      const last = [...session.messages].reverse().find((m) => m.role === 'user');
      if (!last) return;
      retry.remove();
      session.lastError = '';
      syncChipDot(session);
      void runModel(session, { messages: session.messages });
    });
    bubble.appendChild(retry);
  }

  function createSession(entry) {
    const model = toRuntimeId(entry);
    const chipEl = document.createElement('button');
    chipEl.type = 'button';
    chipEl.className = 'adv-chip';
    chipEl.setAttribute('role', 'tab');
    const dot = document.createElement('span');
    dot.className = 'adv-chip-dot';
    dot.dataset.state = 'idle';
    chipEl.append(dot, document.createTextNode(chipLabel(entry.name)));
    chipEl.title = entry.name;
    chipEl.addEventListener('click', () => selectModel(model));

    const threadEl = document.createElement('div');
    threadEl.className = 'adv-thread';
    threadEl.hidden = true;
    threadEl.dataset.follow = '1';
    threadEl.setAttribute('aria-live', 'polite');
    const newMsgs = document.createElement('button');
    newMsgs.type = 'button';
    newMsgs.className = 'adv-new-msgs';
    newMsgs.textContent = 'New messages';
    newMsgs.hidden = true;
    newMsgs.addEventListener('click', () => {
      threadEl.dataset.follow = '1';
      stickScroll(threadEl);
    });
    threadEl.addEventListener('scroll', () => {
      threadEl.dataset.follow = nearBottom(threadEl) ? '1' : '0';
      if (threadEl.dataset.follow === '1') newMsgs.hidden = true;
    });
    threadEl.appendChild(newMsgs);

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
      stepTimers: new Map(),
      toolsRunStart: null,
      lastError: '',
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
    const grow = () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = `${Math.min(inputEl.scrollHeight, 160)}px`;
    };
    inputEl.addEventListener('input', grow);
    inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    });
  }

  document.getElementById('adv-stop-all')?.addEventListener('click', () => {
    window.electronAPI?.advanceCancel?.({});
    for (const session of sessions.values()) {
      if (!session.inFlight) continue;
      restorePausedQuery(session);
      setBusy(session, false);
    }
  });

  document.getElementById('adv-compare')?.addEventListener('click', () => openCompare());

  function openCompare() {
    let overlay = document.getElementById('compare-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'compare-overlay';
      overlay.className = 'glass-overlay';
      overlay.hidden = true;
      overlay.innerHTML = '<div class="adv-compare-modal" role="dialog" aria-modal="true" aria-labelledby="compare-title"><div class="adv-compare-head"><div><h2 id="compare-title">Compare</h2><p class="adv-compare-sub">Side-by-side impressions from the models on this analysis</p></div><button type="button" id="compare-close" class="adv-compare-close">Close</button></div><div id="compare-grid" class="adv-compare-grid"></div><div class="adv-compare-foot"><button type="button" id="compare-consensus" class="adv-compare-consensus">Consensus</button></div></div>';
      document.body.appendChild(overlay);
      overlay.querySelector('#compare-close').addEventListener('click', () => closeOverlay(overlay));
      overlay.querySelector('#compare-consensus').addEventListener('click', () => { void runConsensus(overlay); });
    }
    const grid = overlay.querySelector('#compare-grid');
    grid.replaceChildren();
    for (const session of sessions.values()) {
      const last = [...session.messages].reverse().find((m) => m.role === 'assistant');
      const report = last ? parseReport(last.content) : null;
      const card = document.createElement('article');
      const title = document.createElement('h3');
      title.textContent = session.model;
      const lead = document.createElement('p');
      const leading = report?.sections.find((s) => s.title === 'Leading Clinical Impression');
      if (leading?.body) {
        card.className = 'adv-compare-card';
        lead.textContent = leading.body.slice(0, 280);
        card.append(title);
        const pills = document.createElement('div');
        pills.className = 'adv-compare-pills';
        if (report.confidence) {
          const pill = document.createElement('span');
          pill.className = 'adv-compare-pill';
          pill.textContent = report.confidence;
          pills.appendChild(pill);
        }
        if (report.urgency) {
          const pill = document.createElement('span');
          pill.className = 'adv-compare-pill';
          pill.textContent = report.urgency;
          pills.appendChild(pill);
        }
        if (pills.childElementCount) card.append(pills);
        card.append(lead);
      } else if (last) {
        card.className = 'adv-compare-card is-plain';
        lead.textContent = 'No structured report yet.';
        card.append(title, lead);
      } else {
        card.className = 'adv-compare-card is-empty';
        lead.textContent = 'No reply yet.';
        card.append(title, lead);
      }
      grid.appendChild(card);
    }
    openOverlay(overlay, { closeOnBackdrop: true, initialFocus: '#compare-close' });
  }

  async function runConsensus(overlay) {
    let runtime = '';
    try {
      const master = await window.electronAPI?.getMasterModel?.();
      runtime = typeof master?.model === 'string' ? master.model : '';
    } catch {
      runtime = '';
    }
    const session = sessions.get(runtime);
    if (!session) return;
    const notes = [];
    for (const item of sessions.values()) {
      const last = [...item.messages].reverse().find((m) => m.role === 'assistant');
      if (!last) continue;
      const report = parseReport(last.content);
      const leading = report?.sections.find((s) => s.title === 'Leading Clinical Impression');
      notes.push(`${item.model}: ${leading?.body || last.content.slice(0, 500)}`);
    }
    if (!notes.length) return;
    const text = `Write one consensus Pre-doctor Clinical Analysis from these model impressions:\n\n${notes.join('\n\n')}`;
    closeOverlay(overlay);
    selectModel(runtime);
    session.messages.push({ role: 'user', content: text });
    appendBubble(session, 'user', text);
    await runModel(session, { messages: session.messages });
  }

  document.getElementById('adv-back')?.addEventListener('click', async () => {
    if (anyInFlight()) {
      const leave = await confirmDialog({
        title: 'Leave this analysis?',
        message: 'A model is still running. Leaving stops the run.',
        confirmLabel: 'Leave',
        tone: 'accept',
      });
      if (!leave) return;
      window.electronAPI?.advanceCancel?.({});
    }
    document.body.classList.add('is-leaving');
    setTimeout(() => { window.location.href = '../../index.html'; }, 160);
  });

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

    const indicator = document.createElement('span');
    indicator.id = 'adv-chip-indicator';
    indicator.className = 'adv-chip-indicator';
    chipsEl.appendChild(indicator);

    for (const entry of enabled) createSession(entry);
    selectModel(toRuntimeId(enabled[0]));

    const paramsEarly = new URLSearchParams(location.search);
    const patientEl = document.getElementById('adv-patient');
    const patientName = paramsEarly.get('name')?.trim();
    const patientAge = paramsEarly.get('age');
    const patientGender = paramsEarly.get('gender');
    if (patientEl && patientName) {
      const level = getReasoningLevel().replace(/_/g, ' ');
      patientEl.textContent = `${patientName} · ${patientAge || '—'} · ${patientGender || '—'} · ${level}`;
    }

    const params = new URLSearchParams(location.search);
    const existingId = params.get('session');
    if (existingId) {
      try {
        const loaded = await window.electronAPI?.getSession?.(existingId);
        const threads = loaded?.session?.threads || {};
        for (const session of sessions.values()) {
          const saved = threads[session.model];
          const messages = Array.isArray(saved?.messages) ? saved.messages : [];
          session.messages = messages;
          for (const message of messages) {
            if (message?.role === 'user' || message?.role === 'assistant') {
              appendBubble(session, message.role, message.content || '');
            }
          }
        }
      } catch (err) {
        console.warn('[advance] session restore failed:', err);
      }
      return;
    }

    const issue = params.get('issue')?.trim();
    if (!issue) return;

    const age = params.get('age');
    const gender = params.get('gender');
    const name = params.get('name')?.trim();
    let text = issue;
    const reported = formatReportedAt();
    if (age && gender) {
      const patient = name
        ? `${name}, ${age}-year-old ${gender}`
        : `${age}-year-old ${gender}`;
      text = `${issue}\n\nPatient: ${patient}. Reported: ${reported}.`;
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
    await persistAdvanceSession(false);
  }

  async function persistAdvanceSession(notify) {
    const threads = {};
    for (const session of sessions.values()) {
      threads[session.model] = { messages: session.messages };
    }
    const params = new URLSearchParams(location.search);
    const issue = params.get('issue')?.trim();
    try {
      const saved = await window.electronAPI?.saveSession?.({
        id: params.get('session') || '',
        title: issue || 'Analysis',
        name: params.get('name') || '',
        age: params.get('age') || '',
        gender: params.get('gender') || '',
        reasoningLevel: getReasoningLevel(),
        models: [...sessions.keys()],
        threads,
        notify: notify === true,
      });
      if (saved?.session?.id && !params.get('session')) {
        params.set('session', saved.session.id);
        history.replaceState(null, '', `${location.pathname}?${params}`);
      }
    } catch (err) {
      console.warn('[advance] session save failed:', err);
    }
  }

  bootstrap();
});
