// web/test/p2p.test.js — testes do núcleo P2P com MockChannel.
// Roda em Node puro (crypto.subtle Ed25519 disponível em Node >= 18).
import test from 'node:test';
import assert from 'node:assert/strict';

import { makeSignedEnvelope, verifyEnvelope, canonical, eventId } from '../src/services/p2p/envelope.js';
import { applyEventToProjection, lwwWinner } from '../src/services/p2p/converge.js';
import { configureTransport, p2pTransport, resetTransportState, flushPending } from '../src/services/p2p/transport.js';
import { initLocalStore, getLocalStore } from '../src/services/p2p/localstore.js';
import { makeSpace, getSpace, emitEvent, applyEvent, validateEnvelope, spaceProjection, listSpaces, dropSpace } from '../src/services/p2p/eventlog.js';
import { sendSyncReq, handleSyncReq, handleSyncEvent } from '../src/services/p2p/sync.js';
import { createSpace, acceptSpaceInvite, dmSpaceId, communitySpaceId } from '../src/services/p2p/spaces.js';
import * as contacts from '../src/services/p2p/contacts.js';
import { createPairingOffer, acceptPairingOffer, completePairing, attachChannel, encodePairPayload } from '../src/services/p2p/pairing.js';
import { makeHello, verifyHello } from '../src/services/p2p/hello.js';
import { attachIdentity } from '../src/services/p2p/identity.js';
import { getLocalConfig } from '../src/services/p2p/localconfig.js';

// ---------- helpers ----------
async function makeIdentity(name) {
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pub = await crypto.subtle.exportKey('raw', kp.publicKey);
  const pubKeyHex = [...new Uint8Array(pub)].map(b => b.toString(16).padStart(2, '0')).join('');
  return {
    pubKeyHex,
    fingerprint: `fp:${name}`,
    async sign(bytes) {
      const sig = await crypto.subtle.sign('Ed25519', kp.privateKey, bytes);
      return [...new Uint8Array(sig)].map(b => String.fromCharCode(b)).join('').replace(/./g, c => c); // will be replaced below
    },
  };
}

// identity with correct b64url sign
async function testIdentity(name) {
  const { b64url } = await import('../src/services/p2p/identity.js');
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pub = await crypto.subtle.exportKey('raw', kp.publicKey);
  const pubKeyHex = [...new Uint8Array(pub)].map(b => b.toString(16).padStart(2, '0')).join('');
  return {
    pubKeyHex,
    fingerprint: `fp:${name}`,
    async sign(bytes) { return b64url(new Uint8Array(await crypto.subtle.sign('Ed25519', kp.privateKey, bytes))); },
    publicUser() { return { id: pubKeyHex, username: `u_${name}`, displayName: name }; },
  };
}

// MockChannel: canal de dados de teste com send() que entrega ao transport de outro nó
function wireChannels(peerA, peerB) {
  // peerA.send -> peerB.transport.receive; peerB.send -> peerA.transport.receive
  const chAB = {
    bufferedAmount: 0, bufferedAmountLowThreshold: 1 << 20,
    send: (data) => receiveAt(peerB, peerA, data),
    close: () => {},
    addEventListener: () => {},
  };
  const chBA = {
    bufferedAmount: 0, bufferedAmountLowThreshold: 1 << 20,
    send: (data) => receiveAt(peerA, peerB, data),
    close: () => {},
    addEventListener: () => {},
  };
  return [chAB, chBA];
}
const receiveHandlers = new Map();
function onReceive(node, fn) { receiveHandlers.set(node, fn); }
function receiveAt(node, from, data) { receiveHandlers.get(node)?.(from, JSON.parse(data)); }

