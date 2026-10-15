<template>
  <div class="pairing">
    <div class="pp-head">
      <h3>Rede P2P</h3>
      <span class="peers" :title="`${peers.length} peer(s) online`">{{ peers.length }} peer(s)</span>
    </div>

    <div class="id-card" @click="copyKey" :title="'Clique para copiar sua chave — ' + myKey">
      <span class="label">Sua chave</span>
      <code class="key">{{ shortKey }}</code>
      <span class="label" style="margin-top:6px">Fingerprint (confira com o amigo)</span>
      <code class="key">{{ myFp }}</code>
    </div>

    <div class="steps">
      <button class="btn" @click="makeOffer" :disabled="busy">Gerar convite</button>
      <p class="hint">Envie o link ao amigo por qualquer canal.</p>
      <textarea v-if="offerLink" readonly :value="offerLink" rows="3" @focus="$event.target.select()"/>

      <div class="row">
        <input v-model="remoteLink" placeholder="Cole o link do amigo (prosa://pair/...)" />
      </div>
      <div class="row">
        <button class="btn ghost" @click="answerOffer" :disabled="busy || !remoteLink">Aceitar convite</button>
        <button class="btn ghost" @click="finish" :disabled="busy || !remoteLink || !pendingOffer">Completar</button>
      </div>
      <textarea v-if="answerLink" readonly :value="answerLink" rows="3" @focus="$event.target.select()"/>
      <p class="status" v-if="status && !lastPeer">{{ status }}</p>
      <p class="warn" v-if="warn">{{ warn }}</p>
      <p class="error" v-if="err">{{ err }}</p>
      <p class="ok" v-if="lastPeer">Peer conectado: <code>{{ lastPeerFp || lastPeer.slice(0, 16) + '…' }}</code></p>

      <div class="known" v-if="knownPeers.length">
        <span class="label">Peers conhecidos</span>
        <div class="krow" v-for="p in knownPeers" :key="p.pubkey">
          <code class="key">{{ p.fingerprint || p.pubkey.slice(0, 16) + '…' }}</code>
          <span :class="p.online ? 'ok' : 'dim'">{{ p.online ? 'online' : 'offline' }}</span>
        </div>
      </div>
    </div>

    <div class="add">
      <input v-model="contactKey" placeholder="Chave pública do contato (hex)" />
      <button class="btn" @click="addContact" :disabled="!contactKey">Adicionar contato</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { store } from '../stores.js';
import { getP2PNode } from '../services/p2p/node.js';
import { p2pTransport } from '../services/p2p/transport.js';
import { createPairingOffer, acceptPairingOffer, completePairing } from '../services/p2p/pairing.js';
import { logDiag, diagFingerprint } from '../services/p2p/diag.js';
import { fingerprintOf } from '../services/p2p/identity.js';
import { makeHello, verifyHello } from '../services/p2p/hello.js';
import * as contacts from '../services/p2p/contacts.js';
import { loadRelationships } from '../stores.js';

const offerLink = ref('');
const answerLink = ref('');
const remoteLink = ref('');
const contactKey = ref('');
const pendingOffer = ref(null);
const peers = ref([]);
const lastPeer = ref('');
const lastPeerFp = ref('');
const busy = ref(false);
const err = ref('');
const warn = ref('');
const status = ref('');
const knownPeers = ref([]);

const myKey = computed(() => getP2PNode().identity.pubKeyHex);
const shortKey = computed(() => myKey.value.slice(0, 20) + '…');
const myFp = computed(() => getP2PNode().identity.fingerprint || '');


function refreshPeers() { peers.value = p2pTransport.peerIds(); }
async function refreshKnown() {
  try {
    const map = await getP2PNode().knownPeers() || {};
    knownPeers.value = Object.entries(map).map(([pubkey, p]) => ({
      pubkey, ...p, online: p2pTransport.isOnline(pubkey),
    }));
  } catch {}
}
onMounted(() => {
  refreshPeers();
  refreshKnown();
  p2pTransport.on('peer.open', refreshPeers);
  p2pTransport.on('peer.closed', refreshPeers);
  p2pTransport.on('peer.open', refreshKnown);
  p2pTransport.on('peer.closed', refreshKnown);
});

function copyKey() { navigator.clipboard?.writeText(myKey.value).catch(() => {}); }

