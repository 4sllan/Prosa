import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const previewURL = new URL(process.env.PREVIEW_URL || 'http://127.0.0.1:3100')
assert.ok(['127.0.0.1', 'localhost'].includes(previewURL.hostname))
const origin = previewURL.origin
const basePath = previewURL.pathname.replace(/\/?$/, '/')
const pagePath = path => `${basePath}${path.replace(/^\//, '')}`
const lowerTargets = '.landing-features [data-landing-reveal], .landing-cards [data-landing-reveal]'
const executable = process.env.CHROME_EXECUTABLE
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const directory = await mkdtemp(join(tmpdir(), 'prosa-hero-browser-'))
console.log(`Browser artifacts: ${directory}`)
const browser = spawn(executable, [
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update',
  '--disable-sync', '--disable-default-apps', '--remote-debugging-port=0',
  `--user-data-dir=${join(directory, 'profile')}`, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] })

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let socket
let sequence = 0
const pending = new Map()
const consoleErrors = []
const resourceFailures = []
let apiMode = 'success'
const assets = [
  { name: 'Prosa.dmg', browser_download_url: 'https://example.invalid/mac' },
  { name: 'Prosa.exe', browser_download_url: 'https://example.invalid/windows' },
  { name: 'Prosa.AppImage', browser_download_url: 'https://example.invalid/linux' }
]

function send(method, params = {}) {
  const id = ++sequence
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`CDP timeout: ${method}`))
    }, 15000)
    pending.set(id, {
      resolve: result => { clearTimeout(timer); resolve(result) },
      reject: error => { clearTimeout(timer); reject(error) }
    })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true
  })
  assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails))
  return result.result.value
}

async function waitFor(expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(expression)) return
    await pause(100)
  }
  throw new Error(`Condition not reached: ${expression}`)
}

async function navigate(path = '/') {
  await send('Page.navigate', { url: `${origin}${pagePath(path)}` })
  await waitFor('document.readyState === "complete" && !!document.querySelector("h1")')
  await evaluate('window.scrollTo(0, 0)')
  await pause(300)
}

async function tabTo(selector) {
  for (let attempt = 0; attempt < 30; attempt++) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    if (await evaluate(`document.activeElement.matches(${JSON.stringify(selector)})`)) return
  }
  assert.fail(`Tab could not reach ${selector}`)
}

async function heroSettled() {
  await waitFor(`(() => {
    const elements = [...document.querySelectorAll('.landing-hero [data-landing-reveal]')]
      .filter(el => el.getClientRects().length)
    return elements.length > 0 && elements.every(el =>
      getComputedStyle(el).opacity > 0
      && !el.getAnimations().some(animation => animation.playState === 'running'))
  })()`)
}

async function revealLowerPage(width) {
  const count = await evaluate(`document.querySelectorAll('${lowerTargets}').length`)
  assert.equal(count, 17, 'Twelve feature targets and five card-section targets')
  assert.ok(await evaluate(`document.querySelector('.technology-card:last-child').dataset.revealState === 'pending'`),
    'Below-fold cards wait for visibility')
  for (let index = 0; index < count; index++) {
    const target = `document.querySelectorAll('${lowerTargets}')[${index}]`
    await evaluate(`${target}.scrollIntoView({ block: 'center', behavior: 'instant' })`)
    await waitFor(`${target}.dataset.revealState === 'revealed'`)
    await waitFor(`!${target}.getAnimations().some(animation => animation.playState === 'running')`)
    assert.equal(await evaluate(`getComputedStyle(${target}).opacity`), '1')
    assert.equal(await evaluate(`getComputedStyle(${target}).transform`), 'none')
    assert.equal(await evaluate('document.documentElement.scrollWidth'), width)
    if (index === 14 && width < 768) {
      assert.ok(await evaluate(`(() => {
        const last = document.querySelector('.technology-card:last-child')
        return last.getBoundingClientRect().top <= innerHeight || last.dataset.revealState === 'pending'
      })()`), 'Offscreen mobile cards do not wait for or animate with the first card')
    }
  }
  const delays = await evaluate(`[...document.querySelectorAll('.technology-card')]
    .map(el => getComputedStyle(el).animationDelay)`)
  assert.deepEqual(delays, ['0s', '0.09s', '0.18s'])
  assert.ok(await evaluate(`[...document.querySelectorAll('.technology-card')].every(el =>
    el.tagName === 'ARTICLE' && !el.matches('a, button, [tabindex], [role], [onclick]')
    && !el.querySelector('a, button, [tabindex]') && getComputedStyle(el).cursor !== 'pointer')`))
  await evaluate(`window.__revealChanges = 0;
    window.__revealMutation = new MutationObserver(records => { window.__revealChanges += records.length });
    for (const el of document.querySelectorAll('${lowerTargets}')) {
      window.__revealMutation.observe(el, { attributes: true, attributeFilter: ['data-reveal-state'] })
    }
    window.scrollTo(0, 0)`)
  await pause(100)
  await evaluate(`window.scrollTo(0, document.documentElement.scrollHeight)`)
  await pause(100)
  assert.equal(await evaluate('window.__revealChanges'), 0, 'Scrolling back does not rearm entries')
  await evaluate('window.__revealMutation.disconnect()')
  assert.ok(await evaluate(`[...document.querySelectorAll('${lowerTargets}')].every(el =>
    el.dataset.revealState === 'revealed' && !el.getAnimations().some(animation => animation.playState === 'running'))`))
  assert.equal(await evaluate(`window.__revealObservers.reduce((sum, targets) =>
    sum + [...targets].filter(el => el.closest('.landing-features, .landing-cards')).length, 0)`), 0,
    'All lower-section targets are unobserved after revealing')
  console.log(`Scroll motion ${width}px: all 17 targets revealed once, independent cards, no overflow or interactive-card regression.`)
}

