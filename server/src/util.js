import { db, now } from './db.js';

export class ApiError extends Error {
  constructor(status, message, code = 'error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const bad = (msg, code) => new ApiError(400, msg, code);
export const unauthorized = (msg = 'Não autenticado') => new ApiError(401, msg, 'unauthorized');
export const forbidden = (msg = 'Sem permissão') => new ApiError(403, msg, 'forbidden');
export const notFound = (msg = 'Não encontrado') => new ApiError(404, msg, 'not_found');
export const conflict = (msg) => new ApiError(409, msg, 'conflict');

export function str(v, { min = 1, max = 2000, name = 'campo' } = {}) {
  if (typeof v !== 'string') throw bad(`${name} inválido`);
  const t = v.trim();
  if (t.length < min) throw bad(`${name} muito curto (mín. ${min})`);
  if (t.length > max) throw bad(`${name} muito longo (máx. ${max})`);
  return t;
}

export const wrap = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Simple fixed-window rate limiter (per key)
const buckets = new Map();
export function rateLimit(key, limit, windowMs) {
  const t = now();
  let b = buckets.get(key);
  if (!b || t - b.start > windowMs) { b = { start: t, count: 0 }; buckets.set(key, b); }
  b.count++;
  return b.count <= limit;
}

export function requireRateLimit(key, limit, windowMs, msg = 'Muitas requisições') {
  if (!rateLimit(key, limit, windowMs)) throw new ApiError(429, msg, 'rate_limited');
}

export function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name || u.username,
    avatarUrl: u.avatar_url,
    bio: u.bio || '',
    statusText: u.status_text || '',
    presence: u.presence || 'online',
    createdAt: u.created_at,
  };
}

export function getUser(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function audit(communityId, actorId, action, targetId = null, meta = null) {
  db.prepare('INSERT INTO audit_log (id, community_id, actor_id, action, target_id, meta, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(crypto.randomUUID(), communityId, actorId, action, targetId, meta ? JSON.stringify(meta) : null, now());
}
