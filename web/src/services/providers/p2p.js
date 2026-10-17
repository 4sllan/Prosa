// providers/p2p.js — provider P2P do Service Layer.
// Implementa a mesma superfície do provider "server" sobre o nó P2P local:
// identidade por chave, eventos assinados, sync por espaço, DataChannel.
// Operações sem sentido sem backend (admin global, busca central, senha)
// lançam erro tipado — a UI deve degradar quando MODE=p2p.
import { getP2PNode } from '../p2p/node.js';
import { p2pTransport } from '../p2p/transport.js';
import { getLocalConfig } from '../p2p/localconfig.js';
import * as contacts from '../p2p/contacts.js';
import { getSpace, spaceProjection, listSpaces, emitEvent, dropSpace } from '../p2p/eventlog.js';
import { acceptSpaceInvite, createSpace } from '../p2p/spaces.js';
import { sendFile } from '../p2p/files.js';

const node = () => getP2PNode();
const me = () => node().identity;
const notImpl = (n) => () => { throw new Error(`P2P: "${n}" indisponível neste modo (requer backend)`); };

const messagesOf = (spaceId, channelId) => {
  const proj = spaceProjection(spaceId);
  return [...(proj?.messages.values() || [])]
    .filter(m => !m.deletedAt && (!channelId || m.channelId === channelId || m.channel_id === channelId))
    .sort((a, b) => a.ts - b.ts);
};
const toUiMessage = (spaceId, m) => ({
  id: m.id, channelId: m.channelId || m.channel_id, spaceId,
  author: { id: m.author, displayName: m.author.slice(0, 12) },
  content: m.content, ts: m.ts, editedAt: m.editedAt,
  reactions: Object.entries(m.reactions || {}).map(([emoji, users]) => ({ emoji, users })),
  pinned: !!m.pinned, attachments: m.attachments || [],
});

const spaceRow = (sp) => ({
  id: sp.id, name: sp.meta?.name || 'espaço', type: sp.type,
  myRole: sp.admins?.has(me().pubKeyHex) ? 'owner' : 'member',
  members: [...sp.members].map(id => ({ user: { id, displayName: id.slice(0, 12), username: id.slice(0, 12) } })),
  categories: [],
  channels: [...sp.channels.values()].map(c => ({ ...c, type: c.type || 'text' })),
});

// ---- trilha de voz local: channelId -> Map<peerId, state> ----
const voice = new Map();
const voiceJoined = new Set();

function voiceTrack(chId, peerId, d) {
  const m = voice.get(chId) || new Map();
  if (d.state === 'leave') m.delete(peerId);
  else m.set(peerId, { userId: peerId, muted: !!d.muted, deafened: !!d.deafened, video: !!d.video, screen: !!d.screen, username: peerId.slice(0, 12) });
  voice.set(chId, m);
}
function voiceJoinSelf(chId) {
  voiceTrack(chId, me().pubKeyHex, { state: 'join' });
  voiceJoined.add(chId);
}
function voiceLeaveSelf(chId) {
  const m = voice.get(chId);
  m?.delete(me().pubKeyHex);
  voiceJoined.delete(chId);
}
const voiceMembers = (chId) => [...(voice.get(chId) || new Map()).values()];

