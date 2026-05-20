import { APP_TITLE, SCREEN_QUESTIONNAIRE } from './constants.js';

document.addEventListener('DOMContentLoaded', () => {
  document.title = `${SCREEN_QUESTIONNAIRE} — ${APP_TITLE}`;

  const titleEl = document.getElementById('app-title');
  const screenTitleEl = document.getElementById('screen-title');
  const summaryEl = document.getElementById('summary');

  if (titleEl) titleEl.textContent = APP_TITLE;
  if (screenTitleEl) screenTitleEl.textContent = SCREEN_QUESTIONNAIRE;

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
