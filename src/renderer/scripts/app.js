import { APP_TITLE } from './constants.js';
import { initReleaseUpdate, isForceUpdateLocked } from './release-update-panel.js';
import { initProfilesPanel } from './profiles-panel.js';
import { openOverlay, closeOverlay } from './ui/overlay-controller.js';
import { ensureFooterStatus, setStatus, closeWithStatusReset } from './ui/status-line.js';

/** Short, user-facing text for a rejected IPC call. */
function errorText(err) {
  const raw = err?.message || String(err || '');
  return raw.replace(/^Error invoking remote method '[^']*':\s*/, '').trim() || 'unknown error';
}

/** Replay a one-shot animation class that may already be present. */
function replayClass(el, className) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

/** Fade the page out, then navigate. Falls back to an immediate jump. */
function navigateWithFade(href) {
  const settled = () => { window.location.href = href; };
  const timer = setTimeout(settled, 220);
  document.body.addEventListener('transitionend', (event) => {
    if (event.target !== document.body || event.propertyName !== 'opacity') return;
    clearTimeout(timer);
    settled();
  }, { once: true });
  document.body.classList.add('is-leaving');
}

document.addEventListener('DOMContentLoaded', () => {
  document.title = APP_TITLE;
  void initReleaseUpdate();
  initProfilesPanel();

  const input = document.getElementById('health-input');
  const btn = document.getElementById('btn-start-diagnostics');
  const nameInput = document.getElementById('input-name');
  const genderSelect = document.getElementById('select-gender');
  const ageInput = document.getElementById('input-age');
  const reasoningSelect = document.getElementById('select-reasoning');
  const nameSuggest = document.getElementById('name-suggest');
  const onboarding = document.getElementById('home-onboarding');

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

  function clampAge(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return 30;
    return Math.max(1, Math.min(100, n));
  }

  function setAge(value) {
    if (ageInput) ageInput.value = String(clampAge(value));
  }

  document.getElementById('btn-age-down')?.addEventListener('click', () => {
    setAge(clampAge(ageInput?.value) - 1);
  });
  document.getElementById('btn-age-up')?.addEventListener('click', () => {
    setAge(clampAge(ageInput?.value) + 1);
  });
  ageInput?.addEventListener('change', () => setAge(ageInput.value));

  function growComposer() {
    if (!input) return;
    input.style.height = 'auto';
    const max = 8 * 24;
    input.style.height = `${Math.min(input.scrollHeight, max)}px`;
  }

  input?.addEventListener('input', growComposer);

  function applyPatient({ name, age, gender, text }) {
    if (nameInput && name) nameInput.value = name;
    if (genderSelect && gender) {
      genderSelect.value = String(gender).toLowerCase() === 'female' ? 'female' : 'male';
      genderSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (age != null) setAge(age);
    if (input && text) {
      input.value = text;
      growComposer();
    }
  }

  function hideNameSuggest() {
    if (!nameSuggest) return;
    nameSuggest.hidden = true;
    nameInput?.setAttribute('aria-expanded', 'false');
  }

  function showNameSuggest(matches) {
    if (!nameSuggest) return;
    nameSuggest.replaceChildren();
    if (!matches.length) {
      hideNameSuggest();
      return;
    }
    for (const profile of matches) {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.textContent = `${profile.name} · ${profile.age} · ${profile.gender}`;
      li.addEventListener('mousedown', (event) => {
        event.preventDefault();
        applyPatient(profile);
        hideNameSuggest();
      });
      nameSuggest.appendChild(li);
    }
    nameSuggest.hidden = false;
    nameInput?.setAttribute('aria-expanded', 'true');
  }

  let knownProfiles = [];

  nameInput?.addEventListener('input', () => {
    const q = nameInput.value.trim().toLowerCase();
    if (q.length < 1) {
      hideNameSuggest();
      return;
    }
    const matches = knownProfiles
      .filter((p) => String(p.name || '').toLowerCase().includes(q))
      .slice(0, 6);
    showNameSuggest(matches);
  });
  nameInput?.addEventListener('blur', () => {
    setTimeout(hideNameSuggest, 120);
  });

  async function refreshHomeProfiles() {
    try {
      const result = await window.electronAPI?.getProfiles?.();
      knownProfiles = Array.isArray(result?.profiles) ? result.profiles : [];
    } catch (err) {
      console.warn('[app] Failed to load profiles:', err);
      knownProfiles = [];
    }
  }

  async function refreshOnboarding() {
    if (!onboarding) return;
    let hasOpenRouter = false;
    let hasTavily = false;
    let hasModel = false;
    try {
      const creds = await window.electronAPI?.getCredentials?.();
      hasOpenRouter = Boolean(String(creds?.OPENROUTER_API_KEY || '').trim());
      hasTavily = Boolean(String(creds?.TAVILY_API_KEY || '').trim());
    } catch (err) {
      console.warn('[app] Failed to read credentials for onboarding:', err);
    }
    try {
      hasModel = await hasEnabledModel();
    } catch (err) {
      console.warn('[app] Failed to read models for onboarding:', err);
    }
    const steps = [
      { ok: hasOpenRouter, label: 'Add an OpenRouter key', action: 'settings' },
      { ok: hasTavily, label: 'Add a Tavily key', action: 'settings' },
      { ok: hasModel, label: 'Enable one model', action: 'models' },
    ];
    if (steps.every((step) => step.ok)) {
      onboarding.hidden = true;
      onboarding.replaceChildren();
      return;
    }
    onboarding.hidden = false;
    onboarding.replaceChildren();
    const title = document.createElement('p');
    title.className = 'home-onboarding-title';
    title.textContent = 'Before the first analysis';
    onboarding.appendChild(title);
    for (const step of steps) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `home-onboarding-step${step.ok ? ' is-done' : ''}`;
      item.textContent = step.ok ? `Done — ${step.label}` : step.label;
      item.disabled = step.ok;
      item.addEventListener('click', () => {
        if (step.action === 'models') openModelsPopup();
        else openSettingsPopup();
      });
      onboarding.appendChild(item);
    }
  }

  void refreshHomeProfiles();
  void refreshOnboarding();

  const errorOverlay = document.getElementById('error-overlay');
  const errorOkBtn = document.getElementById('btn-error-ok');
  const errorOpenModelsBtn = document.getElementById('btn-error-open-models');

  async function hasEnabledModel() {
    const config = await window.electronAPI?.getModelsConfig?.();
    return Array.isArray(config) && config.some((m) => m.enabled === true);
  }

  function closeErrorPopup() {
    closeOverlay(errorOverlay);
  }

  function showEnableModelError() {
    openOverlay(errorOverlay, { initialFocus: errorOkBtn, closeOnBackdrop: true });
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

  let startingDiagnostics = false;

  async function handleStartDiagnostics() {
    if (isForceUpdateLocked() || startingDiagnostics) return;

    const issue = input?.value?.trim() || '';
    if (!issue) {
      replayClass(input, 'motion-shake');
      input?.focus();
      return;
    }

    const name = nameInput?.value?.trim() || '';
    if (!name) {
      replayClass(nameInput, 'motion-shake');
      nameInput?.focus();
      return;
    }

    startingDiagnostics = true;
    btn?.classList.add('is-busy');

    let hasEnabled = false;
    try {
      hasEnabled = await hasEnabledModel();
    } catch (err) {
      console.warn('[app] Failed to read models config:', err);
    }
    if (!hasEnabled) {
      startingDiagnostics = false;
      btn?.classList.remove('is-busy');
      showEnableModelError();
      return;
    }

    const gender = genderSelect?.value || 'male';
    const age = String(clampAge(ageInput?.value));
    const reasoningLevel = reasoningSelect?.value || 'very_high';

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
    query.set('name', name);
    query.set('gender', gender);
    query.set('age', age);
    navigateWithFade(`screens/advance/index.html?${query}`);
  }

  if (btn) {
    btn.addEventListener('click', () => {
      handleStartDiagnostics();
    });
  }

  if (input && btn) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
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
  const settingsFooterStatus = ensureFooterStatus(
    settingsOverlay?.querySelector('.settings-modal-footer'),
    'settings-footer-status',
    settingsCloseBtn,
  );

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
    closeWithStatusReset(settingsOverlay, settingsFooterStatus);
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
      setStatus(settingsFooterStatus, 'Could not read saved keys.', { tone: 'error' });
    }
    try {
      const storage = await window.electronAPI?.getStorageWarning?.();
      if (storage?.warning) setStatus(settingsFooterStatus, storage.warning, { tone: 'error' });
    } catch (err) {
      console.warn('[app] storage warning failed:', err);
    }
  }

  async function openSettingsPopup() {
    if (isForceUpdateLocked()) return;
    if (!settingsOverlay) return;
    selectSettingsTab('credentials');
    setStatus(settingsFooterStatus, '');
    await fillCredentialsForm();
    openOverlay(settingsOverlay, { initialFocus: openRouterKeyInput });
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
      setStatus(settingsFooterStatus, 'Saving keys…', { tone: 'busy' });
      try {
        await window.electronAPI?.updateCredentials?.({
          OPENROUTER_API_KEY: openRouterKeyInput?.value || '',
          TAVILY_API_KEY: tavilyKeyInput?.value || '',
        });
        closeSettingsPopup();
        void refreshOnboarding();
      } catch (err) {
        console.error('[app] Failed to save credentials:', err);
        setStatus(settingsFooterStatus, `Save failed — ${errorText(err)}`, { tone: 'error' });
      } finally {
        settingsSaveBtn.disabled = false;
        settingsSaveBtn.textContent = 'Save';
      }
    });
  }

  if (settingsOverlay) {
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
  const modelsTestBtn   = document.getElementById('btn-models-test');
  const modelsAddBtn    = document.getElementById('btn-models-add');
  const modelsAddInput  = document.getElementById('input-models-add');
  const modelsTabs      = document.querySelectorAll('.models-tab');
  const modelsFooterStatus = ensureFooterStatus(
    modelsOverlay?.querySelector('.models-modal-footer'),
    'models-footer-status',
    modelsTestBtn,
  );

  // Local snapshot of the model list; mutated by toggle/star interactions.
  let modelsState = [];
  let modelsBenchmarkRunning = false;
  let modelsProbingName = '';

  function parseModelLabels(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return [];
    return raw.split(';').map((s) => s.trim()).filter(Boolean);
  }

  function createErrorChip(note) {
    const chip = document.createElement('span');
    chip.className = 'models-error-chip';
    chip.textContent = 'Error';
    const text = typeof note === 'string' && note.trim() ? note : 'Probe failed.';
    chip.title = text;
    chip.dataset.error = text;
    chip.tabIndex = 0;
    return chip;
  }

  function setProbingName(name) {
    modelsProbingName = typeof name === 'string' ? name : '';
    const lists = [modelsListFree, modelsListPaid];
    for (const list of lists) {
      if (!list) continue;
      for (const row of list.querySelectorAll('.models-row')) {
        const spinner = row.querySelector('.models-probe-spinner');
        if (spinner) {
          spinner.classList.toggle('is-probing', row.dataset.modelName === modelsProbingName);
        }
      }
    }
  }

  function upsertErrorChip(modelName, note) {
    const row = findModelsRow(modelName);
    if (!row) return;
    const info = row.querySelector('.models-row-info');
    if (!info) return;
    let chip = info.querySelector('.models-error-chip');
    if (!chip) {
      chip = createErrorChip(note);
      const typeBadge = info.querySelector('.models-type-badge');
      if (typeBadge) typeBadge.insertAdjacentElement('afterend', chip);
      else info.appendChild(chip);
    } else {
      const text = typeof note === 'string' && note.trim() ? note : 'Probe failed.';
      chip.title = text;
      chip.dataset.error = text;
    }
  }

  function clearErrorChip(modelName) {
    const row = findModelsRow(modelName);
    if (!row) return;
    const chip = row.querySelector('.models-error-chip');
    if (chip) chip.remove();
  }

  async function deleteModelRow(modelName) {
    try {
      const result = await window.electronAPI?.deleteModel?.({ name: modelName });
      if (!result?.ok) {
        console.error('[app] Delete model failed:', result?.error || 'unknown error');
        setStatus(modelsFooterStatus, `Could not remove ${modelName} — ${result?.error || 'unknown error'}`, { tone: 'error' });
        return;
      }
      modelsState = modelsState.filter((m) => m.name !== modelName);
      if (modelsProbingName === modelName) modelsProbingName = '';
      renderModelsList();
      setStatus(modelsFooterStatus, `Removed ${modelName}.`, { tone: 'success', autoClearMs: 4000 });
    } catch (err) {
      console.error('[app] Delete model failed:', err);
      setStatus(modelsFooterStatus, `Could not remove ${modelName} — ${errorText(err)}`, { tone: 'error' });
    }
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
    scheduleModelsSave();
  }

  // Build a single panel's rows from a filtered slice of modelsState.
  function renderTabPanel(container, models) {
    if (!container) return;
    container.innerHTML = '';
    for (const model of models) {
      const row = document.createElement('div');
      row.className = 'models-row';
      row.setAttribute('role', 'listitem');
      row.dataset.modelName = model.name;

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

      const spinner = document.createElement('span');
      spinner.className = 'models-probe-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      if (model.name === modelsProbingName) spinner.classList.add('is-probing');

      const nameSpan = document.createElement('span');
      nameSpan.className = 'models-row-name';
      nameSpan.textContent = model.name;

      const typeBadge = document.createElement('span');
      typeBadge.className = `models-type-badge models-type-badge--${model.type.toLowerCase()}`;
      typeBadge.textContent = model.type;

      info.appendChild(spinner);
      info.appendChild(nameSpan);
      info.appendChild(typeBadge);

      if (model.probeError) {
        info.appendChild(createErrorChip(model.probeError));
      }

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
        scheduleModelsSave();
      });

      const toggleSlider = document.createElement('span');
      toggleSlider.className = 'models-toggle-slider';
      toggleSlider.setAttribute('aria-hidden', 'true');

      toggleLabel.appendChild(toggleInput);
      toggleLabel.appendChild(toggleSlider);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'models-delete-btn';
      deleteBtn.setAttribute('aria-label', `Delete ${model.name}`);
      deleteBtn.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>';
      deleteBtn.addEventListener('click', () => deleteModelRow(model.name));

      row.appendChild(starBtn);
      row.appendChild(info);
      row.appendChild(deleteBtn);
      row.appendChild(toggleLabel);
      container.appendChild(row);
    }
  }

  /** Snapshot of the saved selection, used to flag unsaved toggles. */
  let modelsSavedSignature = '';
  /** Suppresses the count pop on the first paint after the popup opens. */
  let modelsCountsSettled = false;

  function modelsSignature() {
    const enabled = modelsState.filter((m) => m.enabled).map((m) => m.name).sort();
    const master = modelsState.find((m) => m.isMaster)?.name || '';
    return JSON.stringify({ enabled, master });
  }

  function syncModelsDirtyState() {
    if (!modelsUpdateBtn) return;
    modelsUpdateBtn.classList.toggle('has-changes', modelsSignature() !== modelsSavedSignature);
  }

  // Update the enabled-count badge on each tab button.
  function updateTabCounts() {
    const freeEnabled = modelsState.filter(m => m.type.toLowerCase() === 'free' && m.enabled).length;
    const freeTotal   = modelsState.filter(m => m.type.toLowerCase() === 'free').length;
    const paidEnabled = modelsState.filter(m => m.type.toLowerCase() === 'paid' && m.enabled).length;
    const paidTotal   = modelsState.filter(m => m.type.toLowerCase() === 'paid').length;

    modelsTabs.forEach((tab) => {
      const next = tab.dataset.tab === 'free'
        ? `Free (${freeEnabled}/${freeTotal})`
        : `Paid (${paidEnabled}/${paidTotal})`;
      if (tab.textContent === next) return;
      tab.textContent = next;
      if (modelsCountsSettled) replayClass(tab, 'is-bumped');
    });

    modelsCountsSettled = true;
    syncModelsDirtyState();
  }

  // Render both panels and refresh tab counts.
  const modelsFilterInput = document.getElementById('input-models-filter');
  let modelsFilter = '';

  function modelsMatching(type) {
    const q = modelsFilter.trim().toLowerCase();
    return modelsState.filter((m) => {
      if (m.type.toLowerCase() !== type) return false;
      if (!q) return true;
      return String(m.name || '').toLowerCase().includes(q);
    });
  }

  function renderModelsList() {
    renderTabPanel(modelsListFree, modelsMatching('free'));
    renderTabPanel(modelsListPaid, modelsMatching('paid'));
    updateTabCounts();
  }

  let modelsSaveTimer = 0;

  async function persistModels({ close = false } = {}) {
    const activeModels = modelsState.filter((m) => m.enabled).map((m) => m.name);
    const masterModel = modelsState.find((m) => m.isMaster)?.name ?? '';
    if (modelsUpdateBtn) {
      modelsUpdateBtn.disabled = true;
      modelsUpdateBtn.textContent = 'Saving…';
    }
    setStatus(modelsFooterStatus, 'Saving selection…', { tone: 'busy' });
    try {
      await window.electronAPI?.updateModelsConfig?.({ activeModels, masterModel });
      modelsSavedSignature = modelsSignature();
      syncModelsDirtyState();
      setStatus(modelsFooterStatus, close ? '' : 'Saved.', { tone: 'success', autoClearMs: 2000 });
      if (close) closeModelsPopup();
      void refreshOnboarding();
    } catch (err) {
      console.error('[app] Failed to update models config:', err);
      setStatus(modelsFooterStatus, `Save failed — ${errorText(err)}`, { tone: 'error' });
    } finally {
      if (modelsUpdateBtn) {
        modelsUpdateBtn.disabled = false;
        modelsUpdateBtn.textContent = 'Update';
      }
    }
  }

  function scheduleModelsSave() {
    clearTimeout(modelsSaveTimer);
    modelsSaveTimer = setTimeout(() => { void persistModels(); }, 250);
  }

  modelsFilterInput?.addEventListener('input', () => {
    modelsFilter = modelsFilterInput.value || '';
    renderModelsList();
  });

  function findModelsRow(modelName) {
    const lists = [modelsListFree, modelsListPaid];
    for (const list of lists) {
      if (!list) continue;
      for (const row of list.querySelectorAll('.models-row')) {
        if (row.dataset.modelName === modelName) return row;
      }
    }
    return null;
  }

  function upsertMetricBadge(info, className, text, insertAfter) {
    if (!info || !text) return null;
    let badge = info.querySelector(`.${className}`);
    if (!badge) {
      badge = document.createElement('span');
      badge.className = className;
      if (insertAfter && insertAfter.parentNode === info) {
        insertAfter.insertAdjacentElement('afterend', badge);
      } else {
        const typeBadge = info.querySelector('.models-type-badge');
        if (typeBadge) typeBadge.insertAdjacentElement('afterend', badge);
        else info.appendChild(badge);
      }
    }
    badge.textContent = text;
    replayClass(badge, 'motion-pop');
    return badge;
  }

  function refreshModelMetricBadges(modelName, latency, throughput) {
    const row = findModelsRow(modelName);
    if (!row) return;
    const info = row.querySelector('.models-row-info');
    if (!info) return;
    const typeBadge = info.querySelector('.models-type-badge');
    const latencyBadge = upsertMetricBadge(info, 'models-latency-badge', latency, typeBadge);
    upsertMetricBadge(
      info,
      'models-throughput-badge',
      throughput,
      latencyBadge || typeBadge
    );
  }

  function getActiveModelsTabType() {
    const activeTab = document.querySelector('.models-tab.is-active');
    return activeTab?.dataset.tab === 'paid' ? 'Paid' : 'Free';
  }

  function hideModelsAddInput() {
    if (modelsAddInput) {
      modelsAddInput.value = '';
      modelsAddInput.hidden = true;
    }
    if (modelsAddBtn) modelsAddBtn.hidden = false;
  }

  function showModelsAddInput() {
    if (!modelsAddInput || !modelsAddBtn) return;
    modelsAddBtn.hidden = true;
    modelsAddInput.hidden = false;
    modelsAddInput.value = '';
    modelsAddInput.focus();
  }

  async function confirmModelsAdd() {
    if (!modelsAddInput) return;
    const name = modelsAddInput.value.trim();
    if (!name) {
      hideModelsAddInput();
      return;
    }
    try {
      const result = await window.electronAPI?.addModel?.({
        name,
        type: getActiveModelsTabType(),
      });
      if (!result?.ok) {
        console.error('[app] Add model failed:', result?.error || 'unknown error');
        setStatus(modelsFooterStatus, result?.error || 'Could not add that model.', { tone: 'error' });
        modelsAddInput.classList.remove('motion-shake');
        void modelsAddInput.offsetWidth;
        modelsAddInput.classList.add('motion-shake');
        modelsAddInput.focus();
        return;
      }
      if (result.model && !modelsState.some((m) => m.name === result.model.name)) {
        modelsState.push(result.model);
        renderModelsList();
      }
      setStatus(modelsFooterStatus, `Added ${name}.`, { tone: 'success', autoClearMs: 4000 });
      hideModelsAddInput();
    } catch (err) {
      console.error('[app] Add model failed:', err);
      setStatus(modelsFooterStatus, `Could not add that model — ${errorText(err)}`, { tone: 'error' });
    }
  }

  function setModelsTestIdle() {
    modelsBenchmarkRunning = false;
    setProbingName('');
    if (!modelsTestBtn) return;
    modelsTestBtn.disabled = false;
    modelsTestBtn.textContent = 'Test latency';
  }

  function applyBenchmarkProgress(payload) {
    if (!payload || typeof payload !== 'object') return;
    const { name, status, latency, throughput, index, total, note } = payload;

    if (modelsTestBtn && modelsBenchmarkRunning && Number.isFinite(index) && Number.isFinite(total)) {
      modelsTestBtn.textContent = `Testing ${index}/${total}…`;
    }

    if (status === 'running') {
      setProbingName(name);
      return;
    }

    if (status === 'ok') {
      if (modelsProbingName === name) setProbingName('');
      const entry = modelsState.find((m) => m.name === name);
      if (entry) {
        if (typeof latency === 'string') entry.latency = latency;
        if (typeof throughput === 'string') entry.throughput = throughput;
        entry.probeError = '';
        refreshModelMetricBadges(name, entry.latency, entry.throughput);
        clearErrorChip(name);
      }
      return;
    }

    if (status === 'error') {
      if (modelsProbingName === name) setProbingName('');
      const entry = modelsState.find((m) => m.name === name);
      if (entry) {
        entry.probeError = typeof note === 'string' ? note : 'Probe failed.';
        upsertErrorChip(name, entry.probeError);
      }
    }
  }

  if (typeof window.electronAPI?.onBenchmarkProgress === 'function') {
    window.electronAPI.onBenchmarkProgress(applyBenchmarkProgress);
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
    if (isForceUpdateLocked()) return;
    if (!modelsOverlay) return;
    setStatus(modelsFooterStatus, '');
    try {
      const config = await window.electronAPI?.getModelsConfig?.();
      modelsState = Array.isArray(config) ? config : [];
      modelsSavedSignature = modelsSignature();
      modelsCountsSettled = false;
      renderModelsList();
      switchTab('free'); // always open on Free tab
      hideModelsAddInput();
      openOverlay(modelsOverlay, {
        initialFocus: '.models-tab.is-active',
        closeOnBackdrop: true,
        // Escape first dismisses the inline "add model" field.
        onEscape: () => {
          if (modelsAddInput && !modelsAddInput.hidden) {
            hideModelsAddInput();
            return false;
          }
        },
      });
    } catch (err) {
      console.error('[app] Failed to load models config:', err);
    }
  }

  function closeModelsPopup() {
    hideModelsAddInput();
    closeWithStatusReset(modelsOverlay, modelsFooterStatus);
  }

  if (modelsBtn) {
    modelsBtn.addEventListener('click', openModelsPopup);
  }

  if (modelsCloseBtn) {
    modelsCloseBtn.addEventListener('click', closeModelsPopup);
  }

  if (modelsUpdateBtn) {
    modelsUpdateBtn.addEventListener('click', async () => {
      await persistModels({ close: true });
    });
  }

  if (modelsTestBtn) {
    modelsTestBtn.addEventListener('click', async () => {
      if (modelsBenchmarkRunning) return;
      modelsBenchmarkRunning = true;
      modelsTestBtn.disabled = true;
      modelsTestBtn.textContent = 'Testing…';
      setStatus(modelsFooterStatus, '');
      try {
        const result = await window.electronAPI?.benchmarkModels?.({
          type: getActiveModelsTabType(),
        });
        if (!result?.ok) {
          console.error('[app] Latency test failed:', result?.error || 'unknown error');
          setStatus(modelsFooterStatus, result?.error || 'Latency test failed.', { tone: 'error' });
        }
      } catch (err) {
        console.error('[app] Latency test failed:', err);
        setStatus(modelsFooterStatus, `Latency test failed — ${errorText(err)}`, { tone: 'error' });
      } finally {
        setModelsTestIdle();
      }
    });
  }

  if (modelsAddBtn) {
    modelsAddBtn.addEventListener('click', () => showModelsAddInput());
  }

  if (modelsAddInput) {
    // Escape is handled by the overlay controller's onEscape hook.
    modelsAddInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      confirmModelsAdd();
    });
  }
});
