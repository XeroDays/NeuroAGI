const { app, BrowserWindow } = require('electron');
const path = require('path');

const iconPath = path.join(__dirname, 'renderer', 'assets', 'images', 'logo.png');

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
