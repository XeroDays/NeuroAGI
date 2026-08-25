const { ipcMain, app, shell } = require("electron");
const channels = require("../../shared/ipc/channels");
const { buildAppInfo } = require("./app-info");

const SPLASH_ALLOWED_URLS = new Set([
  "https://www.softasium.com",
  "https://openrouter.ai/keys",
  "https://app.tavily.com/home",
]);

let splashHandlersRegistered = false;

function registerSplashHandlers() {
  if (splashHandlersRegistered) return;
  splashHandlersRegistered = true;

  ipcMain.handle(channels.GET_APP_INFO, async () => buildAppInfo());

  ipcMain.handle(channels.QUIT_APP, async () => {
    app.quit();
    return { ok: true };
  });

  ipcMain.handle(channels.OPEN_EXTERNAL_URL, async (_event, url) => {
    if (typeof url !== "string" || !SPLASH_ALLOWED_URLS.has(url)) {
      return { ok: false };
    }
    await shell.openExternal(url);
    return { ok: true };
  });
}

module.exports = { registerSplashHandlers };