export function createP2PProvider() {
  return {
    mode: 'p2p',

    config: { get: async () => getLocalConfig() },

    auth: {
      login: notImpl('auth.login'),
      register: notImpl('auth.register'),
      logout: () => {},
      requestPasswordReset: notImpl('auth.requestPasswordReset'),
      confirmPasswordReset: notImpl('auth.confirmPasswordReset'),
    },

    users: {
      me: async () => ({ user: me().publicUser() }),
      get: async (userId) => {
        const c = await node().store.getContact(userId);
        return { user: { id: userId, displayName: c?.profile?.displayName || userId.slice(0, 12), username: c?.profile?.username || userId.slice(0, 12) } };
      },
      updateProfile: async (body) => {
        const r = await me().updateProfile(body);
        contacts.broadcastProfile(me()).catch(() => {});
        return r;
      },
      setPresence: async (p) => p2pTransport.setPresence(p),
      changePassword: notImpl('users.changePassword'),
      presences: async () => ({
        presences: Object.fromEntries(p2pTransport.peerIds().map(id => [id, p2pTransport.presenceOf(id)?.presence || 'online'])),
      }),
    },

    contacts: {
      list: async () => ({
        relationships: (await contacts.listContacts())
          .filter(c => ['friend', 'incoming', 'outgoing', 'blocked'].includes(c.state))
          .map(c => ({
            id: c.pubkey,
            user: { id: c.pubkey, username: c.profile?.username || c.pubkey.slice(0, 12), displayName: c.profile?.displayName || c.pubkey.slice(0, 12), avatarUrl: c.profile?.avatarUrl },
            type: c.state,
          })),
      }),
      request: async (pubkey) => contacts.requestContact(me(), { pubkey }),
      accept: async (peerId) => contacts.acceptContact(me(), peerId),
      remove: async (peerId) => contacts.removeContact(peerId),
      block: async (peerId) => contacts.blockContact(peerId),
      unblock: async (peerId) => contacts.unblockContact(peerId),
    },

    communities: {
      list: async () => ({ communities: listSpaces().filter(s => s.type !== 'dm').map(spaceRow) }),
      get: async (id) => {
        const c = spaceRow(getSpace(id));
        return { community: c, channels: c.channels, categories: c.categories, members: c.members };
      },
      create: async (body) => {
        const sp = await node().createCommunity(body.name);
        return { community: spaceRow(sp) };
      },
      update: async (id, body) => {
        const { env } = await emitEvent(me(), id, 'space.meta', { meta: body }, node().store);
        p2pTransport.broadcast(id, env);
        return { community: spaceRow(getSpace(id)) };
      },
      delete: async (id) => dropSpace(id),
      leave: async (id) => dropSpace(id),
      invites: async () => ({ invites: [] }), // convite P2P = genesis em base64
      createInvite: async (id) => {
        const sp = getSpace(id);
        const genesis = {
          v: 1, spaceId: id, author: me().pubKeyHex, seq: 1,
          type: 'space.genesis', ts: Date.now(),
          body: { meta: sp.meta, admins: [...sp.admins], members: [...sp.members] },
        };
        genesis.id = `${id}:${genesis.author}:1`;
        genesis.sig = await me().sign(new TextEncoder().encode(JSON.stringify({ ...genesis, sig: undefined })));
        return { invite: { code: btoa(JSON.stringify(genesis)) } };
      },
      revokeInvite: async () => {},
      acceptInvite: async (code) => {
        const genesis = JSON.parse(atob(code));
        const sp = await acceptSpaceInvite(genesis, node().store);
        return { communityId: sp.id };
      },
      kick: async (id, uid) => {
        const { env } = await emitEvent(me(), id, 'member.remove', { userId: uid }, node().store);
        p2pTransport.broadcast(id, env);
      },
      ban: async (id, uid) => {
        const { env } = await emitEvent(me(), id, 'member.remove', { userId: uid }, node().store);
        p2pTransport.broadcast(id, env);
      },
      unban: async () => {},
      bans: async () => ({ bans: [] }),
      setRole: async (id, uid, role) => {
        const { env } = await emitEvent(me(), id, 'member.role', { userId: uid, role }, node().store);
        p2pTransport.broadcast(id, env);
      },
      auditLog: async () => ({ entries: [] }),
      createCategory: async (id, body) => {
        const { env } = await emitEvent(me(), id, 'channel.create', { channel: { id: `${id}:${body.name}`, spaceId: id, name: body.name, type: 'category' } }, node().store);
        p2pTransport.broadcast(id, env);
      },
      deleteCategory: async (id, catId) => {
        const { env } = await emitEvent(me(), id, 'channel.remove', { channelId: catId }, node().store);
        p2pTransport.broadcast(id, env);
      },
      createChannel: async (id, body) => {
        const ch = { id: `${id}:${body.name}:${Date.now()}`, spaceId: id, name: body.name, type: body.type || 'text' };
        const { env } = await emitEvent(me(), id, 'channel.create', { channel: ch }, node().store);
        p2pTransport.broadcast(id, env);
        return { channel: ch };
      },
      updateChannel: async (id, chId, body) => {
        const { env } = await emitEvent(me(), id, 'channel.create', { channel: { ...getSpace(id).channels.get(chId), ...body } }, node().store);
        p2pTransport.broadcast(id, env);
      },
      deleteChannel: async (id, chId) => {
        const { env } = await emitEvent(me(), id, 'channel.remove', { channelId: chId }, node().store);
        p2pTransport.broadcast(id, env);
      },
    },

    dms: {
      list: async () => {
        const cs = await contacts.listContacts();
        const userOf = (pk) => {
          const c = cs.find(x => x.pubkey === pk);
          return {
            id: pk,
            username: c?.profile?.username || pk.slice(0, 16),
            displayName: c?.profile?.displayName || c?.profile?.username || pk.slice(0, 16),
          };
        };
        return {
          dms: listSpaces().filter(s => s.type === 'dm' || s.type === 'group').map(sp => {
            const others = [...sp.members].filter(m => m !== me().pubKeyHex);
            const chId = [...sp.channels.keys()][0] || sp.id;
            return {
              id: chId, spaceId: sp.id,
              type: sp.type === 'group' ? 'group_dm' : 'dm',
              name: sp.meta?.name || others[0]?.slice(0, 12) || 'dm',
              peer: others[0],
              recipients: others.map(userOf),
              allMembers: [...sp.members],
            };
          }),
        };
      },
      open: async (peerPub) => {
        const sp = await node().openDm(peerPub);
        const cs = await contacts.listContacts();
        const c = cs.find(x => x.pubkey === peerPub);
        const user = { id: peerPub, username: c?.profile?.username || peerPub.slice(0, 16), displayName: c?.profile?.displayName || c?.profile?.username || peerPub.slice(0, 16) };
        return { dm: { id: [...sp.channels.keys()][0] || sp.id, spaceId: sp.id, type: 'dm', name: sp.meta?.name || user.displayName, recipients: [user], allMembers: [...sp.members] } };
      },
      createGroup: async (body) => {
        const sp = await createSpace(me(), { type: 'group', name: body.name, members: body.userIds, channels: ['geral'] });
        const cs = await contacts.listContacts();
        const userOf = (pk) => {
          const c = cs.find(x => x.pubkey === pk);
          return { id: pk, username: c?.profile?.username || pk.slice(0, 16), displayName: c?.profile?.displayName || c?.profile?.username || pk.slice(0, 16) };
        };
        return { dm: { id: [...sp.channels.keys()][0], spaceId: sp.id, type: 'group_dm', name: body.name, recipients: body.userIds.map(userOf), allMembers: [...sp.members] } };
      },
      leave: async () => {},
    },

    messages: {
      list: async (chId) => {
        const spaceId = getSpace(chId) ? chId : findSpaceByChannel(chId);
        return { messages: messagesOf(spaceId, null).map(m => toUiMessage(spaceId, m)) };
      },
      send: async (chId, body) => {
        const spaceId = findSpaceByChannel(chId);
        const { env } = await emitEvent(me(), spaceId, 'message.send', {
          channelId: chId,
          message: {
            id: `${chId}:${me().pubKeyHex.slice(0, 12)}:${Date.now()}`,
            channelId: chId, content: body.content || '',
            replyTo: body.replyTo || null, attachments: body.attachments || [],
          },
        }, node().store);
        p2pTransport.broadcast(spaceId, env);
        return { message: toUiMessage(spaceId, { ...env.body.message, author: me().pubKeyHex }) };
      },
      edit: async (chId, mid, body) => {
        const spaceId = findSpaceByChannel(chId);
        const { env } = await emitEvent(me(), spaceId, 'message.edit', { messageId: mid, content: body.content }, node().store);
        p2pTransport.broadcast(spaceId, env);
      },
      delete: async (chId, mid) => {
        const spaceId = findSpaceByChannel(chId);
        const { env } = await emitEvent(me(), spaceId, 'message.delete', { messageId: mid }, node().store);
        p2pTransport.broadcast(spaceId, env);
      },
      pin: async (chId, mid) => {
        const spaceId = findSpaceByChannel(chId);
        const { env } = await emitEvent(me(), spaceId, 'pin', { messageId: mid }, node().store);
        p2pTransport.broadcast(spaceId, env);
      },
      unpin: async (chId, mid) => {
        const spaceId = findSpaceByChannel(chId);
        const { env } = await emitEvent(me(), spaceId, 'pin', { messageId: mid, remove: true }, node().store);
        p2pTransport.broadcast(spaceId, env);
      },
      react: async (chId, mid, emoji) => {
        const spaceId = findSpaceByChannel(chId);
        const { env } = await emitEvent(me(), spaceId, 'reaction', { messageId: mid, emoji }, node().store);
        p2pTransport.broadcast(spaceId, env);
      },
      unreact: async (chId, mid, emoji) => {
        const spaceId = findSpaceByChannel(chId);
        const { env } = await emitEvent(me(), spaceId, 'reaction', { messageId: mid, emoji, remove: true }, node().store);
        p2pTransport.broadcast(spaceId, env);
      },
      markRead: async () => {},
      pins: async (chId) => {
        const spaceId = findSpaceByChannel(chId);
        return { messages: messagesOf(spaceId).filter(m => m.pinned).map(m => toUiMessage(spaceId, m)) };
      },
      typing: (chId) => p2pTransport.typing(chId),
    },

    files: {
      upload: async (list) => {
        const out = [];
        for (const f of list) {
          const peers = p2pTransport.peerIds();
          const res = peers[0]
            ? await sendFile(peers[0], '*', f)
            : { hash: 'local:' + f.name };
          out.push({ url: `hash://${res.hash}`, name: f.name, size: f.size, mime: f.type });
        }
        return { files: out };
      },
    },

    misc: {
      voiceState: async (chId) => ({ members: voiceMembers(chId) }),
      search: async (q) => {
        const results = [];
        for (const sp of listSpaces()) {
          for (const m of messagesOf(sp.id)) {
            if (m.content?.toLowerCase().includes(q.toLowerCase())) results.push(toUiMessage(sp.id, m));
          }
        }
        return { messages: results.slice(0, 50), users: [] };
      },
      report: notImpl('misc.report'),
    },

    admin: {
      users: notImpl('admin.users'), suspend: notImpl('admin.suspend'),
      unsuspend: notImpl('admin.unsuspend'), communities: notImpl('admin.communities'),
      reports: notImpl('admin.reports'), resolveReport: notImpl('admin.resolveReport'),
      stats: async () => ({ peers: p2pTransport.peerIds().length, spaces: listSpaces().length }),
    },

    events: {
      send: (t, d) => p2pTransport.spaceEvent(t, d.spaceId || '*', d),
      on: (type, fn) => {
        if (type === 'VOICE_STATE') {
          // rtc.js espera {channelId, members:[{userId,...}]} — sintetiza
          // a partir dos eventos voice_state de controle por peer
          p2pTransport.on('voice_state', (d) => {
            voiceTrack(d.channelId, d.peerId, d);
            fn({ channelId: d.channelId, members: voiceMembers(d.channelId) });
          });
          return;
        }
        // mapeia nomes do protocolo do servidor para tipos de controle P2P
        const t = { SIGNAL: 'signal', TYPING: 'typing', PRESENCE_UPDATE: 'presence' }[type] || type;
        p2pTransport.on(t, (d) => {
          if (t === 'presence') return fn({ userId: d.peerId, presence: d.presence });
          if (t === 'typing') return fn({ channelId: d.channelId, userId: d.peerId });
          if (t === 'signal') return fn({ channelId: d.channelId, from: d.peerId, to: d.envelope?.to, data: d.data });
          fn({ ...d, from: d.from || d.peerId });
        });
      },
      setPresence: (p) => p2pTransport.setPresence(p),
      joinVoice: (ch) => { voiceJoinSelf(ch); p2pTransport.joinVoice(ch); },
      leaveVoice: (ch) => { voiceLeaveSelf(ch); p2pTransport.leaveVoice(ch); },
      updateVoice: (ch, s) => p2pTransport.updateVoice(ch, s),
      signal: (ch, to, data) => p2pTransport.signal(ch, to, data),
    },
  };
}

function findSpaceByChannel(chId) {
  for (const sp of listSpaces()) {
    if (sp.channels.has(chId)) return sp.id;
  }
  const cand = listSpaces().find(sp => chId.startsWith(sp.id));
  if (cand) return cand.id;
  return chId;
}
