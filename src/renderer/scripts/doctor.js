import { APP_TITLE, SCREEN_DOCTOR } from './constants.js';

document.addEventListener('DOMContentLoaded', () => {
  document.title = `${SCREEN_DOCTOR} — ${APP_TITLE}`;

  const titleEl = document.getElementById('app-title');
  const screenTitleEl = document.getElementById('screen-title');
  const summaryEl = document.getElementById('summary');

  if (titleEl) titleEl.textContent = APP_TITLE;
  if (screenTitleEl) screenTitleEl.textContent = SCREEN_DOCTOR;

  const params = new URLSearchParams(window.location.search);
  const issue = params.get('issue') || '';
  const gender = params.get('gender') || 'male';
  const age = params.get('age') || '30';

  if (summaryEl) {
    summaryEl.textContent = issue
      ? `${age}-year-old ${gender} — ${issue}`
      : `${age}-year-old ${gender}`;
  }
});
