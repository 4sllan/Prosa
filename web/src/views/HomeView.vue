<template>
  <div class="shell" :class="{ 'chat-open': mobileChat }">
    <!-- Rail de comunidades -->
    <nav class="rail">
      <img class="logo-img" :src="logoUrl" :alt="store.appName">
      <button class="rail-item" :class="{ active: view === 'home' }" @click="goHome" title="Início">⌂</button>
      <div class="rail-sep"></div>
      <button v-for="c in store.communities" :key="c.id" class="rail-item"
              :class="{ active: store.currentCommunity?.id === c.id }"
              @click="openCommunity(c)" :title="c.name">
        <img v-if="c.iconUrl" :src="fullUrl(c.iconUrl)" style="width:100%;height:100%;border-radius:inherit;object-fit:cover">
        <template v-else>{{ initials(c.name) }}</template>
      </button>
      <button class="rail-item" @click="showCreate = true" title="Criar comunidade" style="color:var(--verde-mata)">＋</button>
      <button class="rail-item" @click="showJoin = true" title="Entrar com convite">⤵</button>
    </nav>

    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="side-head">
        <span>{{ view === 'home' ? 'Conversas' : store.currentCommunity?.name }}</span>
        <span>
          <button v-if="view === 'community' && canManage" @click="showCommunitySettings = true" title="Configurações">⚙</button>
          <button v-if="view === 'home'" @click="showNewGroup = true" title="Novo grupo">✎</button>
        </span>
      </div>
      <div class="side-body">
        <template v-if="view === 'home'">
          <div class="cat-name">Amigos <button @click="view = 'friends'" title="Ver amigos">→</button></div>
          <div class="chan" @click="view = 'friends'" :class="{ active: view === 'friends' }"><span class="hash">☺</span>Amigos</div>
          <div class="cat-name">Mensagens diretas</div>
          <div v-for="d in store.dms" :key="d.id" class="dm-item" :class="{ active: activeChannel?.id === d.id }" @click="openDm(d)">
            <span class="avatar" style="width:26px;height:26px;font-size:11px">
              {{ initials(dmName(d)) }}
              <span v-if="d.type === 'dm' && d.recipients[0]" class="dot" :class="presenceOf(d.recipients[0].id)"></span>
            </span>
            {{ dmName(d) }}
          </div>
        </template>
        <template v-else-if="store.currentCommunity">
          <template v-for="cat in groupedChannels" :key="cat.id ?? 'uncat'">
            <div class="cat-name">
              {{ cat.name }}
              <button v-if="canManage" @click="newChannel(cat.id)" title="Novo canal">＋</button>
            </div>
            <template v-for="ch in cat.channels" :key="ch.id">
              <div class="chan" :class="{ active: activeChannel?.id === ch.id && ch.type === 'text' }" @click="clickChannel(ch)">
                <span class="hash">{{ ch.type === 'voice' ? '🔊' : '#' }}</span>{{ ch.name }}
                <span v-if="ch.type === 'voice' && voiceCount(ch.id)" style="margin-left:auto;font-size:11px;color:var(--verde-mata)">{{ voiceCount(ch.id) }}</span>
              </div>
              <div v-if="ch.type === 'voice' && store.voice[ch.id]?.length" class="voice-users">
                <div v-for="v in store.voice[ch.id]" :key="v.userId" class="voice-user">
                  <span class="avatar" style="width:20px;height:20px;font-size:10px">{{ initials(nameOf(v.userId)) }}</span>
                  {{ nameOf(v.userId) }} <span v-if="v.muted">🔇</span><span v-if="v.screen">🖥</span>
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
          <button @click="cyclePresence" :title="'Presença: ' + myPresence">●</button>
          <button v-if="store.user?.isAdmin" @click="view = 'admin'" title="Admin">🛡</button>
          <button @click="showUserSettings = true" title="Configurações">⚙</button>
        </span>
      </div>
    </aside>

    <!-- Main -->
    <main class="main">
      <template v-if="view === 'friends'">
        <PairingPanel v-if="store.mode === 'p2p'" />
        <FriendsPanel />
      </template>
      <template v-else-if="view === 'admin'"><AdminPanel /></template>
      <template v-else-if="activeChannel">
        <div class="topbar">
          <button class="back" @click="mobileChat = false">←</button>
          <span class="title">{{ activeChannel.type === 'text' ? '#' : '' }} {{ channelTitle }}</span>
          <span class="topic">{{ activeChannel.topic }}</span>
          <input v-model="searchQ" placeholder="Buscar…" @input="doSearch" @keydown.esc="searchQ=''">
        </div>
        <div v-if="searchResults" class="search-results">
          <div v-for="m in searchResults.messages" :key="m.id" class="hit" @click="searchQ=''">
            <b>{{ nameOf(m.authorId) }}</b>: {{ m.content.slice(0, 90) }}
          </div>
          <div v-for="u in searchResults.users" :key="u.id" class="hit">👤 {{ u.displayName }} (@{{ u.username }})</div>
          <div v-if="!searchResults.messages.length && !searchResults.users.length" class="hit">Nada encontrado</div>
        </div>
        <ChatView v-if="activeChannel.type !== 'voice'" :channel="activeChannel" />
        <div v-else class="empty"><div><div class="big">🔊</div>Canal de voz — clique em "Entrar" na barra abaixo</div></div>
      </template>
      <div v-else class="empty">
        <div>
          <div class="big">🗣</div>
          <b>{{ store.appName }}</b> — sua roda de conversa.<br>
          Crie uma comunidade ou entre com um convite.
        </div>
      </div>
    </main>

    <!-- Member list -->
    <aside v-if="view === 'community' && activeChannel?.type === 'text'" class="members">
      <div v-for="grp in memberGroups" :key="grp.role" class="role-section">{{ grp.label }} — {{ grp.list.length }}</div>
      <template v-for="grp in memberGroups" :key="grp.role + 'l'">
        <div v-for="m in grp.list" :key="m.user.id" class="member" @contextmenu.prevent="memberMenu(m)" :title="m.user.username">
          <span class="avatar" style="width:28px;height:28px;font-size:11px">
            <img v-if="m.user.avatarUrl" :src="fullUrl(m.user.avatarUrl)"><template v-else>{{ initials(m.user.displayName) }}</template>
            <span class="dot" :class="presenceOf(m.user.id)"></span>
          </span>
          <span style="overflow:hidden;text-overflow:ellipsis">{{ m.nickname || m.user.displayName }}</span>
          <span v-if="m.role !== 'member'" class="role-tag">{{ m.role }}</span>
        </div>
      </template>
    </aside>

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
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { store, selectCommunity, openChannel, loadCommunities, loadDms, presenceOf, fullUrl } from '../stores.js';
import { communities, dms, users, misc } from '../services/index.js';
import logoUrl from '../assets/logotipo-prosa.png';
import { rtc, joinVoice, leaveVoice } from '../rtc.js';
import ChatView from '../components/ChatView.vue';
import VoiceBar from '../components/VoiceBar.vue';
import FriendsPanel from '../components/FriendsPanel.vue';
import PairingPanel from '../components/PairingPanel.vue';
import AdminPanel from '../components/AdminPanel.vue';
import CommunitySettings from '../components/CommunitySettings.vue';
import UserSettings from '../components/UserSettings.vue';

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

