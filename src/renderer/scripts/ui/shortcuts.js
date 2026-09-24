/**
 * Global shortcuts. Overlay-specific Escape handling stays in the overlay controller.
 */
document.addEventListener('keydown', (event) => {
  if (event.key === '?' && !event.ctrlKey && !event.metaKey && !isTyping(event.target)) {
    event.preventDefault();
    toggleSheet();
    return;
  }
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const key = event.key.toLowerCase();
  const home = Boolean(document.getElementById('btn-settings'));
  if (key === ',' && home) {
    event.preventDefault();
    document.getElementById('btn-settings')?.click();
  } else if (key === 'm' && home) {
    event.preventDefault();
    document.getElementById('btn-models')?.click();
  } else if (key === 'p' && home) {
    event.preventDefault();
    document.getElementById('btn-profiles')?.click();
  } else if (key === 'l') {
    event.preventDefault();
    document.querySelector('.logs-bubble')?.click();
  } else if (/^[1-9]$/.test(key)) {
    const chips = [...document.querySelectorAll('.adv-chip')];
    const chip = chips[Number(key) - 1];
    if (chip) {
      event.preventDefault();
      chip.click();
    }
  }
});

function isTyping(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

function toggleSheet() {
  let sheet = document.getElementById('shortcuts-sheet');
  if (sheet) {
    sheet.hidden = !sheet.hidden;
    return;
  }
  sheet = document.createElement('div');
  sheet.id = 'shortcuts-sheet';
  sheet.className = 'shortcuts-sheet';
  sheet.innerHTML = [
    '<strong>Shortcuts</strong>',
    'Ctrl+, Settings',
    'Ctrl+M Models',
    'Ctrl+P Profiles',
    'Ctrl+L Logs',
    'Ctrl+1-9 Switch model',
    '? Show this list',
    'Esc Close the top dialog',
  ].map((line) => `<div>${line}</div>`).join('');
  document.body.appendChild(sheet);
}

