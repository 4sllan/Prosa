<script setup lang="ts">
const { t } = useI18n()
const { footer } = useAppConfig()
</script>

<template>
  <UFooter>
    <template #left>
      {{ footer.credits }}
    </template>

    <template #right>
      <UColorModeButton v-if="footer?.colorMode" />

      <template v-if="footer?.links">
        <UButton
          v-for="(link, index) of footer?.links"
          :key="index"
          v-bind="{ color: 'neutral', variant: 'ghost', ...link, 'aria-label': link['aria-label'] ? t(link['aria-label']) : undefined }"
        />
      </template>
    </template>
  </UFooter>
</template>
