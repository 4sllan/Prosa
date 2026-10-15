import { Router } from 'express';
import { db, now, id } from '../db.js';
import { wrap, str, bad, notFound, forbidden, publicUser, getUser, audit, requireRateLimit } from '../util.js';
import { channelContext, channelMemberIds, hasPerm, requirePerm } from '../permissions.js';
import { broadcastToChannel, sendToUsers } from '../realtime.js';

export const messagesRouter = Router();

function messageDto(m) {
  const author = getUser(m.author_id);
  const atts = db.prepare('SELECT * FROM attachments WHERE message_id = ?').all(m.id);
  const reactions = db.prepare('SELECT emoji, COUNT(*) AS n, GROUP_CONCAT(user_id) AS users FROM reactions WHERE message_id = ? GROUP BY emoji').all(m.id);
  const reply = m.reply_to ? db.prepare('SELECT m.id, m.content, u.username FROM messages m JOIN users u ON u.id = m.author_id WHERE m.id = ? AND m.deleted = 0').get(m.reply_to) : null;
  return {
    id: m.id, channelId: m.channel_id,
    author: author ? publicUser(author) : { id: m.author_id, username: 'desconhecido', displayName: 'desconhecido' },
    content: m.content, replyTo: reply ? { id: reply.id, content: reply.content.slice(0, 200), author: reply.username } : null,
    attachments: atts.map(a => ({ id: a.id, filename: a.filename, mime: a.mime, size: a.size, url: a.url })),
    reactions: reactions.map(r => ({ emoji: r.emoji, count: r.n, users: r.users.split(',') })),
    editedAt: m.edited_at, pinned: !!m.pinned, createdAt: m.created_at,
  };
}

const lastSent = new Map(); // per-user slowmode tracking

messagesRouter.get('/channels/:chId/messages', wrap(async (req, res) => {
  const { channel } = channelContext(req.params.chId, req.user.id);
  const before = req.query.before ? String(req.query.before) : null;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  let rows;
  if (before) {
    rows = db.prepare('SELECT * FROM messages WHERE channel_id = ? AND deleted = 0 AND created_at < (SELECT created_at FROM messages WHERE id = ?) ORDER BY created_at DESC LIMIT ?').all(channel.id, before, limit);
  } else {
    rows = db.prepare('SELECT * FROM messages WHERE channel_id = ? AND deleted = 0 ORDER BY created_at DESC LIMIT ?').all(channel.id, limit);
  }
  res.json({ messages: rows.reverse().map(messageDto) });
}));

function extractMentions(content, channelId) {
  const names = [...content.matchAll(/@([a-z0-9_.]{3,32})/gi)].map(m => m[1].toLowerCase());
  if (!names.length) return [];
  const members = channelMemberIds(db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId));
  const users = db.prepare(`SELECT id, username FROM users WHERE lower(username) IN (${names.map(() => '?').join(',')})`).all(...names);
  return users.filter(u => members.includes(u.id)).map(u => u.id);
}

messagesRouter.post('/channels/:chId/messages', wrap(async (req, res) => {
  const { channel, member } = channelContext(req.params.chId, req.user.id);
  requireRateLimit(`msg:${req.user.id}`, 30, 10_000, 'Enviando mensagens rápido demais');
  if (channel.slowmode_seconds > 0 && member && member.role === 'member') {
    const last = lastSent.get(`${req.user.id}:${channel.id}`) || 0;
    if (now() - last < channel.slowmode_seconds * 1000) throw bad(`Modo lento: aguarde ${channel.slowmode_seconds}s entre mensagens`);
  }
  const content = str(req.body?.content, { min: 0, max: 4000, name: 'mensagem' });
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 10) : [];
  if (!content && !attachments.length) throw bad('Mensagem vazia');
  let replyTo = null;
  if (req.body?.replyTo) {
    const r = db.prepare('SELECT id FROM messages WHERE id = ? AND channel_id = ? AND deleted = 0').get(String(req.body.replyTo), channel.id);
    if (r) replyTo = r.id;
  }
  const mid = id();
  db.prepare('INSERT INTO messages (id, channel_id, author_id, content, reply_to, created_at) VALUES (?,?,?,?,?,?)')
    .run(mid, channel.id, req.user.id, content, replyTo, now());
  for (const a of attachments) {
    if (typeof a?.url === 'string' && a.url.startsWith('/uploads/') && typeof a.filename === 'string') {
      db.prepare('INSERT INTO attachments (id, message_id, filename, mime, size, url) VALUES (?,?,?,?,?,?)')
        .run(id(), mid, str(a.filename, { max: 255 }), String(a.mime || '').slice(0, 100), Number(a.size) || 0, a.url.slice(0, 512));
    }
  }
  lastSent.set(`${req.user.id}:${channel.id}`, now());
  db.prepare('INSERT OR REPLACE INTO read_states (channel_id, user_id, last_read_message_id, updated_at) VALUES (?,?,?,?)')
    .run(channel.id, req.user.id, mid, now());
  const dto = messageDto(db.prepare('SELECT * FROM messages WHERE id = ?').get(mid));
  broadcastToChannel(channel.id, 'MESSAGE_CREATE', { message: dto });
  // mention notifications
  const mentioned = extractMentions(content, channel.id).filter(u => u !== req.user.id);
  if (mentioned.length) sendToUsers(mentioned, 'NOTIFY', { kind: 'mention', channelId: channel.id, message: dto });
  res.status(201).json({ message: dto });
}));

