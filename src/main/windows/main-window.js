const { BrowserWindow } = require("electron");
const path = require("path");

const iconPath = path.join(__dirname, "../../renderer/assets/icons/NeuroLogo.png");

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
    win.show();
    win.focus();
  });

  return win;
}

module.exports = { createMainWindow };
