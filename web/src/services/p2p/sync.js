// p2p/sync.js — sincronização por espaço entre peers.
// Quando um peer abre conexão, cada lado anuncia seu maxSeq por autor;
// quem está atrasado pede os eventos que faltam e os aplica.
import { p2pTransport } from './transport.js';
import { maxSeqMap as localMaxSeqMap, eventsSince } from './syncstore.js';
import { applyEvent, validateEnvelope } from './eventlog.js';

// enviado quando peer conecta (ou periodicamente)
export async function sendSyncReq(peerId, spaceId) {
  p2pTransport.sendToPeer(peerId, 'sync_req', {
    spaceId,
    have: await localMaxSeqMap(spaceId),       // {author: maxSeq}
  }, spaceId);
}

// responde a um sync_req com os eventos que o peer não tem
export async function handleSyncReq(fromPeerId, body, store) {
  const { spaceId, have = {} } = body;
  const mine = await localMaxSeqMap(spaceId);
  for (const [author, seq] of Object.entries(mine)) {
    const theirs = have[author] || 0;
    if (seq > theirs) {
      const missing = await eventsSince(store, spaceId, author, theirs);
      for (const e of missing) {
        p2pTransport.sendToPeer(fromPeerId, 'sync_event', { spaceId, event: e }, spaceId);
      }
    }
  }
  p2pTransport.sendToPeer(fromPeerId, 'sync_done', { spaceId }, spaceId);
}

// aplica evento vindo de sync (com validação + dedupe)
export async function handleSyncEvent(fromPeerId, body, store, { verify = true } = {}) {
  const env = body.event;
  if (!env) return { applied: false };
  if (verify) {
    const v = await validateEnvelope(env);
    if (!v.ok) return { applied: false, reason: v.reason };
  }
  return applyEvent(env, store);
}

export async function localMaxSeqMapOf(spaceId, store) {
  return store.maxSeqMap(spaceId);
}
