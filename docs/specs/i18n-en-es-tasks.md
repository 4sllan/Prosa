# Tasks — Internacionalização (inglês + espanhol latino-americano)

- **Status geral:** aprovado
- **Spec de referência:** `docs/specs/i18n-en-es.md` (aprovada)
- **Ordem de execução:** T1 → T2 → T3 → T4 → T5
- **Decisões assumidas:** `detectBrowserLanguage` desativado; seletor de
  idioma no header e no `LandingFooter`; espanhol = `code: 'es'` /
  `language: 'es-419'`; releases permanecem em pt-BR.

## T1 — `@nuxtjs/i18n` instalado e rotas por locale respondendo

- Status: concluída
- Requisitos/aceite: RF-01, RNF-01, RNF-02; CA-01 (parcial)
- Dependências: nenhuma
- Escopo e arquivos prováveis: `package.json`, `pnpm-lock.yaml`,
  `nuxt.config.ts`, `i18n/locales/{pt,en,es}.json` (esqueleto)
- Implementação: `pnpm add @nuxtjs/i18n` (versão estável compatível com
  Nuxt 4, publicada há mais de 7 dias — fixar, sem range flutuante para
  majors novas); registrar o módulo em `modules`; bloco `i18n` com locales
  `pt`/`en`/`es` (language `pt-BR`/`en-US`/`es-419`, nomes nativos),
  `strategy: 'prefix_except_default'`, `defaultLocale: 'pt'`,
  `detectBrowserLanguage: false` e diretório de mensagens conforme a
  convenção da versão instalada; arquivos de mensagens esqueleto nos 3
  idiomas.
- Testes e comandos de validação: `pnpm exec nuxi prepare`; `pnpm build`
  (ou `pnpm generate`) — rotas `/en/` e `/es/` presentes no output, sem
  erros do módulo.
- Critério de conclusão: build gera rotas localizadas e `/` continua
  renderizando pt-BR idêntico a antes.
