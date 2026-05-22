const { ipcMain, BrowserWindow } = require("electron");
const channels = require("../../shared/ipc/channels");
const {
  StartReportcollection,
  SubmitQuestionnaire,
  GotoLaboratory,
  SubmitLaboratory,
  GotoPreDoctorRoom,
  SubmitPreDoctorRoom,
  StartDoctor,
} = require("../middlewares/collector-middleware");
const usageTracker = require("../services/usage-tracker");

function registerIpcHandlers() {
  ipcMain.handle(channels.PING, async () => "pong");

  ipcMain.handle(channels.START_REPORT_COLLECTION, async (_event, payload) => {
    return StartReportcollection(payload || {});
  });

  ipcMain.handle(channels.SUBMIT_QUESTIONNAIRE, async (_event, payload) => {
    return SubmitQuestionnaire(payload || {});
  });

  ipcMain.handle(channels.GOTO_LABORATORY, async (_event, payload) => {
    return GotoLaboratory(payload || {});
  });

  ipcMain.handle(channels.SUBMIT_LABORATORY, async (_event, payload) => {
    return SubmitLaboratory(payload || {});
  });

  ipcMain.handle(channels.GOTO_PRE_DOCTOR_ROOM, async (_event, payload) => {
    return GotoPreDoctorRoom(payload || {});
  });

  ipcMain.handle(channels.SUBMIT_PRE_DOCTOR_ROOM, async (_event, payload) => {
    return SubmitPreDoctorRoom(payload || {});
  });

  ipcMain.handle(channels.START_DOCTOR, (event, payload) => {
    return StartDoctor(payload || {}, event.sender);
  });

  ipcMain.handle(channels.GET_USAGE_TOTALS, () => usageTracker.getTotals());

  ipcMain.handle(channels.OPEN_DEV_TOOLS, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.webContents.toggleDevTools();
    return { ok: true };
  });
}

module.exports = { registerIpcHandlers };
