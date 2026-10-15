// p2p/node.js — orquestrador do nó P2P: identidade + transporte + log + sync.
// Chamado no boot quando MODE=p2p; expõe hooks para stores/UI.
import { readyP2PIdentity, fingerprintOf } from './identity.js';
import { configureTransport, p2pTransport } from './transport.js';
import { logDiag, diagFingerprint } from './diag.js';
import { initLocalStore, getLocalStore } from './localstore.js';
import { makeSpace, getSpace, listSpaces, replaySpace, emitEvent, validateEnvelope, applyEvent, setLocalEventListener } from './eventlog.js';
import { sendSyncReq, handleSyncReq, handleSyncEvent } from './sync.js';
import { createSpace, acceptSpaceInvite, dmSpaceId } from './spaces.js';
import * as contacts from './contacts.js';
import { attachChannel } from './pairing.js';

let node = null;

export async function initP2PNode({ emitToStore } = {}) {
  if (node) return node;

  const identity = await readyP2PIdentity();
  const store = initLocalStore();

  configureTransport({
    myId: identity.pubKeyHex,
    emitEvent: (type, data) => node?.emitToStore?.(type, data),
  });

  node = {
    identity, store,
    emitToStore,

    // ---- peers ----
    attachPeer(peerId, pc, dc, { keepalive = true } = {}) {
      attachChannel(pc, dc, {
        onOpen: async () => {
          p2pTransport.addPeer(peerId, dc, { keepalive });
          // dispara sync de todos os espaços compartilhados
          for (const sp of listSpaces()) {
            if (sp.members.has(peerId)) await sendSyncReq(peerId, sp.id);
          }
          contacts.broadcastProfile(identity).catch(() => {});
        },
        onMessage: (env) => node.receive(peerId, env),
        onClose: () => p2pTransport.dropPeer(peerId),
      });
      // queda transitória: tenta restartIce uma vez antes de declarar offline.
      // Candidatos antigos podem ter expirado no NAT — é só uma tentativa.
      if (pc?.restartIce && pc.addEventListener) {
        let restarting = false;
        pc.addEventListener('iceconnectionstatechange', () => {
          const s = pc.iceConnectionState;
          if ((s !== 'disconnected' && s !== 'failed') || restarting) return;
          restarting = true;
          logDiag('ice.restart', diagFingerprint(peerId));
          try { pc.restartIce(); } catch {}
          setTimeout(() => {
            if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
              logDiag('ice.restart.fail', diagFingerprint(peerId));
              p2pTransport.dropPeer(peerId, 'ice-restart-failed');
            }
            restarting = false;
          }, 15000);
        });
      }
    },
    knownPeers: async () => (await store.kvGet('peers')) || {},

    async receive(peerId, env) {
      // controle vs evento persistido
      switch (env.type) {
        case 'sync_req': return handleSyncReq(peerId, env.body, store);
        case 'sync_event': return handleSyncEvent(peerId, env.body, store);
        case 'sync_done': return node.emitToStore?.('sync.done', { spaceId: env.body?.spaceId, peerId });
        case 'contact_req': {
          const c = await contacts.handleContactReq(peerId, env.body, identity);
          node.emitToStore?.('contacts.changed', { peerId });
          return c;
        }
        case 'contact_accept': {
          const r = await contacts.handleContactAccept(peerId, env.body);
          node.emitToStore?.('contacts.changed', { peerId });
          return r;
        }
        case 'contact_remove': {
          const rm = await contacts.handleContactRemove(peerId);
          node.emitToStore?.('contacts.changed', { peerId });
          return rm;
        }
        case 'profile': {
          const p = await contacts.handleProfile(peerId, env.body);
          node.emitToStore?.('contacts.changed', { peerId });
          return p;
        }
        case 'space_invite': {
          const sp = await acceptSpaceInvite(env.body.genesis, store);
          node.emitToStore?.('spaces.changed', { spaceId: sp?.id });
          return sp;
        }
        case 'presence': {
          const r = p2pTransport.receive(peerId, env);
          node.emitToStore?.('presence', { peerId, presence: env.body?.presence });
          return r;
        }
        default: {
          // evento assinado de domínio?
          if (env.author && env.seq) {
            if (getSpace(env.spaceId)) {
              const ok = await validateEnvelope(env).then(v => v.ok).catch(() => false);
              if (ok) {
                const r = await applyEvent(env, store);
                if (r.applied) node.emitToStore?.('space.event', { spaceId: env.spaceId, env });
                return r.applied;
              }
            }
          }
          return p2pTransport.receive(peerId, env);
        }
      }
    },

    // ---- domínio ----
    async openDm(peerPub) {
      const id = dmSpaceId(identity.pubKeyHex, peerPub);
      let sp = getSpace(id);
      if (!sp) {
        sp = await createSpace(identity, {
          type: 'dm', name: 'DM', members: [peerPub], channels: ['chat'],
        });
      }
      return sp;
    },

    async createCommunity(name) {
      return createSpace(identity, {
        type: 'community', name, members: [],
        channels: ['geral', 'voz'],
      });
    },

    async sendText(spaceId, channelId, content) {
      const { env } = await emitEvent(identity, spaceId, 'message.send', {
        channelId, message: { id: `${spaceId}:${identity.pubKeyHex.slice(0, 12)}:${Date.now()}`, content },
      }, store);
      p2pTransport.broadcast(spaceId, env);
      return env;
    },

    peersOnline: () => p2pTransport.peerIds(),
    spaces: () => listSpaces(),
    space: (id) => getSpace(id),
  };

  // eventos locais aplicados também notificam a UI (remotos chegam via receive())
  setLocalEventListener((env) => node?.emitToStore?.('space.event', { spaceId: env.spaceId, env }));

  // peers conhecidos: persiste pubkey/fingerprint para re-pareamento posterior
  const rememberPeer = async (peerId, lastState) => {
    try {
      const peers = (await store.kvGet('peers')) || {};
      peers[peerId] = {
        fingerprint: peers[peerId]?.fingerprint || await fingerprintOf(peerId),
        lastSeen: Date.now(),
        lastState,
      };
      await store.kvSet('peers', peers);
    } catch {}
  };
  p2pTransport.on('peer.open', ({ peerId }) => rememberPeer(peerId, 'online'));
  p2pTransport.on('peer.closed', ({ peerId }) => rememberPeer(peerId, 'offline'));

  // restaura espaços persistidos
  const known = await store.kvGet('spaces') || [];
  for (const row of known) {
    if (!getSpace(row.id)) {
      const sp = makeSpace(row.id, row.type, { name: row.name }, row.members || []);
      for (const m of sp.members) p2pTransport.joinSpace(row.id, m);
      await replaySpace(row.id, store);
    }
  }

  return node;
}

export function getP2PNode() {
  if (!node) throw new Error('nó P2P não inicializado');
  return node;
}
