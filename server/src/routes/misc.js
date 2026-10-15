import { Router } from 'express';
import multer from 'multer';
import { join, extname } from 'node:path';
import { db, now, id } from '../db.js';
import { config } from '../config.js';
import { wrap, str, bad, notFound, forbidden, publicUser } from '../util.js';
import { requireAuth, getSessionUser } from '../auth.js';
import { channelContext } from '../permissions.js';
import { voiceSnapshot } from '../realtime.js';

export const miscRouter = Router();

// ---- Public config (app identity, ICE servers) ----
miscRouter.get('/config', wrap(async (_req, res) => {
  res.json({
    name: config.appName,
    iceServers: config.iceServers.length ? config.iceServers : [{ urls: 'stun:stun.l.google.com:19302' }],
    maxUploadMb: config.maxUploadMb,
  });
}));

// ---- Voice channel state ----
miscRouter.get('/channels/:chId/voice', requireAuth, wrap(async (req, res) => {
  const { channel } = channelContext(req.params.chId, req.user.id);
  res.json({ channelId: channel.id, members: voiceSnapshot(channel.id) });
}));

// ---- Uploads ----
const ALLOWED_MIME = /^(image\/(png|jpe?g|gif|webp)|video\/(mp4|webm|quicktime)|audio\/(mpeg|ogg|wav|mp4|webm)|application\/(pdf|zip|x-zip-compressed|msword|vnd\.openxmlformats[\w.-]*)|text\/(plain|csv|markdown))$/;

const upload = multer({
  dest: config.uploadDir,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.test(file.mimetype)) return cb(new Error('Tipo de arquivo não permitido'));
    cb(null, true);
  },
});

miscRouter.post('/uploads', requireAuth, upload.array('files', 10), wrap(async (req, res) => {
  const files = (req.files || []).map(f => ({
    url: `/uploads/${f.filename}${extname(f.originalname) || ''}`,
    filename: f.originalname.slice(0, 255),
    mime: f.mimetype,
    size: f.size,
    _tmp: f.filename,
  }));
  // multer writes extensionless temp files; rename to include extension for correct serving
  const fs = await import('node:fs');
  const out = files.map(f => {
    const finalName = f.url.split('/').pop();
    fs.renameSync(join(config.uploadDir, f._tmp), join(config.uploadDir, finalName));
    return { url: f.url, filename: f.filename, mime: f.mime, size: f.size };
  });
  res.status(201).json({ files: out });
}));

// ---- Search ----
miscRouter.get('/search', requireAuth, wrap(async (req, res) => {
  const q = str(req.query.q ?? '', { min: 2, max: 100, name: 'busca' });
  const scope = req.query.channelId ? String(req.query.channelId) : null;
  const like = `%${q.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
  const out = { messages: [], users: [], communities: [] };

  if (scope) {
    const { channel } = channelContext(scope, req.user.id);
    const rows = db.prepare(`SELECT * FROM messages WHERE channel_id = ? AND deleted = 0 AND content LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 50`).all(channel.id, like);
    out.messages = rows.map(m => ({ id: m.id, channelId: m.channel_id, content: m.content, createdAt: m.created_at, authorId: m.author_id }));
  } else {
    // messages only from channels the user can access
    const rows = db.prepare(`SELECT m.* FROM messages m
      JOIN channels c ON c.id = m.channel_id
      WHERE m.deleted = 0 AND m.content LIKE ? ESCAPE '\\'
      AND (
        (c.type IN ('dm','group_dm') AND EXISTS (SELECT 1 FROM dm_members d WHERE d.channel_id = c.id AND d.user_id = ?))
        OR (c.community_id IS NOT NULL AND EXISTS (SELECT 1 FROM members mb WHERE mb.community_id = c.community_id AND mb.user_id = ?))
      )
      ORDER BY m.created_at DESC LIMIT 50`).all(like, req.user.id, req.user.id);
    out.messages = rows.map(m => ({ id: m.id, channelId: m.channel_id, content: m.content, createdAt: m.created_at, authorId: m.author_id }));
  }

  out.users = db.prepare(`SELECT id, username, display_name, avatar_url FROM users WHERE (username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\') AND suspended = 0 LIMIT 20`)
    .all(like, like).map(u => ({ id: u.id, username: u.username, displayName: u.display_name || u.username, avatarUrl: u.avatar_url }));
  out.communities = db.prepare(`SELECT c.id, c.name, c.icon_url FROM communities c JOIN members mb ON mb.community_id = c.id WHERE mb.user_id = ? AND c.name LIKE ? ESCAPE '\\' LIMIT 20`)
    .all(req.user.id, like).map(c => ({ id: c.id, name: c.name, iconUrl: c.icon_url }));
  res.json(out);
}));

// ---- Reports ----
miscRouter.post('/reports', requireAuth, wrap(async (req, res) => {
  const targetType = str(req.body?.targetType, { max: 20 });
  if (!['user', 'message', 'community'].includes(targetType)) throw bad('Tipo inválido');
  const targetId = str(req.body?.targetId, { max: 64 });
  const reason = str(req.body?.reason, { max: 1000 });
  db.prepare('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, created_at) VALUES (?,?,?,?,?,?)')
    .run(id(), req.user.id, targetType, targetId, reason, now());
  res.status(201).json({ ok: true });
}));
