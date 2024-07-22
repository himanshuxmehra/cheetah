const { app, BrowserWindow } = require('electron/main');
const { format } = require('url');
const path = require('node:path');

async function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true
      //   preload: path.join(__dirname, 'preload.js')
    }
  });
  const dev = false;
  const url = dev ? 'http://localhost:5173' : path.join(__dirname, 'output/index.html');
  mainWindow.loadFile(url).catch((reason) => {
    console.error(`Error: Failed to load URL: "${url}" (Electron shows a blank screen because of this).`);
    console.error('Original message:', reason);
    if (dev) {
      console.error(reason);
    } else {
      console.error(reason);
    }
  });

  // mainWindow.loadURL(url).catch((reason) => {
  //   console.error(`Error: Failed to load URL: "${url}" (Electron shows a blank screen because of this).`);
  //   console.error('Original message:', reason);
  //   if (dev) {
  //     console.error(reason);
  //   } else {
  //     console.error(reason);
  //   }
  // });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
