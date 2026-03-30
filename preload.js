const { contextBridge, ipcRenderer } = require('electron');

/**
 * @param {{ messages: Array<{ role: string, content: string }>, onChunk: (t: string) => void, onDone: () => void, onError: (m: string) => void }} opts
 * @returns {() => void} cleanup (removes listeners; does not abort in-flight request in v1)
 */
function openRouterChatStream(opts) {
  const { messages, onChunk, onDone, onError } = opts;
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  const handler = (_event, payload) => {
    if (!payload || payload.requestId !== requestId) return;
    if (payload.type === 'chunk' && typeof payload.text === 'string') {
      onChunk(payload.text);
    } else if (payload.type === 'done') {
      cleanup();
      onDone();
    } else if (payload.type === 'error') {
      cleanup();
      onError(typeof payload.message === 'string' ? payload.message : 'Unknown error');
    }
  };

  const cleanup = () => {
    ipcRenderer.removeListener('openrouter-stream-event', handler);
  };

  ipcRenderer.on('openrouter-stream-event', handler);
  ipcRenderer.send('openrouter-stream-start', { requestId, messages });

  return cleanup;
}

contextBridge.exposeInMainWorld('electronAPI', {
  openRouterChatStream
});
