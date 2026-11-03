<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-default">
      <UContainer class="flex items-center justify-between h-14">
        <NuxtLink to="/" class="font-bold text-lg">
          Prosa
        </NuxtLink>
        <nav class="flex items-center gap-1">
          <UButton to="/releases" variant="ghost" color="neutral">
            Releases
          </UButton>
          <UButton
            to="https://github.com/4sllan/Prosa"
            target="_blank"
            variant="ghost"
            color="neutral"
            icon="i-lucide-github"
            aria-label="Repositório no GitHub"
          />
        </nav>
      </UContainer>
    </header>

    <main class="flex-1">
      <slot />
    </main>

    <footer class="border-t border-default">
      <UContainer class="py-6 text-sm text-muted">
        Prosa — notas de versão
      </UContainer>
    </footer>
  </div>
</template>
