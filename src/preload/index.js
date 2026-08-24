const { contextBridge, ipcRenderer } = require("electron");

const CH = {
  PING: "neuroagi:ping",
  GET_USAGE_TOTALS: "neuroagi:get-usage-totals",
  RESET_USAGE_TOTALS: "neuroagi:reset-usage-totals",
  USAGE_UPDATE: "neuroagi:usage-update",
  OPEN_DEV_TOOLS: "neuroagi:open-dev-tools",
  GET_MODELS_CONFIG: "neuroagi:get-models-config",
  UPDATE_MODELS_CONFIG: "neuroagi:update-models-config",
  GET_LOGS: "neuroagi:get-logs",
  CLEAR_LOGS: "neuroagi:clear-logs",
  LOG_UPDATE: "neuroagi:log-update",
  ADVANCE_SEND: "neuroagi:advance-send",
  ADVANCE_PROGRESS: "neuroagi:advance-progress",
  ADVANCE_CANCEL: "neuroagi:advance-cancel",
};

function subscribe(channel, cb) {
  if (typeof cb !== "function") return () => {};
  const handler = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => ipcRenderer.invoke(CH.PING),

  getUsageTotals: () => ipcRenderer.invoke(CH.GET_USAGE_TOTALS),
  resetUsageTotals: () => ipcRenderer.invoke(CH.RESET_USAGE_TOTALS),
  onUsageUpdate: (cb) => subscribe(CH.USAGE_UPDATE, cb),

  openDevTools: () => ipcRenderer.invoke(CH.OPEN_DEV_TOOLS),

  getModelsConfig: () => ipcRenderer.invoke(CH.GET_MODELS_CONFIG),
  updateModelsConfig: (payload) => ipcRenderer.invoke(CH.UPDATE_MODELS_CONFIG, payload),

  getLogs: () => ipcRenderer.invoke(CH.GET_LOGS),
  clearLogs: () => ipcRenderer.invoke(CH.CLEAR_LOGS),
  onLogUpdate: (cb) => subscribe(CH.LOG_UPDATE, cb),

  advanceSend: (payload) => ipcRenderer.invoke(CH.ADVANCE_SEND, payload),
  advanceCancel: () => ipcRenderer.invoke(CH.ADVANCE_CANCEL),
  onAdvanceProgress: (cb) => subscribe(CH.ADVANCE_PROGRESS, cb),
});
