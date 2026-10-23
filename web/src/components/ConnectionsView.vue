<template>
  <div class="cx">
    <header class="cx-head">
      <span class="cx-title"><Users :size="18" aria-hidden="true" /> Conexões</span>
      <nav class="cx-tabs" role="tablist" aria-label="Filtrar conexões">
        <button v-for="t in TABS" :key="t.id" role="tab" :aria-selected="tab === t.id"
                class="cx-tab" :class="{ active: tab === t.id }" @click="tab = t.id">
          {{ t.label }}
        </button>
      </nav>
    </header>

    <div class="cx-body">
      <section class="cx-card cx-p2p">
        <div class="cx-p2p-top">
          <span class="cx-p2p-icon"><RadioTower :size="20" aria-hidden="true" /></span>
          <div class="cx-p2p-info">
            <h3>Rede P2P</h3>
            <p>Crie conexões diretas ou entre em salas privadas.</p>
          </div>
          <button class="btn ghost" :disabled="busy" @click="flow.createInvite">Criar convite</button>
        </div>

        <div v-if="pair.step !== 'idle'" class="cx-flow" role="status" aria-live="polite">
          <h4 class="cx-flow-phase">{{ phase }}</h4>
          <p class="cx-hint">{{ instruction }}</p>
        </div>
        <button v-if="pair.link" class="btn ghost sm" @click="flow.copyLink" :disabled="pair.copying">
          {{ pair.copying ? 'Copiando…' : pair.linkType === 'offer' ? 'Copiar convite' : 'Copiar resposta' }}
        </button>
        <details v-if="pair.link" :key="pair.link" class="cx-link" :open="pair.copyError">
          <summary>Ver link</summary>
          <textarea readonly :value="pair.link" rows="3" aria-label="Link completo para copiar manualmente"
                    @focus="$event.target.select()" @click="$event.target.select()"></textarea>
        </details>

        <div class="cx-add">
          <Search :size="14" aria-hidden="true" class="cx-add-ic" />
          <input v-model="addInput" placeholder="Adicionar por nome de usuário ou colar convite..."
                 :disabled="busy" @keydown.enter="submitAdd">
          <button class="btn primary" :disabled="busy || !addInput.trim()" @click="submitAdd">Adicionar</button>
        </div>
        <p v-if="addErr" class="cx-err" role="alert">{{ addErr }}</p>

        <div v-if="canReceive" class="cx-receive">
          <label for="cx-remote-link">Cole o link recebido</label>
          <textarea id="cx-remote-link" v-model="remoteLink" rows="2"
                    placeholder="Cole aqui o convite ou a resposta do amigo" :disabled="busy"></textarea>
          <button class="btn ghost sm" :disabled="busy || !remoteLink.trim()"
                  @click="flow.continueWithLink(remoteLink)">Continuar</button>
        </div>

        <p v-if="pair.notice" class="cx-note" role="status" aria-live="polite">{{ pair.notice }}</p>
        <p v-if="pair.warning" class="cx-warn">{{ pair.warning }}</p>
        <p v-if="pair.error" class="cx-err" role="alert">{{ pair.error }}</p>
        <p v-if="pair.peerId" class="cx-ok">Peer conectado: <code>{{ lastPeerFp || pair.peerId.slice(0, 16) + '…' }}</code></p>
        <button v-if="pair.relationship === 'removed' && pair.peerId" class="btn ghost sm"
                :disabled="requestSending" @click="resendRequest">
          {{ requestSending ? 'Enviando…' : 'Solicitar amizade novamente' }}
        </button>
        <p v-if="requestErr" class="cx-err" role="alert">{{ requestErr }}</p>
        <p v-if="pair.legacy" class="cx-warn" role="status">Handshake legado sem prova de posse — confira com o amigo o fingerprint em “Detalhes da conexão”.</p>
        <button v-if="pair.step !== 'idle'" class="btn ghost sm cx-restart" @click="restart">Recomeçar pareamento</button>

        <details class="cx-details">
          <summary>Detalhes da conexão</summary>
          <div class="cx-details-body">
            <div class="cx-idcard">
              <div class="cx-keyhead">
                <span id="cx-pubkey-label" class="cx-label">Sua chave</span>
                <button class="btn ghost sm" @click="copyKey" :disabled="keyCopying" :aria-busy="keyCopying"
                        aria-describedby="cx-pubkey-label" title="Copiar sua chave pública completa">
                  {{ keyCopying ? 'Copiando…' : 'Copiar chave' }}
                </button>
              </div>
              <code class="cx-key">{{ myKey }}</code>
              <span class="cx-label" style="margin-top:6px">Fingerprint (confira com o amigo)</span>
              <code class="cx-key">{{ myFp }}</code>
            </div>
            <div v-if="knownPeers.length" class="cx-known">
              <span class="cx-label">Peers conhecidos</span>
              <div class="cx-krow" v-for="p in knownPeers" :key="p.pubkey">
                <code class="cx-key">{{ p.fingerprint || p.pubkey.slice(0, 16) + '…' }}</code>
                <span :class="p.online ? 'cx-ok' : 'cx-dim'">{{ p.online ? 'online' : 'offline' }}</span>
                <button v-if="p.online" class="btn ghost sm"
                        title="Encerrar a conexão com este peer — o contato é mantido"
                        @click="disconnectPeer(p.pubkey)">Desconectar</button>
              </div>
            </div>
            <div class="cx-addct">
              <input v-model="contactKey" placeholder="Chave pública do contato (hex)"
                     aria-label="Chave pública do contato">
              <button class="btn ghost sm" @click="addContact" :disabled="!contactKey">Adicionar contato</button>
            </div>
            <p v-if="contactErr" class="cx-err" role="alert">{{ contactErr }}</p>
          </div>
        </details>
      </section>

      <p class="cx-sr" role="status" aria-live="polite" aria-atomic="true">{{ keyNotice }}</p>
      <p v-if="keyNotice" class="cx-note" aria-hidden="true">{{ keyNotice }}</p>
      <p v-if="keyErr" class="cx-err" role="alert">{{ keyErr }}</p>

      <p class="cx-sr" role="status" aria-live="polite" aria-atomic="true">{{ cancellationState.notice }}</p>
      <p v-if="cancellationState.notice" class="cx-note" aria-hidden="true">{{ cancellationState.notice }}</p>
      <p v-if="cancellationState.error" class="cx-err" role="alert">{{ cancellationState.error }}</p>
      <button v-if="cancellationState.needsReload" ref="refreshButton" class="btn ghost sm cx-refresh"
              :disabled="cancellationState.refreshing" :aria-busy="cancellationState.refreshing"
              @click="refreshAfterCancellation">
        {{ cancellationState.refreshing ? 'Atualizando…' : 'Atualizar lista' }}
      </button>
      <p v-if="relErr" class="cx-err" role="alert">{{ relErr }}</p>

      <h4 ref="outgoingHeading" tabindex="-1" class="cx-sec">{{ sectionLabel }}</h4>

      <div class="cx-list">
        <div v-for="r in visible" :key="r.id" class="cx-card cx-friend"
             :class="{ clickable: tab === 'all' }"
             :role="tab === 'all' ? 'button' : undefined" :tabindex="tab === 'all' ? 0 : undefined"
             @click="tab === 'all' && $emit('open-dm', r.user.id)"
             @keydown.enter="tab === 'all' && $emit('open-dm', r.user.id)"
             @keydown.space.prevent="tab === 'all' && $emit('open-dm', r.user.id)">
          <span class="cx-avatar">
            <img v-if="r.user.avatarUrl" :src="fullUrl(r.user.avatarUrl)">
            <template v-else>{{ ini(r.user.displayName) }}</template>
            <span class="dot" :class="presenceOf(r.user.id)"></span>
          </span>
          <div class="cx-friend-info">
            <div class="cx-friend-name">{{ r.user.displayName }}</div>
            <div class="cx-friend-sub">
              {{ tab === 'all' ? presenceLabel(r.user.id) : '@' + r.user.username }}
            </div>
          </div>
          <template v-if="tab === 'incoming'">
            <button class="btn primary sm" @click="acceptRel(r.user.id)">Aceitar</button>
            <button class="btn ghost sm" @click="removeRel(r.user.id)">Recusar</button>
          </template>
          <template v-if="tab === 'outgoing'">
            <span class="pill">pendente</span>
            <button class="btn ghost sm cx-cancel"
                    :disabled="cancellationState.pendingIds.includes(r.user.id) || cancellationState.needsReload"
                    :aria-busy="cancellationState.pendingIds.includes(r.user.id)"
                    :aria-label="'Cancelar convite para ' + r.user.displayName"
                    @click="cancelInvitation(r.user.id, $event)">
              {{ cancellationState.pendingIds.includes(r.user.id) ? 'Cancelando…' : 'Cancelar convite' }}
            </button>
          </template>
          <button v-if="tab === 'blocked'" class="btn ghost sm" @click="unblockRel(r.user.id)">Desbloquear</button>
        </div>
        <div v-if="!visible.length" class="cx-empty">Nenhum contato nesta aba.</div>
      </div>
    </div>

    <footer class="cx-status">
      <span class="cx-status-item">
        <span class="cx-live" :class="{ off: !store.wsConnected }"></span>
        Rede P2P {{ store.wsConnected ? 'ativa' : 'inativa' }}
      </span>
      <span class="cx-status-item">Peers online: {{ peers.length }}</span>
      <span class="cx-status-right"><BadgeCheck :size="12" aria-hidden="true" /> Versão {{ version }} (stable)</span>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { store, presenceOf, fullUrl, loadRelationships } from '../stores.js';
