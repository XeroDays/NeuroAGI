import {
  APP_TITLE,
  LABEL_START_HUMAN_DIAGNOSTICS
} from './constants.js';

document.addEventListener('DOMContentLoaded', () => {
  document.title = APP_TITLE;

  const titleEl = document.getElementById('app-title');
  const btn = document.getElementById('btn-start-diagnostics');

  if (titleEl) {
    titleEl.textContent = APP_TITLE;
  }

  if (btn) {
    btn.textContent = LABEL_START_HUMAN_DIAGNOSTICS;
    btn.addEventListener('click', () => {
      window.location.href = 'diagnoses-room.html';
    });
  }
});
