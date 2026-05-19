const { ipcMain } = require("electron");
const channels = require("../../shared/ipc/channels");
const { streamChat } = require("../services/api-helper");

function registerIpcHandlers() {
  ipcMain.handle(channels.PING, async () => "pong");

  ipcMain.on(channels.OPENROUTER_STREAM_START, (event, payload) => {
    const { requestId, messages } = payload;
    streamChat(
      messages,
      (text) => {
        event.sender.send(channels.OPENROUTER_STREAM_EVENT, {
          requestId,
          type: "chunk",
          text,
        });
      },
      () => {
        event.sender.send(channels.OPENROUTER_STREAM_EVENT, {
          requestId,
          type: "done",
        });
      },
      (err) => {
        event.sender.send(channels.OPENROUTER_STREAM_EVENT, {
          requestId,
          type: "error",
          message: err?.message || String(err),
        });
      }
    );
  });
}

module.exports = { registerIpcHandlers };
