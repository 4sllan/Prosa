# Spec — Internacionalização (inglês + espanhol latino-americano)

- **Status:** aprovada
- **Slug:** `i18n-en-es`
- **Repositório:** `4sllan/Prosa` (branch `main`)

## 1. Objetivo e contexto

O site do Prosa é um Nuxt 4 estático (`pnpm generate` → GitHub Pages sob
`/Prosa/`) hoje inteiramente em pt-BR: strings fixas nos componentes Vue e
conteúdo markdown em `content/`. O objetivo é internacionalizar interface e
conteúdo editorial adicionando **inglês** e **espanhol da América do Sul
(castellano)**, mantendo pt-BR como idioma padrão e preservando as URLs
existentes.

## 2. Escopo

**Dentro:**

- Instalação e configuração do módulo `@nuxtjs/i18n` (versão compatível com
  Nuxt 4; exige `pnpm add`, ou seja, acesso à rede e alteração de
  `package.json`/`pnpm-lock.yaml`).
- Locales configurados:
  - `pt` — padrão; tag de idioma `pt-BR`; rotas sem prefixo (`/`, `/releases`, …)
  - `en` — tag `en-US`; prefixo `/en/`
  - `es` — tag `es-419` (BCP 47 para espanhol latino-americano); prefixo `/es/`
- Estratégia de URL `prefix_except_default`.
- Extração de todas as strings fixas da UI (componentes da landing, header,
  footers, páginas, `app.config.ts`) para arquivos de mensagens
  `i18n/locales/{pt,en,es}.*`, traduzidas nos 3 idiomas.
- Reorganização de `content/` por locale para landing e docs
  (`content/pt/`, `content/en/`, `content/es/`), com tradução de `index.md`
  (SEO da home), `introducao` e `download` para en e es.
- Coleções por locale em `content.config.ts` e queries locale-aware em
  `app.vue`, `pages/` e componentes que consultam conteúdo.
- Seletor de idioma visível em todas as páginas, com links reais
  (`switchLocalePath`) para que o crawler do Nitro pré-renderize as rotas
  localizadas.
- `<html lang>`, `og:locale` e hreflang alternates por locale;
  `formatReleaseDate` usando a tag de idioma do locale ativo.
- Localização dos links internos (`NuxtLink`, `localePath`) incluindo links
  internos dentro do markdown.
- Locale do chrome do `@nuxt/ui` (`UApp :locale`) quando houver pacote de
  locale correspondente, sem código extra.

**Fora de escopo:**

- Tradução das notas de release (`content/releases/*.md`): são geradas em
  pt-BR pelo pipeline (`scripts/generate-release-content.mjs` +
  `.github/workflows/release-content.yml`) a partir das releases do GitHub.
  Permanecem em pt-BR, visíveis sob todos os locales. Alterar o pipeline ou
  traduzir releases exigiria outra spec.
- Detecção automática de idioma do navegador com redirect (ver §10).
- RTL, outros idiomas, tradução automática/contínua, slugs traduzidos
  (`/en/introduction` vs `/en/introducao` — slugs permanecem os mesmos).
- Nova suite de testes automatizados (Vitest) — ver §9.

## 3. Requisitos

### Funcionais

- **RF-01:** Rotas servidas em 3 locales com `prefix_except_default`:
  pt em `/`, en em `/en/*`, es em `/es/*`. As URLs pt-BR atuais não mudam.
- **RF-02:** Nenhuma string de UI permanece fixa em pt-BR fora dos arquivos
  de mensagens e do markdown pt — landing (hero, features, cards, selo de
  versão), `LandingFooter`, `AppHeader`/`AppFooter`, `DownloadButton`,
  `DownloadLinks`, páginas `releases/*`, `[...slug].vue` e strings de
  `app.config.ts` (títulos de TOC, créditos, labels de links).
- **RF-03:** Conteúdo markdown por locale em `content/{pt,en,es}/` com a
  mesma estrutura (incluindo prefixos numéricos de ordenação `1.`, `2.`).
  `content/releases/` não é duplicado.
- **RF-04:** `content.config.ts` define coleções por locale
  (ex.: `landing_pt`/`landing_en`/`landing_es` e `docs_pt`/`docs_en`/`docs_es`,
  seguindo o padrão oficial `source: { include: '<locale>/**', prefix: '' }`),
  produzindo os mesmos paths de hoje (`/`, `/introducao`, `/download`).
  A coleção `releases` permanece única e compartilhada.
