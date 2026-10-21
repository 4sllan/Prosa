import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initP2PNode } from '../src/services/p2p/node.js';
import { wirePairingPeer } from '../src/services/p2p/pairing-peer.js';
import { makeHello } from '../src/services/p2p/hello.js';
import { b64url } from '../src/services/p2p/identity.js';
import { configureTransport, p2pTransport, resetTransportState } from '../src/services/p2p/transport.js';
import * as contacts from '../src/services/p2p/contacts.js';
import { createP2PProvider } from '../src/services/providers/p2p.js';

const events = [];
const node = await initP2PNode({ emitToStore: (type, data) => events.push({ type, data }) });
assert.equal(node.store.name, 'memory');
const keys = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const remoteKey = Buffer.from(await crypto.subtle.exportKey('raw', keys.publicKey)).toString('hex');
const remote = {
  pubKeyHex: remoteKey,
  sign: async (bytes) => b64url(new Uint8Array(await crypto.subtle.sign('Ed25519', keys.privateKey, bytes))),
};

function channel(state = 'open') {
  const listeners = new Set();
  return {
    readyState: state, sent: [],
    send(data) { this.sent.push(JSON.parse(data)); },
    close() {},
    addEventListener(type, fn) { if (type === 'message') listeners.add(fn); },
    removeEventListener(type, fn) { if (type === 'message') listeners.delete(fn); },
    async deliver(env) {
      const e = { data: JSON.stringify(env) };
      const current = [...listeners];
      this.onmessage?.(e);
      await Promise.all(current.map(fn => fn(e)));
    },
    listenerCount: () => listeners.size,
  };
}

function wire(dc, initiator = true) {
  const state = { connected: [], requests: 0, errors: [] };
  wirePairingPeer(node, null, dc, {
    initiator,
    onConnected: (peerId, legacy) => state.connected.push({ peerId, legacy }),
    onRequest: () => state.requests++,
    onError: (error, connected) => state.errors.push({ message: error.message, connected }),
  });
  return state;
}

const requests = (dc) => dc.sent.filter(m => m.type === 'contact_req');

beforeEach(async () => {
  resetTransportState();
  configureTransport({ myId: node.identity.pubKeyHex });
  events.length = 0;
  for (const c of await node.store.allContacts()) await node.store.removeContact(c.pubkey);
});
afterEach(() => resetTransportState());

test('pairing-peer: incomplete pairing creates no relationship', () => {
  const dc = channel('connecting');
  const state = wire(dc);
  assert.deepEqual(state.connected, []);
  assert.deepEqual(dc.sent, []);
  assert.equal(state.requests, 0);
});

test('pairing-peer: offerer registers peer before one request and notifies UI', async () => {
  const dc = channel();
  const state = wire(dc);
  await dc.deliver(await makeHello(remote));
  assert.equal(p2pTransport.isOnline(remoteKey), true);
  assert.equal((await node.store.getContact(remoteKey)).state, 'outgoing');
  assert.equal(requests(dc).length, 1);
  assert.deepEqual(requests(dc)[0].body, { profile: node.identity.publicUser() });
  assert.deepEqual(state.connected, [{ peerId: remoteKey, legacy: false }]);
  assert.equal(state.requests, 1);
  assert.deepEqual(state.errors, []);
  assert.ok(events.some(e => e.type === 'contacts.changed' && e.data.peerId === remoteKey));
  assert.equal(dc.listenerCount(), 0);
  await dc.deliver(await makeHello(remote));
  assert.equal(requests(dc).length, 1);
});

test('pairing-peer: answerer does not request; real node receives and accepts friendship', async () => {
  const dc = channel();
  const state = wire(dc, false);
  await dc.deliver(await makeHello(remote));
  assert.equal(await node.store.getContact(remoteKey), null);
  assert.deepEqual(requests(dc), []);
  await node.receive(remoteKey, { type: 'contact_req', body: { profile: { displayName: 'Remote' } } });
  assert.equal((await createP2PProvider().contacts.list()).relationships[0].type, 'incoming');
  assert.ok(events.some(e => e.type === 'contacts.changed'));
  await contacts.acceptContact(node.identity, remoteKey);
  assert.equal((await createP2PProvider().contacts.list()).relationships[0].type, 'friend');
  assert.equal(dc.sent.filter(m => m.type === 'contact_accept').length, 1);
  assert.equal(state.requests, 0);
});

for (const state of ['incoming', 'outgoing', 'friend', 'blocked', 'unknown']) {
  test(`pairing-peer: re-pairing preserves ${state} without resending`, async () => {
    await node.store.putContact({ pubkey: remoteKey, state, profile: { displayName: 'Keep' } });
    const original = structuredClone(await node.store.getContact(remoteKey));
    const dc = channel();
    const result = wire(dc);
    await dc.deliver(await makeHello(remote));
    assert.deepEqual(await node.store.getContact(remoteKey), original);
    assert.deepEqual(requests(dc), []);
    assert.equal(result.requests, 0);
    assert.deepEqual(result.errors, []);
  });
}

