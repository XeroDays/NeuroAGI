const CHECK_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 L6.5 12 L13 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const ERROR_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';

export function formatModelLabel(runtimeId) {
  if (typeof runtimeId !== 'string' || !runtimeId) return 'Model';
  let label = runtimeId.replace(/:free$/i, '');
  const slash = label.lastIndexOf('/');
  if (slash !== -1) label = label.slice(slash + 1);
  return label.length > 36 ? `${label.slice(0, 33)}…` : label;
}

function buildSnackRow(modelId, { isMaster = false } = {}) {
  const row = document.createElement('div');
  row.className = `q-worker-snack${isMaster ? ' q-worker-snack--master' : ''}`;
  row.dataset.modelId = modelId;

  const head = document.createElement('div');
  head.className = 'q-worker-snack__head';

  const icon = document.createElement('span');
  icon.className = 'q-worker-snack__icon is-active';
  icon.innerHTML = '<span class="q-worker-snack__spinner" aria-hidden="true"></span>';

  const label = document.createElement('span');
  label.className = 'q-worker-snack__label';
  label.textContent = isMaster ? `Master · ${formatModelLabel(modelId)}` : formatModelLabel(modelId);

  head.append(icon, label);

  const track = document.createElement('div');
  track.className = 'q-worker-snack__track';

  const bar = document.createElement('div');
  bar.className = 'q-worker-snack__bar is-active';
  track.appendChild(bar);

  row.append(head, track);
  return row;
}

function markRowDone(row, ok) {
  if (!row) return;
  row.classList.toggle('q-worker-snack--error', ok === false);

  const bar = row.querySelector('.q-worker-snack__bar');
  if (bar) {
    bar.classList.remove('is-active');
    bar.classList.add('is-done');
  }

  const icon = row.querySelector('.q-worker-snack__icon');
  if (icon) {
    icon.classList.remove('is-active');
    icon.classList.add(ok ? 'is-done' : 'is-error');
    icon.innerHTML = ok ? CHECK_SVG : ERROR_SVG;
  }
}

export function createWorkerProgressPanel() {
  let stackEl = null;
  const rowByModel = new Map();
  let masterRow = null;
  let hideTimer = null;

  function ensureStack() {
    if (stackEl) return stackEl;
    stackEl = document.createElement('div');
    stackEl.id = 'q-worker-stack';
    stackEl.className = 'q-worker-stack';
    stackEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(stackEl);
    return stackEl;
  }

  function mountProgressStack(models) {
    if (stackEl) return;
    const list = Array.isArray(models) ? models : [];
    const stack = ensureStack();
    rowByModel.clear();
    masterRow = null;

    for (const modelId of list) {
      const row = buildSnackRow(modelId);
      rowByModel.set(modelId, row);
      stack.appendChild(row);
    }
  }

  function markWorkerDone(model, ok) {
    markRowDone(rowByModel.get(model), ok);
  }

  function showMasterRow(model) {
    if (masterRow || !model) return;
    const stack = ensureStack();
    masterRow = buildSnackRow(model, { isMaster: true });
    stack.appendChild(masterRow);
  }

  function markMasterDone(ok) {
    markRowDone(masterRow, ok);
  }

  function hide() {
    if (!stackEl || hideTimer) return;
    stackEl.classList.add('q-worker-stack--leaving');
    hideTimer = setTimeout(() => {
      stackEl?.remove();
      stackEl = null;
      rowByModel.clear();
      masterRow = null;
      hideTimer = null;
    }, 300);
  }

  function handleEvent(payload) {
    switch (payload?.type) {
      case 'workers_start':
        mountProgressStack(payload.models);
        break;
      case 'worker_done':
        markWorkerDone(payload.model, payload.ok !== false);
        break;
      case 'master_start':
        showMasterRow(payload.model);
        break;
      case 'master_done':
        markMasterDone(payload.ok !== false);
        break;
      default:
        break;
    }
  }

  return { handleEvent, hide };
}
