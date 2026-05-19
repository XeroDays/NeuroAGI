const { ipcMain } = require("electron");
const channels = require("../../shared/ipc/channels");

function registerIpcHandlers() {
  ipcMain.handle(channels.PING, async () => "pong");
}

module.exports = { registerIpcHandlers };
