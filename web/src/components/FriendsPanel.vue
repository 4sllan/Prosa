<template>
  <div class="main" style="padding:24px;overflow-y:auto">
    <h2 style="margin-bottom:16px">Amigos</h2>
    <div style="display:flex;gap:8px;margin-bottom:20px;max-width:460px">
      <input v-model="addName" placeholder="Adicionar por nome de usuário" style="flex:1" @keydown.enter="add">
      <button class="btn primary" @click="add">Adicionar</button>
    </div>
    <div v-if="err" class="auth-err">{{ err }}</div>
    <p class="cancellation-announcement" role="status" aria-live="polite" aria-atomic="true">{{ cancellationState.notice }}</p>
    <p v-if="cancellationState.notice" class="cancellation-notice" aria-hidden="true">{{ cancellationState.notice }}</p>
    <p v-if="cancellationState.error" class="auth-err" role="alert">{{ cancellationState.error }}</p>
    <button v-if="cancellationState.needsReload" ref="refreshButton" class="btn ghost refresh-relationships"
            :disabled="cancellationState.refreshing" :aria-busy="cancellationState.refreshing"
            @click="refreshAfterCancellation">
      {{ cancellationState.refreshing ? 'Atualizando…' : 'Atualizar lista' }}
    </button>

    <h3 style="margin:18px 0 8px;color:var(--fg-dim)">Recebidas — {{ incoming.length }}</h3>
    <div v-for="r in incoming" :key="r.id" class="list-item">
      <span class="avatar">{{ ini(r.user.displayName) }}</span>
      <div class="grow"><div class="uname">{{ r.user.displayName }}</div><div class="sub">@{{ r.user.username }}</div></div>
      <button class="btn primary" @click="contacts.accept(r.user.id).then(reload)">Aceitar</button>
      <button class="btn ghost" @click="contacts.remove(r.user.id).then(reload)">Recusar</button>
    </div>

    <h3 ref="outgoingHeading" tabindex="-1" style="margin:18px 0 8px;color:var(--fg-dim)">Enviadas — {{ outgoing.length }}</h3>
    <div v-for="r in outgoing" :key="r.id" class="list-item outgoing-item">
      <span class="avatar">{{ ini(r.user.displayName) }}</span>
      <div class="grow"><div class="uname">{{ r.user.displayName }}</div><div class="sub">@{{ r.user.username }}</div></div>
      <span class="pill">pendente</span>
      <button class="btn ghost cancel-invitation"
              :disabled="cancellationState.pendingIds.includes(r.user.id) || cancellationState.needsReload"
              :aria-busy="cancellationState.pendingIds.includes(r.user.id)"
              :aria-label="'Cancelar convite para ' + r.user.displayName"
              @click="cancelInvitation(r.user.id, $event)">
        {{ cancellationState.pendingIds.includes(r.user.id) ? 'Cancelando…' : 'Cancelar convite' }}
      </button>
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
import { ref, computed, onUnmounted, nextTick } from 'vue';
import { store, loadRelationships } from '../stores.js';
import { contacts } from '../services/index.js';
import { createInvitationCancellation } from '../services/invitation-cancellation.js';

const addName = ref(''); const err = ref('');
const incoming = computed(() => store.relationships.filter(r => r.type === 'incoming'));
const outgoing = computed(() => store.relationships.filter(r => r.type === 'outgoing'));
const blocked = computed(() => store.relationships.filter(r => r.type === 'blocked'));

const ini = (n) => String(n || '?').slice(0, 2).toUpperCase();
const reload = () => loadRelationships();
const outgoingHeading = ref(null);
const refreshButton = ref(null);
const cancellationState = ref({});
const cancellation = createInvitationCancellation({
  remove: userId => contacts.remove(userId),
  reload,
  onChange: state => { cancellationState.value = state; },
  successMessage: store.mode === 'p2p'
    ? 'Convite cancelado neste dispositivo. A entrega ao amigo nao e confirmada.'
    : 'Convite cancelado.',
});
onUnmounted(() => cancellation.dispose());

async function cancelInvitation(userId, event) {
  err.value = '';
  const cancelled = await cancellation.cancel(userId);
  if (event?.detail === 0) {
    await nextTick();
    if (cancelled) outgoingHeading.value?.focus();
    else if (cancellationState.value.needsReload) refreshButton.value?.focus();
  }
}
async function refreshAfterCancellation(event) {
  if (await cancellation.refresh() && event?.detail === 0) {
    await nextTick();
    outgoingHeading.value?.focus();
  }
}

async function add() {
  err.value = '';
  try { await contacts.request(addName.value.trim()); addName.value = ''; await reload(); }
  catch (e) { err.value = e.message; }
}
async function unblock(uid) { await contacts.unblock(uid); reload(); }
</script>

<style scoped>
.cancellation-announcement { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.cancellation-notice { color: var(--fg-dim); font-size: 13px; margin: 0 0 8px; }
.refresh-relationships { align-self: flex-start; }
.outgoing-item { flex-wrap: wrap; }
.outgoing-item .grow { min-width: 90px; overflow-wrap: anywhere; }
.cancel-invitation { flex-shrink: 0; }
.cancel-invitation:focus-visible, .refresh-relationships:focus-visible { outline: 2px solid var(--fg); outline-offset: 3px; }
</style>
