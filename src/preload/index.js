const { contextBridge, ipcRenderer } = require("electron");

const CH = {
  PING: "neuroagi:ping",
  START_REPORT_COLLECTION: "neuroagi:start-report-collection",
};

contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => ipcRenderer.invoke(CH.PING),

  startReportCollection: (payload) =>
    ipcRenderer.invoke(CH.START_REPORT_COLLECTION, payload),
});
