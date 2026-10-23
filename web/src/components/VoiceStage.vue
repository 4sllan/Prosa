<template>
  <div class="voice-stage">
    <div class="stage-head">
      <Volume2 :size="18" aria-hidden="true" /> {{ channel.name }}
      <span class="stage-count" v-if="members.length">{{ members.length }} na chamada</span>
    </div>

    <div v-if="!members.length" class="stage-empty">
      <Volume2 :size="42" aria-hidden="true" />
      <p>Ninguém na chamada — seja o primeiro a entrar.</p>
    </div>
    <div v-else class="voice-grid" :class="{ 'is-single': members.length === 1 }" :style="{ '--stage-columns': Math.ceil(Math.sqrt(members.length)) }">
      <div v-for="v in members" :key="v.userId" class="voice-tile" :class="{ speaking: rtc.speaking[v.userId], 'sharing-screen': v.userId === store.user?.id ? rtc.screen : v.screen }">
        <video v-if="v.userId === store.user?.id && (rtc.video || rtc.screen)" :ref="setLocalVideo" autoplay muted playsinline></video>
        <video v-else-if="v.userId !== store.user?.id" v-show="v.video || v.screen" :ref="el => setRemote(el, v.userId)" autoplay playsinline :muted="rtc.deafened || rtc.speakerMuted"></video>
        <span v-if="v.userId === store.user?.id ? !(rtc.video || rtc.screen) : !(v.video || v.screen)" class="avatar">
          <img v-if="avatarOf(v.userId)" :src="fullUrl(avatarOf(v.userId))">
          <template v-else>{{ initials(nameOf(v.userId)) }}</template>
        </span>
        <span class="who"><span class="participant-name">{{ v.userId === store.user?.id ? 'você' : nameOf(v.userId) }}</span>
          <MicOff v-if="v.muted" :size="12" aria-hidden="true" /> <ScreenShare v-if="v.screen" :size="12" aria-hidden="true" />
        </span>
      </div>
    </div>

    <div v-if="inThisChannel" class="stage-controls" role="group" aria-label="Controles da chamada">
      <button :class="{ on: microphoneReady && !rtc.muted }" :disabled="!microphoneReady" @click="toggleMute"><MicOff v-if="!microphoneReady || rtc.muted" :size="14" aria-hidden="true" /><Mic v-else :size="14" aria-hidden="true" /> {{ !microphoneReady ? 'Microfone indisponível' : rtc.muted ? 'Mudo' : 'Microfone' }}</button>
      <button :class="{ on: !rtc.speakerMuted }" @click="toggleSpeaker"><VolumeX v-if="rtc.speakerMuted" :size="14" aria-hidden="true" /><Volume2 v-else :size="14" aria-hidden="true" /> {{ rtc.speakerMuted ? 'Sem som' : 'Alto-falante' }}</button>
      <span class="stage-controls-divider" aria-hidden="true"></span>
      <button class="icon-control" :class="{ on: rtc.video }" :aria-pressed="rtc.video" aria-label="Câmera" title="Câmera" @click="toggleVideo"><Video :size="18" aria-hidden="true" /></button>
      <button class="icon-control" :class="{ on: rtc.screen }" :aria-pressed="rtc.screen" aria-label="Compartilhar tela" title="Compartilhar tela" @click="toggleScreen"><ScreenShare :size="18" aria-hidden="true" /></button>
      <button class="icon-control" :class="{ on: rtc.deafened }" :aria-pressed="rtc.deafened" aria-label="Surdo" title="Surdo" @click="toggleDeafen"><HeadphoneOff :size="18" aria-hidden="true" /></button>
      <span class="stage-controls-divider" aria-hidden="true"></span>
      <button class="leave" @click="leaveVoice">Sair</button>
    </div>
  </div>
</template>

<script setup>
import { computed, watch, nextTick } from 'vue';
import { store, fullUrl } from '../stores.js';
import { rtc, toggleMute, toggleSpeaker, toggleVideo, toggleScreen, toggleDeafen, leaveVoice } from '../rtc.js';
import { Volume2, VolumeX, Mic, MicOff, Video, ScreenShare, HeadphoneOff } from 'lucide-vue-next';

const props = defineProps({ channel: Object });

let localVideo = null;
const localStream = computed(() => rtc.screen ? rtc.screenStream : rtc.video ? rtc.localStream : null);
const members = computed(() => store.voice[props.channel.id] || []);
const microphoneReady = computed(() => rtc.microphone.phase === 'ready');
const inThisChannel = computed(() => rtc.channelId === props.channel.id && ['ready', 'error'].includes(rtc.microphone.phase));

function initials(n) { return String(n || '?').slice(0, 2).toUpperCase(); }
function nameOf(uid) {
  if (uid === store.user?.id) return store.user.displayName;
  const m = store.members.find(m => m.user.id === uid);
  return m?.user.displayName || 'usuário';
}
function avatarOf(uid) {
  if (uid === store.user?.id) return store.user.avatarUrl;
  return store.members.find(m => m.user.id === uid)?.user.avatarUrl;
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

function syncLocalVideo() {
  if (localVideo && localVideo.srcObject !== localStream.value) {
    localVideo.srcObject = localStream.value;
  }
}

function setLocalVideo(el) {
  if (localVideo && localVideo !== el) localVideo.srcObject = null;
  localVideo = el;
  syncLocalVideo();
}

watch(localStream, syncLocalVideo, { flush: 'post' });
</script>
