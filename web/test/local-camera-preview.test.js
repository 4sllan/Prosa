import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript } from '@vue/compiler-sfc';
import * as Vue from 'vue';

// Compile the real component, replacing only its external services and icons.
const filename = 'VoiceStage.vue';
const source = readFileSync(new URL('../src/components/VoiceStage.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source, { filename });
const compiled = compileScript(descriptor, {
  id: 'voice-stage-test',
  inlineTemplate: true,
  genDefaultAs: 'component',
}).content;
const componentCode = compiled.replace(
  /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/g,
  (_, names, module) => `const { ${names.replace(/\bas\b/g, ':')} } = modules[${JSON.stringify(module)}];`,
);
const loadComponent = new Function('modules', `${componentCode}\nreturn component;`);

function element(type, text = '') {
  return { type, text, children: [], parent: null, props: {}, style: {}, srcObject: null };
}

function remove(node) {
  const siblings = node.parent?.children;
  if (siblings) siblings.splice(siblings.indexOf(node), 1);
  node.parent = null;
}

const renderer = Vue.createRenderer({
  createElement: element,
  createText: text => element('#text', text),
  createComment: text => element('#comment', text),
  setText: (node, text) => { node.text = text; },
  setElementText: (node, text) => { node.text = text; },
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
  remove,
  patchProp: (node, key, previous, next) => { node.props[key] = next; },
});

function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}

function hasClass(node, name) {
  return String(node.props.class || '').split(/\s+/).includes(name);
}

function stream(name) {
  // Like a native MediaStream, retain identity across Vue's reactive state.
  return Vue.markRaw({ name, getTracks() { throw new Error('Preview must not manage tracks'); } });
}

function mountStage(t, initial = {}) {
  const camera = stream('camera');
  const screen = stream('screen');
  const store = Vue.reactive({
    user: { id: 'self', displayName: 'Local' },
    members: [{ user: { id: 'other', displayName: 'Remote' } }],
    voice: { room: [{ userId: 'other' }, { userId: 'self' }] },
  });
  const rtc = Vue.reactive({
    channelId: 'room', video: false, screen: false,
    localStream: camera, screenStream: screen, remoteStreams: {}, speaking: {},
    muted: false, deafened: false, speakerMuted: false,
    microphone: { phase: 'ready', target: { id: 'room', name: 'Room' }, error: null },
    ...initial,
  });
  const unexpectedControl = () => { throw new Error('Unexpected media/control operation'); };
  const controls = Object.fromEntries(
    ['toggleMute', 'toggleSpeaker', 'toggleVideo', 'toggleScreen', 'toggleDeafen', 'leaveVoice']
      .map(name => [name, unexpectedControl]),
  );
  const icons = Object.fromEntries(
    ['Volume2', 'VolumeX', 'Mic', 'MicOff', 'Video', 'ScreenShare', 'HeadphoneOff']
      .map(name => [name, { render: () => Vue.h('icon') }]),
  );
  const component = loadComponent({
    vue: Vue,
    '../stores.js': { store, fullUrl: value => value },
    '../rtc.js': { rtc, ...controls },
    'lucide-vue-next': icons,
  });
  const root = element('root');
  const errors = [];
  let app;
  function mount() {
    app = renderer.createApp(component, { channel: { id: 'room', name: 'Room' } });
    app.config.errorHandler = error => errors.push(error);
    app.mount(root);
  }
  function unmount() { app.unmount(); app = null; }
  mount();
  t.after(() => {
    if (app) unmount();
    assert.deepEqual(errors, []);
  });
  const localVideo = () => find(root, node => node.type === 'video' && node.props.muted === '');
  const avatar = () => find(root, node => node.props.class === 'avatar' &&
    (node.text === 'LO' || node.children.some(child => child.text === 'LO')));
  return { rtc, store, root, camera, screen, localVideo, avatar, mount, unmount };
}

test('local preview: activating camera in a member list binds the real video element', async t => {
  const stage = mountStage(t);
  assert.equal(stage.localVideo(), null);
  assert.ok(stage.avatar());
  stage.rtc.video = true;
  await Vue.nextTick();
  const video = stage.localVideo();
  assert.ok(video);
  assert.equal(video.srcObject, stage.camera);
  assert.equal(video.props.autoplay, '');
  assert.equal(video.props.muted, '');
  assert.equal(video.props.playsinline, '');
  const button = find(stage.root, node => node.type === 'button' && node.props.title === 'Câmera');
  assert.equal(button.props['aria-pressed'], true);
});

test('local preview: camera off/on recreates and binds the video, restoring the avatar', async t => {
  const stage = mountStage(t, { video: true });
  await Vue.nextTick();
  const oldVideo = stage.localVideo();
  assert.equal(oldVideo.srcObject, stage.camera);
  stage.rtc.video = false;
  await Vue.nextTick();
  assert.equal(stage.localVideo(), null);
  assert.ok(stage.avatar());
  assert.equal(oldVideo.srcObject, null);
  stage.rtc.video = true;
  await Vue.nextTick();
  assert.notEqual(stage.localVideo(), oldVideo);
  assert.equal(stage.localVideo().srcObject, stage.camera);
});

test('local preview: screen takes priority and ending it restores the active camera', async t => {
  const stage = mountStage(t, { video: true });
  await Vue.nextTick();
  stage.rtc.screen = true;
  await Vue.nextTick();
  assert.equal(stage.localVideo().srcObject, stage.screen);
  stage.rtc.screen = false;
  await Vue.nextTick();
  assert.equal(stage.localVideo().srcObject, stage.camera);
  stage.rtc.video = false;
  stage.rtc.screen = true;
  await Vue.nextTick();
  assert.equal(stage.localVideo().srcObject, stage.screen);
  stage.rtc.screen = false;
  await Vue.nextTick();
  assert.equal(stage.localVideo(), null);
  assert.ok(stage.avatar());
});

test('local preview: replacing the selected stream updates an existing element', async t => {
  const stage = mountStage(t, { video: true });
  await Vue.nextTick();
  const video = stage.localVideo();
  stage.rtc.localStream = stream('replacement camera');
  await Vue.nextTick();
  assert.equal(stage.localVideo(), video);
  assert.equal(video.srcObject, stage.rtc.localStream);
  stage.rtc.screen = true;
  await Vue.nextTick();
  stage.rtc.screenStream = stream('replacement screen');
  await Vue.nextTick();
  assert.equal(video.srcObject, stage.rtc.screenStream);
});

test('local preview: missing sources are safe and bind when they become available', async t => {
  const stage = mountStage(t, { video: true, localStream: null });
  await Vue.nextTick();
  assert.equal(stage.localVideo().srcObject, null);
  stage.rtc.localStream = stage.camera;
  await Vue.nextTick();
  assert.equal(stage.localVideo().srcObject, stage.camera);
  stage.rtc.screen = true;
  stage.rtc.screenStream = null;
  await Vue.nextTick();
  assert.equal(stage.localVideo().srcObject, null);
  stage.rtc.screenStream = stage.screen;
  await Vue.nextTick();
  assert.equal(stage.localVideo().srcObject, stage.screen);
});

test('local preview: removing and restoring the local member does not reuse a stale element', async t => {
  const stage = mountStage(t, { video: true });
  await Vue.nextTick();
  const oldVideo = stage.localVideo();
  stage.store.voice.room = [{ userId: 'other' }];
  await Vue.nextTick();
  assert.equal(stage.localVideo(), null);
  assert.equal(oldVideo.srcObject, null);
  stage.rtc.localStream = stream('camera while absent');
  await Vue.nextTick();
  assert.equal(oldVideo.srcObject, null);
  stage.store.voice.room.push({ userId: 'self' });
  await Vue.nextTick();
  assert.equal(stage.localVideo().srcObject, stage.rtc.localStream);
});

test('local preview: unmount releases the element and remount binds the current source', async t => {
  const stage = mountStage(t, { screen: true });
  await Vue.nextTick();
  const oldVideo = stage.localVideo();
  assert.equal(oldVideo.srcObject, stage.screen);
  stage.unmount();
  assert.equal(oldVideo.srcObject, null);
  stage.rtc.screenStream = stream('screen while unmounted');
  await Vue.nextTick();
  assert.equal(oldVideo.srcObject, null);
  stage.mount();
  await Vue.nextTick();
  assert.notEqual(stage.localVideo(), oldVideo);
  assert.equal(stage.localVideo().srcObject, stage.rtc.screenStream);
});

test('stage layout: zero, one and multiple members select the appropriate layout', async t => {
  const stage = mountStage(t);
  for (const count of [0, 1, 2, 3, 4, 6, 1, 0]) {
    stage.store.voice.room = Array.from({ length: count }, (_, i) => ({
      userId: i === 0 ? 'self' : `peer-${i}`,
    }));
    await Vue.nextTick();
    const grid = find(stage.root, node => hasClass(node, 'voice-grid'));
    if (count === 0) {
      assert.equal(grid, null);
      assert.ok(find(stage.root, node => hasClass(node, 'stage-empty')));
    } else {
      assert.equal(hasClass(grid, 'is-single'), count === 1);
      assert.equal(grid.props.style['--stage-columns'], Math.ceil(Math.sqrt(count)));
      const tiles = grid.children.filter(node => hasClass(node, 'voice-tile'));
      assert.equal(tiles.length, count);
      assert.ok(tiles.every(tile => find(tile, node => hasClass(node, 'avatar'))));
    }
    assert.ok(find(stage.root, node => hasClass(node, 'stage-head')));
    assert.ok(find(stage.root, node => node.props['aria-label'] === 'Controles da chamada'));
  }
});

test('stage layout: a single remote member expands even without video', async t => {
  const stage = mountStage(t);
  stage.store.voice.room = [{ userId: 'other' }];
  await Vue.nextTick();
  const grid = find(stage.root, node => hasClass(node, 'voice-grid'));
  assert.ok(hasClass(grid, 'is-single'));
  assert.ok(find(grid, node => hasClass(node, 'avatar') &&
    (node.text === 'RE' || node.children.some(child => child.text === 'RE'))));
  assert.ok(find(grid, node => hasClass(node, 'participant-name') && node.text === 'Remote'));
  stage.store.voice.room[0].video = true;
  stage.rtc.remoteStreams['room:other'] = stream('remote camera');
  await Vue.nextTick();
  const video = find(grid, node => node.type === 'video');
  assert.equal(video.srcObject, stage.rtc.remoteStreams['room:other']);
  assert.equal(video.props.autoplay, '');
  assert.equal(video.props.playsinline, '');
  assert.equal(video.props.muted, false);
});

test('stage layout: entering and leaving peers preserve the active local video and stream', async t => {
  const stage = mountStage(t, { video: true });
  stage.store.voice.room = [{ userId: 'self' }];
  await Vue.nextTick();
  const video = stage.localVideo();
  const originalStream = video.srcObject;
  stage.store.voice.room.unshift({ userId: 'other', video: true });
  await Vue.nextTick();
  assert.equal(hasClass(find(stage.root, node => hasClass(node, 'voice-grid')), 'is-single'), false);
  assert.equal(stage.localVideo(), video);
  assert.equal(video.srcObject, originalStream);
  stage.store.voice.room.shift();
  await Vue.nextTick();
  assert.ok(hasClass(find(stage.root, node => hasClass(node, 'voice-grid')), 'is-single'));
  assert.equal(stage.localVideo(), video);
  assert.equal(video.srcObject, originalStream);
});

test('stage layout: local screen fitting follows RTC state, not the stale member snapshot', async t => {
  const stage = mountStage(t, { video: true });
  await Vue.nextTick();
  const tile = stage.localVideo().parent;
  assert.equal(hasClass(tile, 'sharing-screen'), false);
  stage.rtc.screen = true;
  await Vue.nextTick();
  assert.ok(hasClass(tile, 'sharing-screen'));
  assert.equal(stage.localVideo().srcObject, stage.screen);
  stage.rtc.screen = false;
  stage.store.voice.room.find(member => member.userId === 'self').screen = true;
  await Vue.nextTick();
  assert.equal(hasClass(tile, 'sharing-screen'), false);
  assert.equal(stage.localVideo().srcObject, stage.camera);
});

test('stage layout: remote screen fitting and speaking preserve remote audio controls', async t => {
  const stage = mountStage(t, { speakerMuted: true });
  stage.store.voice.room[0].video = true;
  stage.store.voice.room[0].screen = true;
  stage.rtc.speaking.other = true;
  await Vue.nextTick();
  const tile = find(stage.root, node => hasClass(node, 'sharing-screen'));
  assert.ok(hasClass(tile, 'speaking'));
  const video = find(tile, node => node.type === 'video');
  assert.equal(video.props.muted, true);
  stage.store.voice.room[0].screen = false;
  stage.rtc.speakerMuted = false;
  stage.rtc.deafened = true;
  await Vue.nextTick();
  assert.equal(hasClass(tile, 'sharing-screen'), false);
  assert.equal(video.props.muted, true);
  stage.rtc.deafened = false;
  await Vue.nextTick();
  assert.equal(video.props.muted, false);
});
