<template>
  <div :data-theme="store.theme" style="height:100%">
    <div v-if="store.ready && store.bootError" class="empty"><div>
      <div class="big">⚠️</div>
      <div>Não foi possível iniciar o {{ store.appName }}.</div>
      <div style="color:var(--fg-dim);margin:8px 0">{{ store.bootError }}</div>
      <button class="btn-primary" @click="retry">Tentar novamente</button>
    </div></div>
    <ModePicker v-else-if="store.ready && store.needsModePick" />
    <router-view v-else-if="store.ready" />
    <div v-else class="empty"><div><div class="big">💬</div>Carregando {{ store.appName }}…</div></div>
    <div v-for="(n, i) in store.notifications.slice(-3)" :key="n.at" class="toast" :style="{ top: 16 + i * 84 + 'px' }" @click="dismiss(n)">
      <button class="toast-x" title="Fechar" @click.stop="dismiss(n)">✕</button>
      <b>{{ n.message?.author?.username }}</b> mencionou você
      <div style="color:var(--fg-dim)">{{ n.message?.content?.slice(0, 90) }}</div>
    </div>
  </div>
</template>

<script setup>
import { store, bootstrap, dismissNotification } from './stores.js';
import ModePicker from './components/ModePicker.vue';
import { watchEffect } from 'vue';

watchEffect(() => document.documentElement.setAttribute('data-theme', store.theme));

function retry() {
  store.ready = false;
  store.bootError = null;
  bootstrap();
}

function dismiss(n) {
  dismissNotification(n);
}
</script>
