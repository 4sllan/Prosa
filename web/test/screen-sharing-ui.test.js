import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript } from '@vue/compiler-sfc';
import * as Vue from 'vue';

function component(file, modules, document, window) {
  const filename = file.split('/').at(-1);
  const { descriptor } = parse(readFileSync(new URL(file, import.meta.url), 'utf8'), { filename });
  const compiled = compileScript(descriptor, {
    id: filename, inlineTemplate: true, genDefaultAs: 'component',
  }).content.replace(/^import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?$/gm, (_, bindings, module) =>
    `const ${bindings.replace(/\bas\b/g, ':')} = modules[${JSON.stringify(module)}];`);
  return new Function('modules', 'document', 'window', 'localStorage', `${compiled}\nreturn component;`)(
    modules, document, window, { getItem: () => null },
  );
}

function all(node, predicate) {
  return [...(predicate(node) ? [node] : []), ...node.children.flatMap(child => all(child, predicate))];
}
const find = (node, predicate) => all(node, predicate)[0];
const text = node => node ? (node.type === '#comment' ? '' : node.text) + node.children.map(text).join('') : '';
const hasClass = (node, name) => String(node.props.class || '').split(/\s+/).includes(name);
const button = (root, label) => find(root, node => node.type === 'button'
  && (node.props['aria-label'] || text(node).trim()) === label);
const flush = async () => { await Vue.nextTick(); await Vue.nextTick(); };

function dom() {
  const listeners = new Set();
  const document = {
    activeElement: null,
    addEventListener(type, fn, capture) { assert.equal(type, 'click'); assert.equal(capture, true); listeners.add(fn); },
    removeEventListener(type, fn, capture) { assert.equal(type, 'click'); assert.equal(capture, true); listeners.delete(fn); },
  };
  const focusCalls = [];
  function element(type, text = '') {
    const node = {
      type, text, props: {}, children: [], parent: null, style: {}, srcObject: null, open: false, shows: 0, closes: 0,
      addEventListener() {}, removeEventListener() {},
      get disabled() { return !!this.props.disabled; },
      get isConnected() {
        for (let el = this; el; el = el.parent) if (el === body) return true;
        return false;
      },
      focus() {
        if (this.isConnected && !this.disabled) { document.activeElement = this; focusCalls.push(this); }
      },
      closest(selector) {
        assert.equal(selector, '[data-screen-share]');
        for (let el = this; el; el = el.parent) if ('data-screen-share' in el.props) return el;
        return null;
      },
      querySelectorAll(selector) {
        assert.equal(selector, 'button:not(:disabled)');
        return all(this, el => el.type === 'button' && !el.disabled);
      },
      showModal() { assert.equal(this.open, false); this.open = true; this.shows++; },
      close() { this.open = false; this.closes++; },
    };
    return Vue.markRaw(node);
  }
  const body = element('body');
  document.activeElement = body;
  function remove(node) {
    if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
    node.parent = null;
  }
  const renderer = Vue.createRenderer({
    createElement: element, createText: text => element('#text', text), createComment: text => element('#comment', text),
    setText: (node, text) => { node.text = text; },
    setElementText: (node, text) => { node.children = []; node.text = text; },
    parentNode: node => node.parent,
    nextSibling(node) {
      const siblings = node.parent?.children || [];
      return siblings[siblings.indexOf(node) + 1] || null;
    },
    insert(node, parent, anchor = null) {
      if (node.parent) remove(node);
      const index = anchor ? parent.children.indexOf(anchor) : -1;
      parent.children.splice(index < 0 ? parent.children.length : index, 0, node);
      node.parent = parent;
    },
    remove, patchProp: (node, key, old, value) => { node.props[key] = value; },
  });
  async function click(node, target = node) {
    assert.ok(node && !node.disabled, 'Expected enabled control');
    node.focus();
    const event = { target, currentTarget: node, preventDefault() {}, stopPropagation() {} };
    for (const listener of listeners) listener(event);
    await node.props.onClick(event);
    await flush();
  }
  async function key(node, key, shiftKey = false) {
    let prevented = false;
    const event = { key, shiftKey, target: node, preventDefault() { prevented = true; } };
    for (let el = node; el; el = el.parent) el.props.onKeydown?.(event);
    await flush();
    return prevented;
  }
  return { renderer, element, document, body, click, key, listeners, focusCalls };
}

