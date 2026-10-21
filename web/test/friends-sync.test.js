import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as contacts from '../src/services/p2p/contacts.js';
import { initLocalStore } from '../src/services/p2p/localstore.js';
import { configureTransport, p2pTransport, resetTransportState } from '../src/services/p2p/transport.js';
import { createP2PProvider } from '../src/services/providers/p2p.js';

// Regressao A->B do contrato consumido pela UI: o aside e o painel de
// amigos renderizam o que `provider.contacts.list()` devolve. Store em
// memoria compartilhado: o registro com chave `bId` representa o vinculo
// de A com B; o de chave `aId`, o vinculo de B com A. Envelopes sao
// capturados no transporte e entregues via handle* na outra ponta.

const store = initLocalStore();
assert.equal(store.name, 'memory');
const provider = createP2PProvider();

const aId = 'aa'.repeat(32), bId = 'bb'.repeat(32);
const aIdentity = { publicUser: () => ({ id: aId, username: 'ana', displayName: 'Ana' }) };
const bIdentity = { publicUser: () => ({ id: bId, username: 'bia', displayName: 'Bia' }) };

function capturePeer(peerId) {
  const sent = [];
  p2pTransport.addPeer(peerId, { send: (d) => sent.push(JSON.parse(d)), close() {} }, { keepalive: false });
  return sent;
}

const relationships = async () => (await provider.contacts.list()).relationships;
const typeOf = async (pubkey) => (await relationships()).find(r => r.user.id === pubkey)?.type || null;
const friendsList = async () => (await relationships()).filter(r => r.type === 'friend').map(r => r.user.id);

beforeEach(async () => {
  resetTransportState();
  configureTransport({ myId: aId, emitEvent: () => {} });
  for (const c of await store.allContacts()) await store.removeContact(c.pubkey);
});
afterEach(() => resetTransportState());

test('A->B: pedido -> recebida -> aceite -> amigo na lista consumida pelo aside', async () => {
  // A envia o pedido para B (peer "online" no transporte simulado)
  const toB = capturePeer(bId);
  await contacts.requestContact(aIdentity, { pubkey: bId });
  assert.equal(await typeOf(bId), 'outgoing');          // Enviadas de A
  assert.equal(toB.length, 1);
  assert.equal(toB[0].type, 'contact_req');
  assert.equal(toB[0].to, bId);

  // B recebe em "Recebidas": contato identificado pelo canal (aId)
  await contacts.handleContactReq(aId, toB[0].body, bIdentity);
  assert.equal(await typeOf(aId), 'incoming');
  assert.equal((await relationships()).find(r => r.user.id === aId).user.displayName, 'Ana');

  // B confirma a amizade em "Recebidas" -> notifica A
  const toA = capturePeer(aId);
  await contacts.acceptContact(bIdentity, aId);
  assert.equal(toA.length, 1);
  assert.equal(toA[0].type, 'contact_accept');

  // A recebe o aceite: pendencia enviada promovida a amigo
  await contacts.handleContactAccept(bId, toA[0].body);

  // contrato consumido pelo aside: type 'friend' nas duas pontas
  assert.equal(await typeOf(aId), 'friend');
  assert.equal(await typeOf(bId), 'friend');
  assert.deepEqual((await friendsList()).sort(), [aId, bId].sort());
});

test('A->B: bloquear some da lista local e desbloquear restaura a amizade', async () => {
  await store.putContact({ pubkey: bId, state: 'friend', profile: { displayName: 'Bia' }, updatedAt: 1 });
  await store.putContact({ pubkey: aId, state: 'friend', profile: { displayName: 'Ana' }, updatedAt: 1 });

  await contacts.blockContact(bId);                    // "Bloquear" de A sobre B
  assert.equal(await typeOf(bId), 'blocked');
  assert.ok(!(await friendsList()).includes(bId));
  assert.equal(await typeOf(aId), 'friend');           // lado de B permanece amigo

  await contacts.unblockContact(bId);                  // "Desbloquear": volta a aparecer no aside
  assert.equal(await typeOf(bId), 'friend');
  assert.equal((await store.getContact(bId)).state, 'friend');
  assert.ok((await friendsList()).includes(bId));
});

test('A->B: remover amigo propaga removed e esvazia as duas pontas', async () => {
  await store.putContact({ pubkey: bId, state: 'friend', profile: { displayName: 'Bia' }, updatedAt: 1 });
  await store.putContact({ pubkey: aId, state: 'friend', profile: { displayName: 'Ana' }, updatedAt: 1 });

  // A escolhe "Remover amigo": tombstone local + contact_remove a B
  const toB = capturePeer(bId);
  await contacts.removeContact(bId);
  assert.equal(await typeOf(bId), null);               // some da lista de A
  assert.equal((await store.getContact(bId)).state, 'removed');
  assert.equal(toB.length, 1);
  assert.equal(toB[0].type, 'contact_remove');

  // B recebe a remocao: vinculo some sem desfazer nada alem do estado
  await contacts.handleContactRemove(aId);
  assert.equal(await typeOf(aId), null);
  assert.equal((await store.getContact(aId)).state, 'removed');
  assert.deepEqual(await friendsList(), []);

  // aceite atrasado nao ressuscita o vinculo removido
  await contacts.handleContactAccept(bId, { profile: { displayName: 'Bia' } });
  assert.equal((await store.getContact(bId)).state, 'removed');
  assert.deepEqual(await friendsList(), []);
});

test('A->B: pedidos cruzados resolvem em amizade nas duas pontas', async () => {
  const toB = capturePeer(bId), toA = capturePeer(aId);
  // A e B pedem amizade um ao outro ao mesmo tempo
  await contacts.requestContact(aIdentity, { pubkey: bId });
  await contacts.requestContact(bIdentity, { pubkey: aId });
  assert.equal(await typeOf(bId), 'outgoing');
  assert.equal(await typeOf(aId), 'outgoing');
  const reqAB = toB.find(e => e.type === 'contact_req');
  const reqBA = toA.find(e => e.type === 'contact_req');
  assert.ok(reqAB && reqBA);

  // cada lado recebe o pedido do outro sobre seu outgoing -> friend + accept
  await contacts.handleContactReq(bId, reqBA.body, aIdentity); // A recebe pedido de B
  await contacts.handleContactReq(aId, reqAB.body, bIdentity); // B recebe pedido de A
  assert.equal(await typeOf(bId), 'friend');
  assert.equal(await typeOf(aId), 'friend');
  assert.equal(toB.filter(e => e.type === 'contact_accept').length, 1); // A aceita a B
  assert.equal(toA.filter(e => e.type === 'contact_accept').length, 1); // B aceita a A
  assert.deepEqual((await friendsList()).sort(), [aId, bId].sort());
});
