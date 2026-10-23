import { reactive } from 'vue';
import { store } from './stores.js';
import { events, misc } from './services/index.js';

// WebRTC mesh: peers = Map<`${channelId}:${userId}`, {pc, stream}>
export const rtc = reactive({
  channelId: null,
  channelName: null,
  peers: new Map(),
  localStream: null,
  screenStream: null,
  muted: false,
  deafened: false,
  speakerMuted: false,
  video: false,
  screen: false,
  remoteStreams: {}, // `${channelId}:${userId}` -> MediaStream
  speaking: {},    // userId -> bool (detecção local, não propagada)
  microphone: { phase: 'idle', target: null, error: null },
});

const myId = () => store.user?.id;
let joinAttempt = null, audioSession = null;
let removeAudioListeners = () => {};

function makePc(channelId, peerId) {
  const key = `${channelId}:${peerId}`;
  if (rtc.peers.has(key)) return rtc.peers.get(key).pc;
  const pc = new RTCPeerConnection({ iceServers: store.iceServers });
  const entry = { pc, stream: new MediaStream() };
  rtc.peers.set(key, entry);
  rtc.remoteStreams[key] = entry.stream;

  pc.onicecandidate = (e) => {
    if (e.candidate) events.signal(channelId, peerId, { ice: e.candidate.toJSON() });
  };
  pc.ontrack = (e) => {
    entry.stream = e.streams[0] || entry.stream;
    e.streams[0]?.getTracks().forEach(t => entry.stream.addTrack(t));
    if (!e.streams[0]) entry.stream.addTrack(e.track);
    rtc.remoteStreams[key] = entry.stream;
  };
  pc.onconnectionstatechange = () => {
    if (['failed', 'closed'].includes(pc.connectionState)) dropPeer(channelId, peerId);
  };
  if (rtc.localStream) for (const t of rtc.localStream.getTracks()) pc.addTrack(t, rtc.localStream);
  if (rtc.screenStream) for (const t of rtc.screenStream.getTracks()) pc.addTrack(t, rtc.screenStream);
  return pc;
}

function dropPeer(channelId, peerId) {
  const key = `${channelId}:${peerId}`;
  rtc.peers.get(key)?.pc.close();
  rtc.peers.delete(key);
  delete rtc.remoteStreams[key];
  analysers.delete(key);
}

async function offer(channelId, peerId) {
  const pc = makePc(channelId, peerId);
  const o = await pc.createOffer();
  await pc.setLocalDescription(o);
  events.signal(channelId, peerId, { sdp: pc.localDescription });
}

async function handleSignal({ channelId, from, data }) {
  if (channelId !== rtc.channelId) return;
  const pc = makePc(channelId, from);
  try {
    if (data.sdp) {
      const glare = data.sdp.type === 'offer' && pc.signalingState !== 'stable';
      if (glare) {
        // deterministic tie-break: smaller user id keeps its offer
        if (myId() > from) { await pc.setLocalDescription({ type: 'rollback' }); await pc.setRemoteDescription(data.sdp); const a = await pc.createAnswer(); await pc.setLocalDescription(a); events.signal(channelId, from, { sdp: pc.localDescription }); }
        return;
      }
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        const a = await pc.createAnswer();
        await pc.setLocalDescription(a);
        events.signal(channelId, from, { sdp: pc.localDescription });
      }
    } else if (data.ice) {
      await pc.addIceCandidate(data.ice).catch(() => {});
    }
  } catch (e) { console.warn('rtc signal', e); }
}

events.on('SIGNAL', handleSignal);

events.on('VOICE_STATE', ({ channelId, members }) => {
  store.voice[channelId] = members;
  if (channelId !== rtc.channelId) return;
  const others = members.filter(m => m.userId !== myId());
  const present = new Set(others.map(m => m.userId));
  for (const key of [...rtc.peers.keys()]) {
    const [ch, uid] = key.split(':');
    if (ch === channelId && !present.has(uid)) dropPeer(ch, uid);
  }
  // I offer to peers with lower user id? Convention: I offer to every other member;
  // glare is resolved deterministically above.
  for (const m of others) {
    const key = `${channelId}:${m.userId}`;
    if (!rtc.peers.has(key)) offer(channelId, m.userId);
  }
});

