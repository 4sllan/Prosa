import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import plist from 'plist';

// These parsers already ship with electron-builder; no app or signing is run.
const config = yaml.load(readFileSync(new URL('../electron-builder.yml', import.meta.url), 'utf8'));
const entitlements = file => plist.parse(readFileSync(new URL('../' + file, import.meta.url), 'utf8'));

test('desktop package: macOS microphone purpose is explicit without changing app identity', () => {
  assert.equal(config.appId, 'com.prosa.app');
  assert.equal(config.productName, 'Prosa');
  assert.equal(config.mac.identity, null);
  assert.match(config.mac.extendInfo.NSMicrophoneUsageDescription, /Prosa.*microfone.*voz/);
  assert.deepEqual(Object.keys(config.mac.extendInfo), ['NSMicrophoneUsageDescription']);
});

test('desktop package: main app and helpers use microphone entitlements', () => {
  assert.equal(config.mac.entitlements, 'build/entitlements.plist');
  assert.equal(config.mac.entitlementsInherit, 'build/entitlements.plist');
  const expected = {
    'com.apple.security.cs.allow-jit': true,
    'com.apple.security.cs.allow-unsigned-executable-memory': true,
    'com.apple.security.cs.disable-library-validation': true,
    'com.apple.security.cs.allow-dyld-environment-variables': true,
    'com.apple.security.device.audio-input': true,
  };
  assert.deepEqual(entitlements(config.mac.entitlements), expected);
  assert.deepEqual(entitlements(config.mac.entitlementsInherit), expected);
});
