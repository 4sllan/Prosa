// p2p/diag.js — telemetria de diagnóstico opt-in do caminho P2P.
// Emite console.debug('[p2p:diag]', ...) somente quando
// localStorage.prosa_debug === '1' ou em build dev (import.meta.env.DEV).
// NUNCA logar: IPs literais, chaves privadas, tokens, SDP ou payloads.

const enabled = () =>
  (typeof localStorage !== 'undefined' && localStorage.getItem('prosa_debug') === '1')
  || (typeof import.meta !== 'undefined' && import.meta.env?.DEV);

export function logDiag(tag, data) {
  if (!enabled()) return;
  try { console.debug('[p2p:diag]', tag, data ?? ''); } catch {}
}

// Contador de candidatos ICE por tipo — registra tipos e flags, nunca endereços.
export function diagCandidates() {
  const c = { host: 0, srflx: 0, relay: 0, prflx: 0, mdns: 0, tcp: 0 };
  return {
    add(candidateStr) {
      const parts = (candidateStr || '').split(' ');
      const typ = parts[parts.indexOf('typ') + 1] || '?';
      if (typ in c) c[typ]++;
      if ((parts[4] || '').endsWith('.local')) c.mdns++;
      if (parts[2] === 'tcp') c.tcp++;
    },
    snapshot: () => ({ ...c }),
  };
}

// peerId truncado no formato já exibido pela UI (fingerprint curto).
export function diagFingerprint(id) {
  return typeof id === 'string' ? id.slice(0, 16) + '…' : '?';
}