- Evidências:
  - `pnpm add @nuxtjs/i18n@^10.6.0` → instalado `10.6.0` (publicado em
    2026-07-30); `package.json` e `pnpm-lock.yaml` atualizados.
  - `nuxt.config.ts`: módulo registrado e bloco `i18n` com locales
    pt/en/es (language pt-BR/en-US/es-419), `prefix_except_default`,
    `defaultLocale: 'pt'`, `detectBrowserLanguage: false`.
  - `i18n/locales/{pt,en,es}.json` criados (esqueleto `{}`).
  - Ajuste antecipado do RF-06 (necessário para o generate passar):
    `app/pages/[...slug].vue` e `app/pages/releases/[...slug].vue` agora
    derivam o path do conteúdo de `route.params.slug` em vez de
    `route.path` — antes, `/en/introducao` etc. retornavam 404 fatal e
    abortavam o prerender.
  - `pnpm exec nuxi prepare` OK; `pnpm generate` OK — 50 rotas
    pré-renderizadas, incluindo `/en/*` e `/es/*` de index, introducao,
    download e releases/*.
  - Regressão: `verify-landing-hero`, `-motion`, `-art` e `-assets` verdes.
  - `git diff --check` limpo; alterações: `nuxt.config.ts`,
    `package.json`, `pnpm-lock.yaml`, os dois `[...slug].vue`, `i18n/`.
  - Pendências conhecidas: `lang` continua `pt-BR` em todas as saídas
    (T4); rotas `/en/*` e `/es/*` renderizam conteúdo pt até a T3;
    avisos de peer de `unctx` (`oxc-parser >=0.140`, `unplugin ^3.3.0`)
    — transitivos do Nuxt, não bloqueiam.

## T2 — Strings da UI extraídas para mensagens i18n

- Status: concluída
- Requisitos/aceite: RF-02 (parcial: componentes cobertos), RF-10, RNF-04;
  CA-03 (parcial)
- Dependências: T1
- Escopo e arquivos prováveis: `i18n/locales/{pt,en,es}.json`,
  `app/components/content/LandingHero.vue`, `LandingFeatures.vue`,
  `LandingCards.vue`, `DownloadButton.vue`, `DownloadLinks.vue`,
  `app/components/LandingFooter.vue`, `AppHeader.vue`, `AppFooter.vue`,
  `scripts/verify-landing-hero.mjs` (mocks)
- Implementação: extrair todas as strings fixas para chaves namespaced
  (`landing.hero.*`, `landing.features.*`, `landing.cards.*`, `footer.*`,
  `downloads.*`); substituir entidades HTML (`&ccedil;` etc.) por UTF-8;
  traduzir en e es-419; links internos passam a usar `localePath`/
  `$localePath` (`/introducao`, `/download`, `/releases`, `/`); stubs de
  `useI18n`/`t` nos mocks dos verify scripts que executam `<script setup>`
  (ex.: `DownloadButton`).
- Testes e comandos de validação: `node scripts/verify-landing-hero.mjs`,
  `verify-landing-motion.mjs`, `verify-landing-art.mjs`,
  `verify-landing-assets.mjs`; `pnpm build`; `git diff --check`; inspeção
  visual de `/`, `/en/`, `/es/` (pt-BR visualmente idêntico).
- Critério de conclusão: nenhuma string pt-BR fixa nos componentes cobertos;
  verify scripts verdes; en/es exibem UI traduzida.
- Evidências:
  - `i18n/locales/{pt,en,es}.json` preenchidos com chaves namespaced
    (`landing.*`, `footer.*`, `downloads.*`, `releases.*`, `docs.*`),
    traduzidas para en e es-419; entidades HTML substituídas por UTF-8.
  - `@nuxtjs/i18n` v10 não injeta `$t` global — usado `useI18n()` + `t()`
    em todos os componentes/páginas e `<NuxtLinkLocale>` para links
    internos (`/`, `/introducao`, `/download`, `/releases`, path de release).
  - Componentes: `LandingHero`, `LandingFeatures`, `LandingCards`,
    `LandingFooter`, `DownloadButton`, `DownloadLinks`. Páginas incluídas
    além do previsto para completar RF-02: `releases/index`,
    `releases/[...slug]`, `[...slug]` (labels, 404s, "Nesta página").
  - `scripts/verify-landing-hero.mjs` e `verify-landing-assets.mjs`: stubs
    de `useI18n`/`useLocalePath`; o `t` do hero resolve o `pt.json` real,
    mantendo as asserções de label fiéis.
  - Validação: os 4 `verify-landing-*.mjs` verdes; `pnpm generate` com 50
    rotas; HTML de `/en/` e `/es/` exibe UI traduzida e hrefs localizados
    (`/en/introducao`, `/es/releases`…); rodapé e páginas de release
    localizados; `/` idêntica em pt-BR; `git diff --check` limpo.
  - Pendências conhecidas: datas seguem formatadas em pt-BR e
    `htmlAttrs.lang` fixo (T4); strings de `app.config.ts` ainda em pt
    (T4); conteúdo markdown servido sob `/en/` e `/es/` continua pt-BR
    até a T3.

## T3 — Conteúdo markdown por locale, coleções e queries locale-aware

- Status: concluída
- Requisitos/aceite: RF-03, RF-04, RF-05, RF-06, RF-10 (links do markdown),
  RNF-03 (parcial); CA-04, CA-07 (parcial)
- Dependências: T1 (T2 recomendada, sem bloqueio)
- Escopo e arquivos prováveis: `content/{pt,en,es}/**`, `content.config.ts`,
  `app/app.vue`, `app/pages/index.vue`, `app/pages/[...slug].vue`,
  `app/pages/releases/index.vue`, `app/pages/releases/[...slug].vue`,
  `app/components/content/ProseA.vue` (novo, se a opção for customizar) ou
  hrefs localizados por arquivo
- Implementação: `git mv` de `content/index.md`, `content/1.introducao.md`,
  `content/2.download.md` para `content/pt/`; criar `content/en/` e
  `content/es/` com traduções mantendo prefixos numéricos e os componentes
  MDC (`::download-links` etc.); `content.config.ts` com coleções
  `landing_{pt,en,es}` e `docs_{pt,en,es}` (`source: { include: '<locale>/**',
  prefix: '' }`, excluindo `index.md` em docs) e `releases` inalterada;
  queries passam a usar a coleção do locale (`docs_${locale}`,
  `landing_${locale}`) com fallback para pt; path do conteúdo derivado de
  `route.params.slug` (não `route.path`); keys de `useAsyncData` incluem o
  locale com `watch: [locale]`; links internos do markdown localizados
  (decisão ProseA vs hrefs documentada na evidência).
- Testes e comandos de validação:
  `NUXT_APP_BASE_URL=/Prosa/ pnpm generate` → conferir
  `.output/public/{index.html,en/index.html,es/index.html,
  en/introducao/,es/introducao/}` e equivalência dos paths pt;
  `pnpm exec nuxi prepare`; `git diff --check`.
- Critério de conclusão: `/en/introducao` e `/es/introducao` servem conteúdo
  traduzido; `/introducao` idêntica; navegação lateral e busca seguem o
  locale; páginas de release renderizam sob os 3 locales.
- Evidências:
  - `git mv` de `index.md`, `1.introducao.md`, `2.download.md` para
    `content/pt/` (renomes preservados); `content/en/` e `content/es/`
    criados com as mesmas estruturas e prefixos numéricos.
  - `content.config.ts`: coleções `landing_{pt,en,es}` (`include:
    '{locale}/**/index.md'`, `prefix: ''` — `include` sem glob geraria
    path `/pt/index`; o glob fixa a base no diretório do locale) e
    `docs_{pt,en,es}` (`include: '{locale}/**'` + `exclude` do index);
    `releases` inalterada e compartilhada. Paths confirmados: `/`,
    `/introducao`, `/download` iguais aos anteriores.
  - Queries locale-aware com fallback pt: `app.vue` (navigation e search
    sections, keys e `watch` por locale), `pages/index.vue`
    (`landing_{locale}` → `landing_pt`), `pages/[...slug].vue`
    (`docs_{locale}` → `docs_pt`; surroundings por locale). Nomes de
    coleção dinâmicos com cast `keyof Collections`.
  - Links internos do markdown localizados via novo
    `app/components/content/ProseA.vue` (override documentado do mdc):
    hrefs iniciados por `/` passam por `localePath`; externos e âncoras
    inalterados. Decisão registrada: ProseA, não hrefs por arquivo.
  - Demais paths localizados: itens de `queryCollectionNavigation`/
    `queryCollectionSearchSections` (`localizeItems` em `app.vue`),
    `UContentSurround` (`localizedSurround`), `findPageHeadline` comparado
    ao path localizado, selo de versão do `LandingHero`.
  - `verify-landing-assets.mjs`: stub de `useI18n` passou a expor `locale`.
  - Validação: `pnpm exec nuxi prepare` OK; `pnpm generate` com 54 rotas;
    `/en/introducao` em inglês com `href="/en/releases"`, `/es/introducao`
    em espanhol com `href="/es/releases"`, `/introducao` em pt com
    `href="/releases"`; `<title>` da home por locale; os 4 verify scripts
    verdes; `git diff --check` limpo.
  - Pendências conhecidas: `lang`/`og:locale`/hreflang e datas ainda
    fixos em pt-BR (T4); strings de `app.config.ts` (T4); surroundings
    não fazem fallback quando a página cai em pt (cenário inexistente
    hoje — en/es têm paridade de documentos).

