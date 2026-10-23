// Testes do inbox de convergencia: descoberta de espacos, genesis, pull e
// resiliencia — com persistence/store fakes (sem Supabase real).
import test from 'node:test';
import assert from 'node:assert/strict';
import { convergeInbox } from '../src/services/supabase/inbox.js';

const env = (spaceId, author, seq, extra = {}) =>
  ({ id: `${spaceId}:${author}:${seq}`, spaceId, author, seq, ts: seq * 1000, payload: { body: `m${seq}` }, ...extra });

const fakePersistence = ({ memberships = [], genesis = {}, events = {} } = {}) => ({
  calls: [],
  async listMemberships(pubkey) { this.calls.push(['members', pubkey]); return memberships; },
  async getGenesis(spaceId) { this.calls.push(['genesis', spaceId]); return genesis[spaceId] ?? null; },
  async spaceEventsSince(spaceId, opts) { this.calls.push(['pull', spaceId, opts]); return events[spaceId] ?? []; },
});

test('inbox: espaco desconhecido e reconstruido pelo genesis e converge os eventos', async () => {
  const genesis = { spaceId: 'sp1', type: 'space.genesis' };
  const p = fakePersistence({
    memberships: ['sp1'],
    genesis: { sp1: genesis },
    events: { sp1: [env('sp1', 'a', 1), env('sp1', 'a', 2)] },
  });
  const accepted = [], ingested = [];
  await convergeInbox({
    persistence: p, pubkey: 'me',
    getSpace: () => null, // nao conheco o espaco
    maxSeqOf: async () => ({}),
    acceptGenesis: async (g) => accepted.push(g),
    ingest: async (e) => ingested.push(e),
  });
  assert.deepEqual(accepted, [genesis]);
  assert.equal(ingested.length, 2); // todos os eventos do mailbox foram ingeridos
});

test('inbox: espaco conhecido nao pede genesis e pull usa o mapa have', async () => {
  const p = fakePersistence({
    memberships: ['sp1'],
    events: { sp1: [env('sp1', 'a', 3)] },
  });
  const accepted = [], ingested = [];
  await convergeInbox({
    persistence: p, pubkey: 'me',
    getSpace: () => ({ id: 'sp1' }), // espaco ja existe localmente
    maxSeqOf: async () => ({ a: 2 }),
    acceptGenesis: async (g) => accepted.push(g),
    ingest: async (e) => ingested.push(e),
  });
  assert.equal(accepted.length, 0); // sem genesis — nao precisava
  const pull = p.calls.find(c => c[0] === 'pull');
  assert.deepEqual(pull[2].have, { a: 2 }); // pull so do que falta
  assert.deepEqual(ingested.map(e => e.id), ['sp1:a:3']);
});

test('inbox: membership sem genesis no espelho e pulada sem abortar as demais', async () => {
  const p = fakePersistence({
    memberships: ['spX', 'sp2'], // spX sem genesis
    genesis: { sp2: { spaceId: 'sp2', type: 'space.genesis' } },
    events: { sp2: [env('sp2', 'a', 1)] },
  });
  const accepted = [], ingested = [];
  await convergeInbox({
    persistence: p, pubkey: 'me',
    getSpace: () => null,
    maxSeqOf: async () => ({}),
    acceptGenesis: async (g) => accepted.push(g),
    ingest: async (e) => ingested.push(e),
  });
  assert.deepEqual(accepted.map(g => g.spaceId), ['sp2']); // spX pulada
  assert.equal(ingested.length, 1);
});

test('inbox: erro num espaco nao impede a convergencia dos demais', async () => {
  const p = fakePersistence({ memberships: ['bad', 'good'] });
  p.getGenesis = async (id) => { if (id === 'bad') throw new Error('db down'); return { spaceId: id, type: 'space.genesis' }; };
  const accepted = [];
  await convergeInbox({
    persistence: p, pubkey: 'me',
    getSpace: () => null,
    maxSeqOf: async () => ({}),
    acceptGenesis: async (g) => accepted.push(g.spaceId),
    ingest: async () => {},
  });
  assert.deepEqual(accepted, ['good']); // o espaco ruim falhou, o bom convergiu
});

test('inbox: sem persistence ou pubkey nao faz nada (hub desligado)', async () => {
  await convergeInbox({ pubkey: 'me' }); // sem persistence
  const p = fakePersistence({ memberships: ['sp1'] });
  await convergeInbox({ persistence: p }); // sem pubkey
  assert.equal(p.calls.length, 0);
});
