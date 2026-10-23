import test from 'node:test';
import assert from 'node:assert/strict';
import permissions from '../desktop/permissions.cjs';

const { canUsePermission } = permissions;
const app = 'file:///tmp/prosa-permission-test/dist/index.html';
const main = url => ({ isMainFrame: true, requestingUrl: url });

test('desktop: trusted main frame can write sanitized clipboard without read access', () => {
  assert.equal(canUsePermission('clipboard-sanitized-write', main(app + '#/friends'), app), true);
  for (const permission of ['clipboard-read', 'clipboard-write', 'unknown']) {
    assert.equal(canUsePermission(permission, main(app), app), false);
  }
});

for (const [label, details] of [
  ['subframe', { isMainFrame: false, requestingUrl: app }],
  ['missing frame information', { requestingUrl: app }],
  ['missing URL', { isMainFrame: true }],
  ['other local file', main('file:///tmp/other.html')],
  ['other host', main('file://untrusted/tmp/prosa-permission-test/dist/index.html')],
  ['remote origin', main('https://untrusted.example/')],
  ['malformed URL', main('invalid')],
]) {
  test(`desktop: clipboard write is denied for ${label}`, () => {
    assert.equal(canUsePermission('clipboard-sanitized-write', details, app), false);
  });
}

test('desktop: development write permission is restricted to exact app origin', () => {
  const dev = 'http://127.0.0.1:5173';
  assert.equal(canUsePermission('clipboard-sanitized-write', main(dev + '/#/friends'), dev), true);
  assert.equal(canUsePermission('clipboard-sanitized-write', main('http://127.0.0.1:5174'), dev), false);
  assert.equal(canUsePermission('clipboard-sanitized-write', main('https://untrusted.example/?' + dev), dev), false);
  assert.equal(canUsePermission('clipboard-sanitized-write', main(dev), 'invalid'), false);
});

test('desktop: previous media permission policy stays unchanged', () => {
  for (const permission of ['media', 'display-capture', 'notifications', 'mediaKeySystem', 'fullscreen']) {
    assert.equal(canUsePermission(permission, {}, app), true);
  }
  for (const permission of ['geolocation', 'openExternal', 'fileSystem']) {
    assert.equal(canUsePermission(permission, {}, app), false);
  }
});
