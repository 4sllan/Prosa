import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import microphone from '../desktop/microphone.cjs';
import permissions from '../desktop/permissions.cjs';
import screenSharing from '../desktop/screen-sharing.cjs';

const { createMicrophoneAccessHandler } = microphone;
const appUrl = 'file:///tmp/prosa-microphone-test/dist/index.html';

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

function fixture({ platform = 'darwin', url = appUrl, status = 'granted', ask } = {}) {
  const frame = { url: url + '#/home', detached: false };
  const sender = { mainFrame: frame, isDestroyed: () => false };
  const calls = [];
  const preferences = {
    getMediaAccessStatus: type => { calls.push(['get', type]); return status; },
    askForMediaAccess: type => { calls.push(['ask', type]); return ask?.() ?? true; },
  };
  const handle = createMicrophoneAccessHandler({
    platform, systemPreferences: preferences, appUrl: url, isAppWebContents: wc => wc === sender,
  });
  return { handle, event: { sender, senderFrame: frame }, calls, preferences };
}

for (const status of ['granted', 'denied', 'restricted', 'unknown', 'unexpected', undefined]) {
  test(`microphone: existing ${String(status)} status never prompts`, async () => {
    const f = fixture();
    f.preferences.getMediaAccessStatus = type => { f.calls.push(['get', type]); return status; };
    assert.deepEqual(await f.handle(f.event), {
      status: ['granted', 'denied', 'restricted'].includes(status) ? status : 'unknown',
    });
    assert.deepEqual(f.calls, [['get', 'microphone']]);
  });
}

for (const [consent, expected] of [[true, 'granted'], [false, 'denied'], [undefined, 'unknown']]) {
  test(`microphone: waits for native consent (${String(consent)})`, async () => {
    const decision = deferred();
    const f = fixture({ status: 'not-determined', ask: () => decision.promise });
    let settled = false;
    const result = f.handle(f.event).then(value => { settled = true; return value; });
    await Promise.resolve();
    assert.equal(settled, false);
    assert.deepEqual(f.calls, [['get', 'microphone'], ['ask', 'microphone']]);
    decision.resolve(consent);
    assert.deepEqual(await result, { status: expected });
  });
}

test('microphone: concurrent calls share pending consent, later attempts re-query', async () => {
  const decision = deferred();
  const f = fixture({ status: 'not-determined', ask: () => decision.promise });
  const first = f.handle(f.event);
  const second = f.handle(f.event);
  await Promise.resolve();
  assert.deepEqual(f.calls, [['get', 'microphone'], ['ask', 'microphone']]);
  decision.resolve(true);
  assert.deepEqual(await Promise.all([first, second]), [{ status: 'granted' }, { status: 'granted' }]);
  f.preferences.getMediaAccessStatus = type => { f.calls.push(['get', type]); return 'denied'; };
  assert.deepEqual(await f.handle(f.event), { status: 'denied' });
  assert.deepEqual(f.calls.at(-1), ['get', 'microphone']);
  assert.equal(f.calls.length, 3);
});

for (const stage of ['query', 'prompt-sync', 'prompt-async']) {
  test(`microphone: ${stage} failure is sanitized and does not poison later requests`, async () => {
    const f = fixture({ status: 'not-determined' });
    const fail = () => { throw new Error('private native details'); };
    if (stage === 'query') f.preferences.getMediaAccessStatus = fail;
    else f.preferences.askForMediaAccess = stage === 'prompt-sync'
      ? fail : () => Promise.reject(new Error('private native details'));
    await assert.rejects(f.handle(f.event), { message: 'Microphone authorization failed' });
    f.preferences.getMediaAccessStatus = () => 'granted';
    assert.deepEqual(await f.handle(f.event), { status: 'granted' });
  });
}

test('microphone: all pending callers fail safely and can retry after prompt failure', async () => {
  const decision = deferred();
  const f = fixture({ status: 'not-determined', ask: () => decision.promise });
  const first = assert.rejects(f.handle(f.event), /Microphone authorization failed/);
  const second = assert.rejects(f.handle(f.event), /Microphone authorization failed/);
  await Promise.resolve();
  decision.reject(new Error('native failure'));
  await Promise.all([first, second]);
  f.preferences.askForMediaAccess = () => false;
  assert.deepEqual(await f.handle(f.event), { status: 'denied' });
});

for (const [label, mutate] of [
  ['missing sender', f => { f.event.sender = null; }],
  ['destroyed sender', f => { f.event.sender.isDestroyed = () => true; }],
  ['other window', f => { f.event.sender = { ...f.event.sender }; }],
  ['subframe', f => { f.event.senderFrame = { ...f.event.senderFrame }; }],
  ['missing frame', f => { f.event.senderFrame = null; }],
  ['detached frame', f => { f.event.senderFrame.detached = true; }],
  ['missing URL', f => { delete f.event.senderFrame.url; }],
  ['invalid URL', f => { f.event.senderFrame.url = 'invalid'; }],
  ['other local file', f => { f.event.senderFrame.url = 'file:///tmp/other.html'; }],
  ['other local host', f => { f.event.senderFrame.url = appUrl.replace('file:///', 'file://other/'); }],
  ['remote URL', f => { f.event.senderFrame.url = 'https://untrusted.example'; }],
]) {
  test(`microphone: denies ${label} before any native API call`, async () => {
    const f = fixture({ status: 'not-determined' });
    mutate(f);
    await assert.rejects(f.handle(f.event), /Microphone access request not allowed/);
    assert.deepEqual(f.calls, []);
  });
}

