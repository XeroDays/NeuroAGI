import { isForceUpdateLocked } from './release-update-panel.js';
import { openOverlay, closeOverlay } from './ui/overlay-controller.js';
import { ensureFooterStatus, setStatus, closeWithStatusReset } from './ui/status-line.js';
import { confirmDialog } from './ui/confirm-dialog.js';

let footerStatus = null;

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
  const delta = Date.now() - date.getTime();
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString();
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

function fieldInput(label, value, attrs) {
  const wrap = document.createElement('label');
  wrap.className = 'profiles-edit-field';
  const caption = document.createElement('span');
  caption.className = 'profiles-detail-label';
  caption.textContent = label;
  const input = document.createElement(attrs.multiline ? 'textarea' : 'input');
  input.className = 'profiles-edit-input';
  if (!attrs.multiline) input.type = attrs.type || 'text';
  if (attrs.multiline) input.rows = 3;
  input.value = value == null ? '' : String(value);
  for (const [key, val] of Object.entries(attrs.extra || {})) input.setAttribute(key, val);
  wrap.append(caption, input);
  return { wrap, input };
}

function renderIssueHistory(parent, profile) {
  const issues = profile?.issues;
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
    when.title = String(item.datetime || '');
    const text = document.createElement('div');
    text.className = 'profiles-issue-text';
    text.textContent = String(item.text || '').trim() || '—';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'profiles-issue-delete';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => { void deleteIssue(profile, item); });
    entry.append(when, text, remove);
    wrap.appendChild(entry);
  }
  row.appendChild(wrap);
  parent.appendChild(row);
}

function renderDetail(profile, animate) {
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
  const nameField = fieldInput('Name', profile.name || '', {});
  const ageField = fieldInput('Age', profile.age ?? '', { type: 'number', extra: { min: '1', max: '100' } });
  const genderField = fieldInput('Gender', profile.gender || '', {});
  const notesField = fieldInput('Profile notes', profile.profile || '', { multiline: true });
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'models-btn-update profiles-save-btn';
  save.textContent = 'Save changes';
  save.addEventListener('click', () => {
    void saveProfileEdits(profile, {
      name: nameField.input.value,
      age: ageField.input.value,
      gender: genderField.input.value,
      content: notesField.input.value,
    });
  });
  detail.append(nameField.wrap, ageField.wrap, genderField.wrap, notesField.wrap, save);
  renderIssueHistory(detail, profile);
  syncDeleteButton();

  if (animate) {
    detail.classList.remove('is-swapping');
    void detail.offsetWidth;
    detail.classList.add('is-swapping');
  }
}

function selectProfile(id, animate) {
  const changed = Boolean(id) && id !== selectedId;
  selectedId = id || null;
  const profile = selectedProfile();
  const { list } = els();
  list?.querySelectorAll('.profiles-list-item').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.id === selectedId);
  });
  renderDetail(profile, animate && changed);
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
    const count = Array.isArray(profile.issues) ? profile.issues.length : 0;
    metaEl.textContent = `${formatAge(profile.age)} · ${formatGender(profile.gender)}`;
    if (count) {
      const badge = document.createElement('span');
      badge.className = 'profiles-count-badge';
      badge.textContent = String(count);
      badge.title = `${count} issue${count === 1 ? '' : 's'}`;
      metaEl.append(' ', badge);
    }

    btn.append(nameEl, metaEl);
    btn.addEventListener('click', () => {
      selectProfile(profile.id, true);
    });
    list.appendChild(btn);
  }

  renderDetail(selectedProfile());
}

async function reloadProfiles() {
  const result = await window.electronAPI?.getProfiles?.();
  loadedProfiles = Array.isArray(result?.profiles) ? result.profiles : [];
  if (selectedId && !loadedProfiles.some((item) => item.id === selectedId)) {
    selectedId = loadedProfiles[0]?.id || null;
  }
  renderList();
}

async function saveProfileEdits(profile, fields) {
  const content = String(fields.content || '').trim() || ' ';
  try {
    const result = await window.electronAPI?.updateProfile?.({
      userid: profile.id,
      name: fields.name,
      age: fields.age,
      gender: fields.gender,
      content,
    });
    if (!result?.ok) {
      setStatus(footerStatus, result?.error || 'Could not save that profile.', { tone: 'error' });
      return;
    }
    await reloadProfiles();
    setStatus(footerStatus, 'Profile saved.', { tone: 'success', autoClearMs: 3000 });
  } catch (err) {
    console.error('[profiles] updateProfile failed:', err);
    setStatus(footerStatus, 'Could not save that profile.', { tone: 'error' });
  }
}

