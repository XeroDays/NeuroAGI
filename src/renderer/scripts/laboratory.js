import { APP_TITLE, SCREEN_LABORATORY } from './constants.js';

document.addEventListener('DOMContentLoaded', async () => {
  document.title = `${SCREEN_LABORATORY} — ${APP_TITLE}`;

  const titleEl = document.getElementById('app-title');
  const screenTitleEl = document.getElementById('screen-title');
  const summaryEl = document.getElementById('summary');
  const statusEl = document.getElementById('q-status');
  const formEl = document.getElementById('q-form');
  const actionsEl = document.getElementById('q-actions');
  const submitBtn = document.getElementById('q-submit');

  if (titleEl) titleEl.textContent = APP_TITLE;
  if (screenTitleEl) screenTitleEl.textContent = SCREEN_LABORATORY;

  const params = new URLSearchParams(window.location.search);
  const issue = params.get('issue') || '';
  const gender = params.get('gender') || 'male';
  const age = params.get('age') || '30';

  if (summaryEl) {
    const demoSpan = document.createElement('span');
    demoSpan.className = 'patient-summary__demo';
    demoSpan.textContent = `${age}-year-old ${gender}`;
    summaryEl.innerHTML = '';
    summaryEl.appendChild(demoSpan);

    if (issue) {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'patient-summary__toggle';
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.innerHTML = '<span>Patient Query</span>'
        + '<svg class="patient-summary__arrow" width="12" height="12" viewBox="0 0 12 12"'
        + ' fill="none" xmlns="http://www.w3.org/2000/svg">'
        + '<path d="M2 4L6 8L10 4" stroke="currentColor" stroke-width="1.5"'
        + ' stroke-linecap="round" stroke-linejoin="round"/></svg>';

      const queryDiv = document.createElement('div');
      queryDiv.className = 'patient-summary__query';
      queryDiv.hidden = true;
      queryDiv.textContent = issue;

      toggleBtn.addEventListener('click', () => {
        const isOpen = !queryDiv.hidden;
        queryDiv.hidden = isOpen;
        toggleBtn.setAttribute('aria-expanded', String(!isOpen));
        toggleBtn.classList.toggle('is-open', !isOpen);
      });

      summaryEl.appendChild(toggleBtn);
      summaryEl.appendChild(queryDiv);
    }
  }

  if (!window.electronAPI?.gotoLaboratory) {
    showError('Internal error: laboratory service not available.');
    return;
  }

  let intake = null;
  try {
    const raw = sessionStorage.getItem('neuroagi:questionnaire');
    if (raw) intake = JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to read questionnaire from sessionStorage:', e);
  }

  if (!intake || !Array.isArray(intake.questions) || !Array.isArray(intake.answers)) {
    showError('Missing questionnaire data. Please restart from the home screen.');
    return;
  }

  let loadedQuestions = [];

  try {
    const result = await window.electronAPI.gotoLaboratory({
      issue,
      gender,
      age,
      questions: intake.questions,
      answers: intake.answers,
    });
    if (!result || !result.ok) {
      throw new Error(result?.error || 'Failed to load laboratory tests.');
    }
    const questions = Array.isArray(result.questions) ? result.questions : [];
    if (questions.length === 0) {
      showError('No laboratory tests were returned. Please try again.');
      return;
    }
    loadedQuestions = questions;
    renderQuestions(questions);
    statusEl.hidden = true;
    formEl.hidden = false;
    actionsEl.hidden = false;
  } catch (err) {
    console.error('Failed to load laboratory:', err);
    showError(humanizeError(err));
  }

  submitBtn?.addEventListener('click', async () => {
    const answers = collectAnswers(formEl);
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
    try {
      await window.electronAPI?.submitLaboratory?.({
        issue,
        gender,
        age,
        questions: loadedQuestions,
        answers,
      });
      try {
        sessionStorage.setItem(
          'neuroagi:laboratory',
          JSON.stringify({
            issue,
            gender,
            age,
            questions: loadedQuestions,
            answers,
          })
        );
      } catch (e) {
        console.warn('Failed to stash laboratory Q&A in sessionStorage:', e);
      }
      const q = new URLSearchParams();
      if (issue) q.set('issue', issue);
      q.set('gender', gender);
      q.set('age', age);
      window.location.href = `../pre-doctor-room/index.html?${q}`;
    } catch (err) {
      console.error('SubmitLaboratory failed:', err);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit';
      showError(humanizeError(err));
    }
  });

  function showError(msg) {
    if (!statusEl) return;
    statusEl.classList.add('q-status--error');
    statusEl.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'q-error-card';

    const p = document.createElement('p');
    p.className = 'q-error-message';
    p.textContent = msg;

    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'q-retry';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => window.location.reload());

    card.append(p, retry);
    statusEl.append(card);
    statusEl.hidden = false;
    formEl.hidden = true;
    actionsEl.hidden = true;
  }
});

