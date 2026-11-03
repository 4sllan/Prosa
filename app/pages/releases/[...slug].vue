<script setup lang="ts">
const route = useRoute()

const { data: release } = await useAsyncData(`release-${route.path}`, () =>
  queryCollection('releases').path(route.path).first()
)

if (!release.value) {
  throw createError({ statusCode: 404, statusMessage: 'Release não encontrada' })
}

useSeoMeta({
  title: `${release.value.title} — Prosa`,
  description: `Notas da versão ${release.value.tag} do Prosa.`
})
</script>

<template>
  <UContainer class="py-12">
    <div v-if="release" class="space-y-8">
      <div class="space-y-4">
        <UButton to="/releases" variant="ghost" color="neutral" icon="i-lucide-arrow-left" size="sm">
          Releases
        </UButton>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge color="primary" variant="subtle" size="lg">
            {{ release.tag }}
          </UBadge>
          <UBadge v-if="release.prerelease" color="warning" variant="subtle" size="lg">
            Pré-release
          </UBadge>
        </div>
        <h1 class="text-3xl sm:text-4xl font-bold text-highlighted">
          {{ release.title }}
        </h1>
        <p class="text-muted">
          Publicada em {{ formatReleaseDate(release.date) }}
        </p>
      </div>

      <UCard>
        <ContentRenderer :value="release" class="prose" />
      </UCard>

      <UButton :to="release.url" target="_blank" trailing-icon="i-lucide-external-link">
        Ver no GitHub
      </UButton>
    </div>
  </UContainer>
</template>