test('pairing-peer: invalid signed hello never registers or requests', async () => {
  const dc = channel();
  const state = wire(dc);
  const hello = await makeHello(remote);
  hello.sig = b64url(new Uint8Array(64));
  await dc.deliver(hello);
  assert.equal(p2pTransport.isOnline(remoteKey), false);
  assert.equal(await node.store.getContact(remoteKey), null);
  assert.deepEqual(requests(dc), []);
  assert.equal(state.errors.length, 1);
  assert.equal(state.errors[0].connected, false);
});

test('pairing-peer: legacy hello remains supported and reported as legacy', async () => {
  const dc = channel();
  const state = wire(dc);
  await dc.deliver({ type: 'hello', from: remoteKey });
  assert.deepEqual(state.connected, [{ peerId: remoteKey, legacy: true }]);
  assert.equal(requests(dc).length, 1);
});

test('pairing-peer: concurrent hellos attach and request only once', async () => {
  const dc = channel();
  const state = wire(dc);
  const hello = await makeHello(remote);
  await Promise.all([dc.deliver(hello), dc.deliver(hello)]);
  assert.equal(state.connected.length, 1);
  assert.equal(requests(dc).length, 1);
});

test('pairing-peer: persistence failure keeps connection and reports no success', async (t) => {
  const dc = channel();
  const state = wire(dc);
  t.mock.method(node.store, 'putContact', async () => { throw new Error('Test storage failure'); });
  await dc.deliver(await makeHello(remote));
  assert.equal(p2pTransport.isOnline(remoteKey), true);
  assert.equal(requests(dc).length, 0);
  assert.equal(state.requests, 0);
  assert.deepEqual(state.errors, [{ message: 'Test storage failure', connected: true }]);
});

test('pairing-peer: send failure is visible and explicit retry by key remains possible', async () => {
  const dc = channel();
  const send = dc.send.bind(dc);
  dc.send = (data) => {
    if (JSON.parse(data).type === 'contact_req') throw new Error('Test send failure');
    send(data);
  };
  const state = wire(dc);
  await dc.deliver(await makeHello(remote));
  assert.equal(p2pTransport.isOnline(remoteKey), true);
  assert.equal(state.requests, 0);
  assert.equal(state.errors[0].connected, true);
  assert.equal((await node.store.getContact(remoteKey)).state, 'removed');
  dc.send = send;
  await contacts.requestContact(node.identity, { pubkey: remoteKey });
  assert.equal(requests(dc).length, 1);
  assert.equal((await node.store.getContact(remoteKey)).state, 'outgoing');
});

test('pairing-peer: buffers contact request until asynchronous hello verification ends', async (t) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const verify = node.identity.verify;
  t.mock.method(node.identity, 'verify', async (...args) => {
    await gate;
    return verify(...args);
  });
  const dc = channel();
  const state = wire(dc, false);
  const processing = dc.deliver(await makeHello(remote));
  await dc.deliver({ type: 'contact_req', body: { profile: { displayName: 'Early' } } });
  assert.equal(await node.store.getContact(remoteKey), null);
  release();
  await processing;
  assert.equal((await node.store.getContact(remoteKey)).state, 'incoming');
  assert.deepEqual(requests(dc), []);
  assert.deepEqual(state.errors, []);
  assert.equal(dc.listenerCount(), 0);
});

test('pairing-peer: rejected handshake discards buffered controls', async (t) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  t.mock.method(node.identity, 'verify', async () => { await gate; return false; });
  const dc = channel();
  const state = wire(dc, false);
  const processing = dc.deliver(await makeHello(remote));
  await dc.deliver({ type: 'contact_req', body: { profile: {} } });
  release();
  await processing;
  assert.equal(await node.store.getContact(remoteKey), null);
  assert.equal(state.errors[0].connected, false);
});

test('pairing-peer: already open channel sends signed hello only once', async () => {
  const dc = channel();
  wire(dc);
  await dc.onopen();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dc.sent.filter(m => m.type === 'hello' && m.v === 2).length, 1);
});

