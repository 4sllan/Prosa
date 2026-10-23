import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createSignaling } from '../src/services/supabase/signaling.js';
import { createPersistence } from '../src/services/supabase/persistence.js';
import * as contacts from '../src/services/p2p/contacts.js';
import { initLocalStore } from '../src/services/p2p/localstore.js';
import { configureTransport, resetTransportState } from '../src/services/p2p/transport.js';

const tick = () => new Promise(r => setImmediate(r));
const ME = 'cd'.repeat(32);
const PEER = 'ab'.repeat(32);
const store = initLocalStore();
const identity = { publicUser: () => ({ id: ME, username: 'local', displayName: 'Local' }) };

function fakeRealtime() {
  const channels = new Map();
  const mk = (topic) => {
    const ch = {
      topic, subscribed: false, sent: [], broadcastFns: [],
      on(t, f, fn) { if (t === 'broadcast') ch.broadcastFns.push({ event: f.event, fn }); return ch; },
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

function fakePg(rows = {}) {
  const calls = [];
  const applyFilters = (list, filters) => list.filter(r =>
    filters.every(([op, col, v]) => op !== 'eq' || r[col] === v));
  return {
    calls,
    from: (table) => ({
      select: () => {
        const state = { table, op: 'select', filters: [] };
        calls.push(state);
        const b = {
          eq: (c, v) => { state.filters.push(['eq', c, v]); return b; },
          order: () => b, limit: () => b,
          then: (fn) => Promise.resolve({ data: applyFilters(rows[table] || [], state.filters), error: null }).then(fn),
        };
        return b;
      },
    }),
  };
}

beforeEach(async () => {
  resetTransportState();
  configureTransport({ myId: ME, emitEvent: () => {} });
  for (const c of await store.allContacts()) await store.removeContact(c.pubkey);
});
afterEach(() => resetTransportState());

// ---- signaling notify ----

test('notify: sendNotify publica evento notify no canal do destinatário', async () => {
  const rt = fakeRealtime();
  const sig = createSignaling({ pubkey: ME, client: rt });
  await sig.sendNotify(PEER, { kind: 'invite', profile: { displayName: 'Local' } });
  const out = rt.channels.get(`prosa:user:${PEER}`);
  assert.equal(out.sent[0].event, 'notify');
  assert.equal(out.sent[0].payload.kind, 'invite');
  assert.equal(out.sent[0].payload.from, ME);
});

test('notify: inbox despacha notify endereçado a mim e ignora o resto', async () => {
  const rt = fakeRealtime();
  const sig = createSignaling({ pubkey: ME, client: rt });
  await tick();
  const got = [];
  sig.onNotify(m => got.push(m));
  const inbox = rt.channels.get(`prosa:user:${ME}`);
  inbox.emit('notify', { from: PEER, to: ME, kind: 'invite' });
  inbox.emit('notify', { from: PEER, to: 'outro', kind: 'invite' });
  inbox.emit('signal', { from: PEER, to: ME, kind: 'desc' }); // evento errado
  assert.equal(got.length, 1);
  assert.equal(got[0].kind, 'invite');
});

// ---- handleHubNotify (dedupe = handlers idempotentes) ----

test('notify: invite cria contato incoming; repetido é absorvido', async () => {
  assert.equal(await contacts.handleHubNotify(identity, { from: PEER, to: ME, kind: 'invite', profile: { displayName: 'R' } }), true);
  const c = await store.getContact(PEER);
  assert.equal(c.state, 'incoming');
  assert.equal(c.profile.displayName, 'R');
  // duplicata (DC + hub) não duplica nem regride o estado
  assert.equal(await contacts.handleHubNotify(identity, { from: PEER, to: ME, kind: 'invite' }), true);
  assert.equal((await store.getContact(PEER)).state, 'incoming');
});

test('notify: relationship friend confirma outgoing; removed marca removed', async () => {
  await store.putContact({ pubkey: PEER, state: 'outgoing', profile: {}, updatedAt: 1 });
  assert.equal(await contacts.handleHubNotify(identity, { from: PEER, to: ME, kind: 'relationship', state: 'friend' }), true);
  assert.equal((await store.getContact(PEER)).state, 'friend');
  assert.equal(await contacts.handleHubNotify(identity, { from: PEER, to: ME, kind: 'relationship', state: 'removed' }), true);
  assert.equal((await store.getContact(PEER)).state, 'removed');
});

test('notify: kind/estado desconhecido retorna false', async () => {
  assert.equal(await contacts.handleHubNotify(identity, { from: PEER, to: ME, kind: 'x' }), false);
  assert.equal(await contacts.handleHubNotify(identity, { from: PEER, to: ME, kind: 'relationship', state: 'x' }), false);
  assert.equal(await contacts.handleHubNotify(identity, null), false);
});

test('notify: invite de contato blocked é ignorado silenciosamente', async () => {
  await store.putContact({ pubkey: PEER, state: 'blocked', profile: {}, updatedAt: 1 });
  await contacts.handleHubNotify(identity, { from: PEER, to: ME, kind: 'invite' });
  assert.equal((await store.getContact(PEER)).state, 'blocked');
});

// ---- persistence: inbox de convites + perfil ----

test('persistence: pendingInvites filtra to+pending e getProfile lê a linha', async () => {
  const pg = fakePg({
    invites: [
      { id: 'i1', from_pubkey: 'p1', to_pubkey: ME, status: 'pending' },
      { id: 'i2', from_pubkey: 'p2', to_pubkey: ME, status: 'accepted' },
      { id: 'i3', from_pubkey: 'p3', to_pubkey: 'outro', status: 'pending' },
    ],
    profiles: [{ pubkey: 'p1', display_name: 'Um', avatar_url: null, bio: '', status_text: '', fingerprint: 'fp' }],
  });
  const p = createPersistence({ client: pg });
  const inv = await p.pendingInvites(ME);
  assert.deepEqual(inv.map(i => i.id), ['i1']);
  const prof = await p.getProfile('p1');
  assert.equal(prof.displayName, 'Um');
  assert.equal(prof.fingerprint, 'fp');
});
