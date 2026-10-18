import { reactive } from 'vue';
import { store } from './stores.js';
import { events } from './services/index.js';

// WebRTC mesh: peers = Map<`${channelId}:${userId}`, {pc, stream}>
export const rtc = reactive({
  channelId: null,
  peers: new Map(),
  localStream: null,
  screenStream: null,
  muted: false,
  deafened: false,
  video: false,
  screen: false,
  remoteStreams: {}, // `${channelId}:${userId}` -> MediaStream
});

const myId = () => store.user?.id;

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

export async function joinVoice(channelId) {
  if (rtc.channelId === channelId) return;
  await leaveVoice();
  rtc.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  rtc.channelId = channelId;
  events.joinVoice(channelId);
}

export async function leaveVoice() {
  if (!rtc.channelId) return;
  events.leaveVoice(rtc.channelId);
  for (const key of [...rtc.peers.keys()]) { const [ch, uid] = key.split(':'); dropPeer(ch, uid); }
  rtc.localStream?.getTracks().forEach(t => t.stop());
  rtc.screenStream?.getTracks().forEach(t => t.stop());
  rtc.localStream = null; rtc.screenStream = null;
  rtc.channelId = null; rtc.video = false; rtc.screen = false; rtc.muted = false; rtc.deafened = false;
}

export function toggleMute() {
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
