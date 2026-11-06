<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'
import { findPageHeadline } from '@nuxt/content/utils'

definePageMeta({
  layout: 'docs'
})

const route = useRoute()
const { toc } = useAppConfig()
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')

const { data: page } = await useAsyncData(
  `docs-${route.path}`,
  () => queryCollection('docs').path(route.path).first()
)

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Página não encontrada', fatal: true })
}

const { data: surround } = await useAsyncData(
  `${route.path}-surround`,
  () => {
    return queryCollectionItemSurroundings(
      'docs',
      route.path,
      { fields: ['description'] }
    )
  }
)

useSeoMeta({
  title: `${page.value.title} — Prosa`,
  description: page.value.description
})

const headline = computed(() => findPageHeadline(navigation?.value, page.value?.path))

const links = computed(() => toc?.bottom?.links || [])
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

      <UContentSurround :surround="surround" />
    </UPageBody>

    <template
      v-if="page?.body?.toc?.links?.length"
      #right
    >
      <UContentToc
        title="Nesta página"
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
              :title="toc.bottom.title"
              :links="links"
            />
          </div>
        </template>
      </UContentToc>
    </template>
  </UPage>
</template>
