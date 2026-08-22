function numberOr(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function buildCard(q, i) {
  const type = String(q?.type || '').toLowerCase();
  const questionText = String(q?.question || `Question ${i + 1}`);
  const fieldName = `adv_q_${i}`;

  const card = document.createElement('section');
  card.className = `adv-q-card adv-q-card--${type || 'text'}`;
  card.dataset.index = String(i);
  card.dataset.type = type || 'text';
  card.dataset.question = questionText;

  const h = document.createElement('h2');
  h.className = 'adv-q-question';
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
    default:
      card.appendChild(renderText(q, fieldName));
  }
  return card;
}

function renderSingleSelect(q, name) {
  const wrap = document.createElement('div');
  wrap.className = 'adv-q-options';
  const options = Array.isArray(q?.options) ? q.options : [];

  options.forEach((opt, idx) => {
    const optStr = String(opt);
    const isOther = optStr.trim().toLowerCase() === 'other';
    const id = `${name}_${idx}`;

    const label = document.createElement('label');
    label.className = 'adv-q-option';
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
      text.className = 'adv-q-other-input';
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
      span.className = 'adv-q-option-label';
      span.textContent = optStr;
      label.appendChild(span);
    }
    wrap.appendChild(label);
  });
  return wrap;
}

function renderMultiSelect(q, name) {
  const wrap = document.createElement('div');
  wrap.className = 'adv-q-options';
  const options = Array.isArray(q?.options) ? q.options : [];

  options.forEach((opt, idx) => {
    const optStr = String(opt);
    const id = `${name}_${idx}`;

    const label = document.createElement('label');
    label.className = 'adv-q-option';
    label.htmlFor = id;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.name = name;
    cb.id = id;
    cb.value = optStr;
    label.appendChild(cb);

    const span = document.createElement('span');
    span.className = 'adv-q-option-label';
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
  wrap.className = 'adv-q-slider';

  const track = document.createElement('div');
  track.className = 'adv-q-slider-track';

  const input = document.createElement('input');
  input.type = 'range';
  input.name = name;
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(initial);

  const valueEl = document.createElement('span');
  valueEl.className = 'adv-q-slider-value';
  valueEl.textContent = String(initial);

  input.addEventListener('input', () => {
    valueEl.textContent = input.value;
  });

  track.appendChild(input);
  track.appendChild(valueEl);
  wrap.appendChild(track);

  const labelRow = document.createElement('div');
  labelRow.className = 'adv-q-slider-labels';
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
  wrap.className = 'adv-q-range-dual';
  wrap.dataset.rangeFor = name;

  const trackWrap = document.createElement('div');
  trackWrap.className = 'adv-q-range-track-wrap';

  const track = document.createElement('div');
  track.className = 'adv-q-range-track';
  const fill = document.createElement('div');
  fill.className = 'adv-q-range-fill';
  track.appendChild(fill);

  const makeInput = (suffix, initial, modClass) => {
    const input = document.createElement('input');
    input.type = 'range';
    input.className = `adv-q-range-input ${modClass}`;
    input.name = `${name}_${suffix}`;
    input.dataset.rangeSuffix = suffix;
    input.min = String(min);
    input.max = String(safeMax);
    input.step = String(step);
    input.value = String(initial);
    return input;
  };

  const minInput = makeInput('min', min, 'adv-q-range-input--min');
  const maxInput = makeInput('max', safeMax, 'adv-q-range-input--max');

  trackWrap.append(track, minInput, maxInput);

  const bounds = document.createElement('div');
  bounds.className = 'adv-q-range-bounds';
  const boundMin = document.createElement('span');
  boundMin.textContent = String(min);
  const boundMax = document.createElement('span');
  boundMax.textContent = String(safeMax);
  bounds.append(boundMin, boundMax);

  const values = document.createElement('div');
  values.className = 'adv-q-range-values';
  const valMin = document.createElement('span');
  valMin.className = 'adv-q-range-value adv-q-range-value--min';
  const valMax = document.createElement('span');
  valMax.className = 'adv-q-range-value adv-q-range-value--max';
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
  ta.className = 'adv-q-text-input';
  ta.name = name;
  ta.placeholder = q?.placeholder || 'Type your answer…';
  return ta;
}

/**
 * Render a form of questionnaire-style controls into container.
 * @param {HTMLElement} container
 * @param {object[]} questions
 * @returns {HTMLFormElement}
 */
export function renderQuestionForm(container, questions) {
  const form = document.createElement('form');
  form.className = 'adv-q-form';
  form.addEventListener('submit', (event) => event.preventDefault());

  const list = Array.isArray(questions) ? questions : [];
  list.forEach((q, i) => {
    form.appendChild(buildCard(q, i));
  });

  const actions = document.createElement('div');
  actions.className = 'adv-q-actions';
  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'adv-q-submit';
  submit.textContent = 'Submit';
  actions.appendChild(submit);
  form.appendChild(actions);

  container.appendChild(form);
  return form;
}

/**
 * Collect answers from an Advance question form.
 * @param {HTMLElement} formEl
 * @returns {{ question: string, type: string, value: unknown }[]}
 */
export function collectAnswers(formEl) {
  const cards = formEl.querySelectorAll('.adv-q-card');
  const answers = [];
  cards.forEach((card) => {
    const type = card.dataset.type;
    const question = card.dataset.question;
    const idx = card.dataset.index;
    const name = `adv_q_${idx}`;
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

export function setFormDisabled(formEl, disabled) {
  if (!formEl) return;
  formEl.querySelectorAll('input, textarea, button').forEach((el) => {
    el.disabled = disabled;
  });
}

/**
 * Collapse a submitted form wrap into an expandable summary bar.
 * Cards stay in the DOM (read-only) and toggle when the bar is clicked.
 * @param {HTMLElement} wrap
 * @param {{ question?: string }[]} answers
 */
export function collapseQuestionForm(wrap, answers) {
  if (!wrap) return;
  const count = Array.isArray(answers) ? answers.length : 0;
  wrap.classList.add('is-collapsed', 'is-submitted');

  let summary = wrap.querySelector('.adv-q-summary');
  if (!summary) {
    summary = document.createElement('button');
    summary.type = 'button';
    summary.className = 'adv-q-summary';
    wrap.insertBefore(summary, wrap.firstChild);
    summary.addEventListener('click', () => {
      wrap.classList.toggle('is-collapsed');
      const expanded = !wrap.classList.contains('is-collapsed');
      summary.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    });
  }

  summary.textContent = count === 1
    ? '1 question answered'
    : `${count} questions answered`;
  summary.setAttribute('aria-expanded', 'false');
}
