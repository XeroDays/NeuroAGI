const { contextBridge, ipcRenderer } = require("electron");

const CH = {
  PING: "neuroagi:ping",
  ENHANCE_QUERY: "neuroagi:enhance-query",
  QUERY_ENHANCER_PROGRESS: "neuroagi:query-enhancer-progress",
  AGI_FANOUT_PROGRESS: "neuroagi:agi-fanout-progress",
  SKIP_FANOUT_WAIT: "neuroagi:skip-fanout-wait",
  START_REPORT_COLLECTION: "neuroagi:start-report-collection",
  SUBMIT_QUESTIONNAIRE: "neuroagi:submit-questionnaire",
  GOTO_LABORATORY: "neuroagi:goto-laboratory",
  SUBMIT_LABORATORY: "neuroagi:submit-laboratory",
  GOTO_PRE_DOCTOR_ROOM: "neuroagi:goto-pre-doctor-room",
  SUBMIT_PRE_DOCTOR_ROOM: "neuroagi:submit-pre-doctor-room",
  START_DOCTOR: "neuroagi:start-doctor",
  DOCTOR_STREAM_DELTA: "neuroagi:doctor-stream-delta",
  DOCTOR_STREAM_REASONING_DELTA: "neuroagi:doctor-stream-reasoning-delta",
  DOCTOR_STREAM_DONE: "neuroagi:doctor-stream-done",
  DOCTOR_STREAM_ERROR: "neuroagi:doctor-stream-error",
  GET_USAGE_TOTALS: "neuroagi:get-usage-totals",
  RESET_USAGE_TOTALS: "neuroagi:reset-usage-totals",
  USAGE_UPDATE: "neuroagi:usage-update",
  OPEN_DEV_TOOLS: "neuroagi:open-dev-tools",
  GET_MODELS_CONFIG: "neuroagi:get-models-config",
  UPDATE_MODELS_CONFIG: "neuroagi:update-models-config",
  GET_LOGS: "neuroagi:get-logs",
  CLEAR_LOGS: "neuroagi:clear-logs",
  LOG_UPDATE: "neuroagi:log-update",
};

function subscribe(channel, cb) {
  if (typeof cb !== "function") return () => {};
  const handler = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => ipcRenderer.invoke(CH.PING),

  enhanceQuery: (payload) => ipcRenderer.invoke(CH.ENHANCE_QUERY, payload),
  onQueryEnhancerProgress: (cb) => subscribe(CH.QUERY_ENHANCER_PROGRESS, cb),

  startReportCollection: (payload) =>
    ipcRenderer.invoke(CH.START_REPORT_COLLECTION, payload),
  onAgiFanoutProgress: (cb) => subscribe(CH.AGI_FANOUT_PROGRESS, cb),

  skipFanoutWait: () => ipcRenderer.invoke(CH.SKIP_FANOUT_WAIT),

  submitQuestionnaire: (payload) =>
    ipcRenderer.invoke(CH.SUBMIT_QUESTIONNAIRE, payload),

  gotoLaboratory: (payload) => ipcRenderer.invoke(CH.GOTO_LABORATORY, payload),

  submitLaboratory: (payload) =>
    ipcRenderer.invoke(CH.SUBMIT_LABORATORY, payload),

  gotoPreDoctorRoom: (payload) =>
    ipcRenderer.invoke(CH.GOTO_PRE_DOCTOR_ROOM, payload),

  submitPreDoctorRoom: (payload) =>
    ipcRenderer.invoke(CH.SUBMIT_PRE_DOCTOR_ROOM, payload),

  startDoctor: (payload) => ipcRenderer.invoke(CH.START_DOCTOR, payload),

  onDoctorStreamDelta: (cb) => subscribe(CH.DOCTOR_STREAM_DELTA, cb),
  onDoctorStreamReasoningDelta: (cb) =>
    subscribe(CH.DOCTOR_STREAM_REASONING_DELTA, cb),
  onDoctorStreamDone: (cb) => subscribe(CH.DOCTOR_STREAM_DONE, cb),
  onDoctorStreamError: (cb) => subscribe(CH.DOCTOR_STREAM_ERROR, cb),

  getUsageTotals: () => ipcRenderer.invoke(CH.GET_USAGE_TOTALS),
  resetUsageTotals: () => ipcRenderer.invoke(CH.RESET_USAGE_TOTALS),
  onUsageUpdate: (cb) => subscribe(CH.USAGE_UPDATE, cb),

  openDevTools: () => ipcRenderer.invoke(CH.OPEN_DEV_TOOLS),

  getModelsConfig: () => ipcRenderer.invoke(CH.GET_MODELS_CONFIG),
  updateModelsConfig: (payload) => ipcRenderer.invoke(CH.UPDATE_MODELS_CONFIG, payload),

  getLogs: () => ipcRenderer.invoke(CH.GET_LOGS),
  clearLogs: () => ipcRenderer.invoke(CH.CLEAR_LOGS),
  onLogUpdate: (cb) => subscribe(CH.LOG_UPDATE, cb),
});
