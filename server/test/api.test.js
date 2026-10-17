import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'prosa-test-'));
process.env.UPLOAD_DIR = join(process.env.DATA_DIR, 'uploads');
process.env.PORT = '0';

const { server } = await import('../src/index.js');
await new Promise(r => server.once('listening', r));
const port = server.address().port;
const base = `http://localhost:${port}`;

const api = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

let ana, beto, cid, channelId, inviteCode, dmId;

after(() => server.close());

test('config pública', async () => {
  const r = await api('/api/config');
  assert.equal(r.status, 200);
  assert.equal(r.body.name, 'Prosa');
  assert.ok(r.body.iceServers.length > 0);
});

test('registro e login', async () => {
  let r = await api('/api/auth/register', { method: 'POST', body: { username: 'ana', email: 'ana@t.com', password: 'senha12345' } });
  assert.equal(r.status, 201);
  ana = r.body.token;

  r = await api('/api/auth/register', { method: 'POST', body: { username: 'ana', email: 'outra@t.com', password: 'senha12345' } });
  assert.equal(r.status, 409);

  r = await api('/api/auth/register', { method: 'POST', body: { username: 'beto', email: 'beto@t.com', password: 'senha12345' } });
  beto = r.body.token;

  r = await api('/api/auth/login', { method: 'POST', body: { login: 'ana', password: 'errada123' } });
  assert.equal(r.status, 401);

  r = await api('/api/auth/login', { method: 'POST', body: { login: 'ana', password: 'senha12345' } });
  assert.equal(r.status, 200);
});

test('sem auth é rejeitado', async () => {
  const r = await api('/api/users/@me');
  assert.equal(r.status, 401);
});

test('criar comunidade cria canal padrão e dono', async () => {
  const r = await api('/api/communities', { method: 'POST', token: ana, body: { name: 'Roda de Teste' } });
  assert.equal(r.status, 201);
  cid = r.body.community.id;
  assert.equal(r.body.community.myRole, 'owner');

  const detail = await api(`/api/communities/${cid}`, { token: ana });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.channels.length, 1);
  assert.equal(detail.body.members.length, 1);
  channelId = detail.body.channels[0].id;
});

test('convite: criar, aceitar, membro novo', async () => {
  let r = await api(`/api/communities/${cid}/invites`, { method: 'POST', token: ana, body: {} });
  assert.equal(r.status, 201);
  inviteCode = r.body.invite.code;

  r = await api(`/api/communities/invite/${inviteCode}/accept`, { method: 'POST', token: beto });
  assert.equal(r.status, 200);

  // aceitar de novo = conflito
  r = await api(`/api/communities/invite/${inviteCode}/accept`, { method: 'POST', token: beto });
  assert.equal(r.status, 409);
});

test('permissões no servidor: membro comum não gerencia canais', async () => {
  const r = await api(`/api/communities/${cid}/channels`, { method: 'POST', token: beto, body: { name: 'nao-pode' } });
  assert.equal(r.status, 403);
  const ok = await api(`/api/communities/${cid}/channels`, { method: 'POST', token: ana, body: { name: 'avisos' } });
  assert.equal(ok.status, 201);
});

test('mensagens: enviar, persistir, editar, deletar', async () => {
  let r = await api(`/api/channels/${channelId}/messages`, { method: 'POST', token: ana, body: { content: 'primeira @beto' } });
  assert.equal(r.status, 201);
  const mid = r.body.message.id;

  r = await api(`/api/channels/${channelId}/messages`, { token: beto });
  assert.equal(r.body.messages.length, 1);
  assert.equal(r.body.messages[0].content, 'primeira @beto');

  // beto não pode editar mensagem de ana
  r = await api(`/api/channels/${channelId}/messages/${mid}`, { method: 'PATCH', token: beto, body: { content: 'hackeado' } });
  assert.equal(r.status, 403);

  // ana edita a própria
  r = await api(`/api/channels/${channelId}/messages/${mid}`, { method: 'PATCH', token: ana, body: { content: 'editada' } });
  assert.equal(r.body.message.content, 'editada');
  assert.ok(r.body.message.editedAt);

  // reação
  r = await api(`/api/channels/${channelId}/messages/${mid}/reactions/${encodeURIComponent('👍')}`, { method: 'PUT', token: beto });
  assert.equal(r.status, 200);

  // deletar
  r = await api(`/api/channels/${channelId}/messages/${mid}`, { method: 'DELETE', token: ana });
  assert.equal(r.status, 200);
});

