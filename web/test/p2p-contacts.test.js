import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as contacts from '../src/services/p2p/contacts.js';
import { initLocalStore } from '../src/services/p2p/localstore.js';
import { configureTransport, p2pTransport, resetTransportState } from '../src/services/p2p/transport.js';
import { createP2PProvider } from '../src/services/providers/p2p.js';

const store = initLocalStore();
assert.equal(store.name, 'memory');
const peer = 'ab'.repeat(32);
const identity = {
  publicUser: () => ({ id: 'cd'.repeat(32), username: 'local', displayName: 'Local' }),
};
const remoteProfile = { id: peer, username: 'remote', displayName: 'Remote' };
const states = ['incoming', 'outgoing', 'friend', 'blocked', 'removed', 'unknown'];

async function seed(state, pubkey = peer) {
  await store.putContact({ pubkey, state, profile: { displayName: 'Original' }, updatedAt: 1 });
  return structuredClone(await store.getContact(pubkey));
}

function capturePeer() {
  const sent = [];
  p2pTransport.addPeer(peer, {
    send: (data) => sent.push(JSON.parse(data)),
    close() {},
  }, { keepalive: false });
  return sent;
}

beforeEach(async () => {
  resetTransportState();
  configureTransport({ myId: identity.publicUser().id, emitEvent: () => {} });
  for (const c of await store.allContacts()) await store.removeContact(c.pubkey);
});
afterEach(() => resetTransportState());

test('contacts: explicit request persists outgoing and sends public profile once', async () => {
  const sent = capturePeer();
  await contacts.requestContact(identity, { pubkey: peer });
  const original = structuredClone(await store.getContact(peer));
  await contacts.requestContact(identity, { pubkey: peer });
  assert.equal(original.state, 'outgoing');
  assert.deepEqual(await store.allContacts(), [original]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'contact_req');
  assert.equal(sent[0].to, peer);
  assert.deepEqual(sent[0].body, { profile: identity.publicUser() });
});

test('contacts: incoming request uses channel peer, not the profile id', async () => {
  await contacts.handleContactReq(peer, { profile: { ...remoteProfile, id: 'untrusted' } }, identity);
  assert.equal((await store.getContact(peer)).state, 'incoming');
  assert.equal(await store.getContact('untrusted'), null);
  assert.equal((await store.allContacts()).length, 1);
});

for (const state of states.filter(s => s !== 'removed' && s !== 'outgoing')) {
  test(`contacts: repeated request preserves ${state}`, async () => {
    const original = await seed(state);
    await contacts.handleContactReq(peer, { profile: remoteProfile }, identity);
    await contacts.handleContactReq(peer, { profile: remoteProfile }, identity);
    assert.deepEqual(await store.getContact(peer), original);
    assert.equal((await store.allContacts()).length, 1);
  });
}

test('contacts: crossed request over outgoing resolves to friend and sends contact_accept', async () => {
  await seed('outgoing');
  const sent = capturePeer();
  const c = await contacts.handleContactReq(peer, { profile: remoteProfile }, identity);
  assert.equal(c.state, 'friend');
  const stored = await store.getContact(peer);
  assert.equal(stored.state, 'friend');
  assert.deepEqual(stored.profile, remoteProfile); // mescla perfil do pedido
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'contact_accept');
  assert.deepEqual(sent[0].body, { profile: identity.publicUser() });
});

test('contacts: local acceptance promotes incoming and sends contact_accept', async () => {
  await seed('incoming');
  const sent = capturePeer();
  await contacts.acceptContact(identity, peer);
  assert.equal((await store.getContact(peer)).state, 'friend');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'contact_accept');
  assert.deepEqual(sent[0].body, { profile: identity.publicUser() });
});

for (const state of [null, ...states.filter(s => s !== 'incoming')]) {
  test(`contacts: local acceptance rejects ${state || 'missing'} without changes or sends`, async () => {
    const original = state ? await seed(state) : null;
    const sent = capturePeer();
    await assert.rejects(contacts.acceptContact(identity, peer), /Contato desconhecido|Solicita/);
    assert.deepEqual(await store.getContact(peer), original);
    assert.deepEqual(sent, []);
  });
}

test('contacts: remote acceptance promotes outgoing and merges profile', async () => {
  await seed('outgoing');
  await store.putContact({ ...(await store.getContact(peer)), profile: { bio: 'Keep' } });
  await contacts.handleContactAccept(peer, { profile: remoteProfile });
  const c = await store.getContact(peer);
  assert.equal(c.state, 'friend');
  assert.deepEqual(c.profile, { bio: 'Keep', ...remoteProfile });
  const original = structuredClone(c);
  await contacts.handleContactAccept(peer, { profile: { displayName: 'Late' } });
  assert.deepEqual(await store.getContact(peer), original);
});