function fixture(t, { platform = 'darwin', home = false } = {}) {
  const host = dom();
  const window = {
    prosaDesktop: platform === 'browser' ? undefined : { isDesktop: true, platform },
    addEventListener() {}, removeEventListener() {},
  };
  const camera = Vue.markRaw({ name: 'camera' }), screen = Vue.markRaw({ name: 'screen' });
  const rtc = Vue.reactive({
    channelId: 'room', channelName: 'Room', video: true, screen: false, muted: false, speakerMuted: false, deafened: false,
    localStream: camera, screenStream: null, remoteStreams: {}, speaking: {},
    microphone: { phase: 'ready', target: { id: 'room', name: 'Room' }, error: null },
    screenSharing: { phase: 'idle', requestId: null, sources: [], error: null },
  });
  const store = Vue.reactive({
    user: { id: 'self', displayName: 'Local', username: 'local' }, appName: 'Prosa',
    communities: [], currentCommunity: null, activeChannelId: 'room', categories: [], dms: [], members: [],
    channels: [{ id: 'room', name: 'Room' }], voice: { room: [{ userId: 'self' }] },
    relationships: [], messages: {},
  });
  const calls = [];
  function state(phase, code = null) {
    Object.assign(rtc.screenSharing, { phase, requestId: null, sources: [], error: code ? { code } : null });
  }
  const controls = {
    rtc,
    toggleScreen() {
      calls.push(['toggleScreen']);
      if (rtc.screen) { rtc.screen = false; rtc.screenStream = null; state('idle'); }
      else state('initializing');
    },
    selectScreenSource(requestId, sourceId) { calls.push(['select', requestId, sourceId]); state('capturing'); },
    cancelScreen() { calls.push(['cancel']); state('idle'); },
    leaveVoice() { calls.push(['leave']); state('idle'); rtc.channelId = null; },
    joinVoice() {},
    ...Object.fromEntries(['toggleMute', 'toggleSpeaker', 'toggleVideo', 'toggleDeafen']
      .map(name => [name, () => calls.push([name])])),
  };
  const stub = { render: () => Vue.h('stub') };
  const modules = {
    vue: Vue, '../rtc.js': controls,
    '../stores.js': { store, fullUrl: value => value, presenceOf: () => 'online' },
    'lucide-vue-next': new Proxy({}, { get: () => stub }),
    'vue-router': { useRoute: () => ({ params: {} }), useRouter: () => ({}) },
    '../services/index.js': {}, '../services/p2p/transport.js': {}, '../assets/logotipo-prosa.png': 'logo',
  };
  for (const name of ['ChatView', 'ConnectionsView', 'AdminPanel', 'CommunitySettings', 'UserSettings', 'ContextMenu', 'MicrophoneStatus']) {
    modules[`../components/${name}.vue`] = stub;
  }
  const load = file => component(file, modules, host.document, window);
  const Picker = load('../src/components/ScreenSharePicker.vue');
  const Stage = load('../src/components/VoiceStage.vue');
  const Bar = load('../src/components/VoiceBar.vue');
  modules['../components/ScreenSharePicker.vue'] = Picker;
  modules['../components/VoiceStage.vue'] = Stage;
  const Parent = home ? load('../src/views/HomeView.vue') : {
    render: () => Vue.h('main', [
      Vue.h(Stage, { channel: { id: 'room', name: 'Room' } }), Vue.h(Bar), Vue.h(Picker),
    ]),
  };
  const errors = [];
  const app = host.renderer.createApp(Parent);
  app.config.errorHandler = error => errors.push(error);
  app.mount(host.body);
  let mounted = true;
  function unmount() { app.unmount(); mounted = false; }
  t.after(() => {
    if (mounted) unmount();
    assert.deepEqual(errors, []);
    assert.equal(host.listeners.size, 0);
  });
  function select(sources = [
    { id: 'screen-1', name: 'Tela 1', thumbnail: 'data:image/png;base64,test' },
    { id: 'window-1', name: 'Janela de notas', thumbnail: '' },
  ], requestId = 'request-1') {
    Object.assign(rtc.screenSharing, { phase: 'selecting', requestId, sources, error: null });
  }
  const dialog = () => find(host.body, node => node.type === 'dialog');
  const shareButtons = () => all(host.body, node => node.type === 'button' && 'data-screen-share' in node.props);
  const feedback = () => find(host.body, node => hasClass(node, 'screen-share-feedback'));
  return { ...host, rtc, store, calls, state, select, dialog, shareButtons, feedback, camera, screen, unmount };
}

