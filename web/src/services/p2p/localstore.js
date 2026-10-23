// p2p/localstore.js — fachada de persistência local do nó.
// Em Electron: delega ao store.cjs via bridge tipada.
// Em browser/dev: backend em memória + localStorage (sem dados sensíveis além do journal).
// Nomes de ops iguais aos do desktop: putEvent, eventsSince, maxSeqMap, kv*, contacts, files.

let backend = null;

function memoryBackend() {
  const mem = {
    events: [],
    projections: new Map(),
    contacts: new Map(),
    files: new Map(),
    kv: new Map(),
  };
  const LS_KEY = 'prosa_p2p_store';
  const hasLS = typeof localStorage !== 'undefined';
  if (hasLS) {
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (s) {
        mem.events = s.events || [];
        for (const [k, v] of s.projections || []) mem.projections.set(k, v);
        for (const [k, v] of s.contacts || []) mem.contacts.set(k, v);
        for (const [k, v] of s.kv || []) mem.kv.set(k, v);
      }
    } catch {}
  }
  const save = () => {
    if (!hasLS) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        events: mem.events.slice(-50000),
        projections: [...mem.projections], contacts: [...mem.contacts], kv: [...mem.kv],
      }));
    } catch {}
  };
  return {
    name: 'memory',
    putEvent: async (e) => { mem.events.push(e); save(); },
    eventsSince: async (spaceId, author, seq) =>
      mem.events.filter(e => e.spaceId === spaceId && e.author === author && e.seq > seq).sort((a, b) => a.seq - b.seq),
    eventsInSpace: async (spaceId) => mem.events.filter(e => e.spaceId === spaceId).sort((a, b) => a.ts - b.ts),
    maxSeq: async (spaceId, author) =>
      mem.events.filter(e => e.spaceId === spaceId && e.author === author).reduce((m, e) => Math.max(m, e.seq), 0),
    maxSeqMap: async (spaceId) => {
      const map = {};
      for (const e of mem.events) if (e.spaceId === spaceId) map[e.author] = Math.max(map[e.author] || 0, e.seq);
      return map;
    },
    putProjection: async (k, spaceId, v) => { mem.projections.set(k, v); save(); },
    getProjection: async (k) => mem.projections.get(k) ?? null,
    projectionsInSpace: async (spaceId) =>
      [...mem.projections.entries()].filter(([k]) => k.startsWith(spaceId + ':')).map(([k, v]) => ({ k, v })),
    putContact: async (c) => { mem.contacts.set(c.pubkey, { ...c, updatedAt: Date.now() }); save(); },
    getContact: async (pubkey) => mem.contacts.get(pubkey) || null,
    contactsByState: async (state) => [...mem.contacts.values()].filter(c => c.state === state),
    allContacts: async () => [...mem.contacts.values()],
    removeContact: async (pubkey) => { mem.contacts.delete(pubkey); save(); },
    putFile: async (f) => mem.files.set(f.hash, f),
    getFile: async (hash) => mem.files.get(hash) || null,
    filesInSpace: async (spaceId) => [...mem.files.values()].filter(f => f.spaceId === spaceId),
    deleteFile: async (hash) => { mem.files.delete(hash); },
    kvSet: async (k, v) => { mem.kv.set(k, v); save(); },
    kvGet: async (k) => mem.kv.get(k) ?? null,
    searchEvents: async (spaceId, text, limit = 50) =>
      mem.events.filter(e => e.spaceId === spaceId && JSON.stringify(e.body).includes(text)).slice(-limit),
  };
}

function bridgeBackend() {
  const call = (op, args = {}) => window.prosaDesktop.p2p.store(op, args);
  const wrap = {};
  for (const op of [
    'putEvent', 'eventsSince', 'eventsInSpace', 'maxSeq', 'maxSeqMap',
    'putProjection', 'getProjection', 'projectionsInSpace',
    'putContact', 'getContact', 'contactsByState', 'allContacts', 'removeContact',
    'putFile', 'getFile', 'filesInSpace', 'deleteFile',
    'kvSet', 'kvGet', 'searchEvents',
  ]) wrap[op] = (args) => call(op, args);
  return {
    name: 'ipc',
    // adapta assinatura (op, argObject)
    putEvent: (e) => call('putEvent', e),
    eventsSince: (spaceId, author, seq) => call('eventsSince', { spaceId, author, seq }),
    eventsInSpace: (spaceId) => call('eventsInSpace', { spaceId }),
    maxSeq: (spaceId, author) => call('maxSeq', { spaceId, author }),
    maxSeqMap: (spaceId) => call('maxSeqMap', { spaceId }),
    putProjection: (k, spaceId, v) => call('putProjection', { k, spaceId, v }),
    getProjection: (k) => call('getProjection', { k }),
    projectionsInSpace: (spaceId) => call('projectionsInSpace', { spaceId }),
    putContact: (c) => call('putContact', c),
    getContact: (pubkey) => call('getContact', { pubkey }),
    contactsByState: (state) => call('contactsByState', { state }),
    allContacts: () => call('allContacts', {}),
    removeContact: (pubkey) => call('removeContact', { pubkey }),
    putFile: (f) => call('putFile', f),
    getFile: (hash) => call('getFile', { hash }),
    filesInSpace: (spaceId) => call('filesInSpace', { spaceId }),
    deleteFile: (hash) => call('deleteFile', { hash }),
    kvSet: (k, v) => call('kvSet', { k, v }),
    kvGet: (k) => call('kvGet', { k }),
    searchEvents: (spaceId, text, limit) => call('searchEvents', { spaceId, text, limit }),
  };
}

export function initLocalStore() {
  if (backend) return backend;
  backend = (typeof window !== 'undefined' && window.prosaDesktop?.p2p?.store)
    ? bridgeBackend()
    : memoryBackend();
  return backend;
}

export function getLocalStore() {
  if (!backend) throw new Error('localstore não inicializado');
  return backend;
}
