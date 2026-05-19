import { createAiChat } from './ai-helper.js';
import { APP_TITLE, SCREEN_DIAGNOSES_ROOM } from './constants.js';

document.addEventListener('DOMContentLoaded', () => {
  document.title = `${SCREEN_DIAGNOSES_ROOM} — ${APP_TITLE}`;

  const titleEl = document.getElementById('app-title');
  const screenTitleEl = document.getElementById('screen-title');
  const messagesEl = document.getElementById('chat-messages');
  const inputEl = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');

  if (titleEl) {
    titleEl.textContent = APP_TITLE;
  }
  if (screenTitleEl) {
    screenTitleEl.textContent = SCREEN_DIAGNOSES_ROOM;
  }

  if (!messagesEl || !inputEl || !sendBtn) {
    return;
  }

  function setComposerEnabled(enabled) {
    inputEl.disabled = !enabled;
    syncSendDisabled();
  }

  function syncSendDisabled() {
    sendBtn.disabled = inputEl.disabled || !inputEl.value.trim();
  }

  const chat = createAiChat({
    messagesEl,
    onStreamingChange: (busy) => {
      setComposerEnabled(!busy);
    }
  });

  inputEl.addEventListener('input', () => {
    syncSendDisabled();
  });

  async function submit() {
    const text = inputEl.value;
    if (!text.trim() || inputEl.disabled) return;
    inputEl.value = '';
    syncSendDisabled();
    await chat.sendUserMessage(text);
  }

  syncSendDisabled();

  sendBtn.addEventListener('click', () => {
    void submit();
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  });
});
