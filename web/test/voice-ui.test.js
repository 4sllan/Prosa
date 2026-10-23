import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript } from '@vue/compiler-sfc';
import * as Vue from 'vue';

function component(file, modules) {
  const filename = file.split('/').at(-1);
  const { descriptor } = parse(readFileSync(new URL(file, import.meta.url), 'utf8'), { filename });
  const compiled = compileScript(descriptor, {
    id: filename, inlineTemplate: true, genDefaultAs: 'component',
  }).content.replace(/^import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?$/gm, (_, bindings, module) =>
    `const ${bindings.replace(/\bas\b/g, ':')} = modules[${JSON.stringify(module)}];`);
  return new Function('modules', 'localStorage', 'window', `${compiled}\nreturn component;`)(
    modules, { getItem: () => null }, { addEventListener() {}, removeEventListener() {} },
  );
}

function element(type, text = '') {
  return { type, text, props: {}, children: [], parent: null, srcObject: null, addEventListener() {} };
}

function remove(node) {
  const children = node.parent?.children;
  if (children) children.splice(children.indexOf(node), 1);
  node.parent = null;
}

const renderer = Vue.createRenderer({
  createElement: element,
  createText: text => element('#text', text),
  createComment: text => element('#comment', text),
  setText: (node, text) => { node.text = text; },
  setElementText: (node, text) => { node.children = []; node.text = text; },
  parentNode: node => node.parent,
  nextSibling(node) {
    const children = node.parent?.children || [];
    return children[children.indexOf(node) + 1] || null;
  },
  insert(node, parent, anchor = null) {
    if (node.parent) remove(node);
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, node);
    node.parent = parent;
  },
  remove,
  patchProp: (node, key, old, value) => { node.props[key] = value; },
});

function find(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}
const text = node => node ? (node.type === '#comment' ? '' : node.text) + node.children.map(text).join('') : '';
const hasClass = (node, name) => String(node.props.class || '').split(/\s+/).includes(name);
const button = (root, label) => find(root, n => n.type === 'button' &&
  (text(n).trim() || n.props['aria-label'] || n.props.title) === label);
const feedback = root => find(root, n => hasClass(n, 'microphone-feedback'));
async function click(node) {
  assert.ok(node, 'Expected an actionable element');
  assert.ok(!node.props.disabled, 'Expected enabled control');
  await node.props.onClick({ stopPropagation() {}, preventDefault() {} });
  await Vue.nextTick();
}

function fixture(t) {
  const rtc = Vue.reactive({
    channelId: null, channelName: null, muted: false, speakerMuted: false, deafened: false,
    video: false, screen: false, localStream: null, screenStream: null, remoteStreams: {}, speaking: {},
    microphone: { phase: 'idle', target: null, error: null },
    screenSharing: { phase: 'idle', requestId: null, sources: [], error: null },
  });
  const store = Vue.reactive({
    user: { id: 'self', displayName: 'Local', username: 'local' }, appName: 'Prosa',
    communities: [{ id: 'community', name: 'Community', myRole: 'member' }],
    currentCommunity: null, activeChannelId: null, categories: [], dms: [], members: [],
    channels: [{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }],
    voice: {}, relationships: [], messages: {},
  });
  const calls = [];
  const controls = {
    rtc,
    joinVoice: async (id, name) => {
      calls.push(['join', id, name]);
      rtc.microphone = { phase: 'initializing', target: { id, name }, error: null };
    },
    leaveVoice: async () => {
      calls.push(['leave']);
      rtc.channelId = null;
      rtc.microphone = { phase: 'idle', target: null, error: null };
    },
    ...Object.fromEntries(['toggleMute', 'toggleSpeaker', 'toggleVideo', 'toggleScreen', 'toggleDeafen']
      .map(name => [name, () => calls.push([name])])),
  };
  const empty = { render: () => Vue.h('stub') };
  const modules = {
    vue: Vue,
    '../rtc.js': controls,
    '../stores.js': {
      store, fullUrl: value => value, presenceOf: () => 'online',
      selectCommunity: async c => { store.currentCommunity = c; },
      openChannel: async id => { calls.push(['open', id]); store.activeChannelId = id; },
    },
    'lucide-vue-next': new Proxy({}, { get: () => empty }),
    'vue-router': { useRoute: () => ({ params: {} }), useRouter: () => ({}) },
    '../services/index.js': {},
    '../services/p2p/transport.js': { p2pTransport: {} },
    '../assets/logotipo-prosa.png': 'logo',
  };
  for (const name of ['ChatView', 'VoiceStage', 'ConnectionsView', 'AdminPanel',
    'CommunitySettings', 'UserSettings', 'ContextMenu', 'ScreenSharePicker']) modules[`../components/${name}.vue`] = empty;
  modules['../components/MicrophoneStatus.vue'] = component('../src/components/MicrophoneStatus.vue', modules);
  function mount(file, props = {}) {
    const root = element('root');
    const errors = [];
    const app = renderer.createApp(component(file, modules), props);
    app.config.errorHandler = error => errors.push(error);
    app.mount(root);
    t.after(() => { app.unmount(); assert.deepEqual(errors, []); });
    return root;
  }
  function state(phase, code = null) {
    rtc.microphone = { phase, target: { id: 'one', name: 'One' }, error: code ? { code } : null };
  }
  return { rtc, store, calls, modules, mount, state };
}

