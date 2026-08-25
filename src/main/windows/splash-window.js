const { BrowserWindow, screen } = require("electron");
const path = require("path");

const iconPath = path.join(__dirname, "../../renderer/assets/icons/app icon.png");

function createSplashWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.round(workArea.width * 0.448);

  const win = new BrowserWindow({
    width,
    height: 387,
    useContentSize: true,
    center: true,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: "#24101c",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "../../preload/splash-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "../../renderer/splash.html"));
  return win;
}

module.exports = { createSplashWindow };
