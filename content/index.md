---
seo:
  title: Prosa - Notas de versão
  description: Acompanhe todas as novidades, melhorias e correções do Prosa a cada release publicada.
---
::u-page-hero{class="dark:bg-gradient-to-b from-[#581C87] to-neutral-950"}
---
orientation: horizontal
---
#top
:hero-background

#title
Notas de versão do [Prosa]{.text-primary}.

#description
Tudo o que muda no Prosa, direto da fonte — melhorias, correções e novidades de cada release, sempre atualizado.

#links
  :::download-button
  :::

  :::u-button
  ---
  icon: i-lucide-book-open
  color: neutral
  variant: outline
  size: xl
  to: /introducao
  ---
  Introdução
  :::


#default
  :::prose-pre
  ---
  code: gh release list --repo 4sllan/Prosa
  filename: Listar releases
  ---

  ```bash
  gh release list --repo 4sllan/Prosa
  ```
  :::
::

::u-page-section{class="dark:bg-neutral-950"}
#title
O que você encontra aqui

#links
  :::u-button
  ---
  color: neutral
  size: lg
  to: /releases
  trailingIcon: i-lucide-arrow-right
  variant: subtle
  ---
  Explorar histórico
  :::

#features
  :::u-page-feature
  ---
  icon: i-lucide-tag
  ---
  #title
  Uma página por versão

  #description
  Cada release tem página própria com tag, data de publicação e selo de pré-release quando aplicável
  :::

  :::u-page-feature
  ---
  icon: i-lucide-bell
  ---
  #title
  Sempre atualizado

  #description
  O conteúdo é gerado automaticamente a cada release publicada no GitHub — sem intervenção manual
  :::

  :::u-page-feature
  ---
  icon: i-lucide-git-compare
  ---
  #title
  Compare versões

  #description
  Links diretos para o diff entre releases, com todos os commits que entraram em cada versão
  :::

  :::u-page-feature
  ---
  icon: i-lucide-list-checks
  ---
  #title
  Notas organizadas

  #description
  Mudanças agrupadas por tipo: melhorias, correções, documentação, testes e contribuidores
  :::

  :::u-page-feature
  ---
  icon: i-lucide-zap
  ---
  #title
  Rápido e estático

  #description
  Site pré-renderizado e servido pelo GitHub Pages — carrega instantaneamente
  :::

  :::u-page-feature
  ---
  icon: i-simple-icons-github
  ---
  #title
  Direto da fonte

  #description
  Cada nota linka para a release oficial no GitHub, com downloads e assets
  :::
::

::u-page-section{class="dark:bg-gradient-to-b from-neutral-950 to-neutral-900"}
  :::u-page-c-t-a
  ---
  links:
    - label: Ver todas as releases
      to: '/releases'
      trailingIcon: i-lucide-arrow-right
    - label: Ver no GitHub
      to: 'https://github.com/4sllan/Prosa'
      target: _blank
      variant: subtle
      icon: i-simple-icons-github
  title: Pronto para se atualizar?
  description: Confira o que há de novo no Prosa — cada versão documentada, do primeiro commit à última correção.
  class: dark:bg-neutral-950
  ---

  :stars-background
  :::
::
