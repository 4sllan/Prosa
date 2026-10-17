import test from 'node:test';
import assert from 'node:assert/strict';
import { messageTime } from '../src/services/datetime.js';

test('messageTime: formata epoch ms como dd/mm hh:mm', () => {
  const out = messageTime(Date.UTC(2026, 9, 17, 15, 30));
  assert.match(out, /\d{2}\/\d{2},? \d{2}:\d{2}/);
});

test('messageTime: aceita string ISO', () => {
  assert.match(messageTime('2026-10-17T15:30:00Z'), /\d{2}:\d{2}/);
});

test('messageTime: aceita Date', () => {
  assert.match(messageTime(new Date(2026, 0, 5, 8, 5)), /\d{2}\/\d{2}/);
});

test('messageTime: retorna vazio para valores ausentes', () => {
  assert.equal(messageTime(undefined), '');
  assert.equal(messageTime(null), '');
  assert.equal(messageTime(''), '');
});

test('messageTime: retorna vazio para valores inválidos (nunca "Invalid Date")', () => {
  for (const bad of ['abc', NaN, {}, '2026-13-99']) {
    const out = messageTime(bad);
    assert.equal(out, '');
    assert.ok(!out.includes('Invalid'));
  }
});
