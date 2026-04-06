const { app, BrowserWindow, dialog, Menu, MenuItem } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

const isDev = !app.isPackaged;

let serverProcess = null;

function getServerScript() {
  if (isDev) return path.join(__dirname, '../server/src/index.js');
  return path.join(process.resourcesPath, 'server/src/index.js');
}

function getClientDist() {
  if (isDev) return path.join(__dirname, '../client/dist');
  return path.join(process.resourcesPath, 'client-dist');
}

function getYtDlpPath() {
  if (isDev) return 'yt-dlp';
  const ext = process.platform === 'win32' ? '.exe' : '';
  const bundled = path.join(process.resourcesPath, `yt-dlp${ext}`);
  return fs.existsSync(bundled) ? bundled : 'yt-dlp';
}

function getDbPath() {
  return path.join(app.getPath('userData'), 'audir.db');
}

function startServer() {
  const serverScript = getServerScript();

  // Always use system node — works on Node.js 22+ (--experimental-sqlite is harmless on 25+)
  serverProcess = spawn('node', ['--experimental-sqlite', serverScript], {
    env: {
      ...process.env,
      PORT: '3001',
      CLIENT_DIST_PATH: getClientDist(),
      YTDLP_PATH: getYtDlpPath(),
      DB_PATH: getDbPath(),
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  serverProcess.stdout?.on('data', d => console.log('[server]', d.toString().trim()));
  serverProcess.stderr?.on('data', d => console.error('[server]', d.toString().trim()));
  serverProcess.on('exit', code => console.log('[server] exited with code', code));
}

function waitForServer(retries = 60) {
  return new Promise((resolve, reject) => {
    function attempt(n) {
      const req = http.get('http://localhost:3001/api/health', res => {
        resolve();
      });
      req.on('error', () => {
        if (n > 0) setTimeout(() => attempt(n - 1), 500);
        else reject(new Error('Server did not start in time'));
      });
      req.end();
    }
    attempt(retries);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'Audir',
    show: false,
  });

  win.loadURL('http://localhost:3001');
  win.setMenuBarVisibility(false);

  // Right-click context menu (copy/paste/cut)
  win.webContents.on('context-menu', (e, params) => {
    const menu = new Menu();
    if (params.isEditable) {
      if (params.selectionText) {
        menu.append(new MenuItem({ role: 'cut', label: 'Вырезать' }));
        menu.append(new MenuItem({ role: 'copy', label: 'Копировать' }));
      }
      menu.append(new MenuItem({ role: 'paste', label: 'Вставить' }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ role: 'selectAll', label: 'Выделить всё' }));
    } else if (params.selectionText) {
      menu.append(new MenuItem({ role: 'copy', label: 'Копировать' }));
    }
    if (menu.items.length > 0) menu.popup();
  });

  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(async () => {
  startServer();

  try {
    await waitForServer();
    createWindow();
  } catch (e) {
    const { shell } = require('electron');
    const choice = dialog.showMessageBoxSync({
      type: 'error',
      title: 'Audir — Startup Error',
      message: 'Failed to start the server.',
      detail: 'Most likely cause: Node.js is not installed.\n\nClick "Download Node.js" to open the download page, or "Close" to exit.',
      buttons: ['Download Node.js', 'Close'],
      defaultId: 0,
    });
    if (choice === 0) shell.openExternal('https://nodejs.org/en/download');
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  app.quit();
});