## T4 — Chrome do app: seletor de idioma, lang/hreflang, datas, locale do Nuxt UI

- Status: concluída
- Requisitos/aceite: RF-07, RF-08, RF-09, RF-11, RF-12, RNF-03; CA-02,
  CA-05, CA-07
- Dependências: T2, T3
- Escopo e arquivos prováveis: `app/app.vue`,
  `app/components/LocaleSwitcher.vue` (novo), `AppHeader.vue`,
  `LandingFooter.vue`, `app/utils/date.ts`, `app/app.config.ts`,
  `app/pages/releases/index.vue`, `app/pages/releases/[...slug].vue`,
  `app/pages/[...slug].vue`, `i18n/locales/*`
- Implementação: `LocaleSwitcher.vue` com `useSwitchLocalePath` e lista de
  locales do módulo renderizando âncoras reais (acessível por teclado, com
  `aria-label`/`aria-current`); inserido no slot `#right` do `AppHeader` e
  no `LandingFooter`; `htmlAttrs.lang` via `localeProperties.language`;
  `useLocaleHead` com atributos SEO (hreflang, `og:locale`);
  `formatReleaseDate(date, language)` com call sites atualizados; strings
  de `app.config.ts` (título do TOC, "Nesta página", labels dos links de
  rodapé do TOC, créditos) movidas para mensagens e resolvidas com `t()`
  nos pontos de uso; `UApp :locale` mapeado para os pacotes de locale do
  `@nuxt/ui` correspondentes.
