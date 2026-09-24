/**
 * Themed replacement for `window.confirm`, which renders as an unstyled
 * Chromium sheet and blocks the renderer thread.
 *
 * Resolves `true` when accepted, `false` on cancel / Escape / backdrop.
 */

import { openOverlay, closeOverlay } from './overlay-controller.js';

let overlay = null;
let titleEl = null;
let messageEl = null;
let cancelBtn = null;
let acceptBtn = null;
let settle = null;

function build() {
  overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'confirm-dialog-title');
  overlay.setAttribute('aria-describedby', 'confirm-dialog-message');

  const modal = document.createElement('div');
  modal.className = 'confirm-modal';

  const header = document.createElement('div');
  header.className = 'confirm-modal-header';

  titleEl = document.createElement('h2');
  titleEl.className = 'confirm-modal-title';
  titleEl.id = 'confirm-dialog-title';

  messageEl = document.createElement('p');
  messageEl.className = 'confirm-modal-message';
  messageEl.id = 'confirm-dialog-message';

  header.append(titleEl, messageEl);

  const footer = document.createElement('div');
  footer.className = 'confirm-modal-footer';

  cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'confirm-btn confirm-btn--cancel';

  acceptBtn = document.createElement('button');
  acceptBtn.type = 'button';
  acceptBtn.className = 'confirm-btn confirm-btn--danger';

  footer.append(cancelBtn, acceptBtn);
  modal.append(header, footer);
  overlay.append(modal);
  document.body.append(overlay);

  cancelBtn.addEventListener('click', () => resolveWith(false));
  acceptBtn.addEventListener('click', () => resolveWith(true));
}

function resolveWith(value) {
  const done = settle;
  settle = null;
  closeOverlay(overlay);
  if (done) done(value);
}

/**
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.confirmLabel='Delete']
 * @param {string} [options.cancelLabel='Cancel']
 * @param {'danger'|'accept'} [options.tone='danger']
 * @returns {Promise<boolean>}
 */
export function confirmDialog(options = {}) {
  if (!overlay) build();

  // A second call supersedes the first; the caller waiting on it gets `false`.
  if (settle) resolveWith(false);

  titleEl.textContent = options.title || 'Are you sure?';
  messageEl.textContent = options.message || '';
  messageEl.hidden = !options.message;
  cancelBtn.textContent = options.cancelLabel || 'Cancel';
  acceptBtn.textContent = options.confirmLabel || 'Delete';

  const tone = options.tone === 'accept' ? 'accept' : 'danger';
  acceptBtn.classList.toggle('confirm-btn--danger', tone === 'danger');
  acceptBtn.classList.toggle('confirm-btn--accept', tone === 'accept');

  return new Promise((resolve) => {
    settle = resolve;
    openOverlay(overlay, {
      initialFocus: cancelBtn,
      closeOnBackdrop: true,
      onClosed: () => {
        // Covers Escape and backdrop, which bypass resolveWith().
        const done = settle;
        settle = null;
        if (done) done(false);
      },
    });
  });
}