async function deleteIssue(profile, issue) {
  const confirmed = await confirmDialog({
    title: 'Remove this issue?',
    message: 'The recorded issue will be deleted from this profile.',
    confirmLabel: 'Remove issue',
  });
  if (!confirmed) return;
  try {
    const result = await window.electronAPI?.deleteProfileIssue?.({
      userid: profile.id,
      issueId: issue.id,
    });
    if (!result?.ok) {
      setStatus(footerStatus, result?.error || 'Could not remove that issue.', { tone: 'error' });
      return;
    }
    await reloadProfiles();
    setStatus(footerStatus, 'Issue removed.', { tone: 'success', autoClearMs: 3000 });
  } catch (err) {
    console.error('[profiles] deleteProfileIssue failed:', err);
    setStatus(footerStatus, 'Could not remove that issue.', { tone: 'error' });
  }
}

function closeProfilesPopup() {
  const { overlay } = els();
  closeWithStatusReset(overlay, footerStatus);
}

async function openProfilesPopup() {
  if (isForceUpdateLocked()) return;
  const { overlay } = els();
  if (!overlay) return;

  setStatus(footerStatus, '');
  loadedProfiles = [];
  try {
    const result = await window.electronAPI?.getProfiles?.();
    loadedProfiles = Array.isArray(result?.profiles) ? result.profiles : [];
  } catch (err) {
    console.error('[profiles] getProfiles failed:', err);
    loadedProfiles = [];
    setStatus(footerStatus, 'Could not read saved profiles.', { tone: 'error' });
  }

  selectedId = loadedProfiles[0]?.id || null;
  renderList();
  openOverlay(overlay, {
    initialFocus: '.profiles-list-item.is-active, .profiles-list-item',
    closeOnBackdrop: true,
  });
}

async function handleDeleteProfile() {
  const profile = selectedProfile();
  if (!profile) return;

  const name = profile.name || 'Unnamed';
  const confirmed = await confirmDialog({
    title: 'Delete this profile?',
    message: `“${name}” and their recorded issue history will be removed. This cannot be undone.`,
    confirmLabel: 'Delete profile',
  });
  if (!confirmed) return;

  // The selection may have moved while the dialog was open.
  if (selectedId !== profile.id) return;

  const removedIndex = loadedProfiles.findIndex((item) => item.id === profile.id);
  try {
    const result = await window.electronAPI?.deleteProfile?.({ id: profile.id });
    if (!result?.ok) {
      console.error('[profiles] deleteProfile failed:', result?.error || 'unknown error');
      setStatus(footerStatus, result?.error || 'Could not delete that profile.', { tone: 'error' });
      return;
    }
  } catch (err) {
    console.error('[profiles] deleteProfile failed:', err);
    setStatus(footerStatus, 'Could not delete that profile.', { tone: 'error' });
    return;
  }

  loadedProfiles = loadedProfiles.filter((item) => item.id !== profile.id);
  const next = loadedProfiles[removedIndex] || loadedProfiles[removedIndex - 1] || null;
  selectedId = next?.id || null;
  renderList();
  setStatus(footerStatus, `Deleted ${name}.`, { tone: 'success', autoClearMs: 4000 });
}

export function initProfilesPanel() {
  const { btn, overlay, deleteBtn, closeBtn } = els();

  footerStatus = ensureFooterStatus(
    overlay?.querySelector('.profiles-modal-footer'),
    'profiles-footer-status',
  );

  btn?.addEventListener('click', () => {
    void openProfilesPopup();
  });

  deleteBtn?.addEventListener('click', () => {
    void handleDeleteProfile();
  });

  closeBtn?.addEventListener('click', closeProfilesPopup);

  document.getElementById('btn-profiles-export')?.addEventListener('click', async () => {
    try {
      const result = await window.electronAPI?.exportProfiles?.();
      if (result?.canceled) return;
      if (!result?.ok) {
        setStatus(footerStatus, result?.error || 'Export failed.', { tone: 'error' });
        return;
      }
      setStatus(footerStatus, 'Profiles exported.', { tone: 'success', autoClearMs: 3000 });
    } catch (err) {
      console.error('[profiles] export failed:', err);
      setStatus(footerStatus, 'Export failed.', { tone: 'error' });
    }
  });

  document.getElementById('btn-profiles-import')?.addEventListener('click', async () => {
    try {
      const result = await window.electronAPI?.importProfiles?.();
      if (result?.canceled) return;
      if (!result?.ok) {
        setStatus(footerStatus, result?.error || 'Import failed.', { tone: 'error' });
        return;
      }
      await reloadProfiles();
      setStatus(footerStatus, `Imported ${result.imported} profile${result.imported === 1 ? '' : 's'}.`, { tone: 'success', autoClearMs: 4000 });
    } catch (err) {
      console.error('[profiles] import failed:', err);
      setStatus(footerStatus, 'Import failed.', { tone: 'error' });
    }
  });
}