import { contacts } from '../services/index.js';
import { createInvitationCancellation } from '../services/invitation-cancellation.js';
import { p2pTransport } from '../services/p2p/transport.js';
import { getP2PNode } from '../services/p2p/node.js';
import { fingerprintOf } from '../services/p2p/identity.js';
import { decodePairPayload } from '../services/p2p/pairing.js';
import { createPairingFlow, isPairingBusy } from '../services/p2p/pairing-flow.js';
import { writeClipboardText } from '../services/p2p/clipboard.js';
import * as p2pContacts from '../services/p2p/contacts.js';
import { messageTime } from '../services/datetime.js';
import { version } from '../../package.json';
import { Users, RadioTower, Search, BadgeCheck } from 'lucide-vue-next';

defineEmits(['open-dm']);

const TABS = [
  { id: 'all', label: 'Todos', type: 'friend' },
  { id: 'incoming', label: 'Pendentes', type: 'incoming' },
  { id: 'outgoing', label: 'Enviadas', type: 'outgoing' },
  { id: 'blocked', label: 'Bloqueados', type: 'blocked' },
];

const tab = ref('all');
const addInput = ref('');
const addErr = ref('');
const remoteLink = ref('');
const peers = ref([]);
const lastPeerFp = ref('');
const requestSending = ref(false);
const requestErr = ref('');
const relErr = ref('');
const outgoingHeading = ref(null);
const refreshButton = ref(null);
const contactKey = ref('');
const contactErr = ref('');
const keyCopying = ref(false);
const keyNotice = ref('');
const keyErr = ref('');
const knownPeers = ref([]);
let unmounted = false;
const cancellationState = ref({});
const cancellation = createInvitationCancellation({
  remove: userId => contacts.remove(userId),
  reload: () => loadRelationships(),
  onChange: s => { cancellationState.value = s; },
  successMessage: 'Convite cancelado neste dispositivo. A entrega ao amigo nao e confirmada.',
});
const pair = ref({});
const subscriptions = [];
const flow = createPairingFlow({ node: getP2PNode(), onChange: s => { pair.value = s; } });
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

