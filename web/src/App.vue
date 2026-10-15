<template>
  <div :data-theme="store.theme" style="height:100%">
    <router-view v-if="store.ready" />
    <div v-else class="empty"><div><div class="big">💬</div>Carregando {{ store.appName }}…</div></div>
    <div v-for="n in store.notifications.slice(-3)" :key="n.at" class="toast" @click="dismiss(n)">
      <b>{{ n.message?.author?.username }}</b> mencionou você
      <div style="color:var(--fg-dim)">{{ n.message?.content?.slice(0, 90) }}</div>
    </div>
  </div>
</template>

<script setup>
import { store } from './stores.js';
import { watchEffect } from 'vue';

watchEffect(() => document.documentElement.setAttribute('data-theme', store.theme));

function dismiss(n) {
  const i = store.notifications.indexOf(n);
  if (i >= 0) store.notifications.splice(i, 1);
}
</script>