test('screen UI: one labelled native dialog opens without selecting a source, with cancel focused', async t => {
  const f = fixture(t);
  await flush();
  assert.equal(f.dialog().open, false);
  assert.equal(f.shareButtons().length, 2);
  const origin = f.shareButtons()[0];
  await f.click(origin, origin.children[0]);
  assert.equal(f.rtc.screenSharing.phase, 'initializing');
  assert.ok(find(f.body, node => node.props.role === 'status'));
  assert.ok(f.shareButtons().every(node => node.disabled && node.props['aria-busy']));
  f.select();
  await flush();
  const dialog = f.dialog();
  assert.equal(dialog.open, true);
  assert.equal(dialog.shows, 1);
  assert.equal(all(f.body, node => node.type === 'dialog').length, 1);
  assert.equal(dialog.props['aria-labelledby'], 'screen-share-title');
  assert.equal(dialog.props['aria-describedby'], 'screen-share-description');
  assert.equal(f.document.activeElement, button(dialog, 'Cancelar'));
  assert.equal(all(dialog, node => hasClass(node, 'screen-source')).length, 2);
  assert.equal(all(dialog, node => node.type === 'img').length, 1);
  assert.deepEqual(f.calls, [['toggleScreen']]);
  assert.equal(f.rtc.screen, false);
});

test('screen UI: explicit choice passes opaque IDs, closes picker and restores focus after capture is ready', async t => {
  const f = fixture(t);
  const origin = f.shareButtons()[1];
  await f.click(origin);
  f.select();
  await flush();
  await f.click(button(f.dialog(), 'Compartilhar Janela de notas'));
  assert.deepEqual(f.calls.at(-1), ['select', 'request-1', 'window-1']);
  assert.equal(f.dialog().open, false);
  assert.ok(f.shareButtons().every(node => node.disabled));
  assert.match(text(f.feedback()), /Iniciando a captura/);
  f.rtc.screen = true;
  f.rtc.screenStream = f.screen;
  f.state('active');
  await flush();
  assert.equal(f.document.activeElement, origin);
  assert.ok(f.shareButtons().every(node => !node.disabled && node.props['aria-pressed']));
  const stageVideo = find(f.body, node => node.type === 'video' && node.srcObject === f.screen);
  assert.ok(stageVideo);
  await f.click(origin);
  assert.equal(f.rtc.screen, false);
  assert.equal(f.dialog().open, false);
  assert.ok(find(f.body, node => node.type === 'video' && node.srcObject === f.camera));
});

for (const action of ['button', 'escape', 'native-cancel']) {
  test(`screen UI: ${action} cancellation is silent and returns focus to the initiating control`, async t => {
    const f = fixture(t);
    const origin = f.shareButtons()[0];
    await f.click(origin);
    f.select();
    await flush();
    if (action === 'button') await f.click(button(f.dialog(), 'Cancelar'));
    if (action === 'escape') assert.equal(await f.key(button(f.dialog(), 'Cancelar'), 'Escape'), true);
    if (action === 'native-cancel') {
      let prevented = false;
      f.dialog().props.onCancel({ preventDefault() { prevented = true; } });
      await flush();
      assert.equal(prevented, true);
    }
    assert.equal(f.rtc.screenSharing.phase, 'idle');
    assert.equal(f.dialog().open, false);
    assert.equal(f.rtc.screen, false);
    assert.equal(f.feedback(), undefined);
    assert.equal(f.document.activeElement, origin);
    assert.deepEqual(f.calls, [['toggleScreen'], ['cancel']]);
  });
}

