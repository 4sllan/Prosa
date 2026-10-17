import test from 'node:test';
import assert from 'node:assert/strict';
import { createPairingFlow } from '../src/services/p2p/pairing-flow.js';
import { encodePairPayload } from '../src/services/p2p/pairing.js';

const link = t => 'prosa://pair/' + encodePairPayload({ v: 1, t, sdp: 'v=0\r\n' });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const resource = () => ({ closes: 0, close() { this.closes++; } });
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(overrides = {}) {
  const pc = resource(), dc = resource(), incoming = deferred();
  const calls = { offers: [], answers: [], complete: [], wires: [], copies: [], updates: [], unwired: 0 };
  const result = { pc, dc, link: link('offer'), timedOut: false };
  const flow = createPairingFlow({
    node: {},
    onChange: state => calls.updates.push(state),
    createOffer: async options => {
      calls.offers.push(options);
      return overrides.createOffer ? overrides.createOffer(options) : result;
    },
    acceptOffer: async (input, options) => {
      calls.answers.push({ input, options });
      return overrides.acceptOffer ? overrides.acceptOffer(input, options)
        : { pc, dcPromise: incoming.promise, link: link('answer') };
    },
    complete: async (...args) => {
      calls.complete.push(args);
      if (overrides.complete) await overrides.complete(...args);
    },
    clipboard: overrides.clipboard || (() => ({ writeText: async text => { calls.copies.push(text); } })),
    wire: (_node, _pc, _dc, handlers) => {
      calls.wires.push(handlers);
      return () => { calls.unwired++; };
    },
  });
  return { flow, pc, dc, incoming, calls, result };
}

test('flow: creates one offer and routes only answer to completion', async () => {
  const { flow, calls, pc } = fixture();
  await flow.createInvite();
  assert.equal(flow.state.step, 'awaiting-response');
  assert.equal(flow.state.linkType, 'offer');
  assert.equal(calls.wires[0].initiator, true);
  await flow.continueWithLink(link('answer'));
  assert.deepEqual(calls.complete, [[pc, link('answer')]]);
  assert.equal(calls.answers.length, 0);
  assert.equal(flow.state.step, 'connecting');
  await flow.continueWithLink(link('answer'));
  await flow.createInvite();
  assert.equal(calls.complete.length, 1);
  assert.equal(calls.offers.length, 1);
});

test('flow: received offer produces response and wires only as answerer', async () => {
  const { flow, calls, incoming, dc } = fixture();
  await flow.continueWithLink(link('offer'));
  assert.equal(flow.state.step, 'response-ready');
  assert.equal(flow.state.link, link('answer'));
  assert.equal(calls.offers.length, 0);
  assert.equal(calls.complete.length, 0);
  incoming.resolve(dc);
  await tick();
  assert.equal(calls.wires[0].initiator, false);
});

test('flow: response without local offer starts no WebRTC operation', async () => {
  const { flow, calls } = fixture();
  await flow.continueWithLink(link('answer'));
  assert.match(flow.state.error, /Crie um novo convite/);
  assert.equal(flow.state.step, 'idle');
  assert.equal(calls.offers.length + calls.answers.length + calls.complete.length, 0);
});

test('flow: invalid input or competing offer preserves pending invitation', async () => {
  const { flow, calls } = fixture();
  await flow.createInvite();
  for (const input of ['bad link', '', link('offer')]) {
    await flow.continueWithLink(input);
    assert.ok(flow.state.error);
    assert.equal(flow.state.link, link('offer'));
    assert.equal(flow.state.step, 'awaiting-response');
  }
  assert.equal(calls.offers.length, 1);
  assert.equal(calls.answers.length + calls.complete.length, 0);
});