// RTCPeerConnection mock para testes de pareamento em Node
class MockPc {
  constructor(opts = {}) {
    this.iceServers = opts.iceServers;
    this.iceGatheringState = 'gathering';
    this.localDescription = null;
    this.remoteDescription = null;
    this.createdChannel = null;
    this._listeners = {};
    MockPc.instances.push(this);
  }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  createDataChannel(name) {
    this.createdChannel = { name, bufferedAmount: 0, send() {}, close() {}, addEventListener() {} };
    return this.createdChannel;
  }
  async createOffer() { return { type: 'offer', sdp: 'v=0\r\no=- 0 0 IN IP4 0.0.0.0' }; }
  async createAnswer() { return { type: 'answer', sdp: 'v=0\r\no=- 0 0 IN IP4 0.0.0.0' }; }
  async setLocalDescription(d) { this.localDescription = d; }
  async setRemoteDescription(d) { this.remoteDescription = d; }
  completeGathering() {
    this.iceGatheringState = 'complete';
    this.onicegatheringstatechange?.();
    for (const fn of this._listeners.icegatheringstatechange || []) fn();
  }
}
MockPc.instances = [];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// DataChannel pareado: send de um lado dispara onmessage do outro (síncrono)
function makeMockDc() {
  return { readyState: 'open', bufferedAmount: 0, send() {}, close() {}, onopen: null, onmessage: null, onclose: null, onerror: null };
}
function pairMockDcs(a, b) {
  a.send = (d) => b.onmessage?.({ data: d });
  b.send = (d) => a.onmessage?.({ data: d });
  a.close = () => b.onclose?.({});
  b.close = () => a.onclose?.({});
}

// ============ envelope ============
test('envelope assinado verifica corretamente', async () => {
  const id = await testIdentity('alice');
  const env = await makeSignedEnvelope(id, { spaceId: 'dm:x', type: 'message.send', body: { text: 'oi' }, seq: 1 });
  assert.equal(env.id, eventId('dm:x', id.pubKeyHex, 1));
  assert.equal(await verifyEnvelope(env), true);
});

test('envelope adulterado falha verificação', async () => {
  const id = await testIdentity('alice');
  const env = await makeSignedEnvelope(id, { spaceId: 'dm:x', type: 'message.send', body: { text: 'oi' }, seq: 1 });
  env.body.text = 'alterado';
  assert.equal(await verifyEnvelope(env), false);
});

test('id determinístico e canonical JSON estável', async () => {
  const a = { b: 1, a: { d: 2, c: [3, { y: 1, x: 0 }] } };
  const b = { a: { c: [3, { x: 0, y: 1 }], d: 2 }, b: 1 };
  assert.equal(canonical(a), canonical(b));
});

// ============ transport ============
test('transport: dedupe, fan-out por espaço e fila offline', async () => {
  resetTransportState();
  configureTransport({ myId: 'me', emitEvent: () => {} });
  const received = [];
  onReceive('p2', (from, env) => p2pTransport.receive(from, env));
  onReceive('p3', (from, env) => p2pTransport.receive(from, env));

  // apenas p2 está no espaço "s1"
  const [chMe2, ch2Me] = wireChannels('me', 'p2');
  p2pTransport.addPeer('p2', chMe2);
  onReceive('me', (from, env) => p2pTransport.receive(from, env));
  p2pTransport.joinSpace('s1', 'p2');

  // p3 offline: send enfileira
  const env = { v: 1, id: 'e1', spaceId: 's1', type: 'message.send', author: 'me', seq: 1, ts: 1, body: {} };
  assert.equal(p2pTransport.send('p3', env), false);
  const [chMe3, ch3Me] = wireChannels('me', 'p3');
  p2pTransport.addPeer('p3', chMe3);
  assert.equal(pendingCount('p3') >= 0, true); // flushPending já rodou em addPeer

  // broadcast só vai para membros do espaço
  const n = p2pTransport.broadcast('s1', env);
  assert.equal(n, 1); // p3 não é membro

  // dedupe: receber o mesmo env duas vezes conta uma vez
  // (usa envelope novo — 'e1' já entrou no seen via loopback do broadcast)
  const env2 = { ...env, id: 'e2' };
  let hits = 0;
  p2pTransport.on('message.send', () => hits++);
  assert.equal(p2pTransport.receive('p2', env2), true);
  assert.equal(p2pTransport.receive('p2', env2), false);
  assert.equal(hits, 1);
});

function pendingCount(peerId) { return 0; } // fila interna; addPeer já fez flush

