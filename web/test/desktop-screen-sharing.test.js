import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import screenSharing from '../desktop/screen-sharing.cjs';

const { createScreenSharingHandler } = screenSharing;
const appUrl = 'file:///tmp/prosa-screen-test/dist/index.html';
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
function source(id = 'screen:1:0', name = 'Screen 1', empty = false) {
  return { id, name, thumbnail: { isEmpty: () => empty, toDataURL: () => 'data:image/png;base64,test' } };
}

function fixture(t, { platform = 'darwin', url = appUrl, status = 'granted' } = {}) {
  const messages = [], captures = [], calls = [], timers = new Set(), windows = new Set();
  const frameOwners = new Map();
  function window() {
    const sender = new EventEmitter();
    sender.isDestroyed = () => false;
    const frame = { url, detached: false, send: (channel, data) => messages.push({ frame, channel, data }) };
    sender.mainFrame = frame;
    frameOwners.set(frame, sender);
    windows.add(sender);
    return { sender, frame, event: { sender, senderFrame: frame } };
  }
  const main = window();
  const sources = [source(), source('window:2:0', '<Private window>', true)];
  const capturer = { getSources: async options => { calls.push(options); return sources; } };
  const preferences = { getMediaAccessStatus(type) {
    assert.equal(type, 'screen');
    return status;
  } };
  const handler = createScreenSharingHandler({
    appUrl: url, isAppWebContents: wc => windows.has(wc),
    fromFrame: frame => frameOwners.get(frame), desktopCapturer: capturer,
    platform, systemPreferences: preferences,
    setTimer(fn, delay) { assert.equal(delay, 60_000); timers.add(fn); return fn; },
    clearTimer: fn => timers.delete(fn),
  });
  function request(details = {}, callback = value => captures.push(value)) {
    handler.request({ frame: main.frame, videoRequested: true, audioRequested: false, userGesture: true, ...details }, callback);
  }
  function list(frame = main.frame) {
    return messages.filter(m => m.frame === frame && m.channel === 'media:screen-request').at(-1)?.data;
  }
  function result() { return messages.filter(m => m.channel === 'media:screen-result').at(-1)?.data; }
  function clean() {
    assert.equal(timers.size, 0);
    for (const sender of windows) {
      for (const event of ['did-start-navigation', 'destroyed', 'render-process-gone']) {
        assert.equal(sender.listenerCount(event), 0, event);
      }
    }
  }
  t.after(() => {
    for (const sender of windows) sender.emit('destroyed');
    clean();
  });
  return { ...handler, ...main, request, list, result, clean, window, windows, frameOwners,
    messages, captures, calls, timers, capturer, sources, preferences };
}

test('screen: requires explicit opaque selection, grants only the chosen video source', async t => {
  const f = fixture(t);
  f.request();
  await tick();
  const list = f.list();
  assert.equal(list.sources.length, 2);
  assert.match(list.requestId, /^[0-9a-f-]{36}$/);
  assert.notEqual(list.sources[0].id, f.sources[0].id);
  assert.deepEqual(Object.keys(list.sources[0]), ['id', 'name', 'thumbnail']);
  assert.equal(list.sources[1].name, '<Private window>');
  assert.equal(list.sources[1].thumbnail, '');
  assert.deepEqual(f.captures, []);
  assert.equal(await f.respond(f.event, { requestId: list.requestId, sourceId: list.sources[1].id }), true);
  assert.deepEqual(f.captures, [{ video: f.sources[1] }]);
  assert.deepEqual(f.result(), { requestId: list.requestId, status: 'selected', code: null });
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls[0], { types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } });
  f.clean();
  assert.equal(await f.respond(f.event, { requestId: list.requestId, sourceId: list.sources[0].id }), false);
  assert.equal(f.cancel(f.event), false);
  assert.equal(f.captures.length, 1);
});

