import {
  APP_TITLE,
  LABEL_START_HUMAN_DIAGNOSTICS
} from './constants.js';

document.addEventListener('DOMContentLoaded', () => {
  document.title = APP_TITLE;

  const titleEl = document.getElementById('app-title');
  const input = document.getElementById('health-input');
  const btn = document.getElementById('btn-start-diagnostics');
  const genderSelect = document.getElementById('select-gender');
  const ageSelect = document.getElementById('select-age');

  if (titleEl) {
    titleEl.textContent = APP_TITLE;
  }

  if (ageSelect) {
    for (let i = 1; i <= 100; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${i} years`;
      if (i === 30) opt.selected = true;
      ageSelect.appendChild(opt);
    }
  }

  if (btn) {
    btn.addEventListener('click', async () => {
      const issue = input?.value?.trim() || '';
      const gender = genderSelect?.value || 'male';
      const age = ageSelect?.value || '30';

      try {
        await window.electronAPI?.startReportCollection?.({ issue, gender, age });
      } catch (err) {
        console.error('startReportCollection failed:', err);
      }

      const query = new URLSearchParams();
      if (issue) query.set('issue', issue);
      query.set('gender', gender);
      query.set('age', age);
      window.location.href = `screens/diagnoses-room/index.html?${query}`;
    });
  }
});
