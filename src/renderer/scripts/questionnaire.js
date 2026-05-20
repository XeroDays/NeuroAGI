import { APP_TITLE, SCREEN_QUESTIONNAIRE } from './constants.js';

document.addEventListener('DOMContentLoaded', async () => {
  document.title = `${SCREEN_QUESTIONNAIRE} — ${APP_TITLE}`;

  const titleEl = document.getElementById('app-title');
  const screenTitleEl = document.getElementById('screen-title');
  const summaryEl = document.getElementById('summary');
  const statusEl = document.getElementById('q-status');
  const formEl = document.getElementById('q-form');
  const actionsEl = document.getElementById('q-actions');
  const submitBtn = document.getElementById('q-submit');

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

  if (!window.electronAPI?.startReportCollection) {
    showError('Internal error: report collector not available.');
    return;
  }

  try {
    const result = await window.electronAPI.startReportCollection({ issue, gender, age });
    if (!result || !result.ok) {
      throw new Error(result?.error || 'Failed to load questions.');
    }
    const questions = Array.isArray(result.questions) ? result.questions : [];
    if (questions.length === 0) {
      showError('No questions were returned. Please try again.');
      return;
    }
    renderQuestions(questions);
    statusEl.hidden = true;
    formEl.hidden = false;
    actionsEl.hidden = false;
  } catch (err) {
    console.error('Failed to load questionnaire:', err);
    showError(err?.message || String(err));
  }

  submitBtn?.addEventListener('click', () => {
    const answers = collectAnswers(formEl);
    console.log('Questionnaire submitted:', { issue, gender, age, answers });
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitted';
  });

  function showError(msg) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.add('q-status--error');
    statusEl.hidden = false;
    formEl.hidden = true;
    actionsEl.hidden = true;
  }
});

function renderQuestions(questions) {
  const formEl = document.getElementById('q-form');
  formEl.innerHTML = '';
  questions.forEach((q, i) => {
    const card = buildCard(q, i);
    if (card) formEl.appendChild(card);
  });
}

function buildCard(q, i) {
  const type = String(q?.type || '').toLowerCase();
  const questionText = String(q?.question || `Question ${i + 1}`);
  const fieldName = `q_${i}`;

  const card = document.createElement('section');
  card.className = `q-card q-card--${type}`;
  card.dataset.index = String(i);
  card.dataset.type = type;
  card.dataset.question = questionText;

  const h = document.createElement('h2');
  h.className = 'q-question';
  h.textContent = questionText;
  card.appendChild(h);

  switch (type) {
    case 'single_select':
      card.appendChild(renderSingleSelect(q, fieldName));
      break;
    case 'multi_select':
      card.appendChild(renderMultiSelect(q, fieldName));
      break;
    case 'slider':
      card.appendChild(renderSlider(q, fieldName));
      break;
    case 'range':
      card.appendChild(renderRange(q, fieldName));
      break;
    case 'text':
      card.appendChild(renderText(q, fieldName));
      break;
    default:
      card.appendChild(renderText(q, fieldName));
  }
  return card;
}

function renderSingleSelect(q, name) {
  const wrap = document.createElement('div');
  wrap.className = 'q-options';
  const options = Array.isArray(q?.options) ? q.options : [];

  options.forEach((opt, idx) => {
    const optStr = String(opt);
    const isOther = optStr.trim().toLowerCase() === 'other';
    const id = `${name}_${idx}`;

    const label = document.createElement('label');
    label.className = 'q-option';
    label.htmlFor = id;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = name;
    radio.id = id;
    radio.value = optStr;
    radio.dataset.isOther = isOther ? '1' : '0';
    label.appendChild(radio);

    if (isOther) {
      const text = document.createElement('input');
      text.type = 'text';
      text.className = 'q-other-input';
      text.placeholder = 'Other (please specify)';
      text.dataset.otherFor = name;
      text.addEventListener('focus', () => {
        radio.checked = true;
      });
      text.addEventListener('input', () => {
        radio.checked = true;
        radio.value = text.value || 'Other';
      });
      label.appendChild(text);
    } else {
      const span = document.createElement('span');
      span.className = 'q-option-label';
      span.textContent = optStr;
      label.appendChild(span);
    }
    wrap.appendChild(label);
  });
  return wrap;
}

function renderMultiSelect(q, name) {
  const wrap = document.createElement('div');
  wrap.className = 'q-options';
  const options = Array.isArray(q?.options) ? q.options : [];

  options.forEach((opt, idx) => {
    const optStr = String(opt);
    const id = `${name}_${idx}`;

    const label = document.createElement('label');
    label.className = 'q-option';
    label.htmlFor = id;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.name = name;
    cb.id = id;
    cb.value = optStr;
    label.appendChild(cb);

    const span = document.createElement('span');
    span.className = 'q-option-label';
    span.textContent = optStr;
    label.appendChild(span);

    wrap.appendChild(label);
  });
  return wrap;
}

