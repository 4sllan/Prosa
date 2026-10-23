<template>
  <div class="shell" :class="{ 'chat-open': mobileChat || view === 'conexoes' }">
    <!-- Rail de comunidades -->
    <nav class="rail">
      <button class="rail-item" :class="{ active: homeSidebar }" @click="goHome" title="Início"><House :size="20" aria-hidden="true" /></button>
      <div class="rail-sep"></div>
      <button v-for="c in store.communities" :key="c.id" class="rail-item"
              :class="{ active: store.currentCommunity?.id === c.id }"
              @click="openCommunity(c)" :title="c.name">
        <img v-if="c.iconUrl" :src="fullUrl(c.iconUrl)" style="width:100%;height:100%;border-radius:inherit;object-fit:cover">
        <template v-else>{{ initials(c.name) }}</template>
      </button>
      <button class="rail-item" @click="showCreate = true" title="Criar comunidade" style="color:var(--verde-mata)"><Plus :size="20" aria-hidden="true" /></button>
      <button class="rail-item" @click="showJoin = true" title="Entrar com convite"><Link2 :size="20" aria-hidden="true" /></button>
    </nav>

    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="side-head">
        <span>{{ homeSidebar ? 'Conversas' : store.currentCommunity?.name }}</span>
        <span>
          <button v-if="view === 'community' && canManage" @click="showCommunitySettings = true" title="Configurações"><Settings :size="16" aria-hidden="true" /></button>
          <button v-if="homeSidebar" @click="showNewGroup = true" title="Novo grupo"><SquarePen :size="16" aria-hidden="true" /></button>
        </span>
      </div>
      <div class="side-body">
        <template v-if="homeSidebar">
          <div class="cat-name">Amigos <button @click="view = 'conexoes'" title="Ver amigos"><ArrowRight :size="12" aria-hidden="true" /></button></div>
          <div class="chan" @click="view = 'conexoes'" :class="{ active: view === 'conexoes' }"><span class="nav-ic"><RadioTower :size="14" aria-hidden="true" /></span>Conexões</div>
          <div class="cat-name">Rodas</div>
          <div v-for="r in friends" :key="r.id" class="dm-item"
               @click="openFriendDm(r.user.id)" @contextmenu.prevent="friendMenu(r.user.id, $event)">
            <span class="avatar" style="width:26px;height:26px;font-size:11px">
              <img v-if="r.user.avatarUrl" :src="fullUrl(r.user.avatarUrl)">
              <template v-else>{{ initials(r.user.displayName) }}</template>
              <span class="dot" :class="presenceOf(r.user.id)"></span>
            </span>
            {{ r.user.displayName }}
          </div>
        </template>
        <template v-else-if="store.currentCommunity">
          <template v-for="cat in groupedChannels" :key="cat.id ?? 'uncat'">
            <div class="cat-name">
              {{ cat.name }}
              <button v-if="canManage" @click="newChannel(cat.id)" title="Novo canal"><Plus :size="14" aria-hidden="true" /></button>
            </div>
            <template v-for="ch in cat.channels" :key="ch.id">
              <div class="chan" :class="{ active: activeChannel?.id === ch.id || rtc.channelId === ch.id }" @click="clickChannel(ch)">
                <span class="hash"><Hash :size="16" aria-hidden="true" /></span>{{ ch.name }}
                <span class="chan-end">
                  <span v-if="voiceCount(ch.id)" class="vc-count">{{ voiceCount(ch.id) }}</span>
                  <button class="chan-chat" :class="{ on: chatOpen && activeChannel?.id === ch.id }"
                          @click.stop="toggleChannelChat(ch)" :title="chatOpen && activeChannel?.id === ch.id ? 'Fechar chat' : 'Abrir chat'"><MessageSquare :size="13" aria-hidden="true" /></button>
                </span>
              </div>
              <div v-if="store.voice[ch.id]?.length" class="voice-users">
                <div v-for="v in store.voice[ch.id]" :key="v.userId" class="voice-user">
                  <span class="avatar" style="width:26px;height:26px;font-size:11px">
                    <img v-if="avatarOf(v.userId)" :src="fullUrl(avatarOf(v.userId))">
                    <template v-else>{{ initials(nameOf(v.userId)) }}</template>
                    <span class="dot" :class="presenceOf(v.userId)"></span>
                  </span>
                  {{ nameOf(v.userId) }} <MicOff v-if="v.muted" :size="12" aria-hidden="true" /><ScreenShare v-if="v.screen" :size="12" aria-hidden="true" />
                </div>
              </div>
            </template>
          </template>
        </template>
      </div>
      <div class="userbar">
        <span class="avatar">
          <img v-if="store.user?.avatarUrl" :src="fullUrl(store.user.avatarUrl)">
          <template v-else>{{ initials(store.user?.username || '?') }}</template>
          <span class="dot" :class="myPresence"></span>
        </span>
        <span>
          <div class="name">{{ store.user?.displayName || store.user?.username }}</div>
          <div class="status">{{ presenceLabel }}</div>
        </span>
        <span class="acts">
          <button @click="toggleMute" :disabled="!microphoneReady" :title="microphoneLabel" :aria-label="microphoneLabel"><MicOff v-if="!microphoneReady || rtc.muted" :size="16" aria-hidden="true" /><Mic v-else :size="16" aria-hidden="true" /></button>
          <button @click="toggleSpeaker" :title="rtc.speakerMuted ? 'Ativar alto-falante' : 'Desativar alto-falante'"><VolumeX v-if="rtc.speakerMuted" :size="16" aria-hidden="true" /><Volume2 v-else :size="16" aria-hidden="true" /></button>
          <button v-if="store.user?.isAdmin" @click="view = 'admin'" title="Admin"><Shield :size="16" aria-hidden="true" /></button>
          <button @click="showUserSettings = true" title="Configurações"><Settings :size="16" aria-hidden="true" /></button>
        </span>
      </div>
    </aside>

    <!-- Main -->
    <main class="main">
      <template v-if="view === 'conexoes'">
        <button class="friends-back" @click="goHome"><ArrowLeft :size="14" aria-hidden="true" /> Voltar às conversas</button>
        <ConnectionsView @open-dm="openFriendDm" />
      </template>
      <template v-else-if="view === 'admin'"><AdminPanel /></template>
      <template v-else-if="activeChannel">
        <div class="topbar">
          <button class="back" @click="mobileChat = false"><ArrowLeft :size="16" aria-hidden="true" /></button>
          <span class="title">{{ isDm ? '' : '#' }} {{ channelTitle }}</span>
          <span class="topic">{{ activeChannel.topic }}</span>
          <input v-model="searchQ" placeholder="Buscar…" @input="doSearch" @keydown.esc="searchQ=''">
          <button v-if="!isDm" class="chat-toggle" :class="{ on: chatOpen }" @click="chatOpen = !chatOpen"
                  :title="chatOpen ? 'Fechar chat' : 'Abrir chat'"><MessageSquare :size="16" aria-hidden="true" /></button>
        </div>
        <div v-if="searchResults" class="search-results">
          <div v-for="m in searchResults.messages" :key="m.id" class="hit" @click="searchQ=''">
            <b>{{ nameOf(m.authorId) }}</b>: {{ m.content.slice(0, 90) }}
          </div>
          <div v-for="u in searchResults.users" :key="u.id" class="hit"><UserRound :size="14" aria-hidden="true" /> {{ u.displayName }} (@{{ u.username }})</div>
          <div v-if="!searchResults.messages.length && !searchResults.users.length" class="hit">Nada encontrado</div>
        </div>
        <ChatView v-if="isDm" :channel="activeChannel" />
        <div v-else class="chat-wrap">
          <VoiceStage :channel="activeChannel" />
          <aside v-if="chatOpen" class="chat-aside"><ChatView :channel="activeChannel" /></aside>
        </div>
      </template>
      <div v-else class="hero">
        <div class="hero-card">
          <img class="hero-logo" :src="logoUrl" :alt="store.appName">
          <h2 class="hero-title">{{ store.appName }} — sua roda de conversa.</h2>
          <p class="hero-sub">Crie uma comunidade ou entre com um convite para começar a interagir.</p>
          <div class="hero-tiles">
            <button class="hero-tile" @click="showCreate = true">
              <span class="tile-icon"><Users :size="20" aria-hidden="true" /></span>
              Rodas
            </button>
            <button class="hero-tile" disabled title="Em breve">
              <span class="tile-icon"><RadioTower :size="20" aria-hidden="true" /></span>
              Prosa ao vivo
            </button>
          </div>
          <div class="hero-sep"></div>
          <button class="hero-cta" @click="view = 'conexoes'">Começar uma nova conversa</button>
        </div>
        <div class="hero-badges">
          <span><Link2 :size="12" aria-hidden="true" /> Conexões seguras</span>
          <span><ShieldCheck :size="12" aria-hidden="true" /> P2P encrypt</span>
        </div>
      </div>
      <MicrophoneStatus @retry="requestJoinVoice" />
    </main>



    <!-- Modais -->
    <div v-if="showCreate" class="modal-bg" @click.self="showCreate = false">
      <div class="modal">
        <h2>Criar comunidade</h2>
        <div class="row"><label>Nome</label><input v-model="newCommunityName" maxlength="100"></div>
        <div class="row"><label>Descrição</label><textarea v-model="newCommunityDesc" rows="2"></textarea></div>
        <div class="actions"><button class="btn ghost" @click="showCreate = false">Cancelar</button><button class="btn primary" @click="createCommunity">Criar</button></div>
      </div>
    </div>

    <div v-if="showJoin" class="modal-bg" @click.self="showJoin = false">
      <div class="modal">
        <h2>Entrar com convite</h2>
        <div class="row"><label>Código do convite</label><input v-model="inviteCode" placeholder="ex: a1b2c3d4"></div>
        <div class="actions"><button class="btn ghost" @click="showJoin = false">Cancelar</button><button class="btn primary" @click="acceptInvite">Entrar</button></div>
      </div>
    </div>

    <div v-if="showNewChannel" class="modal-bg" @click.self="showNewChannel = false">
      <div class="modal">
        <h2>Novo canal</h2>
        <div class="row"><label>Nome</label><input v-model="newChannelName" maxlength="64"></div>
        <div class="actions"><button class="btn ghost" @click="showNewChannel = false">Cancelar</button><button class="btn primary" @click="createChannel">Criar</button></div>
      </div>
    </div>

    <div v-if="voiceSwitch" class="modal-bg" @click.self="voiceSwitch = null">
      <div class="modal">
        <h2>Trocar de canal de voz?</h2>
        <p style="margin:0;color:var(--fg-dim)">Você já está conectado ao canal de voz <b style="color:var(--fg)">{{ currentVoiceName }}</b>. Deseja sair dele e entrar no canal <b style="color:var(--fg)">{{ voiceSwitch.name }}</b>?</p>
        <div class="actions"><button class="btn ghost" @click="voiceSwitch = null">Cancelar</button><button class="btn primary" :disabled="voicePending" @click="confirmVoiceSwitch">Confirmar</button></div>
      </div>
    </div>

    <div v-if="showNewGroup" class="modal-bg" @click.self="showNewGroup = false">
      <div class="modal">
        <h2>Novo grupo</h2>
        <div class="row"><label>Nome do grupo</label><input v-model="groupName"></div>
        <div class="row"><label>Amigos</label>
          <div v-for="r in friends" :key="r.user.id">
            <label style="text-transform:none;font-weight:500"><input type="checkbox" :value="r.user.id" v-model="groupSel" style="width:auto"> {{ r.user.displayName }}</label>
          </div>
        </div>
        <div class="actions"><button class="btn ghost" @click="showNewGroup = false">Cancelar</button><button class="btn primary" @click="createGroup">Criar</button></div>
      </div>
    </div>

    <div v-if="inviteFor" class="modal-bg" @click.self="inviteFor = null">
      <div class="modal">
        <h2>Convidar {{ inviteFriend?.displayName || 'amigo' }} para comunidade</h2>
        <div class="invite-list">
          <button v-for="c in inviteSpaces" :key="c.id" class="invite-item"
                  :disabled="!!c.disabled || inviteBusy" @click="inviteTo(c)">
            <span class="avatar" style="width:28px;height:28px;font-size:12px">
              <img v-if="c.iconUrl" :src="fullUrl(c.iconUrl)">
              <template v-else>{{ initials(c.name) }}</template>
            </span>
            <span class="grow">{{ c.name }}</span>
            <span v-if="c.disabled" class="invite-why">{{ c.disabled }}</span>
          </button>
          <div v-if="!inviteSpaces.length" style="color:var(--fg-dim);font-size:13px">Nenhuma comunidade disponível.</div>
        </div>
        <p v-if="inviteError" class="invite-err">{{ inviteError }}</p>
        <div class="actions"><button class="btn ghost" @click="inviteFor = null">Cancelar</button></div>
      </div>
    </div>

    <CommunitySettings v-if="showCommunitySettings" :community="store.currentCommunity" @close="showCommunitySettings = false" />
    <UserSettings v-if="showUserSettings" @close="showUserSettings = false" />
    <ContextMenu v-if="menu.open" :x="menu.x" :y="menu.y" :items="friendMenuItems"
                 @select="onFriendMenuSelect" @close="menu.open = false" />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { store, selectCommunity, openChannel, loadCommunities, loadDms, loadRelationships, presenceOf, fullUrl, pushNotification } from '../stores.js';
