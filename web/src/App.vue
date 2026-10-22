<template>
  <div :data-theme="store.theme" style="height:100%">
    <div v-if="store.ready && store.bootError" class="empty"><div>
      <div class="big"><TriangleAlert :size="42" aria-hidden="true" /></div>
      <div>Não foi possível iniciar o {{ store.appName }}.</div>
      <div style="color:var(--fg-dim);margin:8px 0">{{ store.bootError }}</div>
      <button class="btn-primary" @click="retry">Tentar novamente</button>
    </div></div>
    <router-view v-else-if="store.ready" />
    <div v-else class="empty"><div><div class="big"><MessageSquare :size="42" aria-hidden="true" /></div>Carregando {{ store.appName }}…</div></div>
    <div v-for="(n, i) in store.notifications.slice(-3)" :key="n.at" class="toast" :style="{ top: 16 + i * 84 + 'px' }" @click="dismiss(n)">
      <button class="toast-x" title="Fechar" @click.stop="dismiss(n)"><X :size="12" aria-hidden="true" /></button>
      <template v-if="n.text">{{ n.text }}</template>
      <template v-else>
        <b>{{ n.message?.author?.username }}</b> mencionou você
        <div style="color:var(--fg-dim)">{{ n.message?.content?.slice(0, 90) }}</div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { store, bootstrap, dismissNotification } from './stores.js';
import { TriangleAlert, MessageSquare, X } from 'lucide-vue-next';
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
