import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersistence } from '../src/services/supabase/persistence.js';

// Fake mínimo do PostgREST: registra tabela/op/payload/filtros; `rows` semeia selects.
function fakePg(rows = {}) {
  const calls = [];
  const applyFilters = (list, filters) => list.filter(r =>
    filters.every(([op, col, v]) =>
      op === 'eq' ? r[col] === v : op === 'gt' ? r[col] > v : op === 'lt' ? r[col] < v : true));
  const builder = (table, op, payload) => {
    const state = { table, op, payload, filters: [] };
    calls.push(state);
    const b = {
      eq: (c, v) => { state.filters.push(['eq', c, v]); return b; },
      gt: (c, v) => { state.filters.push(['gt', c, v]); return b; },
      lt: (c, v) => { state.filters.push(['lt', c, v]); return b; },
      is: (c, v) => { state.filters.push(['is', c, v]); return b; },
      order: (col, { ascending } = {}) => { (state.orderBy ||= []).push([col, ascending]); return b; },
      range: (a, z) => { state.range = [a, z]; return b; },
      limit: () => b,
      select: () => b,
      then: (fn) => {
        let data = op === 'select' ? applyFilters(rows[table] || [], state.filters) : [];
        // ordenação estável: aplica na ordem inversa para o 1º order() dominar
        for (const [col, asc] of [...(state.orderBy || [])].reverse()) {
          data = [...data].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc === false ? -1 : 1));
        }
        if (state.range) data = data.slice(state.range[0], state.range[1] + 1);
        return Promise.resolve({ data, error: null }).then(fn);
      },
    };
    return b;
  };
  return {
    calls,
    from: (table) => ({
      upsert: (p, opts) => builder(table, 'upsert', { ...p, _onConflict: opts?.onConflict }),
      insert: (p) => builder(table, 'insert', p),
      update: (p) => builder(table, 'update', p),
      delete: () => builder(table, 'delete'),
      select: (cols) => builder(table, 'select', cols),
    }),
  };
}

const env = (type, body, over = {}) => ({
  id: 'sp1:author:1', spaceId: 'sp1', author: 'author', seq: 1, ts: 1700000000000,
  type, body, ...over,
});
const dm = { id: 'sp1', type: 'dm', meta: { name: 'DM' }, members: new Set(['a', 'b']), admins: new Set(['a']) };

test('persistence: sem client retorna null', () => {
  assert.equal(createPersistence({ client: null }), null);
});

test('persistence: message.send espelha profile+mailbox+conversa+membro+mensagem com event_id', async () => {
  const pg = fakePg();
  const p = createPersistence({ client: pg });
  await p.mirrorEvent(env('message.send', {
    channelId: 'chat', message: { id: 'm1', content: 'oi', replyTo: null, attachments: [] },
  }), dm);
  const tables = pg.calls.map(c => `${c.table}:${c.op}`);
  assert.deepEqual(tables, ['profiles:upsert', 'space_events:upsert', 'conversations:upsert', 'conversation_members:upsert', 'messages:upsert']);
  const msg = pg.calls.find(c => c.table === 'messages').payload;
  assert.equal(msg.id, 'm1');
  assert.equal(msg.event_id, 'sp1:author:1');
  assert.equal(msg.conversation_id, 'sp1');
  assert.equal(msg.channel_id, 'chat');
  assert.equal(msg.content, 'oi');
});

test('persistence: message.edit/delete atualizam a linha pelo id+author/id', async () => {
  const pg = fakePg();
  const p = createPersistence({ client: pg });
  await p.mirrorEvent(env('message.edit', { messageId: 'm1', content: 'editado' }), dm);
  await p.mirrorEvent(env('message.delete', { messageId: 'm1' }), dm);
  const [edit, del] = pg.calls.filter(c => c.table === 'messages');
  assert.equal(edit.op, 'update');
  assert.equal(edit.payload.content, 'editado');
  assert.ok(edit.filters.some(f => f[1] === 'author' && f[2] === 'author'));
  assert.equal(del.op, 'update');
  assert.ok(del.payload.deleted_at);
});

