<script setup lang="ts">
const { seo } = useAppConfig()
const baseURL = useRuntimeConfig().app.baseURL
const route = useRoute()
const isLanding = computed(() => route.path === '/')

const { data: navigation } = await useAsyncData('navigation', async () => {
  const [docs, releases] = await Promise.all([
    queryCollectionNavigation('docs'),
    queryCollectionNavigation('releases')
  ])
  return [...docs, ...releases]
})
const { data: files } = useLazyAsyncData(
  'search', async () => {
    const [docs, releases] = await Promise.all([
      queryCollectionSearchSections('docs'),
      queryCollectionSearchSections('releases')
    ])
    return [...docs, ...releases]
  },
  { server: false }
)

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: `${baseURL}favicon.ico` }
  ],
  htmlAttrs: {
    lang: 'pt-BR'
  }
})

useSeoMeta({
  titleTemplate: `%s - ${seo?.siteName}`,
  ogSiteName: seo?.siteName,
  twitterCard: 'summary_large_image'
})

provide('navigation', navigation)
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />
    <NuxtRouteAnnouncer />

    <AppHeader v-if="!isLanding" />

    <UMain>
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </UMain>

    <LandingFooter v-if="isLanding" />
    <AppFooter v-else />

    <ClientOnly>
      <LazyUContentSearch
        :files="files"
        :navigation="navigation"
      />
    </ClientOnly>
  </UApp>
</template>
