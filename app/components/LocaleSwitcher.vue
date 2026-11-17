<script setup lang="ts">
const { t, locale, locales } = useI18n()
const switchLocalePath = useSwitchLocalePath()

const targetFor = (code: string) => {
  const target = switchLocalePath(code)
  return typeof target === 'string' ? { path: target } : target
}
</script>

<template>
  <nav class="locale-switcher" :aria-label="t('locales.label')">
    <NuxtLink
      v-for="l in locales"
      :key="l.code"
      :to="targetFor(l.code)"
      class="locale-link"
      :class="{ 'is-active': l.code === locale }"
      :aria-current="l.code === locale ? 'true' : undefined"
    >
      {{ l.code.toUpperCase() }}
    </NuxtLink>
  </nav>
</template>

<style scoped>
.locale-switcher {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.locale-link {
  padding: 4px 8px;
  border-radius: 6px;
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .4px;
  line-height: 1.4;
  text-decoration: none;
}

.locale-link:hover { color: var(--ui-text-highlighted); }
.locale-link.is-active { color: var(--ui-primary); }
.locale-link:focus-visible { outline: 2px solid var(--ui-primary); outline-offset: 2px; }
</style>
