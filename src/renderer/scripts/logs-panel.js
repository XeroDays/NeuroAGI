/**
 * logs-panel.js — global module loaded on every screen.
 *
 * Injects the "Logs" bubble to the left of the existing .usage-bubbles
 * container. Clicking it opens a glass master-detail overlay showing all
 * tool-call log entries collected by the main process log-service.
 */

/* ── State ──────────────────────────────────────────────── */
let currentLogs = [];
let selectedId = null;
let overlayEl = null;
let listEl = null;
let detailEl = null;
let offLogUpdate = null;

/* ── Helpers ────────────────────────────────────────────── */

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTokens(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString();
}

function formatCost(n) {
  if (n == null) return '—';
  const num = Number(n);
  if (!Number.isFinite(num) || num === 0) return 'USD 0';
  return `USD ${num.toString()}`;
}

function queryPreview(log) {
  const q = typeof log.query === 'string' ? log.query : '';
  const oneLine = q.replace(/\s+/g, ' ').trim();
  return oneLine.length > 80 ? `${oneLine.slice(0, 80)}…` : oneLine;
}

function modelPreview(log) {
  if (log.type === 'ai') return log.model || '—';
  return 'Tavily';
}

/* ── DOM builders ───────────────────────────────────────── */

function buildBubble() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'usage-bubble logs-bubble';
  btn.setAttribute('aria-label', 'Open call logs');
  btn.setAttribute('title', 'View tool call logs');

  const iconSvg = `<svg class="logs-bubble-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="14" height="14" rx="2"/>
    <line x1="7" y1="7" x2="13" y2="7"/>
    <line x1="7" y1="10" x2="13" y2="10"/>
    <line x1="7" y1="13" x2="10" y2="13"/>
  </svg>`;

  btn.innerHTML = `${iconSvg}<span>Logs</span>`;
  btn.addEventListener('click', openOverlay);
  return btn;
}

function buildOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'logs-overlay';
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Tool call logs');
  overlay.hidden = true;

  overlay.innerHTML = `
    <div class="logs-modal">
      <div class="logs-modal-header">
        <div>
          <h2 class="logs-modal-title">Tool Call Logs</h2>
          <p class="logs-modal-subtitle">AI model calls and web search calls recorded this session.</p>
        </div>
        <div class="logs-header-actions">
          <button type="button" class="logs-btn-clear" id="logs-btn-clear">Clear</button>
          <button type="button" class="logs-btn-close" id="logs-btn-close">Close</button>
        </div>
      </div>
      <div class="logs-body">
        <div class="logs-list-wrap">
          <div class="logs-list" id="logs-list" role="list"></div>
        </div>
        <div class="logs-detail" id="logs-detail">
          <div class="logs-detail-empty">Select a log entry to view details.</div>
        </div>
      </div>
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay();
  });
  overlay.querySelector('#logs-btn-close').addEventListener('click', closeOverlay);
  overlay.querySelector('#logs-btn-clear').addEventListener('click', async () => {
    if (window.electronAPI?.clearLogs) {
      await window.electronAPI.clearLogs();
    }
    currentLogs = [];
    selectedId = null;
    renderList();
    renderDetail(null);
  });

  return overlay;
}

/* ── Render list ────────────────────────────────────────── */

function renderList() {
  if (!listEl) return;
  listEl.innerHTML = '';

  if (currentLogs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'logs-empty';
    empty.textContent = 'No calls logged yet.';
    listEl.appendChild(empty);
    return;
  }

  for (const log of [...currentLogs].reverse()) {
    const row = document.createElement('div');
    row.className = 'log-row' + (log.id === selectedId ? ' is-selected' : '');
    row.setAttribute('role', 'listitem');
    row.dataset.id = log.id;

    const badgeClass = log.type === 'ai' ? 'type-ai' : 'type-web';
    const badgeLabel = log.type === 'ai' ? 'AI' : 'Web';
    const statusClass = log.status === 'success' ? 'status-success' : 'status-error';

    row.innerHTML = `
      <div class="log-row-top">
        <span class="log-type-badge ${badgeClass}">${badgeLabel}</span>
        <span class="log-row-title">${escHtml(log.type === 'ai' ? 'AI Tool Call' : 'Web Tool Call')}</span>
        <span class="log-status-dot ${statusClass}" title="${log.status}"></span>
      </div>
      <div class="log-row-meta">
        <span class="log-meta-model">${escHtml(modelPreview(log))}</span>
        <span class="log-meta-duration">${formatDuration(log.durationMs)}</span>
        <span class="log-meta-time">${formatTime(log.timestamp)}</span>
      </div>
      <div class="log-row-query-preview">${escHtml(queryPreview(log))}</div>
    `;

    row.addEventListener('click', () => {
      selectedId = log.id;
      renderList();
      renderDetail(log);
    });

    listEl.appendChild(row);
  }
}

/* ── Render detail ──────────────────────────────────────── */

function renderDetail(log) {
  if (!detailEl) return;
  detailEl.innerHTML = '';

  if (!log) {
    const empty = document.createElement('div');
    empty.className = 'logs-detail-empty';
    empty.textContent = 'Select a log entry to view details.';
    detailEl.appendChild(empty);
    return;
  }

  const content = document.createElement('div');
  content.className = 'logs-detail-content';

  const statusClass = log.status === 'success' ? 'status-success' : 'status-error';
  const typeLabel = log.type === 'ai' ? 'AI Tool Call' : 'Web Tool Call';

  let headerHtml = `
    <div class="logs-detail-header">
      <h3 class="logs-detail-title">${escHtml(typeLabel)}</h3>
      <span class="logs-detail-status ${statusClass}">${escHtml(log.status)}</span>
    </div>
  `;
  content.insertAdjacentHTML('beforeend', headerHtml);

  // Metadata chips
  const chips = [];
  chips.push({ label: 'Time', value: new Date(log.timestamp).toLocaleString() });
  chips.push({ label: 'Duration', value: formatDuration(log.durationMs) });

  if (log.type === 'ai') {
    if (log.model) chips.push({ label: 'Model', value: log.model });
    if (log.reasoningEffort != null) chips.push({ label: 'Reasoning', value: log.reasoningEffort });
    if (log.maxTokens != null) chips.push({ label: 'Max Tokens', value: String(log.maxTokens) });
    if (log.promptTokens != null) chips.push({ label: 'Prompt Tokens', value: formatTokens(log.promptTokens) });
    if (log.completionTokens != null) chips.push({ label: 'Completion Tokens', value: formatTokens(log.completionTokens) });
    if (log.totalTokens != null) chips.push({ label: 'Total Tokens', value: formatTokens(log.totalTokens) });
    if (log.cost != null) chips.push({ label: 'Cost', value: formatCost(log.cost) });
  }

  if (chips.length > 0) {
    const grid = document.createElement('div');
    grid.className = 'logs-detail-meta';
    grid.innerHTML = chips.map((c) => `
      <div class="logs-meta-chip">
        <span class="logs-meta-chip-label">${escHtml(c.label)}</span>
        <span class="logs-meta-chip-value">${escHtml(c.value)}</span>
      </div>
    `).join('');
    content.appendChild(grid);
  }

  // Error
  if (log.error) {
    const errEl = document.createElement('div');
    errEl.className = 'logs-detail-error';
    errEl.textContent = log.error;
    content.appendChild(errEl);
  }

  // Query section
  if (log.query) {
    const sec = buildDetailSection('Query', log.query);
    content.appendChild(sec);
  }

  // Response section
  if (log.response) {
    let responseText;
    if (typeof log.response === 'string') {
      responseText = log.response;
    } else {
      try {
        responseText = JSON.stringify(log.response, null, 2);
      } catch {
        responseText = String(log.response);
      }
    }
    const sec = buildDetailSection('Response', responseText);
    content.appendChild(sec);
  }

  detailEl.appendChild(content);
}

function buildDetailSection(label, text) {
  const sec = document.createElement('div');
  sec.className = 'logs-detail-section';

  const labelEl = document.createElement('div');
  labelEl.className = 'logs-detail-section-label';
  labelEl.textContent = label;

  const pre = document.createElement('pre');
  pre.className = 'logs-detail-pre';
  pre.textContent = text;

  sec.appendChild(labelEl);
  sec.appendChild(pre);
  return sec;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Open / close overlay ───────────────────────────────── */

async function openOverlay() {
  if (!overlayEl) return;
  overlayEl.hidden = false;
  document.body.style.overflow = 'hidden';

  if (window.electronAPI?.getLogs) {
    try {
      currentLogs = await window.electronAPI.getLogs();
    } catch {
      currentLogs = [];
    }
  }

  renderList();
  renderDetail(selectedId ? currentLogs.find((l) => l.id === selectedId) ?? null : null);
}

function closeOverlay() {
  if (!overlayEl) return;
  overlayEl.hidden = true;
  document.body.style.overflow = '';
}

/* ── Keyboard handler ───────────────────────────────────── */

function handleKeydown(e) {
  if (e.key === 'Escape' && overlayEl && !overlayEl.hidden) {
    closeOverlay();
  }
}

/* ── Mount into the page ────────────────────────────────── */

async function init() {
  if (!window.electronAPI?.getLogs) {
    console.warn('[logs-panel] electronAPI.getLogs not available');
    return;
  }

  // Wait for usage-bubbles.js to inject .usage-bubbles (it runs on the same
  // DOMContentLoaded event, but registers first since it's listed before this
  // script). Use a short poll so we don't race.
  let container = null;
  for (let i = 0; i < 20; i++) {
    container = document.querySelector('.usage-bubbles');
    if (container) break;
    await new Promise((r) => setTimeout(r, 25));
  }

  if (!container) {
    console.warn('[logs-panel] .usage-bubbles container not found');
    return;
  }

  const bubble = buildBubble();
  container.insertBefore(bubble, container.firstChild);

  overlayEl = buildOverlay();
  document.body.appendChild(overlayEl);

  listEl = overlayEl.querySelector('#logs-list');
  detailEl = overlayEl.querySelector('#logs-detail');

  document.addEventListener('keydown', handleKeydown);

  if (window.electronAPI?.onLogUpdate) {
    offLogUpdate = window.electronAPI.onLogUpdate(({ logs }) => {
      currentLogs = Array.isArray(logs) ? logs : [];
      if (overlayEl && !overlayEl.hidden) {
        renderList();
        // Keep the selected entry up-to-date if it was refreshed.
        const active = selectedId ? currentLogs.find((l) => l.id === selectedId) ?? null : null;
        renderDetail(active);
      }
    });
  }

  window.addEventListener('beforeunload', () => {
    document.removeEventListener('keydown', handleKeydown);
    try { offLogUpdate?.(); } catch {}
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