test('pairing-peer: local hello precedes attachment and request even when signing is slow', async (t) => {
  let release, verified;
  const gate = new Promise(resolve => { release = resolve; });
  const verification = new Promise(resolve => { verified = resolve; });
  const sign = node.identity.sign;
  const verify = node.identity.verify;
  t.mock.method(node.identity, 'sign', async (...args) => { await gate; return sign(...args); });
  t.mock.method(node.identity, 'verify', async (...args) => {
    const result = await verify(...args);
    verified();
    return result;
  });
  const dc = channel();
  wire(dc);
  const processing = dc.deliver(await makeHello(remote));
  await verification;
  assert.equal(p2pTransport.isOnline(remoteKey), false);
  assert.deepEqual(requests(dc), []);
  release();
  await processing;
  assert.equal(dc.sent[0].type, 'hello');
  assert.equal(requests(dc).length, 1);
});

test('pairing-peer: local hello failure prevents attachment and friendship request', async (t) => {
  t.mock.method(node.identity, 'sign', async () => { throw new Error('Test signing failure'); });
  const dc = channel();
  const state = wire(dc);
  await dc.deliver(await makeHello(remote));
  assert.equal(p2pTransport.isOnline(remoteKey), false);
  assert.deepEqual(requests(dc), []);
  assert.deepEqual(state.connected, []);
  assert.deepEqual(state.errors, [{ message: 'Test signing failure', connected: false }]);
});

test('pairing-peer: cancellation during verification prevents late attachment and request', async (t) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const verify = node.identity.verify;
  t.mock.method(node.identity, 'verify', async (...args) => { await gate; return verify(...args); });
  const dc = channel();
  const cancel = wirePairingPeer(node, null, dc, { initiator: true });
  const processing = dc.deliver(await makeHello(remote));
  cancel();
  release();
  await processing;
  assert.equal(p2pTransport.isOnline(remoteKey), false);
  assert.equal(await node.store.getContact(remoteKey), null);
  assert.deepEqual(requests(dc), []);
  assert.equal(dc.listenerCount(), 0);
});

test('pairing-peer: cancellation after attachment preserves the registered connection', async () => {
  const dc = channel();
  const cancel = wirePairingPeer(node, null, dc, { initiator: true });
  await dc.deliver(await makeHello(remote));
  cancel();
  assert.equal(p2pTransport.isOnline(remoteKey), true);
  await node.receive(remoteKey, { type: 'contact_accept', body: {} });
  assert.equal((await node.store.getContact(remoteKey)).state, 'friend');
});

test('pairing-peer: cancellation while signing prevents late hello transmission', async (t) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const sign = node.identity.sign;
  t.mock.method(node.identity, 'sign', async (...args) => { await gate; return sign(...args); });
  const dc = channel();
  const cancel = wirePairingPeer(node, null, dc, { initiator: true });
  const sending = dc.onopen();
  cancel();
  release();
  await sending;
  assert.deepEqual(dc.sent, []);
  assert.equal(dc.listenerCount(), 0);
});

test('pairing-peer: verified re-pairing of online peer completes UI without replacing live channel', async (t) => {
  const live = channel();
  p2pTransport.addPeer(remoteKey, live, { keepalive: false });
  const attach = t.mock.method(node, 'attachPeer');
  const dc = channel();
  const pc = { close: t.mock.fn() };
  const connected = t.mock.fn();
  wirePairingPeer(node, pc, dc, { initiator: true, onConnected: connected });
  await dc.deliver(await makeHello(remote));
  assert.equal(connected.mock.callCount(), 1);
  assert.equal(attach.mock.callCount(), 0);
  assert.equal(p2pTransport.isOnline(remoteKey), true);
  assert.equal(pc.close.mock.callCount(), 1);
  assert.equal(requests(live).length, 1);
});

test('pairing-peer: online peer does not bypass signature verification', async (t) => {
  p2pTransport.addPeer(remoteKey, channel(), { keepalive: false });
  const connected = t.mock.fn(), error = t.mock.fn();
  const dc = channel();
  wirePairingPeer(node, null, dc, { onConnected: connected, onError: error });
  const hello = await makeHello(remote);
  hello.sig = b64url(new Uint8Array(64));
  await dc.deliver(hello);
  assert.equal(connected.mock.callCount(), 0);
  assert.equal(error.mock.callCount(), 1);
  assert.equal(p2pTransport.isOnline(remoteKey), true);
});

test('pairing-peer: re-pairing iniciador sobre removed reenvia pedido pelo canal vivo', async (t) => {
  await node.store.putContact({ pubkey: remoteKey, state: 'removed', profile: {} });
  const live = channel();
  p2pTransport.addPeer(remoteKey, live, { keepalive: false });
  const relationship = t.mock.fn();
  const request = t.mock.fn();
  const dc = channel();
  wirePairingPeer(node, null, dc, { initiator: true, onRelationship: relationship, onRequest: request });
  await dc.deliver(await makeHello(remote));
  assert.equal(relationship.mock.callCount(), 0);
  assert.equal(request.mock.callCount(), 1);
  assert.equal((await node.store.getContact(remoteKey)).state, 'outgoing');
  assert.equal(requests(live).length, 1); // pedido sai pela conexão viva
});

