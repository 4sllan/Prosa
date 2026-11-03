<script setup lang="ts">
const { data: releases } = await useAsyncData('home-releases', () =>
  queryCollection('releases').order('date', 'DESC').all()
)

const latest = computed(() =>
  releases.value?.find(release => !release.prerelease) ?? releases.value?.[0]
)

useSeoMeta({
  title: 'Prosa',
  description: 'Novidades e downloads da versão mais recente do Prosa.'
})
</script>

<template>
  <UContainer class="py-12 sm:py-20">
    <div v-if="latest" class="space-y-8">
      <div class="space-y-4">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge color="primary" variant="subtle" size="lg">
            {{ latest.tag }}
          </UBadge>
          <UBadge v-if="latest.prerelease" color="warning" variant="subtle" size="lg">
            Pré-release
          </UBadge>
        </div>
        <h1 class="text-3xl sm:text-4xl font-bold text-highlighted">
          {{ latest.title }}
        </h1>
        <p class="text-muted">
          Publicada em {{ formatReleaseDate(latest.date) }}
        </p>
      </div>

      <UCard>
        <ContentRenderer :value="latest" class="prose" />
      </UCard>

      <div class="flex flex-wrap gap-3">
        <UButton :to="latest.url" target="_blank" trailing-icon="i-lucide-external-link">
          Ver no GitHub
        </UButton>
        <UButton to="/releases" variant="outline" color="neutral">
          Todas as versões
        </UButton>
      </div>
    </div>

    <div v-else class="flex flex-col items-center gap-4 py-16 text-center">
      <UIcon name="i-lucide-package-open" class="size-12 text-muted" />
      <div class="space-y-1">
        <h1 class="text-xl font-semibold text-highlighted">
          Nenhuma versão publicada ainda
        </h1>
        <p class="text-muted">
          Quando a primeira release for publicada, ela aparecerá aqui.
        </p>
      </div>
      <UButton to="/releases" variant="outline" color="neutral">
        Ver histórico
      </UButton>
    </div>
  </UContainer>
</template>
