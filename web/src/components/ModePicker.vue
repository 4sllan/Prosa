<template>
  <div class="auth-page">
    <div class="auth-card" style="max-width:520px">
      <div class="brand-mark">{{ store.appName[0] }}</div>
      <h1>Escolha o modo</h1>
      <p class="sub">Como esta instalação do {{ store.appName }} deve se conectar?</p>

      <button class="mode-opt" @click="pick('server')">
        <b>Servidor</b>
        <span>Conta com login/senha, dados no backend atual (recomendado hoje).</span>
      </button>
      <button class="mode-opt experimental" @click="pick('p2p')">
        <b>P2P — experimental</b>
        <span>Identidade por chave, conversa direta com amigos. Sem servidor; entrega só com peer online.</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { store, services } from '../stores.js';

function pick(mode) {
  localStorage.setItem('prosa_mode', mode);
  location.reload();
}
</script>

<style scoped>
.mode-opt {
  display: block; width: 100%; text-align: left; margin: 10px 0; padding: 14px;
  border: 1px solid var(--border); border-radius: 10px; background: transparent;
  color: var(--fg); cursor: pointer;
}
.mode-opt b { display: block; margin-bottom: 4px; }
.mode-opt span { font-size: 13px; color: var(--fg-dim); }
.mode-opt:hover { border-color: var(--accent); }
.mode-opt.experimental { border-style: dashed; }
</style>