- **RF-05:** Todas as consultas a conteúdo são locale-aware:
  `queryCollection`, `queryCollectionNavigation`,
  `queryCollectionSearchSections` e `queryCollectionItemSurroundings` usam a
  coleção do locale ativo (fallback pt quando o documento não existir).
  As keys de `useAsyncData` incluem o locale.
- **RF-06:** O path do conteúdo vem de `route.params.slug` (que já exclui o
  prefixo do locale), não de `route.path`.
- **RF-07:** Seletor de idioma acessível (teclado/ARIA) disponível em todas as
  páginas, alternando para a mesma rota no outro idioma via
  `switchLocalePath` e renderizando âncoras reais.
- **RF-08:** `htmlAttrs.lang` recebe a tag `language` do locale ativo
  (`pt-BR`, `en-US`, `es-419`); `og:locale` acompanha; links `alternate`/
  hreflang apontam para as versões equivalentes de cada rota.
- **RF-09:** `formatReleaseDate` recebe a tag de idioma ativa e formata via
  `Intl.DateTimeFormat` (`pt-BR`, `en-US`, `es-419`).
- **RF-10:** Links internos apontam para a rota no locale atual:
  `NuxtLink`/`localePath`/`NuxtLinkLocale` em templates e localização dos
  hrefs internos renderizados a partir do markdown (solução a definir na
  task — ex.: componente `ProseA` customizado).
- **RF-11:** Em `en`/`es`, páginas de release exibem UI localizada
  ("Pré-release", "Publicada em", botões) com o corpo das notas em pt-BR
  (conteúdo gerado, fora de escopo traduzir — ver §2).
- **RF-12:** `UApp` recebe o locale equivalente do `@nuxt/ui` quando
  disponível (rótulos internos como o botão de busca).

### Não funcionais

- **RNF-01:** `pnpm generate` pré-renderiza todas as rotas nos 3 locales a
  partir dos links reais do seletor (sem lista manual de rotas).
- **RNF-02:** Nenhuma regressão de SSR/hidratação; `useI18n` e afins são
  SSR-safe; estado inicial serializável.
- **RNF-03:** SEO: `lang`, `og:locale`, `title`/`description` traduzidos via
  frontmatter/markdown por locale e hreflang entre as 3 versões.
- **RNF-04:** Animações da landing, `prefers-reduced-motion` e linguagem
  visual permanecem inalterados.
- **RNF-05:** Sem novas requisições de rede em runtime; mensagens servidas no
  bundle estático.

## 4. Renderização

Sem mudança de estratégia: continua **estático** via `nuxt generate` no
GitHub Pages com `NUXT_APP_BASE_URL=/Prosa/`. O i18n adiciona os prefixos
`/en/` e `/es/` abaixo do base path (`/Prosa/en/`, `/Prosa/es/`).
`detectBrowserLanguage` permanece desativado: site estático não tem redirect
server-side e a detecção client-side causaria flash/redirect na home (ver
§10).

## 5. Contratos afetados

- `nuxt.config.ts` — módulo `@nuxtjs/i18n` e bloco `i18n` (locales,
  strategy, defaultLocale `pt`, detectBrowserLanguage off).
- `content.config.ts` — coleções multiplicadas por locale para `landing` e
  `docs`; `releases` inalterada.
- `app/app.vue` — queries de navegação/busca por locale, `lang` dinâmico,
  `useLocaleHead` (hreflang), `UApp :locale`.
- `app/pages/[...slug].vue`, `app/pages/releases/[...slug].vue`,
  `app/pages/index.vue`, `app/pages/releases/index.vue` — queries e labels
  locale-aware.
- `app/components/**` — `$t`/`t` no lugar de strings; links com `localePath`.
- `app/utils/date.ts` — assinatura passa a receber a tag de idioma.
- `app/app.config.ts` — strings localizáveis movidas para mensagens (labels
  dos links de TOC viram chaves ou migram para o componente).
- `i18n/locales/{pt,en,es}.json` (novo) — arquivos de mensagens.
- `content/{pt,en,es}/` (novo) — markdown por locale; `content/releases/`
  inalterado.