for (const mode of ['response', 'cancel', 'timeout']) {
  test(`screen: ${mode} denies capture exactly once and allows retry`, async t => {
    const f = fixture(t);
    f.request();
    await tick();
    const list = f.list();
    if (mode === 'response') await f.respond(f.event, { requestId: list.requestId, sourceId: null });
    if (mode === 'cancel') f.cancel(f.event);
    if (mode === 'timeout') [...f.timers][0]();
    assert.deepEqual(f.captures, [{}]);
    assert.equal(f.result().status, mode === 'timeout' ? 'error' : 'cancelled');
    assert.equal(f.result().code, mode === 'timeout' ? 'timeout' : null);
    f.clean();
    f.request();
    await tick();
    assert.notEqual(f.list().requestId, list.requestId);
    assert.equal(await f.respond(f.event, { requestId: list.requestId, sourceId: null }), false);
    assert.equal(f.captures.length, 1);
    f.cancel(f.event);
  });
}

for (const code of ['no-sources', 'capture-failed', 'permission-denied', 'permission-restricted']) {
  test(`screen: ${code} is sanitized and never grants a source`, async t => {
    const f = fixture(t);
    if (code === 'no-sources') f.capturer.getSources = async () => [];
    if (code === 'capture-failed') f.capturer.getSources = async () => { throw new Error('private details'); };
    if (code.startsWith('permission-')) f.preferences.getMediaAccessStatus = () => code.slice(11);
    f.request();
    await tick();
    assert.equal(f.list(), undefined);
    assert.equal(f.result().code, code);
    assert.deepEqual(f.captures, [{}]);
    assert.equal(JSON.stringify(f.messages).includes('private details'), false);
    f.clean();
  });
}

for (const status of ['not-determined', 'unknown', 'unexpected']) {
  test(`screen: ${status} does not invent a confirmed denial`, async t => {
    const f = fixture(t, { status });
    f.request();
    await tick();
    assert.ok(f.list());
    f.cancel(f.event);
  });
}

for (const platform of ['win32', 'linux']) {
  test(`screen: ${platform} does not call macOS consent APIs`, async t => {
    const f = fixture(t, { platform });
    f.preferences.getMediaAccessStatus = () => assert.fail('native query');
    f.request();
    await tick();
    assert.ok(f.list());
    f.cancel(f.event);
  });
}

test('screen: native query failure is generic, including when handling an enumeration error', async t => {
  const f = fixture(t);
  f.preferences.getMediaAccessStatus = () => { throw new Error('private system details'); };
  f.request();
  await tick();
  assert.equal(f.result().code, 'capture-failed');
  assert.deepEqual(f.captures, [{}]);
  f.clean();
});

for (const [label, mutate] of [
  ['null frame', f => ({ frame: null })],
  ['unknown frame', f => ({ frame: {} })],
  ['subframe', f => {
    const frame = { ...f.frame };
    f.frameOwners.set(frame, f.sender);
    return { frame };
  }],
  ['unregistered window', f => { f.windows.delete(f.sender); return {}; }],
  ['destroyed window', f => { f.sender.isDestroyed = () => true; return {}; }],
  ['detached frame', f => { f.frame.detached = true; return {}; }],
  ['external origin', f => { f.frame.url = 'https://untrusted.example'; return {}; }],
  ['other file', f => { f.frame.url = 'file:///tmp/other.html'; return {}; }],
  ['no gesture', () => ({ userGesture: false })],
  ['no video', () => ({ videoRequested: false })],
  ['audio requested', () => ({ audioRequested: true })],
]) {
  test(`screen: denies ${label} before enumeration`, t => {
    const f = fixture(t);
    f.request(mutate(f));
    assert.deepEqual(f.captures, [{}]);
    assert.equal(f.calls.length, 0);
    assert.equal(f.messages.length, 0);
    f.clean();
  });
}