test('screen UI: Tab and Shift+Tab wrap within the source/cancel controls', async t => {
  const f = fixture(t);
  await f.click(f.shareButtons()[0]);
  f.select();
  await flush();
  const options = f.dialog().querySelectorAll('button:not(:disabled)');
  const first = options[0], last = options.at(-1);
  assert.equal(f.document.activeElement, last);
  assert.equal(await f.key(last, 'Tab'), true);
  assert.equal(f.document.activeElement, first);
  assert.equal(await f.key(first, 'Tab', true), true);
  assert.equal(f.document.activeElement, last);
  assert.equal(await f.key(options[1], 'ArrowLeft'), false);
});

test('screen UI: unrelated updates do not reopen the dialog or steal focus', async t => {
  const f = fixture(t);
  await f.click(f.shareButtons()[0]);
  f.select();
  await flush();
  const option = button(f.dialog(), 'Compartilhar Tela 1');
  option.focus();
  f.rtc.muted = true;
  f.rtc.screenSharing.sources[0].name = 'Tela atualizada';
  await flush();
  assert.equal(f.dialog().shows, 1);
  assert.equal(f.document.activeElement, option);
});

for (const phase of ['initializing', 'selecting', 'capturing']) {
  test(`screen UI: ${phase} disables both screen controls without disabling audio/camera`, async t => {
    const f = fixture(t);
    await f.click(f.shareButtons()[0]);
    if (phase === 'selecting') f.select();
    else f.state(phase);
    await flush();
    assert.ok(f.shareButtons().every(node => node.disabled && node.props['aria-busy']));
    const controls = all(f.body, node => node.type === 'button'
      && (text(node).trim() === 'Microfone' || (node.props['aria-label'] || text(node).trim()) === 'C\u00e2mera'));
    assert.equal(controls.length, 4);
    assert.ok(controls.every(node => !node.disabled));
    assert.equal(f.rtc.channelId, 'room');
  });
}

test('screen UI: a picker failure closes the dialog, clears sources and restores the origin', async t => {
  const f = fixture(t);
  const origin = f.shareButtons()[0];
  await f.click(origin);
  f.select();
  await flush();
  f.state('error', 'source-unavailable');
  await flush();
  assert.equal(f.dialog().open, false);
  assert.equal(f.document.activeElement, origin);
  assert.equal(all(f.dialog(), node => hasClass(node, 'screen-source')).length, 0);
  assert.match(text(f.feedback()), /Escolha outra fonte/);
  assert.equal(f.rtc.channelId, 'room');
});

for (const [code, expected] of [
  ['permission-denied', /negado no macOS/], ['permission-restricted', /restrita no macOS/],
  ['no-sources', /Nenhuma tela ou janela/], ['source-unavailable', /Escolha outra fonte/],
  ['timeout', /tempo para escolher/], ['capture-blocked', /cancelada ou o acesso bloqueado/],
  ['capture-unavailable', /HTTPS ou localhost/], ['capture-unreadable', /em uso/],
  ['capture-pending', /tentativa anterior/], ['desktop-unavailable', /reabra o Prosa/],
  ['signaling-failed', /captura local foi encerrada/], ['capture-failed', /iniciar a captura/],
  ['private native error', /iniciar a captura/],
]) {
  test(`screen UI: ${code} has safe feedback and an explicit retry`, async t => {
    const f = fixture(t);
    f.state('error', code);
    await flush();
    assert.ok(find(f.feedback(), node => node.props.role === 'alert'));
    assert.match(text(f.feedback()), expected);
    const native = ['permission-denied', 'permission-restricted'].includes(code);
    assert.equal(text(f.feedback()).includes('Ajustes do Sistema'), native);
    if (native) {
      assert.match(text(f.feedback()), /Grava\u00e7\u00e3o de Tela/);
      assert.match(text(f.feedback()), /encerrar e reabrir o Prosa/);
    }
    assert.equal(text(f.feedback()).includes('private native error'), false);
    await f.click(button(f.feedback(), 'Tentar novamente'));
    assert.equal(f.rtc.screenSharing.phase, 'initializing');
    assert.equal(find(f.body, node => node.props.role === 'alert'), undefined);
    assert.equal(f.rtc.channelId, 'room');
    assert.equal(f.rtc.video, true);
  });
}

