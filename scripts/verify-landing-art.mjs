import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileTemplate } from 'vue/compiler-sfc'

const ids = new Set()
const references = []
for (const name of ['LandingFeatures', 'LandingCommunityArt', 'LandingWorkspaceArt', 'LandingCards']) {
  const url = new URL(`../app/components/content/${name}.vue`, import.meta.url)
  const source = await readFile(url, 'utf8')
  const { descriptor, errors } = parse(source, { filename: url.pathname })
  assert.deepEqual(errors, [], `${name}: SFC parsing`)
  const template = compileTemplate({
    source: descriptor.template.content, filename: url.pathname, id: name
  })
  assert.deepEqual(template.errors, [], `${name}: template compilation`)
  assert.ok(!descriptor.script && !descriptor.scriptSetup, `${name}: static presentation`)
  const markup = source.replaceAll('http://www.w3.org/2000/svg', '')
  assert.ok(!/https?:\/\/|<script\b|<foreignObject|<image\b/i.test(markup), `${name}: local-only artwork`)
  for (const [, id] of source.matchAll(/\bid="([^"]+)"/g)) {
    assert.ok(!ids.has(id), `Duplicate SVG or heading ID: ${id}`)
    ids.add(id)
  }
  for (const [, reference] of source.matchAll(/(?:href="#|url\(#)([a-z0-9-]+)/g)) {
    references.push(reference)
  }
  if (name.endsWith('Art')) {
    assert.ok(/aria-hidden="true"/.test(source), `${name}: decorative image`)
    assert.ok(/focusable="false"/.test(source), `${name}: non-focusable SVG`)
  }
  assert.ok(source.endsWith('\n') && source.split('\n').every(line => line === line.trimEnd()))
  console.log(`${name}: Vue template, local-only markup and whitespace OK.`)
}
for (const reference of references) {
  assert.ok(ids.has(reference), `Missing local SVG definition: ${reference}`)
}
console.log(`${ids.size} unique IDs; ${references.length} local SVG references resolved.`)
