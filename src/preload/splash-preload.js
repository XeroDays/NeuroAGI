const { contextBridge, ipcRenderer } = require("electron");

const CH = {
  GET_APP_INFO: "neuroagi:get-app-info",
  SPLASH_STATUS: "neuroagi:splash-status",
  SPLASH_FADE_OUT: "neuroagi:splash-fade-out",
  SPLASH_FADE_DONE: "neuroagi:splash-fade-done",
  QUIT_APP: "neuroagi:quit-app",
  OPEN_EXTERNAL_URL: "neuroagi:open-external-url",
};

contextBridge.exposeInMainWorld("electronAPI", {
  getAppInfo: () => ipcRenderer.invoke(CH.GET_APP_INFO),
  quitApp: () => ipcRenderer.invoke(CH.QUIT_APP),
  openExternalUrl: (url) => ipcRenderer.invoke(CH.OPEN_EXTERNAL_URL, url),
  onSplashStatus(callback) {
    const subscription = (_event, payload) => callback(payload);
    ipcRenderer.on(CH.SPLASH_STATUS, subscription);
    return () => ipcRenderer.removeListener(CH.SPLASH_STATUS, subscription);
  },
  onSplashFadeOut(callback) {
    const subscription = () => callback();
    ipcRenderer.on(CH.SPLASH_FADE_OUT, subscription);
    return () => ipcRenderer.removeListener(CH.SPLASH_FADE_OUT, subscription);
  },
  notifySplashFaded: () => ipcRenderer.send(CH.SPLASH_FADE_DONE),
});
