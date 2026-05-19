const { contextBridge, ipcRenderer } = require("electron");

const CH = {
  PING: "neuroagi:ping",
};

contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => ipcRenderer.invoke(CH.PING),
});
