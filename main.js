const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { streamChat } = require('./api-helper');

const iconPath = path.join(__dirname, 'renderer', 'assets', 'images', 'logo.png');

ipcMain.on('openrouter-stream-start', (event, payload) => {
  const { requestId, messages } = payload || {};
  if (!requestId || !Array.isArray(messages)) {
    return;
  }
  const sender = event.sender;
  streamChat(
    messages,
    (text) => {
      sender.send('openrouter-stream-event', { requestId, type: 'chunk', text });
    },
    () => {
      sender.send('openrouter-stream-event', { requestId, type: 'done' });
    },
    (err) => {
      const message = err instanceof Error ? err.message : String(err);
      sender.send('openrouter-stream-event', { requestId, type: 'error', message });
    }
  );
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
    .then(() => {
      mainWindow.show();
      mainWindow.focus();
    })
    .catch((err) => {
      console.error('Failed to load renderer/index.html:', err);
    });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.setIcon(iconPath);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
