import { Router } from 'express';
import { db, now, id } from '../db.js';
import { wrap, str, bad, notFound, forbidden, conflict, audit, publicUser } from '../util.js';
import { requireMember, requirePerm, getMember, canActOn, communityMemberIds } from '../permissions.js';
import { broadcastToCommunity, sendTo, sendToUsers, broadcastToChannel } from '../realtime.js';

export const communitiesRouter = Router();

function communityDto(c, userId) {
  const member = getMember(c.id, userId);
  return { id: c.id, name: c.name, description: c.description, iconUrl: c.icon_url, ownerId: c.owner_id, createdAt: c.created_at, myRole: member?.role };
}

function channelDto(ch) {
  return { id: ch.id, communityId: ch.community_id, categoryId: ch.category_id, name: ch.name, type: ch.type, topic: ch.topic, position: ch.position, slowmodeSeconds: ch.slowmode_seconds, createdAt: ch.created_at };
}

// ---- Communities ----

communitiesRouter.get('/', wrap(async (req, res) => {
  const rows = db.prepare('SELECT c.* FROM communities c JOIN members m ON m.community_id = c.id WHERE m.user_id = ? ORDER BY c.created_at').all(req.user.id);
  res.json({ communities: rows.map(c => communityDto(c, req.user.id)) });
}));

communitiesRouter.post('/', wrap(async (req, res) => {
  const name = str(req.body?.name, { max: 100, name: 'nome' });
  const cid = id();
  db.prepare('INSERT INTO communities (id, name, description, owner_id, created_at) VALUES (?,?,?,?,?)')
    .run(cid, name, str(req.body?.description ?? '', { min: 0, max: 500 }) || '', req.user.id, now());
  db.prepare("INSERT INTO members (community_id, user_id, role, joined_at) VALUES (?,?, 'owner', ?)").run(cid, req.user.id, now());
  // default structure
  const cat = id();
  db.prepare('INSERT INTO categories (id, community_id, name, position) VALUES (?,?,?,0)').run(cat, cid, 'Geral');
  db.prepare("INSERT INTO channels (id, community_id, category_id, name, type, position, created_at) VALUES (?,?,?,?,'text',0,?)").run(id(), cid, cat, 'geral', now());
  audit(cid, req.user.id, 'community_create', cid);
  const c = db.prepare('SELECT * FROM communities WHERE id = ?').get(cid);
  res.status(201).json({ community: communityDto(c, req.user.id) });
}));

communitiesRouter.get('/:cid', wrap(async (req, res) => {
  requireMember(req.params.cid, req.user.id);
  const c = db.prepare('SELECT * FROM communities WHERE id = ?').get(req.params.cid);
  const channels = db.prepare('SELECT * FROM channels WHERE community_id = ? ORDER BY position').all(c.id);
  const categories = db.prepare('SELECT * FROM categories WHERE community_id = ? ORDER BY position').all(c.id);
  const members = db.prepare(`SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, m.role, m.nickname, m.joined_at
    FROM members m JOIN users u ON u.id = m.user_id WHERE m.community_id = ? ORDER BY m.joined_at`).all(c.id);
  res.json({
    community: communityDto(c, req.user.id),
    channels: channels.map(channelDto),
    categories: categories.map(x => ({ id: x.id, name: x.name, position: x.position })),
    members: members.map(m => ({ user: { id: m.id, username: m.username, displayName: m.display_name || m.username, avatarUrl: m.avatar_url, bio: m.bio }, role: m.role, nickname: m.nickname, joinedAt: m.joined_at })),
  });
}));

communitiesRouter.patch('/:cid', wrap(async (req, res) => {
  requirePerm(req.params.cid, req.user.id, 'manage_community');
  const b = req.body || {};
  if (b.name !== undefined) db.prepare('UPDATE communities SET name = ? WHERE id = ?').run(str(b.name, { max: 100 }), req.params.cid);
  if (b.description !== undefined) db.prepare('UPDATE communities SET description = ? WHERE id = ?').run(str(b.description, { min: 0, max: 500 }), req.params.cid);
  if (b.iconUrl !== undefined) db.prepare('UPDATE communities SET icon_url = ? WHERE id = ?').run(typeof b.iconUrl === 'string' && b.iconUrl.length < 512 ? b.iconUrl : null, req.params.cid);
  audit(req.params.cid, req.user.id, 'community_update', req.params.cid, { fields: Object.keys(b) });
  broadcastToCommunity(req.params.cid, 'COMMUNITY_UPDATE', {});
  res.json({ ok: true });
}));

