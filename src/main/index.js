require("dotenv").config();
const { app, Menu } = require("electron");
const { createMainWindow } = require("./windows/main-window");
const { registerIpcHandlers } = require("./ipc/register");
const modelConfigService = require("./services/model-config-service");

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  modelConfigService.init();
  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    const { BrowserWindow } = require("electron");
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
