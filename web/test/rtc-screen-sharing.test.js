import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { reactive, markRaw } from 'vue';
import desktopScreenSharing from '../desktop/screen-sharing.cjs';

// Exercise the real RTC motor without booting providers, Electron or devices.
const source = readFileSync(new URL('../src/rtc.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/\bexport /g, '');
const load = new Function('reactive', 'store', 'events', 'misc', 'navigator', 'window',
  'setInterval', 'clearInterval',
  `${source}\nreturn { rtc, joinVoice, leaveVoice, toggleScreen, selectScreenSource, cancelScreen, stopScreen };`);
const tick = () => new Promise(resolve => setImmediate(resolve));
const failure = name => Object.assign(new Error('private native details'), { name });
function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
function track(kind = 'video', readyState = 'live') {
  const listeners = new Set();
  return markRaw({
    kind, readyState, enabled: true, stops: 0, listeners,
    addEventListener(type, fn) { assert.equal(type, 'ended'); listeners.add(fn); },
    removeEventListener(type, fn) { assert.equal(type, 'ended'); listeners.delete(fn); },
    stop() { this.stops++; this.readyState = 'ended'; },
    end() { this.readyState = 'ended'; for (const fn of [...listeners]) fn(); },
  });
}
function stream(tracks = [track()]) {
  return markRaw({
    getTracks: () => tracks, getVideoTracks: () => tracks.filter(t => t.kind === 'video'),
    getAudioTracks: () => tracks.filter(t => t.kind === 'audio'),
  });
}
function bridge() {
  const requests = new Set(), results = new Set(), calls = [];
  return {
    requests, results, calls,
    onRequest(fn) { calls.push('onRequest'); requests.add(fn); return () => requests.delete(fn); },
    onResult(fn) { calls.push('onResult'); results.add(fn); return () => results.delete(fn); },
    respond(payload) { calls.push(['respond', payload]); return Promise.resolve(true); },
    cancel() { calls.push('cancel'); return Promise.resolve(true); },
    request(data) { for (const fn of [...requests]) fn(data); },
    result(data) { for (const fn of [...results]) fn(data); },
    clean() { assert.equal(requests.size, 0); assert.equal(results.size, 0); },
  };
}
const sources = [
  { id: 'source-1', name: 'Tela 1', thumbnail: '' },
  { id: 'source-2', name: 'Janela', thumbnail: 'data:image/png;base64,test' },
];
const selection = (requestId = 'request-1') => ({ requestId, sources });

async function fixture(t, { desktop, capture, update, join = true } = {}) {
  const calls = [], handlers = {}, timers = new Set();
  const local = stream([track('audio'), track()]);
  const screen = stream();
  const store = reactive({ user: { id: 'self' }, voice: {}, iceServers: [] });
  const events = {
    on(type, fn) { handlers[type] = fn; },
    joinVoice() {}, leaveVoice() {},
    updateVoice(id, state) { calls.push([id, state]); return update?.(id, state); },
  };
  const navigator = { mediaDevices: {
    getUserMedia: async () => local,
    getDisplayMedia(options) {
      calls.push(['capture', options]);
      return capture ? capture(options) : Promise.resolve(screen);
    },
  } };
  const window = { prosaDesktop: desktop };
  const motor = load(reactive, store, events, { voiceState: async () => ({ members: [{ userId: 'self' }] }) },
    navigator, window, fn => { timers.add(fn); return fn; }, fn => timers.delete(fn));
  t.after(() => motor.leaveVoice());
  if (join) {
    await motor.joinVoice('room', 'Room');
    motor.rtc.video = true;
  }
  function peer(id = 'peer', options = {}) {
    const senders = local.getTracks().map(track => ({ track }));
    const removed = [];
    const pc = markRaw({
      addTrack(track, stream) {
        if (options.failAdd) throw failure('OperationError');
        const sender = { track, stream };
        senders.push(sender);
        return sender;
      },
      getSenders() { if (options.failGet) throw failure('OperationError'); return [...senders]; },
      removeTrack(sender) {
        if (options.failRemove) throw failure('OperationError');
        removed.push(sender);
        senders.splice(senders.indexOf(sender), 1);
      },
      close() {},
    });
    motor.rtc.peers.set(`room:${id}`, { pc });
    return { pc, senders, removed };
  }
  const published = () => calls.filter(([id]) => id !== 'capture');
  return { ...motor, calls, handlers, local, screen, store, events, navigator, window, peer, published };
}
async function desktopFixture(t, options = {}) {
  const native = deferred();
  const api = bridge();
  const f = await fixture(t, {
    desktop: { isDesktop: true, platform: 'darwin', ensureMicrophoneAccess: async () => ({ status: 'granted' }), screenSharing: api },
    capture: () => native.promise, ...options,
  });
  return { ...f, native, bridge: api };
}

test('screen RTC: browser calls capture synchronously and publishes only a live screen', async t => {
  const capture = deferred();
  const f = await fixture(t, { capture: () => capture.promise });
  const peer = f.peer();
  const pending = f.toggleScreen();
  assert.deepEqual(f.calls, [['capture', { video: true }]]);
  assert.equal(f.rtc.screenSharing.phase, 'initializing');
  assert.equal(f.rtc.screen, false);
  assert.equal(f.rtc.screenStream, null);
  await f.toggleScreen();
  assert.equal(f.calls.length, 1);
  capture.resolve(f.screen);
  await pending;
  assert.equal(f.rtc.screenSharing.phase, 'active');
  assert.equal(f.rtc.screenStream, f.screen);
  assert.equal(f.rtc.screen, true);
  assert.deepEqual(f.published(), [['room', { screen: true }]]);
  assert.equal(peer.senders.at(-1).track, f.screen.getVideoTracks()[0]);
  assert.equal(f.rtc.localStream, f.local);
  assert.equal(f.rtc.video, true);
  assert.ok(f.local.getTracks().every(t => t.stops === 0));
});

test('screen RTC: subscribes before getDisplayMedia without awaiting a bridge operation', async t => {
  const f = await desktopFixture(t);
  f.navigator.mediaDevices.getDisplayMedia = options => {
    assert.deepEqual(f.bridge.calls, ['onRequest', 'onResult']);
    assert.deepEqual(options, { video: true });
    return f.native.promise;
  };
  const pending = f.toggleScreen();
  f.bridge.request(selection());
  assert.equal(f.rtc.screenSharing.phase, 'selecting');
  assert.deepEqual(f.rtc.screenSharing.sources, sources);
  assert.equal(f.rtc.screenSharing.requestId, 'request-1');
  await f.selectScreenSource('request-1', 'source-2');
  assert.equal(f.rtc.screenSharing.phase, 'capturing');
  assert.deepEqual(f.rtc.screenSharing.sources, []);
  assert.equal(f.rtc.screen, false);
  f.bridge.result({ requestId: 'request-1', status: 'selected', code: null });
  assert.equal(f.rtc.screen, false);
  f.native.resolve(f.screen);
  await pending;
  assert.equal(f.rtc.screen, true);
  assert.deepEqual(f.bridge.calls.at(-1), ['respond', { requestId: 'request-1', sourceId: 'source-2' }]);
  f.bridge.clean();
});

for (const stage of ['enumeration', 'selection', 'capture']) {
  test(`screen RTC: cancel during ${stage} clears state and stops a late stream`, async t => {
    const f = await desktopFixture(t);
    const pending = f.toggleScreen();
    if (stage !== 'enumeration') f.bridge.request(selection());
    if (stage === 'capture') await f.selectScreenSource('request-1', 'source-1');
    f.cancelScreen();
    assert.equal(f.rtc.screenSharing.phase, 'idle');
    assert.deepEqual(f.rtc.screenSharing.sources, []);
    assert.equal(f.rtc.screenSharing.error, null);
    assert.equal(f.bridge.calls.at(-1), 'cancel');
    f.bridge.clean();
    f.native.resolve(f.screen);
    await pending;
    assert.equal(f.rtc.screen, false);
    assert.equal(f.screen.getTracks()[0].stops, 1);
    assert.deepEqual(f.published(), []);
  });
}

for (const code of ['no-sources', 'source-unavailable', 'timeout', 'permission-denied', 'permission-restricted', 'capture-failed']) {
  test(`screen RTC: desktop ${code} survives the native rejection without exposing details`, async t => {
    const f = await desktopFixture(t);
    const pending = f.toggleScreen();
    f.bridge.result({ requestId: 'request-1', status: 'error', code });
    assert.deepEqual(f.rtc.screenSharing.error, { code });
    assert.equal(f.rtc.screenSharing.phase, 'error');
    f.native.reject(failure('NotAllowedError'));
    await pending;
    assert.deepEqual(f.rtc.screenSharing.error, { code });
    assert.deepEqual(f.published(), []);
    f.bridge.clean();
    assert.equal(JSON.stringify(f.rtc.screenSharing).includes('private'), false);
  });
}

test('screen RTC: explicit desktop cancellation is silent even if native capture rejects', async t => {
  const f = await desktopFixture(t);
  const pending = f.toggleScreen();
  f.bridge.result({ requestId: 'request-1', status: 'cancelled', code: null });
  f.native.reject(failure('NotAllowedError'));
  await pending;
  assert.equal(f.rtc.screenSharing.phase, 'idle');
  assert.equal(f.rtc.screenSharing.error, null);
  assert.deepEqual(f.published(), []);
  f.bridge.clean();
});

for (const [name, code] of [
  ['NotAllowedError', 'capture-blocked'], ['NotFoundError', 'no-sources'],
  ['NotReadableError', 'capture-unreadable'], ['InvalidStateError', 'capture-unavailable'],
  ['AbortError', 'capture-failed'], ['UnexpectedError', 'capture-failed'],
]) {
  test(`screen RTC: browser ${name} maps to ${code}, not a confirmed macOS denial`, async t => {
    const f = await fixture(t, { capture: () => Promise.reject(failure(name)) });
    await f.toggleScreen();
    assert.deepEqual(f.rtc.screenSharing.error, { code });
    assert.equal(f.rtc.screen, false);
    assert.deepEqual(f.published(), []);
  });
}

for (const tracks of [[], [track('audio')], [track('video', 'ended')]]) {
  test('screen RTC: missing live video releases the acquired stream without publication', async t => {
    const captured = stream(tracks);
    const f = await fixture(t, { capture: async () => captured });
    await f.toggleScreen();
    assert.equal(f.rtc.screenSharing.error.code, 'capture-unavailable');
    assert.ok(tracks.every(t => t.stops === 1));
    assert.deepEqual(f.published(), []);
  });
}

test('screen RTC: missing media API fails recoverably', async t => {
  const f = await fixture(t);
  delete f.navigator.mediaDevices;
  await f.toggleScreen();
  assert.equal(f.rtc.screenSharing.error.code, 'capture-unavailable');
});

for (const mode of ['missing', 'incomplete', 'subscription-throws']) {
  test(`screen RTC: ${mode} desktop bridge cannot bypass selection`, async t => {
    const f = await desktopFixture(t);
    if (mode === 'missing') delete f.window.prosaDesktop.screenSharing;
    if (mode === 'incomplete') delete f.bridge.onResult;
    if (mode === 'subscription-throws') f.bridge.onResult = () => { throw failure('Error'); };
    await f.toggleScreen();
    assert.equal(f.rtc.screenSharing.error.code, 'desktop-unavailable');
    assert.deepEqual(f.calls, []);
    f.bridge.clean();
  });
}

for (const mode of ['button', 'system', 'stop']) {
  test(`screen RTC: ${mode} stop is idempotent and preserves camera/audio senders`, async t => {
    const f = await fixture(t);
    const peer = f.peer();
    await f.toggleScreen();
    const video = f.screen.getTracks()[0];
    const lateEnded = [...video.listeners][0];
    if (mode === 'button') await f.toggleScreen();
    if (mode === 'system') { video.end(); await tick(); }
    if (mode === 'stop') await f.stopScreen();
    assert.equal(f.rtc.screen, false);
    assert.equal(f.rtc.screenStream, null);
    assert.equal(f.rtc.screenSharing.phase, 'idle');
    assert.equal(video.stops, 1);
    assert.equal(video.listeners.size, 0);
    assert.equal(peer.removed.length, 1);
    assert.deepEqual(peer.senders.map(s => s.track), f.local.getTracks());
    assert.equal(f.rtc.localStream, f.local);
    assert.equal(f.rtc.video, true);
    assert.ok(f.local.getTracks().every(t => t.stops === 0));
    await f.stopScreen();
    lateEnded();
    assert.deepEqual(f.published(), [['room', { screen: true }], ['room', { screen: false }]]);
    assert.equal(video.stops, 1);
  });
}

test('screen RTC: an ended event from an old capture cannot stop a new one', async t => {
  const f = await fixture(t);
  await f.toggleScreen();
  const oldEnded = [...f.screen.getTracks()[0].listeners][0];
  await f.stopScreen();
  const next = stream();
  f.navigator.mediaDevices.getDisplayMedia = async () => next;
  await f.toggleScreen();
  oldEnded();
  assert.equal(f.rtc.screenStream, next);
  assert.equal(f.rtc.screen, true);
  assert.equal(next.getTracks()[0].stops, 0);
});

for (const mode of ['leave', 'switch', 'same-channel-rejoin']) {
  for (const outcome of ['resolve', 'reject']) {
    test(`screen RTC: ${mode} invalidates pending capture before late ${outcome}`, async t => {
      const f = await desktopFixture(t);
      const pending = f.toggleScreen();
      f.bridge.request(selection());
      f.navigator.mediaDevices.getUserMedia = async () => stream([track('audio')]);
      if (mode === 'switch') await f.joinVoice('new-room', 'New');
      else {
        await f.leaveVoice();
        if (mode === 'same-channel-rejoin') await f.joinVoice('room', 'Again');
      }
      f.bridge.clean();
      if (outcome === 'resolve') f.native.resolve(f.screen);
      else f.native.reject(failure('NotAllowedError'));
      await pending;
      assert.equal(f.rtc.screen, false);
      assert.equal(f.rtc.screenSharing.phase, 'idle');
      assert.equal(f.rtc.screenSharing.error, null);
      assert.equal(f.rtc.channelId, mode === 'leave' ? null : mode === 'switch' ? 'new-room' : 'room');
      assert.deepEqual(f.published(), []);
      if (outcome === 'resolve') assert.equal(f.screen.getTracks()[0].stops, 1);
    });
  }
}

test('screen RTC: no capture starts outside a call or during voice initialization', async t => {
  const f = await fixture(t, { join: false });
  await f.toggleScreen();
  assert.deepEqual(f.calls, []);
  const mic = deferred();
  f.navigator.mediaDevices.getUserMedia = () => mic.promise;
  const joining = f.joinVoice('room');
  await tick();
  await f.toggleScreen();
  assert.deepEqual(f.calls, []);
  mic.resolve(f.local);
  await joining;
});

test('screen RTC: a draining cancelled native picker prevents overlapping captures, then retry clears error', async t => {
  const f = await desktopFixture(t);
  const pending = f.toggleScreen();
  f.cancelScreen();
  await f.toggleScreen();
  assert.equal(f.calls.length, 1);
  assert.equal(f.rtc.screenSharing.error.code, 'capture-pending');
  f.native.reject(failure('NotAllowedError'));
  await pending;
  f.navigator.mediaDevices.getDisplayMedia = async () => f.screen;
  await f.toggleScreen();
  assert.equal(f.rtc.screenSharing.phase, 'active');
  assert.equal(f.rtc.screenSharing.error, null);
  f.bridge.clean();
});

test('screen RTC: waits for cancellation IPC acknowledgement before allowing the next capture', async t => {
  const f = await desktopFixture(t);
  const cancelled = deferred();
  f.bridge.cancel = () => cancelled.promise;
  const pending = f.toggleScreen();
  f.cancelScreen();
  f.native.reject(failure('NotAllowedError'));
  await tick();
  await f.toggleScreen();
  assert.equal(f.calls.length, 1);
  assert.equal(f.rtc.screenSharing.error.code, 'capture-pending');
  cancelled.resolve(true);
  await pending;
  f.navigator.mediaDevices.getDisplayMedia = async () => f.screen;
  await f.toggleScreen();
  assert.equal(f.rtc.screen, true);
});

test('screen RTC: stale requests/results and responses do not change a newer pending picker', async t => {
  const f = await desktopFixture(t);
  const first = f.toggleScreen();
  f.bridge.request(selection('old'));
  const staleRequest = [...f.bridge.requests][0], staleResult = [...f.bridge.results][0];
  f.cancelScreen();
  f.native.reject(failure('NotAllowedError'));
  await first;
  const next = deferred();
  f.navigator.mediaDevices.getDisplayMedia = () => next.promise;
  const second = f.toggleScreen();
  f.bridge.request(selection('old'));
  f.bridge.result({ requestId: 'old', status: 'error', code: 'permission-denied' });
  assert.equal(f.rtc.screenSharing.phase, 'initializing');
  f.bridge.request(selection('new'));
  staleRequest(selection('old'));
  staleResult({ requestId: 'old', status: 'cancelled' });
  f.bridge.result({ requestId: 'other', status: 'cancelled' });
  await f.selectScreenSource('old', 'source-1');
  await f.selectScreenSource('new', 'invalid-source');
  assert.equal(f.rtc.screenSharing.phase, 'selecting');
  const response = deferred();
  f.bridge.respond = () => response.promise;
  const responding = f.selectScreenSource('new', 'source-1');
  await f.selectScreenSource('new', 'source-2');
  f.cancelScreen();
  response.resolve(true);
  await responding;
  next.resolve(f.screen);
  await second;
  assert.equal(f.rtc.screenSharing.phase, 'idle');
  assert.deepEqual(f.published(), []);
  f.bridge.clean();
});

for (const outcome of ['reject', 'false']) {
  test(`screen RTC: ${outcome} response releases picker and permits later retry`, async t => {
    const f = await desktopFixture(t);
    const pending = f.toggleScreen();
    f.bridge.request(selection());
    f.bridge.respond = async () => { if (outcome === 'reject') throw failure('Error'); return false; };
    await f.selectScreenSource('request-1', 'source-1');
    assert.equal(f.rtc.screenSharing.error.code, outcome === 'reject' ? 'desktop-unavailable' : 'capture-failed');
    f.native.reject(failure('NotAllowedError'));
    await pending;
    f.bridge.clean();
    assert.equal(f.bridge.calls.at(-1), 'cancel');
  });
}

test('screen RTC: adding a track fails partially without leaving any screen sender or stream', async t => {
  const f = await fixture(t);
  const first = f.peer('first');
  f.peer('second', { failAdd: true });
  await f.toggleScreen();
  assert.equal(f.rtc.screenSharing.error.code, 'capture-failed');
  assert.equal(f.rtc.screen, false);
  assert.equal(f.rtc.screenStream, null);
  assert.equal(first.removed.length, 1);
  assert.equal(f.screen.getTracks()[0].stops, 1);
  assert.equal(f.screen.getTracks()[0].listeners.size, 0);
  assert.ok(f.local.getTracks().every(t => t.stops === 0));
  assert.ok(!f.published().some(([, state]) => state.screen));
});

for (const mode of ['sync', 'async']) {
  test(`screen RTC: ${mode} signal failure rolls back capture and does not reject the click`, async t => {
    const f = await fixture(t, { update: (_id, state) => {
      if (state.screen) {
        if (mode === 'sync') throw failure('Error');
        return Promise.reject(failure('Error'));
      }
    } });
    const peer = f.peer();
    await f.toggleScreen();
    assert.equal(f.rtc.screenSharing.error.code, 'signaling-failed');
    assert.equal(f.rtc.screen, false);
    assert.equal(f.screen.getTracks()[0].stops, 1);
    assert.equal(peer.removed.length, 1);
    assert.equal(f.published().at(-1)[1].screen, false);
  });
}

test('screen RTC: cleanup survives failing removal, sender lookup and stop signaling', async t => {
  const f = await fixture(t, { update: (_id, state) => {
    if (!state.screen) return Promise.reject(failure('Error'));
  } });
  const first = f.peer('first');
  f.peer('second', { failRemove: true });
  const third = f.peer('third');
  await f.toggleScreen();
  third.pc.getSenders = () => { throw failure('Error'); };
  await f.stopScreen();
  assert.equal(f.rtc.screenSharing.error.code, 'signaling-failed');
  assert.equal(f.rtc.screenStream, null);
  assert.equal(f.screen.getTracks()[0].stops, 1);
  assert.equal(first.removed.length, 1);
  assert.ok(f.local.getTracks().every(t => t.stops === 0));
});

test('screen RTC: late signaling errors cannot clear or overwrite a newer sharing operation', async t => {
  const firstSignal = deferred();
  let starts = 0;
  const f = await fixture(t, { update: (_id, state) => {
    if (state.screen && ++starts === 1) return firstSignal.promise;
  } });
  const first = f.toggleScreen();
  await tick();
  await f.stopScreen();
  const next = stream();
  f.navigator.mediaDevices.getDisplayMedia = async () => next;
  await f.toggleScreen();
  await f.stopScreen();
  firstSignal.reject(failure('Error'));
  await first;
  assert.equal(f.rtc.screenSharing.phase, 'idle');
  assert.equal(f.rtc.screenSharing.error, null);
});

test('screen RTC: leaving an active capture cleans locally before failed leave signaling', async t => {
  const f = await fixture(t);
  f.peer();
  await f.toggleScreen();
  f.events.leaveVoice = () => { throw failure('Error'); };
  await f.leaveVoice();
  assert.equal(f.rtc.screenSharing.phase, 'idle');
  assert.equal(f.rtc.channelId, null);
  assert.equal(f.screen.getTracks()[0].stops, 1);
  assert.equal(f.screen.getTracks()[0].listeners.size, 0);
  assert.equal(f.rtc.peers.size, 0);
});

for (const malformed of [null, {}, { requestId: '', sources }, { requestId: 'x'.repeat(65), sources },
  { requestId: 'request-1', sources: [] }, { requestId: 'request-1', sources: [{ id: 1 }] }]) {
  test('screen RTC: malformed picker payload never activates screen capture', async t => {
    const f = await desktopFixture(t);
    const pending = f.toggleScreen();
    f.bridge.request(malformed);
    assert.equal(f.rtc.screen, false);
    assert.deepEqual(f.published(), []);
    f.cancelScreen();
    f.native.reject(failure('NotAllowedError'));
    await pending;
    f.bridge.clean();
  });
}

test('screen RTC: failed cancellation IPC is sanitized and cannot break local cleanup', async t => {
  const f = await desktopFixture(t);
  f.bridge.cancel = () => Promise.reject(failure('Error'));
  const pending = f.toggleScreen();
  f.cancelScreen();
  f.native.resolve(f.screen);
  await pending;
  assert.equal(f.screen.getTracks()[0].stops, 1);
  assert.equal(f.rtc.screenSharing.error, null);
  f.bridge.clean();
});

test('screen RTC: unknown desktop codes and non-macOS permission results stay generic', async t => {
  const f = await desktopFixture(t);
  f.window.prosaDesktop.platform = 'linux';
  let pending = f.toggleScreen();
  f.bridge.result({ requestId: 'linux', status: 'error', code: 'permission-denied' });
  f.native.reject(failure('NotAllowedError'));
  await pending;
  assert.deepEqual(f.rtc.screenSharing.error, { code: 'capture-failed' });
  const next = deferred();
  f.navigator.mediaDevices.getDisplayMedia = () => next.promise;
  pending = f.toggleScreen();
  f.bridge.result({ requestId: 'next', status: 'error', code: 'private details' });
  next.reject(failure('Error'));
  await pending;
  assert.deepEqual(f.rtc.screenSharing.error, { code: 'capture-failed' });
});

for (const mode of ['selected', 'cancelled', 'denied', 'no-sources', 'timeout']) {
  test(`screen RTC + desktop handler: integrated ${mode} uses the existing IPC contract`, async t => {
    const f = await desktopFixture(t);
    const sender = new EventEmitter();
    const timers = new Set();
    const appUrl = 'file:///tmp/prosa-screen-rtc-test/dist/index.html';
    const nativeSource = {
      id: 'screen:0:0', name: 'Tela', thumbnail: { isEmpty: () => true },
    };
    const frame = { url: appUrl, detached: false, send(channel, payload) {
      if (channel === 'media:screen-request') f.bridge.request(payload);
      else if (channel === 'media:screen-result') f.bridge.result(payload);
      else assert.fail(channel);
    } };
    sender.mainFrame = frame;
    sender.isDestroyed = () => false;
    const handler = desktopScreenSharing.createScreenSharingHandler({
      appUrl, platform: 'darwin', isAppWebContents: wc => wc === sender, fromFrame: () => sender,
      desktopCapturer: { getSources: async () => mode === 'no-sources' ? [] : [nativeSource] },
      systemPreferences: { getMediaAccessStatus: () => mode === 'denied' ? 'denied' : 'granted' },
      setTimer: fn => { timers.add(fn); return fn; }, clearTimer: fn => timers.delete(fn),
    });
    const event = { sender, senderFrame: frame };
    f.bridge.respond = payload => handler.respond(event, payload);
    f.bridge.cancel = () => handler.cancel(event);
    f.navigator.mediaDevices.getDisplayMedia = () => new Promise((resolve, reject) => {
      handler.request({ frame, userGesture: true, videoRequested: true, audioRequested: false }, result => {
        if (result.video) {
          assert.equal(result.video, nativeSource);
          assert.equal(result.audio, undefined);
          resolve(f.screen);
        } else reject(failure('NotAllowedError'));
      });
    });
    const pending = f.toggleScreen();
    await tick();
    if (mode === 'selected') {
      const state = f.rtc.screenSharing;
      assert.equal(state.phase, 'selecting');
      assert.notEqual(state.sources[0].id, nativeSource.id);
      await f.selectScreenSource(state.requestId, state.sources[0].id);
    } else if (mode === 'cancelled') f.cancelScreen();
    else if (mode === 'timeout') [...timers][0]();
    await pending;
    assert.equal(f.rtc.screen, mode === 'selected');
    assert.equal(f.rtc.screenSharing.phase, mode === 'selected' ? 'active' : mode === 'cancelled' ? 'idle' : 'error');
    if (mode === 'denied') assert.equal(f.rtc.screenSharing.error.code, 'permission-denied');
    if (mode === 'no-sources' || mode === 'timeout') assert.equal(f.rtc.screenSharing.error.code, mode);
    assert.equal(timers.size, 0);
    for (const name of sender.eventNames()) assert.equal(sender.listenerCount(name), 0);
    f.bridge.clean();
  });
}
