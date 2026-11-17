// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/content', '@nuxt/image', '@nuxt/ui', '@nuxtjs/i18n'],
  css: ['~/assets/css/main.css'],
  i18n: {
    defaultLocale: 'pt',
    strategy: 'prefix_except_default',
    detectBrowserLanguage: false,
    baseUrl: 'https://4sllan.github.io/Prosa',
    locales: [
      { code: 'pt', language: 'pt-BR', name: 'Português (Brasil)', file: 'pt.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      { code: 'es', language: 'es-419', name: 'Español (Latinoamérica)', file: 'es.json' }
    ]
  }
})
