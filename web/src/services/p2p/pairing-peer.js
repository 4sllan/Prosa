import { makeHello, verifyHello } from './hello.js';
import { logDiag, diagFingerprint } from './diag.js';
import { p2pTransport } from './transport.js';
import { requestContact } from './contacts.js';

export function wirePairingPeer(node, pc, dc, {
  initiator = false, onStatus, onConnected, onRequest, onRelationship, onError,
} = {}) {
  let verifying = false;
  let attached = false;
  let cancelled = false;
  let helloPromise;
  const pending = [];

  const sendHello = () => {
    helloPromise ||= (async () => {
      onStatus?.();
      try {
        const hello = await makeHello(node.identity);
        if (cancelled) return false;
        dc.send(JSON.stringify(hello));
        logDiag('hello.sent', 'v2');
        return true;
      } catch (e) {
        if (!cancelled) onError?.(e, false);
        return false;
      }
    })();
    return helloPromise;
  };
  dc.onopen = sendHello;
  dc.onerror = (e) => logDiag('dc.error', e.message || 'err');

  const receive = async (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (!m || attached || cancelled) return;
    if (m.type !== 'hello') {
      // O outro lado pode enviar controles enquanto verificamos seu hello.
      if (verifying && pending.length < 500) pending.push(m);
      return;
    }
    if (!m.from || verifying) return;
    verifying = true;
    try {
      logDiag('hello.recv', diagFingerprint(m.from));
      const check = await verifyHello(node.identity, m);
      if (cancelled) return;
      if (!check.ok) {
        logDiag('hello.reject', diagFingerprint(m.from));
        throw new Error('Handshake do peer rejeitado');
      }
      if (check.legacy) logDiag('hello.legacy', diagFingerprint(m.from));
      const alreadyOnline = p2pTransport.isOnline(m.from);
      // O hello local deve preceder controles no canal ordenado.
      const sent = await sendHello();
      if (cancelled || (!sent && !alreadyOnline)) return;
      if (!alreadyOnline) {
        // registro residual (fechado/zumbi): encerra os recursos antigos
        // antes de anexar — drop é idempotente quando não há o que limpar
        p2pTransport.dropPeer(m.from, 'replaced');
        node.attachPeer(m.from, pc, dc, { keepalive: !check.legacy });
      }
      attached = true;
      dc.removeEventListener('message', receive);
      if (alreadyOnline) {
        // Manter o transporte vivo; esta tentativa criou um canal redundante.
        for (const resource of [dc, pc]) { try { resource?.close?.(); } catch {} }
      }
      logDiag('peer.attach', diagFingerprint(m.from));
      await onConnected?.(m.from, check.legacy);
      for (const env of pending.splice(0)) await node.receive(m.from, env);

      // Re-pareamento reenvia pedido apenas para removed (re-parear é
      // intenção explícita do iniciador); nunca reenvia pendencias,
      // friend ou blocked.
      const existing = await node.store.getContact(m.from);
      if (initiator && (!existing || existing.state === 'removed')) {
        await requestContact(node.identity, { pubkey: m.from });
        node.emitToStore?.('contacts.changed', { peerId: m.from });
        onRequest?.();
      } else if (existing) onRelationship?.(existing.state);
    } catch (e) {
      if (!cancelled) onError?.(e, attached);
    } finally {
      verifying = false;
      pending.length = 0;
    }
  };
  dc.addEventListener('message', receive);
  if (dc.readyState === 'open') sendHello();
  return () => {
    if (attached) return;
    cancelled = true;
    pending.length = 0;
    dc.removeEventListener('message', receive);
    if (dc.onopen === sendHello) dc.onopen = null;
  };
}
