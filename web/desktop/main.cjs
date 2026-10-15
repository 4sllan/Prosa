const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('node:path');
const store = require('./store.cjs');
const identity = require('./identity.cjs');

// Dev: PROSA_DEV_URL=http://localhost:5173 carrega o Vite; senão, dist/ local.
const DEV_URL = process.env.PROSA_DEV_URL || '';
const API_URL = process.env.PROSA_API_URL || ''; // backend remoto configurável

const ALLOWED_PERMISSIONS = new Set(['media', 'display-capture', 'notifications', 'mediaKeySystem', 'fullscreen']);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Prosa',
    backgroundColor: '#211533',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  });

  // Permissões de mídia para WebRTC (microfone, câmera, tela)
  win.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(ALLOWED_PERMISSIONS.has(permission));
  });
  win.webContents.session.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));

  // Links externos abrem no navegador, nunca em nova janela do app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Bloqueia navegação para fora do app (file:// ou dev URL)
  win.webContents.on('will-navigate', (e, url) => {
    const ok = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith('file://');
    if (!ok) { e.preventDefault(); shell.openExternal(url); }
  });

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  apiBase: API_URL,
}));

// ---- P2P: identidade e storage locais (renderer nunca vê chave privada/SQL) ----
ipcMain.handle('p2p:pubkey', () => identity.pubkey());
ipcMain.handle('p2p:fingerprint', () => identity.fingerprint());
ipcMain.handle('p2p:sign', (_e, dataB64) => {
  if (typeof dataB64 !== 'string' || dataB64.length > 64 * 1024) throw new Error('payload inválido');
  return identity.sign(dataB64);
});
ipcMain.handle('p2p:store', (_e, op, args = {}) => {
  if (typeof op !== 'string' || !(op in store.ops)) throw new Error(`op desconhecida: ${op}`);
  return store.ops[op](args);
});

app.whenReady().then(async () => {
  const dataDir = app.getPath('userData');
  identity.init(dataDir);
  const backendName = await store.init(dataDir);
  console.log(`[p2p] storage backend: ${backendName}`);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
