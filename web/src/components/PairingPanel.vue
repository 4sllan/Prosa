<template>
  <div class="pairing">
    <div class="pp-head">
      <h3>Rede P2P</h3>
      <span class="peers" :title="`${peers.length} peer(s) online`">{{ peers.length }} peer(s)</span>
    </div>

    <div class="steps">
      <div class="flow-heading" role="status" aria-live="polite">
        <h4>{{ phase }}</h4>
        <p class="hint">{{ instruction }}</p>
      </div>
      <button v-if="pair.step === 'idle'" class="btn" @click="flow.createInvite">Criar convite</button>
      <template v-if="pair.link">
        <button class="btn" @click="flow.copyLink" :disabled="pair.copying">
          {{ pair.copying ? 'Copiando…' : pair.linkType === 'offer' ? 'Copiar convite' : 'Copiar resposta' }}
        </button>
        <details :key="pair.link" class="link-details" :open="pair.copyError">
          <summary>Ver link</summary>
          <textarea readonly :value="pair.link" rows="3" aria-label="Link completo para copiar manualmente"
                    @focus="$event.target.select()" @click="$event.target.select()"/>
        </details>
      </template>
      <div v-if="canReceive" class="receive-link">
        <label for="pairing-remote-link">Cole o link recebido</label>
        <textarea id="pairing-remote-link" v-model="remoteLink" rows="2"
                  placeholder="Cole aqui o convite ou a resposta do amigo" :disabled="busy"/>
        <button class="btn" @click="flow.continueWithLink(remoteLink)" :disabled="busy || !remoteLink.trim()">Continuar</button>
      </div>
      <p v-if="pair.notice" class="status" role="status" aria-live="polite">{{ pair.notice }}</p>
      <p v-if="pair.warning" class="warn">{{ pair.warning }}</p>
      <p v-if="pair.error" class="error" role="alert">{{ pair.error }}</p>
      <p v-if="pair.peerId" class="ok">Peer conectado: <code>{{ lastPeerFp || pair.peerId.slice(0, 16) + '…' }}</code></p>
      <button v-if="pair.relationship === 'removed' && pair.peerId" class="btn ghost"
              :disabled="requestSending" @click="resendRequest">
        {{ requestSending ? 'Enviando…' : 'Solicitar amizade novamente' }}
      </button>
      <p v-if="requestErr" class="error" role="alert">{{ requestErr }}</p>
      <p v-if="pair.legacy" class="warn" role="status">Handshake legado sem prova de posse — confira com o amigo o fingerprint em “Detalhes da conexão”.</p>
      <button v-if="pair.step !== 'idle'" class="btn ghost restart" @click="restart">Recomeçar pareamento</button>
    </div>

    <details class="connection-details">
      <summary>Detalhes da conexão</summary>
      <div class="connection-body">
        <div class="id-card">
          <div class="key-head">
            <span id="p2p-public-key-label" class="label">Sua chave</span>
            <button class="btn ghost" @click="copyKey" :disabled="keyCopying" :aria-busy="keyCopying"
                    aria-describedby="p2p-public-key-label" title="Copiar sua chave pública completa">
              {{ keyCopying ? 'Copiando…' : 'Copiar chave' }}
            </button>
          </div>
          <code id="p2p-public-key" class="key">{{ myKey }}</code>
          <span class="label" style="margin-top:6px">Fingerprint (confira com o amigo)</span>
          <code class="key">{{ myFp }}</code>
        </div>
        <div class="known" v-if="knownPeers.length">
          <span class="label">Peers conhecidos</span>
          <div class="krow" v-for="p in knownPeers" :key="p.pubkey">
            <code class="key">{{ p.fingerprint || p.pubkey.slice(0, 16) + '…' }}</code>
            <span :class="p.online ? 'ok' : 'dim'">{{ p.online ? 'online' : 'offline' }}</span>
            <button v-if="p.online" class="btn ghost" title="Encerrar a conexão com este peer — o contato é mantido"
                    @click="disconnectPeer(p.pubkey)">Desconectar</button>
          </div>
        </div>
        <div class="add">
          <input v-model="contactKey" placeholder="Chave pública do contato (hex)" aria-label="Chave pública do contato" />
          <button class="btn" @click="addContact" :disabled="!contactKey">Adicionar contato</button>
        </div>
        <p v-if="contactErr" class="error" role="alert">{{ contactErr }}</p>
      </div>
    </details>
    <p class="copy-announcement" role="status" aria-live="polite" aria-atomic="true">{{ keyNotice }}</p>
    <p v-if="keyNotice" class="status key-feedback" aria-hidden="true">{{ keyNotice }}</p>
    <p v-if="keyErr" class="error key-feedback" role="alert">{{ keyErr }}</p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { getP2PNode } from '../services/p2p/node.js';
import { p2pTransport } from '../services/p2p/transport.js';
import { fingerprintOf } from '../services/p2p/identity.js';
import { createPairingFlow, isPairingBusy } from '../services/p2p/pairing-flow.js';
import { writeClipboardText } from '../services/p2p/clipboard.js';
import * as contacts from '../services/p2p/contacts.js';
import { loadRelationships } from '../stores.js';

