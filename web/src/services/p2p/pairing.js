// p2p/pairing.js — pareamento manual por link (offer/answer).
// A gera link "prosa://pair/<payload>" com offer SDP + fingerprint;
// B abre o link, gera resposta; A cola a resposta e o DataChannel abre.
import { unb64url } from './identity.js';
import { getLocalConfig } from './localconfig.js';
import { logDiag, diagCandidates } from './diag.js';

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });
const MAX_LINK_BYTES = 256 * 1024;
const INVALID_LINK = 'Link incompleto ou invalido. Peca ao amigo para usar Copiar convite ou Copiar resposta.';

function pairingError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function encodePairPayload(obj) {
  const bytes = enc.encode(JSON.stringify(obj));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodePairPayload(s, expectedType) {
  if (typeof s !== 'string') throw pairingError('PAIR_INVALID_LINK', INVALID_LINK);
  // Limitar antes de remover whitespace evita contornar o limite com colagens.
  if (s.length > MAX_LINK_BYTES || enc.encode(s).byteLength > MAX_LINK_BYTES) {
    throw pairingError('PAIR_LINK_TOO_LARGE', 'O link excede o tamanho maximo de 256 KiB.');
  }
  const normalized = s.replace(/[ \t\r\n]/g, '');
  if (!normalized) throw pairingError('PAIR_EMPTY_LINK', 'Cole o link recebido.');
  const encoded = normalized.replace(/^prosa:\/\/pair\/?/, '').replace(/^#/, '');
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(encoded)) {
    throw pairingError('PAIR_INVALID_LINK', INVALID_LINK);
  }
  let payload;
  try {
    payload = JSON.parse(dec.decode(unb64url(encoded)));
  } catch {
    throw pairingError('PAIR_INVALID_LINK', INVALID_LINK);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || !Object.hasOwn(payload, 'v')) {
    throw pairingError('PAIR_INVALID_LINK', INVALID_LINK);
  }
  if (payload.v !== 1) {
    throw pairingError('PAIR_UNSUPPORTED_VERSION', 'Este link usa uma versao nao suportada.');
  }
  if (!['offer', 'answer'].includes(payload.t)
    || typeof payload.sdp !== 'string' || !payload.sdp.trim()) {
    throw pairingError('PAIR_INVALID_LINK', INVALID_LINK);
  }
  if (expectedType && payload.t !== expectedType) {
    throw expectedType === 'offer'
      ? pairingError('PAIR_EXPECTED_OFFER', 'Este link e uma resposta. Use a janela que criou o convite.')
      : pairingError('PAIR_EXPECTED_ANSWER', 'Esta janela aguarda uma resposta. Peca ao amigo para usar Copiar resposta.');
  }
  return payload;
}

// A: cria pc + dc, aguarda ICE completo (ou timeout de segurança), devolve link.
// Timeout alto: o link precisa dos candidatos srflx — gerá-lo cedo demais
// produzia convites host-only que falhavam silenciosamente em redes remotas.
export async function createPairingOffer({ iceServers, timeoutMs = 20000, signal } = {}) {
  const attempt = openPairing(iceServers, signal, 'A');
  const { pc, cands } = attempt;
  try {
    const dc = pc.createDataChannel('prosa', { ordered: true });
    const offer = await pc.createOffer();
    signal?.throwIfAborted();
    await pc.setLocalDescription(offer);
    const gather = await waitIce(pc, timeoutMs, signal);
    logDiag('A.waitIce', gather + ' ' + JSON.stringify(cands.snapshot()));
    return {
      pc, dc,
      timedOut: gather === 'timeout',
      link: 'prosa://pair/' + encodePairPayload({ t: 'offer', sdp: pc.localDescription.sdp, v: 1 }),
    };
  } catch (e) {
    attempt.close();
    throw e;
  } finally { attempt.release(); }
}

// B: recebe link de A, gera resposta para colar de volta.
export async function acceptPairingOffer(link, { iceServers, timeoutMs = 20000, signal } = {}) {
  const { sdp } = decodePairPayload(link, 'offer');
  const attempt = openPairing(iceServers, signal, 'B');
  const { pc, cands } = attempt;
  // O canal anunciado por A só chega quando ICE+DTLS fecham — ou seja, depois
  // que A aplicar a resposta. Aguardar dcPromise aqui criaria deadlock (B
  // esperando a conexão que depende do próprio link que ele ainda não gerou).
  const dcPromise = new Promise(res => {
    pc.ondatachannel = (e) => {
      if (signal?.aborted || attempt.closed()) e.channel.close();
      else res(e.channel);
    };
  });
  try {
    await pc.setRemoteDescription({ type: 'offer', sdp });
    signal?.throwIfAborted();
    const answer = await pc.createAnswer();
    signal?.throwIfAborted();
    await pc.setLocalDescription(answer);
    const gather = await waitIce(pc, timeoutMs, signal);
    logDiag('B.waitIce', gather + ' ' + JSON.stringify(cands.snapshot()));
    return {
      pc, dcPromise,
      timedOut: gather === 'timeout',
      link: 'prosa://pair/' + encodePairPayload({ t: 'answer', sdp: pc.localDescription.sdp, v: 1 }),
    };
  } catch (e) {
    attempt.close();
    throw e;
  } finally { attempt.release(); }
}

function openPairing(iceServers, signal, side) {
  signal?.throwIfAborted();
  const pc = new RTCPeerConnection({ iceServers: iceServers || getLocalConfig().iceServers });
  const cands = diagCandidates();
  watchPc(pc, side, cands);
  let closed = false;
  const close = () => {
    if (!closed) { closed = true; pc.close?.(); }
  };
  signal?.addEventListener('abort', close, { once: true });
  return {
    pc, cands, close, closed: () => closed,
    release: () => signal?.removeEventListener('abort', close),
  };
}

// A: cola a resposta de B para concluir.
export async function completePairing(pc, answerLink) {
  const payload = decodePairPayload(answerLink, 'answer');
  // RFC 8845: answer não pode usar actpass — só active/passive.
  // Normaliza stacks que emitem actpass na resposta.
  const sdp = payload.sdp.replace(/^a=setup:(?!active|passive)\w+$/gm, 'a=setup:active');
  await pc.setRemoteDescription({ type: 'answer', sdp });
  logDiag('A.complete', 'answer applied');
}

// Instrumentação opt-in ([p2p:diag]) — usa addEventListener para coexistir
// com os handlers funcionais do pareamento e do rtc.js.
function watchPc(pc, side, cands) {
  pc.addEventListener('icecandidate', (e) => {
    if (!e.candidate) { logDiag(side + '.ice.end', 'null'); return; }
    cands?.add(e.candidate.candidate || '');
  });
  pc.addEventListener('icecandidateerror', (e) =>
    logDiag(side + '.iceerror', { code: e.errorCode, url: e.url }));
  pc.addEventListener('icegatheringstatechange', () =>
    logDiag(side + '.gather', pc.iceGatheringState));
  pc.addEventListener('iceconnectionstatechange', () =>
    logDiag(side + '.icestate', pc.iceConnectionState));
  pc.addEventListener('connectionstatechange', () =>
    logDiag(side + '.connstate', pc.connectionState));
}

function waitIce(pc, ms, signal) {
  return new Promise((resolve, reject) => {
    let timer;
    const finish = (error, result) => {
      clearTimeout(timer);
      if (pc.onicegatheringstatechange === onGather) pc.onicegatheringstatechange = null;
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve(result);
    };
    const onAbort = () => finish(signal.reason || new DOMException('Pairing cancelled', 'AbortError'));
    const onGather = () => {
      if (pc.iceGatheringState === 'complete') finish(null, 'complete');
    };
    if (signal?.aborted) { onAbort(); return; }
    if (pc.iceGatheringState === 'complete') { resolve('complete'); return; }
    pc.onicegatheringstatechange = onGather;
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => finish(null, 'timeout'), ms);
  });
}

export function attachChannel(pc, dc, { onOpen, onMessage, onClose } = {}) {
  dc.onclose = (e) => { logDiag('dc.close', ''); onClose?.(e); };
  dc.onerror = (e) => logDiag('dc.error', e.message || 'err');
  dc.onmessage = (e) => {
    let env;
    try { env = JSON.parse(e.data); } catch { return; }
    onMessage?.(env);
  };
  // se o canal já abriu (attach após handshake hello), onopen não dispara de
  // novo — executa a lógica de abertura imediatamente (addPeer, sync…)
  if (dc.readyState === 'open') { logDiag('dc.open', 'already-open'); onOpen?.(); }
  else dc.onopen = (e) => { logDiag('dc.open', ''); onOpen?.(e); };
}
