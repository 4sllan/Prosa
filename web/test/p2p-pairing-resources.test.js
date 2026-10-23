import test from 'node:test';
import assert from 'node:assert/strict';
import { createPairingOffer, acceptPairingOffer, encodePairPayload } from '../src/services/p2p/pairing.js';
import { p2pTransport, resetTransportState } from '../src/services/p2p/transport.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const offer = 'prosa://pair/' + encodePairPayload({ v: 1, t: 'offer', sdp: 'v=0\r\n' });

function stubPc(t, gathering = 'gathering') {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'RTCPeerConnection');
  const instances = [];
  class Pc {
    constructor() { this.iceGatheringState = gathering; this.closes = 0; instances.push(this); }
    addEventListener() {}
    createDataChannel() { return { close() {} }; }
    async createOffer() { return { type: 'offer', sdp: 'v=0\r\n' }; }
    async createAnswer() { return { type: 'answer', sdp: 'v=0\r\n' }; }
    async setRemoteDescription() {}
    async setLocalDescription(description) { this.localDescription = description; }
    close() { this.closes++; }
  }
  Object.defineProperty(globalThis, 'RTCPeerConnection', { configurable: true, value: Pc });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'RTCPeerConnection', original);
    else delete globalThis.RTCPeerConnection;
  });
  return { Pc, instances };
}

for (const side of ['offer', 'answer']) {
  test(`resources: abort during ${side} ICE gathering closes PC and clears waiter`, async (t) => {
    const { instances } = stubPc(t);
    const abort = new AbortController();
    const options = { signal: abort.signal, timeoutMs: 10000 };
    const result = side === 'offer' ? createPairingOffer(options) : acceptPairingOffer(offer, options);
    const rejected = assert.rejects(result, error => error.name === 'AbortError');
    await tick();
    assert.equal(typeof instances[0].onicegatheringstatechange, 'function');
    abort.abort();
    await rejected;
    assert.equal(instances[0].closes, 1);
    assert.equal(instances[0].onicegatheringstatechange, null);
  });
}

test('resources: already aborted attempt never constructs PC', async (t) => {
  const { instances } = stubPc(t);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(createPairingOffer({ signal: abort.signal }), { name: 'AbortError' });
  await assert.rejects(acceptPairingOffer(offer, { signal: abort.signal }), { name: 'AbortError' });
  assert.equal(instances.length, 0);
});

test('resources: cancelled answer closes any late data channel', async (t) => {
  const { instances } = stubPc(t, 'complete');
  const abort = new AbortController();
  await acceptPairingOffer(offer, { signal: abort.signal });
  abort.abort();
  let closed = false;
  instances[0].ondatachannel({ channel: { close() { closed = true; } } });
  assert.equal(closed, true);
});

test('resources: native generation failure closes the unregistered PC', async (t) => {
  const { Pc, instances } = stubPc(t);
  const failure = new Error('Synthetic failure');
  Pc.prototype.createOffer = async () => { throw failure; };
  await assert.rejects(createPairingOffer(), error => error === failure);
  assert.equal(instances[0].closes, 1);
});

test('resources: panel subscriptions can be removed idempotently', () => {
  resetTransportState();
  let hits = 0;
  const unsubscribe = p2pTransport.on('peer.open', () => { hits++; });
  p2pTransport.addPeer('first', { close() {} }, { keepalive: false });
  unsubscribe();
  unsubscribe();
  p2pTransport.addPeer('second', { close() {} }, { keepalive: false });
  assert.equal(hits, 1);
  resetTransportState();
});

test('resources: duplicate unsubscribe does not remove another registration of same callback', () => {
  resetTransportState();
  let hits = 0;
  const callback = () => { hits++; };
  const first = p2pTransport.on('peer.open', callback);
  const second = p2pTransport.on('peer.open', callback);
  first();
  first();
  p2pTransport.addPeer('peer', { close() {} }, { keepalive: false });
  assert.equal(hits, 1);
  second();
  resetTransportState();
});
