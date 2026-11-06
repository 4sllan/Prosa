import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

async function scriptFor(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const script = source.match(/<script[^>]*setup[^>]*>([\s\S]*?)<\/script>/)?.[1]
  assert.ok(script, `Missing setup script in ${path}`)
  return stripTypeScriptTypes(script)
}

const logoScript = await scriptFor('../app/components/AppLogo.vue')
const footerScript = await scriptFor('../app/components/LandingFooter.vue')
const appScript = await scriptFor('../app/app.vue')

for (const baseURL of ['/', '/Prosa/']) {
  let head
  const globals = {
    useRuntimeConfig: () => ({ app: { baseURL } }),
    useAppConfig: () => ({
      header: { logo: { light: '/logotipo-prosa.png', dark: '/logotipo-prosa.png' } },
      footer: { credits: 'Test credits' },
      seo: { siteName: 'Prosa' }
    }),
    useRoute: () => ({ path: '/' }),
    computed: getter => ({ get value() { return getter() } }),
    useAsyncData: async (_key, query) => ({ data: { value: await query() } }),
    useLazyAsyncData: () => ({ data: { value: [] } }),
    queryCollectionNavigation: async () => [],
    useHead: value => { head = value },
    useSeoMeta: () => {},
    provide: () => {}
  }
  const logoUrl = runInNewContext(`${logoScript}\nlogoUrl`, globals)
  assert.equal(logoUrl('/logotipo-prosa.png'), `${baseURL}logotipo-prosa.png`)
  assert.equal(logoUrl('https://example.invalid/logo.png'), 'https://example.invalid/logo.png')
  assert.equal(logoUrl('//example.invalid/logo.png'), '//example.invalid/logo.png')
  assert.equal(logoUrl(undefined), undefined)
  const footerLogo = runInNewContext(`${footerScript}\nlogoSrc`, globals)
  assert.equal(footerLogo, `${baseURL}logotipo-prosa.png`)
  await runInNewContext(`(async () => {${appScript}})()`, globals)
  assert.equal(head.link.find(link => link.rel === 'icon').href, `${baseURL}favicon.ico`)
  console.log(`Assets ${baseURL}: header logo, footer logo and favicon paths passed.`)
}
