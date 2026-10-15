// p2p/identity.js — identidade Ed25519 local do usuário no modo P2P.
// A chave privada fica no Electron main quando disponível (via preload IPC);
// no browser/dev sem desktop, cai em WebCrypto em memória (documentado como
// caminho de desenvolvimento — não é armazenamento seguro de produção).

let identity = null;

const PROFILE_KEY = 'prosa_p2p_profile';

function hexToBytes(hex) {
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return b;
}
function bytesToHex(b) { return [...b].map(x => x.toString(16).padStart(2, '0')).join(''); }
export function b64url(bytes) {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

// Fingerprint legível: "p2p:" + 16 hex chars do sha256 da pubkey.
export async function fingerprintOf(pubKeyHex) {
  const h = await crypto.subtle.digest('SHA-256', hexToBytes(pubKeyHex));
  return 'p2p:' + bytesToHex(new Uint8Array(h)).slice(0, 16);
}

async function genBrowser() {
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pub = await crypto.subtle.exportKey('raw', kp.publicKey);
  const priv = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
  return {
    pubKeyHex: bytesToHex(new Uint8Array(pub)),
    privKeyHex: bytesToHex(new Uint8Array(priv)),
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
  };
}

const PRIV_STORE = 'prosa_p2p_key';

async function loadOrCreateBrowserIdentity() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(PRIV_STORE) || 'null'); } catch {}
  if (saved?.pubKeyHex && saved?.privKeyHex) {
    const publicKey = await crypto.subtle.importKey('raw', hexToBytes(saved.pubKeyHex), { name: 'Ed25519' }, true, ['verify']);
    const privateKey = await crypto.subtle.importKey('pkcs8', hexToBytes(saved.privKeyHex), { name: 'Ed25519' }, false, ['sign']);
    return { pubKeyHex: saved.pubKeyHex, publicKey, privateKey, devOnly: true };
  }
  const k = await genBrowser();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(PRIV_STORE, JSON.stringify({ pubKeyHex: k.pubKeyHex, privKeyHex: k.privKeyHex }));
  }
  return { pubKeyHex: k.pubKeyHex, publicKey: k.publicKey, privateKey: k.privateKey, devOnly: true };
}

async function desktopIdentity() {
  if (typeof window === 'undefined') return null;
  const bridge = window.prosaDesktop?.p2p;
  if (!bridge) return null;
  try {
    const pubKeyHex = await bridge.pubkey();
    return { pubKeyHex, publicKey: null, privateKey: null, devOnly: false, desktop: true };
  } catch { return null; }
}

export async function initP2PIdentity() {
  if (identity) return identity;
  const desktop = await desktopIdentity();
  identity = desktop || await loadOrCreateBrowserIdentity();
  identity.profile = readProfile();
  identity.fingerprint = await fingerprintOf(identity.pubKeyHex);
  return attachIdentity(identity);
}

export function getP2PIdentity() {
  if (!identity) throw new Error('P2P identidade não inicializada — chame initP2PIdentity() no boot');
  return identity;
}

export function readProfile() {
  try { return JSON.parse(typeof localStorage !== 'undefined' ? localStorage.getItem(PROFILE_KEY) : null) || {}; } catch { return {}; }
}

function publicUser() {
  const p = identity.profile;
  return {
    id: identity.pubKeyHex,
    username: identity.fingerprint,
    displayName: p.displayName || identity.fingerprint.slice(0, 12),
    avatarUrl: p.avatarUrl || null,
    bio: p.bio || '',
    statusText: p.statusText || '',
  };
}

async function sign(bytes) {
  if (identity.desktop) return window.prosaDesktop.p2p.sign(b64url(bytes));
  const sig = await crypto.subtle.sign('Ed25519', identity.privateKey, bytes);
  return b64url(new Uint8Array(sig));
}

async function verify(pubKeyHex, bytes, sigB64) {
  const key = await crypto.subtle.importKey('raw', hexToBytes(pubKeyHex), { name: 'Ed25519' }, false, ['verify']);
  return crypto.subtle.verify('Ed25519', key, unb64url(sigB64), bytes);
}

async function updateProfile(body) {
  identity.profile = { ...identity.profile, ...body };
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(identity.profile));
  }
  return { user: publicUser() };
}

export function attachIdentity(id) {
  id.publicUser = publicUser;
  id.sign = sign;
  id.verify = verify;
  id.updateProfile = updateProfile;
  return id;
}

export async function readyP2PIdentity() { return attachIdentity(await initP2PIdentity()); }