test('screen: exact dev origin is rechecked on IPC response', async t => {
  const f = fixture(t, { url: 'http://localhost:5173' });
  f.request();
  await tick();
  for (const url of ['http://localhost:5174', 'http://localhost:5173.evil.example', 'https://localhost:5173']) {
    f.frame.url = url;
    await assert.rejects(f.respond(f.event, { requestId: f.list().requestId, sourceId: null }), /not allowed/);
    assert.throws(() => f.cancel(f.event), /not allowed/);
  }
  assert.deepEqual(f.captures, []);
});

test('screen: source outside the offered list cannot be captured', async t => {
  const f = fixture(t);
  f.request();
  await tick();
  assert.equal(await f.respond(f.event, { requestId: f.list().requestId, sourceId: f.sources[0].id }), false);
  assert.equal(f.result().code, 'source-unavailable');
  assert.deepEqual(f.captures, [{}]);
  f.clean();
});

test('screen: closed source is revalidated before granting', async t => {
  const f = fixture(t);
  f.request();
  await tick();
  const list = f.list();
  f.capturer.getSources = async () => [];
  assert.equal(await f.respond(f.event, { requestId: list.requestId, sourceId: list.sources[0].id }), false);
  assert.equal(f.result().code, 'source-unavailable');
  assert.deepEqual(f.captures, [{}]);
  f.clean();
});

test('screen: concurrent requests and duplicate responses do not replace a pending operation', async t => {
  const f = fixture(t);
  f.request();
  f.request();
  await tick();
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.captures, [{}]);
  const list = f.list();
  const selection = deferred();
  f.capturer.getSources = () => selection.promise;
  const payload = { requestId: list.requestId, sourceId: list.sources[0].id };
  const selecting = f.respond(f.event, payload);
  assert.equal(await f.respond(f.event, payload), false);
  f.cancel(f.event);
  selection.resolve(f.sources);
  assert.equal(await selecting, false);
  assert.deepEqual(f.captures, [{}, {}]);
  f.clean();
});

for (const stage of ['enumeration', 'selection']) {
  for (const exit of ['cancel', 'timeout', 'navigation', 'destroyed', 'render-process-gone']) {
    test(`screen: ${exit} during ${stage} invalidates late results and cleans resources`, async t => {
      const f = fixture(t);
      const delayed = deferred();
      let selecting;
      if (stage === 'enumeration') f.capturer.getSources = () => delayed.promise;
      f.request();
      if (stage === 'selection') {
        await tick();
        f.capturer.getSources = () => delayed.promise;
        const list = f.list();
        selecting = f.respond(f.event, { requestId: list.requestId, sourceId: list.sources[0].id });
      }
      if (exit === 'cancel') f.cancel(f.event);
      else if (exit === 'timeout') [...f.timers][0]();
      else if (exit === 'navigation') f.sender.emit('did-start-navigation', {}, appUrl, false, true);
      else f.sender.emit(exit);
      assert.deepEqual(f.captures, [{}]);
      f.clean();
      const count = f.messages.length;
      delayed.resolve(f.sources);
      await selecting;
      await tick();
      assert.equal(f.messages.length, count);
      assert.deepEqual(f.captures, [{}]);
    });
  }
}

test('screen: a late rejected enumeration cannot terminate a newer attempt', async t => {
  const f = fixture(t);
  const old = deferred();
  f.capturer.getSources = () => old.promise;
  f.request();
  f.cancel(f.event);
  f.capturer.getSources = async () => f.sources;
  f.request();
  await tick();
  const list = f.list();
  old.reject(new Error('late private failure'));
  await tick();
  assert.equal(f.captures.length, 1);
  assert.equal(await f.respond(f.event, { requestId: list.requestId, sourceId: list.sources[0].id }), true);
  assert.deepEqual(f.captures, [{}, { video: f.sources[0] }]);
});

test('screen: subframe navigation does not cancel main-frame selection', async t => {
  const f = fixture(t);
  f.request();
  await tick();
  f.sender.emit('did-start-navigation', {}, 'https://untrusted.example', false, false);
  assert.deepEqual(f.captures, []);
  assert.equal(f.cancel(f.event), true);
});

