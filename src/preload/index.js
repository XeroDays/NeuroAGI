const { contextBridge, ipcRenderer } = require("electron");

const CH = {
  PING: "neuroagi:ping",
  START_REPORT_COLLECTION: "neuroagi:start-report-collection",
  OPEN_DEV_TOOLS: "neuroagi:open-dev-tools",
};

contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => ipcRenderer.invoke(CH.PING),

  startReportCollection: (payload) =>
    ipcRenderer.invoke(CH.START_REPORT_COLLECTION, payload),

  openDevTools: () => ipcRenderer.invoke(CH.OPEN_DEV_TOOLS),
});
