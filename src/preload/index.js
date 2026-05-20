const { contextBridge, ipcRenderer } = require("electron");

const CH = {
  PING: "neuroagi:ping",
  OPENROUTER_STREAM_START: "openrouter-stream-start",
  OPENROUTER_STREAM_EVENT: "openrouter-stream-event",
  START_REPORT_COLLECTION: "neuroagi:start-report-collection",
};

let streamCounter = 0;

contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => ipcRenderer.invoke(CH.PING),

  startReportCollection: (payload) =>
    ipcRenderer.invoke(CH.START_REPORT_COLLECTION, payload),

  openRouterChatStream({ messages, onChunk, onDone, onError }) {
    const requestId = `stream-${++streamCounter}-${Date.now()}`;

    function handler(_event, payload) {
      if (payload.requestId !== requestId) return;
      if (payload.type === "chunk") {
        onChunk?.(payload.text);
      } else if (payload.type === "done") {
        ipcRenderer.removeListener(CH.OPENROUTER_STREAM_EVENT, handler);
        onDone?.();
      } else if (payload.type === "error") {
        ipcRenderer.removeListener(CH.OPENROUTER_STREAM_EVENT, handler);
        onError?.(payload.message);
      }
    }

    ipcRenderer.on(CH.OPENROUTER_STREAM_EVENT, handler);
    ipcRenderer.send(CH.OPENROUTER_STREAM_START, { requestId, messages });

    return () => {
      ipcRenderer.removeListener(CH.OPENROUTER_STREAM_EVENT, handler);
    };
  },
});
