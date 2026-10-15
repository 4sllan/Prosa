// p2p/localconfig.js — config local do nó em modo P2P (sem /api/config).
// ICE servers vêm de env/localStorage; defaults públicos STUN do Google.

const DEFAULT_ICE = [{ urls: 'stun:stun.l.google.com:19302' }];

export function getLocalConfig() {
  let ice = DEFAULT_ICE;
  try {
    const raw = localStorage.getItem('prosa_ice') || (import.meta?.env?.VITE_ICE_SERVERS_JSON);
    if (raw) ice = JSON.parse(raw);
  } catch {}
  return { name: 'Prosa', mode: 'p2p', iceServers: ice };
}
