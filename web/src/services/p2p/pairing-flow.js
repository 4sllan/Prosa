import { createPairingOffer, acceptPairingOffer, completePairing, decodePairPayload } from './pairing.js';
import { wirePairingPeer } from './pairing-peer.js';
import { writeClipboardText } from './clipboard.js';

const initialState = () => ({
  step: 'idle', link: '', linkType: '', peerId: '', legacy: false, relationship: '',
  error: '', notice: '', warning: '', copying: false, copyError: false,
});
export const isPairingBusy = step => ['generating-offer', 'generating-answer', 'connecting'].includes(step);

export function createPairingFlow({
  node, onChange = () => {}, clipboard = () => globalThis.navigator?.clipboard,
  createOffer = createPairingOffer, acceptOffer = acceptPairingOffer,
  complete = completePairing, wire = wirePairingPeer,
}) {
  let state = initialState();
  let current = null;
  let disposed = false;
  const update = patch => {
    if (!disposed) { state = { ...state, ...patch }; onChange(state); }
  };
  const active = attempt => !disposed && current === attempt;
  const close = resource => { try { resource?.close?.(); } catch {} };
  const discard = attempt => {
    if (!attempt || attempt.attached) return;
    attempt.abort.abort();
    attempt.unwire?.();
    close(attempt.dc);
    close(attempt.pc);
  };
  const begin = role => {
    const attempt = { role, abort: new AbortController(), attached: false };
    current = attempt;
    return attempt;
  };
  const watch = (attempt, initiator) => {
    attempt.unwire = wire(node, attempt.pc, attempt.dc, {
      initiator,
      onStatus: () => { if (active(attempt)) update({ step: 'connecting' }); },
      onConnected: (peerId, legacy) => {
        attempt.attached = true;
        if (active(attempt)) update({
          step: 'connected', peerId, legacy, link: '', linkType: '', copying: false,
          relationship: '', error: '', notice: 'Conexao estabelecida. A amizade e confirmada em Amigos.',
        });
      },
      onRequest: () => {
        if (active(attempt)) update({ notice: 'Solicitacao em Enviadas. Aguarde o amigo aceitar; entrega remota nao confirmada.' });
      },
      onRelationship: contactState => {
        const notice = {
          removed: 'Peer conectado, mas o contato foi removido. Para pedir amizade novamente, use Adicionar contato pela chave publica em Detalhes da conexao.',
          blocked: 'Peer conectado, mas o contato esta bloqueado. Nenhuma solicitacao sera enviada.',
          incoming: 'Existe uma solicitacao em Recebidas. Aceite-a em Amigos.',
          outgoing: 'Ja existe uma solicitacao em Enviadas. Aguarde o amigo aceitar.',
          friend: 'Peer conectado. Voces ja sao amigos.',
        }[contactState];
        if (active(attempt) && notice) update({ notice, relationship: contactState });
      },
      onError: (_error, connected) => {
        attempt.attached ||= connected;
        if (active(attempt)) update({
          step: connected ? 'connected' : 'error',
          error: connected
            ? 'Peer conectado, mas a solicitacao falhou. Tente adicionar o contato pela chave publica em Detalhes da conexao.'
            : 'Nao foi possivel concluir o handshake. Confira o link e recomece o pareamento.',
        });
      },
    });
  };
  const failed = (attempt, message) => {
    if (!active(attempt)) return;
    discard(attempt);
    update({ step: 'error', error: message });
  };
  const received = (attempt, result) => {
    if (!active(attempt)) {
      close(result.dc);
      close(result.pc);
      result.dcPromise?.then(close, () => {});
      return false;
    }
    attempt.pc = result.pc;
    attempt.dc = result.dc;
    update({
      link: result.link, linkType: attempt.role, error: '', notice: '',
      warning: result.timedOut ? 'Candidatos de rede podem estar incompletos; a conexao pode falhar.' : '',
    });
    return true;
  };

  async function createInvite() {
    if (disposed || isPairingBusy(state.step)) return;
    if (current) {
      update({ notice: 'Recomece o pareamento para criar um novo convite.' });
      return;
    }
    const attempt = begin('offer');
    update({ step: 'generating-offer', error: '', notice: '' });
    try {
      const result = await createOffer({ signal: attempt.abort.signal });
      if (!received(attempt, result)) return;
      update({ step: 'awaiting-response' });
      watch(attempt, true);
    } catch {
      failed(attempt, 'Nao foi possivel criar o convite. Recomece o pareamento para tentar novamente.');
    }
  }

  async function continueWithLink(input) {
    if (disposed || isPairingBusy(state.step)) return;
    if (state.step === 'connected') {
      update({ notice: 'Recomece o pareamento para usar um novo link.' });
      return;
    }
    let payload;
    try { payload = decodePairPayload(input); }
    catch (e) { update({ error: e.message, notice: '' }); return; }
    if (payload.t === 'answer') {
      if (!current?.pc || current.role !== 'offer') {
        update({ error: 'Esta resposta precisa do convite criado nesta janela. Crie um novo convite aqui e peca uma nova resposta.' });
        return;
      }
      const attempt = current;
      update({ step: 'connecting', error: '', notice: '' });
      try { await complete(attempt.pc, input); }
      catch {
        if (active(attempt) && !attempt.attached) update({
          step: 'awaiting-response',
          error: 'Nao foi possivel aplicar esta resposta. Confira se ela pertence ao convite atual ou recomece.',
        });
      }
      return;
    }
    if (current) {
      update({ error: current.role === 'offer'
        ? 'Esta janela aguarda uma resposta, nao outro convite. Peca ao amigo para usar Copiar resposta, ou recomece.'
        : 'Uma resposta ja esta pronta. Envie-a ao amigo ou recomece antes de usar outro convite.' });
      return;
    }
    const attempt = begin('answer');
    update({ step: 'generating-answer', error: '', notice: '' });
    try {
      const result = await acceptOffer(input, { signal: attempt.abort.signal });
      if (!received(attempt, result)) return;
      update({ step: 'response-ready' });
      result.dcPromise.then(dc => {
        if (!active(attempt)) { close(dc); return; }
        attempt.dc = dc;
        watch(attempt, false);
      }).catch(() => failed(attempt, 'Nao foi possivel receber o canal. Recomece o pareamento.'));
    } catch {
      failed(attempt, 'Nao foi possivel preparar a resposta. O convite pode ter expirado; recomece e peca outro.');
    }
  }

  async function copyLink() {
    if (disposed || !state.link || state.copying) return;
    const attempt = current;
    const link = state.link;
    update({ copying: true, copyError: false, notice: '' });
    try {
      await writeClipboardText(link, clipboard);
      if (active(attempt) && state.link === link) update({
        notice: state.linkType === 'offer' ? 'Convite copiado.' : 'Resposta copiada.',
      });
    } catch {
      if (active(attempt) && state.link === link) update({
        copyError: true, notice: 'Nao foi possivel copiar. Abra Ver link e copie o texto inteiro.',
      });
    } finally {
      if (active(attempt) && state.link === link) update({ copying: false });
    }
  }

  function restart() {
    if (disposed) return;
    const previous = current;
    current = null;
    discard(previous);
    update(initialState());
  }
  function dispose() {
    disposed = true;
    const previous = current;
    current = null;
    discard(previous);
  }
  onChange(state);
  return { get state() { return state; }, createInvite, continueWithLink, copyLink, restart, dispose };
}
