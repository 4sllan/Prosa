import { defineCollection, defineContentConfig, z } from '@nuxt/content'

const locales = ['pt', 'en', 'es'] as const

export default defineContentConfig({
  collections: {
    ...Object.fromEntries(
      locales.flatMap(locale => [
        [`landing_${locale}`, defineCollection({
          type: 'page',
          source: { include: `${locale}/**/index.md`, prefix: '' }
        })],
        [`docs_${locale}`, defineCollection({
          type: 'page',
          source: { include: `${locale}/**`, exclude: [`${locale}/index.md`], prefix: '' }
        })]
      ])
    ),
    releases: defineCollection({
      type: 'page',
      source: 'releases/**',
      schema: z.object({
        tag: z.string().optional(),
        title: z.string(),
        date: z.date().optional(),
        prerelease: z.boolean().optional(),
        url: z.string().url().optional()
      })
    })
  }
})
