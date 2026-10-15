import { Router } from 'express';
import { db, now } from '../db.js';
import { wrap, notFound, forbidden, str } from '../util.js';

function requireAdmin(req, _res, next) {
  if (!req.user?.is_admin) return next(forbidden('Acesso administrativo necessário'));
  next();
}

export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get('/users', wrap(async (req, res) => {
  const rows = db.prepare('SELECT id, username, email, display_name, is_admin, suspended, created_at FROM users ORDER BY created_at DESC LIMIT 500').all();
  res.json({ users: rows.map(u => ({ id: u.id, username: u.username, email: u.email, displayName: u.display_name, isAdmin: !!u.is_admin, suspended: !!u.suspended, createdAt: u.created_at })) });
}));

adminRouter.post('/users/:id/suspend', wrap(async (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) throw notFound('Usuário não encontrado');
  if (u.is_admin) throw forbidden('Não é possível suspender um admin');
  db.prepare('UPDATE users SET suspended = 1 WHERE id = ?').run(u.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  res.json({ ok: true });
}));

adminRouter.post('/users/:id/unsuspend', wrap(async (req, res) => {
  db.prepare('UPDATE users SET suspended = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

adminRouter.get('/communities', wrap(async (_req, res) => {
  const rows = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM members m WHERE m.community_id = c.id) AS member_count FROM communities c ORDER BY c.created_at DESC LIMIT 500`).all();
  res.json({ communities: rows.map(c => ({ id: c.id, name: c.name, ownerId: c.owner_id, memberCount: c.member_count, createdAt: c.created_at })) });
}));

adminRouter.get('/reports', wrap(async (_req, res) => {
  const rows = db.prepare(`SELECT r.*, u.username AS reporter FROM reports r JOIN users u ON u.id = r.reporter_id ORDER BY r.created_at DESC LIMIT 500`).all();
  res.json({ reports: rows });
}));

adminRouter.post('/reports/:id/resolve', wrap(async (req, res) => {
  const status = req.body?.status === 'dismissed' ? 'dismissed' : 'resolved';
  db.prepare('UPDATE reports SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
}));

adminRouter.get('/stats', wrap(async (_req, res) => {
  const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  res.json({
    users: count('users'), communities: count('communities'), messages: count('messages'),
    channels: count('channels'), openReports: db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status='open'").get().n,
  });
}));
