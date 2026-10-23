// p2p/pairing-hub.js — pareamento via hub Supabase com ICE trickle e renegociação.
// Iniciador determinístico = menor pubkey (evita glare na oferta inicial).
// Renegociação usa "perfect negotiation": o lado polite (maior pubkey, mesma
// regra do rtc.js) faz rollback em colisão. O handshake `hello` assinado e o
// attachPeer seguem inalterados — o canal do hub só carrega SDP/ICE.
import { getLocalConfig } from './localconfig.js';
import { logDiag, diagFingerprint } from './diag.js';
import { p2pTransport } from './transport.js';
import { wirePairingPeer } from './pairing-peer.js';

const SESSION_TIMEOUT = 30000;
const randomSess = () => Math.random().toString(16).slice(2, 10);

export const isHubInitiator = (myPub, peerPub) => myPub < peerPub;

export function createHubPairing({
  node, signaling,
  iceServers = getLocalConfig().iceServers,
  createPc = (opts) => new RTCPeerConnection(opts),
  newSessId = randomSess,
  timeoutMs = SESSION_TIMEOUT,
} = {}) {
  if (!node || !signaling) return null;
  const myPub = node.identity.pubKeyHex;
  const sessions = new Map(); // peerId -> session

  const cleanup = (peerId, sess) => {
    if (sessions.get(peerId) !== sess) return;
    sessions.delete(peerId);
    clearTimeout(sess.timer);
    try { sess.unwire?.(); } catch {}
    try { sess.dc?.close?.(); } catch {}
    try { sess.pc?.close?.(); } catch {}
  };

  const send = (peerId, msg) =>
    signaling.send(peerId, msg).catch(e => logDiag('hub.signal.send', e?.message || 'err'));

  const wirePc = (peerId, sess) => {
    const { pc } = sess;
    pc.onicecandidate = (e) => send(peerId, {
      kind: 'ice', sess: sess.id,
      data: e.candidate ? e.candidate.toJSON() : null,
    });
    // Oferta inicial E renegociações (restartIce) passam por aqui.
    pc.onnegotiationneeded = async () => {
      try {
        sess.makingOffer = true;
        await pc.setLocalDescription();
        await send(peerId, { kind: 'desc', sess: sess.id, data: pc.localDescription.toJSON() });
      } catch (e) {
        logDiag('hub.negotiate', diagFingerprint(peerId) + ' ' + (e?.message || 'err'));
      } finally {
        sess.makingOffer = false;
      }
    };
    pc.ondatachannel = (e) => {
      if (sess.dc) { try { e.channel.close(); } catch {} return; }
      sess.dc = e.channel;
      wireDc(peerId, sess);
    };
  };

  const wireDc = (peerId, sess) => {
    sess.unwire = wirePairingPeer(node, sess.pc, sess.dc, {
      initiator: sess.role === 'offerer',
      onStatus: () => clearTimeout(sess.timer),
      onConnected: () => node.emitToStore?.('contacts.changed', { peerId }),
      onError: (err) => {
        logDiag('hub.pair.err', diagFingerprint(peerId) + ' ' + (err?.message || 'err'));
        cleanup(peerId, sess);
      },
    });
  };

  const newSession = (peerId, role, id) => {
    const sess = {
      id, peerId, role,
      polite: myPub > peerId,
      makingOffer: false, pendingIce: [],
      dc: null, unwire: null,
      timer: setTimeout(() => cleanup(peerId, sess), timeoutMs),
    };
    sessions.set(peerId, sess);
    sess.pc = createPc({ iceServers });
    wirePc(peerId, sess);
    return sess;
  };

  const onDesc = async (sess, desc) => {
    const pc = sess.pc;
    const collision = desc.type === 'offer' && (sess.makingOffer || pc.signalingState !== 'stable');
    if (collision && !sess.polite) return; // impolite vence — ignora a oferta remota
    try {
      if (collision) await pc.setLocalDescription({ type: 'rollback' });
      await pc.setRemoteDescription(desc);
      if (desc.type === 'offer') {
        await pc.setLocalDescription();
        await send(sess.peerId, { kind: 'desc', sess: sess.id, data: pc.localDescription.toJSON() });
      }
      for (const cand of sess.pendingIce.splice(0)) {
        await pc.addIceCandidate(cand).catch(() => {});
      }
    } catch (e) {
      logDiag('hub.desc.err', diagFingerprint(sess.peerId) + ' ' + (e?.message || 'err'));
    }
  };

  const onIce = (sess, data) => {
    if (!sess.pc.remoteDescription) sess.pendingIce.push(data);
    else sess.pc.addIceCandidate(data ?? null).catch(() => {});
  };

  signaling.onSignal((msg) => {
    const from = msg?.from;
    if (!from || from === myPub) return;
    let sess = sessions.get(from);
    if (sess && msg.sess !== sess.id) {
      // o outro lado recomeçou — só uma nova oferta substitui a sessão atual
      if (msg.kind === 'desc' && msg.data?.type === 'offer') { cleanup(from, sess); sess = null; }
      else return;
    }
    if (!sess) {
      if (msg.kind !== 'desc' || msg.data?.type !== 'offer' || !msg.sess) return;
      if (p2pTransport.isOnline(from)) return;
      sess = newSession(from, 'answerer', msg.sess);
    }
    try {
      if (msg.kind === 'desc') onDesc(sess, msg.data);
      else if (msg.kind === 'ice') onIce(sess, msg.data);
    } catch (e) {
      logDiag('hub.signal.err', e?.message || 'err');
    }
  });

  return {
    sessions,
    // Iniciador determinístico chama ao ver o contato online no hub.
    async pair(peerId) {
      if (!isHubInitiator(myPub, peerId)) return false;
      if (sessions.has(peerId) || p2pTransport.isOnline(peerId)) return false;
      const sess = newSession(peerId, 'offerer', newSessId());
      sess.dc = sess.pc.createDataChannel('prosa', { ordered: true });
      wireDc(peerId, sess);
      logDiag('hub.pair.offer', diagFingerprint(peerId));
      // onnegotiationneeded dispara sozinho após createDataChannel
      return true;
    },
    dispose() { for (const [peerId, sess] of sessions) cleanup(peerId, sess); },
  };
}
