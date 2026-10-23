// presence-sources.js — reconcilia as duas fontes de presença do nó:
// DataChannel (DC aberto + evento de controle 'presence') e hub Supabase
// (track no Realtime). Precedência: DC > hub > offline. peer.closed só
// derruba a fonte DC — quem segue online no hub continua online.
export function createPresenceSources({ onChange } = {}) {
  const dc = new Map();   // userId -> status visto via DC
  const hub = new Map();  // userId -> status visto via hub

  const resolve = (userId) => dc.get(userId) || hub.get(userId) || 'offline';
  const apply = (src, userId, value) => {
    const m = src === 'dc' ? dc : hub;
    if (value == null) m.delete(userId); else m.set(userId, value);
    onChange?.(userId, resolve(userId));
  };

  return {
    resolve,
    // 'dc' | 'hub' — valores: online/idle/dnd/invisible/offline (invisivel vira offline na UI)
    update: (src, userId, value) => apply(src, userId, value),
    dcOpen: (userId) => apply('dc', userId, 'online'),
    dcClosed: (userId) => apply('dc', userId, null),
  };
}
