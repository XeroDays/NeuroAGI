/**
 * Orchestrates chat UI updates and OpenRouter streaming via preload IPC.
 * @param {{ messagesEl: HTMLElement, onStreamingChange?: (busy: boolean) => void }} options
 */
export function createAiChat({ messagesEl, onStreamingChange }) {
  /** @type {Array<{ role: string, content: string }>} */
  const conversation = [];
  let streaming = false;

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendUserBubble(text) {
    const row = document.createElement('div');
    row.className = 'chat-row chat-row--user';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble--user';
    bubble.textContent = text;
    row.appendChild(bubble);
    messagesEl.appendChild(row);
    scrollToBottom();
  }

  function appendAssistantBubble() {
    const row = document.createElement('div');
    row.className = 'chat-row chat-row--assistant';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble--assistant';
    bubble.textContent = '';
    row.appendChild(bubble);
    messagesEl.appendChild(row);
    scrollToBottom();
    return bubble;
  }

  /**
   * @param {string} text
   * @returns {Promise<void>}
   */
  function sendUserMessage(text) {
    return new Promise((resolve) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) {
        resolve();
        return;
      }

      const api = window.electronAPI?.openRouterChatStream;
      if (typeof api !== 'function') {
        appendUserBubble(trimmed);
        const bubble = appendAssistantBubble();
        bubble.classList.add('chat-bubble--error');
        bubble.textContent = 'Chat API is not available (preload bridge missing).';
        scrollToBottom();
        resolve();
        return;
      }

      streaming = true;
      onStreamingChange?.(true);

      appendUserBubble(trimmed);
      conversation.push({ role: 'user', content: trimmed });

      const assistantBubble = appendAssistantBubble();
      let assistantText = '';

      const payloadMessages = conversation.map((m) => ({ role: m.role, content: m.content }));

      api({
        messages: payloadMessages,
        onChunk: (t) => {
          assistantText += t;
          assistantBubble.textContent = assistantText;
          scrollToBottom();
        },
        onDone: () => {
          conversation.push({ role: 'assistant', content: assistantText });
          streaming = false;
          onStreamingChange?.(false);
          scrollToBottom();
          resolve();
        },
        onError: (msg) => {
          assistantBubble.classList.add('chat-bubble--error');
          const errLine = msg || 'Unknown error';
          assistantBubble.textContent = assistantText
            ? `${assistantText}\n\n— ${errLine}`
            : errLine;
          const stored =
            assistantText.trim().length > 0
              ? `${assistantText}\n\n— ${errLine}`
              : `[Error] ${errLine}`;
          conversation.push({ role: 'assistant', content: stored });
          streaming = false;
          onStreamingChange?.(false);
          scrollToBottom();
          resolve();
        }
      });
    });
  }

  return { sendUserMessage };
}
