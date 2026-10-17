import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Load .env if present (no dotenv dependency)
const envFile = join(process.cwd(), '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const root = process.cwd();

export const config = {
  appName: process.env.APP_NAME || 'Prosa',
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '0.0.0.0',
  dataDir: process.env.DATA_DIR || join(root, 'data'),
  uploadDir: process.env.UPLOAD_DIR || join(root, 'data', 'uploads'),
  webDist: resolve(root, process.env.WEB_DIST || join(root, 'web', 'dist')),
  env: process.env.NODE_ENV || 'development',
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 30),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 25),
  // JSON array of RTCIceServer objects, e.g. '[{"urls":"stun:stun.l.google.com:19302"}]'
  iceServers: (() => {
    try { return JSON.parse(process.env.ICE_SERVERS_JSON || '[]'); }
    catch { return []; }
  })(),
  // SMTP (optional) — without it, password-reset tokens are logged to the server console in dev
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  },
};