communitiesRouter.delete('/:cid', wrap(async (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id = ?').get(req.params.cid);
  if (!c) throw notFound('Comunidade não encontrada');
  if (c.owner_id !== req.user.id) throw forbidden('Apenas o dono pode excluir');
  audit(req.params.cid, req.user.id, 'community_delete', req.params.cid);
  const members = communityMemberIds(req.params.cid);
  db.prepare('DELETE FROM communities WHERE id = ?').run(req.params.cid);
  sendToUsers(members, 'COMMUNITY_DELETE', { communityId: req.params.cid });
  res.json({ ok: true });
}));

// ---- Invites / join / leave ----

communitiesRouter.post('/:cid/invites', wrap(async (req, res) => {
  requirePerm(req.params.cid, req.user.id, 'create_invite');
  const code = crypto.randomUUID().slice(0, 8);
  const maxUses = Number.isInteger(req.body?.maxUses) && req.body.maxUses > 0 ? req.body.maxUses : null;
  const ttlHours = Number.isFinite(req.body?.ttlHours) ? req.body.ttlHours : null;
  db.prepare('INSERT INTO invites (code, community_id, creator_id, max_uses, expires_at, created_at) VALUES (?,?,?,?,?,?)')
    .run(code, req.params.cid, req.user.id, maxUses, ttlHours ? now() + ttlHours * 3600_000 : null, now());
  res.status(201).json({ invite: { code, communityId: req.params.cid, maxUses, expiresAt: ttlHours ? now() + ttlHours * 3600_000 : null } });
}));

communitiesRouter.get('/:cid/invites', wrap(async (req, res) => {
  requirePerm(req.params.cid, req.user.id, 'manage_community');
  const rows = db.prepare('SELECT * FROM invites WHERE community_id = ? ORDER BY created_at DESC').all(req.params.cid);
  res.json({ invites: rows.map(i => ({ code: i.code, uses: i.uses, maxUses: i.max_uses, expiresAt: i.expires_at })) });
}));

communitiesRouter.delete('/:cid/invites/:code', wrap(async (req, res) => {
  requirePerm(req.params.cid, req.user.id, 'manage_community');
  db.prepare('DELETE FROM invites WHERE code = ? AND community_id = ?').run(req.params.code, req.params.cid);
  res.json({ ok: true });
}));

communitiesRouter.get('/invite/:code', wrap(async (req, res) => {
  const inv = db.prepare('SELECT * FROM invites WHERE code = ?').get(req.params.code);
  if (!inv) throw notFound('Convite inválido');
  const c = db.prepare('SELECT * FROM communities WHERE id = ?').get(inv.community_id);
  const count = db.prepare('SELECT COUNT(*) AS n FROM members WHERE community_id = ?').get(c.id).n;
  res.json({ invite: { code: inv.code, community: { id: c.id, name: c.name, iconUrl: c.icon_url, memberCount: count } } });
}));

communitiesRouter.post('/invite/:code/accept', wrap(async (req, res) => {
  const inv = db.prepare('SELECT * FROM invites WHERE code = ?').get(req.params.code);
  if (!inv || (inv.expires_at && inv.expires_at < now()) || (inv.max_uses && inv.uses >= inv.max_uses)) throw notFound('Convite inválido ou expirado');
  if (db.prepare('SELECT 1 FROM bans WHERE community_id = ? AND user_id = ?').get(inv.community_id, req.user.id)) throw forbidden('Você está banido desta comunidade');
  if (getMember(inv.community_id, req.user.id)) throw conflict('Você já é membro');
  db.prepare("INSERT INTO members (community_id, user_id, role, joined_at) VALUES (?,?, 'member', ?)").run(inv.community_id, req.user.id, now());
  db.prepare('UPDATE invites SET uses = uses + 1 WHERE code = ?').run(req.params.code);
  audit(inv.community_id, req.user.id, 'member_join', req.user.id, { via: 'invite' });
  broadcastToCommunity(inv.community_id, 'MEMBER_JOIN', { communityId: inv.community_id, user: publicUser(req.user) });
  res.json({ ok: true, communityId: inv.community_id });
}));

communitiesRouter.post('/:cid/leave', wrap(async (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id = ?').get(req.params.cid);
  const member = requireMember(req.params.cid, req.user.id);
  if (member.role === 'owner') throw bad('O dono não pode sair; exclua ou transfira a comunidade');
  db.prepare('DELETE FROM members WHERE community_id = ? AND user_id = ?').run(req.params.cid, req.user.id);
  audit(req.params.cid, req.user.id, 'member_leave', req.user.id);
  broadcastToCommunity(req.params.cid, 'MEMBER_LEAVE', { communityId: req.params.cid, userId: req.user.id });
  res.json({ ok: true });
}));

