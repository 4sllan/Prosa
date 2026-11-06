<script setup lang="ts">
type Platform = 'mac' | 'windows' | 'linux'

interface ReleaseAsset {
  name: string
  browser_download_url: string
}

const platform = ref<Platform | null>(null)
const downloadUrl = ref<string | null>(null)

const labels: Record<Platform, string> = {
  mac: 'Baixar para macOS',
  windows: 'Baixar para Windows',
  linux: 'Baixar para Linux'
}

const matchers: Record<Platform, RegExp[]> = {
  mac: [/\.dmg$/i, /mac.*\.zip$/i],
  windows: [/\.exe$/i, /\.msi$/i],
  linux: [/\.appimage$/i, /\.deb$/i, /\.rpm$/i]
}

function detectPlatform(): Platform | null {
  const ua = navigator.userAgent
  if (/android|iphone|ipad|ipod/i.test(ua)) return null

  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData?.platform || ua
  const p = platform.toLowerCase()

  if (p.includes('mac')) return 'mac'
  if (p.includes('win')) return 'windows'
  if (p.includes('linux') || p.includes('x11')) return 'linux'
  return null
}

const label = computed(() =>
  platform.value ? labels[platform.value] : 'Ver releases'
)
const to = computed(() =>
  downloadUrl.value
  || (platform.value ? 'https://github.com/4sllan/Prosa/releases/latest' : '/releases')
)
const external = computed(() => to.value.startsWith('http'))

onMounted(async () => {
  platform.value = detectPlatform()
  if (!platform.value) return

  try {
    const release = await $fetch<{ assets: ReleaseAsset[] }>(
      'https://api.github.com/repos/4sllan/Prosa/releases/latest'
    )
    for (const pattern of matchers[platform.value]) {
      const asset = release.assets?.find(a => pattern.test(a.name))
      if (asset) {
        downloadUrl.value = asset.browser_download_url
        break
      }
    }
  } catch {
    // mantém o fallback para a página de releases
  }
})
</script>

<template>
  <UButton
    :to="to"
    :target="external ? '_blank' : undefined"
    size="xl"
    :trailing-icon="platform ? 'i-lucide-arrow-down-to-line' : 'i-lucide-arrow-right'"
  >
    {{ label }}
  </UButton>
</template>
