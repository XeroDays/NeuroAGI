import { isForceUpdateLocked } from './release-update-panel.js';

let loadedProfiles = [];
let selectedId = null;

function els() {
  return {
    btn: document.getElementById('btn-profiles'),
    overlay: document.getElementById('profiles-overlay'),
    list: document.getElementById('profiles-list'),
    detail: document.getElementById('profiles-detail'),
    deleteBtn: document.getElementById('btn-profiles-delete'),
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

function formatIssueDatetime(value) {
  const text = String(value || '').trim();
  if (!text) return 'Unknown time';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString();
}

function selectedProfile() {
  return loadedProfiles.find((profile) => profile.id === selectedId) || null;
}

function syncDeleteButton() {
  const { deleteBtn } = els();
  if (!deleteBtn) return;
  const hasSelection = Boolean(selectedId && selectedProfile());
  deleteBtn.hidden = !hasSelection;
  deleteBtn.disabled = !hasSelection;
}

function appendDetailRow(parent, label, value) {
  const row = document.createElement('div');
  row.className = 'profiles-detail-row';
  const dt = document.createElement('div');
  dt.className = 'profiles-detail-label';
  dt.textContent = label;
  const dd = document.createElement('div');
  dd.className = 'profiles-detail-value';
  dd.textContent = value;
  row.append(dt, dd);
  parent.appendChild(row);
}

function renderIssueHistory(parent, issues) {
  const row = document.createElement('div');
  row.className = 'profiles-detail-row';
  const dt = document.createElement('div');
  dt.className = 'profiles-detail-label';
  dt.textContent = 'Issue history';
  row.appendChild(dt);

  const list = Array.isArray(issues) ? issues.slice() : [];
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'profiles-detail-value';
    empty.textContent = 'No issues recorded yet.';
    row.appendChild(empty);
    parent.appendChild(row);
    return;
  }

  list.sort((a, b) => String(b.datetime || '').localeCompare(String(a.datetime || '')));
  const wrap = document.createElement('div');
  wrap.className = 'profiles-issue-list';
  for (const item of list) {
    const entry = document.createElement('div');
    entry.className = 'profiles-issue-item';
    const when = document.createElement('div');
    when.className = 'profiles-issue-time';
    when.textContent = formatIssueDatetime(item.datetime);
    const text = document.createElement('div');
    text.className = 'profiles-issue-text';
    text.textContent = String(item.text || '').trim() || '—';
    entry.append(when, text);
    wrap.appendChild(entry);
  }
  row.appendChild(wrap);
  parent.appendChild(row);
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
    syncDeleteButton();
    return;
  }

  detail.replaceChildren();
  appendDetailRow(detail, 'Name', profile.name || '—');
  appendDetailRow(detail, 'Age', formatAge(profile.age));
  appendDetailRow(detail, 'Gender', formatGender(profile.gender));
  appendDetailRow(detail, 'Profile', profile.profile?.trim() || 'No profile notes yet.');
  renderIssueHistory(detail, profile.issues);
  syncDeleteButton();
}

function selectProfile(id) {
  selectedId = id || null;
  const profile = selectedProfile();
  const { list } = els();
  list?.querySelectorAll('.profiles-list-item').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.id === selectedId);
  });
  renderDetail(profile);
}

function renderList() {
  const { list } = els();
  if (!list) return;

  list.replaceChildren();
  if (!loadedProfiles.length) {
    const empty = document.createElement('p');
    empty.className = 'profiles-empty';
    empty.textContent = 'No profiles yet.';
    list.appendChild(empty);
    selectedId = null;
    renderDetail(null);
    return;
  }

  for (const profile of loadedProfiles) {
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
      selectProfile(profile.id);
    });
    list.appendChild(btn);
  }

  renderDetail(selectedProfile());
}

function closeProfilesPopup() {
  const { overlay } = els();
  if (overlay) overlay.hidden = true;
}

async function openProfilesPopup() {
  if (isForceUpdateLocked()) return;
  const { overlay } = els();
  if (!overlay) return;

  loadedProfiles = [];
  try {
    const result = await window.electronAPI?.getProfiles?.();
    loadedProfiles = Array.isArray(result?.profiles) ? result.profiles : [];
  } catch (err) {
    console.error('[profiles] getProfiles failed:', err);
    loadedProfiles = [];
  }

  selectedId = loadedProfiles[0]?.id || null;
  renderList();
  overlay.hidden = false;
}

async function handleDeleteProfile() {
  const profile = selectedProfile();
  if (!profile) return;

  const name = profile.name || 'Unnamed';
  const confirmed = window.confirm(`Delete profile “${name}”? This cannot be undone.`);
  if (!confirmed) return;

  const removedIndex = loadedProfiles.findIndex((item) => item.id === profile.id);
  try {
    const result = await window.electronAPI?.deleteProfile?.({ id: profile.id });
    if (!result?.ok) {
      console.error('[profiles] deleteProfile failed:', result?.error || 'unknown error');
      return;
    }
  } catch (err) {
    console.error('[profiles] deleteProfile failed:', err);
    return;
  }

  loadedProfiles = loadedProfiles.filter((item) => item.id !== profile.id);
  const next = loadedProfiles[removedIndex] || loadedProfiles[removedIndex - 1] || null;
  selectedId = next?.id || null;
  renderList();
}

export function initProfilesPanel() {
  const { btn, overlay, deleteBtn, closeBtn } = els();

  btn?.addEventListener('click', () => {
    void openProfilesPopup();
  });

  deleteBtn?.addEventListener('click', () => {
    void handleDeleteProfile();
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
