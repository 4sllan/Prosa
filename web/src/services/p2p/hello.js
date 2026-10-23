// p2p/hello.js — handshake 'hello' assinado do pareamento.
// v2 carrega sig = sign('hello|pubkey|ts') provando posse da chave anunciada;
// v1 legado (sem sig) é aceito com aviso — a UI confere fingerprint.

const enc = new TextEncoder();

// janela de tolerância do ts do hello (relógios divergentes)
export const HELLO_SKEW_MS = 5 * 60 * 1000;

export async function makeHello(identity) {
  const ts = Date.now();
  const sig = await identity.sign(enc.encode(`hello|${identity.pubKeyHex}|${ts}`));
  return { v: 2, id: 'hello:' + ts, type: 'hello', from: identity.pubKeyHex, ts, sig, body: {} };
}

// retorna { ok, legacy } — ok=false => não registrar o peer
export async function verifyHello(identity, m, { skewMs = HELLO_SKEW_MS } = {}) {
  if (m?.type !== 'hello' || !m.from) return { ok: false, legacy: false };
  if (!m.sig) return { ok: true, legacy: true };
  const fresh = typeof m.ts === 'number' && Math.abs(Date.now() - m.ts) <= skewMs;
  const ok = fresh && await identity.verify(m.from, enc.encode(`hello|${m.from}|${m.ts}`), m.sig);
  return { ok: !!ok, legacy: false };
}
