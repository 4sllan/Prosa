// p2p/contacts.js — contatos por chave pública, perfis e vínculos.
// Vínculo é local + enviado ao peer; bloqueio é só local (não se transmite).
import { getLocalStore } from './localstore.js';
import { p2pTransport } from './transport.js';

const st = () => getLocalStore();
const mutations = new Map();

function mutateContact(pubkey, operation) {
  // IPC devolve copias: leituras/gravacoes concorrentes podem restaurar estado antigo.
  const previous = mutations.get(pubkey) || Promise.resolve();
  const task = previous.catch(() => {}).then(operation);
  mutations.set(pubkey, task);
  const release = () => { if (mutations.get(pubkey) === task) mutations.delete(pubkey); };
  task.then(release, release);
  return task;
}

export async function listContacts() {
  return st().allContacts();
}

export async function requestContact(identity, { pubkey, profile }) {
  return mutateContact(pubkey, async () => {
    const existing = await st().getContact(pubkey);
    if (existing && existing.state !== 'removed') return existing;
    const c = { pubkey, state: 'outgoing', profile: profile || {}, updatedAt: Date.now() };
    await st().putContact(c);
    const sent = p2pTransport.sendToPeer(pubkey, 'contact_req', { profile: identity.publicUser() });
    if (sent === false && p2pTransport.isOnline(pubkey)) {
      await st().putContact({ ...c, state: 'removed', updatedAt: Date.now() });
      throw new Error('Falha ao enviar solicitacao ao peer');
    }
    return c;
  });
}

export async function handleContactReq(fromPeerId, body, identity) {
  return mutateContact(fromPeerId, async () => {
    const existing = await st().getContact(fromPeerId);
    if (existing?.state === 'blocked') return; // ignora silenciosamente
    // Pedido cruzado: os dois lados ja pediram — intencao mutua provada.
    // Confirma a amizade e avisa o outro lado com contact_accept.
    if (existing?.state === 'outgoing') {
      const c = {
        ...existing, state: 'friend', updatedAt: Date.now(),
        profile: { ...existing.profile, ...body?.profile },
      };
      await st().putContact(c);
      p2pTransport.sendToPeer(fromPeerId, 'contact_accept', { profile: identity.publicUser() });
      return c;
    }
    // Pedidos repetidos nao alteram um vinculo existente.
    if (existing && existing.state !== 'removed') return existing;
    const c = {
      pubkey: fromPeerId, state: 'incoming',
      profile: body.profile || { displayName: fromPeerId.slice(0, 12) },
      updatedAt: Date.now(),
    };
    await st().putContact(c);
    return c;
  });
}

export async function acceptContact(identity, pubkey) {
  return mutateContact(pubkey, async () => {
    const c = await st().getContact(pubkey);
    if (!c) throw new Error('Contato desconhecido');
    if (c.state !== 'incoming') throw new Error('Solicitacao recebida nao encontrada');
    c.state = 'friend'; c.updatedAt = Date.now();
    await st().putContact(c);
    p2pTransport.sendToPeer(pubkey, 'contact_accept', { profile: identity.publicUser() });
    return c;
  });
}

export async function handleContactAccept(fromPeerId, body) {
  return mutateContact(fromPeerId, async () => {
    const c = await st().getContact(fromPeerId);
    if (c?.state !== 'outgoing') return;
    await st().putContact({
      ...c, state: 'friend', updatedAt: Date.now(),
      profile: { ...c.profile, ...body?.profile },
    });
  });
}

export async function removeContact(pubkey) {
  return mutateContact(pubkey, async () => {
    const c = await st().getContact(pubkey);
    if (c) { c.state = 'removed'; c.updatedAt = Date.now(); await st().putContact(c); }
    p2pTransport.sendToPeer(pubkey, 'contact_remove', {});
  });
}

export async function handleContactRemove(fromPeerId) {
  return mutateContact(fromPeerId, async () => {
    const c = await st().getContact(fromPeerId);
    if (c?.state === 'blocked') return;
    if (c) { c.state = 'removed'; c.updatedAt = Date.now(); await st().putContact(c); }
  });
}

export async function blockContact(pubkey) {
  return mutateContact(pubkey, async () => {
    const c = { ...(await st().getContact(pubkey) || { pubkey, profile: {} }), state: 'blocked', updatedAt: Date.now() };
    await st().putContact(c);
  });
}

export async function unblockContact(pubkey) {
  return mutateContact(pubkey, async () => {
    const c = await st().getContact(pubkey);
    // bloqueio e local — o outro lado nunca deixou de ver 'friend';
    // desbloquear restaura a amizade (RF-10)
    if (c?.state === 'blocked') { c.state = 'friend'; c.updatedAt = Date.now(); await st().putContact(c); }
  });
}

export async function updateProfile(pubkey, profile) {
  return mutateContact(pubkey, async () => {
    const c = await st().getContact(pubkey);
    if (c) { c.profile = { ...c.profile, ...profile }; c.updatedAt = Date.now(); await st().putContact(c); }
  });
}

// broadcast do meu perfil para todos os contatos/amigos
export async function broadcastProfile(identity) {
  const me = identity.publicUser();
  for (const peerId of p2pTransport.peerIds()) {
    p2pTransport.sendToPeer(peerId, 'profile', { profile: me });
  }
}
export async function handleProfile(fromPeerId, body) {
  if (body?.profile) await updateProfile(fromPeerId, body.profile);
}
