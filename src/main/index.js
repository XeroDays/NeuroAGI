const { app, Menu, BrowserWindow, ipcMain } = require("electron");
const { loadCredentials } = require("./services/credentials-store");
const { createSplashWindow } = require("./windows/splash-window");
const { registerSplashHandlers } = require("./ipc/register-splash-handlers");
const channels = require("../shared/ipc/channels");

function sendSplashStatus(splash, text, options = {}) {
  if (splash && !splash.isDestroyed() && splash.webContents && !splash.webContents.isDestroyed()) {
    const loading = options.loading !== false;
    const denied = options.denied === true;
    splash.webContents.send(channels.SPLASH_STATUS, { text, loading, denied });
  }
}

function waitForWebContentsLoad(win) {
  if (!win || win.isDestroyed() || !win.webContents || win.webContents.isDestroyed()) {
    return Promise.resolve();
  }
  if (!win.webContents.isLoading()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    win.webContents.once("did-finish-load", resolve);
  });
}

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Upper bound on waiting for the splash fade; it must never stall startup. */
const SPLASH_FADE_TIMEOUT_MS = 500;

/**
 * Ask the splash to play its exit animation and resolve once it reports back.
 * Replaces the fixed one-second pause that used to sit before the handoff.
 */
function fadeOutSplash(splash) {
  if (!splash || splash.isDestroyed() || !splash.webContents || splash.webContents.isDestroyed()) {
    return Promise.resolve();
  }

  splash.webContents.send(channels.SPLASH_FADE_OUT);

  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      ipcMain.removeListener(channels.SPLASH_FADE_DONE, finish);
      resolve();
    };
    const timer = setTimeout(finish, SPLASH_FADE_TIMEOUT_MS);
    ipcMain.once(channels.SPLASH_FADE_DONE, finish);
  });
}

function loadHeavyModules() {
  return new Promise((resolve) => {
    setImmediate(() => {
      const { registerIpcHandlers } = require("./ipc/register");
      const { createMainWindow, showMainWindow } = require("./windows/main-window");
      const modelConfigService = require("./services/model-config-service");
      const SoftwareLicensingService = require("./services/software-licensing-service");
      modelConfigService.init();
      registerIpcHandlers();
      resolve({ createMainWindow, showMainWindow, SoftwareLicensingService });
    });
  });
}

function getMainWindow() {
  const windows = BrowserWindow.getAllWindows().filter((w) => {
    if (w.isDestroyed()) return false;
    const url = w.webContents?.getURL?.() ?? "";
    return !url.includes("splash.html");
  });
  return windows.length > 0 ? windows[0] : null;
}

async function bootstrap() {
  registerSplashHandlers();

  const splash = createSplashWindow();
  await waitForWebContentsLoad(splash);

  if (!splash.isDestroyed()) {
    splash.show();
  }

  await yieldToEventLoop();
  await yieldToEventLoop();

  sendSplashStatus(splash, "Starting…");
  await yieldToEventLoop();

  const deps = await loadHeavyModules();
  const main = deps.createMainWindow();

  const [licenseResult] = await Promise.all([
    (async () => {
      sendSplashStatus(splash, "Checking for updates…");
      return deps.SoftwareLicensingService.register();
    })(),
    waitForWebContentsLoad(main),
  ]);

  if (!licenseResult.accessGranted) {
    sendSplashStatus(splash, "Access denied, please contact customer service.", {
      loading: false,
      denied: true,
    });
    if (!main.isDestroyed()) main.destroy();
    return;
  }

  sendSplashStatus(splash, "Loading workspace…");

  if (!main.isDestroyed() && main.webContents && !main.webContents.isDestroyed()) {
    main.webContents.send(channels.LICENSE_UPDATE, licenseResult);
  }

  // Cross-fade: the splash dims while the main window rises behind it.
  const splashFaded = fadeOutSplash(splash);

  if (!main.isDestroyed()) {
    deps.showMainWindow(main);
  }

  await splashFaded;

  if (!splash.isDestroyed()) {
    splash.close();
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  loadCredentials();
  bootstrap();

  app.on("activate", () => {
    const mainWin = getMainWindow();
    if (!mainWin) {
      bootstrap();
    } else if (!mainWin.isDestroyed()) {
      mainWin.show();
      mainWin.focus();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
