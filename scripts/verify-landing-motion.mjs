import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

const source = await readFile(new URL('../app/composables/useLandingReveal.ts', import.meta.url), 'utf8')
const code = stripTypeScriptTypes(source.replace(/^import .*\n/gm, '').replace('export function', 'function'))

function mount({ reduced = false, noObserver = false, failure = false, focused = false } = {}) {
  let mounted
  let unmount
  let callback
  let focusListener
  let motionListener
  let disconnects = 0
  const observed = new Set()
  class Node {}
  const child = new Node()
  const elements = Array.from({ length: 3 }, (_, index) => ({
    dataset: {},
    contains: node => index === 2 && node === child
  }))
  const media = {
    matches: reduced,
    addEventListener: (_name, fn) => { motionListener = fn },
    removeEventListener: (_name, fn) => {
      if (motionListener === fn) motionListener = undefined
    }
  }
  const container = {
    querySelectorAll: () => elements,
    contains: node => node === child,
    addEventListener: (_name, fn) => { focusListener = fn },
    removeEventListener: (_name, fn) => {
      if (focusListener === fn) focusListener = undefined
    }
  }
  class Observer {
    constructor(fn) { callback = fn }
    observe(element) {
      if (failure && observed.size === 1) throw new Error('Simulated observe failure')
      observed.add(element)
    }
    unobserve(element) { observed.delete(element) }
    disconnect() { disconnects++; observed.clear() }
  }
  runInNewContext(`${code}\nuseLandingReveal({ value: container })`, {
    container, Node,
    document: { activeElement: focused ? child : null },
    window: { matchMedia: () => media },
    IntersectionObserver: noObserver ? undefined : Observer,
    onMounted: fn => { mounted = fn },
    onBeforeUnmount: fn => { unmount = fn }
  })
  assert.ok(elements.every(el => el.dataset.revealState === undefined), 'SSR remains visible')
  mounted()
  return {
    elements, observed, unmount,
    get listeners() { return Number(!!focusListener) + Number(!!motionListener) },
    get disconnects() { return disconnects },
    intersect(index) { callback([{ target: elements[index], isIntersecting: true }]) },
    focus() { focusListener({ target: child }) },
    reduce() { media.matches = true; motionListener() }
  }
}

const normal = mount()
assert.ok(normal.elements.every(el => el.dataset.revealState === 'pending'))
normal.intersect(0)
assert.equal(normal.elements[0].dataset.revealState, 'revealed')
assert.equal(normal.observed.size, 2)
normal.focus()
assert.equal(normal.elements[2].dataset.revealState, 'done', 'Focus bypasses pending entry')
normal.intersect(2)
assert.equal(normal.elements[2].dataset.revealState, 'done', 'Queued observation cannot reanimate focus')
normal.reduce()
assert.ok(normal.elements.every(el => el.dataset.revealState === 'done'))
assert.equal(normal.observed.size, 0)
normal.intersect(1)
assert.equal(normal.elements[1].dataset.revealState, 'done', 'Queued callbacks cannot restart reduced motion')
normal.unmount()
assert.equal(normal.listeners, 0)
assert.ok(normal.elements.every(el => el.dataset.revealState === undefined))

for (const options of [{ reduced: true }, { noObserver: true }, { failure: true }]) {
  const fallback = mount(options)
  assert.ok(fallback.elements.every(el => el.dataset.revealState === undefined))
  assert.equal(fallback.observed.size, 0)
  assert.equal(fallback.listeners, 0)
  fallback.unmount()
}
const focusAtMount = mount({ focused: true })
assert.equal(focusAtMount.elements[2].dataset.revealState, 'done')
focusAtMount.unmount()
const complete = mount()
for (let index = 0; index < 3; index++) complete.intersect(index)
assert.equal(complete.observed.size, 0)
assert.ok(complete.disconnects > 0)
complete.unmount()
const remount = mount()
assert.equal(remount.listeners, 2)
remount.unmount()
assert.equal(remount.listeners, 0)
console.log('Motion: SSR, reveal once, focus, reduced motion, unsupported observer, setup failure and cleanup passed.')
