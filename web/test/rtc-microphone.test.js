import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reactive } from 'vue';

// Run the real motor with isolated services, devices and timers, not the P2P boot.
const source = readFileSync(new URL('../src/rtc.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/\bexport /g, '');
const load = new Function('reactive', 'store', 'events', 'misc', 'navigator', 'window',
  'setInterval', 'clearInterval', `${source}\nreturn { rtc, joinVoice, leaveVoice, toggleMute, toggleSpeaker, toggleDeafen };`);
const tick = () => new Promise(resolve => setImmediate(resolve));

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

function track(kind = 'audio', readyState = 'live') {
  const listeners = new Set();
  return {
    kind, readyState, enabled: true, stops: 0, listeners,
    addEventListener(type, fn) { assert.equal(type, 'ended'); listeners.add(fn); },
    removeEventListener(type, fn) { assert.equal(type, 'ended'); listeners.delete(fn); },
    stop() { this.stops++; this.readyState = 'ended'; },
    end() { this.readyState = 'ended'; for (const fn of listeners) fn(); },
  };
}

function stream(tracks = [track()]) {
  return { getTracks: () => tracks, getAudioTracks: () => tracks.filter(t => t.kind === 'audio') };
}

function fixture(t, { desktop, capture, voiceState, join, leave } = {}) {
  const calls = [];
  const timers = new Set();
  const local = stream();
  const store = reactive({ user: { id: 'self' }, voice: {}, iceServers: [] });
  const handlers = {};
  const events = {
    on: (type, fn) => { handlers[type] = fn; },
    joinVoice: id => { calls.push(['join', id]); return join?.(id); },
    leaveVoice: id => { calls.push(['leave', id]); return leave?.(id); },
    updateVoice: (id, state) => { calls.push(['update', id, state]); },
  };
  const misc = { voiceState: id => {
    calls.push(['members', id]);
    return voiceState ? voiceState(id) : Promise.resolve({ members: [{ userId: 'self' }] });
  } };
  const navigator = { mediaDevices: { getUserMedia: options => {
    calls.push(['capture', options]);
    return capture ? capture() : Promise.resolve(local);
  } } };
  const window = desktop === undefined ? {} : { prosaDesktop: desktop };
  const motor = load(reactive, store, events, misc, navigator, window,
    fn => { timers.add(fn); return fn; }, fn => timers.delete(fn));
  t.after(() => motor.leaveVoice());
  return { ...motor, calls, timers, local, store, navigator, window, handlers };
}

function mac(ensureMicrophoneAccess = async () => ({ status: 'granted' })) {
  return { isDesktop: true, platform: 'darwin', ensureMicrophoneAccess };
}

test('rtc: waits for native permission before capturing and joins on the same attempt', async t => {
  const permission = deferred();
  let requests = 0;
  const f = fixture(t, { desktop: mac(() => { requests++; return permission.promise; }) });
  const result = f.joinVoice('room', 'Room');
  await tick();
  assert.equal(requests, 1);
  assert.deepEqual(f.calls, []);
  assert.equal(f.rtc.microphone.phase, 'requesting');
  assert.deepEqual(f.rtc.microphone.target, { id: 'room', name: 'Room' });
  permission.resolve({ status: 'granted' });
  await result;
  assert.deepEqual(f.calls.map(c => c[0]), ['capture', 'join', 'members']);
  assert.equal(f.rtc.channelId, 'room');
  assert.equal(f.rtc.channelName, 'Room');
  assert.equal(f.rtc.microphone.phase, 'ready');
  assert.equal(f.rtc.microphone.error, null);
  assert.equal(f.timers.size, 1);
});

for (const status of ['denied', 'restricted', 'unknown', 'not-applicable', 'unexpected', undefined]) {
  test(`rtc: native ${String(status)} prevents capture and entry`, async t => {
    const f = fixture(t, { desktop: mac(async () => ({ status })) });
    await f.joinVoice('room');
    assert.deepEqual(f.calls, []);
    assert.equal(f.rtc.channelId, null);
    assert.equal(f.rtc.microphone.phase, 'error');
    assert.equal(f.rtc.microphone.error.code,
      ['denied', 'restricted'].includes(status) ? `permission-${status}` : 'authorization-failed');
  });
}

for (const authorize of [undefined, async () => { throw new Error('private details'); }, async () => null]) {
  test('rtc: missing, rejected or malformed macOS bridge is not bypassed', async t => {
    const f = fixture(t, { desktop: mac(authorize) });
    if (!authorize) delete f.window.prosaDesktop.ensureMicrophoneAccess;
    await f.joinVoice('room');
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.rtc.microphone.error, { code: 'authorization-failed' });
  });
}

for (const platform of ['browser', 'win32', 'linux']) {
  test(`rtc: ${platform} uses getUserMedia without macOS authorization`, async t => {
    const f = fixture(t, { desktop: platform === 'browser' ? undefined : {
      isDesktop: true, platform, ensureMicrophoneAccess() { assert.fail('macOS bridge called'); },
    } });
    await f.joinVoice('room');
    assert.deepEqual(f.calls.map(c => c[0]), ['capture', 'join', 'members']);
    assert.equal(f.rtc.microphone.phase, 'ready');
  });
}

for (const [name, code] of [
  ['NotAllowedError', 'permission-blocked'], ['NotFoundError', 'device-not-found'],
  ['NotReadableError', 'device-unreadable'], ['AbortError', 'capture-failed'],
]) {
  test(`rtc: capture ${name} is normalized even with native consent granted`, async t => {
    const f = fixture(t, { desktop: mac(), capture: async () => {
      throw Object.assign(new Error('private device details'), { name });
    } });
    await f.joinVoice('room');
    assert.deepEqual(f.calls.map(c => c[0]), ['capture']);
    assert.deepEqual(f.rtc.microphone.error, { code });
    assert.equal(f.rtc.localStream, null);
    assert.equal(f.timers.size, 0);
  });
}

for (const unavailable of ['devices', 'getUserMedia']) {
  test(`rtc: absent ${unavailable} reports capture unavailable`, async t => {
    const f = fixture(t);
    if (unavailable === 'devices') delete f.navigator.mediaDevices;
    else delete f.navigator.mediaDevices.getUserMedia;
    await f.joinVoice('room');
    assert.deepEqual(f.rtc.microphone.error, { code: 'capture-unavailable' });
    assert.deepEqual(f.calls, []);
  });
}

for (const tracks of [[], [track('video')], [track('audio', 'ended')]]) {
  test('rtc: capture without live audio is stopped without announcing entry', async t => {
    const f = fixture(t, { capture: async () => stream(tracks) });
    await f.joinVoice('room');
    assert.deepEqual(f.rtc.microphone.error, { code: 'capture-unavailable' });
    assert.equal(f.rtc.channelId, null);
    assert.ok(tracks.every(t => t.stops === 1 && t.listeners.size === 0));
    assert.deepEqual(f.calls.map(c => c[0]), ['capture']);
  });
}

test('rtc: retries recheck authorization and clear the previous error', async t => {
  let status = 'denied';
  let requests = 0;
  const f = fixture(t, { desktop: mac(async () => { requests++; return { status }; }) });
  await f.joinVoice('room');
  assert.equal(f.rtc.microphone.error.code, 'permission-denied');
  const capture = deferred();
  f.navigator.mediaDevices.getUserMedia = () => capture.promise;
  status = 'granted';
  const retry = f.joinVoice('room');
  await tick();
  assert.equal(f.rtc.microphone.error, null);
  assert.equal(f.rtc.microphone.phase, 'initializing');
  capture.resolve(f.local);
  await retry;
  assert.equal(requests, 2);
  assert.equal(f.rtc.microphone.phase, 'ready');
  assert.equal(f.rtc.microphone.error, null);
});

test('rtc: repeated entry and competing channel are ignored while permission is pending', async t => {
  const permission = deferred();
  let requests = 0;
  const f = fixture(t, { desktop: mac(() => { requests++; return permission.promise; }) });
  const first = f.joinVoice('one');
  await f.joinVoice('one');
  await f.joinVoice('two');
  await tick();
  assert.equal(requests, 1);
  permission.resolve({ status: 'granted' });
  await first;
  assert.deepEqual(f.calls.map(c => c[0]), ['capture', 'join', 'members']);
  assert.equal(f.rtc.channelId, 'one');
});

test('rtc: cancellation during authorization prevents later capture', async t => {
  const permission = deferred();
  const f = fixture(t, { desktop: mac(() => permission.promise) });
  const result = f.joinVoice('room');
  await tick();
  await f.leaveVoice();
  permission.resolve({ status: 'granted' });
  await result;
  assert.deepEqual(f.calls, []);
  assert.equal(f.rtc.microphone.phase, 'idle');
  assert.equal(f.rtc.microphone.target, null);
});

for (const late of ['resolve', 'reject']) {
  test(`rtc: cancelled capture ${late} cannot overwrite a newer active session`, async t => {
    const capture = deferred();
    let captures = 0;
    const f = fixture(t, { capture: () => ++captures === 1 ? capture.promise : Promise.resolve(f.local) });
    const old = f.joinVoice('old');
    await tick();
    await f.joinVoice('blocked');
    assert.equal(captures, 1);
    await f.leaveVoice();
    await f.joinVoice('new', 'New');
    const lateStream = stream();
    if (late === 'resolve') capture.resolve(lateStream);
    else capture.reject(new Error('old private failure'));
    await old;
    assert.equal(f.rtc.channelId, 'new');
    assert.equal(f.rtc.microphone.phase, 'ready');
    assert.equal(f.rtc.microphone.target.id, 'new');
    assert.equal(f.local.getTracks()[0].stops, 0);
    assert.equal(lateStream.getTracks()[0].stops, late === 'resolve' ? 1 : 0);
    assert.deepEqual(f.calls.filter(c => c[0] === 'join'), [['join', 'new']]);
  });
}

for (const stage of ['join-sync', 'join-async', 'members']) {
  test(`rtc: ${stage} failure rolls back entry and releases captured resources`, async t => {
    const fail = () => { throw new Error('private signaling details'); };
    const f = fixture(t, {
      join: () => {
        f.store.voice.room = [{ userId: 'self' }, { userId: 'other' }];
        if (stage === 'join-sync') fail();
        if (stage === 'join-async') return Promise.reject(new Error('private signaling details'));
      },
      voiceState: stage === 'members' ? async () => fail() : undefined,
    });
    await f.joinVoice('room');
    assert.deepEqual(f.rtc.microphone.error, { code: 'voice-join-failed' });
    assert.equal(f.rtc.channelId, null);
    assert.equal(f.rtc.localStream, null);
    assert.equal(f.local.getTracks()[0].stops, 1);
    assert.equal(f.local.getTracks()[0].listeners.size, 0);
    assert.equal(f.timers.size, 0);
    assert.deepEqual(f.calls.filter(c => ['join', 'leave'].includes(c[0])), [['join', 'room'], ['leave', 'room']]);
    assert.deepEqual(f.store.voice.room, [{ userId: 'other' }]);
  });
}

for (const late of ['resolve', 'reject']) {
  test(`rtc: late member query ${late} cannot restore a cancelled channel`, async t => {
    const members = deferred();
    let queries = 0;
    const f = fixture(t, { voiceState: () => ++queries === 1
      ? members.promise : Promise.resolve({ members: [{ userId: 'self' }] }) });
    const old = f.joinVoice('old');
    await tick();
    assert.equal(f.rtc.channelId, 'old');
    assert.equal(f.rtc.microphone.phase, 'initializing');
    f.toggleMute();
    assert.equal(f.rtc.muted, false);
    await f.leaveVoice();
    const nextStream = stream();
    f.navigator.mediaDevices.getUserMedia = async () => nextStream;
    await f.joinVoice('new');
    if (late === 'resolve') members.resolve({ members: [{ userId: 'ghost' }] });
    else members.reject(new Error('old failure'));
    await old;
    assert.equal(f.rtc.channelId, 'new');
    assert.equal(f.rtc.microphone.phase, 'ready');
    assert.deepEqual(f.store.voice.new, [{ userId: 'self' }]);
    assert.equal(f.store.voice.old, undefined);
    assert.equal(f.local.getTracks()[0].stops, 1);
    assert.equal(nextStream.getTracks()[0].stops, 0);
    assert.equal(f.timers.size, 1);
  });
}

test('rtc: unexpected audio end is distinct from mute and cannot be unmuted', async t => {
  const f = fixture(t);
  await f.joinVoice('room');
  const audio = f.local.getTracks()[0];
  f.toggleMute();
  assert.equal(f.rtc.muted, true);
  assert.equal(audio.enabled, false);
  assert.equal(f.rtc.microphone.phase, 'ready');
  f.toggleMute();
  assert.equal(audio.enabled, true);
  audio.end();
  assert.equal(f.rtc.microphone.phase, 'error');
  assert.deepEqual(f.rtc.microphone.error, { code: 'track-ended' });
  const updates = f.calls.length;
  f.toggleMute();
  assert.equal(f.calls.length, updates);
  assert.equal(f.rtc.channelId, 'room');
  await f.joinVoice('room');
  assert.equal(f.calls.filter(c => c[0] === 'capture').length, 1);
  const staleEnded = [...audio.listeners][0];
  await f.leaveVoice();
  assert.equal(audio.listeners.size, 0);
  assert.equal(f.rtc.microphone.phase, 'idle');
  const nextStream = stream();
  f.navigator.mediaDevices.getUserMedia = async () => nextStream;
  await f.joinVoice('room');
  staleEnded();
  assert.equal(f.rtc.microphone.phase, 'ready');
  assert.equal(f.rtc.microphone.error, null);
});

test('rtc: ending audio while member query is pending cannot result in ready state', async t => {
  const members = deferred();
  const f = fixture(t, { voiceState: () => members.promise });
  const result = f.joinVoice('room');
  await tick();
  f.local.getTracks()[0].end();
  members.resolve({ members: [{ userId: 'self' }] });
  await result;
  assert.equal(f.rtc.channelId, null);
  assert.equal(f.rtc.microphone.error.code, 'track-ended');
  assert.equal(f.timers.size, 0);
  assert.equal(f.local.getTracks()[0].listeners.size, 0);
});

test('rtc: one ended audio track does not mark another live track as interrupted', async t => {
  const tracks = [track(), track()];
  const f = fixture(t, { capture: async () => stream(tracks) });
  await f.joinVoice('room');
  tracks[0].end();
  assert.equal(f.rtc.microphone.phase, 'ready');
  tracks[1].end();
  assert.equal(f.rtc.microphone.error.code, 'track-ended');
});

test('rtc: leaving releases peers, all media, timers, listeners and self membership', async t => {
  const f = fixture(t);
  await f.joinVoice('room', 'Room');
  let closes = 0;
  f.rtc.peers.set('room:other', { pc: { close() { closes++; } } });
  f.rtc.remoteStreams['room:other'] = stream();
  f.store.voice.room.push({ userId: 'other' });
  const screen = stream([track('video')]);
  f.rtc.screenStream = screen;
  const camera = track('video');
  f.local.getTracks().push(camera);
  f.toggleMute();
  f.toggleSpeaker();
  f.toggleDeafen();
  f.rtc.video = true;
  f.rtc.screen = true;
  await f.leaveVoice();
  assert.equal(closes, 1);
  assert.equal(f.rtc.peers.size, 0);
  assert.deepEqual(f.rtc.remoteStreams, {});
  assert.deepEqual(f.store.voice.room, [{ userId: 'other' }]);
  assert.equal(f.rtc.localStream, null);
  assert.equal(f.rtc.screenStream, null);
  assert.equal(f.rtc.channelName, null);
  assert.ok(f.local.getTracks().every(t => t.stops === 1 && t.listeners.size === 0));
  assert.equal(screen.getTracks()[0].stops, 1);
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.rtc.speaking, {});
  assert.deepEqual(f.rtc.microphone, { phase: 'idle', target: null, error: null });
  for (const key of ['muted', 'deafened', 'speakerMuted', 'video', 'screen']) assert.equal(f.rtc[key], false);
  await f.leaveVoice();
  assert.equal(f.calls.filter(c => c[0] === 'leave').length, 1);
});