// ---- indicador local de fala: AnalyserNode por stream, sem propagação ----
let audioCtx = null, speakTimer = null;
const analysers = new Map(); // 'self' | `${channelId}:${userId}` -> {analyser, buf, lastSpoke}
const SPEAK_RMS = 10, SPEAK_HOLD = 400;

function ensureAnalyser(key, stream) {
  if (!stream || analysers.has(key)) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx ||= new Ctx();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analysers.set(key, { analyser, buf: new Uint8Array(analyser.fftSize), lastSpoke: 0 });
  } catch {}
}

function pollSpeaking() {
  if (rtc.localStream) ensureAnalyser('self', rtc.localStream);
  for (const key of Object.keys(rtc.remoteStreams)) ensureAnalyser(key, rtc.remoteStreams[key]);
  for (const key of [...analysers.keys()]) {
    if (key !== 'self' && !rtc.remoteStreams[key]) analysers.delete(key);
  }
  const next = {};
  for (const [key, a] of analysers) {
    a.analyser.getByteTimeDomainData(a.buf);
    let sum = 0;
    for (const v of a.buf) { const d = v - 128; sum += d * d; }
    if (Math.sqrt(sum / a.buf.length) > SPEAK_RMS) a.lastSpoke = Date.now();
    const uid = key === 'self' ? myId() : key.split(':')[1];
    next[uid] = Date.now() - a.lastSpoke < SPEAK_HOLD;
  }
  const cur = rtc.speaking;
  const keys = Object.keys(next);
  if (keys.length !== Object.keys(cur).length || keys.some(uid => cur[uid] !== next[uid])) rtc.speaking = next;
}

function startSpeaking() {
  stopSpeaking();
  speakTimer = setInterval(pollSpeaking, 120);
}

function stopSpeaking() {
  if (speakTimer) { clearInterval(speakTimer); speakTimer = null; }
  analysers.clear();
  audioCtx?.close().catch(() => {});
  audioCtx = null;
  rtc.speaking = {};
}

export async function joinVoice(channelId, name) {
  if (joinAttempt || rtc.channelId === channelId) return;
  const attempt = {};
  joinAttempt = attempt;
  rtc.microphone.target = { id: channelId, name: name ?? null };
  rtc.microphone.error = null;
  rtc.microphone.phase = 'initializing';
  let failureCode = 'voice-join-failed';
  try {
    await endVoiceSession();
    if (joinAttempt !== attempt) return;
    const desktop = window.prosaDesktop;
    if (desktop?.isDesktop && desktop.platform === 'darwin') {
      rtc.microphone.phase = 'requesting';
      failureCode = 'authorization-failed';
      const permission = await desktop.ensureMicrophoneAccess();
      if (joinAttempt !== attempt) return;
      if (permission?.status !== 'granted') {
        if (['denied', 'restricted'].includes(permission?.status)) {
          failureCode = `permission-${permission.status}`;
        }
        throw new Error('Microphone authorization unavailable');
      }
    }
    rtc.microphone.phase = 'initializing';
    failureCode = 'capture-unavailable';
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone capture unavailable');
    failureCode = 'capture-failed';
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // getUserMedia cannot be aborted; a cancelled request still owns its late stream.
    if (joinAttempt !== attempt) { stopStream(stream); return; }
    rtc.localStream = stream;
    const tracks = stream?.getAudioTracks() || [];
    failureCode = 'capture-unavailable';
    if (!tracks.some(t => t.readyState === 'live')) throw new Error('No live microphone track');

    audioSession = attempt;
    const ended = () => {
      if (audioSession !== attempt || tracks.some(t => t.readyState === 'live')) return;
      rtc.microphone.phase = 'error';
      rtc.microphone.error = { code: 'track-ended' };
    };
    tracks.forEach(t => t.addEventListener('ended', ended));
    removeAudioListeners = () => tracks.forEach(t => t.removeEventListener('ended', ended));
    rtc.channelName = name ?? null;
    rtc.channelId = channelId;
    failureCode = 'voice-join-failed';
    await events.joinVoice(channelId);
    if (joinAttempt !== attempt) return;
    const snapshot = await misc.voiceState(channelId);
    if (joinAttempt !== attempt) return;
    failureCode = 'track-ended';
    if (!tracks.some(t => t.readyState === 'live')) throw new Error('Microphone track ended');
    failureCode = 'voice-join-failed';
    store.voice[channelId] = snapshot.members;
    startSpeaking();
    rtc.microphone.phase = 'ready';
  } catch (error) {
    if (joinAttempt !== attempt) return;
    if (failureCode === 'capture-failed') {
      switch (error?.name) {
        case 'NotAllowedError': failureCode = 'permission-blocked'; break;
        case 'NotFoundError': failureCode = 'device-not-found'; break;
        case 'NotReadableError': failureCode = 'device-unreadable'; break;
      }
    }
    await endVoiceSession();
    if (joinAttempt !== attempt) return;
    rtc.microphone.phase = 'error';
    rtc.microphone.error = { code: failureCode };
  } finally {
    if (joinAttempt === attempt) joinAttempt = null;
  }
}

