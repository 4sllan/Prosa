import { Router } from 'express';
import { db, now, id } from '../db.js';
import { wrap, str, bad, notFound, conflict, publicUser, getUser } from '../util.js';
import { setManualPresence, broadcastPresence, sendTo, relatedUserIds } from '../realtime.js';

export const usersRouter = Router();

const PRESENCES = ['online', 'idle', 'dnd', 'invisible'];

usersRouter.get('/@me', wrap(async (req, res) => {
  res.json({ user: { ...publicUser(req.user), email: req.user.email, isAdmin: !!req.user.is_admin } });
}));

usersRouter.patch('/@me', wrap(async (req, res) => {
  const b = req.body || {};
  const fields = [];
  const vals = [];
  if (b.displayName !== undefined) { fields.push('display_name = ?'); vals.push(str(b.displayName, { max: 64, name: 'nome' })); }
  if (b.bio !== undefined) { fields.push('bio = ?'); vals.push(str(b.bio, { min: 0, max: 500, name: 'bio' })); }
  if (b.statusText !== undefined) { fields.push('status_text = ?'); vals.push(str(b.statusText, { min: 0, max: 128, name: 'status' })); }
  if (b.avatarUrl !== undefined) { fields.push('avatar_url = ?'); vals.push(typeof b.avatarUrl === 'string' && b.avatarUrl.length < 512 ? b.avatarUrl : null); }
  if (fields.length) {
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...vals, req.user.id);
  }
  const u = getUser(req.user.id);
  sendTo(req.user.id, 'USER_UPDATE', { user: publicUser(u) });
  res.json({ user: publicUser(u) });
}));

usersRouter.patch('/@me/presence', wrap(async (req, res) => {
  const p = str(req.body?.presence, { max: 16 });
  if (!PRESENCES.includes(p)) throw bad('Presença inválida');
  setManualPresence(req.user.id, p);
  res.json({ presence: p });
}));

usersRouter.patch('/@me/password', wrap(async (req, res) => {
  const bcrypt = (await import('bcryptjs')).default;
  const cur = String(req.body?.current || '');
  const next = String(req.body?.next || '');
  if (!bcrypt.compareSync(cur, req.user.password_hash)) throw bad('Senha atual incorreta');
  if (next.length < 8) throw bad('Nova senha deve ter no mínimo 8 caracteres');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), req.user.id);
  res.json({ ok: true });
}));

usersRouter.get('/:userId', wrap(async (req, res) => {
  const u = getUser(req.params.userId);
  if (!u) throw notFound('Usuário não encontrado');
  res.json({ user: publicUser(u) });
}));

// ---- Friends ----

function friendshipBetween(a, b) {
  return db.prepare('SELECT * FROM friendships WHERE (user_id = ? AND other_id = ?) OR (user_id = ? AND other_id = ?)').get(a, b, b, a);
}

usersRouter.get('/@me/relationships', wrap(async (req, res) => {
  const rows = db.prepare(`SELECT f.*, u.username, u.display_name, u.avatar_url FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.user_id = ? THEN f.other_id ELSE f.user_id END
    WHERE f.user_id = ? OR f.other_id = ?`).all(req.user.id, req.user.id, req.user.id);
  const rels = rows.map(r => ({
    id: r.id,
    user: { id: r.user_id === req.user.id ? r.other_id : r.user_id, username: r.username, displayName: r.display_name || r.username, avatarUrl: r.avatar_url },
    // incoming pending = they sent to me
    type: r.status === 'blocked' ? 'blocked'
      : r.status === 'accepted' ? 'friend'
      : r.user_id === req.user.id ? 'outgoing' : 'incoming',
    createdAt: r.created_at,
  }));
  res.json({ relationships: rels });
}));

usersRouter.post('/@me/relationships', wrap(async (req, res) => {
  const username = str(req.body?.username, { max: 64 });
  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!target || target.id === req.user.id) throw notFound('Usuário não encontrado');
  const existing = friendshipBetween(req.user.id, target.id);
  if (existing) {
    if (existing.status === 'accepted') throw conflict('Vocês já são amigos');
    if (existing.status === 'blocked') throw bad('Bloqueado');
    if (existing.user_id === target.id) {
      // they already sent me a request → accept
      db.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(existing.id);
      sendTo(target.id, 'RELATIONSHIP_UPDATE', {});
      return res.json({ ok: true, accepted: true });
    }
    throw conflict('Solicitação já enviada');
  }
  db.prepare('INSERT INTO friendships (id, user_id, other_id, status, created_at) VALUES (?,?,?,?,?)')
    .run(id(), req.user.id, target.id, 'pending', now());
  sendTo(target.id, 'RELATIONSHIP_UPDATE', {});
  res.status(201).json({ ok: true });
}));

usersRouter.post('/@me/relationships/:otherId/accept', wrap(async (req, res) => {
  const f = friendshipBetween(req.user.id, req.params.otherId);
  if (!f || f.status !== 'pending' || f.other_id !== req.user.id) throw notFound('Solicitação não encontrada');
  db.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(f.id);
  sendTo(req.params.otherId, 'RELATIONSHIP_UPDATE', {});
  res.json({ ok: true });
}));

usersRouter.delete('/@me/relationships/:otherId', wrap(async (req, res) => {
  const f = friendshipBetween(req.user.id, req.params.otherId);
  if (!f) throw notFound('Relação não encontrada');
  db.prepare('DELETE FROM friendships WHERE id = ?').run(f.id);
  sendTo(req.params.otherId, 'RELATIONSHIP_UPDATE', {});
  res.json({ ok: true });
}));

usersRouter.post('/@me/relationships/:otherId/block', wrap(async (req, res) => {
  const f = friendshipBetween(req.user.id, req.params.otherId);
  if (f) db.prepare("UPDATE friendships SET status = 'blocked', user_id = ?, other_id = ? WHERE id = ?").run(req.user.id, req.params.otherId, f.id);
  else db.prepare('INSERT INTO friendships (id, user_id, other_id, status, created_at) VALUES (?,?,?,?,?)').run(id(), req.user.id, req.params.otherId, 'blocked', now());
  res.json({ ok: true });
}));

usersRouter.delete('/@me/relationships/:otherId/block', wrap(async (req, res) => {
  const f = friendshipBetween(req.user.id, req.params.otherId);
  if (f?.status === 'blocked' && f.user_id === req.user.id) db.prepare('DELETE FROM friendships WHERE id = ?').run(f.id);
  res.json({ ok: true });
}));

// Presence snapshot of related users for client bootstrap
usersRouter.get('/@me/presences', wrap(async (req, res) => {
  const ids = relatedUserIds(req.user.id);
  const { effectivePresence } = await import('../realtime.js');
  res.json({ presences: Object.fromEntries(ids.map(i => [i, effectivePresence(i)])) });
}));
