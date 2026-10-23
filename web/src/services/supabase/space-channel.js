// supabase/space-channel.js — canal `prosa:space:<spaceId>` no Realtime.
// Broadcast 'relay': envelopes assinados de dominio para membros online-no-hub
// sem DataChannel (o receptor valida assinatura/seq — o canal nao e confiavel).
// Broadcast 'ctl': efemeros leves como typing. Tudo best-effort.
import { getSupabase } from './client.js';
import { logDiag } from '../p2p/diag.js';

const PREFIX = 'prosa:space:';
const SUBSCRIBE_TIMEOUT = 10000;
const SEEN_CAP = 5000;

export function createSpaceChannels({ pubkey, client, onRelay, onCtl } = {}) {
  client ??= getSupabase();
  if (!client || !pubkey) return null;

  const channels = new Map(); // spaceId -> { ch, ready }
  const seen = new Map();     // spaceId -> Set<eventId> (dedupe preliminar)

  const markSeen = (spaceId, id) => {
    const s = seen.get(spaceId) || new Set();
    if (s.has(id)) return false;
    s.add(id);
    if (s.size > SEEN_CAP) s.delete(s.values().next().value);
    seen.set(spaceId, s);
    return true;
  };

  // resolve o canal inscrito; cria+assina sob demanda (join e publish)
  const channelFor = (spaceId) => {
    const existing = channels.get(spaceId);
    if (existing) return existing.ready;
    const ch = client.channel(PREFIX + spaceId);
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout: ' + spaceId)), SUBSCRIBE_TIMEOUT);
      const done = (fn, arg) => { clearTimeout(timer); fn(arg); };
      ch.on('broadcast', { event: 'relay' }, ({ payload }) => {
        const env = payload?.env;
        if (!env || env.author === pubkey || env.spaceId !== spaceId) return;
        if (!markSeen(spaceId, env.id)) return;
        try { onRelay?.(env); } catch (e) { logDiag('space.relay', e?.message || 'err'); }
      }).on('broadcast', { event: 'ctl' }, ({ payload }) => {
        if (!payload?.type || payload.from === pubkey) return;
        try { onCtl?.(payload); } catch (e) { logDiag('space.ctl', e?.message || 'err'); }
      }).subscribe((status) => {
        if (status === 'SUBSCRIBED') done(resolve, ch);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') done(reject, new Error(status.toLowerCase()));
      });
    }).catch(e => { channels.delete(spaceId); throw e; });
    channels.set(spaceId, { ch, ready });
    return ready;
  };

  return {
    channels,
    join(spaceId) { if (spaceId) channelFor(spaceId).catch(e => logDiag('space.join', e?.message || 'err')); },
    joined: (spaceId) => channels.has(spaceId),
    leave(spaceId) {
      const entry = channels.get(spaceId);
      channels.delete(spaceId); seen.delete(spaceId);
      entry?.ch?.unsubscribe?.().catch?.(() => {});
    },
    async publishRelay(spaceId, env) {
      if (!spaceId || !env) return false;
      try {
        const ch = await channelFor(spaceId);
        await ch.send({ type: 'broadcast', event: 'relay', payload: { v: 1, kind: 'relay', env } });
        return true;
      } catch (e) { logDiag('space.relay.send', e?.message || 'err'); return false; }
    },
    async publishCtl(spaceId, msg) {
      if (!spaceId || !msg?.type) return false;
      try {
        const ch = await channelFor(spaceId);
        await ch.send({ type: 'broadcast', event: 'ctl', payload: { v: 1, kind: 'ctl', from: pubkey, ts: Date.now(), ...msg } });
        return true;
      } catch (e) { logDiag('space.ctl.send', e?.message || 'err'); return false; }
    },
    dispose() { for (const id of [...channels.keys()]) this.leave(id); },
  };
}
