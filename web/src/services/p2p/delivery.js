// p2p/delivery.js — confirmação de envio para a UI (RF-10/D5).
// Resolve 'delivered' quando >=1 ACK de membro online chega OU o publish do
// relay no hub e confirmado; no timeout devolve 'unconfirmed' (discreto, nao
// erro — a entrega pode ainda acontecer via fila DC ou mailbox).
export function trackSendDelivery({ waitAcks = null, relayConfirm = null, timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => { settled = true; resolve('unconfirmed'); }, timeoutMs);
    timer.unref?.();
    const done = () => { if (!settled) { settled = true; clearTimeout(timer); resolve('delivered'); } };
    if (waitAcks) Promise.resolve(waitAcks()).then(acks => { if (acks?.length) done(); }).catch(() => {});
    if (relayConfirm) Promise.resolve(relayConfirm()).then(ok => { if (ok) done(); }).catch(() => {});
  });
}
