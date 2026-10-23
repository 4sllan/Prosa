// p2p/transport.js — camada de transporte P2P.
// Gerencia peers (DataChannels), envio direto, broadcast por espaço,
// dedupe por event id, ACKs e fila offline. A lógica é testável com
// MockChannel — RTCPeerConnection real é plugado por pairing.js.

import { logDiag, diagFingerprint } from './diag.js';

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
const lastSeen = new Map();      // peerId -> ts do último envelope recebido
const keepTimers = new Map();    // peerId -> intervalId do keepalive
const KEEPALIVE_MS = 25_000;     // intervalo do ping de controle
const KEEPALIVE_MISS = 3;        // misses consecutivos antes de derrubar

let me = null;                   // { id }
let emit = () => {};
let log = () => {};
let keepaliveMs = KEEPALIVE_MS;
let keepaliveMiss = KEEPALIVE_MISS;
let afterBroadcast = null;       // hook pos-broadcast (relay via hub)

export function configureTransport({ myId, emitEvent, logger, keepaliveMs: kMs, keepaliveMiss: kMiss, afterBroadcast: ab } = {}) {
  if (myId) me = { id: myId };
  if (emitEvent) emit = emitEvent;
  if (logger) log = logger;
  if (kMs) keepaliveMs = kMs;
  if (kMiss) keepaliveMiss = kMiss;
  if (ab !== undefined) afterBroadcast = ab;
}

function markSeen(id) {
  seen.add(id);
  if (seen.size > SEEN_CAP) seen.delete(seen.values().next().value);
}

// eventos locais (peer.open/peer.closed) vão para a UI e para handlers .on()
function emitLocal(type, payload) {
  emit(type, payload);
  for (const fn of handlers[type] || []) fn(payload);
}
export function resetTransportState() {
  seen.clear(); pendingAcks.clear(); ackWaiters.clear();
  for (const t of keepTimers.values()) clearInterval(t);
  peers.clear(); spacePeers.clear(); pendingQueue.clear(); presences.clear();
  lastSeen.clear(); keepTimers.clear();
  keepaliveMs = KEEPALIVE_MS; keepaliveMiss = KEEPALIVE_MISS;
  afterBroadcast = null;
}

export const p2pTransport = {
  on(type, fn) {
    (handlers[type] ||= []).push(fn);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      const index = handlers[type]?.indexOf(fn) ?? -1;
      if (index !== -1) handlers[type].splice(index, 1);
    };
  },

  // ---- peers ----
  addPeer(peerId, channel, { keepalive = true, pc = null } = {}) {
    peers.set(peerId, { channel, pc, state: 'open' });
    presences.set(peerId, { presence: 'online', ts: Date.now() });
    // close tardio de canal substituído não pode derrubar o registro atual
    channel.onclose = () => {
      if (peers.get(peerId)?.channel === channel) this.dropPeer(peerId, 'channel-close');
    };
    lastSeen.set(peerId, Date.now());
    // keepalive só em peers com hello v2 — legado v1 não responde 'ping'
    if (keepalive) {
      const t = setInterval(() => this.keepalive(peerId), keepaliveMs);
      t.unref?.(); // timer de fundo não deve segurar o processo vivo
      keepTimers.set(peerId, t);
    }
    logDiag('peer.open', diagFingerprint(peerId));
    emitLocal('peer.open', { peerId });
    flushPending(peerId);
  },
  keepalive(peerId) {
    if (peers.get(peerId)?.state !== 'open') { this.stopKeepalive(peerId); return; }
    if (Date.now() - (lastSeen.get(peerId) || 0) > keepaliveMiss * keepaliveMs) {
      logDiag('keepalive.timeout', diagFingerprint(peerId));
      this.dropPeer(peerId, 'keepalive-timeout');
      return;
    }
    this.sendToPeer(peerId, 'ping', { t: Date.now() });
  },
  stopKeepalive(peerId) {
    clearInterval(keepTimers.get(peerId));
    keepTimers.delete(peerId);
    lastSeen.delete(peerId);
  },
  dropPeer(peerId, reason = 'closed') {
    const p = peers.get(peerId);
    if (p?.state !== 'open') return; // idempotente: só atua na transição open→closed
    p.state = 'closed';
    try { p.channel.close(); } catch {}
    try { p.pc?.close?.(); } catch {}
    this.stopKeepalive(peerId);
    presences.set(peerId, { presence: 'offline', ts: Date.now() });
    logDiag('peer.closed', diagFingerprint(peerId) + ':' + reason);
    emitLocal('peer.closed', { peerId });
  },
  peerIds: () => [...peers.keys()].filter(id => p2pTransport.isOnline(id)),
  isOnline: (peerId) => {
    const p = peers.get(peerId);
    // MockChannel sem readyState segue válido; canal real morto sem onclose não conta
    return p?.state === 'open' && (!p.channel.readyState || p.channel.readyState === 'open');
  },
  // expõe o registro atual para callbacks validarem a identidade do recurso
  peerEntry: (peerId) => peers.get(peerId),
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
    if (p?.state === 'open') {
      const ready = !p.channel.readyState || p.channel.readyState === 'open';
      if (ready && sendNow(p.channel, env)) return true;
      // Só derruba quando o readyState evidencia canal morto (zumbi sem onclose,
      // ou canal que não expõe estado e falhou). Exceção com canal ainda 'open'
      // é transitória (ex.: mensagem grande demais) e só reenfileira.
      if (p.channel.readyState !== 'open') this.dropPeer(peerId, 'send-failure');
    }
    enqueue(peerId, env);
    return false;
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
    try { afterBroadcast?.(spaceId, env, n); } catch {}
    return n;
  },

  // recebeu mensagem bruta de um canal — valida, deduplica, ack, dispara
  receive(peerId, env) {
    lastSeen.set(peerId, Date.now()); // qualquer tráfego prova liveness
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

  // espera acks de um conjunto de peers por até ms; `expect` reduz o alvo
  // (ex.: 1 = resolve no primeiro ACK, sem esperar o grupo inteiro)
  waitAcks(eventId, peerIds, ms = 5000, expect = peerIds.length) {
    return new Promise((resolve) => {
      const got = pendingAcks.get(eventId);
      if (expect <= 0 || (got && peerIds.every(p => got.has(p)))) return resolve([...got || []]);
      const w = {
        expect, received: new Set(got || []), resolve,
        timer: setTimeout(() => { ackWaiters.delete(eventId); resolve([...w.received]); }, ms),
      };
      if (w.received.size >= w.expect) { clearTimeout(w.timer); return resolve([...w.received]); }
      ackWaiters.set(eventId, w);
    });
  },
  acksFor: (eventId) => pendingAcks.get(eventId) || new Set(),

  // ---- mensagens de controle (não persistidas) ----
  sendToPeer(peerId, type, body, spaceId = '*') {
    return this.send(peerId, {
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
  // keepalive responde aqui: ping/pong não sobem para a UI nem para o nó
  if (env.type === 'ping') {
    logDiag('ping.recv', diagFingerprint(peerId));
    p2pTransport.sendToPeer(peerId, 'pong', { of: env.id });
    return;
  }
  if (env.type === 'pong') { logDiag('pong.recv', diagFingerprint(peerId)); return; }
  const payload = { ...env.body, peerId, eventId: env.id, envelope: env, source: 'dc' };
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
  } catch (e) { log(`send fail: ${e.message}`); logDiag('send.fail', e.message); return false; }
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