import { communities, dms, misc, contacts, messages } from '../services/index.js';
import { p2pTransport } from '../services/p2p/transport.js';
import logoUrl from '../assets/logotipo-prosa.png';
import { rtc, joinVoice, toggleMute, toggleSpeaker } from '../rtc.js';
import ChatView from '../components/ChatView.vue';
import VoiceStage from '../components/VoiceStage.vue';
import MicrophoneStatus from '../components/MicrophoneStatus.vue';
import ConnectionsView from '../components/ConnectionsView.vue';
import AdminPanel from '../components/AdminPanel.vue';
import CommunitySettings from '../components/CommunitySettings.vue';
import UserSettings from '../components/UserSettings.vue';
import ContextMenu from '../components/ContextMenu.vue';
import { House, Plus, Link2, Settings, SquarePen, ArrowRight, Volume2, VolumeX, Hash, Mic, MicOff, ScreenShare, Shield, ShieldCheck, ArrowLeft, UserRound, Users, RadioTower, CheckCheck, BellOff, Pin, UserPlus, Link2Off, Ban, Unplug, MessageSquare } from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const view = ref('home');
const mobileChat = ref(false);
const showCreate = ref(false), showJoin = ref(false), showNewChannel = ref(false), showNewGroup = ref(false);
const showCommunitySettings = ref(false), showUserSettings = ref(false);
const newCommunityName = ref(''), newCommunityDesc = ref(''), inviteCode = ref('');
const newChannelName = ref(''), newChannelCat = ref(null);
const groupName = ref(''), groupSel = ref([]);
const searchQ = ref(''), searchResults = ref(null);
const voiceSwitch = ref(null);
const voicePending = computed(() => ['requesting', 'initializing'].includes(rtc.microphone.phase));
const microphoneReady = computed(() => rtc.microphone.phase === 'ready');
const microphoneLabel = computed(() => microphoneReady.value
  ? (rtc.muted ? 'Desmutar microfone' : 'Mutar microfone') : 'Microfone indisponível');