const activeType = computed(() => TABS.find(t => t.id === tab.value).type);
const visible = computed(() => store.relationships.filter(r => r.type === activeType.value));
const onlineFriends = computed(() =>
  store.relationships.filter(r => r.type === 'friend' && presenceOf(r.user.id) !== 'offline'));
const sectionLabel = computed(() =>
  tab.value === 'all'
    ? `Amigos disponíveis — ${onlineFriends.value.length}`
    : `${TABS.find(t => t.id === tab.value).label} — ${visible.value.length}`);

const ini = n => String(n || '?').slice(0, 2).toUpperCase();
const lastSeenLabel = (uid) => {
  const seen = knownPeers.value.find(p => p.pubkey === uid)?.lastSeen;
  return seen ? `Visto em ${messageTime(seen)}` : 'Desconectado';
};
// offline/invisible e qualquer estado fora do mapa caem no "visto por último"
const presenceLabel = uid => ({
  online: 'Disponível', idle: 'Ausente', dnd: 'Ocupado',
}[presenceOf(uid)] || lastSeenLabel(uid));

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
  cancellation.dispose();
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

// desconecta só o transporte: o contato/amigo permanece na lista
function disconnectPeer(pubkey) {
  p2pTransport.dropPeer(pubkey, 'user-disconnect');
  refreshPeers();
  refreshKnown();
}

