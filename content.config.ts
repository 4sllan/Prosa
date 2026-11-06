import { defineCollection, defineContentConfig, z } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    landing: defineCollection({
      type: 'page',
      source: 'index.md'
    }),
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
