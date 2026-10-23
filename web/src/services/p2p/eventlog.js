// p2p/eventlog.js — log de eventos por espaço: validação, seq, projeções.
// Regras de convergência (LWW) vivem em converge.js e são aplicadas aqui
// ao materializar o estado derivado (mensagens, membros, canais...).
import { verifyEnvelope, makeSignedEnvelope } from './envelope.js';
import { applyEventToProjection } from './converge.js';

// espaços conhecidos: spaceId -> { type: 'dm'|'community', meta, members:Set, channels }
const spaces = new Map();
// projeções voláteis por espaço
const projections = new Map(); // spaceId -> projection state

export function makeSpace(spaceId, type, meta = {}, members = []) {
  const sp = { id: spaceId, type, meta, members: new Set(members), channels: new Map() };
  spaces.set(spaceId, sp);
  projections.set(spaceId, { messages: new Map(), state: {}, byAuthor: new Map(), lastTs: new Map() });
  return sp;
}
export function getSpace(spaceId) { return spaces.get(spaceId); }
export function listSpaces() { return [...spaces.values()]; }
export function dropSpace(spaceId) { spaces.delete(spaceId); projections.delete(spaceId); }
export function spaceProjection(spaceId) { return projections.get(spaceId); }

// valida um envelope recebido/criado contra regras de integridade
export async function validateEnvelope(env, { checkSig = true } = {}) {
  if (!env?.id || !env.author || !Number.isInteger(env.seq) || env.seq < 1) {
    return { ok: false, reason: 'envelope-malformado' };
  }
  if (!spaces.has(env.spaceId)) return { ok: false, reason: 'espaco-desconhecido' };
  if (checkSig && !(await verifyEnvelope(env))) return { ok: false, reason: 'assinatura-invalida' };
  return { ok: true };
}

// aplica no log + projeção; store = localstore backend (opcional para testes em memória)
export async function applyEvent(env, store) {
  const sp = spaces.get(env.spaceId);
  const proj = projections.get(env.spaceId);
  if (!sp || !proj) return { applied: false, reason: 'espaco-desconhecido' };

  const curMax = proj.byAuthor.get(env.author) || 0;
  if (env.seq <= curMax) return { applied: false, reason: 'seq-desatualizada' }; // dedupe por autor/seq
  proj.byAuthor.set(env.author, env.seq);

  applyEventToProjection(proj, sp, env);
  if (store) await store.putEvent({
    id: env.id, spaceId: env.spaceId, author: env.author, seq: env.seq,
    type: env.type, body: env.body, ts: env.ts, sig: env.sig, receivedAt: Date.now(),
  });
  return { applied: true };
}

// hook chamado para cada evento local aplicado — registrado pelo nó para
// notificar a UI (eventos remotos já chegam via receive(); locais precisam
// desse caminho ou a UI nunca vê as próprias ações do usuário).
let localListener = null;
export function setLocalEventListener(fn) { localListener = fn; }
// eventos gravados fora do emitEvent (ex.: genesis em createSpace) tambem
// notificam a UI e o espelho — mesmo caminho dos eventos emitidos
export function notifyLocalEvent(env) { localListener?.(env); }

// emite evento local assinado com seq = maxLocal+1
export async function emitEvent(identity, spaceId, type, body, store, { persist = true } = {}) {
  const sp = spaces.get(spaceId);
  if (!sp) throw new Error(`Espaço desconhecido: ${spaceId}`);
  if (!sp.members.has(identity.pubKeyHex)) throw new Error('Não é membro do espaço');
  const proj = projections.get(spaceId);
  const seq = (proj.byAuthor.get(identity.pubKeyHex) || 0) + 1;
  const env = await makeSignedEnvelope(identity, { spaceId, type, body, seq });
  const r = await applyEvent(env, persist ? store : undefined);
  if (r.applied && localListener) localListener(env);
  return { env, ...r };
}

// replay: rebuild da projeção a partir do store persistente
export async function replaySpace(spaceId, store) {
  const proj = projections.get(spaceId);
  const sp = spaces.get(spaceId);
  if (!proj || !sp) return 0;
  proj.messages.clear(); proj.state = {}; proj.byAuthor.clear(); proj.lastTs.clear();
  const evts = await store.eventsInSpace(spaceId);
  for (const e of evts) {
    proj.byAuthor.set(e.author, Math.max(proj.byAuthor.get(e.author) || 0, e.seq));
    applyEventToProjection(proj, sp, { ...e, body: typeof e.body === 'string' ? JSON.parse(e.body) : e.body });
  }
  return evts.length;
}