async function addContact() {
  contactErr.value = '';
  try {
    await p2pContacts.requestContact(getP2PNode().identity, { pubkey: contactKey.value.trim() });
    contactKey.value = '';
    await loadRelationships();
  } catch (e) { contactErr.value = e.message; }
}

function restart() { flow.restart(); remoteLink.value = ''; }

// campo único: convite/resposta de pareamento → flow; pubkey hex → contato
async function submitAdd() {
  addErr.value = '';
  const input = addInput.value.trim();
  if (!input) return;
  let isPairLink = false;
  try { decodePairPayload(input); isPairLink = true; } catch {}
  if (isPairLink) {
    flow.continueWithLink(input);
    addInput.value = '';
    return;
  }
  if (/^[0-9a-fA-F]{64}$/.test(input)) {
    try { await contacts.request(input); addInput.value = ''; await loadRelationships(); }
    catch (e) { addErr.value = e.message; }
    return;
  }
  addErr.value = 'Formato não reconhecido. Cole um convite de pareamento ou a chave pública (64 caracteres hex).';
}

// re-solicita amizade para o peer conectado cujo contato foi removido
async function resendRequest() {
  if (requestSending.value || !pair.value.peerId) return;
  requestSending.value = true;
  requestErr.value = '';
  try {
    await p2pContacts.requestContact(getP2PNode().identity, { pubkey: pair.value.peerId });
    await loadRelationships();
  } catch (e) { requestErr.value = e.message; }
  finally { requestSending.value = false; }
}

async function cancelInvitation(userId, event) {
  relErr.value = '';
  const cancelled = await cancellation.cancel(userId);
  if (event?.detail === 0) {
    await nextTick();
    if (cancelled) outgoingHeading.value?.focus();
    else if (cancellationState.value.needsReload) refreshButton.value?.focus();
  }
}
async function refreshAfterCancellation(event) {
  if (await cancellation.refresh() && event?.detail === 0) {
    await nextTick();
    outgoingHeading.value?.focus();
  }
}
async function relAction(fn, uid) {
  relErr.value = '';
  try { await fn(uid); await loadRelationships(); }
  catch (e) { relErr.value = e.message; }
}
const acceptRel = uid => relAction(contacts.accept, uid);
const removeRel = uid => relAction(contacts.remove, uid);
const unblockRel = uid => relAction(contacts.unblock, uid);
</script>

<style scoped>
.cx { flex: 1; display: flex; flex-direction: column; min-height: 0; background: var(--bg-main); }
.cx-head { display: flex; align-items: center; gap: 32px; padding: 14px 24px; border-bottom: 1px solid var(--border); }
.cx-title { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; font-size: 15px; }
.cx-tabs { display: flex; gap: 4px; }
.cx-tab { padding: 6px 10px; font-size: 13px; color: var(--fg-dim); border-bottom: 2px solid transparent; }
.cx-tab:hover { color: var(--fg); }
.cx-tab.active { color: var(--fg); font-weight: 600; border-bottom-color: var(--accent); }
.cx-tab:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }

.cx-body { flex: 1; overflow-y: auto; padding: 20px 24px 24px; }
.cx-card { background: var(--bg-side); border: 1px solid var(--border); border-radius: 18px; }

