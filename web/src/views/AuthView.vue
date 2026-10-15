<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="brand-mark">{{ store.appName[0] }}</div>
      <h1>{{ mode === 'register' ? 'Criar conta' : mode === 'reset' ? 'Recuperar senha' : 'Bem-vindo ao' }} <span>{{ store.appName }}</span></h1>
      <p class="sub">{{ mode === 'register' ? 'Sua roda de conversa.' : mode === 'reset' ? 'Enviaremos instruções.' : 'Entre para continuar a conversa.' }}</p>

      <form v-if="mode === 'reset'" @submit.prevent="doReset">
        <label>Email</label>
        <input v-model="email" type="email" required autocomplete="email">
        <label v-if="resetSent">Token + nova senha</label>
        <input v-if="resetSent" v-model="resetToken" placeholder="token recebido" required>
        <input v-if="resetSent" v-model="password" type="password" placeholder="nova senha (mín. 8)" minlength="8" required>
        <button class="btn-primary" type="submit">{{ resetSent ? 'Redefinir senha' : 'Enviar' }}</button>
      </form>

      <form v-else @submit.prevent="submit">
        <label v-if="mode === 'register'">Nome de usuário</label>
        <input v-if="mode === 'register'" v-model="username" required minlength="3" autocomplete="username">
        <label v-if="mode === 'register'">Email</label>
        <input v-if="mode === 'register'" v-model="email" type="email" required autocomplete="email">
        <label>{{ mode === 'register' ? 'Senha' : 'Usuário ou email' }}</label>
        <input v-if="mode === 'register'" v-model="password" type="password" required minlength="8" autocomplete="new-password">
        <template v-else>
          <input v-model="username" required autocomplete="username">
          <label>Senha</label>
          <input v-model="password" type="password" required autocomplete="current-password">
        </template>
        <button class="btn-primary" type="submit" :disabled="loading">{{ mode === 'register' ? 'Criar conta' : 'Entrar' }}</button>
      </form>

      <div v-if="error" class="auth-err">{{ error }}</div>
      <div v-if="resetInfo" class="auth-err" style="background:#29c77b22;color:var(--verde-mata)">{{ resetInfo }}</div>

      <div class="swap">
        <template v-if="mode === 'login'">
          Novo aqui? <button @click="mode='register'">Criar conta</button> ·
          <button @click="mode='reset'">Esqueci a senha</button>
        </template>
        <template v-else>
          Já tem conta? <button @click="mode='login'">Entrar</button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { store, login, register } from '../stores.js';
import { api, setToken } from '../api.js';

const router = useRouter();
const mode = ref('login');
const username = ref(''); const email = ref(''); const password = ref('');
const resetToken = ref(''); const resetSent = ref(false); const resetInfo = ref('');
const error = ref(''); const loading = ref(false);

async function submit() {
  error.value = ''; loading.value = true;
  try {
    if (mode.value === 'register') await register(username.value, email.value, password.value);
    else await login(username.value, password.value);
    router.push('/');
  } catch (e) { error.value = e.message; }
  loading.value = false;
}

async function doReset() {
  error.value = ''; loading.value = true;
  try {
    if (!resetSent.value) {
      const r = await api('/auth/password/request', { method: 'POST', body: { email: email.value } });
      resetSent.value = true;
      resetInfo.value = r.devResetToken
        ? `Modo dev — token: ${r.devResetToken}`
        : 'Se o email existir, você receberá o token.';
    } else {
      await api('/auth/password/confirm', { method: 'POST', body: { token: resetToken.value, password: password.value } });
      mode.value = 'login'; resetInfo.value = 'Senha redefinida. Faça login.';
    }
  } catch (e) { error.value = e.message; }
  loading.value = false;
}
</script>
