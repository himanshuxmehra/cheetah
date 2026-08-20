const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { send } = require('./main/http');
const { Store } = require('./main/store');

if (require('electron-squirrel-startup')) {
  app.quit();
}

const DEFAULT_WORKSPACE = {
  collections: [],
  environments: [],
  activeEnvironment: null,
  history: [],
  tabs: [],
  activeTab: null,
  settings: { theme: 'system', followRedirects: true, verifySsl: true, timeout: 60000 }
};

let workspace;
let mainWindow;
// Lets an in-flight request be cancelled from the UI without tearing down the window.
const inflight = new Map();

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 560,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0e1116',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // External links open in the real browser, never inside the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
};

app.whenReady().then(() => {
  workspace = new Store(app.getPath('userData'), 'workspace', DEFAULT_WORKSPACE);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('workspace:load', () => ({ ...DEFAULT_WORKSPACE, ...workspace.read() }));

ipcMain.handle('workspace:save', (_event, data) => {
  workspace.write(data);
  return true;
});

ipcMain.handle('http:send', async (event, id, request) => {
  const controller = { cancelled: false };
  inflight.set(id, controller);
  try {
    const result = await send(request, (received) => {
      if (!event.sender.isDestroyed()) event.sender.send('http:progress', id, received);
    });
    if (controller.cancelled) return { ok: false, error: 'Request cancelled', cancelled: true };
    return result;
  } finally {
    inflight.delete(id);
  }
});

ipcMain.handle('http:cancel', (_event, id) => {
  const controller = inflight.get(id);
  if (controller) controller.cancelled = true;
  return true;
});

ipcMain.handle('theme:set', (_event, theme) => {
  nativeTheme.themeSource = theme;
  return nativeTheme.shouldUseDarkColors;
});

ipcMain.handle('file:export', async (_event, suggestedName, contents) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: suggestedName,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, contents);
  return { ok: true, path: filePath };
});

ipcMain.handle('file:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePaths.length) return { ok: false };
  return { ok: true, contents: fs.readFileSync(filePaths[0], 'utf8') };
});

ipcMain.handle('file:saveBody', async (_event, suggestedName, base64) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, { defaultPath: suggestedName });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return { ok: true, path: filePath };
});