test('flow: native completion failure preserves invitation and permits corrected reply', async () => {
  let fail = true;
  const { flow } = fixture({ complete: () => { if (fail) throw new Error('SDP failure'); } });
  await flow.createInvite();
  await flow.continueWithLink(link('answer'));
  assert.equal(flow.state.step, 'awaiting-response');
  assert.equal(flow.state.link, link('offer'));
  assert.match(flow.state.error, /aplicar esta resposta/);
  fail = false;
  await flow.continueWithLink(link('answer'));
  assert.equal(flow.state.error, '');
  assert.equal(flow.state.step, 'connecting');
});

test('flow: duplicate actions are ignored while generating an invitation', async () => {
  const generation = deferred();
  const { flow, calls, result } = fixture({ createOffer: () => generation.promise });
  const first = flow.createInvite();
  await flow.createInvite();
  await flow.continueWithLink(link('offer'));
  assert.equal(calls.offers.length, 1);
  assert.equal(calls.answers.length, 0);
  generation.resolve(result);
  await first;
});

for (const type of ['offer', 'answer']) {
  test(`flow: copies full ${type}, confirms only after write and ignores duplicate copy`, async () => {
    const writing = deferred();
    const copied = [];
    const { flow } = fixture({ clipboard: () => ({
      writeText: text => { copied.push(text); return writing.promise; },
    }) });
    if (type === 'offer') await flow.createInvite();
    else await flow.continueWithLink(link('offer'));
    const copying = flow.copyLink();
    await flow.copyLink();
    assert.equal(flow.state.copying, true);
    assert.equal(flow.state.notice, '');
    assert.deepEqual(copied, [link(type)]);
    writing.resolve();
    await copying;
    assert.equal(flow.state.copying, false);
    assert.match(flow.state.notice, /copiad/);
  });
}

for (const api of [undefined, {}, { writeText: async () => { throw new Error('Denied'); } }]) {
  test(`flow: missing or rejected clipboard preserves link and offers manual fallback (${typeof api?.writeText})`, async () => {
    const { flow, calls } = fixture({ clipboard: () => api });
    await flow.createInvite();
    await flow.copyLink();
    assert.equal(flow.state.link, link('offer'));
    assert.equal(flow.state.step, 'awaiting-response');
    assert.equal(flow.state.copyError, true);
    assert.match(flow.state.notice, /Ver link/);
    assert.equal(flow.state.copying, false);
    assert.equal(calls.offers.length, 1);
  });
}

test('flow: a stale clipboard completion cannot overwrite a restarted session', async () => {
  const writing = deferred();
  const { flow } = fixture({ clipboard: () => ({ writeText: () => writing.promise }) });
  await flow.createInvite();
  const copy = flow.copyLink();
  flow.restart();
  writing.resolve();
  await copy;
  assert.equal(flow.state.step, 'idle');
  assert.equal(flow.state.notice, '');
});

for (const action of ['restart', 'dispose']) {
  test(`flow: ${action} aborts generation and discards late offer without wiring`, async () => {
    const generation = deferred();
    const { flow, calls, result, pc, dc } = fixture({ createOffer: () => generation.promise });
    const creating = flow.createInvite();
    flow[action]();
    const updates = calls.updates.length;
    assert.equal(calls.offers[0].signal.aborted, true);
    generation.resolve(result);
    await creating;
    assert.equal(calls.wires.length, 0);
    assert.equal(pc.closes, 1);
    assert.equal(dc.closes, 1);
    assert.equal(calls.updates.length, updates);
  });
}

test('flow: restart while waiting for answer channel closes it when it arrives late', async () => {
  const { flow, pc, dc, incoming, calls } = fixture();
  await flow.continueWithLink(link('offer'));
  flow.restart();
  incoming.resolve(dc);
  await tick();
  assert.equal(pc.closes, 1);
  assert.equal(dc.closes, 1);
  assert.equal(calls.wires.length, 0);
  assert.equal(flow.state.step, 'idle');
});

