import { WebSocketServer } from 'ws';
import { db, now } from './db.js';
import { userFromToken, SESSION_COOKIE } from './auth.js';
import { channelContext, channelMemberIds } from './permissions.js';
import { publicUser } from './util.js';

// userId -> Set<ws>
const sockets = new Map();
// ws -> { userId }
const meta = new Map();
// voice channelId -> Map(userId -> {muted, deafened, video, screen})
export const voiceStates = new Map();
// userId -> manual presence override ('online'|'idle'|'dnd'|'invisible')
const manualPresence = new Map();

export function effectivePresence(userId) {
  const manual = manualPresence.get(userId);
  if (manual === 'invisible') return 'offline';
  if (manual && sockets.has(userId)) return manual;
  if (manual) return 'offline';
  return sockets.has(userId) ? 'online' : 'offline';
}

export function sendTo(userId, type, data) {
  const set = sockets.get(userId);
  if (!set) return;
  const payload = JSON.stringify({ t: type, d: data });
  for (const ws of set) if (ws.readyState === 1) ws.send(payload);
}

export function sendToUsers(userIds, type, data) {
  for (const uid of new Set(userIds)) sendTo(uid, type, data);
}

export function broadcastToChannel(channelId, type, data) {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
  if (!channel) return;
  sendToUsers(channelMemberIds(channel), type, data);
}

export function broadcastToCommunity(communityId, type, data) {
  const ids = db.prepare('SELECT user_id FROM members WHERE community_id = ?').all(communityId).map(r => r.user_id);
  sendToUsers(ids, type, data);
}

// Users who should receive presence updates for this user: friends + community co-members
export function relatedUserIds(userId) {
  const ids = new Set();
  for (const r of db.prepare('SELECT other_id FROM friendships WHERE user_id = ? UNION SELECT user_id FROM friendships WHERE other_id = ?').all(userId, userId)) ids.add(r.other_id);
  for (const r of db.prepare('SELECT community_id FROM members WHERE user_id = ?').all(userId)) {
    for (const m of db.prepare('SELECT user_id FROM members WHERE community_id = ?').all(r.community_id)) ids.add(m.user_id);
  }
  for (const r of db.prepare('SELECT channel_id FROM dm_members WHERE user_id = ?').all(userId)) {
    for (const m of db.prepare('SELECT user_id FROM dm_members WHERE channel_id = ?').all(r.channel_id)) ids.add(m.user_id);
  }
  ids.delete(userId);
  return [...ids];
}

export function broadcastPresence(userId) {
  const presence = effectivePresence(userId);
  sendToUsers(relatedUserIds(userId), 'PRESENCE_UPDATE', { userId, presence });
}

function addSocket(userId, ws) {
  let set = sockets.get(userId);
  if (!set) { set = new Set(); sockets.set(userId, set); }
  set.add(ws);
  if (set.size === 1) broadcastPresence(userId);
}

function removeSocket(userId, ws) {
  const set = sockets.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) {
    sockets.delete(userId);
    leaveAllVoice(userId);
    broadcastPresence(userId);
  }
}

export function joinVoice(userId, channelId, state = {}) {
  const { channel } = channelContext(channelId, userId); // validates access
  if (['dm', 'group_dm'].includes(channel.type)) throw Object.assign(new Error('Não é canal de voz'), { status: 400 });
  leaveAllVoice(userId);
  let room = voiceStates.get(channelId);
  if (!room) { room = new Map(); voiceStates.set(channelId, room); }
  room.set(userId, { muted: false, deafened: false, video: false, screen: false, joinedAt: now(), ...state });
  const snapshot = voiceSnapshot(channelId);
  broadcastToChannel(channelId, 'VOICE_STATE', { channelId, members: snapshot });
  return snapshot;
}

export function updateVoiceState(userId, channelId, patch) {
  const room = voiceStates.get(channelId);
  if (!room?.has(userId)) return;
  Object.assign(room.get(userId), patch);
  broadcastToChannel(channelId, 'VOICE_STATE', { channelId, members: voiceSnapshot(channelId) });
}