test('screen: pending requests are isolated per registered window', async t => {
  const f = fixture(t);
  const other = f.window();
  f.request();
  f.request({ frame: other.frame });
  await tick();
  const first = f.list();
  const second = f.list(other.frame);
  assert.equal(await f.respond(other.event, { requestId: first.requestId, sourceId: first.sources[0].id }), false);
  assert.equal(f.cancel(other.event), true);
  assert.equal(await f.respond(f.event, { requestId: second.requestId, sourceId: null }), false);
  assert.equal(await f.respond(f.event, { requestId: first.requestId, sourceId: first.sources[0].id }), true);
  assert.deepEqual(f.captures, [{}, { video: f.sources[0] }]);
  f.clean();
});

test('screen: malformed responses and untrusted IPC senders cannot affect a selection', async t => {
  const f = fixture(t);
  f.request();
  await tick();
  const list = f.list();
  for (const payload of [null, [], {}, { requestId: 1, sourceId: null },
    { requestId: '', sourceId: null }, { requestId: 'x'.repeat(65), sourceId: null },
    { requestId: list.requestId, sourceId: 1 }, { requestId: list.requestId, sourceId: '' },
    { requestId: list.requestId, sourceId: 'x'.repeat(65) },
    { requestId: list.requestId, sourceId: null, extra: true },
    { requestId: list.requestId, other: null }]) {
    await assert.rejects(f.respond(f.event, payload), /Invalid/);
  }
  await assert.rejects(f.respond(f.event), /Invalid/);
  await assert.rejects(f.respond(f.event, { requestId: list.requestId, sourceId: null }, 'extra'), /Invalid/);
  assert.throws(() => f.cancel(f.event, 'extra'), /Invalid/);
  for (const event of [null, {}, { sender: f.sender, senderFrame: { ...f.frame } },
    { sender: { ...f.sender }, senderFrame: f.frame }]) {
    await assert.rejects(f.respond(event, { requestId: list.requestId, sourceId: null }), /not allowed/);
    assert.throws(() => f.cancel(event), /not allowed/);
  }
  assert.deepEqual(f.captures, []);
  f.cancel(f.event);
});

test('screen: revalidates trust and permission after async source selection', async t => {
  const f = fixture(t);
  f.request();
  await tick();
  const list = f.list();
  const delayed = deferred();
  f.capturer.getSources = () => delayed.promise;
  const selecting = f.respond(f.event, { requestId: list.requestId, sourceId: list.sources[0].id });
  f.frame.detached = true;
  delayed.resolve(f.sources);
  assert.equal(await selecting, false);
  assert.deepEqual(f.captures, [{}]);
  assert.equal(f.result(), undefined);
  f.clean();
});

test('screen: permission revoked during selection is reported without granting capture', async t => {
  const f = fixture(t);
  f.request();
  await tick();
  f.preferences.getMediaAccessStatus = () => 'denied';
  const list = f.list();
  assert.equal(await f.respond(f.event, { requestId: list.requestId, sourceId: list.sources[0].id }), false);
  assert.equal(f.result().code, 'permission-denied');
  assert.deepEqual(f.captures, [{}]);
  f.clean();
});

test('screen: rejected revalidation and renderer send failures release the pending callback', async t => {
  const f = fixture(t);
  f.request();
  await tick();
  f.capturer.getSources = async () => { throw new Error('private window title'); };
  const list = f.list();
  assert.equal(await f.respond(f.event, { requestId: list.requestId, sourceId: list.sources[0].id }), false);
  assert.equal(f.result().code, 'capture-failed');
  f.clean();
  f.capturer.getSources = async () => f.sources;
  f.frame.send = () => { throw new Error('renderer gone'); };
  f.request();
  await tick();
  assert.deepEqual(f.captures, [{}, {}]);
  f.clean();
});

