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
  });

  return win;
}

/** Duration of the window-level fade-in that replaces the hard cut from splash. */
const FADE_IN_MS = 240;
const FADE_STEP_MS = 16;

function showMainWindow(win) {
  if (!win || win.isDestroyed()) return;

  win.maximize();
  win.setOpacity(0);
  win.show();
  win.focus();

  const start = Date.now();
  const step = () => {
    if (win.isDestroyed()) return;
    const progress = Math.min(1, (Date.now() - start) / FADE_IN_MS);
    win.setOpacity(progress);
    if (progress < 1) setTimeout(step, FADE_STEP_MS);
  };
  step();

  // Guarantees a visible window even if setOpacity is a no-op on this platform.
  setTimeout(() => {
    if (!win.isDestroyed()) win.setOpacity(1);
  }, FADE_IN_MS + 200);
}

module.exports = { createMainWindow, showMainWindow };
