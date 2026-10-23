// supabase/signaling.js — canal `prosa:user:<pubkey>` no Realtime (rendezvous).
// Dois eventos: 'signal' (SDP/ICE — {v,kind:'desc'|'ice',sess,from,to,data}) e
// 'notify' (convites/relacionamento — {v,kind:'invite'|'relationship',state?,...}).
// Quem quer falar comigo publica no meu canal. Tudo efêmero — persistência fica
// no Postgres, transporte de dados no DataChannel.
import { getSupabase } from './client.js';
import { logDiag } from '../p2p/diag.js';

const SUBSCRIBE_TIMEOUT = 10000;

function waitSubscribed(ch, topic) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout: ' + topic)), SUBSCRIBE_TIMEOUT);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        reject(new Error(status.toLowerCase() + ': ' + topic));
      }
    });
  });
}

// Retorna null sem hub configurado — o nó segue só com pareamento manual.
export function createSignaling({ pubkey, client } = {}) {
  client ??= getSupabase();
  if (!client || !pubkey) return null;

  const listeners = new Set();
  const notifyListeners = new Set();
  const outbox = new Map(); // peerPubkey -> Promise<channel>

  const dispatch = (set, diag) => ({ payload }) => {
    if (!payload || payload.to !== pubkey || typeof payload.from !== 'string') return;
    for (const fn of set) {
      try { fn(payload); } catch (e) { logDiag(diag, e?.message || 'err'); }
    }
  };

  const inbox = client.channel(`prosa:user:${pubkey}`);
  inbox.on('broadcast', { event: 'signal' }, dispatch(listeners, 'signal.listener'))
    .on('broadcast', { event: 'notify' }, dispatch(notifyListeners, 'notify.listener'));
  waitSubscribed(inbox, 'inbox').catch(e => logDiag('signal.inbox', e.message));

  const channelTo = (to) => {
    let pending = outbox.get(to);
    if (!pending) {
      const ch = client.channel(`prosa:user:${to}`);
      pending = waitSubscribed(ch, to).then(() => ch).catch(e => {
        outbox.delete(to);
        throw e;
      });
      outbox.set(to, pending);
    }
    return pending;
  };

  return {
    onSignal(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onNotify(fn) { notifyListeners.add(fn); return () => notifyListeners.delete(fn); },
    async send(to, msg) {
      const ch = await channelTo(to);
      return ch.send({ type: 'broadcast', event: 'signal', payload: { v: 1, ...msg, from: pubkey, to } });
    },
    // convites/relacionamento: {kind:'invite'|'relationship', state?, profile?}
    async sendNotify(to, msg) {
      const ch = await channelTo(to);
      return ch.send({ type: 'broadcast', event: 'notify', payload: { v: 1, ...msg, from: pubkey, to } });
    },
    async dispose() {
      listeners.clear();
      notifyListeners.clear();
      await inbox.unsubscribe();
      for (const pending of outbox.values()) {
        const ch = await pending.catch(() => null);
        await ch?.unsubscribe();
      }
      outbox.clear();
    },
  };
}
