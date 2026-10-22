import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignaling } from '../src/services/supabase/signaling.js';
import { createHubPairing, isHubInitiator } from '../src/services/p2p/pairing-hub.js';
import { p2pTransport, resetTransportState } from '../src/services/p2p/transport.js';

const tick = () => new Promise(r => setImmediate(r));

// ---- fakes ----------------------------------------------------------------

function fakeRealtime() {
  const channels = new Map(); // topic -> fake channel
  const mk = (topic) => {
    const ch = {
      topic, subscribed: false, sent: [], broadcastFns: [],
      on(type, filter, fn) { if (type === 'broadcast') ch.broadcastFns.push({ event: filter.event, fn }); return ch; },
      subscribe(cb) { ch.subscribed = true; queueMicrotask(() => cb?.('SUBSCRIBED')); return ch; },
      async send(msg) { ch.sent.push(msg); return 'ok'; },
      async unsubscribe() { ch.subscribed = false; },
      emit(event, payload) { for (const b of ch.broadcastFns) if (b.event === event) b.fn({ payload }); },
    };
    channels.set(topic, ch);
    return ch;
  };
  return { channels, channel: mk };
}

function fakeDc() {
  const listeners = {};
  return {
    readyState: 'connecting', sent: [],
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    removeEventListener: (t, fn) => { listeners[t] = (listeners[t] || []).filter(f => f !== fn); },
    send(d) { this.sent.push(d); }, close() { this.closed = true; },
  };
}

function fakePc() {
  const desc = (type) => ({ type, sdp: 'v=0\r\n', toJSON() { return { type: this.type, sdp: this.sdp }; } });
  return {
    signalingState: 'stable', localDescription: null, remoteDescription: null,
    iceAdded: [], closed: false, channels: [],
    createDataChannel() {
      const dc = fakeDc(); this.channels.push(dc);
      queueMicrotask(() => this.onnegotiationneeded?.());
      return dc;
    },
    async setLocalDescription(d) {
      if (d?.type === 'rollback') { this.signalingState = 'stable'; this.rolledBack = true; return; }
      this.localDescription = d ?? desc(this.remoteDescription?.type === 'offer' ? 'answer' : 'offer');
    },
    async setRemoteDescription(d) { this.remoteDescription = d; },
    async addIceCandidate(c) { this.iceAdded.push(c); },
    close() { this.closed = true; },
  };
}

function fakeSignaling() {
  const sent = []; let onSignal = null;
  return {
    sent,
    deliver: (msg) => onSignal?.(msg),
    onSignal(fn) { onSignal = fn; return () => { onSignal = null; }; },
    async send(to, msg) { sent.push({ to, msg }); return 'ok'; },
  };
}

const fakeNode = (pub) => ({
  identity: { pubKeyHex: pub },
  emitToStore: () => {}, store: { getContact: async () => null }, receive: async () => {},
});

const setup = (myPub, { timeoutMs = 5000 } = {}) => {
  const signaling = fakeSignaling();
  const pcs = [];
  const pairing = createHubPairing({
    node: fakeNode(myPub), signaling, timeoutMs,
    createPc: () => { const pc = fakePc(); pcs.push(pc); return pc; },
    newSessId: () => 'sess1',
  });
  return { signaling, pairing, pcs };
};

// ---- signaling ------------------------------------------------------------

test('signaling: sem client retorna null', () => {
  assert.equal(createSignaling({ pubkey: 'me', client: null }), null);
});

test('signaling: inbox no próprio canal e dispatch só de mensagens endereçadas a mim', async () => {
  const rt = fakeRealtime();
  const sig = createSignaling({ pubkey: 'me', client: rt });
  const inbox = rt.channels.get('prosa:user:me');
  assert.ok(inbox);
  await tick();
  assert.ok(inbox.subscribed);

  const got = [];
  sig.onSignal(m => got.push(m));
  inbox.emit('signal', { from: 'peer', to: 'me', kind: 'desc' });
  inbox.emit('signal', { from: 'peer', to: 'outro', kind: 'desc' }); // não é pra mim
  inbox.emit('signal', { kind: 'desc' }); // sem from
  assert.equal(got.length, 1);
  assert.equal(got[0].from, 'peer');
});

test('signaling: send publica no canal do destinatário com from/to', async () => {
  const rt = fakeRealtime();
  const sig = createSignaling({ pubkey: 'me', client: rt });
  await sig.send('peer1', { kind: 'ice', sess: 's', data: null });
  const out = rt.channels.get('prosa:user:peer1');
  assert.ok(out.subscribed);
  assert.equal(out.sent[0].payload.from, 'me');
  assert.equal(out.sent[0].payload.to, 'peer1');
  assert.equal(out.sent[0].payload.kind, 'ice');
});

// ---- pairing-hub ----------------------------------------------------------

test('hub: iniciador é sempre a menor pubkey', () => {
  assert.equal(isHubInitiator('a', 'b'), true);
  assert.equal(isHubInitiator('b', 'a'), false);
});

test('hub: sem signaling retorna null', () => {
  assert.equal(createHubPairing({ node: fakeNode('a'), signaling: null }), null);
});

test('hub: pair() só inicia quando sou a menor pubkey', async () => {
  resetTransportState();
  const { pairing, pcs } = setup('b'); // 'b' > 'a' → não inicia
  assert.equal(await pairing.pair('a'), false);
  assert.equal(pcs.length, 0);
});

