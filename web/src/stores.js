import { reactive } from 'vue';
import { getToken, setToken, wsBase } from './api.js';
import { configureRealtime, connectRealtime, closeRealtime } from './services/realtime.js';
import * as services from './services/index.js';
import { readyP2PIdentity } from './services/p2p/identity.js';
import { initP2PNode } from './services/p2p/node.js';

export { getToken, setToken, fullUrl } from './api.js';
export * as services from './services/index.js';

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
  mode: services.MODE,
  needsModePick: false,
  bootError: null,     // mensagem de falha no bootstrap (rede, P2P, etc.)
});

// ---------- toasts ----------
const NOTIFICATION_TTL = 6000;
const notificationTimers = new Map();

export function pushNotification(n) {
  const item = { ...n, at: Date.now() };
  store.notifications.push(item);
  notificationTimers.set(item, setTimeout(() => dismissNotification(item), NOTIFICATION_TTL));
}

export function dismissNotification(n) {
  const t = notificationTimers.get(n);
  if (t) { clearTimeout(t); notificationTimers.delete(n); }
  const i = store.notifications.indexOf(n);
  if (i >= 0) store.notifications.splice(i, 1);
}

// ---------- WS ----------
configureRealtime({
  getToken,
  wsBase,
  dispatch,
  onStateChange: (connected) => { store.wsConnected = connected; },
  canReconnect: () => !!store.user,
});

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
      pushNotification(d);
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(`${store.appName} — menção`, { body: `${d.message.author.username}: ${d.message.content.slice(0, 120)}` });
      }
      break;
    }
  }
}

// eventos vindos do nó P2P (domínio + controle)
async function dispatchP2P(t, d) {
  switch (t) {
    case 'space.event': {
      const env = d.env;
      const chId = env.body?.channelId || env.body?.channel?.id;
      if (env.type.startsWith('message.') || env.type === 'pin' || env.type === 'reaction') {
        const r = await services.messages.list(chId);
        store.messages[chId] = r.messages;
        if (env.type === 'message.send' && env.author !== store.user?.id) {
          pushNotification({ type: 'message', channelId: chId, message: { ...env.body.message, author: { id: env.author, username: env.author.slice(0, 12) } } });
        }
      } else if (env.type.startsWith('channel.') || env.type.startsWith('member.') || env.type === 'space.meta') {
        loadCommunities().catch(() => {});
        loadDms().catch(() => {});
        if (store.currentCommunity?.id === env.spaceId) loadCommunity(env.spaceId).catch(() => {});
      }
      break;
    }
    case 'presence': store.presences[d.peerId] = d.presence || 'online'; break;
    case 'peer.open': store.presences[d.peerId] = 'online'; break;
    case 'peer.closed': store.presences[d.peerId] = 'offline'; break;
    case 'contacts.changed': loadRelationships().catch(() => {}); break;
    case 'spaces.changed': loadDms().catch(() => {}); loadCommunities().catch(() => {}); break;
    case 'typing': {
      const tmap = store.typing[d.channelId] ||= {};
      tmap[d.peerId] = Date.now();
      break;
    }
    case 'sync.done': break;
  }
}

// ---------- API actions ----------

export async function bootstrap() {
  store.bootError = null;
  try {
    // modo não escolhido ainda: mostra seletor antes de qualquer bootstrap
    if (!services.chosenMode()) { store.needsModePick = true; return; }

    const cfg = await services.config.get();
    store.appName = cfg.name;
    store.iceServers = cfg.iceServers;
    document.title = cfg.name;

    if (services.MODE === 'p2p') {
      // identidade local por chave + nó P2P completo — sem token/servidor
      const ident = await readyP2PIdentity();
      store.user = ident.publicUser();
      await initP2PNode({ emitToStore: dispatchP2P });
      store.wsConnected = true; // nó local sempre "conectado"
      await Promise.all([loadCommunities(), loadDms(), loadRelationships(), loadPresences()]);
      return;
    }

    if (!getToken()) return;
    try {
      const me = await services.users.me();
      store.user = me.user;
      connectRealtime();
      await Promise.all([loadCommunities(), loadDms(), loadRelationships(), loadPresences()]);
    } catch (e) {
      if (e.status === 401) setToken('');
    }
  } catch (e) {
    // bootstrap não pode falhar silenciosamente — sem isso a UI ficaria
    // eternamente em "Carregando…" sem explicação nem retry.
    console.error('[prosa] bootstrap falhou:', e);
    store.bootError = e?.message || String(e);
  } finally {
    store.ready = true;
  }
}

export async function login(login_, password) {
  const r = await services.auth.login(login_, password);
  setToken(r.token);
  store.user = r.user;
  connectRealtime();
  await Promise.all([loadCommunities(), loadDms(), loadRelationships(), loadPresences()]);
}

export async function register(username, email, password) {
  const r = await services.auth.register(username, email, password);
  setToken(r.token);
  store.user = r.user;
  connectRealtime();
  await Promise.all([loadCommunities(), loadDms(), loadRelationships()]);
}

export async function logout() {
  try { await services.auth.logout(); } catch {}
  setToken('');
  closeRealtime();
  store.user = null; store.communities = []; store.dms = []; store.messages = {};
  for (const n of [...store.notifications]) dismissNotification(n);
}

export async function loadCommunities() {
  const r = await services.communities.list();
  store.communities = r.communities;
}

export async function loadCommunity(cid) {
  const r = await services.communities.get(cid);
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
  const r = await services.dms.list();
  store.dms = r.dms;
}

export async function loadRelationships() {
  const r = await services.contacts.list();
  store.relationships = r.relationships;
}

export async function loadPresences() {
  try {
    const r = await services.users.presences();
    Object.assign(store.presences, r.presences);
  } catch {}
}

export async function openChannel(channelId) {
  store.activeChannelId = channelId;
  if (!store.messages[channelId]) {
    const r = await services.messages.list(channelId);
    store.messages[channelId] = r.messages;
  }
  services.messages.markRead(channelId, {}).catch(() => {});
}

export async function sendMessage(channelId, content, { replyTo, files, attachments: forwarded } = {}) {
  let attachments = forwarded ? [...forwarded] : [];
  if (files?.length) {
    const up = await services.files.upload(files);
    attachments = [...attachments, ...up.files];
  }
  await services.messages.send(channelId, { content, replyTo, attachments });
}

export function presenceOf(userId) {
  return store.presences[userId] || 'offline';
}
