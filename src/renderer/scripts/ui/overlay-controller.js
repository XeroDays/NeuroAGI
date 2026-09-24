/**
 * Shared open/close behaviour for every modal overlay in the app.
 *
 * Handles the exit animation (which `hidden` alone cannot do), a focus trap
 * scoped to the topmost overlay, and returning focus to whatever opened it.
 * Entrance/exit keyframes live in styles/motion.css and key off `.is-closing`.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Longest we will wait for the exit animation before forcing the overlay closed. */
const EXIT_TIMEOUT_MS = 400;

/** Topmost entry is the overlay that owns the keyboard. */
const stack = [];

function entryFor(overlay) {
  return stack.find((item) => item.overlay === overlay) || null;
}

function topEntry() {
  return stack.length ? stack[stack.length - 1] : null;
}

function cardOf(overlay) {
  return overlay.firstElementChild || overlay;
}

function focusableIn(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter((el) => {
    if (el.hidden || el.closest('[hidden]')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    return el.offsetParent !== null || el === document.activeElement;
  });
}

function focusFirst(overlay, initialFocus) {
  const target = typeof initialFocus === 'string'
    ? overlay.querySelector(initialFocus)
    : initialFocus;

  if (target && typeof target.focus === 'function' && !target.hidden) {
    target.focus();
    return;
  }

  const [first] = focusableIn(overlay);
  if (first) {
    first.focus();
    return;
  }

  // Nothing tabbable inside: park focus on the card so Escape still lands here.
  const card = cardOf(overlay);
  card.setAttribute('tabindex', '-1');
  card.focus();
}

function restoreFocus(opener) {
  if (!opener || typeof opener.focus !== 'function') return;
  if (!document.contains(opener)) return;
  if (opener.hidden || opener.closest('[hidden]')) return;
  opener.focus();
}

function trapTab(event) {
  const entry = topEntry();
  if (!entry) return;

  const items = focusableIn(entry.overlay);
  if (!items.length) {
    event.preventDefault();
    return;
  }

  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && (active === first || !entry.overlay.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !entry.overlay.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

function handleKeydown(event) {
  const entry = topEntry();
  if (!entry) return;

  if (event.key === 'Tab') {
    trapTab(event);
    return;
  }

  if (event.key !== 'Escape') return;
  if (!entry.dismissible) {
    event.preventDefault();
    return;
  }

  // Let a panel swallow Escape first (an inline editor, an open sub-menu…).
  if (typeof entry.onEscape === 'function' && entry.onEscape(event) === false) return;

  event.preventDefault();
  event.stopPropagation();
  closeOverlay(entry.overlay);
}

function handleFocusIn(event) {
  const entry = topEntry();
  if (!entry || entry.closing) return;
  if (entry.overlay.contains(event.target)) return;
  focusFirst(entry.overlay, entry.initialFocus);
}

document.addEventListener('keydown', handleKeydown, true);
document.addEventListener('focusin', handleFocusIn, true);

/** True while the overlay is on screen (including during its exit animation). */
export function isOverlayOpen(overlay) {
  return Boolean(overlay) && !overlay.hidden;
}

/** The overlay currently owning the keyboard, or null. */
export function topOverlay() {
  const entry = topEntry();
  return entry ? entry.overlay : null;
}

/**
 * Show an overlay with its entrance animation and trap focus inside it.
 *
 * @param {HTMLElement} overlay
 * @param {object} [options]
 * @param {HTMLElement|string} [options.initialFocus] Element or selector to focus first.
 * @param {boolean} [options.dismissible=true] Whether Escape / backdrop may close it.
 * @param {boolean} [options.closeOnBackdrop=false] Close when the scrim is clicked.
 * @param {(event: KeyboardEvent) => boolean|void} [options.onEscape]
 *        Return `false` to consume Escape without closing.
 * @param {() => void} [options.onClosed] Runs after the exit animation finishes.
 */
export function openOverlay(overlay, options = {}) {
  if (!overlay) return;

  const existing = entryFor(overlay);
  if (existing && !existing.closing) return;

  if (existing) {
    // Re-opened mid-exit: cancel the pending close and reuse the entry.
    clearTimeout(existing.timer);
    stack.splice(stack.indexOf(existing), 1);
  }

  const entry = {
    overlay,
    opener: document.activeElement,
    initialFocus: options.initialFocus,
    dismissible: options.dismissible !== false,
    closeOnBackdrop: Boolean(options.closeOnBackdrop),
    onEscape: options.onEscape,
    onClosed: options.onClosed,
    closing: false,
    timer: 0,
  };

  overlay.classList.remove('is-closing');
  overlay.hidden = false;
  stack.push(entry);

  if (entry.closeOnBackdrop && !overlay.dataset.backdropBound) {
    overlay.dataset.backdropBound = '1';
    overlay.addEventListener('mousedown', (event) => {
      const current = entryFor(overlay);
      if (!current || current.closing || !current.closeOnBackdrop) return;
      if (event.target !== overlay) return;
      closeOverlay(overlay);
    });
  }

  requestAnimationFrame(() => focusFirst(overlay, entry.initialFocus));
}

/**
 * Play the exit animation, then hide the overlay and restore focus.
 * Safe to call on an already-hidden overlay.
 */
export function closeOverlay(overlay) {
  if (!overlay || overlay.hidden) return;

  const entry = entryFor(overlay);
  if (entry && entry.closing) return;

  const card = cardOf(overlay);
  const finish = () => {
    clearTimeout(finishTimer);
    card.removeEventListener('animationend', onEnd);
    overlay.hidden = true;
    overlay.classList.remove('is-closing');

    if (entry) {
      const index = stack.indexOf(entry);
      if (index !== -1) stack.splice(index, 1);
      restoreFocus(entry.opener);
      if (typeof entry.onClosed === 'function') entry.onClosed();
    }
  };

  const onEnd = (event) => {
    if (event.target !== card) return;
    finish();
  };

  if (entry) entry.closing = true;
  overlay.classList.add('is-closing');
  card.addEventListener('animationend', onEnd);

  // Fires if the animation is suppressed (reduced motion, display quirks).
  const finishTimer = setTimeout(finish, EXIT_TIMEOUT_MS);
  if (entry) entry.timer = finishTimer;
}

/** Close every open overlay at once (used by the Back guard on Advance). */
export function closeAllOverlays() {
  for (const entry of [...stack]) closeOverlay(entry.overlay);
}
