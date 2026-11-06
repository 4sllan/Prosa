const siteName = 'Prosa'

export default defineAppConfig({
  ui: {
    colors: {
      primary: 'purple',
      neutral: 'zinc'
    },
    footer: {
      slots: {
        root: 'border-t border-default',
        left: 'text-sm text-muted'
      }
    }
  },
  seo: {
    siteName: siteName
  },
  header: {
    title: siteName,
    to: '/',
    search: true,
    colorMode: true,
    links: [
      {
        'icon': 'i-simple-icons-github',
        'to': 'https://github.com/4sllan/Prosa',
        'target': '_blank',
        'aria-label': 'GitHub'
      }
    ]
  },
  footer: {
    credits: `Aslan Gama © ${new Date().getFullYear()}`,
    colorMode: false,
    links: [
      {
        'icon': 'i-simple-icons-github',
        'to': 'https://github.com/4sllan/Prosa',
        'target': '_blank',
        'aria-label': 'Prosa no GitHub'
      },
    ]
  },
  toc: {
    title: 'Nesta versão',
    bottom: {
      title: 'Prosa no GitHub',
      edit: true,
      links: [
        {
          icon: 'i-lucide-star',
          label: 'Star on GitHub',
          to: 'https://github.com/4sllan/Prosa',
          target: '_blank'
        },
        {
          icon: 'i-lucide-git-pull-request-create',
          label: 'Reportar problema',
          to: 'https://github.com/4sllan/Prosa/issues/new',
          target: '_blank'
        },
        {
          icon: 'i-simple-icons-github',
          label: 'Apoiar o projeto',
          to: 'https://github.com/sponsors/4sllan',
          target: '_blank'
        }
      ]
    }
  }
})
