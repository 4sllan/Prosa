<template>
  <div class="voice-panel">
    <div style="font-size:12px;color:var(--verde-mata);font-weight:700"><Volume2 :size="14" aria-hidden="true" /> Conectado — {{ channelName }}</div>
    <div class="voice-grid">
      <div class="voice-tile">
        <video v-if="rtc.video || rtc.screen" ref="localVideo" autoplay muted playsinline></video>
        <span v-else class="avatar">{{ initials(store.user?.username) }}</span>
        <span class="who">você <MicOff v-if="rtc.muted" :size="12" aria-hidden="true" /> <ScreenShare v-if="rtc.screen" :size="12" aria-hidden="true" /></span>
      </div>
      <div v-for="v in others" :key="v.userId" class="voice-tile">
        <video :ref="el => setRemote(el, v.userId)" autoplay playsinline :muted="rtc.deafened || rtc.speakerMuted"></video>
        <span class="who">{{ nameOf(v.userId) }} <MicOff v-if="v.muted" :size="12" aria-hidden="true" /> <ScreenShare v-if="v.screen" :size="12" aria-hidden="true" /></span>
      </div>
    </div>
    <div class="voice-controls">
      <button :class="{ on: !rtc.muted }" @click="toggleMute"><MicOff v-if="rtc.muted" :size="14" aria-hidden="true" /><Mic v-else :size="14" aria-hidden="true" /> {{ rtc.muted ? 'Mudo' : 'Microfone' }}</button>
      <button :class="{ on: !rtc.speakerMuted }" @click="toggleSpeaker"><VolumeX v-if="rtc.speakerMuted" :size="14" aria-hidden="true" /><Volume2 v-else :size="14" aria-hidden="true" /> {{ rtc.speakerMuted ? 'Sem som' : 'Alto-falante' }}</button>
      <button :class="{ on: rtc.video }" @click="toggleVideo"><Video :size="14" aria-hidden="true" /> Câmera</button>
      <button :class="{ on: rtc.screen }" @click="toggleScreen"><ScreenShare :size="14" aria-hidden="true" /> Tela</button>
      <button :class="{ on: rtc.deafened }" @click="toggleDeafen"><HeadphoneOff :size="14" aria-hidden="true" /> Surdo</button>
      <button class="leave" @click="leaveVoice">Sair</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue';
import { store } from '../stores.js';
import { rtc, toggleMute, toggleSpeaker, toggleVideo, toggleScreen, toggleDeafen, leaveVoice } from '../rtc.js';
import { Volume2, VolumeX, Mic, MicOff, Video, ScreenShare, HeadphoneOff } from 'lucide-vue-next';

const localVideo = ref(null);
const others = computed(() => (store.voice[rtc.channelId] || []).filter(v => v.userId !== store.user.id));
const channelName = computed(() => rtc.channelName || store.channels.find(c => c.id === rtc.channelId)?.name || 'voz');

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
