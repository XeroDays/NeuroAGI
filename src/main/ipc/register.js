const { ipcMain, BrowserWindow } = require("electron");
const channels = require("../../shared/ipc/channels");
const {
  StartReportcollection,
  SubmitQuestionnaire,
} = require("../middlewares/collector-middleware");

function registerIpcHandlers() {
  ipcMain.handle(channels.PING, async () => "pong");

  ipcMain.handle(channels.START_REPORT_COLLECTION, async (_event, payload) => {
    return StartReportcollection(payload || {});
  });

  ipcMain.handle(channels.SUBMIT_QUESTIONNAIRE, async (_event, payload) => {
    return SubmitQuestionnaire(payload || {});
  });

  ipcMain.handle(channels.OPEN_DEV_TOOLS, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.webContents.toggleDevTools();
    return { ok: true };
  });
}

module.exports = { registerIpcHandlers };
