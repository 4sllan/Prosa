import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresenceSources } from '../src/services/presence-sources.js';
import { createPresence } from '../src/services/supabase/presence.js';

// ---- resolver DC > hub > offline ----

test('presence-sources: DC aberto resolve online mesmo com hub offline', () => {
  const out = [];
  const ps = createPresenceSources({ onChange: (u, v) => out.push([u, v]) });
  ps.update('hub', 'p1', 'offline');
  ps.dcOpen('p1');
  assert.equal(ps.resolve('p1'), 'online');
  assert.deepEqual(out.at(-1), ['p1', 'online']);
});

test('presence-sources: status rico do DC vence o do hub', () => {
  const ps = createPresenceSources();
  ps.update('hub', 'p1', 'online');
  ps.update('dc', 'p1', 'dnd');
  assert.equal(ps.resolve('p1'), 'dnd');
});

test('presence-sources: peer.closed mantém quem segue online no hub', () => {
  const ps = createPresenceSources();
  ps.update('hub', 'p1', 'idle');
  ps.dcOpen('p1');
  ps.dcClosed('p1');
  assert.equal(ps.resolve('p1'), 'idle'); // hub assume quando o DC cai
});

test('presence-sources: sem nenhuma fonte resolve offline', () => {
  const ps = createPresenceSources();
  ps.dcOpen('p1');
  ps.dcClosed('p1');
  assert.equal(ps.resolve('p1'), 'offline');
  assert.equal(ps.resolve('nunca-visto'), 'offline');
});

// ---- track do hub: status no payload e leitura do presenceState ----

function fakeChannel() {
  const ch = {
    state: {},
    tracked: [],
    listeners: {},
    subscribe(cb) { cb?.('SUBSCRIBED'); return ch; },
    track(p) { ch.tracked.push(p); return Promise.resolve(); },
    on(type, filter, fn) { (ch.listeners[type] ||= []).push(fn); return ch; },
    presenceState() { return ch.state; },
    unsubscribe() { return Promise.resolve(); },
  };
  return ch;
}
const fakeClient = (channels) => ({ channel: (name) => channels.get(name) ?? channels.set(name, fakeChannel()).get(name) });

test('presence: track inicial publica status online; publish propaga status', async () => {
  const channels = new Map();
  const p = createPresence({ pubkey: 'me', profile: { displayName: 'Eu' }, client: fakeClient(channels) });
  const my = channels.get('prosa:presence:me');
  assert.equal(my.tracked[0].status, 'online');
  assert.equal(my.tracked[0].displayName, 'Eu');
  await p.publish({ status: 'dnd' });
  assert.equal(my.tracked.at(-1).status, 'dnd');
});

test('presence: watchPeer repassa o status do track; ausente vira offline', () => {
  const seen = [];
  const channels = new Map();
  const p = createPresence({ pubkey: 'me', client: fakeClient(channels), onPeer: (id, st) => seen.push([id, st]) });
  p.watchPeer('peer1');
  const ch = channels.get('prosa:presence:peer1');
  ch.state = { peer1: [{ displayName: 'P', status: 'idle', ts: 5 }] };
  for (const fn of ch.listeners.presence || []) fn(); // simula sync
  assert.deepEqual(seen.at(-1), ['peer1', 'idle']);
  assert.equal(p.stateOf('peer1'), 'idle');
  ch.state = {};
  for (const fn of ch.listeners.presence || []) fn();
  assert.deepEqual(seen.at(-1), ['peer1', 'offline']);
  assert.equal(p.stateOf('peer1'), 'offline');
});

test('presence: sem client retorna null', () => {
  assert.equal(createPresence({ pubkey: 'me', client: null }), null);
});
