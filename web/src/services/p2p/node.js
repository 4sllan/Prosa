// p2p/node.js — orquestrador do nó P2P: identidade + transporte + log + sync.
// Chamado no boot quando MODE=p2p; expõe hooks para stores/UI.
import { readyP2PIdentity, fingerprintOf } from './identity.js';
import { configureTransport, p2pTransport } from './transport.js';
import { logDiag, diagFingerprint } from './diag.js';
import { initLocalStore, getLocalStore } from './localstore.js';
import { makeSpace, getSpace, listSpaces, replaySpace, emitEvent, validateEnvelope, applyEvent, setLocalEventListener, spaceProjection } from './eventlog.js';
import { sendSyncReq, handleSyncReq, handleSyncEvent } from './sync.js';
import { createSpace, acceptSpaceInvite, dmSpaceId } from './spaces.js';
import * as contacts from './contacts.js';
import { attachChannel } from './pairing.js';
import { createPresence } from '../supabase/presence.js';
import { createSignaling } from '../supabase/signaling.js';
import { createPersistence } from '../supabase/persistence.js';
import { createSpaceChannels } from '../supabase/space-channel.js';
import { convergeInbox } from '../supabase/inbox.js';
import { createHubPairing } from './pairing-hub.js';
import { createRelayReceiver } from './relay.js';
import { trackSendDelivery } from './delivery.js';

let node = null;
const relayConfirms = new Map(); // env.id -> promise do publish no canal do espaco
const RELAY_CONFIRMS_CAP = 2000;

