import { defineCollection, defineContentConfig, z } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    releases: defineCollection({
      type: 'page',
      source: 'releases/**',
      schema: z.object({
        tag: z.string(),
        title: z.string(),
        date: z.date(),
        prerelease: z.boolean(),
        url: z.string().url()
      })
    })
  }
})
