const { contextBridge, ipcRenderer } = require("electron");

const CH = {
  PING: "neuroagi:ping",
  START_REPORT_COLLECTION: "neuroagi:start-report-collection",
  SUBMIT_QUESTIONNAIRE: "neuroagi:submit-questionnaire",
  GOTO_LABORATORY: "neuroagi:goto-laboratory",
  SUBMIT_LABORATORY: "neuroagi:submit-laboratory",
  START_DOCTOR: "neuroagi:start-doctor",
  DOCTOR_STREAM_DELTA: "neuroagi:doctor-stream-delta",
  DOCTOR_STREAM_DONE: "neuroagi:doctor-stream-done",
  DOCTOR_STREAM_ERROR: "neuroagi:doctor-stream-error",
  OPEN_DEV_TOOLS: "neuroagi:open-dev-tools",
};

function subscribe(channel, cb) {
  if (typeof cb !== "function") return () => {};
  const handler = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => ipcRenderer.invoke(CH.PING),

  startReportCollection: (payload) =>
    ipcRenderer.invoke(CH.START_REPORT_COLLECTION, payload),

  submitQuestionnaire: (payload) =>
    ipcRenderer.invoke(CH.SUBMIT_QUESTIONNAIRE, payload),

  gotoLaboratory: (payload) => ipcRenderer.invoke(CH.GOTO_LABORATORY, payload),

  submitLaboratory: (payload) =>
    ipcRenderer.invoke(CH.SUBMIT_LABORATORY, payload),

  startDoctor: (payload) => ipcRenderer.invoke(CH.START_DOCTOR, payload),

  onDoctorStreamDelta: (cb) => subscribe(CH.DOCTOR_STREAM_DELTA, cb),
  onDoctorStreamDone: (cb) => subscribe(CH.DOCTOR_STREAM_DONE, cb),
  onDoctorStreamError: (cb) => subscribe(CH.DOCTOR_STREAM_ERROR, cb),

  openDevTools: () => ipcRenderer.invoke(CH.OPEN_DEV_TOOLS),
});