export async function initP2PNode({ emitToStore } = {}) {
  if (node) return node;

  const identity = await readyP2PIdentity();
  const store = initLocalStore();

  configureTransport({
    myId: identity.pubKeyHex,
    emitEvent: (type, data) => node?.emitToStore?.(type, data),
    // todo broadcast de envelope passa por aqui — o no decide se relaya via hub
    afterBroadcast: (spaceId, env) => node?.relayToHub(spaceId, env),
  });

  node = {
    identity, store,
    emitToStore,

    // ---- peers ----
    attachPeer(peerId, pc, dc, { keepalive = true } = {}) {
      attachChannel(pc, dc, {
        onOpen: async () => {
          p2pTransport.addPeer(peerId, dc, { keepalive, pc });
          // dispara sync de todos os espaços compartilhados
          for (const sp of listSpaces()) {
            if (sp.members.has(peerId)) await sendSyncReq(peerId, sp.id);
          }
          contacts.broadcastProfile(identity).catch(() => {});
        },
        onMessage: (env) => node.receive(peerId, env),
        // close tardio de um canal substituído não derruba o registro atual
        onClose: () => {
          if (p2pTransport.peerEntry(peerId)?.channel === dc) p2pTransport.dropPeer(peerId);
        },
      });
      // queda transitória: tenta restartIce uma vez antes de declarar offline.
      // Candidatos antigos podem ter expirado no NAT — é só uma tentativa.
      if (pc?.restartIce && pc.addEventListener) {
        let restarting = false;
        pc.addEventListener('iceconnectionstatechange', () => {
          // pc substituído num re-attach não pode agir sobre a conexão atual
          if (p2pTransport.peerEntry(peerId)?.pc !== pc) return;
          const s = pc.iceConnectionState;
          if ((s !== 'disconnected' && s !== 'failed') || restarting) return;
          restarting = true;
          logDiag('ice.restart', diagFingerprint(peerId));
          try { pc.restartIce(); } catch {}
          setTimeout(() => {
            if (p2pTransport.peerEntry(peerId)?.pc === pc
              && pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
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
          node.emitToStore?.('presence', { peerId, presence: env.body?.presence, source: 'dc' });
          return r;
        }
        default: {
          // evento assinado de domínio?
          if (env.author && env.seq) {
            if (getSpace(env.spaceId)) {
              const ok = await validateEnvelope(env).then(v => v.ok).catch(() => false);
              if (ok) {
                const r = await applyEvent(env, store);
                if (r.applied) {
                  node.emitToStore?.('space.event', { spaceId: env.spaceId, env });
                  node.mirrorEvent(env); // receptores também espelham (D3)
                }
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

    // relay via hub: algum membro do espaco so e alcancavel pelo hub?
    // (sem DC e nao observado-offline — membro nao observado recebe best-effort)
    spaceNeedsRelay(spaceId) {
      const sp = getSpace(spaceId);
      if (!sp || !node.hub?.spaces) return false;
      const presence = node.hub.presence;
      return [...sp.members].some(m =>
        m !== identity.pubKeyHex
        && !p2pTransport.isOnline(m)
        && !(presence?.isWatching?.(m) && presence.stateOf(m) === 'offline'));
    },

    // envelopes assinados broadcastados no DC viram relay quando ha membro
    // alcancavel so pelo hub; o publicador decide a necessidade, nao o remetente
    relayToHub(spaceId, env) {
      if (!env?.author || !Number.isInteger(env.seq)) return; // so envelopes de dominio
      if (!node.spaceNeedsRelay(spaceId)) return;
      const p = node.hub?.spaces?.publishRelay(spaceId, env).catch(() => false);
      if (p) {
        relayConfirms.set(env.id, p);
        if (relayConfirms.size > RELAY_CONFIRMS_CAP) relayConfirms.delete(relayConfirms.keys().next().value);
      }
    },
    relayConfirm: (envId) => relayConfirms.get(envId) || null,

    // confirmação de envio (UI): >=1 ACK de membro online-no-DC ou publish
    // do relay confirmado; timeout -> 'unconfirmed'
    trackDelivery(envId, spaceId, ms = 5000) {
      const targets = p2pTransport.spaceMembers(spaceId).filter(p => p2pTransport.isOnline(p));
      return trackSendDelivery({
        waitAcks: targets.length ? () => p2pTransport.waitAcks(envId, targets, ms, 1) : null,
        relayConfirm: () => node.relayConfirm(envId),
        timeoutMs: ms,
      });
    },

    peersOnline: () => p2pTransport.peerIds(),
    spaces: () => listSpaces(),
    space: (id) => getSpace(id),
    // hub Supabase — null quando desligado/indisponível
    hub: null,
    watchPresence: (pubkey) => node?.hub?.presence?.watchPeer(pubkey),
    // espelha um evento aplicado no Postgres — fire-and-forget, nunca bloqueia
    mirrorEvent: (env) =>
      node.hub?.persistence?.mirrorEvent(env, getSpace(env.spaceId)).catch(() => {}),
  };

  // eventos locais aplicados também notificam a UI (remotos chegam via receive())
  setLocalEventListener((env) => {
    node?.emitToStore?.('space.event', { spaceId: env.spaceId, env });
    node?.mirrorEvent(env);
  });

  // envelopes relayados pelo canal de espaco: mesma verificacao de DC
  // (assinatura+seq), sem tocar lastSeen/acks/estado DC do transporte
  const relayRx = createRelayReceiver({
    curMaxOf: (spaceId, author) => spaceProjection(spaceId)?.byAuthor.get(author) || 0,
    apply: async (env) => {
      const ok = await validateEnvelope(env).then(v => v.ok).catch(() => false);
      if (!ok) return false;
      const r = await applyEvent(env, store);
      if (!r.applied) return false;
      node.emitToStore?.('space.event', { spaceId: env.spaceId, env });
      node.mirrorEvent(env);
      return true;
    },
    pull: (spaceId, author, afterSeq) =>
      node.hub?.persistence?.spaceEventsSince(spaceId, { author, afterSeq }) ?? [],
  });
  node.receiveRelayed = (env) => relayRx.ingest(env);

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

  // hub Supabase (rendezvous) — opcional e melhor-esforço; sem ele o nó segue
  // 100% P2P manual. Presença do hub alimenta o mesmo evento 'presence' da UI.
  try {
    let pairing = null; // definido junto com o signaling abaixo
    const presence = createPresence({
      pubkey: identity.pubKeyHex,
      profile: identity.publicUser(),
      onPeer: (peerId, p) => {
        node.emitToStore?.('presence', { peerId, presence: p, source: 'hub' });
        // D2: contato online e sem DC → o lado de menor pubkey oferece
        if (p !== 'offline') pairing?.pair(peerId).catch(() => {});
      },
    });
    if (presence) {
      const signaling = createSignaling({ pubkey: identity.pubKeyHex });
      const persistence = createPersistence();
      pairing = signaling && createHubPairing({ node, signaling });
      const spaces = createSpaceChannels({
        pubkey: identity.pubKeyHex,
        onRelay: (env) => node.receiveRelayed(env)
          .catch(e => logDiag('relay.ingest', e?.message || 'err')),
        onCtl: (msg) => {
          if (msg?.type === 'typing') {
            node.emitToStore?.('typing', { channelId: msg.channelId, peerId: msg.from });
          }
        },
      });
      node.hub = { presence, signaling, pairing, persistence, spaces };
      persistence?.upsertProfile(identity.pubKeyHex, identity.publicUser());
      for (const sp of listSpaces()) spaces?.join(sp.id);

      // Eventos 'notify' do canal prosa:user:<me> — "acordar" para convites e
      // relacionamento. Os handlers são idempotentes: se o mesmo controle chegar
      // por DC, o estado do contato absorve a duplicata.
      signaling?.onNotify(async (msg) => {
        try {
          // convite de espaço sem DC — mesmo caminho do controle space_invite
          if (msg?.kind === 'space_invite' && msg.genesis) {
            const sp = await acceptSpaceInvite(msg.genesis, store);
            node.emitToStore?.('spaces.changed', { spaceId: sp?.id });
            return;
          }
          if (await contacts.handleHubNotify(identity, msg)) {
            node.emitToStore?.('contacts.changed', { peerId: msg.from });
          }
        } catch (e) {
          logDiag('hub.notify', e?.message || 'err');
        }
      });

      // inbox de convites: quem me convidou enquanto eu estava offline
      if (persistence) {
        for (const inv of await persistence.pendingInvites(identity.pubKeyHex)) {
          if (await store.getContact(inv.from_pubkey)) continue;
          const profile = await persistence.getProfile(inv.from_pubkey);
          await contacts.handleContactReq(inv.from_pubkey, { profile }, identity);
          node.emitToStore?.('contacts.changed', { peerId: inv.from_pubkey });
        }
      }

      // vigia presença só de quem faz sentido parear — bloqueado/removido não
      const syncWatch = async (peerId) => {
        const c = await store.getContact(peerId);
        if (c && !['blocked', 'removed'].includes(c.state)) presence.watchPeer(peerId);
        else presence.unwatchPeer(peerId);
      };
      for (const c of await contacts.listContacts()) await syncWatch(c.pubkey);

      // mantém a lista de observados alinhada às mudanças de contato e
      // espelha relationship+invite+perfil do contato no Postgres
      const emit = node.emitToStore;
      node.emitToStore = (type, data) => {
        if (type === 'contacts.changed' && data?.peerId) {
          syncWatch(data.peerId).catch(() => {});
          store.getContact(data.peerId)
            .then(c => c && persistence?.mirrorContact(c, identity.pubKeyHex))
            .catch(() => {});
        }
        // espaco novo (criado ou aceito) entra no canal de relay do hub
        if (data?.env?.type === 'space.genesis') spaces?.join(data.env.spaceId);
        if (type === 'spaces.changed' && data?.spaceId) spaces?.join(data.spaceId);
        return emit?.(type, data);
      };

      // DC caiu mas o peer segue online no hub → re-pareamento automático
      p2pTransport.on('peer.closed', ({ peerId }) => {
        if (presence.stateOf(peerId) !== 'offline') pairing?.pair(peerId).catch(() => {});
      });

      // convergencia de boot (mailbox): descobre espacos via memberships,
      // reconstrói desconhecidos pelo genesis e puxa eventos faltantes —
      // mensagens/edicoes de quem estava offline chegam sem DC
      if (persistence) {
        convergeInbox({
          persistence, pubkey: identity.pubKeyHex, getSpace,
          maxSeqOf: (spaceId) => store.maxSeqMap(spaceId),
          acceptGenesis: async (genesis) => {
            const sp = await acceptSpaceInvite(genesis, store);
            node.emitToStore?.('spaces.changed', { spaceId: sp?.id });
          },
          ingest: (env) => node.receiveRelayed(env),
        }).catch(e => logDiag('inbox', e?.message || 'err'));
      }
    }
  } catch {}

  return node;
}

export function getP2PNode() {
  if (!node) throw new Error('nó P2P não inicializado');
  return node;
}
