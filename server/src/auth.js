import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, now, id } from './db.js';
import { config } from './config.js';
import { ApiError, bad, unauthorized, conflict, publicUser, str, wrap, requireRateLimit } from './util.js';

export const SESSION_COOKIE = 'prosa_session';

export function createSession(userId) {
  const token = crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '');
  const expires = now() + config.sessionTtlDays * 86400_000;
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)').run(token, userId, now(), expires);
  return { token, expires };
}

export function setSessionCookie(res, token, expires) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.env === 'production',
    expires: new Date(expires),
    path: '/',
  });
}

export function userFromToken(token) {
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!s || s.expires_at < now()) return null;
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(s.user_id);
  if (!u || u.suspended) return null;
  return u;
}

export function getSessionUser(req) {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
  return userFromToken(bearer || req.cookies?.[SESSION_COOKIE]);
}

export function requireAuth(req, _res, next) {
  const u = getSessionUser(req);
  if (!u) return next(unauthorized());
  req.user = u;
  next();
}

function parseCookies(req, _res, next) {
  const raw = req.headers.cookie || '';
  req.cookies = Object.fromEntries(raw.split(';').map(p => p.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
  next();
}

export function cookieParser() { return parseCookies; }

const USERNAME_RE = /^[a-z0-9_.]{3,32}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const authRouter = Router();

authRouter.post('/register', wrap(async (req, res) => {
  requireRateLimit(`register:${req.ip}`, 10, 60_000);
  const username = str(req.body?.username, { min: 3, max: 32, name: 'usuário' });
  if (!USERNAME_RE.test(username)) throw bad('Usuário deve ter 3-32 caracteres (letras, números, _ .)');
  const email = str(req.body?.email, { max: 254, name: 'email' }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw bad('Email inválido');
  const password = req.body?.password;
  if (typeof password !== 'string' || password.length < 8) throw bad('Senha deve ter no mínimo 8 caracteres');

  const uid = id();
  try {
    db.prepare('INSERT INTO users (id, username, email, password_hash, display_name, created_at) VALUES (?,?,?,?,?,?)')
      .run(uid, username, email, bcrypt.hashSync(password, 10), username, now());
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw conflict('Usuário ou email já cadastrado');
    throw e;
  }
  const { token, expires } = createSession(uid);
  setSessionCookie(res, token, expires);
  res.status(201).json({ user: publicUser(getUserSafe(uid)), token });
}));

function getUserSafe(uid) { return db.prepare('SELECT * FROM users WHERE id=?').get(uid); }

authRouter.post('/login', wrap(async (req, res) => {
  requireRateLimit(`login:${req.ip}`, 10, 60_000, 'Muitas tentativas de login');
  const login = str(req.body?.login, { max: 254, name: 'login' });
  const password = String(req.body?.password || '');
  const u = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(login, login.toLowerCase());
  if (!u || u.suspended || !bcrypt.compareSync(password, u.password_hash)) throw unauthorized('Credenciais inválidas');
  const { token, expires } = createSession(u.id);
  setSessionCookie(res, token, expires);
  res.json({ user: publicUser(u), token });
}));

authRouter.post('/logout', wrap(async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
}));

authRouter.post('/password/request', wrap(async (req, res) => {
  requireRateLimit(`pwreset:${req.ip}`, 5, 300_000);
  const email = str(req.body?.email, { max: 254 }).toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  // Always return ok to avoid account enumeration
  if (u) {
    const raw = crypto.randomUUID();
    const hash = bcrypt.hashSync(raw, 8);
    db.prepare('INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at) VALUES (?,?,?,?,?)')
      .run(id(), u.id, hash, now() + 3600_000, now());
    // TODO: send via SMTP when configured. In dev the token is logged server-side.
    console.log(`[password-reset] ${u.username}: ${raw}`);
    if (config.env !== 'production') return res.json({ ok: true, devResetToken: raw, username: u.username });
  }
  res.json({ ok: true });
}));

authRouter.post('/password/confirm', wrap(async (req, res) => {
  const token = str(req.body?.token, { max: 128 });
  const password = String(req.body?.password || '');
  if (password.length < 8) throw bad('Senha deve ter no mínimo 8 caracteres');
  const rows = db.prepare('SELECT * FROM password_resets WHERE used = 0 AND expires_at > ?').all(now());
  const row = rows.find(r => bcrypt.compareSync(token, r.token_hash));
  if (!row) throw bad('Token inválido ou expirado');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), row.user_id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(row.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
  res.json({ ok: true });
}));

export { ApiError };