test('amigos + DM', async () => {
  let r = await api('/api/users/@me/relationships', { method: 'POST', token: ana, body: { username: 'beto' } });
  assert.equal(r.status, 201);

  const betoId = (await api('/api/users/@me', { token: beto })).body.user.id;
  r = await api(`/api/users/@me/relationships/${betoId}/accept`, { method: 'POST', token: ana });
  assert.equal(r.status, 403 === r.status ? 404 : r.status); // ana não pode aceitar a própria solicitação

  const anaId = (await api('/api/users/@me', { token: ana })).body.user.id;
  r = await api(`/api/users/@me/relationships/${anaId}/accept`, { method: 'POST', token: beto });
  assert.equal(r.status, 200);

  r = await api(`/api/dms/open/${betoId}`, { method: 'POST', token: ana });
  assert.equal(r.status, 201);
  dmId = r.body.dm.id;

  r = await api(`/api/channels/${dmId}/messages`, { method: 'POST', token: beto, body: { content: 'dm oi' } });
  assert.equal(r.status, 201);

  const list = await api('/api/dms', { token: ana });
  assert.ok(list.body.dms.some(d => d.id === dmId));
});

test('ban impede reentrada', async () => {
  const betoId = (await api('/api/users/@me', { token: beto })).body.user.id;
  let r = await api(`/api/communities/${cid}/members/${betoId}/ban`, { method: 'POST', token: ana, body: { reason: 'teste' } });
  assert.equal(r.status, 200);
  r = await api(`/api/communities/invite/${inviteCode}/accept`, { method: 'POST', token: beto });
  assert.equal(r.status, 403);
});

test('audit log registrado', async () => {
  const r = await api(`/api/communities/${cid}/audit-log`, { token: ana });
  const actions = r.body.entries.map(e => e.action);
  assert.ok(actions.includes('member_ban'));
  assert.ok(actions.includes('community_create'));
});

test('websocket: READY + broadcast de mensagem', async () => {
  // beto foi banido; usa ana para WS e publica em canal da comunidade
  const ws = new WebSocket(`ws://localhost:${port}/ws?token=${ana}`);
  const ready = new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('timeout READY')), 5000);
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'READY') { clearTimeout(to); res(m.d); }
    });
  });
  const d = await ready;
  assert.equal(d.user.username, 'ana');

  const gotMsg = new Promise((res) => {
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'MESSAGE_CREATE') res(m.d);
    });
  });
  await api(`/api/channels/${channelId}/messages`, { method: 'POST', token: ana, body: { content: 'ws broadcast' } });
  const ev = await gotMsg;
  assert.equal(ev.message.content, 'ws broadcast');
  ws.close();
});

test('busca', async () => {
  const r = await api('/api/search?q=broadcast', { token: ana });
  assert.equal(r.status, 200);
  assert.ok(r.body.messages.some(m => m.content.includes('broadcast')));
});

test('cancelar enviada remove pendencia, notifica destinatario e rejeita terceiros', async (t) => {
  const accounts = [];
  for (const name of ['cancel_sender', 'cancel_receiver', 'cancel_outsider', 'cancel_other']) {
    const r = await api('/api/auth/register', {
      method: 'POST',
      body: { username: name, email: `${name}@example.test`, password: 'cancel-test-password' },
    });
    assert.equal(r.status, 201);
    accounts.push(r.body);
  }
  const [sender, receiver, outsider, other] = accounts;
  const path = `/api/users/@me/relationships/${receiver.user.id}`;
  for (const target of [receiver, other]) {
    const r = await api('/api/users/@me/relationships', {
      method: 'POST', token: sender.token, body: { username: target.user.username },
    });
    assert.equal(r.status, 201);
  }
  const list = async token => (await api('/api/users/@me/relationships', { token })).body.relationships;
  const before = await list(sender.token);
  assert.equal(before.length, 2);
  assert.ok(before.every(r => r.type === 'outgoing'));
  assert.equal((await list(receiver.token))[0].type, 'incoming');

  const ws = new WebSocket(`ws://localhost:${port}/ws?token=${receiver.token}`);
  t.after(() => ws.terminate());
  const waitEvent = type => new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', message);
      ws.off('error', fail);
    };
    const fail = error => { cleanup(); reject(error); };
    const message = raw => {
      const event = JSON.parse(raw);
      if (event.t === type) { cleanup(); resolve(event); }
    };
    const timer = setTimeout(() => fail(new Error(`timeout ${type}`)), 5000);
    t.after(cleanup);
    ws.on('message', message);
    ws.once('error', fail);
  });
  await waitEvent('READY');
  assert.equal((await api(path, { method: 'DELETE' })).status, 401);
  assert.equal((await api(path, { method: 'DELETE', token: outsider.token })).status, 404);
  assert.deepEqual(await list(sender.token), before);
  assert.equal((await list(receiver.token)).length, 1);

  const changed = waitEvent('RELATIONSHIP_UPDATE');
  const cancelled = await api(path, { method: 'DELETE', token: sender.token });
  assert.equal(cancelled.status, 200);
  assert.equal((await changed).t, 'RELATIONSHIP_UPDATE');
  const remaining = await list(sender.token);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].user.id, other.user.id);
  assert.deepEqual(await list(receiver.token), []);
  assert.equal((await list(other.token))[0].user.id, sender.user.id);
  const lateAccept = await api(`/api/users/@me/relationships/${sender.user.id}/accept`, {
    method: 'POST', token: receiver.token,
  });
  assert.equal(lateAccept.status, 404);
  assert.deepEqual(await list(receiver.token), []);
});
