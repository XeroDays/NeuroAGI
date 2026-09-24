/**
 * Inline status messages for modal footers and field rows.
 *
 * Replaces the silent `console.error` paths in Settings and Models: the user
 * now sees why a save or a probe failed without opening DevTools.
 */

import { closeOverlay } from './overlay-controller.js';

const TONES = ['error', 'success', 'busy', 'info'];

/** Timers keyed by element so a new message cancels the previous auto-clear. */
const timers = new WeakMap();

/**
 * Find (or insert) a status element inside a modal footer.
 * @param {HTMLElement} footer
 * @param {string} id
 * @param {HTMLElement|null} [before] Insert ahead of this child; defaults to first.
 * @returns {HTMLElement|null}
 */
export function ensureFooterStatus(footer, id, before = null) {
  if (!footer) return null;

  const existing = document.getElementById(id);
  if (existing) return existing;

  const el = document.createElement('p');
  el.id = id;
  el.className = 'ui-status';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');

  const anchor = before && before.parentNode === footer ? before : footer.firstChild;
  footer.insertBefore(el, anchor);
  return el;
}

/**
 * @param {HTMLElement|null} el
 * @param {string} message Empty string clears the line.
 * @param {object} [options]
 * @param {'error'|'success'|'busy'|'info'} [options.tone='info']
 * @param {number} [options.autoClearMs=0] Clear after this delay; 0 keeps it.
 */
export function setStatus(el, message, options = {}) {
  if (!el) return;

  const tone = TONES.includes(options.tone) ? options.tone : 'info';
  const pending = timers.get(el);
  if (pending) clearTimeout(pending);

  for (const name of TONES) el.classList.remove(`ui-status--${name}`);

  el.textContent = message || '';
  if (!message) return;

  el.classList.add(`ui-status--${tone}`);

  // Re-trigger the fade so repeated messages still read as new.
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';

  const autoClearMs = Number(options.autoClearMs) || 0;
  if (autoClearMs > 0) {
    timers.set(el, setTimeout(() => setStatus(el, ''), autoClearMs));
  }
}

export function clearStatus(el) {
  setStatus(el, '');
}

/**
 * Close an overlay and drop any status text it was showing, so a stale error
 * is not the first thing the user sees on the next open.
 */
export function closeWithStatusReset(overlay, el) {
  clearStatus(el);
  closeOverlay(overlay);
}