function stopStream(stream) {
  stream?.getTracks().forEach(t => t.stop());
}

async function endVoiceSession() {
  const channelId = rtc.channelId;
  audioSession = null;
  removeAudioListeners();
  removeAudioListeners = () => {};
  rtc.channelId = null;
  const list = store.voice[channelId];
  if (list) store.voice[channelId] = list.filter(v => v.userId !== myId());
  for (const key of [...rtc.peers.keys()]) { const [ch, uid] = key.split(':'); dropPeer(ch, uid); }
  stopSpeaking();
  stopStream(rtc.localStream);
  stopStream(rtc.screenStream);
  rtc.localStream = null; rtc.screenStream = null;
  rtc.channelId = null; rtc.channelName = null; rtc.video = false; rtc.screen = false; rtc.muted = false; rtc.deafened = false; rtc.speakerMuted = false;
  // Local cleanup must not depend on successful signaling or touch a newer session.
  if (channelId) {
    try { await events.leaveVoice(channelId); } catch {}
  }
}

export async function leaveVoice() {
  joinAttempt = null;
  rtc.microphone.phase = 'idle';
  rtc.microphone.target = null;
  rtc.microphone.error = null;
  await endVoiceSession();
}

export function toggleMute() {
  if (rtc.microphone.phase !== 'ready') return;
  rtc.muted = !rtc.muted;
  rtc.localStream?.getAudioTracks().forEach(t => t.enabled = !rtc.muted);
  if (rtc.channelId) events.updateVoice(rtc.channelId, { muted: rtc.muted });
}

export async function toggleVideo() {
  if (!rtc.video) {
    const cam = await navigator.mediaDevices.getUserMedia({ video: true });
    const track = cam.getVideoTracks()[0];
    rtc.localStream.addTrack(track);
    for (const { pc } of rtc.peers.values()) pc.addTrack(track, rtc.localStream);
    rtc.video = true;
  } else {
    rtc.localStream?.getVideoTracks().forEach(t => {
      t.stop();
      rtc.localStream.removeTrack(t);
      for (const { pc } of rtc.peers.values()) {
        const s = pc.getSenders().find(s => s.track === t);
        if (s) pc.removeTrack(s);
      }
    });
    rtc.video = false;
  }
  events.updateVoice(rtc.channelId, { video: rtc.video });
}

export async function toggleScreen() {
  if (!rtc.screen) {
    rtc.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const track = rtc.screenStream.getVideoTracks()[0];
    track.onended = () => toggleScreen();
    for (const { pc } of rtc.peers.values()) pc.addTrack(track, rtc.screenStream);
    rtc.screen = true;
  } else {
    rtc.screenStream?.getTracks().forEach(t => {
      t.stop();
      for (const { pc } of rtc.peers.values()) {
        const s = pc.getSenders().find(s => s.track === t);
        if (s) pc.removeTrack(s);
      }
    });
    rtc.screenStream = null;
    rtc.screen = false;
  }
  events.updateVoice(rtc.channelId, { screen: rtc.screen });
}

export function toggleDeafen() {
  rtc.deafened = !rtc.deafened;
  if (rtc.deafened && !rtc.muted) toggleMute();
  if (!rtc.deafened && rtc.muted) toggleMute();
  events.updateVoice(rtc.channelId, { deafened: rtc.deafened });
}

export function toggleSpeaker() {
  rtc.speakerMuted = !rtc.speakerMuted;
  if (!rtc.speakerMuted && rtc.deafened) toggleDeafen();
  if (rtc.channelId) events.updateVoice(rtc.channelId, { speakerMuted: rtc.speakerMuted });
}