- Testes e comandos de validação:
  `NUXT_APP_BASE_URL=/Prosa/ pnpm generate` + `node scripts/preview-static.mjs`;
  conferir `lang`, `alternate`/hreflang e `og:locale` no HTML gerado;
  `PREVIEW_URL=http://127.0.0.1:3100/Prosa/ node
  scripts/verify-landing-browser.mjs` (e rodada equivalente sob `/en/` se o
  script permitir); datas por locale nas páginas de release; `git diff
  --check`.
- Critério de conclusão: CA-02, CA-05 e CA-07 verificados no build gerado;
  seletor funciona com e sem JS.
- Evidências:
  - `app/components/LocaleSwitcher.vue` criado com
    `<SwitchLocalePathLink>` por locale (âncoras reais — funciona sem JS),
    `aria-label` (`locale.switchLabel`) e `aria-current` no locale ativo;
    inserido no `AppHeader` e no `LandingFooter`; chaves `locale.*` nos 3
    arquivos de mensagens.
  - `app/app.vue`: `useLocaleHead({ dir, lang, seo })` substituindo o
    `htmlAttrs.lang` fixo; `<UApp :locale>` mapeado `pt→pt_br`, `en→en`,
    `es→es` (o `@nuxt/ui` não exporta `es_419` — decisão: dicionário `es`).
  - `nuxt.config.ts`: `i18n.baseUrl` = `https://4sllan.github.io/Prosa`
    para alternates/hreflang absolutos corretos no deploy do GitHub Pages.
  - `app/utils/date.ts`: `formatReleaseDate(date, language)`; call sites
    passam `localeProperties.language` (`releases/index`,
    `releases/[...slug]`).
  - `app/app.config.ts`: strings visíveis viraram chaves i18n
    (`releases.inThisVersion`, `docs.githubTitle`, `docs.links.*`,
    `footer.githubLabel`), resolvidas com `t()` em
    `releases/[...slug].vue`, `[...slug].vue` e `AppFooter.vue`.
  - `verify-landing-assets.mjs`: stubs de `useLocaleHead` e dos imports de
    locale do `@nuxt/ui`; `useHead` passou a aceitar getter; imports reais
    são removidos do `<script setup>` antes do `runInNewContext`.
  - Validação: `pnpm generate` com 54 rotas; os 4 verify scripts verdes;
    `git diff --check` limpo.
  - HTML gerado por locale: `lang="pt-BR"|"en-US"|"es-419"`;
    `og:locale` = `pt_BR`/`en_US`/`es_419` + `og:locale:alternate`;
    links `rel="alternate"` absolutos com `hreflang` pt/pt-BR, en/en-US,
    es/es-419 e `x-default`, por página.
  - Seletor no HTML: `/` tem `href="/en"` e `href="/es"` (header+footer);
    `/en` tem `href="/"` e `href="/es"`; `aria-label="Idioma"` traduzido
    em `/es`.
  - Datas por locale: `November 6, 2026` (en), `6 de noviembre de 2026`
    (es-419), pt inalterado.
  - Labels do `app.config` traduzidos: "Prosa no GitHub"/"Prosa on
    GitHub"/"Prosa en GitHub"; TOC "Nesta página"/"On this page"/"En esta
    página".
  - Pendências conhecidas: `verify-landing-browser.mjs` (browser) não
    rodado nesta task — coberto pela T5 junto ao roteiro manual.

