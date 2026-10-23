<template>
  <section v-if="rtc.channelId && (progress || state.phase === 'error')"
           class="screen-share-feedback" :class="{ 'has-error': state.phase === 'error' }"
           aria-label="Estado do compartilhamento de tela">
    <div :role="progress ? 'status' : 'alert'" aria-atomic="true">
      <strong>Compartilhamento de tela</strong>
      <p>{{ progress ? (state.phase === 'initializing' ? 'Preparando a sele\u00e7\u00e3o de tela.' : 'Iniciando a captura de tela.') : message }}</p>
      <p v-if="nativeDenied">
        Confira Ajustes do Sistema &gt; Privacidade e Seguran&ccedil;a &gt; Grava&ccedil;&atilde;o de Tela
        (ou Grava&ccedil;&atilde;o de Tela e &Aacute;udio do Sistema).
        Pode ser necess&aacute;rio encerrar e reabrir o Prosa ap&oacute;s alterar a permiss&atilde;o.
      </p>
      <p v-else-if="progress && !desktop">
        Cancelar descarta esta tentativa, mas n&atilde;o fecha o seletor do navegador. Feche-o tamb&eacute;m para tentar novamente.
      </p>
    </div>
    <div class="screen-share-actions">
      <button v-if="progress" class="btn ghost" @click="cancelScreen">Cancelar compartilhamento</button>
      <template v-else>
        <button class="btn primary" data-screen-share @click="toggleScreen">Tentar novamente</button>
        <button class="btn ghost" @click="cancelScreen">Dispensar</button>
      </template>
    </div>
  </section>

  <dialog ref="dialog" class="screen-share-dialog" aria-modal="true" aria-labelledby="screen-share-title"
          aria-describedby="screen-share-description" @cancel.prevent="cancelScreen" @keydown="onKeydown">
    <h2 id="screen-share-title">O que voc&ecirc; quer compartilhar?</h2>
    <p id="screen-share-description">Escolha uma tela ou janela. Apenas a imagem ser&aacute; compartilhada, sem &aacute;udio do sistema.</p>
    <div class="screen-source-grid">
      <button v-for="source in state.sources" :key="source.id" class="screen-source" type="button"
              :aria-label="'Compartilhar ' + source.name" @click="selectScreenSource(state.requestId, source.id)">
        <span class="screen-source-preview">
          <img v-if="source.thumbnail.startsWith('data:image/png;base64,')" :src="source.thumbnail" alt="" loading="lazy">
          <ScreenShare v-else :size="32" aria-hidden="true" />
        </span>
        <span class="screen-source-name">{{ source.name }}</span>
      </button>
    </div>
    <div class="screen-share-actions">
      <button ref="cancelButton" class="btn ghost" type="button" autofocus @click="cancelScreen">Cancelar</button>
    </div>
  </dialog>
</template>

<script setup>
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { ScreenShare } from 'lucide-vue-next';
import { rtc, toggleScreen, selectScreenSource, cancelScreen } from '../rtc.js';

const dialog = ref(null), cancelButton = ref(null);
const state = computed(() => rtc.screenSharing);
const progress = computed(() => ['initializing', 'capturing'].includes(state.value.phase));
const pending = phase => ['initializing', 'selecting', 'capturing'].includes(phase);
const desktop = !!window.prosaDesktop?.isDesktop;
const nativeDenied = computed(() => desktop && window.prosaDesktop.platform === 'darwin'
  && ['permission-denied', 'permission-restricted'].includes(state.value.error?.code));
const messages = {
  'permission-denied': 'O acesso \u00e0 grava\u00e7\u00e3o de tela foi negado no macOS.',
  'permission-restricted': 'A grava\u00e7\u00e3o de tela est\u00e1 restrita no macOS. Uma pol\u00edtica do sistema pode impedir a altera\u00e7\u00e3o.',
  'no-sources': 'Nenhuma tela ou janela est\u00e1 dispon\u00edvel. Abra uma janela e tente novamente.',
  'source-unavailable': 'A tela ou janela escolhida n\u00e3o est\u00e1 mais dispon\u00edvel. Escolha outra fonte.',
  timeout: 'O tempo para escolher uma tela terminou. Tente novamente.',
  'capture-blocked': 'O compartilhamento n\u00e3o foi iniciado. A sele\u00e7\u00e3o pode ter sido cancelada ou o acesso bloqueado pelo aplicativo ou navegador.',
  'capture-unavailable': 'A captura de tela n\u00e3o est\u00e1 dispon\u00edvel. No navegador, use HTTPS ou localhost e confira o suporte ao compartilhamento.',
  'capture-unreadable': 'N\u00e3o foi poss\u00edvel acessar a tela escolhida. Ela pode estar indispon\u00edvel ou em uso.',
  'capture-pending': 'A tentativa anterior ainda est\u00e1 sendo encerrada. Feche o seletor do navegador ou do sistema, se estiver aberto, e tente novamente.',
  'desktop-unavailable': 'N\u00e3o foi poss\u00edvel abrir a sele\u00e7\u00e3o de tela no aplicativo. Tente novamente; se persistir, reabra o Prosa.',
  'signaling-failed': 'N\u00e3o foi poss\u00edvel atualizar o estado da tela na chamada. A captura local foi encerrada. Tente novamente.',
  'capture-failed': 'N\u00e3o foi poss\u00edvel iniciar a captura de tela. Tente novamente.',
};
const message = computed(() => {
  const code = state.value.error?.code;
  if (['permission-denied', 'permission-restricted'].includes(code) && !nativeDenied.value) return messages['capture-blocked'];
  return messages[code] || messages['capture-failed'];
});
let opener = null, restorePending = false, mounted = false;

