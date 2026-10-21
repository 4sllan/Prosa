// web/test/p2p-transport.test.js — ciclo de vida do registro de peers.
// Cobre: pc rastreado e fechado no drop, drop idempotente, stale-close de
// canal substituído, zumbi derrubado por falha de send e isOnline por readyState.
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { configureTransport, p2pTransport, resetTransportState } from '../src/services/p2p/transport.js';

function channel(overrides = {}) {
  return {
    readyState: 'open',
    bufferedAmount: 0,
    sent: [],
    closed: false,
    send(data) { this.sent.push(JSON.parse(data)); },
    close() { this.closed = true; this.readyState = 'closed'; },
    addEventListener() {},
    onclose: null,
    ...overrides,
  };
}
const pc = () => ({ closed: false, close() { this.closed = true; } });
const env = (id = 'e1') => ({ v: 1, id, type: 'ping', body: {} });

beforeEach(() => {
  resetTransportState();
  configureTransport({ myId: 'me' });
});
afterEach(() => resetTransportState());

test('transport: dropPeer fecha canal e pc e emite peer.closed uma única vez', () => {
  const ch = channel();
  const conn = pc();
  const closed = [];
  const off = p2pTransport.on('peer.closed', ({ peerId }) => closed.push(peerId));
  p2pTransport.addPeer('p1', ch, { keepalive: false, pc: conn });
  p2pTransport.dropPeer('p1', 'user-disconnect');
  p2pTransport.dropPeer('p1', 'channel-close'); // reentrante/duplicado
  assert.equal(ch.closed, true);
  assert.equal(conn.closed, true);
  assert.equal(p2pTransport.isOnline('p1'), false);
  assert.equal(p2pTransport.presenceOf('p1').presence, 'offline');
  assert.deepEqual(closed, ['p1']);
  off();
});

test('transport: dropPeer de peer desconhecido não emite nem falha', () => {
  const closed = [];
  const off = p2pTransport.on('peer.closed', ({ peerId }) => closed.push(peerId));
  p2pTransport.dropPeer('ghost', 'user-disconnect');
  assert.deepEqual(closed, []);
  off();
});

test('transport: close tardio de canal substituído não derruba a conexão atual', () => {
  const old = channel();
  const current = channel();
  p2pTransport.addPeer('p1', old, { keepalive: false });
  p2pTransport.addPeer('p1', current, { keepalive: false });
  old.onclose(); // onclose atrasado do canal antigo
  assert.equal(p2pTransport.isOnline('p1'), true);
  current.onclose(); // close do canal registrado derruba normalmente
  assert.equal(p2pTransport.isOnline('p1'), false);
});

test('transport: falha de send em canal morto derruba o zumbi e reenfileira', () => {
  const ch = channel({
    // canal morre ao tentar enviar: exceção + readyState evidencia a morte
    send() { this.readyState = 'closed'; throw new Error('InvalidStateError'); },
  });
  p2pTransport.addPeer('p1', ch, { keepalive: false });
  const ok = p2pTransport.send('p1', env('lost'));
  assert.equal(ok, false);
  assert.equal(p2pTransport.isOnline('p1'), false);
  // envelope volta para a fila offline e é entregue ao reconectar
  const next = channel();
  p2pTransport.addPeer('p1', next, { keepalive: false });
  assert.deepEqual(next.sent.map(m => m.id), ['lost']);
});

test('transport: falha de send com canal ainda aberto é transitória e não derruba', () => {
  const ch = channel({
    send() { throw new Error('Test transient failure'); },
  });
  p2pTransport.addPeer('p1', ch, { keepalive: false });
  assert.equal(p2pTransport.send('p1', env('later')), false);
  assert.equal(p2pTransport.isOnline('p1'), true);
});

test('transport: send em canal com readyState fechado derruba sem tentar enviar', () => {
  const ch = channel({ readyState: 'closed' });
  p2pTransport.addPeer('p1', ch, { keepalive: false });
  assert.equal(p2pTransport.send('p1', env()), false);
  assert.equal(p2pTransport.isOnline('p1'), false);
  assert.equal(ch.sent.length, 0);
});

test('transport: isOnline exige readyState open quando o canal o expõe', () => {
  const ch = channel({ readyState: 'closing' });
  p2pTransport.addPeer('p1', ch, { keepalive: false });
  assert.equal(p2pTransport.isOnline('p1'), false);
  assert.deepEqual(p2pTransport.peerIds(), []);
});

test('transport: canal sem readyState permanece válido (mocks/legado)', () => {
  const ch = channel();
  delete ch.readyState;
  p2pTransport.addPeer('p1', ch, { keepalive: false });
  assert.equal(p2pTransport.isOnline('p1'), true);
  assert.equal(p2pTransport.send('p1', env('ok')), true);
  assert.deepEqual(ch.sent.map(m => m.id), ['ok']);
});