## T5 — Validação integral dos CAs e documentação

- Status: concluída
- Requisitos/aceite: RNF-01 a RNF-05; CA-01 a CA-07
- Dependências: T2, T3, T4
- Escopo e arquivos prováveis: `README.md`; evidências deste plano
- Implementação: rodar todos os `scripts/verify-landing-*.mjs`, `pnpm
  generate`, preview estático e `verify-landing-browser.mjs`; roteiro
  manual pelos 3 locales (seletor, fallback de conteúdo, mobile, reduced
  motion); revisar o diff completo (sem segredos, sem artefatos gerados,
  `.data/` intocado); atualizar `README.md` com a seção de i18n (locales,
  esquema de URLs, estrutura `content/<locale>/`, como adicionar traduções
  e a regra das releases em pt-BR).
- Testes e comandos de validação: comandos acima + leitura do README.
- Critério de conclusão: todos os CAs verificados e registrados nas
  evidências; README documenta o comportamento novo.
- Evidências:
  - **Bug real encontrado e corrigido:** `SwitchLocalePathLink` emitia
    `href="/en"`/`/es"` sem o `baseURL` — sob `/Prosa/` os links do seletor
    quebrariam no GitHub Pages. `LocaleSwitcher` passou a usar `NuxtLink`
    com `useSwitchLocalePath()` encapsulado em objeto de rota
    (`{ path: target }`), que o router resolve com o base: hrefs finais
    `/Prosa/`, `/Prosa/en`, `/Prosa/es` com `aria-current` correto.
  - **Ajustes no `verify-landing-browser.mjs`:** (1) footer passou de 7
    para 10 links válidos (seletor) e o conjunto de destinos ganhou
    `/en` e `/es`; (2) o check inicial de motion assumia hidratação+observer
    em ≤300 ms — com o bundle i18n a montagem leva mais, então passou a
    aguardar `heroSettled()` antes de inspecionar `duration`/`delay`
    (asserções preservadas; corrida do harness, não regressão — confirmado
    em Chrome headless comum, onde a página revela normalmente).
  - `NUXT_APP_BASE_URL=/Prosa/ pnpm generate` → 60 rotas; preview estático
    em `/Prosa/` + `verify-landing-browser.mjs` **verde** (todos os blocos:
    motion, fallback sem observer/JS, navegação, 5 larguras, teclado,
    CTA/cards, reduced motion, temas, deep links, busca, cenários de
    download; só warnings Iconify offline já conhecidos).
  - Os 4 `verify-landing-*.mjs` sem browser verdes; `git diff --check`
    limpo; `.data/` intocado; `.output/` ignorado.
  - Spot-checks HTTP no preview: `/Prosa/en/` (`lang=en-US`, título EN,
    `aria-current` no link EN), `/Prosa/es/` (`lang=es-419`, título ES),
    `/Prosa/es/releases` com datas "6 de noviembre de 2026".
  - CAs: CA-01 ✓ (rotas nos 3 locales sob `/Prosa/`); CA-02 ✓ (âncoras
    reais sem JS, rota preservada); CA-03 ✓ (grep por literais pt-BR em
    `app/` sem resultados); CA-04 ✓ (docs en/es traduzidas); CA-05 ✓
    (datas, `og:locale`, hreflang por página); CA-06 ✓ (toda a suíte
    `verify-landing-*`); CA-07 ✓ (UI localizada + notas pt em
    `/en|es/releases`, verificado em T3/T4).
  - `README.md`: nova seção "Internacionalização" (tabela de locales/URLs,
    arquivos de mensagens, coleções por locale, releases em pt, detecção
    desativada, SEO, como estender) e stack atualizada.
  - Pendência aceita: o teste de browser roda apenas sob `/` (pt) —
    asserções são pt-específicas ("em breve", "Ver releases"); a cobertura
    de en/es fica nos checks de HTML gerado.