function renderSlider(q, name) {
  const min = numberOr(q?.min, 0);
  const max = numberOr(q?.max, 10);
  const step = numberOr(q?.step, 1);
  const initial = Math.round((min + max) / 2);
  const labels = q?.labels || {};

  const wrap = document.createElement('div');
  wrap.className = 'q-slider';

  const track = document.createElement('div');
  track.className = 'q-slider-track';

  const input = document.createElement('input');
  input.type = 'range';
  input.name = name;
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(initial);

  const valueEl = document.createElement('span');
  valueEl.className = 'q-slider-value';
  valueEl.textContent = String(initial);

  input.addEventListener('input', () => {
    valueEl.textContent = input.value;
  });

  track.appendChild(input);
  track.appendChild(valueEl);
  wrap.appendChild(track);

  const labelRow = document.createElement('div');
  labelRow.className = 'q-slider-labels';
  const minSpan = document.createElement('span');
  minSpan.textContent = labels.min ? `${min} — ${labels.min}` : String(min);
  const maxSpan = document.createElement('span');
  maxSpan.textContent = labels.max ? `${labels.max} — ${max}` : String(max);
  labelRow.appendChild(minSpan);
  labelRow.appendChild(maxSpan);
  wrap.appendChild(labelRow);

  return wrap;
}

function renderRange(q, name) {
  const min = numberOr(q?.min, 0);
  const max = numberOr(q?.max, 100);
  const step = numberOr(q?.step, 1);

  const wrap = document.createElement('div');
  wrap.className = 'q-range';
  wrap.dataset.rangeFor = name;

  const makeRow = (suffix, initial, label) => {
    const row = document.createElement('div');
    row.className = 'q-range-row';

    const rowLabel = document.createElement('span');
    rowLabel.className = 'q-range-row-label';
    rowLabel.textContent = label;

    const input = document.createElement('input');
    input.type = 'range';
    input.name = `${name}_${suffix}`;
    input.dataset.rangeSuffix = suffix;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(initial);

    const valueEl = document.createElement('span');
    valueEl.className = 'q-range-row-value';
    valueEl.textContent = String(initial);

    input.addEventListener('input', () => {
      valueEl.textContent = input.value;
    });

    row.appendChild(rowLabel);
    row.appendChild(input);
    row.appendChild(valueEl);
    return row;
  };

  wrap.appendChild(makeRow('min', min, 'Min'));
  wrap.appendChild(makeRow('max', max, 'Max'));
  return wrap;
}

function renderText(q, name) {
  const ta = document.createElement('textarea');
  ta.className = 'q-text-input';
  ta.name = name;
  ta.placeholder = q?.placeholder || 'Type your answer…';
  return ta;
}

function numberOr(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function collectAnswers(formEl) {
  const cards = formEl.querySelectorAll('.q-card');
  const answers = [];
  cards.forEach((card) => {
    const type = card.dataset.type;
    const question = card.dataset.question;
    const idx = card.dataset.index;
    const name = `q_${idx}`;
    let value = null;

    switch (type) {
      case 'single_select': {
        const checked = card.querySelector(`input[name="${name}"]:checked`);
        if (checked) {
          if (checked.dataset.isOther === '1') {
            const txt = card.querySelector(`input[data-other-for="${name}"]`);
            value = (txt?.value || '').trim() || 'Other';
          } else {
            value = checked.value;
          }
        }
        break;
      }
      case 'multi_select': {
        const checked = card.querySelectorAll(`input[name="${name}"]:checked`);
        value = Array.from(checked).map((el) => el.value);
        break;
      }
      case 'slider': {
        const input = card.querySelector(`input[name="${name}"]`);
        value = input ? Number(input.value) : null;
        break;
      }
      case 'range': {
        const minEl = card.querySelector(`input[name="${name}_min"]`);
        const maxEl = card.querySelector(`input[name="${name}_max"]`);
        const minV = minEl ? Number(minEl.value) : null;
        const maxV = maxEl ? Number(maxEl.value) : null;
        value = {
          min: Math.min(minV, maxV),
          max: Math.max(minV, maxV),
        };
        break;
      }
      case 'text':
      default: {
        const ta = card.querySelector(`textarea[name="${name}"]`);
        value = (ta?.value || '').trim();
        break;
      }
    }
    answers.push({ question, type, value });
  });
  return answers;
}