test('flow: cancelled answer generation discards late PC and channel', async () => {
  const generation = deferred();
  const { flow, pc, dc, incoming, calls } = fixture({ acceptOffer: () => generation.promise });
  const answering = flow.continueWithLink(link('offer'));
  flow.restart();
  generation.resolve({ pc, dcPromise: incoming.promise, link: link('answer') });
  await answering;
  incoming.resolve(dc);
  await tick();
  assert.equal(pc.closes, 1);
  assert.equal(dc.closes, 1);
  assert.equal(calls.wires.length, 0);
});

test('flow: restart cancels pending handshake, closes resources and ignores old callbacks', async () => {
  const { flow, calls, pc, dc } = fixture();
  await flow.createInvite();
  const old = calls.wires[0];
  old.onStatus();
  flow.restart();
  old.onError(new Error('Late'), false);
  old.onRequest();
  assert.equal(flow.state.step, 'idle');
  assert.equal(flow.state.error, '');
  assert.equal(calls.unwired, 1);
  assert.equal(pc.closes, 1);
  assert.equal(dc.closes, 1);
});

for (const action of ['restart', 'dispose']) {
  test(`flow: ${action} never closes an attached peer`, async () => {
    const { flow, calls, pc, dc } = fixture();
    await flow.createInvite();
    calls.wires[0].onConnected('peer', true);
    assert.equal(flow.state.legacy, true);
    assert.equal(flow.state.link, '');
    flow[action]();
    assert.equal(pc.closes + dc.closes + calls.unwired, 0);
  });
}

test('flow: creation failure is recoverable by explicit restart', async () => {
  const { flow } = fixture({ createOffer: async () => { throw new Error('Native failure'); } });
  await flow.createInvite();
  assert.equal(flow.state.step, 'error');
  assert.match(flow.state.error, /criar o convite/);
  flow.restart();
  assert.equal(flow.state.step, 'idle');
  assert.equal(flow.state.error, '');
});

test('flow: no competing operations while answer is being generated', async () => {
  const generation = deferred();
  const { flow, pc, incoming, calls } = fixture({ acceptOffer: () => generation.promise });
  const first = flow.continueWithLink(link('offer'));
  await flow.continueWithLink(link('offer'));
  await flow.createInvite();
  assert.equal(calls.answers.length, 1);
  assert.equal(calls.offers.length, 0);
  generation.resolve({ pc, dcPromise: incoming.promise, link: link('answer') });
  await first;
  assert.equal(flow.state.step, 'response-ready');
});

test('flow: late completion failure cannot overwrite a new session', async () => {
  const completion = deferred();
  const { flow } = fixture({ complete: () => completion.promise });
  await flow.createInvite();
  const applying = flow.continueWithLink(link('answer'));
  flow.restart();
  await flow.createInvite();
  completion.reject(new Error('Old operation'));
  await applying;
  assert.equal(flow.state.step, 'awaiting-response');
  assert.equal(flow.state.error, '');
});

test('flow: failed request after attachment keeps connected state and peer resources', async () => {
  const { flow, calls, pc, dc } = fixture();
  await flow.createInvite();
  calls.wires[0].onConnected('peer', false);
  calls.wires[0].onError(new Error('Storage error'), true);
  assert.equal(flow.state.step, 'connected');
  assert.match(flow.state.error, /solicitacao falhou/);
  flow.dispose();
  assert.equal(pc.closes + dc.closes, 0);
});

for (const [state, message] of [
  ['removed', /contato foi removido/], ['blocked', /contato esta bloqueado/],
  ['incoming', /Recebidas/], ['outgoing', /Enviadas/], ['friend', /ja sao amigos/],
]) {
  test(`flow: explains existing ${state} relationship instead of implying a new request`, async () => {
    const { flow, calls } = fixture();
    await flow.createInvite();
    calls.wires[0].onConnected('peer', false);
    calls.wires[0].onRelationship(state);
    assert.equal(flow.state.step, 'connected');
    assert.match(flow.state.notice, message);
    assert.equal(calls.complete.length, 0);
  });
}
