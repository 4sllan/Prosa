import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpaceChannels } from '../src/services/supabase/space-channel.js';
import { createRelayReceiver } from '../src/services/p2p/relay.js';

const tick = () => new Promise(r => setImmediate(r));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// fake minimo do realtime (mesmo padrao de p2p-hub.test.js)
function fakeRealtime() {
  const channels = new Map();
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

// ---- space-channel ----

test('space-channel: sem client retorna null', () => {
  assert.equal(createSpaceChannels({ pubkey: 'me', client: null }), null);
});

test('space-channel: join inscreve e publishRelay envia envelope por broadcast', async () => {
  const rt = fakeRealtime();
  const chs = createSpaceChannels({ pubkey: 'me', client: rt });
  chs.join('sp1');
  const env = { id: 'sp1:a:2', spaceId: 'sp1', author: 'a', seq: 2, type: 'message.send' };
  assert.equal(await chs.publishRelay('sp1', env), true);
  const ch = rt.channels.get('prosa:space:sp1');
  assert.ok(ch.subscribed);
  assert.equal(ch.sent[0].event, 'relay');
  assert.deepEqual(ch.sent[0].payload.env, env);
});

test('space-channel: relay recebido vai ao onRelay com dedupe e filtros', async () => {
  const rt = fakeRealtime();
  const got = [];
  const chs = createSpaceChannels({ pubkey: 'me', client: rt, onRelay: e => got.push(e) });
  chs.join('sp1');
  await tick();
  const ch = rt.channels.get('prosa:space:sp1');
  const emit = (env) => ch.emit('relay', { env });
  emit({ id: 'sp1:a:2', spaceId: 'sp1', author: 'a', seq: 2 });
  emit({ id: 'sp1:a:2', spaceId: 'sp1', author: 'a', seq: 2 }); // duplicata
  emit({ id: 'sp1:me:1', spaceId: 'sp1', author: 'me', seq: 1 }); // proprio
  emit({ id: 'spX:a:1', spaceId: 'spX', author: 'a', seq: 1 });   // outro espaco
  emit(null);                                                    // malformed
  assert.deepEqual(got.map(e => e.id), ['sp1:a:2']);
});

test('space-channel: ctl vai ao onCtl e publishCtl envia from/ts', async () => {
  const rt = fakeRealtime();
  const got = [];
  const chs = createSpaceChannels({ pubkey: 'me', client: rt, onCtl: m => got.push(m) });
  chs.join('sp1');
  assert.equal(await chs.publishCtl('sp1', { type: 'typing', channelId: 'sp1:chat' }), true);
  const sent = rt.channels.get('prosa:space:sp1').sent[0];
  assert.equal(sent.event, 'ctl');
  assert.equal(sent.payload.type, 'typing');
  assert.equal(sent.payload.from, 'me');
  assert.ok(sent.payload.ts);
  const ch = rt.channels.get('prosa:space:sp1');
  ch.emit('ctl', { type: 'typing', channelId: 'sp1:chat', from: 'a', ts: 1 });
  ch.emit('ctl', { type: 'typing', channelId: 'sp1:chat', from: 'me', ts: 2 }); // proprio
  assert.equal(got.length, 1);
  assert.equal(got[0].from, 'a');
});

// ---- relay (ingestao ordenada) ----

const mkRx = ({ pull = async () => [], gapMs = 5, applied = [], cur = {} } = {}) =>
  createRelayReceiver({
    curMaxOf: (s, a) => cur[`${s}:${a}`] || 0,
    apply: async (env) => { applied.push(env.id); cur[`${env.spaceId}:${env.author}`] = env.seq; return true; },
    pull, gapMs,
  });
const env = (seq, over = {}) => ({ id: `sp1:a:${seq}`, spaceId: 'sp1', author: 'a', seq, ...over });

test('relay: envelopes contiguos aplicam em ordem', async () => {
  const applied = [];
  const rx = mkRx({ applied });
  assert.equal(await rx.ingest(env(1)), true);
  assert.equal(await rx.ingest(env(2)), true);
  assert.deepEqual(applied, ['sp1:a:1', 'sp1:a:2']);
});

test('relay: fora de ordem bufferiza e aplica ao fechar a lacuna', async () => {
  const applied = []; const cur = { 'sp1:a': 1 };
  const rx = mkRx({ applied, cur });
  assert.equal(await rx.ingest(env(4)), false); // lacuna: falta 2 e 3
  assert.equal(await rx.ingest(env(2)), true);  // aplica 2
  assert.equal(await rx.ingest(env(3)), true);  // aplica 3 -> flush aplica 4
  assert.deepEqual(applied, ['sp1:a:2', 'sp1:a:3', 'sp1:a:4']);
  assert.equal(rx.gaps.size, 0);
});

test('relay: lacuna persistente dispara pull do mailbox e aplica em ordem', async () => {
  const applied = []; const cur = { 'sp1:a': 1 };
  const pulls = [];
  const rx = mkRx({
    applied, cur, gapMs: 5,
    pull: async (s, a, after) => { pulls.push([s, a, after]); return [env(2), env(3)]; },
  });
  await rx.ingest(env(4));
  await sleep(30); // timer do gap
  assert.deepEqual(pulls, [['sp1', 'a', 1]]);
  assert.deepEqual(applied, ['sp1:a:2', 'sp1:a:3', 'sp1:a:4']); // pull fecha 2-3; buffer aplica 4
});

test('relay: pull parcial aplica o que fecha e esgota o resto em retries', async () => {
  const applied = []; const cur = { 'sp1:a': 1 };
  const pulls = [];
  const rx = mkRx({
    applied, cur, gapMs: 5, maxTries: 3,
    // pull nunca traz seq 5 — seq 6 nao fecha e o buffer e descartado
    pull: async (s, a, after) => { pulls.push(after); return [env(2), env(3), env(4)]; },
  });
  await rx.ingest(env(6));
  await sleep(40);
  assert.deepEqual(applied, ['sp1:a:2', 'sp1:a:3', 'sp1:a:4']);
  assert.equal(rx.gaps.size, 0);      // buffer largado apos maxTries
  assert.ok(pulls.length >= 2);       // retry aconteceu antes de desistir
});

test('relay: duplicata e seq retroativa sao deduplicadas', async () => {
  const applied = []; const cur = { 'sp1:a': 2 };
  const rx = mkRx({ applied, cur });
  assert.equal(await rx.ingest(env(1)), false);
  assert.equal(await rx.ingest(env(2)), false);
  assert.equal(applied.length, 0);
});

test('relay: lacuna sem resposta do mailbox esgota tentativas e larga o buffer', async () => {
  const applied = []; const cur = { 'sp1:a': 1 };
  const rx = mkRx({ applied, cur, gapMs: 2, maxTries: 2, pull: async () => [] });
  await rx.ingest(env(5));
  await sleep(30); // 2 fills (gapMs 2ms) esgotam maxTries
  assert.equal(rx.gaps.size, 0);
  assert.equal(applied.length, 0);
});
