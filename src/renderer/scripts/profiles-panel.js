import { isForceUpdateLocked } from './release-update-panel.js';

function els() {
  return {
    btn: document.getElementById('btn-profiles'),
    overlay: document.getElementById('profiles-overlay'),
    list: document.getElementById('profiles-list'),
    detail: document.getElementById('profiles-detail'),
    closeBtn: document.getElementById('btn-profiles-close'),
  };
}

function formatGender(gender) {
  const value = String(gender || '').trim();
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatAge(age) {
  if (age == null || age === '') return '—';
  return `${age} years`;
}

function renderDetail(profile) {
  const { detail } = els();
  if (!detail) return;
  if (!profile) {
    detail.replaceChildren();
    const empty = document.createElement('p');
    empty.className = 'profiles-empty';
    empty.textContent = 'Select a profile.';
    detail.appendChild(empty);
    return;
  }

  const rows = [
    ['Name', profile.name || '—'],
    ['Age', formatAge(profile.age)],
    ['Gender', formatGender(profile.gender)],
    ['Profile', profile.profile?.trim() || 'No profile notes yet.'],
  ];

  detail.replaceChildren();
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'profiles-detail-row';
    const dt = document.createElement('div');
    dt.className = 'profiles-detail-label';
    dt.textContent = label;
    const dd = document.createElement('div');
    dd.className = 'profiles-detail-value';
    dd.textContent = value;
    row.append(dt, dd);
    detail.appendChild(row);
  }
}

function renderList(profiles, selectedId) {
  const { list } = els();
  if (!list) return;

  list.replaceChildren();
  if (!profiles.length) {
    const empty = document.createElement('p');
    empty.className = 'profiles-empty';
    empty.textContent = 'No profiles yet.';
    list.appendChild(empty);
    renderDetail(null);
    return;
  }

  for (const profile of profiles) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'profiles-list-item';
    if (profile.id === selectedId) btn.classList.add('is-active');
    btn.dataset.id = profile.id;

    const nameEl = document.createElement('span');
    nameEl.className = 'profiles-list-name';
    nameEl.textContent = profile.name || 'Unnamed';

    const metaEl = document.createElement('span');
    metaEl.className = 'profiles-list-meta';
    metaEl.textContent = `${formatAge(profile.age)} · ${formatGender(profile.gender)}`;

    btn.append(nameEl, metaEl);
    btn.addEventListener('click', () => {
      list.querySelectorAll('.profiles-list-item').forEach((el) => {
        el.classList.toggle('is-active', el.dataset.id === profile.id);
      });
      renderDetail(profile);
    });
    list.appendChild(btn);
  }
}

function closeProfilesPopup() {
  const { overlay } = els();
  if (overlay) overlay.hidden = true;
}

async function openProfilesPopup() {
  if (isForceUpdateLocked()) return;
  const { overlay } = els();
  if (!overlay) return;

  let profiles = [];
  try {
    const result = await window.electronAPI?.getProfiles?.();
    profiles = Array.isArray(result?.profiles) ? result.profiles : [];
  } catch (err) {
    console.error('[profiles] getProfiles failed:', err);
    profiles = [];
  }

  const first = profiles[0] || null;
  renderList(profiles, first?.id || null);
  renderDetail(first);
  overlay.hidden = false;
}

export function initProfilesPanel() {
  const { btn, overlay, closeBtn } = els();

  btn?.addEventListener('click', () => {
    void openProfilesPopup();
  });

  closeBtn?.addEventListener('click', closeProfilesPopup);

  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeProfilesPopup();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (isForceUpdateLocked()) return;
    if (overlay && !overlay.hidden) closeProfilesPopup();
  });
}
