import { reactive } from 'vue';
import { api, getToken, setToken, uploadFiles, wsBase } from './api.js';

export { api, uploadFiles, getToken, setToken, fullUrl } from './api.js';

export const store = reactive({
  appName: 'Prosa',
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  user: null,
  ready: false,
  wsConnected: false,
  communities: [],
  currentCommunity: null,
  channels: [],
  categories: [],
  members: [],
  activeChannelId: null,
  messages: {},        // channelId -> array
  typing: {},          // channelId -> {userId: ts}
  dms: [],
  relationships: [],
  presences: {},       // userId -> 'online'|...
  voice: {},           // channelId -> [{userId, muted,...}]
  notifications: [],
  theme: localStorage.getItem('prosa_theme') || 'dark',
  mobileNav: 'channels', // 'rail'|'channels'|'chat' for responsive
});

// ---------- WS ----------
let ws = null;
let wsRetry = 0;
const handlers = {};

export function onWs(type, fn) { (handlers[type] ||= []).push(fn); }

export function wsSend(t, d) {
  if (ws?.readyState === 1) ws.send(JSON.stringify({ t, d }));
}

export function connectWs() {
  if (!getToken()) return;
  ws = new WebSocket(`${wsBase()}/ws?token=${getToken()}`);
  ws.onopen = () => { store.wsConnected = true; wsRetry = 0; };
  ws.onclose = () => {
    store.wsConnected = false;
    ws = null;
    if (store.user) setTimeout(connectWs, Math.min(15000, 500 * ++wsRetry));
  };
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    dispatch(m.t, m.d);
    for (const fn of handlers[m.t] || []) fn(m.d);
  };
}

function dispatch(t, d) {
  switch (t) {
    case 'READY':
      store.user = { ...store.user, ...d.user };
      break;
    case 'MESSAGE_CREATE': {
      const list = store.messages[d.message.channelId] ||= [];
      if (!list.some(m => m.id === d.message.id)) list.push(d.message);
      break;
    }
    case 'MESSAGE_UPDATE': {
      const list = store.messages[d.message.channelId];
      if (list) { const i = list.findIndex(m => m.id === d.message.id); if (i >= 0) list[i] = d.message; }
      break;
    }
    case 'MESSAGE_DELETE': {
      const list = store.messages[d.channelId];
      if (list) store.messages[d.channelId] = list.filter(m => m.id !== d.messageId);
      break;
    }
    case 'PRESENCE_UPDATE': store.presences[d.userId] = d.presence; break;
    case 'TYPING': {
      const tmap = store.typing[d.channelId] ||= {};
      tmap[d.userId] = Date.now();
      break;
    }
    case 'VOICE_STATE': store.voice[d.channelId] = d.members; break;
    case 'CHANNEL_CREATE':
      if (store.currentCommunity?.id === d.channel.communityId) store.channels.push(d.channel);
      break;
    case 'CHANNEL_DELETE':
      store.channels = store.channels.filter(c => c.id !== d.channelId);
      break;
    case 'COMMUNITY_UPDATE': if (store.currentCommunity) loadCommunity(store.currentCommunity.id); break;
    case 'COMMUNITY_DELETE':
      store.communities = store.communities.filter(c => c.id !== d.communityId);
      if (store.currentCommunity?.id === d.communityId) { store.currentCommunity = null; store.channels = []; }
      break;
    case 'MEMBER_JOIN': case 'MEMBER_LEAVE':
      if (store.currentCommunity) loadCommunity(store.currentCommunity.id);
      break;
    case 'DM_CREATE': loadDms(); break;
    case 'RELATIONSHIP_UPDATE': loadRelationships(); break;
    case 'NOTIFY': {
      store.notifications.push({ ...d, at: Date.now() });
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(`${store.appName} — menção`, { body: `${d.message.author.username}: ${d.message.content.slice(0, 120)}` });
      }
      break;
    }
  }
}

// ---------- API actions ----------

export async function bootstrap() {
  const cfg = await api('/config');
  store.appName = cfg.name;
  store.iceServers = cfg.iceServers;
  document.title = cfg.name;
  if (!getToken()) { store.ready = true; return; }
  try {
    const me = await api('/users/@me');
    store.user = me.user;
    connectWs();
    await Promise.all([loadCommunities(), loadDms(), loadRelationships(), loadPresences()]);
  } catch (e) {
    if (e.status === 401) setToken('');
  }
  store.ready = true;
}

export async function login(login_, password) {
  const r = await api('/auth/login', { method: 'POST', body: { login: login_, password } });
  setToken(r.token);
  store.user = r.user;
  connectWs();
  await Promise.all([loadCommunities(), loadDms(), loadRelationships(), loadPresences()]);
}

export async function register(username, email, password) {
  const r = await api('/auth/register', { method: 'POST', body: { username, email, password } });
  setToken(r.token);
  store.user = r.user;
  connectWs();
  await Promise.all([loadCommunities(), loadDms(), loadRelationships()]);
}

export async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch {}
  setToken('');
  ws?.close();
  store.user = null; store.communities = []; store.dms = []; store.messages = {};
}

export async function loadCommunities() {
  const r = await api('/communities');
  store.communities = r.communities;
}

export async function loadCommunity(cid) {
  const r = await api(`/communities/${cid}`);
  store.currentCommunity = r.community;
  store.channels = r.channels;
  store.categories = r.categories;
  store.members = r.members;
  loadPresences();
}

export async function selectCommunity(c) {
  await loadCommunity(c.id);
  const firstText = store.channels.find(ch => ch.type === 'text');
  if (firstText) await openChannel(firstText.id);
}

export async function loadDms() {
  const r = await api('/dms');
  store.dms = r.dms;
}

export async function loadRelationships() {
  const r = await api('/users/@me/relationships');
  store.relationships = r.relationships;
}

export async function loadPresences() {
  try {
    const r = await api('/users/@me/presences');
    Object.assign(store.presences, r.presences);
  } catch {}
}

export async function openChannel(channelId) {
  store.activeChannelId = channelId;
  if (!store.messages[channelId]) {
    const r = await api(`/channels/${channelId}/messages`);
    store.messages[channelId] = r.messages;
  }
  api(`/channels/${channelId}/read`, { method: 'POST', body: {} }).catch(() => {});
}

export async function sendMessage(channelId, content, { replyTo, files } = {}) {
  let attachments = [];
  if (files?.length) {
    const up = await uploadFiles(files);
    attachments = up.files;
  }
  await api(`/channels/${channelId}/messages`, { method: 'POST', body: { content, replyTo, attachments } });
}

export function presenceOf(userId) {
  return store.presences[userId] || 'offline';
}
