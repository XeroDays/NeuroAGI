const { ipcMain } = require("electron");
const channels = require("../../shared/ipc/channels");
const { StartReportcollection } = require("../middlewares/collector-middleware");

function registerIpcHandlers() {
  ipcMain.handle(channels.PING, async () => "pong");

  ipcMain.handle(channels.START_REPORT_COLLECTION, async (_event, payload) => {
    return StartReportcollection(payload || {});
  });
}

module.exports = { registerIpcHandlers };