// ---- Members ----

communitiesRouter.post('/:cid/members/:uid/kick', wrap(async (req, res) => {
  requirePerm(req.params.cid, req.user.id, 'kick_members');
  const actor = getMember(req.params.cid, req.user.id);
  const target = getMember(req.params.cid, req.params.uid);
  if (!target) throw notFound('Membro não encontrado');
  if (!canActOn(actor.role, target.role)) throw forbidden('Não é possível expulsar cargo igual ou superior');
  db.prepare('DELETE FROM members WHERE community_id = ? AND user_id = ?').run(req.params.cid, req.params.uid);
  audit(req.params.cid, req.user.id, 'member_kick', req.params.uid);
  broadcastToCommunity(req.params.cid, 'MEMBER_LEAVE', { communityId: req.params.cid, userId: req.params.uid });
  res.json({ ok: true });
}));

communitiesRouter.post('/:cid/members/:uid/ban', wrap(async (req, res) => {
  requirePerm(req.params.cid, req.user.id, 'ban_members');
  const actor = getMember(req.params.cid, req.user.id);
  const target = getMember(req.params.cid, req.params.uid);
  if (target && !canActOn(actor.role, target.role)) throw forbidden();
  db.prepare('INSERT OR REPLACE INTO bans (community_id, user_id, reason, created_at) VALUES (?,?,?,?)')
    .run(req.params.cid, req.params.uid, str(req.body?.reason ?? '', { min: 0, max: 500 }) || null, now());
  db.prepare('DELETE FROM members WHERE community_id = ? AND user_id = ?').run(req.params.cid, req.params.uid);
  audit(req.params.cid, req.user.id, 'member_ban', req.params.uid);
  broadcastToCommunity(req.params.cid, 'MEMBER_LEAVE', { communityId: req.params.cid, userId: req.params.uid });
  sendTo(req.params.uid, 'COMMUNITY_DELETE', { communityId: req.params.cid });
  res.json({ ok: true });
}));

communitiesRouter.delete('/:cid/bans/:uid', wrap(async (req, res) => {
  requirePerm(req.params.cid, req.user.id, 'ban_members');
  db.prepare('DELETE FROM bans WHERE community_id = ? AND user_id = ?').run(req.params.cid, req.params.uid);
  audit(req.params.cid, req.user.id, 'member_unban', req.params.uid);
  res.json({ ok: true });
}));

communitiesRouter.get('/:cid/bans', wrap(async (req, res) => {
  requirePerm(req.params.cid, req.user.id, 'ban_members');
  const rows = db.prepare('SELECT b.*, u.username, u.display_name FROM bans b JOIN users u ON u.id = b.user_id WHERE b.community_id = ?').all(req.params.cid);
  res.json({ bans: rows.map(r => ({ userId: r.user_id, username: r.username, reason: r.reason, createdAt: r.created_at })) });
}));

communitiesRouter.patch('/:cid/members/:uid', wrap(async (req, res) => {
  const actor = requirePerm(req.params.cid, req.user.id, 'manage_roles');
  const target = getMember(req.params.cid, req.params.uid);
  if (!target) throw notFound('Membro não encontrado');
  const role = req.body?.role;
  if (!['admin', 'moderator', 'member'].includes(role)) throw bad('Cargo inválido');
  if (target.role === 'owner') throw forbidden('Não é possível alterar o dono');
  db.prepare('UPDATE members SET role = ? WHERE community_id = ? AND user_id = ?').run(role, req.params.cid, req.params.uid);
  audit(req.params.cid, req.user.id, 'member_role_change', req.params.uid, { role });
  broadcastToCommunity(req.params.cid, 'COMMUNITY_UPDATE', {});
  res.json({ ok: true });
}));

// ---- Categories & channels ----

communitiesRouter.post('/:cid/categories', wrap(async (req, res) => {
  requirePerm(req.params.cid, req.user.id, 'manage_channels');
  const name = str(req.body?.name, { max: 64 });
  const pos = (db.prepare('SELECT COALESCE(MAX(position),0)+1 AS p FROM categories WHERE community_id = ?').get(req.params.cid)).p;
  const cid2 = id();
  db.prepare('INSERT INTO categories (id, community_id, name, position) VALUES (?,?,?,?)').run(cid2, req.params.cid, name, pos);
  broadcastToCommunity(req.params.cid, 'COMMUNITY_UPDATE', {});
  res.status(201).json({ category: { id: cid2, name, position: pos } });
}));