test('pairing-peer: iniciador com contato removed reenvia pedido pelo canal recém-atachado', async () => {
  await node.store.putContact({ pubkey: remoteKey, state: 'removed', profile: {} });
  const dc = channel();
  const state = wire(dc);
  await dc.deliver(await makeHello(remote));
  assert.equal(p2pTransport.isOnline(remoteKey), true);
  assert.equal((await node.store.getContact(remoteKey)).state, 'outgoing');
  assert.equal(requests(dc).length, 1);
  assert.equal(state.requests, 1);
  assert.ok(events.some(e => e.type === 'contacts.changed' && e.data.peerId === remoteKey));
});

// RTCPeerConnection stub: listeners disparáveis e restartIce observável
function stubPc() {
  const listeners = {};
  return {
    iceConnectionState: 'connected',
    restarted: false,
    closed: false,
    restartIce() { this.restarted = true; },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    fire(type) { for (const fn of listeners[type] || []) fn(); },
    close() { this.closed = true; },
  };
}

test('pairing-peer: attachPeer registra o pc no transporte', () => {
  const pc1 = stubPc();
  node.attachPeer(remoteKey, pc1, channel(), { keepalive: false });
  assert.equal(p2pTransport.peerEntry(remoteKey)?.pc, pc1);
});

test('pairing-peer: ICE listener de pc substituído fica inerte e não derruba a conexão nova', () => {
  const pc1 = stubPc();
  node.attachPeer(remoteKey, pc1, channel(), { keepalive: false });
  const pc2 = stubPc();
  node.attachPeer(remoteKey, pc2, channel(), { keepalive: false });
  assert.equal(p2pTransport.peerEntry(remoteKey)?.pc, pc2);
  pc1.iceConnectionState = 'failed';
  pc1.fire('iceconnectionstatechange');
  assert.equal(pc1.restarted, false);
  assert.equal(p2pTransport.isOnline(remoteKey), true);
});

test('pairing-peer: pc substituído durante o restart não derruba; pc atual falhando derruba', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pc1 = stubPc();
  node.attachPeer(remoteKey, pc1, channel(), { keepalive: false });
  pc1.iceConnectionState = 'failed';
  pc1.fire('iceconnectionstatechange');
  assert.equal(pc1.restarted, true);
  // re-attach durante a janela de 15 s do restart
  const pc2 = stubPc();
  node.attachPeer(remoteKey, pc2, channel(), { keepalive: false });
  t.mock.timers.tick(15000);
  assert.equal(p2pTransport.isOnline(remoteKey), true);
  // falha do pc registrado encerra a conexão
  pc2.iceConnectionState = 'failed';
  pc2.fire('iceconnectionstatechange');
  t.mock.timers.tick(15000);
  assert.equal(p2pTransport.isOnline(remoteKey), false);
});

test('pairing-peer: re-pareamento substitui registro zumbi e atacha o canal novo', async (t) => {
  const zombie = channel('closed');
  const oldPc = { close: t.mock.fn() };
  p2pTransport.addPeer(remoteKey, zombie, { keepalive: false, pc: oldPc });
  assert.equal(p2pTransport.isOnline(remoteKey), false); // zumbi não conta como vivo
  const attach = t.mock.method(node, 'attachPeer');
  const dc = channel();
  const pc = { close: t.mock.fn() };
  const connected = t.mock.fn();
  wirePairingPeer(node, pc, dc, { initiator: true, onConnected: connected });
  await dc.deliver(await makeHello(remote));
  assert.equal(attach.mock.callCount(), 1);
  assert.equal(connected.mock.callCount(), 1);
  assert.equal(oldPc.close.mock.callCount(), 1); // recursos antigos encerrados
  assert.equal(pc.close.mock.callCount(), 0);    // canal novo preservado
  assert.equal(p2pTransport.peerEntry(remoteKey)?.channel, dc);
  assert.equal(p2pTransport.isOnline(remoteKey), true);
  assert.equal(requests(dc).length, 1); // contact_req sai pelo canal novo
});

test('pairing-peer: re-pareamento com registro já fechado atacha normalmente', async (t) => {
  const dead = channel();
  p2pTransport.addPeer(remoteKey, dead, { keepalive: false });
  p2pTransport.dropPeer(remoteKey, 'user-disconnect');
  const dc = channel();
  const connected = t.mock.fn();
  wirePairingPeer(node, null, dc, { initiator: true, onConnected: connected });
  await dc.deliver(await makeHello(remote));
  assert.equal(connected.mock.callCount(), 1);
  assert.equal(p2pTransport.peerEntry(remoteKey)?.channel, dc);
  assert.equal(p2pTransport.isOnline(remoteKey), true);
});
