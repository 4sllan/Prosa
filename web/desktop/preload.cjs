const { contextBridge, ipcRenderer } = require('electron');

// Superfície mínima e segura exposta ao renderer (contextIsolation)
contextBridge.exposeInMainWorld('prosaDesktop', {
  isDesktop: true,
  platform: process.platform,
  // API base configurável: env PROSA_API_URL tem precedência sobre o build
  apiBase: process.env.PROSA_API_URL || '',
  appInfo: () => ipcRenderer.invoke('app:info'),
});