communitiesRouter.delete('/:cid/categories/:catId', wrap(async (req, res) => {
  requirePerm(req.params.cid, req.user.id, 'manage_channels');
  db.prepare('DELETE FROM categories WHERE id = ? AND community_id = ?').run(req.params.catId, req.params.cid);
  broadcastToCommunity(req.params.cid, 'COMMUNITY_UPDATE', {});
  res.json({ ok: true });
}));

communitiesRouter.post('/:cid/channels', wrap(async (req, res) => {
  requirePerm(req.params.cid, req.user.id, 'manage_channels');
  const name = str(req.body?.name, { max: 64 }).toLowerCase().replace(/\s+/g, '-');
  const type = req.body?.type === 'voice' ? 'voice' : 'text';
  const catId = req.body?.categoryId ?? null;
  const pos = (db.prepare('SELECT COALESCE(MAX(position),0)+1 AS p FROM channels WHERE community_id = ?').get(req.params.cid)).p;
  const chId = id();
  db.prepare('INSERT INTO channels (id, community_id, category_id, name, type, position, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(chId, req.params.cid, catId, name, type, pos, now());
  audit(req.params.cid, req.user.id, 'channel_create', chId, { name, type });
  const ch = db.prepare('SELECT * FROM channels WHERE id = ?').get(chId);
  broadcastToCommunity(req.params.cid, 'CHANNEL_CREATE', { channel: channelDto(ch) });
  res.status(201).json({ channel: channelDto(ch) });
}));

communitiesRouter.patch('/:cid/channels/:chId', wrap(async (req, res) => {
  requirePerm(req.params.cid, req.user.id, 'manage_channels');
  const ch = db.prepare('SELECT * FROM channels WHERE id = ? AND community_id = ?').get(req.params.chId, req.params.cid);
  if (!ch) throw notFound('Canal não encontrado');
  const b = req.body || {};
  if (b.name !== undefined) db.prepare('UPDATE channels SET name = ? WHERE id = ?').run(str(b.name, { max: 64 }).toLowerCase(), ch.id);
  if (b.topic !== undefined) db.prepare('UPDATE channels SET topic = ? WHERE id = ?').run(str(b.topic, { min: 0, max: 512 }), ch.id);
  if (b.categoryId !== undefined) db.prepare('UPDATE channels SET category_id = ? WHERE id = ?').run(b.categoryId, ch.id);
  if (b.position !== undefined) db.prepare('UPDATE channels SET position = ? WHERE id = ?').run(Number(b.position) || 0, ch.id);
  if (b.slowmodeSeconds !== undefined) db.prepare('UPDATE channels SET slowmode_seconds = ? WHERE id = ?').run(Math.max(0, Math.min(21600, Number(b.slowmodeSeconds) || 0)), ch.id);
  broadcastToCommunity(req.params.cid, 'COMMUNITY_UPDATE', {});
  res.json({ ok: true });
}));

communitiesRouter.delete('/:cid/channels/:chId', wrap(async (req, res) => {
  requirePerm(req.params.cid, req.user.id, 'manage_channels');
  const ch = db.prepare('SELECT * FROM channels WHERE id = ? AND community_id = ?').get(req.params.chId, req.params.cid);
  if (!ch) throw notFound('Canal não encontrado');
  db.prepare('DELETE FROM channels WHERE id = ?').run(ch.id);
  audit(req.params.cid, req.user.id, 'channel_delete', ch.id, { name: ch.name });
  broadcastToCommunity(req.params.cid, 'CHANNEL_DELETE', { channelId: ch.id, communityId: req.params.cid });
  res.json({ ok: true });
}));

// ---- Audit log ----

communitiesRouter.get('/:cid/audit-log', wrap(async (req, res) => {
  requirePerm(req.params.cid, req.user.id, 'view_audit_log');
  const rows = db.prepare(`SELECT a.*, u.username FROM audit_log a JOIN users u ON u.id = a.actor_id
    WHERE a.community_id = ? ORDER BY a.created_at DESC LIMIT 100`).all(req.params.cid);
  res.json({ entries: rows.map(r => ({ id: r.id, actor: r.username, action: r.action, targetId: r.target_id, meta: r.meta ? JSON.parse(r.meta) : null, createdAt: r.created_at })) });
}));