test('voice feedback: progress is accessible before channelId and cancellation clears it', async t => {
  const f = fixture(t);
  f.state('requesting');
  const root = f.mount('../src/components/MicrophoneStatus.vue');
  assert.ok(find(root, n => n.props.role === 'status'));
  assert.match(text(root), /Aguardando autoriza\u00e7\u00e3o/);
  assert.match(text(root), /One/);
  assert.match(text(root), /n\u00e3o fecha a janela/);
  assert.equal(f.rtc.channelId, null);
  await click(button(root, 'Cancelar entrada'));
  assert.deepEqual(f.calls, [['leave']]);
  assert.equal(feedback(root), null);
});

test('voice feedback: initialization changes to error and successful retry removes stale feedback', async t => {
  const f = fixture(t);
  f.state('initializing');
  const root = f.mount('../src/components/MicrophoneStatus.vue', {
    onRetry: target => f.modules['../rtc.js'].joinVoice(target.id, target.name),
  });
  assert.match(text(root), /Inicializando/);
  f.state('error', 'device-not-found');
  await Vue.nextTick();
  assert.ok(find(root, n => n.props.role === 'alert'));
  assert.equal(find(root, n => n.props.role === 'status'), null);
  await click(button(root, 'Tentar novamente'));
  assert.deepEqual(f.calls, [['join', 'one', 'One']]);
  assert.equal(find(root, n => n.props.role === 'alert'), null);
  f.state('ready');
  await Vue.nextTick();
  assert.equal(feedback(root), null);
});

for (const [code, expected] of [
  ['permission-denied', /negado no macOS/],
  ['permission-restricted', /restrito no macOS/],
  ['authorization-failed', /verificar a autoriza\u00e7\u00e3o/],
  ['permission-blocked', /captura de \u00e1udio foi bloqueada/],
  ['device-not-found', /Nenhum microfone/],
  ['device-unreadable', /em uso por outro aplicativo/],
  ['capture-unavailable', /HTTPS ou localhost/],
  ['capture-failed', /iniciar a captura/],
  ['voice-join-failed', /entrada na chamada/],
  ['track-ended', /foi interrompida/],
  ['unexpected', /iniciar a captura/],
]) {
  test(`voice feedback: ${code} has a distinct safe error and recovery action`, async t => {
    const f = fixture(t);
    f.state('error', code);
    f.rtc.microphone.error.message = 'private raw details';
    const root = f.mount('../src/components/MicrophoneStatus.vue');
    assert.match(text(root), expected);
    assert.doesNotMatch(text(root), /private raw details/);
    const alert = find(root, n => n.props.role === 'alert');
    assert.equal(alert.props['aria-atomic'], 'true');
    if (['permission-denied', 'permission-restricted'].includes(code)) {
      assert.match(text(root), /Ajustes do Sistema > Privacidade e Seguran\u00e7a > Microfone/);
      assert.match(text(root), /encerrar e reabrir o Prosa/);
    } else {
      assert.doesNotMatch(text(root), /negado no macOS/);
    }
    assert.ok(button(root, 'Tentar novamente'));
  });
}

test('voice feedback: interrupted active capture offers exit instead of a blind retry', async t => {
  const f = fixture(t);
  f.rtc.channelId = 'one';
  f.state('error', 'track-ended');
  const root = f.mount('../src/components/MicrophoneStatus.vue');
  assert.match(text(root), /Saia da chamada e entre novamente/);
  assert.equal(button(root, 'Tentar novamente'), null);
  await click(button(root, 'Sair da chamada'));
  assert.deepEqual(f.calls, [['leave']]);
  assert.equal(feedback(root), null);
});

for (const file of ['VoiceStage', 'VoiceBar']) {
  test(`voice controls: ${file} hides initialization controls and disables interrupted microphone`, async t => {
    const f = fixture(t);
    f.rtc.channelId = 'one';
    f.state('initializing');
    const root = f.mount(`../src/components/${file}.vue`, { channel: { id: 'one', name: 'One' } });
    assert.equal(button(root, 'Microfone'), null);
    assert.equal(button(root, 'Sair'), null);
    f.state('ready');
    await Vue.nextTick();
    assert.equal(button(root, 'Microfone').props.disabled, false);
    assert.ok(hasClass(button(root, 'Microfone'), 'on'));
    await click(button(root, 'Microfone'));
    assert.deepEqual(f.calls, [['toggleMute']]);
    f.rtc.muted = true;
    await Vue.nextTick();
    assert.ok(button(root, 'Mudo'));
    assert.equal(button(root, 'Mudo').props.disabled, false);
    assert.equal(hasClass(button(root, 'Mudo'), 'on'), false);
    f.state('error', 'track-ended');
    await Vue.nextTick();
    const mic = button(root, 'Microfone indispon\u00edvel');
    assert.equal(mic.props.disabled, true);
    assert.equal(hasClass(mic, 'on'), false);
    for (const label of ['Alto-falante', 'C\u00e2mera', file === 'VoiceStage' ? 'Compartilhar tela' : 'Tela', 'Surdo', 'Sair']) {
      assert.ok(button(root, label), `Preserve ${label}`);
      assert.ok(!button(root, label).props.disabled);
    }
    await click(button(root, 'Sair'));
    assert.deepEqual(f.calls.at(-1), ['leave']);
  });
}

