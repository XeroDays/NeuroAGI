const { contextBridge, ipcRenderer } = require("electron");

const CH = {
  PING: "neuroagi:ping",
  START_REPORT_COLLECTION: "neuroagi:start-report-collection",
  SUBMIT_QUESTIONNAIRE: "neuroagi:submit-questionnaire",
  OPEN_DEV_TOOLS: "neuroagi:open-dev-tools",
};

contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => ipcRenderer.invoke(CH.PING),

  startReportCollection: (payload) =>
    ipcRenderer.invoke(CH.START_REPORT_COLLECTION, payload),

  submitQuestionnaire: (payload) =>
    ipcRenderer.invoke(CH.SUBMIT_QUESTIONNAIRE, payload),

  openDevTools: () => ipcRenderer.invoke(CH.OPEN_DEV_TOOLS),
});
