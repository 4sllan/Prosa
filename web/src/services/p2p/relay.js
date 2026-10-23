// p2p/relay.js — ingestao ordenada de envelopes relayados pelo canal de espaco.
// O broadcast do hub nao garante ordem e o eventlog descarta seq retroativa,
// entao uma lacuna (seq > curMax+1) e bufferizada por (spaceId, author) e
// preenchida por pull do mailbox (space_events). Esgotadas as tentativas, o
// buffer e descartado — a sync por DC cobre o restante quando o peer voltar.
const DEFAULT_GAP_MS = 2000;
const DEFAULT_TRIES = 3;

export function createRelayReceiver({
  curMaxOf,   // (spaceId, author) -> maior seq aplicado daquele autor
  apply,      // (env) -> Promise<bool> — valida + aplica envelope contiguo
  pull,       // (spaceId, author, afterSeq) -> Promise<env[]> — mailbox
  gapMs = DEFAULT_GAP_MS,
  maxTries = DEFAULT_TRIES,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (t) => clearTimeout(t),
} = {}) {
  const gaps = new Map();     // 'spaceId:author' -> {pending: Map<seq,env>, timer}
  const attempts = new Map(); // 'spaceId:author' -> tentativas restantes de pull
  const key = (s, a) => `${s}:${a}`;

  const clearGap = (k) => {
    const g = gaps.get(k);
    if (g?.timer) clearTimer(g.timer);
    gaps.delete(k);
    attempts.delete(k);
  };

  async function fill(spaceId, author) {
    const k = key(spaceId, author);
    const g = gaps.get(k);
    if (!g) return;
    const left = (attempts.get(k) ?? maxTries) - 1;
    attempts.set(k, left);
    if (left <= 0) { clearGap(k); return; }
    try {
      for (const env of (await pull(spaceId, author, curMaxOf(spaceId, author))) || []) {
        await ingest(env);
      }
    } catch {}
    // tenta o que sobrou do buffer em ordem — o que seguir com lacuna re-buffera
    const rest = [...g.pending.values()].sort((x, y) => x.seq - y.seq);
    if (gaps.get(k) === g) gaps.delete(k);
    for (const env of rest) await ingest(env);
    if (!gaps.has(k)) attempts.delete(k);
  }

  async function ingest(env) {
    const curMax = curMaxOf(env.spaceId, env.author);
    if (env.seq <= curMax) return false; // dedupe DC/relay/pull
    if (env.seq > curMax + 1) {
      const k = key(env.spaceId, env.author);
      let g = gaps.get(k);
      if (!g) { g = { pending: new Map(), timer: null }; gaps.set(k, g); }
      g.pending.set(env.seq, env);
      g.timer ??= setTimer(() => fill(env.spaceId, env.author), gapMs);
      return false;
    }
    if (!(await apply(env))) return false;
    const k = key(env.spaceId, env.author);
    const g = gaps.get(k);
    const nxt = g?.pending.get(env.seq + 1);
    if (nxt) { g.pending.delete(nxt.seq); await ingest(nxt); }
    if (g && !g.pending.size) clearGap(k);
    return true;
  }

  return { ingest, gaps };
}