export function leaveVoice(userId, channelId) {
  const room = voiceStates.get(channelId);
  if (!room?.has(userId)) return;
  room.delete(userId);
  if (room.size === 0) voiceStates.delete(channelId);
  broadcastToChannel(channelId, 'VOICE_STATE', { channelId, members: voiceSnapshot(channelId) });
}

export function leaveAllVoice(userId) {
  for (const [chId, room] of [...voiceStates]) {
    if (room.has(userId)) leaveVoice(userId, chId);
  }
}

export function voiceSnapshot(channelId) {
  const room = voiceStates.get(channelId);
  if (!room) return [];
  return [...room].map(([userId, s]) => ({ userId, ...s }));
}

export function setManualPresence(userId, presence) {
  if (!['online', 'idle', 'dnd', 'invisible'].includes(presence)) presence = 'online';
  manualPresence.set(userId, presence);
  db.prepare('UPDATE users SET presence = ? WHERE id = ?').run(presence === 'invisible' ? 'offline' : presence, userId);
  broadcastPresence(userId);
}

export function initRealtime(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Auth: token in query (?token=) or session cookie
    const url = new URL(req.url, 'http://localhost');
    const cookieToken = (req.headers.cookie || '').split(';').map(s => s.trim().split('='))
      .find(([k]) => k === SESSION_COOKIE)?.[1];
    const user = userFromToken(url.searchParams.get('token') || cookieToken);
    if (!user) { ws.close(4401, 'unauthorized'); return; }

    meta.set(ws, { userId: user.id });
    addSocket(user.id, ws);

    const manual = manualPresence.get(user.id) || user.presence;
    ws.send(JSON.stringify({
      t: 'READY',
      d: {
        user: publicUser(user),
        presence: manual,
        voice: Object.fromEntries([...voiceStates].map(([ch, room]) => [ch, voiceSnapshot(ch)])),
      },
    }));

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      const { t, d } = msg || {};
      try {
        switch (t) {
          case 'PRESENCE_SET': setManualPresence(user.id, d?.presence); break;
          case 'TYPING': {
            const { channel } = channelContext(d?.channelId, user.id);
            const ids = channelMemberIds(channel).filter(i => i !== user.id);
            sendToUsers(ids, 'TYPING', { channelId: channel.id, userId: user.id });
            break;
          }
          case 'VOICE_JOIN': joinVoice(user.id, d?.channelId, d?.state); break;
          case 'VOICE_LEAVE': if (d?.channelId) leaveVoice(user.id, d.channelId); else leaveAllVoice(user.id); break;
          case 'VOICE_UPDATE': updateVoiceState(user.id, d?.channelId, d?.state || {}); break;
          case 'SIGNAL': {
            // WebRTC signaling relay: only between users sharing a voice channel
            const to = d?.to, chId = d?.channelId;
            const room = voiceStates.get(chId);
            if (room?.has(user.id) && room?.has(to)) {
              sendTo(to, 'SIGNAL', { channelId: chId, from: user.id, data: d.data });
            }
            break;
          }
          case 'DM_CALL_SIGNAL': {
            // signaling for direct calls: both users must share a dm channel
            const to = d?.to, chId = d?.channelId;
            const ch = db.prepare('SELECT * FROM channels WHERE id = ?').get(chId);
            if (ch && (ch.type === 'dm' || ch.type === 'group_dm')) {
              const me = db.prepare('SELECT 1 FROM dm_members WHERE channel_id=? AND user_id=?').get(chId, user.id);
              const other = db.prepare('SELECT 1 FROM dm_members WHERE channel_id=? AND user_id=?').get(chId, to);
              if (me && other) sendTo(to, 'DM_CALL_SIGNAL', { channelId: chId, from: user.id, data: d.data });
            }
            break;
          }
        }
      } catch (e) {
        ws.send(JSON.stringify({ t: 'ERROR', d: { op: t, message: e.message } }));
      }
    });

    ws.on('close', () => { meta.delete(ws); removeSocket(user.id, ws); });
    ws.on('error', () => ws.close());
  });

  return wss;
}