- Sem rotas Nitro, sem `runtimeConfig`, sem middleware novo, sem tipos
  compartilhados em `shared/`.

## 6. Estado e persistência

- `.data/` (dev) é regenerado ao mudar as coleções — storage local de
  desenvolvimento, sem impacto em produção.
- Não há preferência de idioma persistida: com detecção desativada, o locale
  é determinado exclusivamente pela URL.
- Migração de conteúdo: `git mv` de `content/*.md` para `content/pt/` preserva
  histórico; paths públicos inalterados.

## 7. Autenticação, validação, privacidade

Não se aplica — site público estático, sem autenticação nem dados de usuário.
Os schemas zod existentes das coleções são mantidos/replicados por locale.

## 8. Falhas e recuperação

- Documento sem tradução no locale → fallback para a coleção pt (RF-05),
  conforme padrão documentado do `@nuxt/content`.
- Locale inexistente na URL → comportamento padrão do router (404).
- Mensagens i18n ausentes → fallback da chave/idioma padrão do vue-i18n.
- Offline e erros de rede: inalterados (site estático; a única chamada de
  runtime continua sendo a API de releases do GitHub já existente).

## 9. Critérios de aceite

- **CA-01:** `NUXT_APP_BASE_URL=/Prosa/ pnpm generate` produz `/`, `/en/` e
  `/es/` (e subrotas) com HTML no idioma correto e `lang` correto
  (RF-01, RF-08, RNF-01).
- **CA-02:** O seletor alterna entre os 3 locales mantendo a rota; funciona
  com e sem JavaScript nas páginas pré-renderizadas (RF-07, RNF-01).
- **CA-03:** Inspeção do código não encontra strings pt-BR fixas fora de
  `i18n/locales/pt.*` e `content/pt/` (RF-02).
- **CA-04:** `/en/introducao` e `/es/introducao` exibem conteúdo traduzido;
  `/introducao` segue idêntica em pt (RF-03, RF-05).
- **CA-05:** Datas e `og:locale` seguem o locale; hreflang liga as 3 versões
  de cada rota (RF-08, RF-09, RNF-03).
- **CA-06:** Scripts `scripts/verify-landing-*.mjs` existentes continuam
  passando, com mocks atualizados onde a task exigir (RNF-02).
- **CA-07:** `/en/releases` e `/es/releases` mostram UI localizada com notas
  em pt-BR; `/releases` inalterada (RF-11).

## 10. Estratégia de testes, riscos e decisões

**Validação:** `pnpm build`/`pnpm generate` + `node scripts/preview-static.mjs`
e `verify-landing-browser.mjs` (via `PREVIEW_URL` apontando também para
`/en/` e `/es/`). Roteiro manual por locale em desktop e mobile. Não há
runner instalado; adicionar Vitest + `@nuxt/test-utils` ficaria para spec
própria, se necessário.

**Riscos:**

- `source.prefix`/paths das coleções por locale devem produzir exatamente os
  paths atuais — validar com `pnpm dev`/generate na task que criar as
  coleções antes de seguir.
- Entidades HTML (`&ccedil;`, `&otilde;`…) nos componentes são substituídas
  por UTF-8 direto nas mensagens.
- `useAsyncData` com key fixa serviria conteúdo do locale errado ao trocar de
  idioma sem reload — keys passam a incluir o locale.
- Links internos dentro do markdown apontariam para o locale padrão —
  mitigação definida na task (ProseA customizado ou hrefs já localizados por
  arquivo de conteúdo).
- Mocks dos scripts `verify-landing-*` executam os `<script setup>` —
  precisam de stubs para `useI18n`/`t` se entrarem nesses scripts.

**Decisões registradas (do pedido do usuário):**

- Espanhol latino-americano implementado como `code: 'es'`,
  `language: 'es-419'`, prefixo de URL `/es/`.
- Notas de release permanecem em pt-BR em todos os locales.

**Decisões em aberto:**

- `detectBrowserLanguage` — recomendação: **desativado** (evita redirect
  client-side no site estático). Habilitar exige aceitar flash na primeira
  visita à raiz.
- Posição do seletor — recomendação: header (ao lado do color mode) e item no
  `LandingFooter`.

---

Aguardando aprovação da spec para criar as tasks.
