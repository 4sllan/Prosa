<template>
  <div class="pairing">
    <div class="pp-head">
      <h3>Rede P2P</h3>
      <span class="peers" :title="`${peers.length} peer(s) online`">{{ peers.length }} peer(s)</span>
    </div>

    <div class="id-card" @click="copyKey" :title="'Clique para copiar sua chave — ' + myKey">
      <span class="label">Sua chave</span>
      <code class="key">{{ shortKey }}</code>
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
      <p class="error" v-if="err">{{ err }}</p>
      <p class="ok" v-if="lastPeer">Peer conectado: <code>{{ lastPeer.slice(0, 16) }}…</code></p>
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
import * as contacts from '../services/p2p/contacts.js';
import { loadRelationships } from '../stores.js';

const offerLink = ref('');
const answerLink = ref('');
const remoteLink = ref('');
const contactKey = ref('');
const pendingOffer = ref(null);
const peers = ref([]);
const lastPeer = ref('');
const busy = ref(false);
const err = ref('');

const myKey = computed(() => getP2PNode().identity.pubKeyHex);
const shortKey = computed(() => myKey.value.slice(0, 20) + '…');

function refreshPeers() { peers.value = p2pTransport.peerIds(); }
onMounted(() => {
  refreshPeers();
  p2pTransport.on('peer.open', refreshPeers);
  p2pTransport.on('peer.closed', refreshPeers);
});

function copyKey() { navigator.clipboard?.writeText(myKey.value).catch(() => {}); }

function wirePeer(pc, dc) {
  // O peerId real só é conhecido após o handshake 'hello' na DataChannel:
  // cada lado envia sua pubkey ao abrir e o canal é registrado com esse id.
  const node = getP2PNode();
  dc.onopen = async () => {
    dc.send(JSON.stringify({ v: 1, id: 'hello:' + Date.now(), type: 'hello', from: node.identity.pubKeyHex, body: {} }));
  };
  dc.addEventListener('message', (e) => {
    try {
      const m = JSON.parse(e.data);
      if (m.type === 'hello' && m.from && !p2pTransport.isOnline(m.from)) {
        node.attachPeer(m.from, pc, dc);
        lastPeer.value = m.from;
        err.value = '';
        refreshPeers();
      }
    } catch {}
  });
}

async function makeOffer() {
  busy.value = true; err.value = '';
  try {
    const { pc, dc, link } = await createPairingOffer();
    offerLink.value = link;
    pendingOffer.value = { pc, dc };
    wirePeer(pc, dc);
  } catch (e) { err.value = e.message; }
  busy.value = false;
}

async function answerOffer() {
  busy.value = true; err.value = '';
  try {
    const { pc, dc, link } = await acceptPairingOffer(remoteLink.value);
    answerLink.value = link;
    wirePeer(pc, dc);
  } catch (e) { err.value = e.message; }
  busy.value = false;
}

async function finish() {
  busy.value = true; err.value = '';
  try {
    await completePairing(pendingOffer.value.pc, remoteLink.value);
  } catch (e) { err.value = e.message; }
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
.ok { color: #51cf66; margin: 0; font-size: 11px; }
.add { display: flex; gap: 6px; border-top: 1px solid rgba(255,255,255,.08); padding-top: 10px; }
</style>
