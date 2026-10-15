// store.cjs — armazenamento local do nó P2P (Electron main).
// Backend: node:sqlite (Node >= 22) → sql.js (WASM, sem rebuild) → journal JSON.
// Superfície: ops nomeadas via ipc 'p2p:store' — nunca SQL arbitrário do renderer.
const fs = require('node:fs');
const path = require('node:path');

let backend = null; // { name, run(sql,params), get(sql,params), all(sql,params) }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  author TEXT NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  body TEXT NOT NULL,
  ts INTEGER NOT NULL,
  sig TEXT NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_space ON events(space_id, author, seq);
CREATE TABLE IF NOT EXISTS projections (
  k TEXT PRIMARY KEY,
  space_id TEXT,
  v TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_proj_space ON projections(space_id);
CREATE TABLE IF NOT EXISTS contacts (
  pubkey TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  profile TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS files (
  hash TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime TEXT NOT NULL,
  space_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`;

async function makeNodeSqlite(file) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  return {
    name: 'node:sqlite',
    run: (sql, p = []) => db.prepare(sql).run(...p),
    get: (sql, p = []) => db.prepare(sql).get(...p),
    all: (sql, p = []) => db.prepare(sql).all(...p),
  };
}

async function makeSqlJs(file) {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const db = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
  const save = () => fs.writeFileSync(file, Buffer.from(db.export()));
  return {
    name: 'sql.js',
    run: (sql, p = []) => { db.run(sql, p); save(); },
    get: (sql, p = []) => db.exec(sql, p)[0]?.values?.[0]
      ? Object.fromEntries(db.exec(sql, p)[0].columns.map((c, i) => [c, db.exec(sql, p)[0].values[0][i]])) : undefined,
    all: (sql, p = []) => {
      const r = db.exec(sql, p)[0];
      return r ? r.values.map(row => Object.fromEntries(r.columns.map((c, i) => [c, row[i]]))) : [];
    },
  };
}

// journal JSON — último recurso sem SQLite (linhas "op|json")
function makeJournal(file) {
  const mem = { events: [], projections: new Map(), contacts: new Map(), files: new Map(), kv: new Map() };
  if (fs.existsSync(file)) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      mem.events = saved.events || [];
      for (const [k, v] of saved.projections || []) mem.projections.set(k, v);
      for (const [k, v] of saved.contacts || []) mem.contacts.set(k, v);
      for (const [k, v] of saved.files || []) mem.files.set(k, v);
      for (const [k, v] of saved.kv || []) mem.kv.set(k, v);
    } catch {}
  }
  const save = () => fs.writeFileSync(file, JSON.stringify({
    events: mem.events.slice(-100000),
    projections: [...mem.projections], contacts: [...mem.contacts],
    files: [...mem.files], kv: [...mem.kv],
  }));
  return {
    name: 'journal',
    _mem: mem, _save: save,
    run: (sql, p = []) => {
      if (sql.startsWith('INSERT OR REPLACE INTO events')) {
        mem.events.push({ id: p[0], space_id: p[1], author: p[2], seq: p[3], type: p[4], body: p[5], ts: p[6], sig: p[7], received_at: p[8] });
      } else if (sql.startsWith('INSERT OR REPLACE INTO projections')) {
        mem.projections.set(p[0], { k: p[0], space_id: p[1], v: p[2] });
      } else if (sql.startsWith('INSERT OR REPLACE INTO contacts')) {
        mem.contacts.set(p[0], { pubkey: p[0], state: p[1], profile: p[2], updated_at: p[3] });
      } else if (sql.startsWith('DELETE FROM contacts')) {
        mem.contacts.delete(p[0]);
      } else if (sql.startsWith('INSERT OR REPLACE INTO files')) {
        mem.files.set(p[0], { hash: p[0], path: p[1], size: p[2], mime: p[3], space_id: p[4], created_at: p[5] });
      } else if (sql.startsWith('INSERT OR REPLACE INTO kv')) {
        mem.kv.set(p[0], p[1]);
      } else if (sql.startsWith('DELETE FROM files')) {
        mem.files.delete(p[0]);
      }
      save();
    },
    get: (sql, p = []) => {
      if (sql.startsWith('SELECT MAX(seq)')) {
        const max = mem.events.filter(e => e.space_id === p[0] && e.author === p[1]).reduce((m, e) => Math.max(m, e.seq), 0);
        return { max: max || undefined };
      }
      if (sql.startsWith('SELECT v FROM kv')) { const v = mem.kv.get(p[0]); return v === undefined ? undefined : { v }; }
      if (sql.startsWith('SELECT v FROM projections')) { const r = mem.projections.get(p[0]); return r ? { v: r.v } : undefined; }
      if (sql.startsWith('SELECT * FROM contacts')) { const r = mem.contacts.get(p[0]); return r; }
      if (sql.startsWith('SELECT path FROM files')) { const r = mem.files.get(p[0]); return r ? { path: r.path } : undefined; }
      return undefined;
    },
    all: (sql, p = []) => {
      if (sql.includes('FROM events') && sql.includes('seq >')) {
        return mem.events.filter(e => e.space_id === p[0] && e.author === p[1] && e.seq > p[2]);
      }
      if (sql.includes('FROM events') && sql.includes('space_id = ?')) {
        return mem.events.filter(e => e.space_id === p[0]);
      }
      if (sql.startsWith('SELECT * FROM contacts WHERE state')) {
        return [...mem.contacts.values()].filter(c => c.state === p[0]);
      }
      if (sql.startsWith('SELECT * FROM contacts')) return [...mem.contacts.values()];
      if (sql.startsWith('SELECT * FROM projections WHERE space_id')) {
        return [...mem.projections.values()].filter(x => x.space_id === p[0]);
      }
      if (sql.includes('FROM events') && sql.includes('body LIKE')) {
        const pat = String(p[0]).replace(/%/g, '');
        return mem.events.filter(e => e.body.includes(pat));
      }
      if (sql.startsWith('SELECT * FROM files WHERE space_id')) {
        return [...mem.files.values()].filter(f => f.space_id === p[0]);
      }
      return [];
    },
  };
}

async function init(userDataDir) {
  const dir = path.join(userDataDir, 'p2p');
  fs.mkdirSync(dir, { recursive: true });
  const dbFile = path.join(dir, 'local.sqlite');
  try { backend = await makeNodeSqlite(dbFile); }
  catch {
    try { backend = await makeSqlJs(dbFile); }
    catch { backend = makeJournal(path.join(dir, 'local.json')); }
  }
  if (backend.name !== 'journal') {
    for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) backend.run(stmt);
  }
  return backend.name;
}

const ops = {
  putEvent: (e) => backend.run(
    'INSERT OR REPLACE INTO events (id, space_id, author, seq, type, body, ts, sig, received_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [e.id, e.spaceId, e.author, e.seq, e.type, JSON.stringify(e.body), e.ts, e.sig, e.receivedAt || Date.now()]),
  eventsSince: (spaceId, author, seq) => backend.all(
    'SELECT * FROM events WHERE space_id = ? AND author = ? AND seq > ? ORDER BY seq', [spaceId, author, seq]),
  eventsInSpace: (spaceId) => backend.all(
    'SELECT * FROM events WHERE space_id = ? ORDER BY ts', [spaceId]),
  maxSeq: (spaceId, author) => backend.get(
    'SELECT MAX(seq) AS max FROM events WHERE space_id = ? AND author = ?', [spaceId, author])?.max || 0,
  maxSeqMap: (spaceId) => {
    const rows = backend.all('SELECT author, MAX(seq) AS max FROM events WHERE space_id = ? GROUP BY author', [spaceId]);
    return Object.fromEntries(rows.map(r => [r.author, r.max]));
  },
  putProjection: (k, spaceId, v) => backend.run(
    'INSERT OR REPLACE INTO projections (k, space_id, v) VALUES (?,?,?)', [k, spaceId, JSON.stringify(v)]),
  getProjection: (k) => JSON.parse(backend.get('SELECT v FROM projections WHERE k = ?', [k])?.v || 'null'),
  projectionsInSpace: (spaceId) => backend.all(
    'SELECT k, v FROM projections WHERE space_id = ?', [spaceId]).map(r => ({ k: r.k, v: JSON.parse(r.v) })),
  putContact: (c) => backend.run(
    'INSERT OR REPLACE INTO contacts (pubkey, state, profile, updated_at) VALUES (?,?,?,?)',
    [c.pubkey, c.state, JSON.stringify(c.profile || {}), c.updatedAt || Date.now()]),
  getContact: (pubkey) => backend.get('SELECT * FROM contacts WHERE pubkey = ?', [pubkey]),
  contactsByState: (state) => backend.all('SELECT * FROM contacts WHERE state = ?', [state]),
  allContacts: () => backend.all('SELECT * FROM contacts'),
  removeContact: (pubkey) => backend.run('DELETE FROM contacts WHERE pubkey = ?', [pubkey]),
  putFile: (f) => backend.run(
    'INSERT OR REPLACE INTO files (hash, path, size, mime, space_id, created_at) VALUES (?,?,?,?,?,?)',
    [f.hash, f.path, f.size, f.mime, f.spaceId, f.createdAt || Date.now()]),
  getFile: (hash) => backend.get('SELECT path FROM files WHERE hash = ?', [hash]),
  filesInSpace: (spaceId) => backend.all('SELECT * FROM files WHERE space_id = ?', [spaceId]),
  deleteFile: (hash) => backend.run('DELETE FROM files WHERE hash = ?', [hash]),
  kvSet: (k, v) => backend.run('INSERT OR REPLACE INTO kv (k, v) VALUES (?,?)', [k, JSON.stringify(v)]),
  kvGet: (k) => JSON.parse(backend.get('SELECT v FROM kv WHERE k = ?', [k])?.v || 'null'),
  searchEvents: (spaceId, text, limit = 50) => backend.all(
    'SELECT * FROM events WHERE space_id = ? AND body LIKE ? ORDER BY ts DESC LIMIT ?',
    [spaceId, `%${text}%`, limit]),
};

module.exports = { init, ops, getBackendName: () => backend?.name };