test('screen UI: cancellation during preparation clears feedback without leaving the call', async t => {
  const f = fixture(t);
  await f.click(f.shareButtons()[0]);
  await f.click(button(f.feedback(), 'Cancelar compartilhamento'));
  assert.equal(f.feedback(), undefined);
  assert.equal(f.rtc.channelId, 'room');
  assert.equal(f.rtc.video, true);
  assert.equal(f.rtc.localStream, f.camera);
});

test('screen UI: error dismissal does not start another capture', async t => {
  const f = fixture(t);
  f.state('error', 'capture-failed');
  await flush();
  await f.click(button(f.feedback(), 'Dispensar'));
  assert.deepEqual(f.calls, [['cancel']]);
  assert.equal(f.feedback(), undefined);
});

for (const platform of ['browser', 'linux', 'win32']) {
  test(`screen UI: ${platform} does not label an ambiguous denial as macOS permission`, async t => {
    const f = fixture(t, { platform });
    f.state('error', 'permission-denied');
    await flush();
    assert.match(text(f.feedback()), /cancelada ou o acesso bloqueado/);
    assert.doesNotMatch(text(f.feedback()), /macOS|Ajustes do Sistema/);
  });
}

test('screen UI: browser keeps its native picker and explains the cancellation limit', async t => {
  const f = fixture(t, { platform: 'browser' });
  await f.click(f.shareButtons()[0]);
  assert.equal(f.dialog().open, false);
  assert.match(text(f.feedback()), /n\u00e3o fecha o seletor do navegador/);
  f.rtc.screen = true;
  f.state('active');
  await flush();
  assert.equal(f.dialog().shows, 0);
  assert.equal(f.feedback(), undefined);
});

test('screen UI: source names stay text and only local PNG thumbnails are displayed', async t => {
  const f = fixture(t);
  await f.click(f.shareButtons()[0]);
  const name = '<img src=x onerror=alert(1)>';
  f.select([{ id: 'opaque', name, thumbnail: 'https://untrusted.example/private-source-name' }]);
  await flush();
  assert.equal(all(f.dialog(), node => node.type === 'img').length, 0);
  const option = button(f.dialog(), 'Compartilhar ' + name);
  assert.ok(option);
  assert.match(text(option), /<img src=x/);
  assert.equal(option.props.innerHTML, undefined);
  await f.click(option);
  assert.deepEqual(f.calls.at(-1), ['select', 'request-1', 'opaque']);
});

test('screen UI: leaving the call does not restore focus to a removed screen button', async t => {
  const f = fixture(t);
  const origin = f.shareButtons()[0];
  await f.click(origin);
  f.select();
  await flush();
  const count = f.focusCalls.length;
  f.rtc.channelId = null;
  f.state('idle');
  await flush();
  assert.equal(origin.isConnected, false);
  assert.equal(f.dialog().open, false);
  assert.equal(f.feedback(), undefined);
  assert.ok(!f.focusCalls.slice(count).includes(origin));
});

test('screen UI: unmount closes a pending picker and removes its only document listener', async t => {
  const f = fixture(t);
  await f.click(f.shareButtons()[0]);
  f.select();
  await flush();
  const dialog = f.dialog();
  assert.equal(f.listeners.size, 1);
  f.unmount();
  await flush();
  assert.equal(dialog.open, false);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.calls.at(-1)[0], 'cancel');
});

test('screen UI: Home mounts a single picker and retains it across text navigation', async t => {
  const f = fixture(t, { home: true });
  await flush();
  assert.equal(all(f.body, node => node.type === 'dialog').length, 1);
  const origin = f.shareButtons()[0];
  await f.click(origin);
  f.select();
  await flush();
  const dialog = f.dialog();
  assert.equal(dialog.open, true);
  f.store.activeChannelId = null;
  await flush();
  assert.equal(f.dialog(), dialog);
  assert.equal(dialog.shows, 1);
  await f.click(button(dialog, 'Cancelar'));
  assert.equal(dialog.open, false);
  assert.equal(f.rtc.channelId, 'room');
});