test('hub: pair() do iniciador cria pc+dc e envia oferta com sess', async () => {
  resetTransportState();
  const { signaling, pairing, pcs } = setup('a');
  assert.equal(await pairing.pair('b'), true);
  await tick();
  const offer = signaling.sent.find(m => m.msg.kind === 'desc');
  assert.equal(offer.to, 'b');
  assert.equal(offer.msg.sess, 'sess1');
  assert.equal(offer.msg.data.type, 'offer');
  assert.equal(pcs[0].channels.length, 1);
});

test('hub: pair() é ignorado se já há sessão ou peer online', async () => {
  resetTransportState();
  const { pairing, pcs } = setup('a');
  assert.equal(await pairing.pair('b'), true);
  assert.equal(await pairing.pair('b'), false); // sessão em voo
  assert.equal(pcs.length, 1);
});

test('hub: oferta recebida cria sessão answerer e responde com o mesmo sess', async () => {
  resetTransportState();
  const { signaling, pcs } = setup('b');
  signaling.deliver({ from: 'a', to: 'b', kind: 'desc', sess: 'sA', data: { type: 'offer', sdp: 'x' } });
  await tick();
  assert.equal(pcs.length, 1);
  assert.equal(pcs[0].remoteDescription.type, 'offer');
  const answer = signaling.sent.find(m => m.msg.kind === 'desc' && m.msg.data.type === 'answer');
  assert.equal(answer.msg.sess, 'sA');
});

test('hub: oferta de peer já online por DC é ignorada', async () => {
  resetTransportState();
  p2pTransport.addPeer('a', { close() {} }, { keepalive: false });
  const { signaling, pcs } = setup('b');
  signaling.deliver({ from: 'a', to: 'b', kind: 'desc', sess: 'sA', data: { type: 'offer', sdp: 'x' } });
  await tick();
  assert.equal(pcs.length, 0);
  resetTransportState();
});

test('hub: signal de sessão antiga é descartado; nova oferta substitui a sessão', async () => {
  resetTransportState();
  const { signaling, pcs } = setup('b');
  signaling.deliver({ from: 'a', to: 'b', kind: 'desc', sess: 'sA', data: { type: 'offer', sdp: 'x' } });
  await tick();
  signaling.deliver({ from: 'a', to: 'b', kind: 'ice', sess: 'velha', data: { candidate: 'x' } });
  assert.equal(pcs[0].pendingIce ?? pcs[0].iceAdded.length, 0); // ignorado
  signaling.deliver({ from: 'a', to: 'b', kind: 'desc', sess: 'sB', data: { type: 'offer', sdp: 'y' } });
  await tick();
  assert.equal(pcs.length, 2);
  assert.equal(pcs[0].closed, true); // sessão antiga descartada
});

test('hub: ICE antes do remoteDescription é enfileirado e aplicado depois', async () => {
  resetTransportState();
  const { signaling, pcs } = setup('b');
  signaling.deliver({ from: 'a', to: 'b', kind: 'desc', sess: 'sA', data: { type: 'offer', sdp: 'x' } });
  signaling.deliver({ from: 'a', to: 'b', kind: 'ice', sess: 'sA', data: { candidate: 'c1' } });
  await tick(); await tick();
  assert.ok(pcs[0].iceAdded.some(c => c?.candidate === 'c1'));
});

test('hub: glare — lado polite (maior pubkey) faz rollback; impolite ignora', async () => {
  resetTransportState();
  // polite: 'b' > 'a'
  const polite = setup('b');
  polite.signaling.deliver({ from: 'a', to: 'b', kind: 'desc', sess: 'sA', data: { type: 'offer', sdp: 'x' } });
  await tick();
  const pcP = polite.pcs[0];
  pcP.signalingState = 'have-local-offer';
  polite.signaling.deliver({ from: 'a', to: 'b', kind: 'desc', sess: 'sA', data: { type: 'offer', sdp: 'y' } });
  await tick();
  assert.equal(pcP.rolledBack, true);
  assert.equal(pcP.remoteDescription.sdp, 'y');

  // impolite: 'a' < 'b'
  const impolite = setup('a');
  await impolite.pairing.pair('b');
  await tick();
  const pcI = impolite.pcs[0];
  pcI.signalingState = 'have-local-offer';
  impolite.signaling.deliver({ from: 'b', to: 'a', kind: 'desc', sess: 'sess1', data: { type: 'offer', sdp: 'z' } });
  await tick();
  assert.equal(pcI.remoteDescription, null); // oferta remota ignorada
});

test('hub: sessão expira e libera o pc', async () => {
  resetTransportState();
  const { pairing, pcs } = setup('a', { timeoutMs: 30 });
  await pairing.pair('b');
  await new Promise(r => setTimeout(r, 60));
  assert.equal(pcs[0].closed, true);
  assert.equal(pairing.sessions.size, 0);
});

test('hub: dispose encerra todas as sessões', async () => {
  resetTransportState();
  const { pairing, pcs } = setup('a');
  await pairing.pair('b');
  pairing.dispose();
  assert.equal(pcs[0].closed, true);
  assert.equal(pairing.sessions.size, 0);
});
