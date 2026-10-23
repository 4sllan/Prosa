// Testes do estado de envio (T5): confirmação por ACK de membro ou por
// publish do relay; timeout -> 'unconfirmed'; waitAcks com alvo reduzido.
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { configureTransport, p2pTransport, resetTransportState } from '../src/services/p2p/transport.js';
import { trackSendDelivery } from '../src/services/p2p/delivery.js';

function channel(overrides = {}) {
  return {
    readyState: 'open', bufferedAmount: 0, sent: [], closed: false,
    send(data) { this.sent.push(JSON.parse(data)); },
    close() { this.closed = true; this.readyState = 'closed'; },
    addEventListener() {}, onclose: null,
    ...overrides,
  };
}
const ackEnv = (of, from) => ({ v: 1, id: `ack:${of}:${from}`, type: 'ack', body: { of } });

beforeEach(() => { resetTransportState(); configureTransport({ myId: 'me' }); });
afterEach(() => resetTransportState());

test('delivery: >=1 ACK de membro online confirma a entrega', async () => {
  p2pTransport.addPeer('p1', channel(), { keepalive: false });
  const pending = trackSendDelivery({
    waitAcks: () => p2pTransport.waitAcks('e1', ['p1'], 200, 1),
    timeoutMs: 200,
  });
  await new Promise(r => setTimeout(r, 0)); // deixa o waiter registrar
  p2pTransport.receive('p1', ackEnv('e1', 'p1'));
  assert.equal(await pending, 'delivered');
});

test('delivery: confirmacao do relay conta como entrega mesmo sem ACK', async () => {
  const pending = trackSendDelivery({
    waitAcks: () => p2pTransport.waitAcks('e1', ['p1'], 200, 1),
    relayConfirm: () => Promise.resolve(true),
    timeoutMs: 200,
  });
  assert.equal(await pending, 'delivered');
});

test('delivery: sem ACK nem relay, timeout marca unconfirmed', async () => {
  const st = await trackSendDelivery({
    waitAcks: () => p2pTransport.waitAcks('e1', ['p1'], 30, 1),
    relayConfirm: () => Promise.resolve(false),
    timeoutMs: 30,
  });
  assert.equal(st, 'unconfirmed');
});

test('delivery: sem alvos (peer so via hub desligado) resolve unconfirmed', async () => {
  const st = await trackSendDelivery({ timeoutMs: 30 });
  assert.equal(st, 'unconfirmed');
});

test('delivery: espera nao bloqueia — primeiro a confirmar vence', async () => {
  const started = Date.now();
  const st = await trackSendDelivery({
    waitAcks: () => new Promise(r => setTimeout(() => r([]), 500)), // ACK viria tarde
    relayConfirm: () => Promise.resolve(true),                      // relay confirma ja
    timeoutMs: 500,
  });
  assert.equal(st, 'delivered');
  assert.ok(Date.now() - started < 200); // resolveu bem antes do timeout
});

test('transport waitAcks: expect=1 resolve no primeiro ACK, sem esperar o grupo', async () => {
  p2pTransport.addPeer('p1', channel(), { keepalive: false });
  p2pTransport.addPeer('p2', channel(), { keepalive: false });
  const pending = p2pTransport.waitAcks('e1', ['p1', 'p2'], 200, 1);
  await new Promise(r => setTimeout(r, 0));
  p2pTransport.receive('p1', ackEnv('e1', 'p1')); // so p1 confirma
  assert.deepEqual(await pending, ['p1']); // resolveu com 1, nao esperou p2/timeout
});

test('transport receive: env com expectAck responde ack ao remetente', () => {
  const ch = channel();
  p2pTransport.addPeer('p1', ch, { keepalive: false });
  p2pTransport.receive('p1', { v: 1, id: 'e1', spaceId: 's1', type: 'message.send', body: { expectAck: true } });
  const ack = ch.sent.find(m => m.type === 'ack');
  assert.equal(ack?.body?.of, 'e1');
});