for (const failure of ['sync', 'async']) {
  test(`rtc: ${failure} leave signaling failure does not prevent local cleanup`, async t => {
    const fail = () => { throw new Error('signaling unavailable'); };
    const f = fixture(t, { leave: failure === 'sync' ? fail : async () => fail() });
    await f.joinVoice('room');
    await f.leaveVoice();
    assert.equal(f.rtc.channelId, null);
    assert.equal(f.rtc.localStream, null);
    assert.equal(f.local.getTracks()[0].stops, 1);
    assert.equal(f.local.getTracks()[0].listeners.size, 0);
    assert.equal(f.timers.size, 0);
  });
}

test('rtc: pending old leave cannot clear or modify a later session', async t => {
  const left = deferred();
  let leaves = 0;
  const f = fixture(t, { leave: () => ++leaves === 1 ? left.promise : undefined });
  await f.joinVoice('old');
  const old = f.leaveVoice();
  const nextStream = stream();
  f.navigator.mediaDevices.getUserMedia = async () => nextStream;
  await f.joinVoice('new');
  left.resolve();
  await old;
  assert.equal(f.rtc.channelId, 'new');
  assert.equal(f.rtc.microphone.phase, 'ready');
  assert.equal(nextStream.getTracks()[0].stops, 0);
});

test('rtc: failed confirmed channel switch leaves old session without rollback', async t => {
  const f = fixture(t);
  await f.joinVoice('old', 'Old');
  await f.joinVoice('old', 'Ignored');
  assert.equal(f.calls.filter(c => c[0] === 'capture').length, 1);
  assert.equal(f.rtc.channelName, 'Old');
  f.navigator.mediaDevices.getUserMedia = async () => { throw new Error('new device failure'); };
  await f.joinVoice('new', 'New');
  assert.equal(f.rtc.channelId, null);
  assert.deepEqual(f.rtc.microphone.target, { id: 'new', name: 'New' });
  assert.deepEqual(f.rtc.microphone.error, { code: 'capture-failed' });
  assert.equal(f.local.getTracks()[0].stops, 1);
  assert.deepEqual(f.calls.filter(c => ['join', 'leave'].includes(c[0])), [['join', 'old'], ['leave', 'old']]);
});
