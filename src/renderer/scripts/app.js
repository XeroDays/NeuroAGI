import { APP_TITLE } from './constants.js';

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

  const openCustomSelects = new Set();

  function closeAllCustomSelects() {
    for (const close of openCustomSelects) close();
  }

  function enhanceGlassSelect(selectEl) {
    if (!selectEl || selectEl.dataset.enhanced === '1') return;

    const wrap = document.createElement('div');
    wrap.className = 'custom-select';
    selectEl.parentNode.insertBefore(wrap, selectEl);
    wrap.appendChild(selectEl);
    selectEl.hidden = true;
    selectEl.dataset.enhanced = '1';
    selectEl.tabIndex = -1;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-select-trigger';
    if (selectEl.id) trigger.id = `${selectEl.id}-trigger`;
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', selectEl.getAttribute('aria-label') || 'Select');
    if (selectEl.id) {
      const label = document.querySelector(`label[for="${selectEl.id}"]`);
      if (label) label.setAttribute('for', trigger.id);
    }

    const menu = document.createElement('ul');
    menu.className = 'custom-select-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    function selectedOption() {
      return selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
    }

    function syncTrigger() {
      const opt = selectedOption();
      trigger.textContent = opt ? opt.textContent : '';
    }

    function setValue(value) {
      if (selectEl.value === value) {
        syncTrigger();
        highlightActive();
        return;
      }
      selectEl.value = value;
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      syncTrigger();
    }

    selectEl.addEventListener('change', () => {
      syncTrigger();
      highlightActive();
    });

    function highlightActive() {
      const value = selectEl.value;
      for (const li of menu.querySelectorAll('[role="option"]')) {
        const on = li.dataset.value === value;
        li.classList.toggle('is-selected', on);
        li.setAttribute('aria-selected', on ? 'true' : 'false');
      }
    }

    function rebuildMenu() {
      menu.replaceChildren();
      for (const opt of selectEl.options) {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.dataset.value = opt.value;
        li.textContent = opt.textContent;
        li.addEventListener('click', () => {
          setValue(opt.value);
          closeMenu();
          trigger.focus();
        });
        menu.appendChild(li);
      }
      highlightActive();
    }

    function scrollSelectedIntoView() {
      const selected = menu.querySelector('.is-selected');
      selected?.scrollIntoView({ block: 'nearest' });
    }

    function closeMenu() {
      if (menu.hidden) return;
      menu.hidden = true;
      wrap.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      openCustomSelects.delete(closeMenu);
    }

    function openMenu() {
      if (!menu.hidden) return;
      closeAllCustomSelects();
      rebuildMenu();
      menu.hidden = false;
      wrap.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      openCustomSelects.add(closeMenu);
      scrollSelectedIntoView();
    }

    function moveSelection(delta) {
      const opts = Array.from(selectEl.options);
      if (!opts.length) return;
      let index = selectEl.selectedIndex;
      if (index < 0) index = 0;
      index = Math.max(0, Math.min(opts.length - 1, index + delta));
      setValue(opts[index].value);
      highlightActive();
      scrollSelectedIntoView();
    }

    trigger.addEventListener('click', () => {
      if (menu.hidden) openMenu();
      else closeMenu();
    });

    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (menu.hidden) openMenu();
        else moveSelection(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (menu.hidden) openMenu();
        else moveSelection(-1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        if (selectEl.options.length) setValue(selectEl.options[0].value);
        highlightActive();
        scrollSelectedIntoView();
      } else if (event.key === 'End') {
        event.preventDefault();
        const last = selectEl.options[selectEl.options.length - 1];
        if (last) setValue(last.value);
        highlightActive();
        scrollSelectedIntoView();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (menu.hidden) openMenu();
        else closeMenu();
      } else if (event.key === 'Escape') {
        if (!menu.hidden) {
          event.preventDefault();
          closeMenu();
        }
      }
    });

    wrap.appendChild(trigger);
    wrap.appendChild(menu);
    syncTrigger();
  }

  document.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.custom-select')) return;
    closeAllCustomSelects();
  });

  enhanceGlassSelect(reasoningSelect);
  enhanceGlassSelect(genderSelect);
  enhanceGlassSelect(ageSelect);

  const errorOverlay = document.getElementById('error-overlay');
  const errorOkBtn = document.getElementById('btn-error-ok');
  const errorOpenModelsBtn = document.getElementById('btn-error-open-models');

  async function isMasterModelSelected() {
    const config = await window.electronAPI?.getModelsConfig?.();
    return Array.isArray(config) && config.some((m) => m.isMaster === true);
  }

  function closeErrorPopup() {
    if (errorOverlay) errorOverlay.hidden = true;
  }

  function showMasterRequiredError() {
    if (!errorOverlay) return;
    errorOverlay.hidden = false;
    errorOkBtn?.focus();
  }

  if (errorOkBtn) {
    errorOkBtn.addEventListener('click', closeErrorPopup);
  }

  if (errorOpenModelsBtn) {
    errorOpenModelsBtn.addEventListener('click', () => {
      closeErrorPopup();
      openModelsPopup();
    });
  }

  if (errorOverlay) {
    errorOverlay.addEventListener('click', (e) => {
      if (e.target === errorOverlay) closeErrorPopup();
    });
  }

  async function handleStartDiagnostics() {
    const issue = input?.value?.trim() || '';
    if (!issue) return;

    let hasMaster = false;
    try {
      hasMaster = await isMasterModelSelected();
    } catch (err) {
      console.warn('[app] Failed to read models config:', err);
    }
    if (!hasMaster) {
      showMasterRequiredError();
      return;
    }

    const gender = genderSelect?.value || 'male';
    const age = ageSelect?.value || '30';
    const reasoningLevel = reasoningSelect?.value || 'medium';

    try {
      sessionStorage.setItem('neuroagi:advanceReasoningLevel', reasoningLevel);
    } catch (err) {
      console.warn('Failed to stash reasoning level:', err);
    }

    try {
      await window.electronAPI?.resetUsageTotals?.();
    } catch (err) {
      console.warn('[app] Failed to reset usage totals:', err);
    }

    const query = new URLSearchParams();
    query.set('issue', issue);
    query.set('gender', gender);
    query.set('age', age);
    window.location.href = `screens/advance/index.html?${query}`;
  }

  if (btn) {
    btn.addEventListener('click', () => {
      handleStartDiagnostics();
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
  const settingsOverlay = document.getElementById('settings-overlay');
  const settingsCloseBtn = document.getElementById('btn-settings-close');
  const settingsDevtoolsBtn = document.getElementById('btn-settings-devtools');
  const settingsSaveBtn = document.getElementById('btn-settings-save');
  const settingsTabs = document.querySelectorAll('.settings-tab');
  const openRouterKeyInput = document.getElementById('input-openrouter-key');
  const tavilyKeyInput = document.getElementById('input-tavily-key');
  const testOpenRouterBtn = document.getElementById('btn-test-openrouter');
  const testTavilyBtn = document.getElementById('btn-test-tavily');
  const openRouterStatus = document.getElementById('status-openrouter-key');
  const tavilyStatus = document.getElementById('status-tavily-key');

  function setTestStatus(el, kind, text) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-valid', kind === 'valid');
    el.classList.toggle('is-invalid', kind === 'invalid');
  }

  function clearCredentialTestStatus() {
    setTestStatus(openRouterStatus, '', '');
    setTestStatus(tavilyStatus, '', '');
  }

  function formatTestResult(result) {
    if (result?.ok) return { kind: 'valid', text: 'Valid' };
    const message = (result?.message || '').trim();
    if (!message || message === 'Invalid') return { kind: 'invalid', text: 'Invalid' };
    if (message === 'Enter a key') return { kind: 'invalid', text: 'Invalid — enter a key' };
    return { kind: 'invalid', text: `Invalid — ${message}` };
  }

  async function runKeyTest({ input, button, status, tester }) {
    const apiKey = (input?.value || '').trim();
    if (!apiKey) {
      setTestStatus(status, 'invalid', 'Invalid — enter a key');
      return;
    }
    if (button) button.disabled = true;
    setTestStatus(status, '', 'Testing…');
    try {
      const result = await tester({ apiKey });
      const { kind, text } = formatTestResult(result);
      setTestStatus(status, kind, text);
    } catch (err) {
      console.error('[app] Key test failed:', err?.message || String(err));
      setTestStatus(status, 'invalid', 'Invalid — request failed');
    } finally {
      if (button) button.disabled = false;
    }
  }

  function closeSettingsPopup() {
    if (settingsOverlay) settingsOverlay.hidden = true;
  }

  function selectSettingsTab(tabId) {
    settingsTabs.forEach((tab) => {
      const isActive = tab.dataset.tab === tabId;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    document.querySelectorAll('.settings-pane').forEach((pane) => {
      pane.hidden = pane.id !== `settings-pane-${tabId}`;
    });
  }

  async function fillCredentialsForm() {
    if (!openRouterKeyInput || !tavilyKeyInput) return;
    clearCredentialTestStatus();
    try {
      const creds = await window.electronAPI?.getCredentials?.();
      openRouterKeyInput.value = creds?.OPENROUTER_API_KEY || '';
      tavilyKeyInput.value = creds?.TAVILY_API_KEY || '';
    } catch (err) {
      console.error('[app] Failed to load credentials:', err);
      openRouterKeyInput.value = '';
      tavilyKeyInput.value = '';
    }
  }

  async function openSettingsPopup() {
    if (!settingsOverlay) return;
    selectSettingsTab('credentials');
    await fillCredentialsForm();
    settingsOverlay.hidden = false;
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', openSettingsPopup);
  }

  if (settingsCloseBtn) {
    settingsCloseBtn.addEventListener('click', closeSettingsPopup);
  }

  if (settingsDevtoolsBtn) {
    settingsDevtoolsBtn.addEventListener('click', () => {
      window.electronAPI?.openDevTools?.();
    });
  }

  settingsTabs.forEach((tab) => {
    tab.addEventListener('click', () => selectSettingsTab(tab.dataset.tab));
  });

  if (testOpenRouterBtn) {
    testOpenRouterBtn.addEventListener('click', () => {
      runKeyTest({
        input: openRouterKeyInput,
        button: testOpenRouterBtn,
        status: openRouterStatus,
        tester: (payload) => window.electronAPI?.testOpenRouterKey?.(payload),
      });
    });
  }

  if (testTavilyBtn) {
    testTavilyBtn.addEventListener('click', () => {
      runKeyTest({
        input: tavilyKeyInput,
        button: testTavilyBtn,
        status: tavilyStatus,
        tester: (payload) => window.electronAPI?.testTavilyKey?.(payload),
      });
    });
  }

  if (openRouterKeyInput) {
    openRouterKeyInput.addEventListener('input', () => setTestStatus(openRouterStatus, '', ''));
  }

  if (tavilyKeyInput) {
    tavilyKeyInput.addEventListener('input', () => setTestStatus(tavilyStatus, '', ''));
  }

  if (settingsSaveBtn) {
    settingsSaveBtn.addEventListener('click', async () => {
      settingsSaveBtn.disabled = true;
      settingsSaveBtn.textContent = 'Saving…';
      try {
        await window.electronAPI?.updateCredentials?.({
          OPENROUTER_API_KEY: openRouterKeyInput?.value || '',
          TAVILY_API_KEY: tavilyKeyInput?.value || '',
        });
      } catch (err) {
        console.error('[app] Failed to save credentials:', err);
      } finally {
        settingsSaveBtn.disabled = false;
        settingsSaveBtn.textContent = 'Save';
      }
    });
  }

  if (settingsOverlay) {
    settingsOverlay.addEventListener('click', (e) => {
      if (e.target === settingsOverlay) closeSettingsPopup();
    });
    settingsOverlay.addEventListener('click', (e) => {
      const link = e.target.closest('.settings-ext-link');
      if (!link) return;
      e.preventDefault();
      const url = link.getAttribute('data-external-url');
      if (url) window.electronAPI?.openExternalUrl?.(url);
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

    modelsState.forEach((m) => {
      m.isMaster = false;
    });

    if (!wasMaster) {
      entry.isMaster = true;
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
      if (e.key !== 'Escape') return;
      if (!modelsOverlay.hidden) closeModelsPopup();
      if (errorOverlay && !errorOverlay.hidden) closeErrorPopup();
      if (settingsOverlay && !settingsOverlay.hidden) closeSettingsPopup();
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
