# Spec: Portar estilo e landing page de `docs/docs` para o Prosa

- Status: aprovada (2026-11-05)
- Data: 2026-11-05
- Origem do estilo: `docs/docs/` (app Nuxt de documentação do "Nuxt Umbuzeiro", não rastreado no git)

## 1. Objetivo e contexto

Aplicar ao app Prosa (raiz) o mesmo estilo visual e a mesma estrutura de página
inicial do app de documentação em `docs/docs/`: header estilo docs (logo/título,
busca, color mode, link GitHub), footer estilo docs, tema com container largo e
fonte Public Sans, e uma landing page em `/` composta por hero com gradiente e
`HeroBackground`, seção de features e CTA com `StarsBackground`.

Única alteração cromática em relação à fonte: o verde (lime) vira roxo escuro.

## 2. Escopo

### Dentro do escopo

- Criar `app/app.config.ts` na raiz com `ui.colors`, `seo.siteName`, `header` e
  `footer` no mesmo formato de `docs/docs/app/app.config.ts`.
- Atualizar `app/assets/css/main.css` com o tema (`--container-8xl: 90rem`,
  `--font-sans: 'Public Sans'`, `--ui-container`) e `@source` para `content/`.
- Criar componentes `app/components/AppHeader.vue`, `AppFooter.vue`,
  `AppLogo.vue` e `app/components/content/HeroBackground.vue`,
  `StarsBackground.vue`, portados de `docs/docs/` sem mudanças estruturais.
- Reestruturar `app/app.vue` para `UApp` + `NuxtLoadingIndicator` + `AppHeader`
  + `UMain` + `NuxtLayout`/`NuxtPage` + `AppFooter` + `UContentSearch`
  (seções de busca sobre a collection `releases`).
- Adicionar collection `landing` (`type: 'page'`, `source: 'index.md'`) em
  `content.config.ts`.
- Criar `content/index.md` com a landing do Prosa (mesma anatomia da original:
  `u-page-hero` + hero-background, `u-page-section` de features, `u-page-section`
  com `u-page-c-t-a` + stars-background), textos em português adaptados ao Prosa.
- Reescrever `app/pages/index.vue` para renderizar a collection `landing` via
  `ContentRenderer` (sem `defineOgImage`, pois `nuxt-og-image` não existe na raiz).
- Simplificar `app/layouts/default.vue` removendo header/footer próprios
  (sobem para `app.vue`), mantendo apenas o slot para as páginas internas.
- Trocar verde por roxo escuro em todos os pontos portados:
  `primary: 'lime'` → `primary: 'purple'`; gradiente do hero
  `from-[#7FA039]` → `from-[#581C87]` (purple-900).

### Fora do escopo

- `nuxt-og-image`, `nuxt-llms`, `defineOgImage`, componente `OgImage/Docs.satori`.
- Layout `docs.vue` e página `[...slug].vue` de documentação (Prosa não tem
  collection `docs`); páginas `/releases` e `/releases/[...slug]` mantêm o
  conteúdo atual, herdando apenas o novo chrome (header/footer/tema).
- Novas dependências em `package.json`/`pnpm-lock.yaml`.
- Mudanças em `docs/docs/` (a fonte permanece intocada).
- Conteúdo atual da home ("última release" em `app/pages/index.vue`): será
  substituído pela landing; `/releases` continua listando todas as versões.

## 3. Requisitos

### Funcionais

- RF-01: O app raiz deve usar o chrome estilo docs (header com título, busca,
  color mode e link GitHub; footer com créditos e links) em todas as páginas.
- RF-02: A rota `/` deve renderizar a landing definida em `content/index.md`
  com hero (gradiente + HeroBackground), seção de features e CTA
  (StarsBackground), idêntica em estrutura à de `docs/docs`.
- RF-03: A cor primária deve ser roxa (`ui.colors.primary = 'purple'`) e o
  gradiente do hero deve usar roxo escuro (`#581C87`); nenhum token verde
  (`lime`, `#7FA039`, `#9CC14C`) pode permanecer no app raiz.
- RF-04: A busca do header (`UContentSearch`) deve indexar a collection
  `releases` via `queryCollectionSearchSections('releases')`, carregada só no
  cliente (`server: false`).
- RF-05: `/releases` e `/releases/[...slug]` devem continuar funcionando e
  renderizando o conteúdo das releases dentro do novo layout.
- RF-06: Textos da landing em português, com CTAs para `/releases` e para o
  repositório `https://github.com/4sllan/Prosa`.

