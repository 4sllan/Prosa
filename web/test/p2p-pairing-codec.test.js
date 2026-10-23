import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodePairPayload, decodePairPayload, acceptPairingOffer, completePairing,
} from '../src/services/p2p/pairing.js';

const MAX_BYTES = 256 * 1024;
const offer = { v: 1, t: 'offer', sdp: 'v=0\r\na=setup:actpass\r\n' };
const answer = { v: 1, t: 'answer', sdp: 'v=0\r\na=setup:active\r\n' };
const link = payload => 'prosa://pair/' + encodePairPayload(payload);
const codeIs = code => error => error instanceof Error && error.code === code;

function stubPeerConnection(t, constructor) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'RTCPeerConnection');
  Object.defineProperty(globalThis, 'RTCPeerConnection', {
    configurable: true, writable: true, value: constructor,
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'RTCPeerConnection', original);
    else delete globalThis.RTCPeerConnection;
  });
}

test('codec: generated v1 links match their wire format and round-trip', () => {
  for (const payload of [offer, answer]) {
    const encoded = encodePairPayload(payload);
    assert.equal(encoded, Buffer.from(JSON.stringify(payload)).toString('base64url'));
    assert.deepEqual(decodePairPayload('prosa://pair/' + encoded), payload);
  }
});

test('codec: UTF-8 and all SDP whitespace survive round-trip exactly', () => {
  const payload = { ...offer, sdp: '  v=0\r\ns=caf\u00e9 \u{1f30e}\r\na=x: \t value  \r\n' };
  assert.deepEqual(decodePairPayload(link(payload)), payload);
});

test('codec: compatible raw, fragment and optional-slash formats stay supported', () => {
  const encoded = encodePairPayload(offer);
  for (const prefix of ['', '#', 'prosa://pair/', 'prosa://pair', 'prosa://pair/#']) {
    assert.deepEqual(decodePairPayload(prefix + encoded), offer);
  }
});

test('codec: optional base64url padding remains compatible', () => {
  const encoded = encodePairPayload(offer);
  const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
  assert.deepEqual(decodePairPayload('prosa://pair/' + padded), offer);
});

test('codec: ASCII spaces, tabs and line breaks are normalized only in encoded input', () => {
  const encoded = link(offer);
  const wrapped = ' \t\r\n' + encoded.replace(/(.{8})/g, '$1 \r\n\t') + '\n ';
  assert.deepEqual(decodePairPayload(wrapped), offer);
});

const invalidInputs = [
  ['missing', undefined], ['null input', null], ['object input', {}],
  ['number input', 1], ['wrong prefix', 'https://pair/abc'],
  ['illegal alphabet', 'prosa://pair/!!!'],
  ['illegal base64 length', 'prosa://pair/a'],
  ['invalid padding', 'prosa://pair/abcd==='],
  ['invalid JSON', 'prosa://pair/' + Buffer.from('{bad}').toString('base64url')],
  ['invalid UTF-8', 'prosa://pair/' + Buffer.from([0xff, 0xfe]).toString('base64url')],
  ['non-ASCII whitespace', '\u00a0' + link(offer)],
  ['truncated payload', link(offer).slice(0, -8)],
  ...[
    null, [], 'offer', 1, {}, { t: 'offer', sdp: 'v=0' },
    { v: 1, sdp: 'v=0' }, { v: 1, t: 'other', sdp: 'v=0' },
    { v: 1, t: 'offer' }, { v: 1, t: 'offer', sdp: null },
    { v: 1, t: 'offer', sdp: 123 }, { v: 1, t: 'offer', sdp: {} },
    { v: 1, t: 'offer', sdp: '' }, { v: 1, t: 'offer', sdp: ' \r\n\t ' },
  ].map((payload, i) => ['invalid schema ' + i, link(payload)]),
];

for (const [label, input] of invalidInputs) {
  test(`codec: rejects ${label} with a safe actionable error`, () => {
    assert.throws(() => decodePairPayload(input), codeIs('PAIR_INVALID_LINK'));
  });
}

for (const version of [0, 2, '1', null]) {
  test(`codec: unsupported version ${JSON.stringify(version)} has its own error`, () => {
    assert.throws(() => decodePairPayload(link({ ...offer, v: version })),
      codeIs('PAIR_UNSUPPORTED_VERSION'));
  });
}

test('codec: empty input is distinct from malformed payload', () => {
  for (const input of ['', ' \t\r\n ']) {
    assert.throws(() => decodePairPayload(input), codeIs('PAIR_EMPTY_LINK'));
  }
});

