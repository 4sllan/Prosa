<script setup lang="ts">
import type { Collections } from '@nuxt/content'
import { en as uiEn, es as uiEs, pt_br as uiPtBr } from '@nuxt/ui/locale'

const { seo } = useAppConfig()
const baseURL = useRuntimeConfig().app.baseURL
const route = useRoute()
const { locale } = useI18n()
const localePath = useLocalePath()
const isLanding = computed(() => route.path === '/')

const uiLocales = { pt: uiPtBr, en: uiEn, es: uiEs }
const uiLocale = computed(() => uiLocales[locale.value as keyof typeof uiLocales] ?? uiPtBr)

function localizePath(value?: string) {
  if (!value?.startsWith('/')) return value
  const [path, hash] = value.split('#')
  return localePath(path) + (hash ? `#${hash}` : '')
}

function localizeItems<T extends { path?: string; id?: string; children?: T[] }>(items?: T[] | null) {
  return items?.map(item => ({
    ...item,
    path: localizePath(item.path) ?? item.path,
    id: localizePath(item.id) ?? item.id,
    children: item.children ? localizeItems(item.children) : item.children
  }))
}

const { data: navigation } = await useAsyncData(
  `navigation-${locale.value}`,
  async () => {
    const [docs, releases] = await Promise.all([
      queryCollectionNavigation(`docs_${locale.value}` as keyof Collections),
      queryCollectionNavigation('releases')
    ])
    return localizeItems([...docs, ...releases])
  },
  { watch: [locale] }
)
const { data: files } = await useLazyAsyncData(
  `search-${locale.value}`,
  async () => {
    const [docs, releases] = await Promise.all([
      queryCollectionSearchSections(`docs_${locale.value}` as keyof Collections),
      queryCollectionSearchSections('releases')
    ])
    return localizeItems([...docs, ...releases])
  },
  { server: false, watch: [locale] }
)

const head = useLocaleHead({ dir: true, lang: true, seo: true })
useHead(() => ({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ...(head.value.meta ?? [])
  ],
  link: [
    { rel: 'icon', href: `${baseURL}favicon.ico` },
    ...(head.value.link ?? [])
  ],
  htmlAttrs: { ...(head.value.htmlAttrs ?? {}) }
}))

useSeoMeta({
  titleTemplate: `%s - ${seo?.siteName}`,
  ogSiteName: seo?.siteName,
  twitterCard: 'summary_large_image'
})

provide('navigation', navigation)
</script>

<template>
  <UApp :locale="uiLocale">
    <NuxtLoadingIndicator />
    <NuxtRouteAnnouncer />

    <AppHeader
      :show-search="!isLanding"
      :class="{ 'landing-header': isLanding }"
    />

    <UMain>
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </UMain>

    <LandingFooter />

    <ClientOnly>
      <LazyUContentSearch
        :files="files"
        :navigation="navigation"
      />
    </ClientOnly>
  </UApp>
</template>

<style scoped>
.landing-header {
  --ui-text: #e8dfef;
  --ui-text-highlighted: #f5f3f7;
  --ui-bg-elevated: #271137;
  border-bottom-color: #a12cf126;
  background:
    radial-gradient(ellipse at 32% 0, #271137b3, transparent 65%),
    #09090bf2;
  backdrop-filter: blur(16px);
}
</style>
