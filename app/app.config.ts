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
    logo: {
      light: '/logotipo-prosa.png',
      dark: '/logotipo-prosa.png',
      alt: 'Prosa'
    },
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
        'aria-label': 'footer.githubLabel'
      },
    ]
  },
  toc: {
    title: 'releases.inThisVersion',
    bottom: {
      title: 'docs.githubTitle',
      edit: true,
      links: [
        {
          icon: 'i-lucide-star',
          label: 'docs.links.star',
          to: 'https://github.com/4sllan/Prosa',
          target: '_blank'
        },
        {
          icon: 'i-lucide-git-pull-request-create',
          label: 'docs.links.report',
          to: 'https://github.com/4sllan/Prosa/issues/new',
          target: '_blank'
        },
        {
          icon: 'i-simple-icons-github',
          label: 'docs.links.sponsor',
          to: 'https://github.com/sponsors/4sllan',
          target: '_blank'
        }
      ]
    }
  }
})