const memberGroups = computed(() => {
  const groups = { owner: [], admin: [], moderator: [], member: [] };
  for (const m of store.members) groups[m.role]?.push(m);
  return [
    { role: 'owner', label: 'Dono', list: groups.owner },
    { role: 'admin', label: 'Admins', list: groups.admin },
    { role: 'moderator', label: 'Mods', list: groups.moderator },
    { role: 'member', label: 'Membros', list: groups.member },
  ].filter(g => g.list.length);
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

function goHome() { view.value = 'home'; store.currentCommunity = null; mobileChat.value = false; }

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

async function openDm(d) {
  await openChannel(d.id);
  mobileChat.value = true;
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

function cyclePresence() {
  const order = ['online', 'idle', 'dnd', 'invisible'];
  const next = order[(order.indexOf(myPresence.value) + 1) % order.length];
  localStorage.setItem('prosa_presence', next);
  users.setPresence(next);
}

function memberMenu(m) {
  // menu de contexto simples: prompt de ações de moderação
  if (!canManage.value || m.user.id === store.user.id) return;
  const action = prompt(`Ação para ${m.user.username}: kick | ban | cargo (admin/moderator/member)`);
  if (!action) return;
  const cid = store.currentCommunity.id;
  if (action === 'kick') communities.kick(cid, m.user.id).catch(e => alert(e.message));
  if (action === 'ban') communities.ban(cid, m.user.id, { reason: 'moderação' }).catch(e => alert(e.message));
  if (['admin', 'moderator', 'member'].includes(action)) communities.setRole(cid, m.user.id, action).catch(e => alert(e.message));
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