function wirePeer(pc, dc) {
  // O peerId real só é conhecido após o handshake 'hello' na DataChannel:
  // cada lado envia sua pubkey ao abrir e o canal é registrado com esse id.
  const node = getP2PNode();
  dc.onopen = async () => {
    logDiag('dc.open', '');
    status.value = 'Canal aberto — aguardando handshake…';
    // hello v2: assina 'hello|pubkey|ts' provando posse da chave anunciada
    dc.send(JSON.stringify(await makeHello(node.identity)));
    logDiag('hello.sent', 'v2');
  };
  dc.onerror = (e) => logDiag('dc.error', e.message || 'err');
  dc.addEventListener('message', async (e) => {
    try {
      const m = JSON.parse(e.data);
      if (m.type !== 'hello' || !m.from || p2pTransport.isOnline(m.from)) return;
      logDiag('hello.recv', diagFingerprint(m.from));
      const check = await verifyHello(node.identity, m);
      if (!check.ok) { logDiag('hello.reject', diagFingerprint(m.from)); return; }
      // legado v1 sem assinatura — aceita com aviso; fingerprint na UI é a conferência
      if (check.legacy) logDiag('hello.legacy', diagFingerprint(m.from));
      // keepalive só em hello v2 assinado — legado v1 não responde 'ping'
      node.attachPeer(m.from, pc, dc, { keepalive: !check.legacy });
      logDiag('peer.attach', diagFingerprint(m.from));
      status.value = '';
      lastPeer.value = m.from;
      lastPeerFp.value = await fingerprintOf(m.from);
      err.value = '';
      refreshPeers();
    } catch {}
  });
}

async function makeOffer() {
  busy.value = true; err.value = ''; warn.value = ''; status.value = 'Coletando candidatos…';
  try {
    const { pc, dc, link, timedOut } = await createPairingOffer();
    offerLink.value = link;
    pendingOffer.value = { pc, dc };
    wirePeer(pc, dc);
    status.value = 'Convite gerado — envie o link e aguarde a resposta';
    if (timedOut) warn.value = 'Candidatos podem estar incompletos — a conexão pode falhar em redes remotas';
  } catch (e) { err.value = e.message; status.value = ''; }
  busy.value = false;
}

async function answerOffer() {
  busy.value = true; err.value = ''; warn.value = ''; status.value = 'Coletando candidatos…';
  try {
    const { pc, dcPromise, link, timedOut } = await acceptPairingOffer(remoteLink.value);
    answerLink.value = link;
    status.value = 'Resposta gerada — envie o link de volta ao amigo';
    if (timedOut) warn.value = 'Candidatos podem estar incompletos — a conexão pode falhar em redes remotas';
    // canal abre quando A completar o pareamento — liga os handlers então
    dcPromise.then(dc => { status.value = 'Conectando…'; wirePeer(pc, dc); });
  } catch (e) { err.value = e.message; status.value = ''; }
  busy.value = false;
}

async function finish() {
  busy.value = true; err.value = ''; status.value = 'Conectando…';
  try {
    await completePairing(pendingOffer.value.pc, remoteLink.value);
  } catch (e) { err.value = e.message; status.value = ''; }
  busy.value = false;
}

async function addContact() {
  err.value = '';
  try {
    await contacts.requestContact(getP2PNode().identity, { pubkey: contactKey.value.trim() });
    contactKey.value = '';
    await loadRelationships();
  } catch (e) { err.value = e.message; }
}
</script>

<style scoped>
.pairing { padding: 10px; display: flex; flex-direction: column; gap: 10px; font-size: 13px; }
.pp-head { display: flex; justify-content: space-between; align-items: center; }
.pp-head h3 { margin: 0; font-size: 13px; text-transform: uppercase; color: var(--muted, #9aa0b4); letter-spacing: .08em; }
.peers { font-size: 11px; color: var(--accent, #7c5cff); }
.id-card { background: rgba(255,255,255,.05); border-radius: 8px; padding: 8px 10px; cursor: pointer; }
.id-card .label { display: block; font-size: 10px; color: var(--muted, #9aa0b4); text-transform: uppercase; }
.id-card .key { font-size: 12px; word-break: break-all; }
.steps { display: flex; flex-direction: column; gap: 6px; }
.hint { margin: 0; font-size: 11px; color: var(--muted, #9aa0b4); }
.row { display: flex; gap: 6px; }
.btn { background: var(--accent, #7c5cff); color: #fff; border: 0; border-radius: 6px; padding: 7px 10px; cursor: pointer; font-size: 12px; }
.btn:disabled { opacity: .5; cursor: default; }
.btn.ghost { background: rgba(255,255,255,.08); }
textarea, input { width: 100%; background: rgba(0,0,0,.3); color: inherit; border: 1px solid rgba(255,255,255,.12); border-radius: 6px; padding: 7px 8px; font-size: 11px; font-family: inherit; resize: vertical; }
.error { color: #ff6b6b; margin: 0; font-size: 11px; }
.warn { color: #ffd43b; margin: 0; font-size: 11px; }
.status { color: var(--fg-dim, #b8bfd4); margin: 0; font-size: 11px; }
.ok { color: #51cf66; margin: 0; font-size: 11px; }
.dim { color: var(--muted, #9aa0b4); margin: 0; font-size: 11px; }
.known { margin-top: 8px; border-top: 1px solid rgba(255,255,255,.08); padding-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.known .label { font-size: 10px; color: var(--muted, #9aa0b4); text-transform: uppercase; }
.krow { display: flex; justify-content: space-between; align-items: center; font-size: 11px; }
.add { display: flex; gap: 6px; border-top: 1px solid rgba(255,255,255,.08); padding-top: 10px; }
</style>
