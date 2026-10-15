<template>
  <div class="modal-bg" @click.self="$emit('close')">
    <div class="modal">
      <h2>Configurações — {{ community.name }}</h2>
      <div class="tabs" style="display:flex;gap:8px;margin-bottom:16px">
        <button v-for="t in ['geral','convites','moderação','perigo']" :key="t" class="pill" :style="tab===t?'background:var(--accent);color:#fff':''" @click="tab=t">{{ t }}</button>
      </div>

      <template v-if="tab === 'geral'">
        <div class="row"><label>Nome</label><input v-model="name" maxlength="100"></div>
        <div class="row"><label>Descrição</label><textarea v-model="desc" rows="3"></textarea></div>
        <div class="row"><label>URL do ícone</label><input v-model="iconUrl" placeholder="/uploads/... ou https://..."></div>
        <div class="actions"><button class="btn primary" @click="save">Salvar</button></div>
      </template>

      <template v-else-if="tab === 'convites'">
        <div class="row">
          <label>Convites ativos</label>
          <div v-for="i in invites" :key="i.code" class="list-item">
            <code style="flex:1">{{ i.code }}</code>
            <span class="pill">{{ i.uses }}{{ i.maxUses ? '/' + i.maxUses : '' }} usos</span>
            <button class="btn ghost" @click="revoke(i.code)">Revogar</button>
          </div>
          <div v-if="!invites.length" style="color:var(--fg-dim);font-size:13px">Nenhum convite ativo</div>
        </div>
        <div class="actions"><button class="btn primary" @click="createInvite">Novo convite</button></div>
      </template>

      <template v-else-if="tab === 'moderação'">
        <div class="row">
          <label>Banidos — {{ bans.length }}</label>
          <div v-for="b in bans" :key="b.userId" class="list-item">
            <div class="grow"><div class="uname">{{ b.username }}</div><div class="sub">{{ b.reason }}</div></div>
            <button class="btn ghost" @click="unban(b.userId)">Desbanir</button>
          </div>
        </div>
        <div class="row">
          <label>Registro de ações</label>
          <div style="max-height:200px;overflow-y:auto;font-size:12px;color:var(--fg-dim)">
            <div v-for="e in auditLog" :key="e.id">{{ new Date(e.createdAt).toLocaleString('pt-BR') }} — {{ e.actor }} · {{ e.action }} {{ e.targetId?.slice(0,8) }}</div>
          </div>
        </div>
      </template>

      <template v-else-if="tab === 'perigo'">
        <div class="row" v-if="isOwner">
          <label style="color:var(--danger)">Zona de perigo</label>
          <p style="font-size:13px;color:var(--fg-dim);margin-bottom:10px">Excluir a comunidade é irreversível.</p>
          <button class="btn danger" @click="del">Excluir comunidade</button>
        </div>
        <div class="row" v-else>
          <button class="btn ghost" @click="leave">Sair da comunidade</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { store, api, loadCommunities } from '../stores.js';

const props = defineProps({ community: Object });
const emit = defineEmits(['close']);
const tab = ref('geral');
const name = ref(props.community.name);
const desc = ref(props.community.description || '');
const iconUrl = ref(props.community.iconUrl || '');
const invites = ref([]); const bans = ref([]); const auditLog = ref([]);
const isOwner = computed(() => store.currentCommunity?.myRole === 'owner');
const cid = props.community.id;

async function save() {
  await api(`/communities/${cid}`, { method: 'PATCH', body: { name: name.value, description: desc.value, iconUrl: iconUrl.value || null } });
  await loadCommunities();
}
async function loadInvites() { invites.value = (await api(`/communities/${cid}/invites`)).invites; }
async function createInvite() {
  const r = await api(`/communities/${cid}/invites`, { method: 'POST', body: {} });
  await loadInvites();
  alert(`Convite criado: ${r.invite.code}`);
}
async function revoke(code) { await api(`/communities/${cid}/invites/${code}`, { method: 'DELETE' }); loadInvites(); }
async function loadBans() { bans.value = (await api(`/communities/${cid}/bans`)).bans; }
async function unban(uid) { await api(`/communities/${cid}/bans/${uid}`, { method: 'DELETE' }); loadBans(); }
async function loadAudit() { try { auditLog.value = (await api(`/communities/${cid}/audit-log`)).entries; } catch {} }
async function del() {
  if (!confirm(`Excluir "${props.community.name}" permanentemente?`)) return;
  await api(`/communities/${cid}`, { method: 'DELETE' });
  emit('close');
  await loadCommunities();
  store.currentCommunity = null;
}
async function leave() {
  await api(`/communities/${cid}/leave`, { method: 'POST' });
  emit('close');
  await loadCommunities();
  store.currentCommunity = null;
}
onMounted(() => { loadInvites().catch(() => {}); loadBans().catch(() => {}); loadAudit(); });
</script>