test('microphone: validates even while an authorized prompt is pending', async () => {
  const decision = deferred();
  const f = fixture({ status: 'not-determined', ask: () => decision.promise });
  const valid = f.handle(f.event);
  await assert.rejects(f.handle({ ...f.event, senderFrame: { ...f.event.senderFrame } }), /not allowed/);
  decision.resolve(true);
  assert.deepEqual(await valid, { status: 'granted' });
  assert.equal(f.calls.length, 2);
});

test('microphone: rejects arguments and does not allow choosing other media', async () => {
  const f = fixture();
  await assert.rejects(f.handle(f.event, 'camera'), /not allowed/);
  await assert.rejects(f.handle(null), /not allowed/);
  assert.deepEqual(f.calls, []);
});

test('microphone: development trusts exact origin, not prefix matches', async () => {
  const f = fixture({ url: 'http://localhost:5173' });
  assert.deepEqual(await f.handle(f.event), { status: 'granted' });
  for (const url of ['http://localhost:5174', 'http://localhost:5173.evil.example', 'https://localhost:5173']) {
    f.event.senderFrame.url = url;
    await assert.rejects(f.handle(f.event), /not allowed/);
  }
  assert.equal(f.calls.length, 1);
});

for (const platform of ['win32', 'linux']) {
  test(`microphone: ${platform} skips native APIs but still validates sender`, async () => {
    const f = fixture({ platform });
    assert.deepEqual(await f.handle(f.event), { status: 'not-applicable' });
    f.event.senderFrame.url = 'https://untrusted.example';
    await assert.rejects(f.handle(f.event), /not allowed/);
    assert.deepEqual(f.calls, []);
  });
}

test('microphone: preload exposes a fixed argument-free IPC operation', async () => {
  let bridge;
  const calls = [];
  const source = readFileSync(new URL('../desktop/preload.cjs', import.meta.url), 'utf8');
  vm.runInNewContext(source, {
    process: { platform: 'darwin', env: {} },
    require: name => {
      assert.equal(name, 'electron');
      return {
        contextBridge: { exposeInMainWorld: (name, api) => { assert.equal(name, 'prosaDesktop'); bridge = api; } },
        ipcRenderer: { invoke: (...args) => { calls.push(args); return Promise.resolve({ status: 'granted' }); } },
      };
    },
  });
  assert.deepEqual(await bridge.ensureMicrophoneAccess('camera'), { status: 'granted' });
  assert.deepEqual(calls, [['media:ensure-microphone-access']]);
  assert.equal(bridge.ipcRenderer, undefined);
  assert.equal(bridge.systemPreferences, undefined);
});

test('microphone: real main registers the handler and trusts only its own window', async () => {
  const desktop = fileURLToPath(new URL('../desktop/', import.meta.url));
  const handlers = new Map();
  const windows = [];
  let ready;
  let nativeCalls = 0;
  let displayHandler;
  let displayRegistrations = 0;
  const session = {
    setPermissionRequestHandler() {}, setPermissionCheckHandler() {},
    setDisplayMediaRequestHandler(handler, options) {
      assert.equal(options.useSystemPicker, false);
      displayHandler = handler;
      displayRegistrations++;
    },
  };
  class BrowserWindow {
    constructor(options) {
      assert.equal(options.webPreferences.contextIsolation, true);
      assert.equal(options.webPreferences.nodeIntegration, false);
      assert.equal(options.webPreferences.sandbox, true);
      this.webContents = {
        mainFrame: { url: pathToFileURL(path.join(desktop, '..', 'dist', 'index.html')).href },
        isDestroyed: () => false,
        session,
        setWindowOpenHandler() {}, on() {},
      };
      windows.push(this);
    }
    loadFile() { assert.equal(typeof displayHandler, 'function'); }
  }
  const modules = {
    electron: {
      app: { whenReady: () => ({ then: callback => { ready = callback; } }), getPath: () => '/unused', on() {} },
      BrowserWindow, shell: {},
      ipcMain: { handle: (channel, callback) => handlers.set(channel, callback) },
      systemPreferences: { getMediaAccessStatus: () => { nativeCalls++; return 'granted'; } },
      webContents: { fromFrame: frame => windows.find(win => win.webContents.mainFrame === frame)?.webContents },
      desktopCapturer: { getSources: () => assert.fail('unexpected enumeration') },
    },
    'node:path': path, 'node:url': { pathToFileURL },
    './store.cjs': { init: async () => 'mock', ops: {} },
    './identity.cjs': { init() {} },
    './permissions.cjs': permissions, './microphone.cjs': microphone,
    './screen-sharing.cjs': screenSharing,
  };
  vm.runInNewContext(readFileSync(path.join(desktop, 'main.cjs'), 'utf8'), {
    __dirname: desktop, process: { platform: 'darwin', env: {} },
    console: { log() {} },
    require: name => { assert.ok(name in modules, name); return modules[name]; },
  });
  await ready();
  const handler = handlers.get('media:ensure-microphone-access');
  assert.equal(typeof handler, 'function');
  const sender = windows[0].webContents;
  assert.deepEqual(await handler({ sender, senderFrame: sender.mainFrame }), { status: 'granted' });
  const other = new BrowserWindow({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await assert.rejects(handler({ sender: other.webContents, senderFrame: other.webContents.mainFrame }), /not allowed/);
  assert.equal(nativeCalls, 1);
  assert.equal(typeof handlers.get('media:screen-response'), 'function');
  assert.equal(typeof handlers.get('media:screen-cancel'), 'function');
  assert.equal(displayRegistrations, 1);
  const denied = [];
  displayHandler({ frame: other.webContents.mainFrame, userGesture: true, videoRequested: true },
    result => denied.push(result));
  assert.deepEqual(denied, [{}]);
});