async function home(t) {
  const f = fixture(t);
  f.modules['../components/ChatView.vue'] = { render: () => Vue.h('chat-stub') };
  const root = f.mount('../src/views/HomeView.vue');
  await click(find(root, n => n.type === 'button' && n.props.title === 'Community'));
  const channel = id => find(root, n => hasClass(n, 'chan') && text(n).includes(id === 'one' ? 'One' : 'Two'));
  return { ...f, root, channel };
}

test('voice home: initial entry shows target feedback; text navigation remains possible while joining', async t => {
  const f = await home(t);
  await click(f.channel('one'));
  assert.deepEqual(f.calls.filter(c => c[0] === 'join'), [['join', 'one', 'One']]);
  assert.ok(find(f.root, n => n.props.role === 'status'));
  assert.equal(f.rtc.channelId, null);
  await click(f.channel('two'));
  assert.equal(f.store.activeChannelId, 'two');
  assert.equal(f.calls.filter(c => c[0] === 'join').length, 1);
  assert.equal(button(f.root, 'Confirmar'), null);
  assert.match(text(feedback(f.root)), /One/);
  const chatButton = find(f.channel('two'), n => hasClass(n, 'chan-chat'));
  await click(chatButton);
  assert.ok(find(f.root, n => hasClass(n, 'chat-aside')));
  assert.ok(find(f.root, n => n.type === 'chat-stub'));
  assert.ok(feedback(f.root));
  assert.equal(feedback(f.root).parent.type, 'main');
  await click(button(f.root, 'Cancelar entrada'));
  assert.equal(feedback(f.root), null);
});

test('voice home: retry reaches the existing entry flow and success clears the error', async t => {
  const f = await home(t);
  f.state('error', 'device-unreadable');
  await Vue.nextTick();
  assert.ok(find(f.root, n => n.props.role === 'alert'));
  await click(button(f.root, 'Tentar novamente'));
  assert.deepEqual(f.calls, [['join', 'one', 'One']]);
  assert.ok(find(f.root, n => n.props.role === 'status'));
  assert.equal(find(f.root, n => n.props.role === 'alert'), null);
  f.rtc.channelId = 'one';
  f.state('ready');
  await Vue.nextTick();
  assert.equal(feedback(f.root), null);
});

test('voice home: channel switch still requires confirmation and can be cancelled', async t => {
  const f = await home(t);
  f.rtc.channelId = 'one';
  f.rtc.channelName = 'One';
  f.state('ready');
  await click(f.channel('two'));
  assert.match(text(f.root), /Trocar de canal de voz/);
  assert.equal(f.calls.filter(c => c[0] === 'join').length, 0);
  await click(button(f.root, 'Cancelar'));
  assert.equal(button(f.root, 'Confirmar'), null);
  assert.equal(f.rtc.channelId, 'one');
  await click(f.channel('two'));
  await click(button(f.root, 'Confirmar'));
  assert.deepEqual(f.calls.filter(c => c[0] === 'join'), [['join', 'two', 'Two']]);
  assert.equal(button(f.root, 'Confirmar'), null);
});

test('voice home: pending initialization cannot open or confirm a competing switch', async t => {
  const f = await home(t);
  f.rtc.channelId = 'one';
  f.state('initializing');
  await click(f.channel('two'));
  assert.equal(button(f.root, 'Confirmar'), null);
  f.state('ready');
  await click(f.channel('two'));
  f.state('requesting');
  await Vue.nextTick();
  const confirm = button(f.root, 'Confirmar');
  assert.equal(confirm.props.disabled, true);
  await confirm.props.onClick();
  assert.equal(f.calls.filter(c => c[0] === 'join').length, 0);
  f.state('ready');
  await Vue.nextTick();
  await click(button(f.root, 'Confirmar'));
  assert.deepEqual(f.calls.filter(c => c[0] === 'join'), [['join', 'two', 'Two']]);
});

test('voice home: userbar microphone is disabled until ready and after track interruption', async t => {
  const f = await home(t);
  const mic = () => find(f.root, n => n.type === 'button' && n.props['aria-label']?.toLowerCase().includes('microfone'));
  assert.equal(mic().props.disabled, true);
  f.state('ready');
  await Vue.nextTick();
  assert.equal(mic().props.disabled, false);
  assert.equal(mic().props['aria-label'], 'Mutar microfone');
  await click(mic());
  f.rtc.muted = true;
  await Vue.nextTick();
  assert.equal(mic().props['aria-label'], 'Desmutar microfone');
  f.state('error', 'track-ended');
  await Vue.nextTick();
  assert.equal(mic().props.disabled, true);
  assert.deepEqual(f.calls, [['toggleMute']]);
});