test('codec: size limit is checked before decoding or stripping whitespace', () => {
  for (const input of [' '.repeat(MAX_BYTES + 1), 'x'.repeat(MAX_BYTES + 1),
    '\u00e9'.repeat(MAX_BYTES / 2 + 1)]) {
    assert.throws(() => decodePairPayload(input), codeIs('PAIR_LINK_TOO_LARGE'));
  }
});

test('codec: errors explain recovery without echoing input payload', () => {
  const input = link({ ...offer, t: 'private-test-marker' });
  assert.throws(() => decodePairPayload(input), error => {
    assert.equal(error.code, 'PAIR_INVALID_LINK');
    assert.match(error.message, /Copiar convite ou Copiar resposta/);
    assert.equal(error.message.includes(input), false);
    assert.equal(error.message.includes('private-test-marker'), false);
    return true;
  });
});

test('codec: large valid payload at exactly 256 KiB is accepted, one extra byte rejected', () => {
  // The source JSON has a multiple-of-three byte length, avoiding base64 padding.
  const length = (MAX_BYTES - 'prosa://pair/'.length) * 3 / 4;
  const jsonOverhead = Buffer.byteLength(JSON.stringify({ ...offer, sdp: '' }));
  const payload = { ...offer, sdp: 'x'.repeat(length - jsonOverhead) };
  const input = link(payload);
  assert.equal(Buffer.byteLength(input), MAX_BYTES);
  assert.deepEqual(decodePairPayload(input), payload);
  assert.throws(() => decodePairPayload(input + ' '), codeIs('PAIR_LINK_TOO_LARGE'));
});

for (const [label, input] of invalidInputs) {
  test(`pairing validation: ${label} never creates PC or applies remote description`, async (t) => {
    let created = 0;
    let applied = 0;
    stubPeerConnection(t, class {
      constructor() { created++; }
    });
    const pc = { setRemoteDescription: async () => { applied++; } };
    await assert.rejects(acceptPairingOffer(input), codeIs('PAIR_INVALID_LINK'));
    await assert.rejects(completePairing(pc, input), codeIs('PAIR_INVALID_LINK'));
    assert.equal(created, 0);
    assert.equal(applied, 0);
  });
}

test('pairing validation: swapped offer and answer do not start WebRTC operations', async (t) => {
  let created = 0;
  stubPeerConnection(t, class {
    constructor() { created++; }
  });
  const pc = { setRemoteDescription: t.mock.fn() };
  await assert.rejects(acceptPairingOffer(link(answer)), codeIs('PAIR_EXPECTED_OFFER'));
  await assert.rejects(completePairing(pc, link(offer)), codeIs('PAIR_EXPECTED_ANSWER'));
  assert.equal(created, 0);
  assert.equal(pc.setRemoteDescription.mock.callCount(), 0);
});

test('pairing validation: empty, oversized and unsupported links do not touch WebRTC', async (t) => {
  let created = 0;
  stubPeerConnection(t, class {
    constructor() { created++; }
  });
  const pc = { setRemoteDescription: t.mock.fn() };
  for (const [input, code] of [
    ['', 'PAIR_EMPTY_LINK'], [' '.repeat(MAX_BYTES + 1), 'PAIR_LINK_TOO_LARGE'],
    [link({ ...offer, v: 2 }), 'PAIR_UNSUPPORTED_VERSION'],
  ]) {
    await assert.rejects(acceptPairingOffer(input), codeIs(code));
    await assert.rejects(completePairing(pc, input), codeIs(code));
  }
  assert.equal(created, 0);
  assert.equal(pc.setRemoteDescription.mock.callCount(), 0);
});

test('pairing validation: valid offer reaches WebRTC and preserves native failure', async (t) => {
  const failure = new Error('Synthetic SDP rejection');
  const applied = t.mock.fn(async () => { throw failure; });
  stubPeerConnection(t, class {
    addEventListener() {}
    setRemoteDescription = applied;
  });
  await assert.rejects(acceptPairingOffer(link(offer)), error => error === failure);
  assert.deepEqual(applied.mock.calls[0].arguments, [{ type: 'offer', sdp: offer.sdp }]);
});

test('pairing validation: valid answer preserves existing actpass normalization and native failure', async (t) => {
  const failure = new Error('Synthetic answer rejection');
  const pc = { setRemoteDescription: t.mock.fn(async () => { throw failure; }) };
  await assert.rejects(completePairing(pc, link({ ...offer, t: 'answer' })),
    error => error === failure);
  assert.deepEqual(pc.setRemoteDescription.mock.calls[0].arguments,
    [{ type: 'answer', sdp: answer.sdp }]);
});