for (const state of [null, ...states.filter(s => s !== 'outgoing')]) {
  test(`contacts: remote acceptance ignores ${state || 'missing'}`, async () => {
    const original = state ? await seed(state) : null;
    await contacts.handleContactAccept(peer, { profile: remoteProfile });
    assert.deepEqual(await store.getContact(peer), original);
  });
}

test('contacts: removal persists tombstone, sends control and keeps unrelated data', async () => {
  await seed('outgoing');
  const otherKey = 'ef'.repeat(32);
  const other = await seed('friend', otherKey);
  const peers = { [peer]: { fingerprint: 'test', lastSeen: 1 } };
  await store.kvSet('peers', peers);
  await store.putEvent({ id: 'test-message', spaceId: 'test-dm', body: { content: 'keep' } });
  await store.putProjection('test-dm:messages', 'test-dm', { content: 'keep' });
  const events = structuredClone(await store.eventsInSpace('test-dm'));
  const sent = capturePeer();
  await contacts.removeContact(peer);
  assert.equal((await store.getContact(peer)).state, 'removed');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'contact_remove');
  assert.deepEqual(sent[0].body, {});
  assert.equal(p2pTransport.isOnline(peer), true);
  assert.deepEqual(await store.getContact(otherKey), other);
  assert.deepEqual(await store.kvGet('peers'), peers);
  assert.deepEqual(await store.eventsInSpace('test-dm'), events);
  assert.deepEqual(await store.getProjection('test-dm:messages'), { content: 'keep' });
});

for (const state of ['incoming', 'outgoing', 'friend', 'removed', 'blocked']) {
  test(`contacts: remote removal handles ${state} without unblocking`, async () => {
    const original = await seed(state);
    await contacts.handleContactRemove(peer);
    const c = await store.getContact(peer);
    assert.equal(c.state, state === 'blocked' ? 'blocked' : 'removed');
    if (state === 'blocked') assert.deepEqual(c, original);
  });
}

test('contacts: remote removal of missing peer does not create contact', async () => {
  await contacts.handleContactRemove(peer);
  assert.equal(await store.getContact(peer), null);
});

test('contacts: explicit request can reuse removed contact but not blocked contact', async () => {
  await seed('removed');
  const sent = capturePeer();
  await contacts.requestContact(identity, { pubkey: peer });
  assert.equal((await store.getContact(peer)).state, 'outgoing');
  assert.equal(sent.length, 1);
  const blocked = await seed('blocked');
  await contacts.requestContact(identity, { pubkey: peer });
  assert.deepEqual(await store.getContact(peer), blocked);
  assert.equal(sent.length, 1);
});

test('contacts: late acceptance after cancellation does not restore friendship', async () => {
  await contacts.requestContact(identity, { pubkey: peer });
  await contacts.removeContact(peer);
  const removed = structuredClone(await store.getContact(peer));
  await contacts.handleContactAccept(peer, { profile: remoteProfile });
  assert.deepEqual(await store.getContact(peer), removed);
  assert.deepEqual((await createP2PProvider().contacts.list()).relationships, []);
});

test('provider: only supported states are exposed; removed stays hidden on reread', async () => {
  const provider = createP2PProvider();
  for (const [i, state] of states.entries()) await seed(state, String(i).repeat(64));
  const expected = ['incoming', 'outgoing', 'friend', 'blocked'];
  const first = await provider.contacts.list();
  assert.deepEqual(first.relationships.map(r => r.type), expected);
  assert.equal(first.relationships[0].user.id, '0'.repeat(64));
  assert.deepEqual(await provider.contacts.list(), first);

  await contacts.removeContact('1'.repeat(64));
  assert.deepEqual((await provider.contacts.list()).relationships.map(r => r.type),
    ['incoming', 'friend', 'blocked']);
  assert.equal((await store.getContact('1'.repeat(64))).state, 'removed');
});

