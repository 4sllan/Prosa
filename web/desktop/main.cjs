const { app, BrowserWindow, shell, ipcMain, systemPreferences, desktopCapturer, webContents } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const store = require('./store.cjs');
const identity = require('./identity.cjs');
const { canUsePermission } = require('./permissions.cjs');
const { createMicrophoneAccessHandler } = require('./microphone.cjs');
const { createScreenSharingHandler } = require('./screen-sharing.cjs');

// Dev: PROSA_DEV_URL=http://localhost:5173 carrega o Vite; senão, dist/ local.
const DEV_URL = process.env.PROSA_DEV_URL || '';
const API_URL = process.env.PROSA_API_URL || ''; // backend remoto configurável

const APP_URL = DEV_URL || pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;
const appWebContents = new WeakSet();
const screenSharingSessions = new WeakSet();
const screenSharing = createScreenSharingHandler({
  appUrl: APP_URL,
  isAppWebContents: wc => appWebContents.has(wc),
  fromFrame: frame => webContents.fromFrame(frame),
  desktopCapturer,
  platform: process.platform,
  systemPreferences,
});
ipcMain.handle('media:screen-response', screenSharing.respond);
ipcMain.handle('media:screen-cancel', screenSharing.cancel);

ipcMain.handle('media:ensure-microphone-access', createMicrophoneAccessHandler({
  platform: process.platform,
  systemPreferences,
  appUrl: APP_URL,
  isAppWebContents: wc => appWebContents.has(wc),
}));

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
  appWebContents.add(win.webContents);
  const session = win.webContents.session;
  if (!screenSharingSessions.has(session)) {
    session.setDisplayMediaRequestHandler(screenSharing.request, { useSystemPicker: false });
    screenSharingSessions.add(session);
  }

  const permissionAllowed = (wc, permission, details) => canUsePermission(permission, {
    ...details, requestingUrl: details?.requestingUrl || wc?.getURL(),
  }, APP_URL);
  // Escrita de clipboard somente na pagina principal do app; leitura segue negada.
  win.webContents.session.setPermissionRequestHandler((wc, permission, cb, details) => {
    cb(permissionAllowed(wc, permission, details));
  });
  win.webContents.session.setPermissionCheckHandler((wc, permission, _origin, details) => permissionAllowed(wc, permission, details));

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
ipcMain.handle('p2p:verify', (_e, pubKeyHex, dataB64, sigB64) => {
  if (typeof pubKeyHex !== 'string' || pubKeyHex.length > 512) return false;
  if (typeof dataB64 !== 'string' || dataB64.length > 128 * 1024) return false;
  if (typeof sigB64 !== 'string' || sigB64.length > 1024) return false;
  return identity.verify(pubKeyHex, dataB64, sigB64);
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