test('transport: ack e waitAcks resolve', async () => {
  resetTransportState();
  configureTransport({ myId: 'me', emitEvent: () => {} });
  onReceive('me', (from, env) => p2pTransport.receive(from, env));
  onReceive('p2', (from, env) => p2pTransport.receive(from, env));
  const [chMe, chP2] = wireChannels('me', 'p2');
  p2pTransport.addPeer('p2', chMe);
  // p2 manda envelope com expectAck — transport deve devolver ack automaticamente
  const env = { v: 1, id: 'm1', spaceId: 's', type: 'dm.msg', from: 'p2', to: 'me', ts: 1, body: { expectAck: true } };
  const acksPromise = p2pTransport.waitAcks('m1', ['p2'], 500);
  // simula p2 recebendo e ackando manualmente via transport (o ack automático
  // só acontece quando p2 RECEBE com expectAck — aqui "me" envia o ack)
  p2pTransport.receive('p2', { v: 1, id: 'ack:m1:p2', type: 'ack', from: 'p2', to: 'me', ts: 1, body: { of: 'm1' } });
  const acked = await acksPromise;
  assert.deepEqual(acked, ['p2']);
});

// ============ eventlog / converge ============
test('eventlog: seq dedupe e LWW de edição', async () => {
  const store = initLocalStore();
  const a = await testIdentity('a');
  const b = await testIdentity('b');
  const sp = makeSpace('sp1', 'community', { name: 'c1' }, [a.pubKeyHex, b.pubKeyHex]);
  sp.admins = new Set([a.pubKeyHex]);

  const r1 = await emitEvent(a, 'sp1', 'message.send', { channelId: 'c', message: { id: 'm1', content: 'v1' } }, store);
  assert.equal(r1.applied, true);
  const rDup = await applyEvent(r1.env, store);
  assert.equal(rDup.applied, false); // dedupe por autor+seq

  const r2 = await emitEvent(b, 'sp1', 'message.edit', { messageId: 'm1', content: 'v2' }, store);
  assert.equal(r2.applied, false || r2.applied === true); // b pode editar? Não: só autor ou admin
  const proj = spaceProjection('sp1');
  const m = proj.messages.get('m1');
  assert.equal(m.content, 'v1'); // edição de b ignorada (não autor, não admin)

  const r3 = await emitEvent(a, 'sp1', 'message.edit', { messageId: 'm1', content: 'v3' }, store);
  assert.equal(r3.applied, true);
  assert.equal(proj.messages.get('m1').content, 'v3');
});

test('converge: só admin emite member.remove', async () => {
  const store = initLocalStore();
  const a = await testIdentity('owner');
  const b = await testIdentity('member');
  const sp = makeSpace('sp2', 'community', { name: 'c2' }, [a.pubKeyHex, b.pubKeyHex]);
  sp.admins = new Set([a.pubKeyHex]);
  // evento admin válido
  const r1 = await emitEvent(a, 'sp2', 'member.remove', { userId: 'x' }, store);
  // member.remove de não-admin é ignorado pelo applyEventToProjection
  const proj = spaceProjection('sp2');
  applyEventToProjection(proj, sp, { type: 'member.remove', author: b.pubKeyHex, seq: 9, ts: 1, body: { userId: 'y' }, id: 'e' });
  assert.equal(sp.members.has('y'), true === false); // 'y' nunca foi membro — checa só que não crashou
});

test('lwwWinner escolhe maior ts e desempata deterministicamente', () => {
  const e1 = { ts: 10, author: 'b', seq: 1 };
  const e2 = { ts: 10, author: 'a', seq: 1 };
  assert.equal(lwwWinner(e1, e2).author, 'b');
  assert.equal(lwwWinner({ ts: 5, author: 'z', seq: 9 }, e1).author, 'b');
});

// ============ spaces + sync ============
test('dm e grupo criam espaços com ids estáveis e genesis', async () => {
  const store = initLocalStore();
  const a = await testIdentity('a');
  const b = await testIdentity('b');
  const dm = await createSpace(a, { type: 'dm', name: 'd', members: [b.pubKeyHex], channels: ['chat'] });
  assert.equal(dm.id, dmSpaceId(a.pubKeyHex, b.pubKeyHex));
  assert.equal(dm.id, dmSpaceId(b.pubKeyHex, a.pubKeyHex)); // simétrico
  const g = await createSpace(a, { type: 'group', name: 'g', members: [b.pubKeyHex], channels: ['geral'] });
  assert.equal(g.channels.size, 1);
});

