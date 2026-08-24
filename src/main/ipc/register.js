const { ipcMain, BrowserWindow } = require("electron");
const channels = require("../../shared/ipc/channels");
const { GetModelsConfig, UpdateModelsConfig } = require("../middlewares/cookie-middleware");
const { SendAdvanceChat, CancelAdvanceChat } = require("../middlewares/advance-middleware");
const usageTracker = require("../services/usage-tracker");
const logService = require("../services/log-service");

function registerIpcHandlers() {
  ipcMain.handle(channels.PING, async () => "pong");

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

  ipcMain.handle(channels.ADVANCE_SEND, async (event, payload) => {
    return SendAdvanceChat(payload || {}, event.sender);
  });

  ipcMain.handle(channels.ADVANCE_CANCEL, (event) => {
    return CancelAdvanceChat(event.sender);
  });
}

module.exports = { registerIpcHandlers };
