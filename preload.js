const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Add APIs here when needed (e.g. for IPC between renderer and main)
});