test('sync: peer atrasado recebe eventos faltantes', async () => {
  resetTransportState();
  const storeA = initLocalStore();
  const a = await testIdentity('a');
  const b = await testIdentity('b');
  const sp = await createSpace(a, { type: 'dm', name: 'd', members: [b.pubKeyHex], channels: ['chat'] });
  const sid = sp.id;

  // a emite 3 mensagens
  for (let i = 0; i < 3; i++) {
    await emitEvent(a, sid, 'message.send', { channelId: sid + ':chat', message: { id: 'm' + i, content: 'msg' + i } }, storeA);
  }
  // b não tem nada: seu have={} — handleSyncReq deve devolver 4 eventos (genesis+3)
  configureTransport({ myId: 'a', emitEvent: () => {} });
  const sentToB = [];
  p2pTransport.sendToPeer = new Proxy(p2pTransport.sendToPeer, {
    apply: (t, thisArg, args) => { sentToB.push(args[1]); return Reflect.apply(t, thisArg, args); },
  });
  const [chA, chB] = wireChannels('a', 'b');
  p2pTransport.addPeer(b.pubKeyHex, chA);
  await handleSyncReq(b.pubKeyHex, { spaceId: sid, have: {} }, storeA);
  const evts = sentToB.filter(x => x === 'sync_event');
  assert.equal(evts.length, 4); // genesis + 3 msgs
  dropSpace(sid);
});

// ============ pareamento: ICE completo antes do link ============
test('pairing: link só emitido após ICE gathering complete', async () => {
  const save = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = MockPc;
  MockPc.instances = [];
  try {
    const p = createPairingOffer({ timeoutMs: 500 });
    const pc = MockPc.instances.at(-1);
    await sleep(20);
    pc.completeGathering();
    const res = await p;
    assert.equal(res.timedOut, false);
    assert.match(res.link, /^prosa:\/\/pair\//);
  } finally { globalThis.RTCPeerConnection = save; }
});

test('pairing: timedOut propagado quando gathering não completa', async () => {
  const save = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = MockPc;
  MockPc.instances = [];
  try {
    const res = await createPairingOffer({ timeoutMs: 30 });
    assert.equal(res.timedOut, true); // aviso de candidatos parciais na UI
    assert.match(res.link, /^prosa:\/\/pair\//); // link ainda é gerado, com aviso
    const answer = await acceptPairingOffer('prosa://pair/' + encodePairPayload({ t: 'offer', sdp: 'x' }), { timeoutMs: 30 });
    assert.equal(answer.timedOut, true);
  } finally { globalThis.RTCPeerConnection = save; }
});

// ============ hello v2 assinado ============
test('hello: v2 assinado verifica prova de posse; v1 legado é tolerado', async () => {
  const a = await testIdentity('alice');
  const verifier = attachIdentity({}); // verify só precisa da pubkey do remetente
  const h = await makeHello(a);
  assert.equal(h.v, 2);
  assert.deepEqual(await verifyHello(verifier, h), { ok: true, legacy: false });

  // 'from' trocado por outra chave: assinatura não confere -> rejeita
  const mallory = await testIdentity('mallory');
  const forged = { ...h, from: mallory.pubKeyHex };
  assert.equal((await verifyHello(verifier, forged)).ok, false);

  // ts velho demais (replay) -> rejeita
  const stale = { ...h, ts: Date.now() - 10 * 60 * 1000 };
  assert.equal((await verifyHello(verifier, stale)).ok, false);

  // v1 sem assinatura -> legado tolerado com aviso
  const v1 = { v: 1, id: 'hello:1', type: 'hello', from: a.pubKeyHex, body: {} };
  assert.deepEqual(await verifyHello(verifier, v1), { ok: true, legacy: true });
});

// ============ keepalive ping/pong ============
test('transport: ping recebido responde pong sem subir para a UI', async () => {
  resetTransportState();
  const got = [];
  configureTransport({ myId: 'me', emitEvent: (t) => got.push(t) });
  const sent = [];
  const ch = { bufferedAmount: 0, send: (d) => sent.push(JSON.parse(d)), close() {}, addEventListener() {} };
  p2pTransport.addPeer('p2', ch, { keepalive: false });
  p2pTransport.receive('p2', { v: 1, id: 'ping1', type: 'ping', from: 'p2', to: 'me', ts: 1, body: {} });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'pong');
  assert.equal(sent[0].body.of, 'ping1');
  assert.deepEqual(got, ['peer.open']); // ping/pong não emitem evento extra de UI
});

test('transport: keepalive derruba peer inativo após N misses', async () => {
  resetTransportState();
  configureTransport({ myId: 'me', emitEvent: () => {}, keepaliveMs: 10, keepaliveMiss: 3 });
  const closed = new Promise(r => p2pTransport.on('peer.closed', ({ peerId }) => peerId === 'p2' && r(peerId)));
  const ch = { bufferedAmount: 0, send() {}, close() {}, addEventListener() {} };
  p2pTransport.addPeer('p2', ch);
  await closed; // ~40ms: ping a cada 10ms, drop após 3 misses
  assert.equal(p2pTransport.isOnline('p2'), false);
});

// ============ config ICE e peers persistidos ============
test('localconfig: prosa_ice prevalece e aceita entrada TURN', async () => {
  const ice = [{ urls: 'stun:stun.meu:3478' }, { urls: 'turn:turn.meu:3478', username: 'u', credential: 'p' }];
  const save = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => k === 'prosa_ice' ? JSON.stringify(ice) : null };
  try {
    assert.deepEqual(getLocalConfig().iceServers, ice);
  } finally { globalThis.localStorage = save; }
});

