<template>
  <div class="main" style="padding:24px;overflow-y:auto">
    <h2 style="margin-bottom:16px">🛡 Administração</h2>
    <div v-if="stats" style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:20px">
      <div class="pill" v-for="(v,k) in stats" :key="k">{{ k }}: {{ v }}</div>
    </div>

    <h3 style="margin:16px 0 8px;color:var(--fg-dim)">Denúncias abertas — {{ openReports.length }}</h3>
    <div v-for="r in openReports" :key="r.id" class="list-item">
      <div class="grow">
        <div class="uname">{{ r.target_type }} · {{ r.reporter }}</div>
        <div class="sub">{{ r.reason }}</div>
      </div>
      <button class="btn primary" @click="resolve(r.id, 'resolved')">Resolver</button>
      <button class="btn ghost" @click="resolve(r.id, 'dismissed')">Ignorar</button>
    </div>

    <h3 style="margin:16px 0 8px;color:var(--fg-dim)">Usuários — {{ users.length }}</h3>
    <div v-for="u in users" :key="u.id" class="list-item">
      <div class="grow">
        <div class="uname">{{ u.displayName || u.username }} <span class="pill" v-if="u.isAdmin">admin</span> <span class="pill" v-if="u.suspended">suspenso</span></div>
        <div class="sub">@{{ u.username }} · {{ u.email }}</div>
      </div>
      <button v-if="!u.isAdmin" class="btn ghost" @click="toggleSuspend(u)">{{ u.suspended ? 'Reativar' : 'Suspender' }}</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../stores.js';

const users = ref([]); const reports = ref([]); const stats = ref(null);
const openReports = computed(() => reports.value.filter(r => r.status === 'open'));

async function load() {
  [users.value, reports.value, stats.value] = await Promise.all([
    api('/admin/users').then(r => r.users),
    api('/admin/reports').then(r => r.reports),
    api('/admin/stats'),
  ]);
}
async function toggleSuspend(u) {
  await api(`/admin/users/${u.id}/${u.suspended ? 'unsuspend' : 'suspend'}`, { method: 'POST' });
  load();
}
async function resolve(id, status) {
  await api(`/admin/reports/${id}/resolve`, { method: 'POST', body: { status } });
  load();
}
onMounted(load);
</script>