test('persistence: genesis espelha conversa, genesis assinado, membros e admins como owner', async () => {
  const pg = fakePg();
  const p = createPersistence({ client: pg });
  const g = env('space.genesis', { meta: { name: 'DM' } }, { sig: 'sig1' });
  await p.mirrorEvent(g, dm);
  const conv = pg.calls.find(c => c.table === 'conversations' && c.op === 'upsert').payload;
  assert.equal(conv.id, 'sp1');
  assert.equal(conv.type, 'dm');
  assert.equal(conv.created_by, 'author');
  const genUpd = pg.calls.find(c => c.table === 'conversations' && c.op === 'update');
  assert.deepEqual(genUpd.payload.genesis, g); // envelope completo com assinatura
  assert.ok(genUpd.filters.some(f => f[0] === 'eq' && f[1] === 'id' && f[2] === 'sp1'));
  const members = pg.calls.filter(c => c.table === 'conversation_members');
  assert.equal(members.length, 3); // a + b + a(owner)
  assert.equal(members.at(-1).payload.role, 'owner');
});

test('persistence: member.add/remove/role espelham conversation_members', async () => {
  const pg = fakePg();
  const p = createPersistence({ client: pg });
  await p.mirrorEvent(env('member.add', { userId: 'u1' }), dm);
  await p.mirrorEvent(env('member.role', { userId: 'u1', role: 'admin' }), dm);
  await p.mirrorEvent(env('member.remove', { userId: 'u1' }), dm);
  const [add, role, del] = pg.calls.filter(c => c.table === 'conversation_members');
  assert.equal(add.op, 'upsert');
  assert.equal(role.payload.role, 'owner'); // admin → owner (constraint)
  assert.equal(del.op, 'delete');
});

test('persistence: todo evento aplicado grava envelope completo em space_events', async () => {
  const pg = fakePg();
  const p = createPersistence({ client: pg });
  const e = env('reaction', { messageId: 'm1', emoji: 'x' }, { sig: 'sig1' });
  await p.mirrorEvent(e, dm);
  const sev = pg.calls.find(c => c.table === 'space_events');
  assert.equal(sev.op, 'upsert');
  assert.equal(sev.payload.event_id, 'sp1:author:1');
  assert.equal(sev.payload.space_id, 'sp1');
  assert.equal(sev.payload.author, 'author');
  assert.equal(sev.payload.seq, 1);
  assert.equal(sev.payload.type, 'reaction');
  assert.equal(sev.payload.ts, 1700000000000);
  assert.equal(sev.payload._onConflict, 'event_id');
  assert.deepEqual(sev.payload.envelope, e); // envelope completo, assinatura incluida
});

test('persistence: mirrorContact outgoing cria relationship + convite pendente', async () => {
  const pg = fakePg();
  const p = createPersistence({ client: pg });
  await p.mirrorContact({ pubkey: 'peer1', state: 'outgoing', profile: { displayName: 'P' } }, 'me');
  const rel = pg.calls.find(c => c.table === 'relationships');
  assert.equal(rel.payload.owner, 'me');
  assert.equal(rel.payload.peer, 'peer1');
  assert.equal(rel.payload.state, 'outgoing');
  const inv = pg.calls.find(c => c.table === 'invites' && c.op === 'insert');
  assert.equal(inv.payload.from_pubkey, 'me');
  assert.equal(inv.payload.to_pubkey, 'peer1');
  assert.equal(inv.payload.status, 'pending');
});

test('persistence: mirrorContact friend resolve convite pendente existente', async () => {
  const pg = fakePg({ invites: [{ id: 'i1', from_pubkey: 'peer1', to_pubkey: 'me', status: 'pending' }] });
  const p = createPersistence({ client: pg });
  await p.mirrorContact({ pubkey: 'peer1', state: 'friend', profile: {} }, 'me');
  const upd = pg.calls.find(c => c.table === 'invites' && c.op === 'update');
  assert.equal(upd.payload.status, 'accepted');
  assert.ok(upd.filters.some(f => f[1] === 'id' && f[2] === 'i1'));
});