const remoteLink = ref('');
const contactKey = ref('');
const peers = ref([]);
const lastPeerFp = ref('');
const contactErr = ref('');
const requestErr = ref('');
const requestSending = ref(false);
const keyCopying = ref(false);
const keyNotice = ref('');
const keyErr = ref('');
let unmounted = false;
const knownPeers = ref([]);
const pair = ref({});
const subscriptions = [];
const flow = createPairingFlow({ node: getP2PNode(), onChange: state => { pair.value = state; } });
const busy = computed(() => isPairingBusy(pair.value.step));
const canReceive = computed(() => ['idle', 'awaiting-response'].includes(pair.value.step));
const phase = computed(() => ({
  idle: 'Conecte-se a um amigo',
  'generating-offer': 'Preparando seu convite…',
  'awaiting-response': '1. Envie o convite',
  'generating-answer': 'Preparando a resposta…',
  'response-ready': '2. Devolva a resposta',
  connecting: 'Conectando…',
  connected: 'Conexão estabelecida',
  error: 'Vamos tentar novamente',
}[pair.value.step]));
const instruction = computed(() => ({
  idle: 'Crie um convite ou cole o link que seu amigo enviou.',
  'generating-offer': 'Aguarde enquanto preparamos a conexão.',
  'awaiting-response': 'Copie o convite e envie ao amigo. Depois, cole a resposta dele abaixo.',
  'generating-answer': 'Aguarde enquanto preparamos o link de volta.',
  'response-ready': 'Copie esta resposta e envie de volta a quem criou o convite. Aguarde ele continuar.',
  connecting: 'Aguarde a conexão e a conferência de identidade. Se não avançar, você pode recomeçar.',
  connected: 'Conexão de rede não significa amizade. Solicitações recebidas precisam ser aceitas em Amigos.',
  error: 'Você pode recomeçar sem apagar contatos ou encerrar outros peers conectados.',
}[pair.value.step]));
watch(() => pair.value.peerId, async peerId => {
  lastPeerFp.value = '';
  if (!peerId) return;
  const fingerprint = await fingerprintOf(peerId);
  if (pair.value.peerId === peerId) lastPeerFp.value = fingerprint;
});

const myKey = computed(() => getP2PNode().identity.pubKeyHex);
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
  for (const type of ['peer.open', 'peer.closed']) {
    subscriptions.push(p2pTransport.on(type, refreshPeers), p2pTransport.on(type, refreshKnown));
  }
});
onUnmounted(() => {
  unmounted = true;
  flow.dispose();
  subscriptions.forEach(unsubscribe => unsubscribe());
});

async function copyKey() {
  if (keyCopying.value) return;
  keyCopying.value = true;
  keyNotice.value = '';
  keyErr.value = '';
  try {
    await writeClipboardText(myKey.value);
    if (!unmounted) keyNotice.value = 'Chave pública copiada.';
  } catch {
    if (!unmounted) keyErr.value = 'Não foi possível copiar a chave. Tente novamente.';
  } finally {
    if (!unmounted) keyCopying.value = false;
  }
}

function restart() { flow.restart(); remoteLink.value = ''; }

// desconecta só o transporte: o contato/amigo permanece na lista
function disconnectPeer(pubkey) {
  p2pTransport.dropPeer(pubkey, 'user-disconnect');
  refreshPeers();
  refreshKnown();
}

async function addContact() {
  contactErr.value = '';
  try {
    await contacts.requestContact(getP2PNode().identity, { pubkey: contactKey.value.trim() });
    contactKey.value = '';
    await loadRelationships();
  } catch (e) { contactErr.value = e.message; }
}

// re-solicita amizade para o peer conectado cujo contato foi removido
async function resendRequest() {
  if (requestSending.value || !pair.value.peerId) return;
  requestSending.value = true;
  requestErr.value = '';
  try {
    await contacts.requestContact(getP2PNode().identity, { pubkey: pair.value.peerId });
    await loadRelationships();
  } catch (e) { requestErr.value = e.message; }
  finally { requestSending.value = false; }
}
</script>

<style scoped>
.pairing { padding: 10px; display: flex; flex-direction: column; gap: 10px; font-size: 13px; }
.pp-head { display: flex; justify-content: space-between; align-items: center; }
.pp-head h3 { margin: 0; font-size: 13px; text-transform: uppercase; color: var(--muted, #9aa0b4); letter-spacing: .08em; }
.peers { font-size: 11px; color: var(--accent, #7c5cff); }
.connection-details { min-width: 0; border-top: 1px solid var(--border); padding-top: 4px; }
.connection-details > summary { cursor: pointer; padding: 8px 0; color: var(--fg-dim); font-weight: 600; }
.connection-body { display: flex; flex-direction: column; gap: 10px; padding-top: 6px; }
.id-card { background: rgba(255,255,255,.05); border-radius: 8px; padding: 8px 10px; }
.key-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 6px; }
.key-head .btn { flex-shrink: 0; }
.copy-announcement { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.id-card .label { display: block; font-size: 10px; color: var(--muted, #9aa0b4); text-transform: uppercase; }
.id-card .key { font-size: 12px; word-break: break-all; }
.steps { display: flex; flex-direction: column; gap: 6px; }
.flow-heading { margin-bottom: 6px; }
.flow-heading h4 { margin: 0 0 6px; font-size: 16px; }
.receive-link { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.receive-link label { font-weight: 600; }
.link-details { min-width: 0; color: var(--fg-dim, #b8bfd4); }
.link-details summary { cursor: pointer; padding: 6px 0; width: fit-content; }
.restart { align-self: flex-start; margin-top: 8px; }
.btn:focus-visible, summary:focus-visible { outline: 2px solid var(--fg, #fff); outline-offset: 3px; }
.hint { margin: 0; font-size: 11px; color: var(--muted, #9aa0b4); }
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
.krow { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 11px; }
.krow .btn { padding: 3px 8px; font-size: 11px; flex-shrink: 0; }
.add { display: flex; gap: 6px; border-top: 1px solid rgba(255,255,255,.08); padding-top: 10px; }
</style>
