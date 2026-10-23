import test from 'node:test';
import assert from 'node:assert/strict';
import { writeClipboardText } from '../src/services/p2p/clipboard.js';

for (const key of ['ab'.repeat(32), '302a300506032b6570032100' + 'cd'.repeat(32)]) {
  test(`clipboard: writes the complete ${key.length}-character public key once`, async () => {
    const written = [];
    const api = {
      readText() { throw new Error('Clipboard must never be read'); },
      async writeText(value) {
        assert.equal(this, api);
        written.push(value);
      },
    };
    await writeClipboardText(key, () => api);
    assert.deepEqual(written, [key]);
    assert.notEqual(written[0], key.slice(0, 20));
    assert.equal(written[0].startsWith('p2p:'), false);
  });
}

test('clipboard: completion waits for successful native write', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let complete = false;
  const copying = writeClipboardText('test-key', () => ({ writeText: () => pending }))
    .then(() => { complete = true; });
  await Promise.resolve();
  assert.equal(complete, false);
  release();
  await copying;
  assert.equal(complete, true);
});

for (const api of [undefined, null, {}, { writeText: 'not a function' }]) {
  test(`clipboard: unavailable API is an explicit failure (${String(api?.writeText)})`, async () => {
    await assert.rejects(writeClipboardText('test-key', () => api), /Clipboard indisponivel/);
  });
}

test('clipboard: native rejection propagates and a new attempt can succeed', async () => {
  const failure = new Error('Synthetic denial');
  let denied = true;
  const written = [];
  const api = { async writeText(value) {
    if (denied) throw failure;
    written.push(value);
  } };
  await assert.rejects(writeClipboardText('test-key', () => api), error => error === failure);
  assert.deepEqual(written, []);
  denied = false;
  await writeClipboardText('test-key', () => api);
  assert.deepEqual(written, ['test-key']);
});

test('clipboard: API accessor failure rejects without reading clipboard', async () => {
  const failure = new Error('Synthetic API failure');
  await assert.rejects(writeClipboardText('test-key', () => { throw failure; }),
    error => error === failure);
});
