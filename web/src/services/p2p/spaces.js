// p2p/spaces.js — criação e gestão de espaços (DM 1:1, grupo, comunidade).
// DM: espaço com exatamente 2 membros. Grupo/comunidade: genesis assinado
// pelo criador; membros entram por convite assinado de admin (task 14).
import { makeSpace, getSpace, listSpaces, emitEvent, spaceProjection, notifyLocalEvent } from './eventlog.js';
import { getLocalStore } from './localstore.js';
import { p2pTransport } from './transport.js';
import { makeSignedEnvelope } from './envelope.js';

export function dmSpaceId(pubA, pubB) { return 'dm:' + [pubA, pubB].sort().join(':').slice(0, 48); }
export function communitySpaceId(pubCreator, name) {
  return 'cm:' + pubCreator.slice(0, 16) + ':' + encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'));
}

// cria espaço local (genesis) e registra canais padrão
export async function createSpace(identity, { type, name, members = [], channels = ['geral'] }) {
  const store = getLocalStore();
  const spaceId = type === 'dm'
    ? dmSpaceId(identity.pubKeyHex, members[0])
    : communitySpaceId(identity.pubKeyHex, name);

  const allMembers = [...new Set([identity.pubKeyHex, ...members])];
  const sp = makeSpace(spaceId, type, { name, createdBy: identity.pubKeyHex }, allMembers);
  sp.admins = new Set([identity.pubKeyHex]);

  // genesis (seq 1 do autor)
  const genesis = await makeSignedEnvelope(identity, {
    spaceId, type: 'space.genesis', seq: 1,
    body: { meta: { name, type }, admins: [...sp.admins], members: allMembers },
  });
  await store.putEvent(toRow(genesis));
  spaceProjection(spaceId).byAuthor.set(identity.pubKeyHex, 1);

  // canais padrão
  for (const chName of channels) {
    const ch = { id: `${spaceId}:${chName}`, spaceId, name: chName, type: 'text' };
    sp.channels.set(ch.id, ch);
  }

  // avisa membros (evento genesis via sync quando conectarem + push agora)
  for (const m of allMembers) {
    if (m !== identity.pubKeyHex) {
      p2pTransport.joinSpace(spaceId, m);
      p2pTransport.sendToPeer(m, 'space_invite', { spaceId, genesis }, spaceId);
    }
  }
  await store.kvSet(`space:${spaceId}`, { id: spaceId, type, name });
  await saveSpaceIndex(sp);
  notifyLocalEvent(genesis); // genesis nao passa por emitEvent — espelha mailbox
  return sp;
}

// convida um peer para um espaço existente: member.add assinado aos membros
// atuais + genesis re-emitido pelo convidante via space_invite (mesmo formato
// do convite por código). O genesis re-emitido não entra no log local —
// é apenas material de entrega para o convidado.
export async function inviteToSpace(identity, spaceId, userId) {
  const store = getLocalStore();
  const sp = getSpace(spaceId);
  if (!sp) throw new Error(`Espaço desconhecido: ${spaceId}`);
  if (sp.type === 'dm') throw new Error('DMs não aceitam membros adicionais');
  if (sp.members.has(userId)) return { ok: true, already: true };
  if (!sp.admins?.has(identity.pubKeyHex)) {
    throw new Error('Apenas administradores podem inserir membros neste espaço');
  }
  const { env } = await emitEvent(identity, spaceId, 'member.add', { userId }, store);
  p2pTransport.broadcast(spaceId, env);
  p2pTransport.joinSpace(spaceId, userId);
  const genesis = await makeSignedEnvelope(identity, {
    spaceId, type: 'space.genesis', seq: 1,
    body: { meta: sp.meta, admins: [...sp.admins], members: [...sp.members] },
  });
  const delivered = p2pTransport.sendToPeer(userId, 'space_invite', { spaceId, genesis }, spaceId);
  return { ok: true, already: false, genesis, delivered };
}

// aceita convite de espaço recebido por outro peer
export async function acceptSpaceInvite(genesis, store) {
  const id = genesis.spaceId;
  if (getSpace(id)) return getSpace(id);
  const sp = makeSpace(id, genesis.body.meta.type, genesis.body.meta, genesis.body.members);
  sp.admins = new Set(genesis.body.admins);
  const proj = spaceProjection(id);
  proj.byAuthor.set(genesis.author, genesis.seq);
  await store.putEvent(toRow(genesis));
  await store.kvSet(`space:${id}`, { id, type: sp.type, name: sp.meta.name });
  for (const m of sp.members) p2pTransport.joinSpace(id, m);
  await saveSpaceIndex(sp);
  notifyLocalEvent(genesis); // espelha mailbox para o proprio convidado
  return sp;
}

async function saveSpaceIndex(sp) {
  const list = (await store().kvGet('spaces')) || [];
  const i = list.findIndex(x => x.id === sp.id);
  const row = { id: sp.id, type: sp.type, name: sp.meta?.name, members: [...sp.members] };
  if (i >= 0) list[i] = row; else list.push(row);
  await store().kvSet('spaces', list);
}

export async function listSpaceRows() {
  const out = [];
  for (const sp of listSpaces()) {
    out.push(await store().kvGet(`space:${sp.id}`) || { id: sp.id, type: sp.type, name: sp.meta?.name });
  }
  return out;
}
const store = () => getLocalStore();

function toRow(env) {
  return {
    id: env.id, spaceId: env.spaceId, author: env.author, seq: env.seq,
    type: env.type, body: env.body, ts: env.ts, sig: env.sig, receivedAt: Date.now(),
  };
}

// envia mensagem num espaço (emite + broadcast)
export async function sendMessage(identity, spaceId, channelId, body) {
  const st = getLocalStore();
  const { env } = await emitEvent(identity, spaceId, 'message.send', {
    channelId,
    message: {
      id: `${spaceId}:${identity.pubKeyHex}:${Date.now()}`,
      content: body.content, replyTo: body.replyTo || null,
      attachments: body.attachments || [],
    },
  }, st);
  p2pTransport.broadcast(spaceId, { ...env, body: { ...env.body, expectAck: false } });
  return env;
}

// ações de admin assinadas
export async function adminEmit(identity, spaceId, type, body) {
  const st = getLocalStore();
  const { env } = await emitEvent(identity, spaceId, type, body, st);
  p2pTransport.broadcast(spaceId, env);
  return env;
}
