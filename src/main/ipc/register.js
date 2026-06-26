const { ipcMain, BrowserWindow } = require("electron");
const channels = require("../../shared/ipc/channels");
const {
  EnhanceQuery,
  StartReportcollection,
  SubmitQuestionnaire,
  GotoLaboratory,
  SubmitLaboratory,
  GotoPreDoctorRoom,
  SubmitPreDoctorRoom,
  StartDoctor,
  RequestSkipFanout,
} = require("../middlewares/collector-middleware");
const { GetModelsConfig, UpdateModelsConfig } = require("../middlewares/cookie-middleware");
const usageTracker = require("../services/usage-tracker");
const logService = require("../services/log-service");

function registerIpcHandlers() {
  ipcMain.handle(channels.PING, async () => "pong");

  ipcMain.handle(channels.ENHANCE_QUERY, (event, payload) => {
    return EnhanceQuery(payload || {}, event.sender);
  });

  ipcMain.handle(channels.START_REPORT_COLLECTION, async (event, payload) => {
    return StartReportcollection(payload || {}, event.sender);
  });

  ipcMain.handle(channels.SKIP_FANOUT_WAIT, (event) => {
    return RequestSkipFanout(event.sender);
  });

  ipcMain.handle(channels.SUBMIT_QUESTIONNAIRE, async (_event, payload) => {
    return SubmitQuestionnaire(payload || {});
  });

  ipcMain.handle(channels.GOTO_LABORATORY, async (event, payload) => {
    return GotoLaboratory(payload || {}, event.sender);
  });

  ipcMain.handle(channels.SUBMIT_LABORATORY, async (_event, payload) => {
    return SubmitLaboratory(payload || {});
  });

  ipcMain.handle(channels.GOTO_PRE_DOCTOR_ROOM, async (event, payload) => {
    return GotoPreDoctorRoom(payload || {}, event.sender);
  });

  ipcMain.handle(channels.SUBMIT_PRE_DOCTOR_ROOM, async (_event, payload) => {
    return SubmitPreDoctorRoom(payload || {});
  });

  ipcMain.handle(channels.START_DOCTOR, (event, payload) => {
    return StartDoctor(payload || {}, event.sender);
  });

  ipcMain.handle(channels.GET_USAGE_TOTALS, () => usageTracker.getTotals());

  ipcMain.handle(channels.RESET_USAGE_TOTALS, () => {
    usageTracker.resetTotals();
    return { ok: true };
  });

  ipcMain.handle(channels.OPEN_DEV_TOOLS, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.webContents.toggleDevTools();
    return { ok: true };
  });

  ipcMain.handle(channels.GET_MODELS_CONFIG, () => {
    return GetModelsConfig();
  });

  ipcMain.handle(channels.UPDATE_MODELS_CONFIG, (_event, payload) => {
    return UpdateModelsConfig(payload || {});
  });

  ipcMain.handle(channels.GET_LOGS, () => logService.getLogs());

  ipcMain.handle(channels.CLEAR_LOGS, () => {
    logService.clearLogs();
    return { ok: true };
  });
}

module.exports = { registerIpcHandlers };
