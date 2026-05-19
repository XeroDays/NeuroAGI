import {
  APP_TITLE,
  LABEL_START_HUMAN_DIAGNOSTICS
} from './constants.js';

document.addEventListener('DOMContentLoaded', () => {
  document.title = APP_TITLE;

  const titleEl = document.getElementById('app-title');
  const input = document.getElementById('health-input');
  const btn = document.getElementById('btn-start-diagnostics');

  if (titleEl) {
    titleEl.textContent = APP_TITLE;
  }

  if (btn) {
    btn.addEventListener('click', () => {
      const issue = input?.value?.trim() || '';
      const params = issue ? `?issue=${encodeURIComponent(issue)}` : '';
      window.location.href = `screens/diagnoses-room/index.html${params}`;
    });
  }
});
