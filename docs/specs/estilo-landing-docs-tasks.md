# Tasks: Portar estilo e landing page de `docs/docs` para o Prosa

- Spec aprovada: `docs/specs/estilo-landing-docs.md` (aprovada em 2026-11-05)
- Status geral: concluído (2026-11-05)
- Ordem de execução: T1 → T2 → T3 → T4

## T1 - Tema e configuração visual na raiz

- Status: concluída
- Requisitos/aceite: RF-01, RF-03, CA-01
- Dependências: nenhuma
- Escopo e arquivos prováveis:
  - Criar `app/app.config.ts` — `ui.colors: { primary: 'purple', neutral: 'zinc' }`,
    `ui.footer.slots`, `seo.siteName: 'Prosa'`, `header` (title `Prosa`, to `/`,
    `search: true`, `colorMode: true`, link GitHub `4sllan/Prosa`), `footer`
    (créditos + link GitHub). Sem `toc`, sem `logo` (decisão D1).
  - Editar `app/assets/css/main.css` — adicionar `@source "../../../content/**/*"`,
    `@theme static` com `--container-8xl: 90rem` e `--font-sans: 'Public Sans'`,
    e `:root { --ui-container: var(--container-8xl) }`.
- Implementação: espelhar `docs/docs/app/app.config.ts` e `docs/docs/app/assets/css/main.css`,
  trocando `lime` → `purple` e adaptando textos/links ao Prosa.
- Testes e comandos de validação: `pnpm build`; `pnpm exec nuxi prepare` se houver
  erro de tipos/auto-imports.
- Critério de conclusão: build sem erros; cor primária roxa efetiva no app.
- Evidências: criado `app/app.config.ts` (primary `purple`, header/footer/seo);
  `app/assets/css/main.css` com `@source`, `@theme static` e `--ui-container`.
  `pnpm build` concluiu com sucesso (19.3s, sem erros) em 2026-11-05.

## T2 - Chrome estilo docs (header/footer em todas as páginas)

- Status: concluída
- Requisitos/aceite: RF-01, RF-04, RNF-04, CA-02
- Dependências: T1
- Escopo e arquivos prováveis:
  - Criar `app/components/AppHeader.vue`, `app/components/AppFooter.vue`,
    `app/components/AppLogo.vue` (portados de `docs/docs/app/components/`).
  - Reescrever `app/app.vue`: `UApp` + `NuxtLoadingIndicator` + `AppHeader` +
    `UMain`(`NuxtLayout`>`NuxtPage`) + `AppFooter` + `ClientOnly`/`LazyUContentSearch`;
    `useAsyncData('navigation', () => queryCollectionNavigation('releases'))` e
    `useLazyAsyncData('search', () => queryCollectionSearchSections('releases'), { server: false })`;
    `provide('navigation', navigation)`; `useHead`/`useSeoMeta` com `seo.siteName`.
  - Simplificar `app/layouts/default.vue`: remover header/footer próprios,
    manter `<slot />` (o chrome sobe para `app.vue`).
- Implementação: cópia estrutural do app fonte, trocando a collection `docs` por
  `releases`; `lang` do `htmlAttrs` como `'pt-BR'`.
- Testes e comandos de validação: `pnpm build`; manual em `pnpm dev`: header com
  título/busca/color-mode/GitHub em `/` e `/releases`; busca lista seções das
  releases; footer com créditos.
- Critério de conclusão: todas as rotas exibem o novo chrome; busca funcional.
- Evidências: criados `app/components/AppHeader.vue`, `AppFooter.vue`,
  `AppLogo.vue`; `app/app.vue` reescrito (UHeader/UMain/UFooter +
  `UContentSearch` sobre `releases`, `provide('navigation')`, `lang: pt-BR`,
  favicon `/favicon.ico`); `app/layouts/default.vue` reduzido a `<slot />`.
  `pnpm build` OK (26.4s). Smoke test em `.output` (`node .output/server/index.mjs`):
  `/` e `/releases` retornam 200 com `<header>`/`UFooter` renderizados em SSR.
  Pendente para T4: conferência visual da busca `UContentSearch` (client-only)
  no navegador (CA-02).

## T3 - Landing page em `/`

- Status: concluída
- Requisitos/aceite: RF-02, RF-03, RF-06, RNF-02, RNF-03, CA-01, CA-04
- Dependências: T1, T2
- Escopo e arquivos prováveis:
  - Editar `content.config.ts`: adicionar collection `landing`
    (`type: 'page'`, `source: 'index.md'`); manter `releases` inalterada.
  - Criar `content/index.md`: mesma anatomia de `docs/docs/content/index.md` —
    `u-page-hero` com `class="dark:bg-gradient-to-b from-[#581C87] to-neutral-950"`,
    `:hero-background` no `#top`, links (CTA para `/releases` + GitHub),
    `u-page-section` de features (6 cards sobre notas de versão do Prosa) e
    `u-page-section` com `u-page-c-t-a` + `:stars-background`. Textos em PT-BR.
  - Reescrever `app/pages/index.vue`: `queryCollection('landing').path('/').first()`,
    404 fatal se ausente, `useSeoMeta` com title/description da página,
    `ContentRenderer :prose="false"`. Sem `defineOgImage`.
  - Criar `app/components/content/HeroBackground.vue` e
    `app/components/content/StarsBackground.vue` (cópia do app fonte).