const chatOpen = ref(false);
const inviteFor = ref(null), inviteBusy = ref(false), inviteError = ref('');
let searchTimer = null;

const activeChannel = computed(() =>
  store.channels.find(c => c.id === store.activeChannelId)
  || store.dms.find(d => d.id === store.activeChannelId) && { id: store.activeChannelId, type: 'dm', name: '' }
  || (store.activeChannelId ? { id: store.activeChannelId, type: 'text', name: '' } : null)
);

const channelTitle = computed(() => {
  const dm = store.dms.find(d => d.id === store.activeChannelId);
  if (dm) return dmName(dm);
  return activeChannel.value?.name || '';
});

const friends = computed(() => store.relationships.filter(r => r.type === 'friend'));
// aside identico em 'home' (Conversas) e 'conexoes' (Conexões/Rede P2P)
const homeSidebar = computed(() => ['home', 'conexoes'].includes(view.value));
const canManage = computed(() => ['owner', 'admin'].includes(store.currentCommunity?.myRole));
const myPresence = computed(() => localStorage.getItem('prosa_presence') || 'online');
const presenceLabel = computed(() => ({ online: 'Disponível', idle: 'Ausente', dnd: 'Ocupado', invisible: 'Invisível' }[myPresence.value]));

const groupedChannels = computed(() => {
  const byCat = store.categories.map(c => ({ id: c.id, name: c.name, channels: [] }));
  const uncat = { id: null, name: '', channels: [] };
  for (const ch of store.channels) {
    const g = byCat.find(c => c.id === ch.categoryId) || uncat;
    g.channels.push(ch);
  }
  const out = uncat.channels.length ? [uncat, ...byCat] : byCat;
  return out.filter(g => g.channels.length || g.id);
});

