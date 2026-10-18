<template>
  <div class="shell" :class="{ 'chat-open': mobileChat || view === 'friends' }">
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
          <div class="cat-name">Amigos <button @click="view = 'friends'" title="Ver amigos"><ArrowRight :size="12" aria-hidden="true" /></button></div>
          <div class="chan" @click="view = 'friends'" :class="{ active: view === 'friends' }"><span class="nav-ic"><Smile :size="14" aria-hidden="true" /></span>Amigos</div>
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
              <div class="chan" :class="{ active: activeChannel?.id === ch.id && ch.type === 'text' }" @click="clickChannel(ch)">
                <span class="hash"><Volume2 v-if="ch.type === 'voice'" :size="16" aria-hidden="true" /><Hash v-else :size="16" aria-hidden="true" /></span>{{ ch.name }}
                <span v-if="ch.type === 'voice' && voiceCount(ch.id)" style="margin-left:auto;font-size:11px;color:var(--verde-mata)">{{ voiceCount(ch.id) }}</span>
              </div>
              <div v-if="ch.type === 'voice' && store.voice[ch.id]?.length" class="voice-users">
                <div v-for="v in store.voice[ch.id]" :key="v.userId" class="voice-user">
                  <span class="avatar" style="width:20px;height:20px;font-size:10px">{{ initials(nameOf(v.userId)) }}</span>
                  {{ nameOf(v.userId) }} <MicOff v-if="v.muted" :size="12" aria-hidden="true" /><ScreenShare v-if="v.screen" :size="12" aria-hidden="true" />
                </div>
              </div>
            </template>
          </template>
        </template>
      </div>
      <VoiceBar v-if="rtc.channelId" />
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
          <button @click="toggleMute" :title="rtc.muted ? 'Desmutar microfone' : 'Mutar microfone'"><MicOff v-if="rtc.muted" :size="16" aria-hidden="true" /><Mic v-else :size="16" aria-hidden="true" /></button>
          <button v-if="store.user?.isAdmin" @click="view = 'admin'" title="Admin"><Shield :size="16" aria-hidden="true" /></button>
          <button @click="showUserSettings = true" title="Configurações"><Settings :size="16" aria-hidden="true" /></button>
        </span>
      </div>
    </aside>

    <!-- Main -->
    <main class="main">
      <template v-if="view === 'friends'">
        <button class="friends-back" @click="goHome"><ArrowLeft :size="14" aria-hidden="true" /> Voltar às conversas</button>
        <PairingPanel />
        <FriendsPanel />
      </template>
      <template v-else-if="view === 'admin'"><AdminPanel /></template>
      <template v-else-if="activeChannel">
        <div class="topbar">
          <button class="back" @click="mobileChat = false"><ArrowLeft :size="16" aria-hidden="true" /></button>
          <span class="title">{{ activeChannel.type === 'text' ? '#' : '' }} {{ channelTitle }}</span>
          <span class="topic">{{ activeChannel.topic }}</span>
          <input v-model="searchQ" placeholder="Buscar…" @input="doSearch" @keydown.esc="searchQ=''">
        </div>
        <div v-if="searchResults" class="search-results">
          <div v-for="m in searchResults.messages" :key="m.id" class="hit" @click="searchQ=''">
            <b>{{ nameOf(m.authorId) }}</b>: {{ m.content.slice(0, 90) }}
          </div>
          <div v-for="u in searchResults.users" :key="u.id" class="hit"><UserRound :size="14" aria-hidden="true" /> {{ u.displayName }} (@{{ u.username }})</div>
          <div v-if="!searchResults.messages.length && !searchResults.users.length" class="hit">Nada encontrado</div>
        </div>
        <ChatView v-if="activeChannel.type !== 'voice'" :channel="activeChannel" />
        <div v-else class="empty"><div><div class="big"><Volume2 :size="42" aria-hidden="true" /></div>Canal de voz — clique em "Entrar" na barra abaixo</div></div>
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
          <button class="hero-cta" @click="view = 'friends'">Começar uma nova conversa</button>
        </div>
        <div class="hero-badges">
          <span><Link2 :size="12" aria-hidden="true" /> Conexões seguras</span>
          <span><ShieldCheck :size="12" aria-hidden="true" /> P2P encrypt</span>
        </div>
      </div>
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
        <div class="row"><label>Tipo</label>
          <select v-model="newChannelType"><option value="text">Texto</option><option value="voice">Voz</option></select>
        </div>
        <div class="actions"><button class="btn ghost" @click="showNewChannel = false">Cancelar</button><button class="btn primary" @click="createChannel">Criar</button></div>
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

    <CommunitySettings v-if="showCommunitySettings" :community="store.currentCommunity" @close="showCommunitySettings = false" />
    <UserSettings v-if="showUserSettings" @close="showUserSettings = false" />
    <ContextMenu v-if="menu.open" :x="menu.x" :y="menu.y" :items="friendMenuItems"
                 @select="onFriendMenuSelect" @close="menu.open = false" />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { store, selectCommunity, openChannel, loadCommunities, loadDms, loadRelationships, presenceOf, fullUrl } from '../stores.js';
