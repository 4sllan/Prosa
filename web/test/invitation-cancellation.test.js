import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvitationCancellation } from '../src/services/invitation-cancellation.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('cancellation: waits for provider removal before reloading and confirming', async () => {
  const removal = deferred(), reloading = deferred();
  const calls = [];
  const action = createInvitationCancellation({
    remove: userId => { calls.push(['remove', userId]); return removal.promise; },
    reload: () => { calls.push(['reload']); return reloading.promise; },
  });
  const result = action.cancel('peer');
  assert.deepEqual(calls, [['remove', 'peer']]);
  assert.deepEqual(action.state.pendingIds, ['peer']);
  assert.equal(action.state.notice, '');
  assert.equal(await action.cancel('peer'), false);
  removal.resolve();
  await Promise.resolve();
  assert.deepEqual(calls, [['remove', 'peer'], ['reload']]);
  assert.equal(action.state.notice, '');
  reloading.resolve();
  assert.equal(await result, true);
  assert.deepEqual(action.state.pendingIds, []);
  assert.equal(action.state.notice, 'Convite cancelado.');
});

test('cancellation: tracks different contacts independently', async () => {
  const first = deferred(), second = deferred();
  const action = createInvitationCancellation({
    remove: id => id === 'first' ? first.promise : second.promise,
    reload: async () => {},
  });
  const a = action.cancel('first'), b = action.cancel('second');
  assert.deepEqual(action.state.pendingIds, ['first', 'second']);
  first.resolve();
  await a;
  assert.deepEqual(action.state.pendingIds, ['second']);
  second.resolve();
  await b;
  assert.deepEqual(action.state.pendingIds, []);
});

test('cancellation: removal error does not reload or pretend success and permits retry', async () => {
  let fail = true, reloads = 0;
  const action = createInvitationCancellation({
    remove: async () => { if (fail) throw new Error('Synthetic error'); },
    reload: async () => { reloads++; },
  });
  assert.equal(await action.cancel('peer'), false);
  assert.equal(reloads, 0);
  assert.equal(action.state.notice, '');
  assert.equal(action.state.needsReload, false);
  assert.match(action.state.error, /cancelar o convite/);
  assert.deepEqual(action.state.pendingIds, []);
  fail = false;
  assert.equal(await action.cancel('peer'), true);
  assert.equal(reloads, 1);
  assert.equal(action.state.error, '');
});

test('cancellation: reload failure distinguishes committed removal and prevents another delete', async () => {
  let removes = 0, fail = true;
  const action = createInvitationCancellation({
    remove: async () => { removes++; },
    reload: async () => { if (fail) throw new Error('Synthetic reload failure'); },
  });
  assert.equal(await action.cancel('peer'), false);
  assert.equal(removes, 1);
  assert.equal(action.state.needsReload, true);
  assert.match(action.state.error, /Convite cancelado, mas/);
  assert.equal(await action.cancel('peer'), false);
  assert.equal(removes, 1);
  assert.equal(await action.refresh(), false);
  assert.equal(action.state.needsReload, true);
  fail = false;
  assert.equal(await action.refresh(), true);
  assert.equal(action.state.needsReload, false);
  assert.equal(action.state.notice, 'Lista atualizada.');
  assert.equal(removes, 1);
});

test('cancellation: duplicate reload recovery is ignored while pending', async () => {
  let first = true;
  const reloading = deferred();
  const action = createInvitationCancellation({
    remove: async () => {},
    reload: () => { if (first) { first = false; throw new Error('Reload failed'); } return reloading.promise; },
  });
  await action.cancel('peer');
  const refresh = action.refresh();
  assert.equal(action.state.refreshing, true);
  assert.equal(await action.refresh(), false);
  reloading.resolve();
  await refresh;
  assert.equal(action.state.refreshing, false);
});

test('cancellation: dispose suppresses UI changes but still reloads after committed removal', async () => {
  const removal = deferred(), updates = [];
  let reloads = 0;
  const action = createInvitationCancellation({
    remove: () => removal.promise,
    reload: async () => { reloads++; },
    onChange: state => updates.push(state),
  });
  const cancelling = action.cancel('peer');
  action.dispose();
  const count = updates.length;
  removal.resolve();
  await cancelling;
  assert.equal(reloads, 1);
  assert.equal(updates.length, count);
  assert.equal(await action.cancel('other'), false);
});

test('cancellation: P2P success message can explicitly avoid remote delivery confirmation', async () => {
  const action = createInvitationCancellation({
    remove: async () => {}, reload: async () => {},
    successMessage: 'Cancelado localmente; entrega remota nao confirmada.',
  });
  await action.cancel('peer');
  assert.equal(action.state.notice, 'Cancelado localmente; entrega remota nao confirmada.');
});
