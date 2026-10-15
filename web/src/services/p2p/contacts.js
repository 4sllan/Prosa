// p2p/contacts.js — contatos por chave pública, perfis e vínculos.
// Vínculo é local + enviado ao peer; bloqueio é só local (não se transmite).
import { getLocalStore } from './localstore.js';
import { p2pTransport } from './transport.js';
import { getP2PIdentity } from './identity.js';

const st = () => getLocalStore();

export async function listContacts() {
  return st().allContacts();
}

export async function requestContact(identity, { pubkey, profile }) {
  const existing = await st().getContact(pubkey);
  if (existing && existing.state !== 'removed') return existing;
  const c = { pubkey, state: 'outgoing', profile: profile || {}, updatedAt: Date.now() };
  await st().putContact(c);
  p2pTransport.sendToPeer(pubkey, 'contact_req', { profile: identity.publicUser() });
  return c;
}

export async function handleContactReq(fromPeerId, body, identity) {
  const existing = await st().getContact(fromPeerId);
  if (existing?.state === 'blocked') return; // ignora silenciosamente
  const c = {
    pubkey: fromPeerId, state: 'incoming',
    profile: body.profile || { displayName: fromPeerId.slice(0, 12) },
    updatedAt: Date.now(),
  };
  await st().putContact(c);
  return c;
}

export async function acceptContact(identity, pubkey) {
  const c = await st().getContact(pubkey);
  if (!c) throw new Error('Contato desconhecido');
  c.state = 'friend'; c.updatedAt = Date.now();
  await st().putContact(c);
  p2pTransport.sendToPeer(pubkey, 'contact_accept', { profile: identity.publicUser() });
  return c;
}

export async function handleContactAccept(fromPeerId, body) {
  const c = await st().getContact(fromPeerId);
  if (c) { c.state = 'friend'; c.updatedAt = Date.now(); await st().putContact(c); }
  if (body?.profile) await updateProfile(fromPeerId, body.profile);
}

export async function removeContact(pubkey) {
  const c = await st().getContact(pubkey);
  if (c) { c.state = 'removed'; c.updatedAt = Date.now(); await st().putContact(c); }
  p2pTransport.sendToPeer(pubkey, 'contact_remove', {});
}

export async function handleContactRemove(fromPeerId) {
  const c = await st().getContact(fromPeerId);
  if (c) { c.state = 'removed'; c.updatedAt = Date.now(); await st().putContact(c); }
}

export async function blockContact(pubkey) {
  const c = { ...(await st().getContact(pubkey) || { pubkey, profile: {} }), state: 'blocked', updatedAt: Date.now() };
  await st().putContact(c);
}

export async function unblockContact(pubkey) {
  const c = await st().getContact(pubkey);
  if (c) { c.state = 'removed'; c.updatedAt = Date.now(); await st().putContact(c); }
}

export async function updateProfile(pubkey, profile) {
  const c = await st().getContact(pubkey);
  if (c) { c.profile = { ...c.profile, ...profile }; c.updatedAt = Date.now(); await st().putContact(c); }
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
