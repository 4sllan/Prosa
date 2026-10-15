// p2p/pairing.js — pareamento manual por link (offer/answer).
// A gera link "prosa://pair?<payload>" com offer SDP + fingerprint;
// B abre o link, gera resposta; A cola a resposta e o DataChannel abre.
import { b64url, unb64url } from './identity.js';
import { getLocalConfig } from './localconfig.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

export function encodePairPayload(obj) {
  const bytes = enc.encode(JSON.stringify(obj));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return b64url(new Uint8Array([...bin].map(c => c.charCodeAt(0))));
}
export function decodePairPayload(s) {
  const bytes = unb64url(s.replace(/^prosa:\/\/pair\/?/, '').replace(/^#/, ''));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  try {
    return JSON.parse(bin);
  } catch {
    throw new Error('Link de pareamento inválido ou incompleto — copie o link inteiro (prosa://pair/...)');
  }
}

// A: cria pc + dc, aguarda ICE completo (ou timeout), devolve link.
export async function createPairingOffer({ iceServers, timeoutMs = 8000 } = {}) {
  const pc = new RTCPeerConnection({ iceServers: iceServers || getLocalConfig().iceServers });
  const dc = pc.createDataChannel('prosa', { ordered: true });
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIce(pc, timeoutMs);
  return {
    pc, dc,
    link: 'prosa://pair/' + encodePairPayload({ t: 'offer', sdp: pc.localDescription.sdp, v: 1 }),
  };
}

// B: recebe link de A, gera resposta para colar de volta.
export async function acceptPairingOffer(link, { iceServers, timeoutMs = 8000 } = {}) {
  const { sdp } = decodePairPayload(link);
  const pc = new RTCPeerConnection({ iceServers: iceServers || getLocalConfig().iceServers });
  // O canal anunciado por A só chega quando ICE+DTLS fecham — ou seja, depois
  // que A aplicar a resposta. Aguardar dcPromise aqui criaria deadlock (B
  // esperando a conexão que depende do próprio link que ele ainda não gerou).
  const dcPromise = new Promise(res => { pc.ondatachannel = (e) => res(e.channel); });
  await pc.setRemoteDescription({ type: 'offer', sdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitIce(pc, timeoutMs);
  return {
    pc, dcPromise,
    link: 'prosa://pair/' + encodePairPayload({ t: 'answer', sdp: pc.localDescription.sdp, v: 1 }),
  };
}

// A: cola a resposta de B para concluir.
export async function completePairing(pc, answerLink) {
  const payload = decodePairPayload(answerLink);
  if (payload.t !== 'answer' || !payload.sdp) {
    throw new Error('Esse link não é uma resposta. Cole o link gerado pelo amigo com "Aceitar convite".');
  }
  // RFC 8845: answer não pode usar actpass — só active/passive.
  // Normaliza stacks que emitem actpass na resposta.
  const sdp = payload.sdp.replace(/^a=setup:(?!active|passive)\w+$/gm, 'a=setup:active');
  await pc.setRemoteDescription({ type: 'answer', sdp });
}

function waitIce(pc, ms) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const t = setTimeout(resolve, ms); // continua com candidatos parciais (host)
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(); }
    };
  });
}

export function attachChannel(pc, dc, { onOpen, onMessage, onClose } = {}) {
  dc.onclose = onClose;
  dc.onmessage = (e) => {
    let env;
    try { env = JSON.parse(e.data); } catch { return; }
    onMessage?.(env);
  };
  // se o canal já abriu (attach após handshake hello), onopen não dispara de
  // novo — executa a lógica de abertura imediatamente (addPeer, sync…)
  if (dc.readyState === 'open') onOpen?.();
  else dc.onopen = onOpen;
}
