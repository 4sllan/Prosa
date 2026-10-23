// p2p/envelope.js — formato de evento assinado e verificação.
// Envelope: { v, id, spaceId, author, seq, type, ts, body, sig }
// id = `${spaceId}:${author}:${seq}` — dedupe determinístico por espaço.
// sig = Ed25519 do JSON canônico do envelope sem o campo sig.

export function canonical(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonical).join(',') + ']';
  return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}';
}

const enc = new TextEncoder();
export function canonicalBytes(obj) { return enc.encode(canonical(obj)); }

export function eventId(spaceId, author, seq) { return `${spaceId}:${author}:${seq}`; }

export async function makeSignedEnvelope(identity, { spaceId, type, body, seq }) {
  const env = {
    v: 1,
    spaceId,
    author: identity.pubKeyHex,
    seq,
    type,
    ts: Date.now(),
    body: body || {},
  };
  env.id = eventId(spaceId, env.author, seq);
  env.sig = await identity.sign(canonicalBytes(signedFields(env)));
  return env;
}

function signedFields(env) {
  const { sig, ...rest } = env;
  return rest;
}

export async function verifyEnvelope(env) {
  if (!env || env.v !== 1 || !env.sig || !env.author) return false;
  if (env.id !== eventId(env.spaceId, env.author, env.seq)) return false;
  try {
    return await verifyWithPub(env.author, canonicalBytes(signedFields(env)), env.sig);
  } catch { return false; }
}

// verificação com pubkey arbitrária (usado em testes e peers)
import { b64url, unb64url } from './identity.js';
export async function verifyWithPub(pubKeyHex, bytes, sigB64url) {
  const raw = hexToBytes(pubKeyHex);
  // SPKI DER (44B) → extrai os 32B da chave raw para tentativa WebCrypto
  const rawKey = raw.length === 44 && raw[0] === 0x30 ? raw.slice(12) : raw;
  try {
    const key = await crypto.subtle.importKey('raw', rawKey, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, unb64url(sigB64url), bytes);
  } catch {
    // WebCrypto do Electron não suporta Ed25519 — delega ao processo main (Node nativo)
    const bridge = typeof window !== 'undefined' && window.prosaDesktop?.p2p?.verify;
    if (bridge) return bridge(pubKeyHex, b64url(bytes), sigB64url);
    return false;
  }
}

function hexToBytes(hex) {
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return b;
}

// Mensagens de controle (não persistidas): presence, typing, signal, file_meta, ack, sync_*
export function makeControl(identity, { type, spaceId = '*', body = {}, id, to }) {
  return {
    v: 1,
    id: id || `ctl:${type}:${identity.pubKeyHex}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    spaceId,
    from: identity.pubKeyHex,
    to: to || undefined,
    type,
    ts: Date.now(),
    body,
  };
}
