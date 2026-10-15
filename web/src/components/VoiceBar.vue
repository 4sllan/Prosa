<template>
  <div class="voice-panel">
    <div style="font-size:12px;color:var(--verde-mata);font-weight:700">🔊 Conectado — {{ channelName }}</div>
    <div class="voice-grid">
      <div class="voice-tile">
        <video v-if="rtc.video || rtc.screen" ref="localVideo" autoplay muted playsinline></video>
        <span v-else class="avatar">{{ initials(store.user?.username) }}</span>
        <span class="who">você {{ rtc.muted ? '🔇' : '' }} {{ rtc.screen ? '🖥' : '' }}</span>
      </div>
      <div v-for="v in others" :key="v.userId" class="voice-tile">
        <video :ref="el => setRemote(el, v.userId)" autoplay playsinline :muted="rtc.deafened"></video>
        <span class="who">{{ nameOf(v.userId) }} {{ v.muted ? '🔇' : '' }} {{ v.screen ? '🖥' : '' }}</span>
      </div>
    </div>
    <div class="voice-controls">
      <button :class="{ on: !rtc.muted }" @click="toggleMute">{{ rtc.muted ? '🔇 Mudo' : '🎙 Microfone' }}</button>
      <button :class="{ on: rtc.video }" @click="toggleVideo">📷 Câmera</button>
      <button :class="{ on: rtc.screen }" @click="toggleScreen">🖥 Tela</button>
      <button :class="{ on: rtc.deafened }" @click="toggleDeafen">🔕 Surdo</button>
      <button class="leave" @click="leaveVoice">Sair</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue';
import { store } from '../stores.js';
import { rtc, toggleMute, toggleVideo, toggleScreen, toggleDeafen, leaveVoice } from '../rtc.js';

const localVideo = ref(null);
const others = computed(() => (store.voice[rtc.channelId] || []).filter(v => v.userId !== store.user.id));
const channelName = computed(() => store.channels.find(c => c.id === rtc.channelId)?.name || 'voz');

function initials(n) { return String(n || '?').slice(0, 2).toUpperCase(); }
function nameOf(uid) {
  const m = store.members.find(m => m.user.id === uid);
  return m?.user.displayName || 'usuário';
}

const videoEls = new Map();
function setRemote(el, uid) {
  if (!el) return;
  videoEls.set(uid, el);
  const stream = rtc.remoteStreams[`${rtc.channelId}:${uid}`];
  if (stream && el.srcObject !== stream) el.srcObject = stream;
}

watch(() => rtc.remoteStreams, async () => {
  await nextTick();
  for (const [uid, el] of videoEls) {
    const stream = rtc.remoteStreams[`${rtc.channelId}:${uid}`];
    if (stream && el.srcObject !== stream) el.srcObject = stream;
  }
}, { deep: true });

watch(localVideo, (el) => { if (el) el.srcObject = rtc.screen ? rtc.screenStream : rtc.localStream; });
watch(() => [rtc.video, rtc.screen], async () => {
  await nextTick();
  if (localVideo.value) localVideo.value.srcObject = rtc.screen ? rtc.screenStream : rtc.localStream;
});
</script>