.cx-p2p { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
.cx-p2p-top { display: flex; align-items: center; gap: 12px; }
.cx-p2p-icon { width: 42px; height: 42px; border-radius: 12px; background: color-mix(in srgb, var(--accent) 22%, transparent); color: var(--accent); display: grid; place-items: center; flex-shrink: 0; }
.cx-p2p-info { flex: 1; min-width: 0; }
.cx-p2p-info h3 { margin: 0; font-size: 15px; }
.cx-p2p-info p { margin: 2px 0 0; font-size: 12px; color: var(--fg-dim); }

.cx-flow { display: flex; flex-direction: column; gap: 4px; }
.cx-flow-phase { margin: 0; font-size: 14px; }
.cx-hint { margin: 0; font-size: 12px; color: var(--fg-dim); }
.cx-link { min-width: 0; color: var(--fg-dim); font-size: 12px; }
.cx-link summary { cursor: pointer; padding: 4px 0; width: fit-content; }
.cx-link textarea { width: 100%; font-size: 11px; font-family: inherit; resize: vertical; }
.cx-receive { display: flex; flex-direction: column; gap: 6px; }
.cx-receive label { font-size: 12px; font-weight: 600; }
.cx-receive textarea { width: 100%; font-size: 12px; font-family: inherit; resize: vertical; }
.cx-receive .btn { align-self: flex-start; }
.btn.sm { padding: 7px 12px; font-size: 12px; }
.cx-restart { align-self: flex-start; }
.cx-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.cx-refresh { align-self: flex-start; margin-bottom: 4px; }
.cx-cancel { flex-shrink: 0; }
.cx-cancel:focus-visible, .cx-refresh:focus-visible { outline: 2px solid var(--fg); outline-offset: 3px; }

.cx-details { border-top: 1px solid var(--border); padding-top: 4px; }
.cx-details > summary { cursor: pointer; padding: 6px 0; color: var(--fg-dim); font-weight: 600; font-size: 12px; }
.cx-details > summary:focus-visible { outline: 2px solid var(--fg); outline-offset: 3px; }
.cx-details-body { display: flex; flex-direction: column; gap: 10px; padding-top: 6px; }
.cx-idcard { background: var(--bg-input); border-radius: 8px; padding: 8px 10px; }
.cx-keyhead { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 6px; }
.cx-keyhead .btn { flex-shrink: 0; }
.cx-label { display: block; font-size: 10px; color: var(--fg-dim); text-transform: uppercase; }
.cx-key { font-size: 12px; word-break: break-all; }
.cx-known { display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--border); padding-top: 8px; }
.cx-krow { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.cx-krow .cx-key { flex: 1; min-width: 0; }
.cx-krow .btn { flex-shrink: 0; }
.cx-dim { color: var(--fg-dim); }
.cx-addct { display: flex; gap: 6px; border-top: 1px solid var(--border); padding-top: 10px; }
.cx-addct input { flex: 1; font-size: 12px; }
.cx-addct .btn { flex-shrink: 0; }
.cx-note { margin: 0; font-size: 12px; color: var(--fg-dim); }
.cx-warn { margin: 0; font-size: 12px; color: var(--amarelo-ipe); }
.cx-err { margin: 0; font-size: 12px; color: var(--danger); }
.cx-ok { margin: 0; font-size: 12px; color: var(--verde-mata); }
.cx-ok code { font-size: 11px; }

.cx-add { position: relative; display: flex; gap: 8px; }
.cx-add-ic { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--fg-dim); pointer-events: none; }
.cx-add input { flex: 1; padding-left: 34px; font-size: 13px; }
.cx-add .btn { flex-shrink: 0; }

.cx-sec { margin: 20px 0 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; color: var(--fg-dim); }
.cx-list { display: flex; flex-direction: column; gap: 10px; }
.cx-friend { display: flex; align-items: center; gap: 12px; padding: 12px 14px; flex-wrap: wrap; }
.cx-friend.clickable { cursor: pointer; }
.cx-friend.clickable:hover { border-color: var(--accent); }
.cx-friend.clickable:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
.cx-avatar { width: 44px; height: 44px; border-radius: 14px; background: var(--bg-input); display: grid; place-items: center; font-weight: 700; font-size: 15px; position: relative; flex-shrink: 0; }
.cx-avatar img { width: 100%; height: 100%; border-radius: inherit; object-fit: cover; }
.cx-avatar .dot { position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--bg-side); background: var(--verde-mata); }
.cx-friend-info { flex: 1; min-width: 0; }
.cx-friend-name { font-weight: 600; font-size: 14px; }
.cx-friend-sub { font-size: 12px; color: var(--fg-dim); }
.cx-empty { padding: 24px; text-align: center; color: var(--fg-dim); font-size: 13px; }

.cx-status { display: flex; align-items: center; gap: 18px; padding: 10px 24px; border-top: 1px solid var(--border); font-size: 11px; text-transform: uppercase; letter-spacing: .6px; color: var(--fg-dim); }
.cx-status-item { display: inline-flex; align-items: center; gap: 6px; }
.cx-live { width: 8px; height: 8px; border-radius: 50%; background: var(--verde-mata); }
.cx-live.off { background: #777; }
.cx-status-right { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; }

.cx .btn:focus-visible { outline: 2px solid var(--fg); outline-offset: 3px; }

@media (max-width: 700px) {
  .cx-head { flex-wrap: wrap; gap: 8px 16px; }
  .cx-body, .cx-status { padding-left: 16px; padding-right: 16px; }
  .cx-status { flex-wrap: wrap; gap: 8px 14px; }
}
</style>
