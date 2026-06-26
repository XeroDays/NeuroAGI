export function wireFanoutEarlyContinue({ statusEl, onSkip }) {
  const btn =
    statusEl?.querySelector('#q-fanout-continue') ||
    document.getElementById('q-fanout-continue');

  let totalWorkers = 0;
  let doneCount = 0;
  let okCount = 0;
  let masterStarted = false;
  let skipped = false;

  function hideButton() {
    if (btn) {
      btn.hidden = true;
    }
  }

  function updateButtonVisibility() {
    if (!btn || skipped || masterStarted) {
      hideButton();
      return;
    }

    const show =
      totalWorkers > 1 &&
      okCount >= 1 &&
      doneCount < totalWorkers;

    btn.hidden = !show;
  }

  function handleProgress(payload) {
    switch (payload?.type) {
      case 'workers_start':
        totalWorkers = Array.isArray(payload.models) ? payload.models.length : 0;
        doneCount = 0;
        okCount = 0;
        masterStarted = false;
        skipped = false;
        if (btn) {
          btn.disabled = false;
        }
        updateButtonVisibility();
        break;
      case 'worker_done':
        doneCount += 1;
        if (payload.ok !== false) {
          okCount += 1;
        }
        updateButtonVisibility();
        break;
      case 'workers_skip':
        skipped = true;
        hideButton();
        break;
      case 'master_start':
        masterStarted = true;
        hideButton();
        break;
      default:
        break;
    }
  }

  if (btn) {
    btn.addEventListener('click', async () => {
      if (skipped || masterStarted) return;
      skipped = true;
      btn.hidden = true;
      btn.disabled = true;
      try {
        await onSkip?.();
      } catch (err) {
        console.warn('[fanout-early-continue] skipFanoutWait failed:', err);
        skipped = false;
        btn.disabled = false;
        updateButtonVisibility();
      }
    });
  }

  return {
    handleProgress,
    hide: hideButton,
  };
}