import { communities, dms, misc, contacts } from '../services/index.js';
import logoUrl from '../assets/logotipo-prosa.png';
import { rtc, joinVoice, leaveVoice, toggleMute } from '../rtc.js';
import ChatView from '../components/ChatView.vue';
import VoiceBar from '../components/VoiceBar.vue';
import FriendsPanel from '../components/FriendsPanel.vue';
import PairingPanel from '../components/PairingPanel.vue';
import AdminPanel from '../components/AdminPanel.vue';
import CommunitySettings from '../components/CommunitySettings.vue';
import UserSettings from '../components/UserSettings.vue';
import ContextMenu from '../components/ContextMenu.vue';
import { House, Plus, Link2, Settings, SquarePen, ArrowRight, Smile, Volume2, Hash, Mic, MicOff, ScreenShare, Shield, ShieldCheck, ArrowLeft, UserRound, Users, RadioTower } from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const view = ref('home');
const mobileChat = ref(false);
const showCreate = ref(false), showJoin = ref(false), showNewChannel = ref(false), showNewGroup = ref(false);
const showCommunitySettings = ref(false), showUserSettings = ref(false);
const newCommunityName = ref(''), newCommunityDesc = ref(''), inviteCode = ref('');
const newChannelName = ref(''), newChannelType = ref('text'), newChannelCat = ref(null);
const groupName = ref(''), groupSel = ref([]);
const searchQ = ref(''), searchResults = ref(null);
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
// aside identico em 'home' (Conversas) e 'friends' (Amigos/Rede P2P)
const homeSidebar = computed(() => view.value === 'home' || view.value === 'friends');
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

function goHome() { view.value = 'home'; store.currentCommunity = null; store.activeChannelId = null; mobileChat.value = false; }

async function openCommunity(c) {
  view.value = 'community';
  await selectCommunity(c);
}

async function clickChannel(ch) {
  if (ch.type === 'voice') {
    await joinVoice(ch.id);
    mobileChat.value = true;
    return;
  }
  await openChannel(ch.id);
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
const friendMenuItems = [
  { label: 'Bloquear', value: 'block' },
  { label: 'Remover amigo', value: 'remove', danger: true },
];
function friendMenu(userId, e) {
  menu.value = { open: true, x: e.clientX, y: e.clientY, userId };
}
async function onFriendMenuSelect(item) {
  try {
    if (item.value === 'block') await contacts.block(menu.value.userId);
    else if (item.value === 'remove') await contacts.remove(menu.value.userId);
    await loadRelationships();
  } catch (e) { alert(e.message); }
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
  await communities.createChannel(store.currentCommunity.id, { name: newChannelName.value, type: newChannelType.value, categoryId: newChannelCat.value });
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

// deep-link via /channels/:id
watch(() => route.params.channelId, async (chId) => {
  if (chId) { store.activeChannelId = chId; await openChannel(chId); }
}, { immediate: true });
</script>

<style scoped>
.friends-back { display: none; }
@media (max-width: 700px) {
  .friends-back { display: block; align-self: flex-start; padding: 12px; color: var(--fg-dim); }
}
</style>
