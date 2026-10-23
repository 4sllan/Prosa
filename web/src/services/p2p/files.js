// p2p/files.js — transferência de arquivos por chunks via canal de dados.
// Peers se anunciam metadados (hash sha256, nome, mime, tamanho); chunks
// binários seguem com envelope "file_chunk". Recebido é validado por hash.
import { getLocalStore } from './localstore.js';
import { p2pTransport } from './transport.js';

const CHUNK = 64 * 1024;
const incoming = new Map(); // transferId -> {meta, chunks:[], received, resolve}

async function sha256hex(buf) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// envia um File/Blob para um peer; retorna {hash, transferId}
export async function sendFile(peerId, spaceId, file) {
  const buf = await file.arrayBuffer();
  const hash = await sha256hex(buf);
  const transferId = `f:${hash.slice(0, 16)}:${Date.now()}`;
  const meta = {
    transferId, hash, name: file.name, mime: file.type || 'application/octet-stream',
    size: buf.byteLength, chunks: Math.ceil(buf.byteLength / CHUNK),
  };
  p2pTransport.sendToPeer(peerId, 'file_meta', meta, spaceId);
  for (let i = 0; i < meta.chunks; i++) {
    p2pTransport.sendToPeer(peerId, 'file_chunk', {
      transferId, seq: i,
      data: b64(buf.slice(i * CHUNK, (i + 1) * CHUNK)),
    }, spaceId);
  }
  const st = getLocalStore();
  await st.putFile({ hash, path: `local://${file.name}`, size: buf.byteLength, mime: meta.mime, spaceId });
  return { hash, transferId };
}

// pede um arquivo a um peer que o anunciou
export function requestFile(peerId, spaceId, hash) {
  p2pTransport.sendToPeer(peerId, 'file_req', { hash }, spaceId);
}

export async function handleFileMeta(fromPeerId, body) {
  incoming.set(body.transferId, { meta: body, from: fromPeerId, chunks: [], received: 0 });
}

export async function handleFileChunk(fromPeerId, body) {
  const t = incoming.get(body.transferId);
  if (!t) return;
  t.chunks[body.seq] = unb64(body.data);
  t.received++;
  if (t.received >= t.meta.chunks) {
    const buf = concat(t.chunks);
    const h = await sha256hex(buf);
    const ok = h === t.meta.hash;
    if (ok) {
      const st = getLocalStore();
      await st.putFile({
        hash: h, path: `received://${t.meta.name}`,
        size: buf.byteLength, mime: t.meta.mime, spaceId: t.meta.spaceId || '*',
      });
    }
    t.done?.({ ok, hash: h, buf, meta: t.meta });
    incoming.delete(body.transferId);
  }
}

export async function handleFileReq(fromPeerId, body, identity) {
  const st = getLocalStore();
  const rec = await st.getFile(body.hash);
  if (!rec) return;
  // reenvia arquivo local: chamador deve prover o Blob real (limitação do store)
  // em produção o caminho local resolve em fs no main — aqui apenas sinalizamos
  return rec;
}

function b64(buf) {
  let s = '';
  const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
  return btoa(s);
}
function unb64(s) {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function concat(parts) {
  const total = parts.reduce((n, p) => n + (p?.length || 0), 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out.buffer;
}