test('persistence: mirrorContact removed cancela convite pendente', async () => {
  const pg = fakePg({ invites: [{ id: 'i1', from_pubkey: 'me', to_pubkey: 'peer1', status: 'pending' }] });
  const p = createPersistence({ client: pg });
  await p.mirrorContact({ pubkey: 'peer1', state: 'removed', profile: {} }, 'me');
  const upd = pg.calls.find(c => c.table === 'invites' && c.op === 'update');
  assert.equal(upd.payload.status, 'cancelled');
});

test('persistence: mirrorEvent não propaga erro do client (fire-and-forget)', async () => {
  const pg = fakePg();
  const errClient = { from: () => ({ upsert: () => ({ then: (fn) => fn({ error: { code: 'XXX' } }) }) }) };
  const p = createPersistence({ client: errClient });
  await p.mirrorEvent(env('message.send', { message: { content: 'x' } }), dm); // não lança
});

const sev = (spaceId, author, seq) => ({ // linha de space_events: colunas + envelope
  space_id: spaceId, author, seq,
  envelope: { id: `${spaceId}:${author}:${seq}`, spaceId, author, seq },
});

test('persistence: spaceEventsSince por autor filtra seq e ordena', async () => {
  const pg = fakePg({
    space_events: [sev('sp1', 'a', 3), sev('sp1', 'a', 1), sev('sp1', 'a', 2), sev('sp1', 'b', 1), sev('sp2', 'a', 9)],
  });
  const p = createPersistence({ client: pg });
  const envs = await p.spaceEventsSince('sp1', { author: 'a', afterSeq: 1 });
  assert.deepEqual(envs.map(e => e.id), ['sp1:a:2', 'sp1:a:3']); // seq>1, ordenado
});

test('persistence: spaceEventsSince com have filtra por autor no cliente', async () => {
  const pg = fakePg({ space_events: [sev('sp1', 'a', 1), sev('sp1', 'a', 2), sev('sp1', 'b', 1)] });
  const p = createPersistence({ client: pg });
  const envs = await p.spaceEventsSince('sp1', { have: { a: 1 } });
  assert.deepEqual(envs.map(e => e.id), ['sp1:a:2', 'sp1:b:1']); // a:1 ja tenho; b e autor novo
});

test('persistence: listMemberships e getGenesis leem as tabelas certas', async () => {
  const genesis = { spaceId: 'sp1', type: 'space.genesis', sig: 's' };
  const pg = fakePg({
    conversation_members: [
      { conversation_id: 'sp1', pubkey: 'me' },
      { conversation_id: 'sp2', pubkey: 'outro' },
    ],
    conversations: [{ id: 'sp1', genesis }],
  });
  const p = createPersistence({ client: pg });
  assert.deepEqual(await p.listMemberships('me'), ['sp1']);
  assert.deepEqual(await p.getGenesis('sp1'), genesis);
  assert.equal(await p.getGenesis('spX'), null);
});

test('persistence: messagesHistory filtra por conversa, ordena e reverte', async () => {
  const pg = fakePg({
    messages: [
      { id: 'm1', conversation_id: 'sp1', created_at: '2024-01-01T00:00:00Z', deleted_at: null },
      { id: 'm2', conversation_id: 'sp1', created_at: '2024-01-02T00:00:00Z', deleted_at: null },
      { id: 'mx', conversation_id: 'outra', created_at: '2024-01-03T00:00:00Z', deleted_at: null },
    ],
  });
  const p = createPersistence({ client: pg });
  const rows = await p.messagesHistory('sp1');
  const q = pg.calls.find(c => c.table === 'messages' && c.op === 'select');
  assert.ok(q.filters.some(f => f[0] === 'eq' && f[1] === 'conversation_id' && f[2] === 'sp1'));
  assert.deepEqual(rows.map(r => r.id), ['m1', 'm2']);
});