messagesRouter.patch('/channels/:chId/messages/:mid', wrap(async (req, res) => {
  const { channel } = channelContext(req.params.chId, req.user.id);
  const m = db.prepare('SELECT * FROM messages WHERE id = ? AND channel_id = ? AND deleted = 0').get(req.params.mid, channel.id);
  if (!m) throw notFound('Mensagem não encontrada');
  if (m.author_id !== req.user.id) throw forbidden('Só o autor pode editar');
  const content = str(req.body?.content, { max: 4000 });
  db.prepare('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?').run(content, now(), m.id);
  const dto = messageDto(db.prepare('SELECT * FROM messages WHERE id = ?').get(m.id));
  broadcastToChannel(channel.id, 'MESSAGE_UPDATE', { message: dto });
  res.json({ message: dto });
}));

messagesRouter.delete('/channels/:chId/messages/:mid', wrap(async (req, res) => {
  const { channel } = channelContext(req.params.chId, req.user.id);
  const m = db.prepare('SELECT * FROM messages WHERE id = ? AND channel_id = ? AND deleted = 0').get(req.params.mid, channel.id);
  if (!m) throw notFound('Mensagem não encontrada');
  const isAuthor = m.author_id === req.user.id;
  const canModerate = channel.community_id && hasPerm(channel.community_id, req.user.id, 'manage_messages');
  if (!isAuthor && !canModerate) throw forbidden();
  db.prepare('UPDATE messages SET deleted = 1 WHERE id = ?').run(m.id);
  if (!isAuthor) audit(channel.community_id, req.user.id, 'message_delete', m.id);
  broadcastToChannel(channel.id, 'MESSAGE_DELETE', { channelId: channel.id, messageId: m.id });
  res.json({ ok: true });
}));

messagesRouter.post('/channels/:chId/messages/:mid/pin', wrap(async (req, res) => {
  const { channel } = channelContext(req.params.chId, req.user.id);
  if (channel.community_id) requirePerm(channel.community_id, req.user.id, 'manage_messages');
  db.prepare('UPDATE messages SET pinned = 1 WHERE id = ? AND channel_id = ?').run(req.params.mid, channel.id);
  broadcastToChannel(channel.id, 'MESSAGE_UPDATE', { message: messageDto(db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.mid)) });
  res.json({ ok: true });
}));

messagesRouter.delete('/channels/:chId/messages/:mid/pin', wrap(async (req, res) => {
  const { channel } = channelContext(req.params.chId, req.user.id);
  if (channel.community_id) requirePerm(channel.community_id, req.user.id, 'manage_messages');
  db.prepare('UPDATE messages SET pinned = 0 WHERE id = ? AND channel_id = ?').run(req.params.mid, channel.id);
  broadcastToChannel(channel.id, 'MESSAGE_UPDATE', { message: messageDto(db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.mid)) });
  res.json({ ok: true });
}));

messagesRouter.put('/channels/:chId/messages/:mid/reactions/:emoji', wrap(async (req, res) => {
  const { channel } = channelContext(req.params.chId, req.user.id);
  const emoji = decodeURIComponent(req.params.emoji).slice(0, 32);
  db.prepare('INSERT OR IGNORE INTO reactions (message_id, user_id, emoji, created_at) VALUES (?,?,?,?)')
    .run(req.params.mid, req.user.id, emoji, now());
  const dto = messageDto(db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.mid));
  broadcastToChannel(channel.id, 'MESSAGE_UPDATE', { message: dto });
  res.json({ ok: true });
}));

messagesRouter.delete('/channels/:chId/messages/:mid/reactions/:emoji', wrap(async (req, res) => {
  const { channel } = channelContext(req.params.chId, req.user.id);
  const emoji = decodeURIComponent(req.params.emoji).slice(0, 32);
  db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').run(req.params.mid, req.user.id, emoji);
  const dto = messageDto(db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.mid));
  broadcastToChannel(channel.id, 'MESSAGE_UPDATE', { message: dto });
  res.json({ ok: true });
}));

messagesRouter.post('/channels/:chId/read', wrap(async (req, res) => {
  channelContext(req.params.chId, req.user.id);
  db.prepare('INSERT OR REPLACE INTO read_states (channel_id, user_id, last_read_message_id, updated_at) VALUES (?,?,?,?)')
    .run(req.params.chId, req.user.id, String(req.body?.messageId || ''), now());
  res.json({ ok: true });
}));

messagesRouter.get('/channels/:chId/pins', wrap(async (req, res) => {
  const { channel } = channelContext(req.params.chId, req.user.id);
  const rows = db.prepare('SELECT * FROM messages WHERE channel_id = ? AND pinned = 1 AND deleted = 0 ORDER BY created_at DESC LIMIT 50').all(channel.id);
  res.json({ messages: rows.map(messageDto) });
}));