function initials(n) { return String(n || '?').slice(0, 2).toUpperCase(); }
function nameOf(uid) {
  if (uid === store.user?.id) return store.user.displayName;
  const m = store.members.find(m => m.user.id === uid);
  if (m) return m.user.displayName;
  const dm = store.dms.flatMap(d => d.allMembers.map(i => d.recipients.find(r => r.id === i))).find(u => u?.id === uid);
  return dm?.displayName || 'usuário';
}
function dmName(d) { return d.type === 'group_dm' ? d.name : d.recipients[0]?.displayName || 'DM'; }
function voiceCount(chId) { return store.voice[chId]?.length || 0; }
function avatarOf(uid) {
  if (uid === store.user?.id) return store.user.avatarUrl;
  return store.members.find(m => m.user.id === uid)?.user.avatarUrl;
}
const currentVoiceName = computed(() =>
  rtc.channelName || store.channels.find(c => c.id === rtc.channelId)?.name || 'canal atual'
);
const isDm = computed(() => ['dm', 'group_dm'].includes(activeChannel.value?.type));
const inviteFriend = computed(() =>
  store.relationships.find(r => r.user.id === inviteFor.value)?.user
);
// espaços do rail com motivo de indisponibilidade para o amigo alvo
const inviteSpaces = computed(() => store.communities.map(c => ({
  ...c,
  disabled: c.members?.some(m => m.user.id === inviteFor.value)
    ? 'já é membro'
    : c.myRole !== 'owner' ? 'apenas administradores podem convidar' : null,
})));

