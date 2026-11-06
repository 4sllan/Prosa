<script setup lang="ts">
definePageMeta({
  layout: 'docs'
})

const { data: pages } = await useAsyncData('releases-list', () =>
  queryCollection('releases').order('date', 'DESC').all()
)

const releases = computed(() => pages.value?.filter(page => page.tag))

useSeoMeta({
  title: 'Releases — Prosa',
  description: 'Histórico de versões do Prosa.'
})
</script>

<template>
  <UPage>
    <UPageHeader
      title="Releases"
      description="Histórico de versões do Prosa."
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
                    Pré-release
                  </UBadge>
                </div>
                <NuxtLink
                  :to="release.path"
                  class="text-lg font-semibold text-highlighted hover:underline"
                >
                  {{ release.title }}
                </NuxtLink>
                <p class="text-sm text-muted">
                  {{ formatReleaseDate(release.date) }}
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
          Nenhuma release publicada ainda.
        </p>
      </div>
    </UPageBody>
  </UPage>
</template>
