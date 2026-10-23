<template>
  <section v-if="rtc.microphone.target && (pending || rtc.microphone.phase === 'error')"
           class="microphone-feedback" :class="{ 'has-error': !pending }" aria-label="Estado do microfone">
    <div :role="pending ? 'status' : 'alert'" aria-atomic="true">
      <strong>Microfone &mdash; {{ rtc.microphone.target.name || 'canal de voz' }}</strong>
      <p v-if="pending">{{ rtc.microphone.phase === 'requesting' ? 'Aguardando autoriza\u00e7\u00e3o do microfone.' : 'Inicializando o microfone.' }}</p>
      <p v-else>{{ message }}</p>
      <p v-if="pending">Cancelar interrompe a entrada na chamada, mas n&atilde;o fecha a janela de permiss&atilde;o do sistema.</p>
      <p v-else-if="nativeDenied">
        Confira Ajustes do Sistema &gt; Privacidade e Seguran&ccedil;a &gt; Microfone.
        Se uma negativa anterior foi alterada, pode ser necess&aacute;rio encerrar e reabrir o Prosa.
      </p>
      <p v-else-if="rtc.channelId">Saia da chamada e entre novamente para tentar recuperar o microfone.</p>
    </div>
    <div class="microphone-actions">
      <button v-if="pending" class="btn ghost" @click="leaveVoice">Cancelar entrada</button>
      <button v-else-if="rtc.channelId" class="btn ghost" @click="leaveVoice">Sair da chamada</button>
      <button v-else class="btn primary" @click="$emit('retry', rtc.microphone.target)">Tentar novamente</button>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { rtc, leaveVoice } from '../rtc.js';

defineEmits(['retry']);
const pending = computed(() => ['requesting', 'initializing'].includes(rtc.microphone.phase));
const nativeDenied = computed(() => ['permission-denied', 'permission-restricted'].includes(rtc.microphone.error?.code));
const messages = {
  'permission-denied': 'O acesso ao microfone foi negado no macOS.',
  'permission-restricted': 'O acesso ao microfone est\u00e1 restrito no macOS. Uma pol\u00edtica do sistema pode impedir a altera\u00e7\u00e3o.',
  'authorization-failed': 'N\u00e3o foi poss\u00edvel verificar a autoriza\u00e7\u00e3o do microfone. Tente novamente; se persistir, reabra o Prosa.',
  'permission-blocked': 'A captura de \u00e1udio foi bloqueada. Confira as permiss\u00f5es do aplicativo ou navegador, mesmo que o sistema j\u00e1 tenha autorizado o microfone.',
  'device-not-found': 'Nenhum microfone foi encontrado. Conecte um dispositivo e tente novamente.',
  'device-unreadable': 'N\u00e3o foi poss\u00edvel acessar o microfone. Ele pode estar em uso por outro aplicativo ou indispon\u00edvel.',
  'capture-unavailable': 'N\u00e3o h\u00e1 captura de \u00e1udio dispon\u00edvel. Confira o dispositivo e, no navegador, use HTTPS ou localhost.',
  'capture-failed': 'N\u00e3o foi poss\u00edvel iniciar a captura de \u00e1udio. Confira o microfone e tente novamente.',
  'voice-join-failed': 'N\u00e3o foi poss\u00edvel concluir a entrada na chamada. Tente novamente.',
  'track-ended': 'A captura do microfone foi interrompida.',
};
const message = computed(() => messages[rtc.microphone.error?.code] || messages['capture-failed']);
</script>

<style scoped>
.microphone-feedback { flex-shrink: 0; min-width: 0; max-height: 50%; overflow-y: auto; overflow-wrap: anywhere; margin: 12px 16px; padding: 12px; border: 1px solid var(--border); border-left: 3px solid var(--verde-mata); border-radius: 10px; background: var(--bg-input); font-size: 13px; }
.microphone-feedback.has-error { border-left-color: var(--danger); }
.microphone-feedback p { margin-top: 6px; }
.microphone-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.microphone-actions button { min-height: 44px; max-width: 100%; }
.microphone-actions button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
</style>