function goHome() { view.value = 'home'; store.currentCommunity = null; store.activeChannelId = null; mobileChat.value = false; }

async function openCommunity(c) {
  view.value = 'community';
  await selectCommunity(c);
}

async function clickChannel(ch) {
  await openChannel(ch.id);
  mobileChat.value = true;
  await requestJoinVoice(ch);
}

async function toggleChannelChat(ch) {
  if (store.activeChannelId !== ch.id) {
    await openChannel(ch.id);
    mobileChat.value = true;
    chatOpen.value = true;
    return;
  }
  chatOpen.value = !chatOpen.value;
}

async function requestJoinVoice(ch) {
  if (voicePending.value) return;
  if (rtc.channelId && rtc.channelId !== ch.id) { voiceSwitch.value = { id: ch.id, name: ch.name }; return; }
  await joinVoice(ch.id, ch.name);
}

async function confirmVoiceSwitch() {
  if (voicePending.value) return;
  const target = voiceSwitch.value;
  voiceSwitch.value = null;
  if (!target) return;
  await joinVoice(target.id, target.name);
  mobileChat.value = true;
}

async function openFriendDm(uid) {
  const r = await dms.open(uid);
  await loadDms();
  await openChannel(r.dm.id);
  view.value = 'home';
  mobileChat.value = true;
}

const menu = ref({ open: false, x: 0, y: 0, userId: null });
const friendMenuItems = computed(() => {
  const r = store.relationships.find(x => x.user.id === menu.value.userId);
  const uname = r?.user.username || r?.user.displayName || (menu.value.userId || '').slice(0, 12);
  return [
    { label: 'Marcar como lida', value: 'read', icon: CheckCheck },
    { label: 'Perfil', value: 'profile', icon: UserRound },
    { label: `Silenciar @${uname}`, value: 'mute', icon: BellOff },
    { label: 'Pin', value: 'pin', icon: Pin },
    { label: 'Convidar para comunidade', value: 'invite', icon: UserPlus },
    // Desconectar encerra só o transporte P2P — a amizade é preservada
    ...(p2pTransport.isOnline(menu.value.userId)
      ? [{ label: 'Desconectar', value: 'disconnect', icon: Unplug }] : []),
    { divider: true },
    { label: 'Desfazer conexão', value: 'remove', icon: Link2Off },
    { label: 'Bloquear contato', value: 'block', icon: Ban, danger: true },
  ];
});
function friendMenu(userId, e) {
  menu.value = { open: true, x: e.clientX, y: e.clientY, userId };
}
async function onFriendMenuSelect(item) {
  try {
    if (item.value === 'read') {
      const dm = store.dms.find(d => d.recipients?.[0]?.id === menu.value.userId);
      if (dm) await messages.markRead(dm.id, {});
    } else if (item.value === 'block') await contacts.block(menu.value.userId);
    else if (item.value === 'disconnect') p2pTransport.dropPeer(menu.value.userId, 'user-disconnect');
    else if (item.value === 'remove') await contacts.remove(menu.value.userId);
    else if (item.value === 'invite') { inviteFor.value = menu.value.userId; inviteError.value = ''; return; }
    // 'profile', 'mute' e 'pin' aguardam as features correspondentes
    await loadRelationships();
  } catch (e) { alert(e.message); }
}

