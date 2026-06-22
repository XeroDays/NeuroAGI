import {
  APP_TITLE,
  LABEL_START_HUMAN_DIAGNOSTICS
} from './constants.js';
import { createWorkerProgressPanel } from './worker-progress-panel.js';

document.addEventListener('DOMContentLoaded', () => {
  document.title = APP_TITLE;

  const input = document.getElementById('health-input');
  const btn = document.getElementById('btn-start-diagnostics');
  const genderSelect = document.getElementById('select-gender');
  const ageSelect = document.getElementById('select-age');
  const reasoningSelect = document.getElementById('select-reasoning');

  if (ageSelect) {
    for (let i = 1; i <= 100; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${i} years`;
      if (i === 30) opt.selected = true;
      ageSelect.appendChild(opt);
    }
  }

  if (input) {
    input.focus();
  }

  let enhancing = false;

  const progressPanel = createWorkerProgressPanel({
    position: 'bottom-right',
    attachToSelector: '#qe-toast-stack',
  });

  function ensureToastStack() {
    let stack = document.getElementById('qe-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'qe-toast-stack';
      stack.className = 'qe-toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }

  function showToast(message, status = 'active') {
    const stack = ensureToastStack();

    const toast = document.createElement('div');
    toast.className = `qe-toast qe-toast--${status}`;
    toast.textContent = message;
    stack.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('qe-toast--leaving');
      setTimeout(() => toast.remove(), 280);
    }, 3500);
  }

  if (btn) {
    btn.addEventListener('click', async () => {
      if (enhancing) return;
      const issue = input?.value?.trim() || '';
      const gender = genderSelect?.value || 'male';
      const age = ageSelect?.value || '30';
      const reasoningLevel = reasoningSelect?.value || 'medium';

      try {
        sessionStorage.setItem('neuroagi:reasoningLevel', reasoningLevel);
      } catch (err) {
        console.warn('Failed to stash reasoning level:', err);
      }

      try {
        await window.electronAPI?.resetUsageTotals?.();
      } catch (err) {
        console.warn('[app] Failed to reset usage totals:', err);
      }

      let finalIssue = issue;

      if (issue && window.electronAPI?.enhanceQuery) {
        enhancing = true;
        btn.classList.add('is-loading');
        btn.disabled = true;
        if (input) input.disabled = true;

        let unsubscribe = () => {};
        ensureToastStack();
        if (window.electronAPI?.onQueryEnhancerProgress) {
          unsubscribe = window.electronAPI.onQueryEnhancerProgress((payload) => {
            if (payload?.type) {
              progressPanel.handleEvent(payload);
            } else if (payload?.message) {
              showToast(payload.message, payload.status);
            }
          });
        }

        try {
          const res = await window.electronAPI.enhanceQuery({ issue, gender, age });
          if (typeof res?.enhancedQuery === 'string' && res.enhancedQuery.trim()) {
            finalIssue = res.enhancedQuery;
          }
        } catch (err) {
          console.warn('[app] QueryEnhancer failed, continuing with original query:', err);
        } finally {
          progressPanel.hide();
          unsubscribe();
        }
      }

      const query = new URLSearchParams();
      if (finalIssue) query.set('issue', finalIssue);
      query.set('gender', gender);
      query.set('age', age);
      window.location.href = `screens/questionnaire/index.html?${query}`;
    });
  }

  if (input && btn) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        btn.click();
      }
    });
  }

  const settingsBtn = document.getElementById('btn-settings');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      window.electronAPI?.openDevTools?.();
    });
  }

  // ── Models popup ──────────────────────────────────────────────────────────
  const modelsBtn       = document.getElementById('btn-models');
  const modelsOverlay   = document.getElementById('models-overlay');
  const modelsListFree  = document.getElementById('models-list-free');
  const modelsListPaid  = document.getElementById('models-list-paid');
  const modelsCloseBtn  = document.getElementById('btn-models-close');
  const modelsUpdateBtn = document.getElementById('btn-models-update');
  const modelsTabs      = document.querySelectorAll('.models-tab');

  // Local snapshot of the model list; mutated by toggle/star interactions.
  let modelsState = [];

  function parseModelLabels(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return [];
    return raw.split(';').map((s) => s.trim()).filter(Boolean);
  }

  function setMasterModel(modelName) {
    const entry = modelsState.find((m) => m.name === modelName);
    if (!entry) return;

    const wasMaster = entry.isMaster === true;
    const previousMaster = modelsState.find((m) => m.isMaster && m.name !== modelName);

    modelsState.forEach((m) => {
      m.isMaster = false;
    });

    if (!wasMaster) {
      entry.isMaster = true;
      // Master selection should drive which model is used next — enable the new
      // master for worker fanout and stop calling the replaced master.
      entry.enabled = true;
      if (previousMaster) {
        previousMaster.enabled = false;
      }
    }

    renderModelsList();
  }

  // Build a single panel's rows from a filtered slice of modelsState.
  function renderTabPanel(container, models) {
    if (!container) return;
    container.innerHTML = '';
    for (const model of models) {
      const row = document.createElement('div');
      row.className = 'models-row';
      row.setAttribute('role', 'listitem');

      const starBtn = document.createElement('button');
      starBtn.type = 'button';
      starBtn.className = `models-star-btn${model.isMaster ? ' is-starred' : ''}`;
      starBtn.setAttribute(
        'aria-label',
        model.isMaster
          ? `Master model: ${model.name}`
          : `Set ${model.name} as master model`
      );
      starBtn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
      starBtn.addEventListener('click', () => setMasterModel(model.name));

      // Left: name + type badge
      const info = document.createElement('div');
      info.className = 'models-row-info';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'models-row-name';
      nameSpan.textContent = model.name;

      const typeBadge = document.createElement('span');
      typeBadge.className = `models-type-badge models-type-badge--${model.type.toLowerCase()}`;
      typeBadge.textContent = model.type;

      info.appendChild(nameSpan);
      info.appendChild(typeBadge);

      if (model.latency) {
        const latencyBadge = document.createElement('span');
        latencyBadge.className = 'models-latency-badge';
        latencyBadge.textContent = model.latency;
        info.appendChild(latencyBadge);
      }

      if (model.throughput) {
        const throughputBadge = document.createElement('span');
        throughputBadge.className = 'models-throughput-badge';
        throughputBadge.textContent = model.throughput;
        info.appendChild(throughputBadge);
      }

      if (model.price) {
        const priceBadge = document.createElement('span');
        priceBadge.className = 'models-price-badge';
        priceBadge.textContent = model.price;
        info.appendChild(priceBadge);
      }

      for (const label of parseModelLabels(model.labels)) {
        const labelBadge = document.createElement('span');
        labelBadge.className = 'models-label-badge';
        labelBadge.textContent = label;
        info.appendChild(labelBadge);
      }

      // Right: toggle switch
      const toggleLabel = document.createElement('label');
      toggleLabel.className = 'models-toggle';
      toggleLabel.setAttribute('aria-label', `Toggle ${model.name}`);

      const toggleInput = document.createElement('input');
      toggleInput.type = 'checkbox';
      toggleInput.checked = model.enabled;
      toggleInput.dataset.modelName = model.name;
      toggleInput.addEventListener('change', (e) => {
        const entry = modelsState.find((m) => m.name === e.target.dataset.modelName);
        if (entry) entry.enabled = e.target.checked;
        updateTabCounts();
      });

      const toggleSlider = document.createElement('span');
      toggleSlider.className = 'models-toggle-slider';
      toggleSlider.setAttribute('aria-hidden', 'true');

      toggleLabel.appendChild(toggleInput);
      toggleLabel.appendChild(toggleSlider);

      row.appendChild(starBtn);
      row.appendChild(info);
      row.appendChild(toggleLabel);
      container.appendChild(row);
    }
  }

  // Update the enabled-count badge on each tab button.
  function updateTabCounts() {
    const freeEnabled = modelsState.filter(m => m.type.toLowerCase() === 'free' && m.enabled).length;
    const freeTotal   = modelsState.filter(m => m.type.toLowerCase() === 'free').length;
    const paidEnabled = modelsState.filter(m => m.type.toLowerCase() === 'paid' && m.enabled).length;
    const paidTotal   = modelsState.filter(m => m.type.toLowerCase() === 'paid').length;

    modelsTabs.forEach((tab) => {
      if (tab.dataset.tab === 'free') {
        tab.textContent = `Free (${freeEnabled}/${freeTotal})`;
      } else {
        tab.textContent = `Paid (${paidEnabled}/${paidTotal})`;
      }
    });
  }

  // Render both panels and refresh tab counts.
  function renderModelsList() {
    renderTabPanel(modelsListFree, modelsState.filter(m => m.type.toLowerCase() === 'free'));
    renderTabPanel(modelsListPaid, modelsState.filter(m => m.type.toLowerCase() === 'paid'));
    updateTabCounts();
  }

  // Switch active tab; show the matching panel, hide the other.
  function switchTab(tabName) {
    modelsTabs.forEach((tab) => {
      const isActive = tab.dataset.tab === tabName;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
    if (modelsListFree) modelsListFree.hidden = (tabName !== 'free');
    if (modelsListPaid) modelsListPaid.hidden = (tabName !== 'paid');
  }

  modelsTabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  async function openModelsPopup() {
    if (!modelsOverlay) return;
    try {
      const config = await window.electronAPI?.getModelsConfig?.();
      modelsState = Array.isArray(config) ? config : [];
      renderModelsList();
      switchTab('free'); // always open on Free tab
      modelsOverlay.hidden = false;
    } catch (err) {
      console.error('[app] Failed to load models config:', err);
    }
  }

  function closeModelsPopup() {
    if (modelsOverlay) modelsOverlay.hidden = true;
  }

  if (modelsBtn) {
    modelsBtn.addEventListener('click', openModelsPopup);
  }

  if (modelsOverlay) {
    // Close on backdrop click
    modelsOverlay.addEventListener('click', (e) => {
      if (e.target === modelsOverlay) closeModelsPopup();
    });
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modelsOverlay.hidden) closeModelsPopup();
    });
  }

  if (modelsCloseBtn) {
    modelsCloseBtn.addEventListener('click', closeModelsPopup);
  }

  if (modelsUpdateBtn) {
    modelsUpdateBtn.addEventListener('click', async () => {
      const activeModels = modelsState.filter((m) => m.enabled).map((m) => m.name);
      const masterModelEntry = modelsState.find((m) => m.isMaster);
      const masterModel = masterModelEntry?.name ?? '';
      modelsUpdateBtn.disabled = true;
      modelsUpdateBtn.textContent = 'Saving…';
      try {
        console.log('[app] Saving models config:', { activeModels, masterModel });
        await window.electronAPI?.updateModelsConfig?.({ activeModels, masterModel });
        closeModelsPopup();
      } catch (err) {
        console.error('[app] Failed to update models config:', err);
      } finally {
        modelsUpdateBtn.disabled = false;
        modelsUpdateBtn.textContent = 'Update';
      }
    });
  }
});
