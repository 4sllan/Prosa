import test from 'node:test';
import assert from 'node:assert/strict';
import { menuPosition } from '../src/services/context-menu.js';

test('menuPosition: keeps cursor position when menu fits', () => {
  const pos = menuPosition({ x: 100, y: 100, width: 160, height: 80, viewportW: 800, viewportH: 600 });
  assert.deepEqual(pos, { x: 100, y: 100 });
});

test('menuPosition: clamps overflow on the right and bottom edges', () => {
  const pos = menuPosition({ x: 700, y: 560, width: 160, height: 80, viewportW: 800, viewportH: 600 });
  assert.deepEqual(pos, { x: 632, y: 512 });
});

test('menuPosition: clamps coordinates below the margin', () => {
  const pos = menuPosition({ x: 2, y: 0, width: 160, height: 80, viewportW: 800, viewportH: 600 });
  assert.deepEqual(pos, { x: 8, y: 8 });
});

test('menuPosition: pins to margin when the menu is larger than the viewport', () => {
  const pos = menuPosition({ x: 400, y: 300, width: 900, height: 700, viewportW: 800, viewportH: 600 });
  assert.deepEqual(pos, { x: 8, y: 8 });
});

test('menuPosition: respects a custom margin', () => {
  const pos = menuPosition({ x: 790, y: 590, width: 160, height: 80, viewportW: 800, viewportH: 600, margin: 20 });
  assert.deepEqual(pos, { x: 620, y: 500 });
});