test('screen: preload exposes fixed channels, hides IPC events and unsubscribes listeners', async () => {
  let api;
  const calls = [];
  const ipc = new EventEmitter();
  ipc.invoke = (...args) => { calls.push(args); return Promise.resolve(true); };
  vm.runInNewContext(readFileSync(new URL('../desktop/preload.cjs', import.meta.url), 'utf8'), {
    process: { platform: 'darwin', env: {} },
    require(name) {
      assert.equal(name, 'electron');
      return { contextBridge: { exposeInMainWorld: (_name, bridge) => { api = bridge; } }, ipcRenderer: ipc };
    },
  });
  const bridge = api.screenSharing;
  assert.deepEqual(Object.keys(bridge), ['onRequest', 'onResult', 'respond', 'cancel']);
  const received = [];
  const unsubscribe = bridge.onRequest((...args) => received.push(args));
  const unsubscribeResult = bridge.onResult((...args) => received.push(args));
  const payload = { requestId: 'opaque', sources: [] };
  const result = { requestId: 'opaque', status: 'cancelled', code: null };
  ipc.emit('media:screen-request', { sender: 'never expose' }, payload);
  ipc.emit('media:screen-result', { sender: 'never expose' }, result);
  assert.deepEqual(received, [[payload], [result]]);
  unsubscribe();
  unsubscribe();
  unsubscribeResult();
  assert.equal(ipc.listenerCount('media:screen-request'), 0);
  assert.equal(ipc.listenerCount('media:screen-result'), 0);
  assert.throws(() => bridge.onRequest(null), /Expected a listener/);
  assert.equal(await bridge.respond({ requestId: 'opaque', sourceId: null }, 'extra'), true);
  assert.equal(await bridge.cancel('extra'), true);
  assert.deepEqual(calls, [
    ['media:screen-response', { requestId: 'opaque', sourceId: null }],
    ['media:screen-cancel'],
  ]);
  assert.equal(api.ipcRenderer, undefined);
  assert.equal(api.desktopCapturer, undefined);
});

test('screen: a cancellation response can stop asynchronous source revalidation', async t => {
  const f = fixture(t);
  f.request();
  await tick();
  const list = f.list();
  const delayed = deferred();
  f.capturer.getSources = () => delayed.promise;
  const selecting = f.respond(f.event, { requestId: list.requestId, sourceId: list.sources[0].id });
  assert.equal(await f.respond(f.event, { requestId: list.requestId, sourceId: null }), true);
  delayed.resolve(f.sources);
  assert.equal(await selecting, false);
  assert.equal(f.result().status, 'cancelled');
  assert.deepEqual(f.captures, [{}]);
  f.clean();
});

test('screen: trust is rechecked when enumeration resolves, without sending sources to a new frame', async t => {
  const f = fixture(t);
  const delayed = deferred();
  f.capturer.getSources = () => delayed.promise;
  f.request();
  f.sender.mainFrame = { ...f.frame };
  delayed.resolve(f.sources);
  await tick();
  assert.equal(f.messages.length, 0);
  assert.deepEqual(f.captures, [{}]);
  f.clean();
});

test('screen: current navigation event details invalidate selection', async t => {
  const f = fixture(t);
  f.request();
  await tick();
  f.sender.emit('did-start-navigation', { isMainFrame: true });
  assert.deepEqual(f.captures, [{}]);
  f.clean();
});

test('screen: presentation data is bounded and never includes native source handles', async t => {
  const f = fixture(t);
  f.capturer.getSources = async () => Array.from({ length: 150 },
    (_, i) => source(`window:${i}:0`, 'a'.repeat(1000)));
  f.request();
  await tick();
  const list = f.list();
  assert.equal(list.sources.length, 128);
  for (const item of list.sources) {
    assert.equal(item.name.length, 512);
    assert.match(item.id, /^[0-9a-f-]{36}$/);
    assert.equal(item.display_id, undefined);
  }
  f.cancel(f.event);
  f.clean();
});
