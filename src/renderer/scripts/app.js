import {
  APP_TITLE,
  LABEL_START_HUMAN_DIAGNOSTICS
} from './constants.js';

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

  if (btn) {
    btn.addEventListener('click', () => {
      const issue = input?.value?.trim() || '';
      const gender = genderSelect?.value || 'male';
      const age = ageSelect?.value || '30';
      const reasoningLevel = reasoningSelect?.value || 'medium';

      try {
        sessionStorage.setItem('neuroagi:reasoningLevel', reasoningLevel);
      } catch (err) {
        console.warn('Failed to stash reasoning level:', err);
      }

      const query = new URLSearchParams();
      if (issue) query.set('issue', issue);
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
  const modelsBtn      = document.getElementById('btn-models');
  const modelsOverlay  = document.getElementById('models-overlay');
  const modelsList     = document.getElementById('models-list');
  const modelsCloseBtn = document.getElementById('btn-models-close');
  const modelsUpdateBtn = document.getElementById('btn-models-update');

  // Local snapshot of the model list; mutated by toggle interactions.
  let modelsState = [];

  function renderModelsList() {
    if (!modelsList) return;
    modelsList.innerHTML = '';
    for (const model of modelsState) {
      const row = document.createElement('div');
      row.className = 'models-row';
      row.setAttribute('role', 'listitem');

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
      });

      const toggleSlider = document.createElement('span');
      toggleSlider.className = 'models-toggle-slider';
      toggleSlider.setAttribute('aria-hidden', 'true');

      toggleLabel.appendChild(toggleInput);
      toggleLabel.appendChild(toggleSlider);

      row.appendChild(info);
      row.appendChild(toggleLabel);
      modelsList.appendChild(row);
    }
  }

  async function openModelsPopup() {
    if (!modelsOverlay) return;
    try {
      const config = await window.electronAPI?.getModelsConfig?.();
      modelsState = Array.isArray(config) ? config : [];
      renderModelsList();
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
      modelsUpdateBtn.disabled = true;
      modelsUpdateBtn.textContent = 'Saving…';
      try {
        await window.electronAPI?.updateModelsConfig?.({ activeModels });
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