async function inviteTo(c) {
  if (inviteBusy.value) return;
  inviteBusy.value = true; inviteError.value = '';
  try {
    await communities.inviteMember(c.id, inviteFor.value);
    const name = inviteFriend.value?.displayName || 'Amigo';
    inviteFor.value = null;
    pushNotification({ type: 'invite', text: `${name} adicionado a ${c.name}` });
  } catch (e) {
    inviteError.value = e.message;
  } finally { inviteBusy.value = false; }
}

async function createCommunity() {
  if (!newCommunityName.value.trim()) return;
  const r = await communities.create({ name: newCommunityName.value, description: newCommunityDesc.value });
  newCommunityName.value = ''; newCommunityDesc.value = ''; showCreate.value = false;
  await loadCommunities();
  const c = store.communities.find(x => x.id === r.community.id);
  if (c) openCommunity(c);
}

async function acceptInvite() {
  if (!inviteCode.value.trim()) return;
  try {
    const r = await communities.acceptInvite(inviteCode.value.trim());
    inviteCode.value = ''; showJoin.value = false;
    await loadCommunities();
    const c = store.communities.find(x => x.id === r.communityId);
    if (c) openCommunity(c);
  } catch (e) { alert(e.message); }
}

function newChannel(catId) { newChannelCat.value = catId; showNewChannel.value = true; }

async function createChannel() {
  if (!newChannelName.value.trim()) return;
  await communities.createChannel(store.currentCommunity.id, { name: newChannelName.value, type: 'text', categoryId: newChannelCat.value });
  newChannelName.value = ''; showNewChannel.value = false;
  await selectCommunity(store.currentCommunity);
}

async function createGroup() {
  if (!groupName.value.trim() || !groupSel.value.length) return;
  await dms.createGroup({ name: groupName.value, userIds: groupSel.value });
  groupName.value = ''; groupSel.value = []; showNewGroup.value = false;
  await loadDms();
}

function doSearch() {
  clearTimeout(searchTimer);
  if (searchQ.value.trim().length < 2) { searchResults.value = null; return; }
  searchTimer = setTimeout(async () => {
    searchResults.value = await misc.search(searchQ.value, store.activeChannelId);
  }, 300);
}

// Esc fecha o modal de convite — mesmo padrão do ContextMenu
watch(inviteFor, (v, _, onCleanup) => {
  if (!v) return;
  const h = (e) => { if (e.key === 'Escape') inviteFor.value = null; };
  window.addEventListener('keydown', h);
  onCleanup(() => window.removeEventListener('keydown', h));
});

watch(() => store.activeChannelId, () => { chatOpen.value = false; }, { flush: 'sync' });

// deep-link via /channels/:id
watch(() => route.params.channelId, async (chId) => {
  if (chId) { store.activeChannelId = chId; await openChannel(chId); }
}, { immediate: true });
</script>

<style scoped>
.friends-back { display: none; }
.userbar .acts button:disabled, .modal .actions button:disabled { opacity: .5; cursor: default; }
.invite-list { display: flex; flex-direction: column; gap: 4px; max-height: 260px; overflow-y: auto; }
.invite-item {
  display: flex; align-items: center; gap: 10px; padding: 9px 10px;
  border-radius: 10px; text-align: left; color: var(--fg); font-size: 14px;
}
.invite-item:hover:not(:disabled), .invite-item:focus-visible { background: var(--bg-input); outline: none; }
.invite-item:disabled { opacity: .5; cursor: default; }
.invite-item .grow { flex: 1; }
.invite-why { font-size: 12px; color: var(--fg-dim); }
.invite-err { color: var(--danger); font-size: 13px; margin: 8px 0 0; }
@media (max-width: 700px) {
  .friends-back { display: block; align-self: flex-start; padding: 12px; color: var(--fg-dim); }
}
</style>
