// supabase/presence.js — presença via Supabase Realtime em canais por usuário.
// Eu publico (track) em `prosa:presence:<minha_pubkey>`; quem me conhece assina
// esse canal, e eu assino o canal dos meus contatos. Presença é efêmera por
// definição — nada é persistido no Postgres.
import { getSupabase } from './client.js';

const PREFIX = 'prosa:presence:';

// Retorna null sem hub configurado — presença passa a depender só do DataChannel.
// `client` injetável para testes; default é o client real do hub.
export function createPresence({ pubkey, profile = {}, onPeer, client } = {}) {
  client = client ?? getSupabase();
  if (!client || !pubkey) return null;

  const myChannel = client.channel(PREFIX + pubkey, {
    config: { presence: { key: pubkey } },
  });
  const watched = new Map(); // peerPub -> channel

  const payload = (state = {}) => ({
    displayName: profile.displayName || '', ts: Date.now(), ...state,
  });

  // (re)SUBSCRIBED cobre também a reconexão automática do realtime-js
  myChannel.subscribe((status) => {
    if (status === 'SUBSCRIBED') myChannel.track(payload()).catch(() => {});
  });

  const lastState = new Map(); // peerPub -> 'online' | 'offline' (último sync)

  const syncPeer = (peerPub) => {
    const ch = watched.get(peerPub);
    if (!ch) return;
    const state = Object.keys(ch.presenceState()).length > 0 ? 'online' : 'offline';
    lastState.set(peerPub, state);
    onPeer?.(peerPub, state);
  };

  const unwatchPeer = (peerPub) => {
    const ch = watched.get(peerPub);
    if (!ch) return;
    watched.delete(peerPub);
    lastState.delete(peerPub);
    ch.unsubscribe().catch(() => {});
    onPeer?.(peerPub, 'offline');
  };

  return {
    publish: (state = {}) => myChannel.track(payload(state)).catch(() => {}),

    watchPeer(peerPub) {
      if (!peerPub || peerPub === pubkey || watched.has(peerPub)) return;
      const ch = client.channel(PREFIX + peerPub);
      ch.on('presence', { event: 'sync' }, () => syncPeer(peerPub))
        .on('presence', { event: 'leave' }, () => syncPeer(peerPub))
        .subscribe();
      watched.set(peerPub, ch);
    },
    unwatchPeer,
    // último estado visto no hub — 'offline' se nunca observado
    stateOf: (peerPub) => lastState.get(peerPub) || 'offline',

    dispose() {
      for (const peerPub of [...watched.keys()]) unwatchPeer(peerPub);
      myChannel.unsubscribe().catch(() => {});
    },
  };
}
