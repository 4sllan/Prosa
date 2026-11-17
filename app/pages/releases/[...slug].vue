<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'
import { findPageHeadline } from '@nuxt/content/utils'

definePageMeta({
  layout: 'docs'
})

const route = useRoute()
const { t, localeProperties } = useI18n()
const localePath = useLocalePath()
const { toc } = useAppConfig()
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')

const contentPath = `/releases/${Array.isArray(route.params.slug) ? route.params.slug.join('/') : route.params.slug}`

const { data: page } = await useAsyncData(
  `release-${route.path}`,
  () => queryCollection('releases').path(contentPath).first()
)

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: t('releases.notFound'), fatal: true })
}

const { data: surround } = await useAsyncData(
  `${route.path}-surround`,
  () => {
    return queryCollectionItemSurroundings(
      'releases',
      contentPath,
      { fields: ['description'] }
    )
  }
)

useSeoMeta({
  title: `${page.value.title} — Prosa`,
  description: page.value.tag
    ? t('releases.seoNotes', { tag: page.value.tag })
    : page.value.description
})

const localizedSurround = computed(() =>
  surround.value?.map(item => item && { ...item, path: localePath(item.path) })
)

const headline = computed(() =>
  findPageHeadline(navigation?.value, localePath(page.value?.path ?? '')))

const links = computed(() => {
  const links = []

  if (toc?.bottom?.edit && page.value?.url) {
    links.push({
      icon: 'i-lucide-external-link',
      label: t('releases.editOnGithub'),
      to: page.value.url,
      target: '_blank'
    })
  }

  return [
    ...links,
    ...(toc?.bottom?.links || []).map(link => ({ ...link, label: t(link.label) }))
  ].filter(Boolean)
})
</script>

<template>
  <UPage v-if="page">
    <UPageHeader
      :title="page.title"
      :description="page.date ? t('releases.publishedAt', { date: formatReleaseDate(page.date, localeProperties.language) }) : page.description"
      :headline="headline"
    >
      <template v-if="page.tag || page.url" #links>
        <UBadge v-if="page.tag" color="primary" variant="subtle" size="lg">
          {{ page.tag }}
        </UBadge>
        <UBadge v-if="page.prerelease" color="warning" variant="subtle" size="lg">
          {{ t('releases.prerelease') }}
        </UBadge>
        <UButton
          v-if="page.url"
          :to="page.url"
          target="_blank"
          variant="outline"
          color="neutral"
          trailing-icon="i-lucide-external-link"
        >
          {{ t('releases.viewOnGithub') }}
        </UButton>
      </template>
    </UPageHeader>

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
        :title="t(page.tag ? (toc?.title ?? 'releases.inThisVersion') : 'docs.onThisPage')"
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
