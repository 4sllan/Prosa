<script setup lang="ts">
const props = withDefaults(defineProps<{
  href?: string
  target?: string
}>(), {
  href: '',
  target: undefined
})

const localePath = useLocalePath()

const to = computed(() =>
  props.href.startsWith('/') ? localePath(props.href) : props.href
)
</script>

<template>
  <NuxtLink :href="to" :target="props.target">
    <slot />
  </NuxtLink>
</template>
