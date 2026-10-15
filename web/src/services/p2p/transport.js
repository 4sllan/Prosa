// p2p/transport.js — camada de transporte P2P.
// Gerencia peers (DataChannels), envio direto, broadcast por espaço,
// dedupe por event id, ACKs e fila offline. A lógica é testável com
// MockChannel — RTCPeerConnection real é plugado por pairing.js.

const handlers = {};
const seen = new Set();
const SEEN_CAP = 20000;
const pendingAcks = new Map();   // eventId -> Set<peerId> que ackou
const ackWaiters = new Map();    // eventId -> {resolve, timer, received, expect}
const peers = new Map();         // peerId -> { channel, state }
const spacePeers = new Map();    // spaceId -> Set<peerId>
const pendingQueue = new Map();  // peerId -> [env]
const QUEUE_CAP = 500;
const presences = new Map();     // peerId -> {presence, ts}

let me = null;                   // { id }
let emit = () => {};
let log = () => {};

export function configureTransport({ myId, emitEvent, logger } = {}) {
  if (myId) me = { id: myId };
  if (emitEvent) emit = emitEvent;
  if (logger) log = logger;
}

function markSeen(id) {
  seen.add(id);
  if (seen.size > SEEN_CAP) seen.delete(seen.values().next().value);
}
export function resetTransportState() {
  seen.clear(); pendingAcks.clear(); ackWaiters.clear();
  peers.clear(); spacePeers.clear(); pendingQueue.clear(); presences.clear();
}

