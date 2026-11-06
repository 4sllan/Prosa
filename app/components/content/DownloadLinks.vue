<script setup lang="ts">
interface ReleaseAsset {
  name: string
  browser_download_url: string
  size: number
}

interface Release {
  tag_name: string
  html_url: string
  assets: ReleaseAsset[]
}

const platforms = [
  { name: 'macOS', icon: 'i-simple-icons-apple', patterns: [/\.dmg$/i, /mac.*\.zip$/i] },
  { name: 'Windows', icon: 'i-simple-icons-windows', patterns: [/\.exe$/i, /\.msi$/i] },
  { name: 'Linux', icon: 'i-simple-icons-linux', patterns: [/\.appimage$/i, /\.deb$/i, /\.rpm$/i] }
]

const release = ref<Release | null>(null)
const failed = ref(false)

const downloads = computed(() => {
  if (!release.value) return []
  return platforms.flatMap(({ name, icon, patterns }) => {
    for (const pattern of patterns) {
      const asset = release.value!.assets?.find(a => pattern.test(a.name))
      if (asset) return [{ platform: name, icon, asset }]
    }
    return []
  })
})

function formatSize(bytes: number): string {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1)
  return `${(bytes / 2 ** (10 * i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

onMounted(async () => {
  try {
    release.value = await $fetch<Release>(
      'https://api.github.com/repos/4sllan/Prosa/releases/latest'
    )
  } catch {
    failed.value = true
  }
})
</script>

<template>
  <div class="space-y-4 not-prose">
    <div v-if="release" class="flex items-center gap-2">
      <UBadge color="primary" variant="subtle" size="lg">
        {{ release.tag_name }}
      </UBadge>
      <span class="text-sm text-muted">versão mais recente</span>
    </div>

    <ul v-if="downloads.length" class="space-y-4">
      <li v-for="item in downloads" :key="item.platform">
        <UCard>
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <UIcon :name="item.icon" class="size-8 text-highlighted" />
              <div>
                <p class="font-semibold text-highlighted">
                  {{ item.platform }}
                </p>
                <p class="text-sm text-muted">
                  {{ item.asset.name }}<span v-if="item.asset.size"> · {{ formatSize(item.asset.size) }}</span>
                </p>
              </div>
            </div>
            <UButton
              :to="item.asset.browser_download_url"
              target="_blank"
              trailing-icon="i-lucide-arrow-down-to-line"
            >
              Baixar
            </UButton>
          </div>
        </UCard>
      </li>
    </ul>

    <UButton
      v-else
      :to="failed ? 'https://github.com/4sllan/Prosa/releases' : 'https://github.com/4sllan/Prosa/releases/latest'"
      target="_blank"
      variant="outline"
      color="neutral"
      trailing-icon="i-lucide-external-link"
    >
      Ver downloads no GitHub
    </UButton>
  </div>
</template>
