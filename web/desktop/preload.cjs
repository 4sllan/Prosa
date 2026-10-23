const { contextBridge, ipcRenderer } = require('electron');

// Superfície mínima e segura exposta ao renderer (contextIsolation)
contextBridge.exposeInMainWorld('prosaDesktop', {
  isDesktop: true,
  platform: process.platform,
  // API base configurável: env PROSA_API_URL tem precedência sobre o build
  apiBase: process.env.PROSA_API_URL || '',
  appInfo: () => ipcRenderer.invoke('app:info'),
  ensureMicrophoneAccess: () => ipcRenderer.invoke('media:ensure-microphone-access'),
  // P2P: ops tipadas — o renderer nunca acessa chave privada nem SQL.
  p2p: {
    pubkey: () => ipcRenderer.invoke('p2p:pubkey'),
    fingerprint: () => ipcRenderer.invoke('p2p:fingerprint'),
    sign: (dataB64) => ipcRenderer.invoke('p2p:sign', dataB64),
    verify: (pubKeyHex, dataB64, sigB64) => ipcRenderer.invoke('p2p:verify', pubKeyHex, dataB64, sigB64),
    store: (op, args) => ipcRenderer.invoke('p2p:store', op, args),
  },
});
