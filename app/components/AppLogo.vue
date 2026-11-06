<script lang="ts" setup>
const { header } = useAppConfig()
const baseURL = useRuntimeConfig().app.baseURL

function logoUrl(src?: string) {
  return src?.startsWith('/') && !src.startsWith('//')
    ? `${baseURL}${src.slice(1)}`
    : src
}
</script>

<template>
  <div class="flex gap-2 items-center">
    <template v-if="header?.logo?.dark || header?.logo?.light">
      <!-- Static logos bypass IPX, which receives the UI component's base-prefixed path. -->
      <img
        :src="logoUrl(header.logo.light || header.logo.dark)"
        :alt="header.logo.alt"
        class="h-8 w-auto shrink-0 dark:hidden"
        width="32"
        height="32"
      >
      <img
        :src="logoUrl(header.logo.dark || header.logo.light)"
        :alt="header.logo.alt"
        class="hidden h-8 w-auto shrink-0 dark:block"
        width="32"
        height="32"
      >
    </template>

    <span v-else>{{ header.title }}</span>
  </div>
</template>
