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
  `release-${route.path}`,
  () => queryCollection('releases').path(route.path).first()
)

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Release não encontrada', fatal: true })
}

const { data: surround } = await useAsyncData(
  `${route.path}-surround`,
  () => {
    return queryCollectionItemSurroundings(
      'releases',
      route.path,
      { fields: ['description'] }
    )
  }
)

useSeoMeta({
  title: `${page.value.title} — Prosa`,
  description: page.value.tag
    ? `Notas da versão ${page.value.tag} do Prosa.`
    : page.value.description
})

const headline = computed(() => findPageHeadline(navigation?.value, page.value?.path))

const links = computed(() => {
  const links = []

  if (toc?.bottom?.edit && page.value?.url) {
    links.push({
      icon: 'i-lucide-external-link',
      label: 'Editar no GitHub',
      to: page.value.url,
      target: '_blank'
    })
  }

  return [
    ...links,
    ...(toc?.bottom?.links || [])
  ].filter(Boolean)
})
</script>

<template>
  <UPage v-if="page">
    <UPageHeader
      :title="page.title"
      :description="page.date ? `Publicada em ${formatReleaseDate(page.date)}` : page.description"
      :headline="headline"
    >
      <template v-if="page.tag || page.url" #links>
        <UBadge v-if="page.tag" color="primary" variant="subtle" size="lg">
          {{ page.tag }}
        </UBadge>
        <UBadge v-if="page.prerelease" color="warning" variant="subtle" size="lg">
          Pré-release
        </UBadge>
        <UButton
          v-if="page.url"
          :to="page.url"
          target="_blank"
          variant="outline"
          color="neutral"
          trailing-icon="i-lucide-external-link"
        >
          Ver no GitHub
        </UButton>
      </template>
    </UPageHeader>

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
        :title="page.tag ? toc?.title : 'Nesta página'"
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