### Não funcionais

- RNF-01: Nenhuma dependência nova; ícones `i-lucide-*`/`i-simple-icons-*`
  resolvem pelo mesmo mecanismo já em uso na raiz (fallback da API Iconify do
  `@nuxt/icon`), sem instalar `@iconify-json/*`.
- RNF-02: Sem quebra de SSR/hidratação: `StarsBackground` gera estrelas apenas
  em `onMounted`; busca fica em `ClientOnly`/`useLazyAsyncData` com
  `server: false`.
- RNF-03: Manter `lang`/`htmlAttrs` e metas de SEO equivalentes
  (`useSeoMeta`, `titleTemplate` com `seo.siteName`).
- RNF-04: Header usa `queryCollectionNavigation('releases')` para navegação
  mobile, provida via `provide`/`inject` como no app fonte.

## 4. Estratégia de renderização e UI/UX

SSR padrão do Nuxt, sem `routeRules` novos. A landing é uma página de content
renderizada server-side; efeitos visuais (stars, appear do hero) são
progressivos e client-only. Color mode segue o padrão do `@nuxt/ui`
(claro/escuro). Estados de loading mantêm `NuxtLoadingIndicator`.

## 5. Contratos afetados

- `content.config.ts`: nova collection `landing` (`type: 'page'`,
  `source: 'index.md'`). Collection `releases` inalterada.
- `app/app.config.ts` (novo): chaves `ui.colors`, `seo.siteName`, `header`
  (`title: 'Prosa'`, `to: '/'`, `search: true`, `colorMode: true`, link GitHub
  para `4sllan/Prosa`), `footer` (créditos e link GitHub). Sem chave `toc`.
- Nenhuma rota Nitro, `runtimeConfig` ou middleware envolvido.

## 6. Estado, persistência e migrações

Não se aplica: não há dados persistidos nem migrações. O SQLite local do
`@nuxt/content` em `.data/` é regenerado automaticamente pelo módulo.

## 7. Autenticação, autorização, validação, privacidade

Não se aplica: site público de notas de versão, sem auth nem dados sensíveis.

## 8. Falhas e recuperação

- `content/index.md` ausente → `pages/index.vue` lança 404 fatal (mesmo
  comportamento do app fonte); mitigado criando o arquivo no escopo.
- Falha da API Iconify → mesma condição atual do app (sem regressão).
- Erro de renderização → `error.vue` padrão do Nuxt (não se porta o
  `error.vue` customizado, que depende da collection `docs`).

## 9. Critérios de aceite

- CA-01 (RF-01..RF-03): `pnpm build` conclui com sucesso e a `/` renderizada
  contém hero com gradiente roxo, features e CTA; inspeção do HTML/CSS não
  mostra `lime`, `#7FA039` ou `#9CC14C` no app raiz.
- CA-02 (RF-04): busca do header abre `UContentSearch` e retorna seções das
  releases (verificação manual no `pnpm dev` ou `pnpm preview`).
- CA-03 (RF-05): `/releases` e `/releases/v0-6-0` (ou slug existente)
  renderizam dentro do novo chrome, sem erros de hidratação no console.
- CA-04 (RF-03): componente primário (botões, badges, gradiente, estrelas)
  aparece em roxo em ambos os color modes (verificação manual).
- CA-05 (RNF-01): `git diff` em `package.json`/`pnpm-lock.yaml` vazio.

## 10. Estratégia de testes e riscos

- Sem suite de testes automatizados no projeto (ver `.devin/sdd.md`);
  validação por `pnpm build` + verificação manual em `pnpm dev`/`preview`.
- Risco: landing substitui a home atual — informação da "última release" some
  da `/`; aceito por decisão de escopo, mitigado com CTA para `/releases`.
- Risco: `Public Sans` é apenas declarada no CSS (não há `@nuxt/fonts` nem
  link de fonte no app fonte) — comportamento idêntico ao original, sem ação.

## 11. Decisões registradas (suposições a confirmar na aprovação)

- D1 — Logo: header exibe apenas o texto "Prosa" (sem `logo.svg`); mantém-se o
  `public/favicon.ico` existente. A folha do Umbuzeiro não é portada por ser
  marca de outro produto. Alternativa futura: recolorir a folha para roxo.
- D2 — Conteúdo da landing: textos/features adaptados ao Prosa com liberdade,
  mantendo a mesma anatomia visual da página fonte.
- D3 — Roxo escuro: `primary: 'purple'` (accentos) + gradiente `#581C87`
  (purple-900) no hero.
