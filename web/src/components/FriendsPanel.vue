<template>
  <div class="main" style="padding:24px;overflow-y:auto">
    <h2 style="margin-bottom:16px">Amigos</h2>
    <div style="display:flex;gap:8px;margin-bottom:20px;max-width:460px">
      <input v-model="addName" placeholder="Adicionar por nome de usuário" style="flex:1" @keydown.enter="add">
      <button class="btn primary" @click="add">Adicionar</button>
    </div>
    <div v-if="err" class="auth-err">{{ err }}</div>

    <h3 style="margin:18px 0 8px;color:var(--fg-dim)">Recebidas — {{ incoming.length }}</h3>
    <div v-for="r in incoming" :key="r.id" class="list-item">
      <span class="avatar">{{ ini(r.user.displayName) }}</span>
      <div class="grow"><div class="uname">{{ r.user.displayName }}</div><div class="sub">@{{ r.user.username }}</div></div>
      <button class="btn primary" @click="api(`/users/@me/relationships/${r.user.id}/accept`, {method:'POST'}).then(reload)">Aceitar</button>
      <button class="btn ghost" @click="api(`/users/@me/relationships/${r.user.id}`, {method:'DELETE'}).then(reload)">Recusar</button>
    </div>

    <h3 style="margin:18px 0 8px;color:var(--fg-dim)">Enviadas — {{ outgoing.length }}</h3>
    <div v-for="r in outgoing" :key="r.id" class="list-item">
      <span class="avatar">{{ ini(r.user.displayName) }}</span>
      <div class="grow"><div class="uname">{{ r.user.displayName }}</div><div class="sub">@{{ r.user.username }}</div></div>
      <span class="pill">pendente</span>
    </div>

    <h3 style="margin:18px 0 8px;color:var(--fg-dim)">Amigos — {{ friends.length }}</h3>
    <div v-for="r in friends" :key="r.id" class="list-item">
      <span class="avatar">{{ ini(r.user.displayName) }}<span class="dot" :class="presenceOf(r.user.id)"></span></span>
      <div class="grow"><div class="uname">{{ r.user.displayName }}</div><div class="sub">@{{ r.user.username }} · {{ presenceOf(r.user.id) }}</div></div>
      <button class="btn primary" @click="openDm(r.user.id)">Mensagem</button>
      <button class="btn ghost" @click="block(r.user.id)">Bloquear</button>
      <button class="btn ghost" @click="remove(r.user.id)">Remover</button>
    </div>

    <h3 style="margin:18px 0 8px;color:var(--fg-dim)">Bloqueados — {{ blocked.length }}</h3>
    <div v-for="r in blocked" :key="r.id" class="list-item">
      <span class="avatar">{{ ini(r.user.displayName) }}</span>
      <div class="grow"><div class="uname">{{ r.user.displayName }}</div></div>
      <button class="btn ghost" @click="unblock(r.user.id)">Desbloquear</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { store, api, loadRelationships, loadDms, openChannel, presenceOf } from '../stores.js';

const addName = ref(''); const err = ref('');
const friends = computed(() => store.relationships.filter(r => r.type === 'friend'));
const incoming = computed(() => store.relationships.filter(r => r.type === 'incoming'));
const outgoing = computed(() => store.relationships.filter(r => r.type === 'outgoing'));
const blocked = computed(() => store.relationships.filter(r => r.type === 'blocked'));

const ini = (n) => String(n || '?').slice(0, 2).toUpperCase();
const reload = () => loadRelationships();

async function add() {
  err.value = '';
  try { await api('/users/@me/relationships', { method: 'POST', body: { username: addName.value.trim() } }); addName.value = ''; await reload(); }
  catch (e) { err.value = e.message; }
}
async function openDm(uid) {
  const r = await api(`/dms/open/${uid}`, { method: 'POST' });
  await loadDms();
  await openChannel(r.dm.id);
  location.hash = '';
}
async function block(uid) { await api(`/users/@me/relationships/${uid}/block`, { method: 'POST' }); reload(); }
async function unblock(uid) { await api(`/users/@me/relationships/${uid}/block`, { method: 'DELETE' }); reload(); }
async function remove(uid) { await api(`/users/@me/relationships/${uid}`, { method: 'DELETE' }); reload(); }
</script>