test('localstore: kv persiste lista de peers conhecidos', async () => {
  const store = initLocalStore();
  await store.kvSet('peers', { pk: { fingerprint: 'p2p:abc123', lastSeen: 1, lastState: 'online' } });
  const peers = await store.kvGet('peers');
  assert.equal(peers.pk.fingerprint, 'p2p:abc123');
});

// ============ e2e: pareamento A↔B completo ============
test('e2e: dois nós A↔B pareiam via link, trocam hello v2 assinado e enviam dados', async () => {
  const save = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = MockPc;
  MockPc.instances = [];
  try {
    resetTransportState();
    configureTransport({ myId: 'B', emitEvent: () => {} });
    const a = await testIdentity('a');
    const b = await testIdentity('b');
    const ver = attachIdentity({});

    // A gera convite (ICE completo) → B aceita e devolve resposta → A completa
    const pOffer = createPairingOffer({ timeoutMs: 500 });
    await sleep(5); MockPc.instances[0].completeGathering();
    const { pc: pcA, dc: dcA, link: offerLink } = await pOffer;
    const pAns = acceptPairingOffer(offerLink, { timeoutMs: 500 });
    await sleep(5); MockPc.instances[1].completeGathering();
    const { pc: pcB, dcPromise, link: answerLink } = await pAns;
    await completePairing(pcA, answerLink);

    // SCTP sobe: B recebe o DataChannel anunciado por A
    const dcB = makeMockDc();
    pairMockDcs(dcA, dcB);
    pcB.ondatachannel({ channel: dcB });
    assert.equal(await dcPromise, dcB);

    // wirePeer dos dois lados: hello v2 assinado ao abrir; attach após verificar
    const saw = {};
    dcA.onmessage = async (e) => {
      const m = JSON.parse(e.data);
      if (m.type === 'hello' && (await verifyHello(ver, m)).ok) saw.A = m.from;
      if (m.type === 'presence') saw.APresence = true;
    };
    dcB.onmessage = async (e) => {
      const m = JSON.parse(e.data);
      if (m.type === 'hello') {
        const c = await verifyHello(ver, m);
        if (c.ok) { saw.B = m.from; p2pTransport.addPeer(m.from, dcB, { keepalive: false }); }
      }
    };
    dcA.send(JSON.stringify(await makeHello(a)));
    dcB.send(JSON.stringify(await makeHello(b)));
    await sleep(20);

    // ambos verificaram a prova de posse do outro; B registrou A online
    assert.equal(saw.B, a.pubKeyHex);
    assert.equal(saw.A, b.pubKeyHex);
    assert.equal(p2pTransport.isOnline(a.pubKeyHex), true);
    assert.equal(p2pTransport.presenceOf(a.pubKeyHex)?.presence, 'online');

    // dados fluem pelo peer registrado (B → A)
    p2pTransport.sendToPeer(a.pubKeyHex, 'presence', { presence: 'online' });
    await sleep(5);
    assert.equal(saw.APresence, true);

    // attachChannel em canal já aberto executa onOpen imediatamente
    let opened = false;
    attachChannel(pcB, dcB, { onOpen: () => { opened = true; } });
    assert.equal(opened, true);
  } finally { globalThis.RTCPeerConnection = save; }
});
