const { BrowserWindow } = require("electron");
const path = require("path");

const iconPath = path.join(__dirname, "../../renderer/assets/icons/app icon.png");

function createMainWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    autoHideMenuBar: true,
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "../../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "../../renderer/index.html"));

  win.once("ready-to-show", () => {
    if (process.platform === "darwin") {
      const { app } = require("electron");
      app.dock.setIcon(iconPath);
    }
  });

  return win;
}

function showMainWindow(win) {
  if (!win || win.isDestroyed()) return;
  win.maximize();
  win.show();
  win.focus();
}

module.exports = { createMainWindow, showMainWindow };