export const p2pTransport = {
  on(type, fn) { (handlers[type] ||= []).push(fn); },

  // ---- peers ----
  addPeer(peerId, channel) {
    peers.set(peerId, { channel, state: 'open' });
    presences.set(peerId, { presence: 'online', ts: Date.now() });
    channel.onclose = () => this.dropPeer(peerId);
    emit('peer.open', { peerId });
    flushPending(peerId);
  },
  dropPeer(peerId) {
    const p = peers.get(peerId);
    if (p) { p.state = 'closed'; try { p.channel.close(); } catch {} }
    presences.set(peerId, { presence: 'offline', ts: Date.now() });
    emit('peer.closed', { peerId });
  },
  peerIds: () => [...peers.keys()].filter(id => peers.get(id).state === 'open'),
  isOnline: (peerId) => peers.get(peerId)?.state === 'open',
  presenceOf: (peerId) => presences.get(peerId),

  // ---- espaços ----
  joinSpace(spaceId, peerId) {
    const s = spacePeers.get(spaceId) || new Set();
    s.add(peerId); spacePeers.set(spaceId, s);
  },
  leaveSpace(spaceId, peerId) { spacePeers.get(spaceId)?.delete(peerId); },
  spaceMembers: (spaceId) => [...(spacePeers.get(spaceId) || [])],

  // ---- envio ----
  send(peerId, env) {
    const p = peers.get(peerId);
    if (p?.state !== 'open') { enqueue(peerId, env); return false; }
    return sendNow(p.channel, env);
  },

  // broadcast para todos os membros online de um espaço (ou todos os peers se spaceId vazio/*)
  broadcast(spaceId, env, { skip } = {}) {
    const targets = spaceId && spaceId !== '*'
      ? (spacePeers.get(spaceId) || new Set())
      : new Set(peers.keys());
    let n = 0;
    for (const peerId of targets) {
      if (peerId === skip || peerId === me?.id) continue;
      if (this.send(peerId, env)) n++;
    }
    return n;
  },

  // recebeu mensagem bruta de um canal — valida, deduplica, ack, dispara
  receive(peerId, env) {
    if (!env?.id || seen.has(env.id)) return false;
    markSeen(env.id);
    if (env.type === 'ack') {
      pendingAcks.get(env.body?.of)?.add(peerId);
      const w = ackWaiters.get(env.body?.of);
      if (w) {
        w.received.add(peerId);
        if (w.received.size >= w.expect) { clearTimeout(w.timer); w.resolve([...w.received]); ackWaiters.delete(env.body.of); }
      }
      return true;
    }
    if (env.body?.expectAck) {
      this.send(peerId, { v: 1, id: `ack:${env.id}:${me?.id}`, spaceId: env.spaceId, from: me?.id, to: peerId, type: 'ack', ts: Date.now(), body: { of: env.id } });
    }
    dispatch(peerId, env);
    return true;
  },

  // espera acks de um conjunto de peers por até ms
  waitAcks(eventId, peerIds, ms = 5000) {
    return new Promise((resolve) => {
      const got = pendingAcks.get(eventId);
      if (got && peerIds.every(p => got.has(p))) return resolve([...got]);
      const w = {
        expect: peerIds.length, received: new Set(got || []), resolve,
        timer: setTimeout(() => { ackWaiters.delete(eventId); resolve([...w.received]); }, ms),
      };
      if (w.received.size >= w.expect) { clearTimeout(w.timer); return resolve([...w.received]); }
      ackWaiters.set(eventId, w);
    });
  },
  acksFor: (eventId) => pendingAcks.get(eventId) || new Set(),

  // ---- mensagens de controle (não persistidas) ----
  sendToPeer(peerId, type, body, spaceId = '*') {
    this.send(peerId, {
      v: 1, id: `ctl:${type}:${me?.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      spaceId, from: me?.id, to: peerId, type, ts: Date.now(), body,
    });
  },
  spaceEvent(type, spaceId, body) {
    this.broadcast(spaceId, {
      v: 1, id: `ctl:${type}:${spaceId}:${me?.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      spaceId, from: me?.id, type, ts: Date.now(), body,
    });
  },

  setPresence(presence) {
    presences.set(me?.id, { presence, ts: Date.now() });
    this.spaceEvent('presence', '*', { presence });
  },
  typing: (channelId) => p2pTransport.spaceEvent('typing', channelId, { channelId }),
  joinVoice: (channelId) => p2pTransport.spaceEvent('voice_state', channelId, { channelId, state: 'join' }),
  leaveVoice: (channelId) => p2pTransport.spaceEvent('voice_state', channelId, { channelId, state: 'leave' }),
  updateVoice: (channelId, state) => p2pTransport.spaceEvent('voice_state', channelId, { channelId, state: 'update', ...state }),
  signal(channelId, to, data) {
    this.sendToPeer(to, 'signal', { channelId, data }, channelId);
  },

  // contatos / convites — implementados nas tasks 12–14
  requestContact: async (pubkey) => ({ peerId: pubkey }),
  acceptContact: async (peerId) => ({ peerId }),
  removeContact: async (peerId) => ({ peerId }),
  blockContact: async (peerId) => ({ peerId }),
  unblockContact: async (peerId) => ({ peerId }),
  acceptInvite: async () => { throw new Error('Convites P2P chegam na task 14'); },
};

function dispatch(peerId, env) {
  const payload = { ...env.body, peerId, eventId: env.id, envelope: env };
  emit(env.type, payload);
  for (const fn of handlers[env.type] || []) fn(payload);
}

function sendNow(channel, env) {
  try {
    if (channel.bufferedAmount > (channel.bufferedAmountLowThreshold || 1 << 20)) {
      channel.addEventListener?.('bufferedamountlow', () => sendNow(channel, env), { once: true });
      return true;
    }
    channel.send(JSON.stringify(env));
    return true;
  } catch (e) { log(`send fail: ${e.message}`); return false; }
}

function enqueue(peerId, env) {
  const q = pendingQueue.get(peerId) || [];
  q.push(env);
  if (q.length > QUEUE_CAP) q.shift();
  pendingQueue.set(peerId, q);
}

export function flushPending(peerId) {
  const q = pendingQueue.get(peerId) || [];
  pendingQueue.delete(peerId);
  let sent = 0;
  for (const env of q) if (p2pTransport.send(peerId, env)) sent++;
  return sent;
}
