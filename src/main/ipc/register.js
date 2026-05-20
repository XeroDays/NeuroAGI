const { ipcMain } = require("electron");
const channels = require("../../shared/ipc/channels");
const { streamChat } = require("../services/api-helper");
const { StartReportcollection } = require("../middlewares/collector-middleware");

function registerIpcHandlers() {
  ipcMain.handle(channels.PING, async () => "pong");

  ipcMain.handle(channels.START_REPORT_COLLECTION, async (_event, payload) => {
    return StartReportcollection(payload || {});
  });

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
