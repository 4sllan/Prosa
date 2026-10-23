import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSupabaseConfig } from '../src/services/supabase/config.js';
import { createPresence } from '../src/services/supabase/presence.js';

const memStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
};

test('config: sem storage nem env, hub desligado', () => {
  const cfg = resolveSupabaseConfig({ storage: memStorage(), env: {} });
  assert.equal(cfg.enabled, false);
  assert.equal(cfg.url, '');
});

test('config: env VITE_* habilita o hub', () => {
  const cfg = resolveSupabaseConfig({
    storage: memStorage(),
    env: { VITE_SUPABASE_URL: 'https://ref.supabase.co/', VITE_SUPABASE_ANON_KEY: 'sb_publishable_x' },
  });
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.url, 'https://ref.supabase.co'); // barra final removida
  assert.equal(cfg.key, 'sb_publishable_x');
});

test('config: localStorage prosa_supabase tem precedência sobre env', () => {
  const storage = memStorage({ prosa_supabase: '{"url":"https://outro.supabase.co","key":"k2"}' });
  const cfg = resolveSupabaseConfig({ storage, env: { VITE_SUPABASE_URL: 'https://env.supabase.co', VITE_SUPABASE_ANON_KEY: 'k1' } });
  assert.equal(cfg.url, 'https://outro.supabase.co');
  assert.equal(cfg.key, 'k2');
});

test('config: JSON inválido no localStorage cai no env', () => {
  const storage = memStorage({ prosa_supabase: 'nao-e-json' });
  const cfg = resolveSupabaseConfig({ storage, env: { VITE_SUPABASE_URL: 'https://env.supabase.co', VITE_SUPABASE_ANON_KEY: 'k1' } });
  assert.equal(cfg.url, 'https://env.supabase.co');
});

test('config: só url sem key não habilita', () => {
  const cfg = resolveSupabaseConfig({ storage: memStorage(), env: { VITE_SUPABASE_URL: 'https://x.co' } });
  assert.equal(cfg.enabled, false);
});

function fakeClient() {
  const channels = new Map();
  const mkChannel = (topic) => {
    const ch = {
      topic,
      presenceStateValue: {},
      subscribed: false,
      onSync: [],
      onLeave: [],
      trackCalls: [],
      on(_t, filter, fn) {
        (filter.event === 'sync' ? ch.onSync : ch.onLeave).push(fn);
        return ch;
      },
      subscribe(fn) { ch.subscribed = true; fn?.('SUBSCRIBED'); return ch; },
      presenceState: () => ch.presenceStateValue,
      track: async (p) => { ch.trackCalls.push(p); },
      unsubscribe: async () => { ch.subscribed = false; },
    };
    channels.set(topic, ch);
    return ch;
  };
  return { channels, channel: mkChannel };
}

test('presence: sem client retorna null', () => {
  assert.equal(createPresence({ pubkey: 'me', client: null }), null);
});

test('presence: publica track no próprio canal ao assinar', () => {
  const client = fakeClient();
  const p = createPresence({ pubkey: 'me', profile: { displayName: 'Eu' }, client });
  const mine = client.channels.get('prosa:presence:me');
  assert.ok(mine.subscribed);
  assert.equal(mine.trackCalls.length, 1);
  assert.equal(mine.trackCalls[0].displayName, 'Eu');
});

test('presence: watchPeer reporta online/offline pelo presenceState do canal do par', async () => {
  const client = fakeClient();
  const seen = [];
  const p = createPresence({ pubkey: 'me', client, onPeer: (id, s) => seen.push([id, s]) });
  p.watchPeer('peer1');
  const peerCh = client.channels.get('prosa:presence:peer1');
  assert.ok(peerCh.subscribed);

  peerCh.presenceStateValue = { peer1: [{}] };
  for (const fn of peerCh.onSync) fn();
  assert.deepEqual(seen.at(-1), ['peer1', 'online']);

  peerCh.presenceStateValue = {};
  for (const fn of peerCh.onLeave) fn();
  assert.deepEqual(seen.at(-1), ['peer1', 'offline']);
});

test('presence: unwatchPeer desinscreve e reporta offline; dispose limpa tudo', async () => {
  const client = fakeClient();
  const seen = [];
  const p = createPresence({ pubkey: 'me', client, onPeer: (id, s) => seen.push([id, s]) });
  p.watchPeer('peer1');
  p.watchPeer('peer1'); // idempotente
  assert.equal(client.channels.size, 2); // meu canal + peer1
  p.unwatchPeer('peer1');
  assert.deepEqual(seen.at(-1), ['peer1', 'offline']);
  assert.equal(client.channels.get('prosa:presence:peer1').subscribed, false);
  p.watchPeer('peer2');
  p.dispose();
  assert.equal(client.channels.get('prosa:presence:peer2').subscribed, false);
  assert.equal(client.channels.get('prosa:presence:me').subscribed, false);
});
