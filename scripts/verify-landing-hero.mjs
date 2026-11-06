import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

// Exercise the actual setup scripts without a browser, network or content writes.
async function setupScript(path, globals, result) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1]
  assert.ok(script, `Missing setup script: ${path}`)
  const code = stripTypeScriptTypes(script)
  return runInNewContext(`(async () => {${code}\nreturn ${result}})()`, globals)
}

const computed = getter => ({ get value() { return getter() } })
const ref = value => ({ value })
const heroPath = '../app/components/content/LandingHero.vue'
const downloadPath = '../app/components/content/DownloadButton.vue'

async function selectRelease(records) {
  const globals = {
    computed,
    useAsyncData: async (_key, query) => ({ data: ref(await query()) }),
    queryCollection: (collection) => {
      assert.equal(collection, 'releases')
      return {
        order: (field, direction) => {
          assert.equal(field, 'date')
          assert.equal(direction, 'DESC')
          return {
            all: async () => [...records].sort((a, b) =>
              String(b.date ?? '').localeCompare(String(a.date ?? ''))
            )
          }
        }
      }
    }
  }
  return setupScript(heroPath, globals, 'latestRelease.value')
}

const stable = { tag: 'v0.6.0', date: '2026-11-03', prerelease: false }
const newerStable = { tag: 'v0.7.0', date: '2026-11-04', prerelease: false }
const prerelease = { tag: 'v2.0.0-beta', date: '2026-11-05', prerelease: true }
const invalidRecords = [
  { tag: 'invalid-date', date: 'not-a-date' },
  { tag: 'missing-date' },
  { date: '2026-11-06' },
  { tag: '  ', date: '2026-11-06' }
]

assert.equal((await selectRelease([stable, newerStable, prerelease])).tag, 'v0.7.0')
assert.equal((await selectRelease([...invalidRecords, stable])).tag, 'v0.6.0')
assert.equal(await selectRelease([...invalidRecords, prerelease]), undefined)
assert.equal(await selectRelease([]), undefined)
assert.equal(
  (await selectRelease([{ tag: 'v1', date: '2026-11-01' }])).tag,
  'v1'
)
console.log('Release selection: 5 scenarios passed.')

const assets = [
  { name: 'Prosa.dmg', browser_download_url: 'https://example.invalid/mac' },
  { name: 'Prosa.exe', browser_download_url: 'https://example.invalid/windows' },
  { name: 'Prosa.AppImage', browser_download_url: 'https://example.invalid/linux' }
]
const scenarios = [
  { ua: 'Macintosh; Intel Mac OS X', label: 'Baixar para macOS', url: assets[0].browser_download_url },
  { ua: 'Windows NT 10.0', label: 'Baixar para Windows', url: assets[1].browser_download_url },
  { ua: 'X11; Linux x86_64', label: 'Baixar para Linux', url: assets[2].browser_download_url },
  { ua: 'Unknown', label: 'Ver releases', url: '/releases', calls: 0 },
  { ua: 'Android; Linux', label: 'Ver releases', url: '/releases', calls: 0 },
  { ua: 'iPhone; CPU iPhone OS', label: 'Ver releases', url: '/releases', calls: 0 },
  {
    ua: 'Macintosh', fail: true, label: 'Baixar para macOS',
    url: 'https://github.com/4sllan/Prosa/releases/latest'
  },
  {
    ua: 'Windows NT', empty: true, label: 'Baixar para Windows',
    url: 'https://github.com/4sllan/Prosa/releases/latest'
  },
  {
    ua: 'Unknown', platform: 'macOS', label: 'Baixar para macOS',
    url: assets[0].browser_download_url
  }
]

for (const scenario of scenarios) {
  let mounted
  let calls = 0
  const globals = {
    ref,
    computed,
    navigator: {
      userAgent: scenario.ua,
      userAgentData: scenario.platform ? { platform: scenario.platform } : undefined
    },
    onMounted: callback => { mounted = callback },
    $fetch: async (url) => {
      calls++
      assert.equal(url, 'https://api.github.com/repos/4sllan/Prosa/releases/latest')
      if (scenario.fail) throw new Error('Simulated offline')
      return { assets: scenario.empty ? [] : assets }
    }
  }
  const state = await setupScript(downloadPath, globals, '{ label, to, external }')
  assert.equal(state.label.value, 'Ver releases', 'SSR label')
  assert.equal(state.to.value, '/releases', 'SSR fallback')
  assert.equal(calls, 0, 'No request before mount')
  await mounted()
  assert.equal(state.label.value, scenario.label, scenario.ua)
  assert.equal(state.to.value, scenario.url, scenario.ua)
  assert.equal(state.external.value, scenario.url.startsWith('http'))
  assert.equal(calls, scenario.calls ?? 1)
}
console.log('Download: 9 simulated scenarios passed; no real network requests.')
