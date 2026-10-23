<template>
  <div class="modal-bg" @click.self="$emit('close')">
    <div class="modal">
      <h2>Configurações</h2>
      <div class="tabs" style="display:flex;gap:8px;margin-bottom:16px">
        <button v-for="t in ['perfil','conta','aparência']" :key="t" class="pill" :style="tab===t?'background:var(--accent);color:#fff':''" @click="tab=t">{{ t }}</button>
      </div>

      <template v-if="tab === 'perfil'">
        <div class="row"><label>Nome de exibição</label><input v-model="displayName" maxlength="64"></div>
        <div class="row"><label>Bio</label><textarea v-model="bio" rows="3" maxlength="500"></textarea></div>
        <div class="row"><label>Status</label><input v-model="statusText" maxlength="128" placeholder="ex: ocupado até às 18h"></div>
        <div class="row"><label>Avatar (URL)</label><input v-model="avatarUrl" placeholder="/uploads/... ou https://..."></div>
        <div class="row"><label>Presença</label>
          <select v-model="presence">
            <option value="online">Disponível</option><option value="idle">Ausente</option>
            <option value="dnd">Ocupado</option><option value="invisible">Invisível</option>
          </select>
        </div>
        <div class="actions"><button class="btn primary" @click="saveProfile">Salvar</button></div>
      </template>

      <template v-else-if="tab === 'conta'">
        <div class="row"><label>Senha atual</label><input v-model="curPw" type="password"></div>
        <div class="row"><label>Nova senha</label><input v-model="newPw" type="password" minlength="8"></div>
        <div class="actions"><button class="btn primary" @click="changePw">Trocar senha</button></div>
        <div v-if="pwMsg" class="auth-err" :style="pwOk?'background:#29c77b22;color:var(--verde-mata)':''">{{ pwMsg }}</div>
        <hr style="border:0;border-top:1px solid var(--border);margin:18px 0">
        <button class="btn ghost" @click="doLogout">Sair da conta</button>
      </template>

      <template v-else-if="tab === 'aparência'">
        <div class="row"><label>Tema</label>
          <select v-model="theme" @change="applyTheme">
            <option value="dark">Escuro (Açaí)</option><option value="light">Claro (Areia)</option>
          </select>
        </div>
        <div class="row"><label>Notificações do sistema</label>
          <button class="btn ghost" @click="askNotify">{{ notifState }}</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { store, logout } from '../stores.js';
import { users } from '../services/index.js';

const emit = defineEmits(['close']);
const router = useRouter();
const tab = ref('perfil');
const displayName = ref(store.user.displayName);
const bio = ref(store.user.bio || '');
const statusText = ref(store.user.statusText || '');
const avatarUrl = ref(store.user.avatarUrl || '');
const presence = ref(localStorage.getItem('prosa_presence') || 'online');
const curPw = ref(''); const newPw = ref(''); const pwMsg = ref(''); const pwOk = ref(false);
const theme = ref(store.theme);
const notifState = ref(('Notification' in window) ? Notification.permission : 'indisponível');

async function saveProfile() {
  await users.updateProfile({ displayName: displayName.value, bio: bio.value, statusText: statusText.value, avatarUrl: avatarUrl.value || null });
  await users.setPresence(presence.value);
  localStorage.setItem('prosa_presence', presence.value);
  emit('close');
}
async function changePw() {
  pwMsg.value = ''; pwOk.value = false;
  try {
    await users.changePassword(curPw.value, newPw.value);
    pwOk.value = true; pwMsg.value = 'Senha alterada.';
    curPw.value = newPw.value = '';
  } catch (e) { pwMsg.value = e.message; }
}
function applyTheme() {
  store.theme = theme.value;
  localStorage.setItem('prosa_theme', theme.value);
}
async function askNotify() {
  if ('Notification' in window) notifState.value = await Notification.requestPermission();
}
async function doLogout() { await logout(); router.push('/login'); }
</script>