- Implementação: portar fielmente a estrutura MDC da página fonte, trocando
  gradiente verde por `#581C87` e adaptando textos ao Prosa (decisões D2/D3).
- Testes e comandos de validação: `pnpm build`; manual: `/` mostra hero roxo
  com gradiente, features e CTA com estrelas em ambos os color modes;
  sem erros de hidratação.
- Critério de conclusão: landing renderiza com roxo escuro e estrutura da fonte.
- Evidências: `content.config.ts` ganhou collection `landing`; criado
  `content/index.md` (hero `from-[#581C87]`, 6 features, CTA + stars, textos
  PT-BR com CTAs para `/releases` e `4sllan/Prosa`); `app/pages/index.vue`
  renderiza `landing` via `ContentRenderer`; copiados `HeroBackground.vue` e
  `StarsBackground.vue` para `app/components/content/`.
  `pnpm build` OK (28.2s). Smoke test `.output`: `/`, `/releases`,
  `/releases/v0-6-0` → 200; HTML da home contém hero, features e CTA;
  `--ui-color-primary-*` injetado = paleta `purple` (`--ui-primary` =
  purple-500/400); nenhum `lime`/`#7FA039`/`#9CC14C` no HTML.
  Pendente para T4: conferência visual das animações (hero appear, stars)
  no navegador (CA-04).

## T4 - Varredura final: verde residual e regressão

- Status: concluída
- Requisitos/aceite: CA-01, CA-03, CA-05, RNF-01
- Dependências: T3
- Escopo e arquivos prováveis: revisão de diff (`git diff`), sem novos arquivos.
- Implementação:
  - `grep -rniE "lime|#7FA039|#9CC14C" app/ content/` → nenhum resultado.
  - `git diff package.json pnpm-lock.yaml` → vazio (nenhuma dependência nova).
  - `pnpm build` final limpo; `git diff --check`.
  - Verificação manual em `pnpm preview` ou `pnpm dev`: `/`, `/releases`,
    `/releases/<slug>` funcionais dentro do novo chrome; console sem erros de
    hidratação.
- Testes e comandos de validação: comandos acima.
- Critério de conclusão: todos os CAs da spec atendidos ou manualmente
  verificados e registrados como evidência.
- Evidências (automatizado, 2026-11-05):
  - `grep -rniE 'lime|#7FA039|#9CC14C|green|emerald' app/ content/` → sem resultados (CA-01).
  - `git diff package.json pnpm-lock.yaml` → vazio; nenhuma dependência nova (CA-05, RNF-01).
  - `git diff --check` → limpo.
  - `pnpm build` já validado em T3 (nenhum arquivo de app alterado desde então);
    rotas `/`, `/releases`, `/releases/v0-6-0` → 200 no `.output` (CA-03 parcial).
  - Diff confinado ao escopo: `app/app.vue`, `main.css`, `default.vue`,
    `pages/index.vue`, `content.config.ts` modificados; `app/app.config.ts`,
    `app/components/`, `content/index.md` criados.
- Pendências de verificação manual (servidas em `pnpm preview`, porta 3000):
  - CA-02: abrir a busca no header (botão ou ⌘K) e confirmar que retorna
    seções das releases.
  - CA-04: conferir hero com gradiente roxo + linha animada, estrelas do CTA
    e alternância claro/escuro; console sem erros de hidratação.
  - Validação manual: usuário conferiu o preview (`pnpm preview`, porta 3000)
    e confirmou com "continuar" em 2026-11-05 → CA-02 e CA-04 aceitos.

## T5 - Asides estilo docs nas páginas de releases (pedido pós-plano)

- Status: aguardando validação
- Requisitos/aceite: RF-01, RF-05 (extensão solicitada diretamente pelo usuário
  em 2026-11-05: "faltou o aside do lado esquerdo e direito, faz do mesmo
  jeito que docs/docs")
- Dependências: T2, T3
- Escopo e arquivos prováveis:
  - Criar `app/layouts/docs.vue` (cópia da fonte: `UPage` + `UPageAside` com
    `UContentNavigation` injetado).
  - `app/pages/releases/index.vue`: `layout: 'docs'` + `UPageHeader`/`UPageBody`.
  - `app/pages/releases/[...slug].vue`: `layout: 'docs'` + `UPageHeader`
    (badges/links) + `UPageBody` + `UContentSurround` + aside direito
    `UContentToc` quando houver `body.toc`.
  - `app/app.config.ts`: adicionar chave `toc` (título + links inferiores).
- Critério de conclusão: `/releases` e `/releases/<slug>` com aside esquerdo
  (navegação) e detalhe com aside direito (toc); build OK.
- Evidências: criado `app/layouts/docs.vue` (cópia da fonte);
  `releases/index.vue` e `releases/[...slug].vue` migrados para
  `layout: 'docs'` com `UPageHeader`/`UPageBody`; detalhe ganhou
  `UContentSurround` (anterior/próxima) e aside direito `UContentToc` +
  bloco `UPageLinks`; `app.config.ts` ganhou chave `toc` (título
  "Nesta versão" + links inferiores para o GitHub).
  `pnpm build` OK (23.2s). Smoke test `.output`: `/releases/v0-6-0`
  renderiza `data-slot="left"` (navegação) e `data-slot="right"` (toc);
  `/`, `/releases`, `/releases/v0-6-0` → 200.
  Pendente: conferência visual dos asides no navegador pelo usuário.
