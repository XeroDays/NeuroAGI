const { contextBridge, ipcRenderer } = require("electron");

const CH = {
  PING: "neuroagi:ping",
  START_REPORT_COLLECTION: "neuroagi:start-report-collection",
  SUBMIT_QUESTIONNAIRE: "neuroagi:submit-questionnaire",
  GOTO_LABORATORY: "neuroagi:goto-laboratory",
  SUBMIT_LABORATORY: "neuroagi:submit-laboratory",
  OPEN_DEV_TOOLS: "neuroagi:open-dev-tools",
};

contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => ipcRenderer.invoke(CH.PING),

  startReportCollection: (payload) =>
    ipcRenderer.invoke(CH.START_REPORT_COLLECTION, payload),

  submitQuestionnaire: (payload) =>
    ipcRenderer.invoke(CH.SUBMIT_QUESTIONNAIRE, payload),

  gotoLaboratory: (payload) => ipcRenderer.invoke(CH.GOTO_LABORATORY, payload),

  submitLaboratory: (payload) =>
    ipcRenderer.invoke(CH.SUBMIT_LABORATORY, payload),

  openDevTools: () => ipcRenderer.invoke(CH.OPEN_DEV_TOOLS),
});