try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error('Chrome startup timeout')), 15000)
    browser.once('error', error => { clearTimeout(timer); reject(error) })
    browser.stderr.on('data', data => {
      output += data
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match) { clearTimeout(timer); resolve(match[1]) }
    })
  })
  const address = new URL(endpoint)
  const targets = await (await fetch(`http://${address.host}/json/list`)).json()
  const target = targets.find(item => item.type === 'page')
  assert.ok(target, 'Chrome page target available')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  socket.addEventListener('message', async ({ data }) => {
    const event = JSON.parse(data)
    if (event.id) {
      const request = pending.get(event.id)
      pending.delete(event.id)
      if (event.error) request?.reject(new Error(event.error.message))
      else request?.resolve(event.result)
    }
    if (event.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text)
    }
    if (event.method === 'Network.responseReceived'
      && event.params.response.status >= 400
      && ['Script', 'Stylesheet', 'Image', 'Font'].includes(event.params.type)) {
      resourceFailures.push(`${event.params.response.status}: ${event.params.response.url}`)
    }
    if (event.method === 'Runtime.consoleAPICalled'
      && ['error', 'warning'].includes(event.params.type)) {
      consoleErrors.push(event.params.args.map(arg => arg.value || arg.description).join(' '))
    }
    if (event.method === 'Fetch.requestPaused') {
      const { requestId, request } = event.params
      try {
        if (request.url === 'https://api.github.com/repos/4sllan/Prosa/releases/latest') {
          if (apiMode === 'failure') {
            await send('Fetch.failRequest', { requestId, errorReason: 'InternetDisconnected' })
          } else {
            await send('Fetch.fulfillRequest', {
              requestId, responseCode: 200,
              responseHeaders: [
                { name: 'Content-Type', value: 'application/json' },
                { name: 'Access-Control-Allow-Origin', value: '*' }
              ],
              body: Buffer.from(JSON.stringify({ assets: apiMode === 'empty' ? [] : assets })).toString('base64')
            })
          }
        } else if (request.url.startsWith(`${origin}/`)) {
          await send('Fetch.continueRequest', { requestId })
        } else {
          await send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' })
        }
      } catch (error) {
        consoleErrors.push(`Interception: ${error.message}`)
      }
    }
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  await send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const NativeObserver = window.IntersectionObserver
      window.__revealObservers = []
      window.IntersectionObserver = class extends NativeObserver {
        constructor(...args) {
          super(...args)
          this.targets = new Set()
          window.__revealObservers.push(this.targets)
        }
        observe(target) {
          if (target.matches('[data-landing-reveal]')) this.targets.add(target)
          return super.observe(target)
        }
        unobserve(target) { this.targets.delete(target); return super.unobserve(target) }
        disconnect() { this.targets.clear(); return super.disconnect() }
      }
    })()`
  })

  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false
  })
  await navigate()
  const motion = await evaluate(`(() => {
    const root = document.querySelector('.landing-hero')
    return [...root.querySelectorAll('[data-landing-reveal]')].map(el => {
      const style = getComputedStyle(el)
      return { state: el.dataset.revealState, duration: style.animationDuration,
        delay: style.animationDelay, name: style.animationName }
    })
  })()`)
  assert.equal(motion.length, 6)
  assert.ok(motion.every(el => el.state === 'revealed' && el.duration === '0.6s'))
  assert.deepEqual(motion.map(el => el.delay), ['0s', '0.06s', '0.12s', '0.18s', '0.24s', '0.24s'])
  await evaluate(`document.querySelector('.hero-download').focus()`)
  assert.equal(await evaluate(`document.querySelector('.hero-actions').dataset.revealState`), 'done')
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.hero-actions')).opacity`), '1')
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  })
  await waitFor(`[...document.querySelectorAll('[data-landing-reveal]')].every(el => el.dataset.revealState === 'done')`)
  assert.ok(await evaluate(`[...document.querySelectorAll('[data-landing-reveal]')].every(el =>
    getComputedStyle(el).animationName === 'none' && getComputedStyle(el).transform === 'none')`))
  await navigate()
  assert.ok(await evaluate(`[...document.querySelectorAll('[data-landing-reveal]')].every(el => !el.dataset.revealState)`))
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
  })
  console.log('Hero motion: sequence, focus during entry, reduced motion during entry and initial reduced preference passed.')

  const noObserver = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.IntersectionObserver = undefined'
  })
  const fallbackErrorStart = consoleErrors.length
  await navigate()
  await pause(1000)
  assert.equal(await evaluate('document.querySelectorAll("[data-landing-reveal]").length'), 23)
  assert.ok(await evaluate(`[...document.querySelectorAll('[data-landing-reveal]')].every(el =>
    !el.dataset.revealState && getComputedStyle(el).opacity > 0 && getComputedStyle(el).animationName === 'none')`))
  // NuxtLink's existing visibility-prefetch observer does not guard unsupported browsers.
  // Report only its constructor errors in this injected scenario, never in normal runs.
  const fallbackErrors = consoleErrors.splice(fallbackErrorStart)
  const prefetchErrors = fallbackErrors.filter(message =>
    /^TypeError: IntersectionObserver is not a constructor\n\s+at Object\.observe \(.*\/_nuxt\//.test(message))
  consoleErrors.push(...fallbackErrors.filter(message => !prefetchErrors.includes(message)))
  if (prefetchErrors.length) {
    console.log(`Unsupported-browser limitation: ${prefetchErrors.length} existing NuxtLink prefetch exceptions; hero fallback remains visible.`)
  }
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: noObserver.identifier })
  await send('Emulation.setScriptExecutionDisabled', { value: true })
  await navigate()
  assert.equal(await evaluate('document.querySelectorAll("[data-landing-reveal]").length'), 23)
  assert.ok(await evaluate(`[...document.querySelectorAll('[data-landing-reveal]')].every(el =>
    !el.dataset.revealState && getComputedStyle(el).opacity > 0)`))
  assert.equal(await evaluate(`document.querySelector('.hero-download').getAttribute('href')`), pagePath('/releases'))
  assert.ok(await evaluate(`!!document.querySelector('.hero-introduction[href="${pagePath('/introducao')}"]')`))
  await send('Emulation.setScriptExecutionDisabled', { value: false })
  console.log('Home fallback: all 23 reveal targets remain visible without observer or JavaScript; SSR links preserved.')

  await navigate()
  assert.ok(await evaluate('window.__revealObservers.some(targets => targets.size > 0)'))
  for (const path of ['/introducao', '/releases', '/']) {
    await evaluate(`document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$router.push('${path}')`)
    await waitFor(`location.pathname === '${pagePath(path)}'`)
    if (path === '/') {
      await waitFor(`document.querySelector('.hero-actions')?.dataset.revealState === 'revealed'`)
      await evaluate('window.scrollTo(0, 0)')
      await heroSettled()
      assert.ok(await evaluate(`document.querySelector('.technology-card:last-child').dataset.revealState === 'pending'`))
    } else {
      await waitFor(`!document.querySelector('.landing-hero')`)
      assert.equal(await evaluate(`document.querySelectorAll('[data-landing-reveal], [data-reveal-state]').length`), 0)
      assert.equal(await evaluate('window.__revealObservers.reduce((sum, targets) => sum + targets.size, 0)'), 0,
        'Leaving home clears pending observers from all three components')
    }
    assert.equal(await evaluate(`document.querySelectorAll('header [data-landing-reveal], footer [data-landing-reveal]').length`), 0)
  }
  console.log('Motion navigation: normal-motion remount works; internal pages, header and footer have no reveal targets.')

  for (const width of [360, 390, 768, 1024, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width, height: 1000, deviceScaleFactor: 1, mobile: false
    })
    await navigate()
    if ([390, 1024, 1440].includes(width)) {
      await evaluate(`[...document.querySelectorAll('.landing-hero [data-landing-reveal]')]
        .flatMap(el => el.getAnimations()).forEach(animation => { animation.pause(); animation.currentTime = 180 })`)
      const frame = await send('Page.captureScreenshot', { format: 'png' })
      await writeFile(join(directory, `hero-entry-${width}.png`), Buffer.from(frame.data, 'base64'))
      await evaluate(`[...document.querySelectorAll('.landing-hero [data-landing-reveal]')]
        .flatMap(el => el.getAnimations()).forEach(animation => animation.play())`)
    }
    await heroSettled()
    const layout = await evaluate(`(() => {
      const hero = document.querySelector('.landing-hero')
      const actions = [...hero.querySelectorAll('a')]
      return {
        width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        h1: document.querySelectorAll('h1').length,
        background: getComputedStyle(hero).backgroundColor,
        actions: actions.map(a => {
          const r = a.getBoundingClientRect()
          return { text: a.textContent.trim(), left: r.left, right: r.right, height: r.height }
        })
      }
    })()`)
    assert.equal(layout.scrollWidth, width, `No horizontal overflow at ${width}`)
    assert.equal(layout.h1, 1)
    assert.equal(layout.background, 'rgb(0, 0, 0)')
    assert.ok(layout.actions.every(a => a.left >= 0 && a.right <= width && a.height >= 30))
    const screenshot = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(directory, `hero-${width}.png`), Buffer.from(screenshot.data, 'base64'))
    console.log(`Layout ${width}px: no overflow; hero links visible; screenshot captured.`)
    await revealLowerPage(width)
    const features = await evaluate(`(() => {
      const root = document.querySelector('.landing-features')
      const bounds = root.getBoundingClientRect()
      return {
        top: bounds.top + scrollY, height: bounds.height,
        sections: root.querySelectorAll('section').length,
        headings: [...root.querySelectorAll('h2')].map(h => h.id),
        items: root.querySelectorAll('li').length,
        background: getComputedStyle(root).backgroundColor,
        artwork: [...root.querySelectorAll('.community-visual > svg, .workspace-visual > svg')].map(svg => {
          const box = svg.getBoundingClientRect()
          return {
            width: box.width, height: box.height, left: box.left, right: box.right,
            hidden: svg.getAttribute('aria-hidden'), focusable: svg.getAttribute('focusable')
          }
        })
      }
    })()`)
    assert.equal(features.sections, 2)
    assert.deepEqual(features.headings, ['releases-heading', 'updates-heading'])
    assert.equal(features.items, 5)
    assert.equal(features.background, 'rgb(0, 0, 0)')
    assert.equal(features.artwork.length, 2)
    assert.ok(features.artwork.every(svg =>
      svg.width > 0 && svg.height > 0 && svg.left >= 0 && svg.right <= width
      && svg.hidden === 'true' && svg.focusable === 'false'
    ))
    // Capture document clips from the top so the sticky header does not cover the section.
    await evaluate('window.scrollTo(0, 0)')
    const featureScreenshot = await send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: features.top, width, height: features.height, scale: 1 }
    })
    await writeFile(join(directory, `features-${width}.png`), Buffer.from(featureScreenshot.data, 'base64'))
    console.log(`Features ${width}px: two sections, five items, decorative SVGs in bounds; screenshot captured.`)
    await evaluate(`document.querySelector('.brand-link img').scrollIntoView()`)
    await waitFor(`document.querySelector('.brand-link img').complete && document.querySelector('.brand-link img').naturalWidth > 0`)
    const lowerPage = await evaluate(`(() => {
      const cards = document.querySelector('.landing-cards')
      const footer = document.querySelector('.landing-footer')
      const top = cards.getBoundingClientRect().top + scrollY
      return {
        top, height: footer.getBoundingClientRect().bottom + scrollY - top,
        cards: cards.querySelectorAll('article').length,
        background: [cards, footer].map(el => getComputedStyle(el).backgroundColor),
        footers: document.querySelectorAll('footer').length,
        oldCTA: document.body.textContent.includes('Pronto para se atualizar?'),
        logo: document.querySelector('.brand-link img').getAttribute('src'),
        links: [...footer.querySelectorAll('a')].map(a => a.getAttribute('href')),
        pending: [...footer.querySelectorAll('.footer-pending, .social-pending')].map(el => ({
          interactive: !!el.closest('a, button, [tabindex]'),
          announced: /em breve/i.test(el.textContent + el.getAttribute('aria-label'))
        }))
      }
    })()`)
    assert.equal(lowerPage.cards, 3)
    assert.equal(lowerPage.footers, 1)
    assert.equal(lowerPage.oldCTA, false)
    assert.deepEqual(lowerPage.background, ['rgb(0, 0, 0)', 'rgb(0, 0, 0)'])
    assert.equal(lowerPage.logo, pagePath('/logotipo-prosa.png'))
    assert.equal(lowerPage.pending.length, 8)
    assert.ok(lowerPage.pending.every(item => !item.interactive && item.announced))
    const destinations = new Set([
      ...['/', '/releases', '/download', '/introducao'].map(pagePath),
      'https://github.com/4sllan/Prosa', 'https://github.com/4sllan/Prosa/issues'
    ])
    assert.equal(lowerPage.links.length, 7)
    assert.ok(lowerPage.links.every(href => destinations.has(href)))
    await evaluate('window.scrollTo(0, 0)')
    const lowerScreenshot = await send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: lowerPage.top, width, height: lowerPage.height, scale: 1 }
    })
    await writeFile(join(directory, `cards-footer-${width}.png`), Buffer.from(lowerScreenshot.data, 'base64'))
    console.log(`Cards/footer ${width}px: three cards, one footer, logo loaded, seven valid links; placeholders non-interactive.`)
    assert.equal(await evaluate(`document.querySelector('link[rel="icon"]').getAttribute('href')`), pagePath('/favicon.ico'))
    if (width === 1440) {
      const height = await evaluate('document.documentElement.scrollHeight')
      const fullScreenshot = await send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height, scale: 1 }
      })
      await writeFile(join(directory, 'home-full-1440.png'), Buffer.from(fullScreenshot.data, 'base64'))
    }
  }

  await navigate()
  await evaluate('document.activeElement?.blur()')
  for (const selector of ['.version-badge', '.hero-download', '.hero-introduction']) {
    await tabTo(selector)
    assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle'), 'solid')
    assert.equal(await evaluate(`getComputedStyle(document.activeElement.closest('[data-landing-reveal]')).opacity`), '1')
  }
  console.log('Keyboard: badge, download and introduction reachable with visible focus.')
  const footerLinkCount = await evaluate(`document.querySelectorAll('.landing-footer a').length`)
  for (let index = 0; index < footerLinkCount; index++) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    assert.ok(await evaluate(`document.activeElement === document.querySelectorAll('.landing-footer a')[${index}]`))
    assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle'), 'solid')
  }
  console.log('Footer keyboard: all seven links reachable with visible focus; placeholders skipped.')

  await evaluate('document.activeElement?.blur(); window.scrollTo(0, 0)')
  const button = await evaluate(`(() => {
    const box = document.querySelector('.hero-download').getBoundingClientRect()
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  })()`)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...button })
  await pause(250)
  assert.ok(await evaluate(`(() => {
    const matrix = new DOMMatrix(getComputedStyle(document.querySelector('.hero-download')).transform)
    return matrix.m42 === -3
  })()`), 'Precise-pointer hover elevates CTA')
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...button, button: 'left', clickCount: 1 })
  await pause(250)
  assert.ok(await evaluate(`new DOMMatrix(getComputedStyle(document.querySelector('.hero-download')).transform).m11 < 1`))
  // Move outside before release so this feedback check never opens a download.
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1, y: 1, button: 'left', clickCount: 1 })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true })
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...button })
  await pause(250)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.hero-download')).transform`), 'none')
  await send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 })
  console.log('CTA feedback: precise hover, pressing and touch without hover elevation passed; no download opened.')

  await navigate()
  await evaluate(`document.querySelector('.technology-card').scrollIntoView({ block: 'center', behavior: 'instant' })`)
  await waitFor(`document.querySelector('.technology-card').dataset.revealState === 'revealed'`)
  await evaluate(`document.querySelector('.technology-card').getAnimations()
    .forEach(animation => { animation.pause(); animation.currentTime = 180 })`)
  const card = await evaluate(`(() => {
    const box = document.querySelector('.technology-card').getBoundingClientRect()
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  })()`)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...card })
  await pause(250)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.technology-card')).translate`), '0px -4px')
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.technology-card')).transform`), 'none',
    'Hover translation composes with, rather than overwrites, the entry transform')
  const cardEntry = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(directory, 'card-entry-hover.png'), Buffer.from(cardEntry.data, 'base64'))
  await evaluate(`document.querySelector('.technology-card').getAnimations().forEach(animation => animation.play())`)
  await waitFor(`!document.querySelector('.technology-card').getAnimations()
    .some(animation => animation.playState === 'running')`)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.technology-card')).transform`), 'none')
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.technology-card')).borderTopColor`), 'rgba(161, 44, 241, 0.376)')
  const cardHover = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(directory, 'card-hover.png'), Buffer.from(cardHover.data, 'base64'))
  await send('Emulation.setTouchEmulationEnabled', { enabled: true })
  await pause(250)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.technology-card')).translate`), 'none')
  const cardTouch = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(directory, 'card-touch.png'), Buffer.from(cardTouch.data, 'base64'))
  await send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 })
  console.log('Card feedback: hover elevation/border, independent entry transform and touch fallback passed.')

  await navigate()
  await evaluate(`document.querySelector('.community-visual').scrollIntoView({ block: 'center', behavior: 'instant' })`)
  await waitFor(`document.querySelector('.community-visual').dataset.revealState === 'revealed'`)
  await evaluate(`document.querySelector('.community-visual').getAnimations()
    .forEach(animation => { animation.pause(); animation.currentTime = 180 })`)
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  })
  await waitFor(`[...document.querySelectorAll('[data-landing-reveal]')].every(el => el.dataset.revealState === 'done')`)
  assert.ok(await evaluate(`[...document.querySelectorAll('[data-landing-reveal]')].every(el =>
    getComputedStyle(el).animationName === 'none' && getComputedStyle(el).transform === 'none')`))
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.hero-download')).transitionDuration`), '0s')
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.technology-card')).transitionDuration`), '0s')
  for (const width of [390, 1024, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width, height: 1000, deviceScaleFactor: 1, mobile: false
    })
    await navigate()
    assert.ok(await evaluate(`[...document.querySelectorAll('[data-landing-reveal]')]
      .filter(el => el.getClientRects().length).every(el =>
        getComputedStyle(el).opacity > 0 && getComputedStyle(el).animationName === 'none')`))
    const screenshot = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(directory, `hero-reduced-${width}.png`), Buffer.from(screenshot.data, 'base64'))
    const pageHeight = await evaluate('document.documentElement.scrollHeight')
    const reducedPage = await send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height: pageHeight, scale: 1 }
    })
    await writeFile(join(directory, `home-reduced-${width}.png`), Buffer.from(reducedPage.data, 'base64'))
  }
  console.log('Reduced motion: active illustration entry cancelled, all offscreen targets visible, CTA/card transitions disabled.')

  for (const theme of ['light', 'dark']) {
    await evaluate(`localStorage.setItem('nuxt-color-mode', '${theme}')`)
    await navigate()
    await waitFor(`document.documentElement.classList.contains('${theme}')`)
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.landing-hero')).backgroundColor`), 'rgb(0, 0, 0)')
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.landing-features')).backgroundColor`), 'rgb(0, 0, 0)')
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.landing-cards')).backgroundColor`), 'rgb(0, 0, 0)')
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.landing-footer')).backgroundColor`), 'rgb(0, 0, 0)')
    await evaluate(`document.querySelector('.hero-introduction').click()`)
    await waitFor(`location.pathname === '${pagePath('/introducao')}' && !!document.querySelector('header')`)
    assert.equal(await evaluate(`document.documentElement.classList.contains('${theme}')`), true)
    for (const path of ['/download', '/releases', '/']) {
      await evaluate(`window.__nuxtPage = document.querySelector('h1');`)
      // Nuxt's own router exercises client navigation, not full-page reloads.
      await evaluate(`document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$router.push('${path}')`)
      await waitFor(`location.pathname === '${pagePath(path)}' && document.querySelector('h1') !== window.__nuxtPage`)
      assert.equal(await evaluate(`document.documentElement.classList.contains('${theme}')`), true)
      assert.equal(await evaluate(`!!document.querySelector('header')`), true)
      assert.equal(await evaluate(`!!document.querySelector('.landing-footer')`), true)
      assert.equal(await evaluate(`!!document.querySelector('[data-landing-reveal]')`), path === '/')
      assert.equal(await evaluate(`document.querySelectorAll('footer').length`), 1)
    }
    console.log(`Theme ${theme}: hero stays dark; client navigation preserves docs chrome and preference.`)
  }

  for (const path of ['/introducao', '/download', '/releases', '/releases/v0-6-0']) {
    await navigate(path)
    await waitFor(`!!document.querySelector('header img') && [...document.querySelectorAll('header img')].every(img => img.complete && img.naturalWidth > 0)`)
    assert.equal(await evaluate(`document.querySelectorAll('footer').length`), 1)
    assert.equal(await evaluate(`!!document.querySelector('.landing-footer')`), true)
    console.log(`Deep link ${pagePath(path)}: docs chrome and header logos loaded.`)
  }
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', modifiers: 4 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', modifiers: 4 })
  await waitFor(`!!document.querySelector('[role="dialog"] input')`)
  await evaluate(`document.querySelector('[role="dialog"] input').focus()`)
  await send('Input.insertText', { text: 'v0.6.0' })
  await waitFor(`/v0\\.6\\.0/i.test(document.querySelector('[role="dialog"]').textContent)`)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
  console.log('Docs search: opens, accepts query and returns the existing v0.6.0 release.')

  for (const scenario of [
    { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', suffix: 'mac', label: 'macOS' },
    { ua: 'Mozilla/5.0 (Windows NT 10.0)', suffix: 'windows', label: 'Windows' },
    { ua: 'Mozilla/5.0 (X11; Linux x86_64)', suffix: 'linux', label: 'Linux' },
    { ua: 'Unknown', path: pagePath('/releases'), label: 'Ver releases' },
    { ua: 'Macintosh', mode: 'failure', path: 'https://github.com/4sllan/Prosa/releases/latest', label: 'macOS' },
    { ua: 'Windows NT', mode: 'empty', path: 'https://github.com/4sllan/Prosa/releases/latest', label: 'Windows' }
  ]) {
    apiMode = scenario.mode || 'success'
    await send('Network.setUserAgentOverride', { userAgent: scenario.ua })
    await navigate()
    const href = scenario.path || `https://example.invalid/${scenario.suffix}`
    await waitFor(`document.querySelector('.hero-download')?.getAttribute('href') === ${JSON.stringify(href)}`)
    assert.ok((await evaluate(`document.querySelector('.hero-download').textContent`)).includes(scenario.label))
  }
  console.log('Mounted download: 6 scenarios passed with intercepted API; no installer opened.')
  // The existing Iconify fallback is intentionally unavailable in this offline run.
  const offlineIconWarnings = consoleErrors.filter(message =>
    /^\[Icon\] failed to load icon `[a-z-]+:[a-z-]+`$/.test(message)
  )
  const unexpectedErrors = consoleErrors.filter(message => !offlineIconWarnings.includes(message))
  if (offlineIconWarnings.length) {
    console.log(`Offline limitation: ${offlineIconWarnings.length} existing Iconify load warnings (${new Set(offlineIconWarnings).size} unique icons).`)
  }
  assert.deepEqual(unexpectedErrors, [], 'No unexpected console warnings, hydration errors or uncaught exceptions')
  assert.deepEqual(resourceFailures, [], 'No broken local scripts, styles, images or fonts')
  console.log(`Browser checks passed. Screenshots: ${directory}`)
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) {
    const state = await evaluate(`({
      url: location.href,
      active: document.activeElement?.tagName,
      motion: [...document.querySelectorAll('[data-landing-reveal]')].map(el => ({
        state: el.dataset.revealState, opacity: getComputedStyle(el).opacity
      })),
      dialog: document.querySelector('[role="dialog"]')?.textContent,
      inputs: [...document.querySelectorAll('input')].map(el => ({ value: el.value, placeholder: el.placeholder }))
    })`).catch(() => null)
    await writeFile(join(directory, 'failure.json'), JSON.stringify({ state, consoleErrors, resourceFailures }, null, 2))
    console.error('Failure state:', JSON.stringify(state))
  }
  throw error
} finally {
  socket?.close()
  browser.kill('SIGTERM')
}
