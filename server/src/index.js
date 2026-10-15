import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import { db, migrate } from './db.js';
import { authRouter, requireAuth, cookieParser, getSessionUser } from './auth.js';
import { usersRouter } from './routes/users.js';
import { communitiesRouter } from './routes/communities.js';
import { messagesRouter } from './routes/messages.js';
import { dmsRouter } from './routes/dms.js';
import { miscRouter } from './routes/misc.js';
import { adminRouter } from './routes/admin.js';
import { initRealtime } from './realtime.js';
import { ApiError } from './util.js';

migrate();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use('/api/auth', authRouter);
app.use('/api', miscRouter); // /config é público; rotas protegidas usam requireAuth internamente
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/communities', requireAuth, communitiesRouter);
app.use('/api/dms', requireAuth, dmsRouter);
app.use('/api/admin', requireAuth, adminRouter);
app.use('/api', requireAuth, messagesRouter);

// uploaded files — authenticated
app.use('/uploads', (req, res, next) => {
  if (!getSessionUser(req)) return res.status(401).end();
  next();
}, express.static(config.uploadDir, { fallthrough: false, maxAge: '7d' }));

// frontend build + SPA fallback
if (existsSync(config.webDist)) {
  app.use(express.static(config.webDist));
  app.get(/^(?!\/(api|ws|uploads)).*/, (_req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
}

app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof ApiError) return res.status(err.status).json({ error: err.code, message: err.message });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: 'Payload muito grande' });
  if (err?.name === 'MulterError') return res.status(400).json({ error: 'upload_error', message: err.message });
  console.error(err);
  res.status(500).json({ error: 'internal', message: 'Erro interno' });
});

const server = http.createServer(app);
initRealtime(server);

server.listen(config.port, config.host, () => {
  console.log(`[${config.appName}] API+web em http://${config.host}:${config.port} (${config.env})`);
});

export { app, server };