function rememberTrigger(event) {
  const button = event.target?.closest?.('[data-screen-share]');
  if (button && !button.disabled && !pending(state.value.phase)) opener = button;
}

function restoreFocus() {
  if (!restorePending) return;
  restorePending = false;
  if (opener?.isConnected && !opener.disabled) opener.focus();
  opener = null;
}

watch(() => [rtc.channelId, state.value.phase], async ([, phase], previous) => {
  if (pending(phase) && !pending(previous?.[1])) {
    opener ||= document.activeElement;
    restorePending = true;
  }
  await nextTick();
  if (!mounted) return;
  if (rtc.channelId && state.value.phase === 'selecting') {
    if (!dialog.value.open) {
      dialog.value.showModal();
      cancelButton.value.focus();
    }
  } else {
    if (dialog.value?.open) dialog.value.close();
    if (!rtc.channelId || !pending(state.value.phase)) restoreFocus();
  }
}, { immediate: true });

function onKeydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); cancelScreen(); return; }
  if (event.key !== 'Tab') return;
  const buttons = [...dialog.value.querySelectorAll('button:not(:disabled)')];
  const first = buttons[0], last = buttons.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  mounted = true;
  // Capture the origin before the RTC change disables the clicked control.
  document.addEventListener('click', rememberTrigger, true);
});
onBeforeUnmount(() => {
  mounted = false;
  document.removeEventListener('click', rememberTrigger, true);
  if (dialog.value?.open) dialog.value.close();
  if (pending(state.value.phase)) cancelScreen();
  restoreFocus();
});
</script>

<style scoped>
.screen-share-feedback { flex-shrink: 0; min-width: 0; max-height: 40%; overflow-y: auto; overflow-wrap: anywhere; margin: 12px 16px; padding: 12px; border: 1px solid var(--border); border-left: 3px solid var(--verde-mata); border-radius: 10px; background: var(--bg-input); font-size: 13px; }
.screen-share-feedback.has-error { border-left-color: var(--danger); }
.screen-share-feedback p { margin-top: 6px; }
.screen-share-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
.screen-share-actions button { min-height: 44px; max-width: 100%; }
.screen-share-dialog { margin: auto; width: min(680px, calc(100vw - 32px)); max-height: 85vh; max-height: 85dvh; overflow-y: auto; padding: 24px; border: 1px solid var(--border); border-radius: 16px; background: var(--bg-side); color: var(--fg); box-shadow: 0 20px 60px #0005; }
.screen-share-dialog[open] { display: flex; flex-direction: column; }
.screen-share-dialog::backdrop { background: #0009; }
.screen-share-dialog h2 { flex-shrink: 0; font-size: 18px; margin-bottom: 10px; }
.screen-share-dialog p { flex-shrink: 0; font-size: 13px; line-height: 1.5; color: var(--fg-dim); }
.screen-share-dialog .screen-share-actions { flex-shrink: 0; }
.screen-source-grid { min-height: 0; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap: 12px; margin-top: 20px; padding: 3px; }
.screen-source { min-width: 0; padding: 8px; border: 1px solid var(--border); border-radius: 12px; text-align: left; background: var(--bg-input); }
.screen-source:hover { border-color: var(--verde-mata); }
.screen-source-preview { display: grid; place-items: center; width: 100%; aspect-ratio: 16 / 9; border-radius: 7px; overflow: hidden; background: var(--bg-main); color: var(--fg-dim); }
.screen-source-preview img { width: 100%; height: 100%; object-fit: contain; }
.screen-source-name { display: block; margin-top: 8px; font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; }
.screen-share-actions button:focus-visible, .screen-source:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (max-width: 480px) {
  .screen-share-dialog { padding: 16px; }
}
</style>
