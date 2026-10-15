import { Router } from 'express';
import { db, now, id } from '../db.js';
import { wrap, str, bad, notFound, conflict, publicUser } from '../util.js';
import { sendToUsers } from '../realtime.js';

export const dmsRouter = Router();

function dmDto(ch, userId) {
  const members = db.prepare(`SELECT u.id, u.username, u.display_name, u.avatar_url FROM dm_members dm JOIN users u ON u.id = dm.user_id WHERE dm.channel_id = ?`).all(ch.id);
  const last = db.prepare('SELECT content, created_at FROM messages WHERE channel_id = ? AND deleted = 0 ORDER BY created_at DESC LIMIT 1').get(ch.id);
  return {
    id: ch.id, type: ch.type, name: ch.type === 'group_dm' ? ch.name : null,
    recipients: members.filter(m => m.id !== userId).map(m => ({ id: m.id, username: m.username, displayName: m.display_name || m.username, avatarUrl: m.avatar_url })),
    allMembers: members.map(m => m.id),
    lastMessageAt: last?.created_at ?? ch.created_at,
    lastMessagePreview: last?.content?.slice(0, 80) ?? '',
  };
}

dmsRouter.get('/', wrap(async (req, res) => {
  const rows = db.prepare(`SELECT c.* FROM channels c JOIN dm_members dm ON dm.channel_id = c.id WHERE dm.user_id = ? AND c.type IN ('dm','group_dm') ORDER BY c.created_at DESC`).all(req.user.id);
  const dms = rows.map(c => dmDto(c, req.user.id)).sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  res.json({ dms });
}));

// Open (or get) a 1:1 DM with a user
dmsRouter.post('/open/:userId', wrap(async (req, res) => {
  const other = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
  if (!other || other.id === req.user.id) throw notFound('Usuário não encontrado');
  const blocked = db.prepare("SELECT 1 FROM friendships WHERE status='blocked' AND ((user_id=? AND other_id=?) OR (user_id=? AND other_id=?))").get(req.user.id, other.id, other.id, req.user.id);
  if (blocked) throw bad('Não é possível enviar mensagens para este usuário');
  const existing = db.prepare(`SELECT c.* FROM channels c
    WHERE c.type = 'dm'
    AND EXISTS (SELECT 1 FROM dm_members a WHERE a.channel_id = c.id AND a.user_id = ?)
    AND EXISTS (SELECT 1 FROM dm_members b WHERE b.channel_id = c.id AND b.user_id = ?)
    AND (SELECT COUNT(*) FROM dm_members x WHERE x.channel_id = c.id) = 2`).get(req.user.id, other.id);
  if (existing) return res.json({ dm: dmDto(existing, req.user.id) });
  const chId = id();
  db.prepare("INSERT INTO channels (id, name, type, created_at) VALUES (?, '', 'dm', ?)").run(chId, now());
  db.prepare('INSERT INTO dm_members (channel_id, user_id) VALUES (?,?), (?,?)').run(chId, req.user.id, chId, other.id);
  sendToUsers([req.user.id, other.id], 'DM_CREATE', { channelId: chId });
  res.status(201).json({ dm: dmDto(db.prepare('SELECT * FROM channels WHERE id = ?').get(chId), req.user.id) });
}));

// Group DM
dmsRouter.post('/group', wrap(async (req, res) => {
  const name = str(req.body?.name, { max: 100, name: 'nome' });
  const userIds = [...new Set((req.body?.userIds || []).filter(u => typeof u === 'string'))].slice(0, 9);
  if (!userIds.length) throw bad('Selecione ao menos um usuário');
  for (const uid of userIds) {
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(uid)) throw notFound('Usuário não encontrado');
  }
  const chId = id();
  db.prepare("INSERT INTO channels (id, name, type, created_at) VALUES (?, ?, 'group_dm', ?)").run(chId, name, now());
  const ins = db.prepare('INSERT INTO dm_members (channel_id, user_id) VALUES (?,?)');
  ins.run(chId, req.user.id);
  for (const uid of userIds) ins.run(chId, uid);
  sendToUsers([req.user.id, ...userIds], 'DM_CREATE', { channelId: chId });
  res.status(201).json({ dm: dmDto(db.prepare('SELECT * FROM channels WHERE id = ?').get(chId), req.user.id) });
}));

dmsRouter.post('/:chId/leave', wrap(async (req, res) => {
  const m = db.prepare('SELECT 1 FROM dm_members WHERE channel_id = ? AND user_id = ?').get(req.params.chId, req.user.id);
  if (!m) throw notFound('Conversa não encontrada');
  db.prepare('DELETE FROM dm_members WHERE channel_id = ? AND user_id = ?').run(req.params.chId, req.user.id);
  res.json({ ok: true });
}));
