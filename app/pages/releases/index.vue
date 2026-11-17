<script setup lang="ts">
definePageMeta({
  layout: 'docs'
})

const { t, localeProperties } = useI18n()

const { data: pages } = await useAsyncData('releases-list', () =>
  queryCollection('releases').order('date', 'DESC').all()
)

const releases = computed(() => pages.value?.filter(page => page.tag))

useSeoMeta({
  title: `${t('releases.pageTitle')} — Prosa`,
  description: t('releases.pageDescription')
})
</script>

<template>
  <UPage>
    <UPageHeader
      :title="t('releases.pageTitle')"
      :description="t('releases.pageDescription')"
    />

    <UPageBody>
      <ul v-if="releases?.length" class="space-y-4">
        <li v-for="release in releases" :key="release.tag">
          <UCard>
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge color="primary" variant="subtle">
                    {{ release.tag }}
                  </UBadge>
                  <UBadge v-if="release.prerelease" color="warning" variant="subtle">
                    {{ t('releases.prerelease') }}
                  </UBadge>
                </div>
                <NuxtLinkLocale
                  :to="release.path"
                  class="text-lg font-semibold text-highlighted hover:underline"
                >
                  {{ release.title }}
                </NuxtLinkLocale>
                <p class="text-sm text-muted">
                  {{ formatReleaseDate(release.date, localeProperties.language) }}
                </p>
              </div>
              <UButton
                :to="release.url"
                target="_blank"
                variant="ghost"
                color="neutral"
                trailing-icon="i-lucide-external-link"
              >
                GitHub
              </UButton>
            </div>
          </UCard>
        </li>
      </ul>

      <div v-else class="flex flex-col items-center gap-3 py-16 text-center">
        <UIcon name="i-lucide-package-open" class="size-12 text-muted" />
        <p class="text-muted">
          {{ t('releases.empty') }}
        </p>
      </div>
    </UPageBody>
  </UPage>
</template>