function humanizeError(err) {
  const msg = err?.message || String(err);
  if (/\b429\b/.test(msg) || /rate-?limit/i.test(msg)) {
    return 'The AI service is temporarily rate-limited. Please retry in a moment.';
  }
  if (/network|fetch failed|ENOTFOUND|ETIMEDOUT/i.test(msg)) {
    return 'Network error reaching the AI service. Check your connection and retry.';
  }
  return msg;
}

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

  card.appendChild(renderReportToggle(card, fieldName));

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

  setCardInputsDisabled(card, true);

  return card;
}

function renderReportToggle(card, name) {
  const row = document.createElement('label');
  row.className = 'q-report-toggle';
  row.htmlFor = `${name}_has_report`;

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('role', 'switch');
  input.className = 'q-report-toggle-input';
  input.id = `${name}_has_report`;
  input.dataset.reportToggle = '1';
  input.checked = false;

  const track = document.createElement('span');
  track.className = 'q-report-toggle-track';
  const thumb = document.createElement('span');
  thumb.className = 'q-report-toggle-thumb';
  track.appendChild(thumb);

  const text = document.createElement('span');
  text.className = 'q-report-toggle-text';
  text.textContent = "I don't have this report";

  card.classList.add('q-card--no-report');

  input.addEventListener('change', () => {
    const hasReport = input.checked;
    text.textContent = hasReport
      ? 'I have this report already'
      : "I don't have this report";
    card.classList.toggle('q-card--no-report', !hasReport);
    setCardInputsDisabled(card, !hasReport);
  });

  row.append(input, track, text);
  return row;
}

function setCardInputsDisabled(card, disabled) {
  const controls = card.querySelectorAll(
    'input:not([data-report-toggle]), textarea, select'
  );
  controls.forEach((el) => {
    el.disabled = disabled;
  });
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
  const safeMax = max > min ? max : min + step;

  const wrap = document.createElement('div');
  wrap.className = 'q-range-dual';
  wrap.dataset.rangeFor = name;

  const trackWrap = document.createElement('div');
  trackWrap.className = 'q-range-track-wrap';

  const track = document.createElement('div');
  track.className = 'q-range-track';
  const fill = document.createElement('div');
  fill.className = 'q-range-fill';
  track.appendChild(fill);

  const makeInput = (suffix, initial, modClass) => {
    const input = document.createElement('input');
    input.type = 'range';
    input.className = `q-range-input ${modClass}`;
    input.name = `${name}_${suffix}`;
    input.dataset.rangeSuffix = suffix;
    input.min = String(min);
    input.max = String(safeMax);
    input.step = String(step);
    input.value = String(initial);
    return input;
  };

  const minInput = makeInput('min', min, 'q-range-input--min');
  const maxInput = makeInput('max', safeMax, 'q-range-input--max');

  trackWrap.append(track, minInput, maxInput);

  const bounds = document.createElement('div');
  bounds.className = 'q-range-bounds';
  const boundMin = document.createElement('span');
  boundMin.textContent = String(min);
  const boundMax = document.createElement('span');
  boundMax.textContent = String(safeMax);
  bounds.append(boundMin, boundMax);

  const values = document.createElement('div');
  values.className = 'q-range-values';
  const valMin = document.createElement('span');
  valMin.className = 'q-range-value q-range-value--min';
  const valMax = document.createElement('span');
  valMax.className = 'q-range-value q-range-value--max';
  values.append(valMin, valMax);

  function update() {
    const lo = Number(minInput.value);
    const hi = Number(maxInput.value);
    const span = safeMax - min;
    const leftPct = span === 0 ? 0 : ((lo - min) / span) * 100;
    const rightPct = span === 0 ? 100 : ((hi - min) / span) * 100;
    fill.style.left = `${leftPct}%`;
    fill.style.right = `${100 - rightPct}%`;
    valMin.textContent = `Min: ${lo}`;
    valMax.textContent = `Max: ${hi}`;
    minInput.style.zIndex = lo >= safeMax - step ? '4' : '2';
  }

  minInput.addEventListener('input', () => {
    if (Number(minInput.value) > Number(maxInput.value)) {
      minInput.value = maxInput.value;
    }
    update();
  });
  maxInput.addEventListener('input', () => {
    if (Number(maxInput.value) < Number(minInput.value)) {
      maxInput.value = minInput.value;
    }
    update();
  });

  wrap.append(trackWrap, bounds, values);
  update();
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

    const reportToggle = card.querySelector('input[data-report-toggle="1"]');
    const hasReport = reportToggle ? reportToggle.checked : true;

    if (!hasReport) {
      answers.push({
        question,
        type,
        value: 'the user does not have this report currently',
      });
      return;
    }

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