test('contacts: offline cancellation flushes request then removal when peer reconnects', async () => {
  await contacts.requestContact(identity, { pubkey: peer });
  await contacts.removeContact(peer);
  assert.equal((await store.getContact(peer)).state, 'removed');
  assert.deepEqual((await createP2PProvider().contacts.list()).relationships, []);
  const sent = capturePeer();
  assert.deepEqual(sent.map(env => env.type), ['contact_req', 'contact_remove']);
  const sender = identity.publicUser().id;
  await contacts.handleContactReq(sender, sent[0].body, identity);
  assert.equal((await store.getContact(sender)).state, 'incoming');
  await contacts.handleContactRemove(sender);
  assert.equal((await store.getContact(sender)).state, 'removed');
  assert.deepEqual((await createP2PProvider().contacts.list()).relationships, []);
  assert.equal(p2pTransport.isOnline(peer), true);
});

test('contacts: transport restart loses offline control queue but keeps removed contact hidden', async () => {
  await seed('outgoing');
  await contacts.removeContact(peer);
  resetTransportState();
  configureTransport({ myId: identity.publicUser().id, emitEvent: () => {} });
  const sent = capturePeer();
  assert.deepEqual(sent, []);
  assert.equal((await store.getContact(peer)).state, 'removed');
  assert.deepEqual((await createP2PProvider().contacts.list()).relationships, []);
  await contacts.handleContactAccept(peer, { profile: remoteProfile });
  assert.equal((await store.getContact(peer)).state, 'removed');
});

test('contacts: cloned IPC reads cannot let concurrent profile restore removed state', async (t) => {
  await seed('incoming');
  const get = store.getContact.bind(store);
  t.mock.method(store, 'getContact', async key => structuredClone(await get(key)));
  await Promise.all([
    contacts.handleContactRemove(peer),
    contacts.handleProfile(peer, { profile: remoteProfile }),
  ]);
  assert.equal((await store.getContact(peer)).state, 'removed');
  assert.deepEqual((await createP2PProvider().contacts.list()).relationships, []);
});

test('contacts: cloned IPC reads preserve local cancellation during profile update', async (t) => {
  await seed('outgoing');
  const get = store.getContact.bind(store);
  t.mock.method(store, 'getContact', async key => structuredClone(await get(key)));
  await Promise.all([
    contacts.removeContact(peer),
    contacts.updateProfile(peer, remoteProfile),
  ]);
  assert.equal((await store.getContact(peer)).state, 'removed');
});

test('contacts: cloned IPC reads preserve block during profile update', async (t) => {
  await seed('friend');
  const get = store.getContact.bind(store);
  t.mock.method(store, 'getContact', async key => structuredClone(await get(key)));
  await Promise.all([
    contacts.blockContact(peer),
    contacts.updateProfile(peer, remoteProfile),
  ]);
  assert.equal((await store.getContact(peer)).state, 'blocked');
});

test('contacts: failed mutation releases the contact queue for retry', async (t) => {
  await seed('outgoing');
  const get = store.getContact.bind(store), put = store.putContact.bind(store);
  t.mock.method(store, 'getContact', async key => structuredClone(await get(key)));
  let fail = true;
  t.mock.method(store, 'putContact', async contact => {
    if (fail) throw new Error('Synthetic IPC write failure');
    return put(contact);
  });
  await assert.rejects(contacts.removeContact(peer), /Synthetic IPC/);
  fail = false;
  await contacts.removeContact(peer);
  assert.equal((await store.getContact(peer)).state, 'removed');
});

test('contacts: mutations of different peers are not blocked by a slow IPC write', async (t) => {
  const other = 'ef'.repeat(32);
  await seed('outgoing');
  await seed('outgoing', other);
  const get = store.getContact.bind(store), put = store.putContact.bind(store);
  t.mock.method(store, 'getContact', async key => structuredClone(await get(key)));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  t.mock.method(store, 'putContact', async contact => {
    if (contact.pubkey === peer) await gate;
    return put(contact);
  });
  const removal = contacts.removeContact(peer);
  let otherComplete = false;
  const blocking = contacts.blockContact(other).then(() => { otherComplete = true; });
  t.after(async () => { release(); await Promise.all([removal, blocking]); });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(otherComplete, true);
  assert.equal((await store.getContact(other)).state, 'blocked');
});

test('contacts: concurrent requests with cloned IPC reads send only one invitation', async (t) => {
  const get = store.getContact.bind(store);
  t.mock.method(store, 'getContact', async key => structuredClone(await get(key)));
  const sent = capturePeer();
  await Promise.all([
    contacts.requestContact(identity, { pubkey: peer }),
    contacts.requestContact(identity, { pubkey: peer }),
  ]);
  assert.equal(sent.filter(env => env.type === 'contact_req').length, 1);
  assert.equal((await store.getContact(peer)).state, 'outgoing');
});
