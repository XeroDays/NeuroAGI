import { APP_TITLE, SCREEN_DIAGNOSES_ROOM } from './constants.js';

document.addEventListener('DOMContentLoaded', () => {
  document.title = `${SCREEN_DIAGNOSES_ROOM} — ${APP_TITLE}`;

  const titleEl = document.getElementById('app-title');
  const screenTitleEl = document.getElementById('screen-title');

  if (titleEl) {
    titleEl.textContent = APP_TITLE;
  }
  if (screenTitleEl) {
    screenTitleEl.textContent = SCREEN_DIAGNOSES_ROOM;
  }
});
