<script setup lang="ts">
import type { Collections, ContentNavigationItem } from '@nuxt/content'
import { findPageHeadline } from '@nuxt/content/utils'

definePageMeta({
  layout: 'docs'
})

const route = useRoute()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { toc } = useAppConfig()
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')

const contentPath = `/${Array.isArray(route.params.slug) ? route.params.slug.join('/') : route.params.slug}`
const docsCollection = computed(() => `docs_${locale.value}` as keyof Collections)

const { data: page } = await useAsyncData(
  `docs-${route.path}`,
  async () => {
    const content = await queryCollection(docsCollection.value).path(contentPath).first()
    if (!content && locale.value !== 'pt') {
      return await queryCollection('docs_pt').path(contentPath).first()
    }
    return content
  },
  { watch: [locale] }
)

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: t('docs.notFound'), fatal: true })
}

const { data: surround } = await useAsyncData(
  `${route.path}-surround`,
  () => {
    return queryCollectionItemSurroundings(
      docsCollection.value,
      contentPath,
      { fields: ['description'] }
    )
  },
  { watch: [locale] }
)

const localizedSurround = computed(() =>
  surround.value?.map(item => item && { ...item, path: localePath(item.path) })
)

useSeoMeta({
  title: `${page.value.title} — Prosa`,
  description: page.value.description
})

const headline = computed(() =>
  findPageHeadline(navigation?.value, localePath(page.value?.path ?? '')))

const links = computed(() =>
  (toc?.bottom?.links || []).map(link => ({ ...link, label: t(link.label) })))
</script>

<template>
  <UPage v-if="page">
    <UPageHeader
      :title="page.title"
      :description="page.description"
      :headline="headline"
    />

    <UPageBody>
      <ContentRenderer :value="page" />

      <USeparator v-if="surround?.length" />

      <UContentSurround :surround="localizedSurround" />
    </UPageBody>

    <template
      v-if="page?.body?.toc?.links?.length"
      #right
    >
      <UContentToc
        :title="t('docs.onThisPage')"
        :links="page.body?.toc?.links"
      >
        <template
          v-if="toc?.bottom"
          #bottom
        >
          <div
            class="hidden lg:block space-y-6"
            :class="{ '!mt-6': page.body?.toc?.links?.length }"
          >
            <USeparator
              v-if="page.body?.toc?.links?.length"
              type="dashed"
            />

            <UPageLinks
              :title="t(toc.bottom.title)"
              :links="links"
            />
          </div>
        </template>
      </UContentToc>
    </template>
  </UPage>
</template>
