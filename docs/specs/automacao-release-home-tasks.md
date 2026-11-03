# Plano de tasks — Automação de releases na página inicial

- **Status geral:** aguardando aprovação
- **Spec de referência:** `docs/specs/automacao-release-home.md` (aprovada)
- **Ordem de execução:** T1 → T2 → T3 → T4 → T5 → T6

## T1 — Módulos Nuxt instalados e configurados

- Status: concluída
- Requisitos/aceite: RF-05, RNF-03
- Dependências: nenhuma
- Escopo e arquivos prováveis: `package.json`, `pnpm-lock.yaml`,
  `nuxt.config.ts`, `app.config.ts` (tema do `@nuxt/ui`, se necessário),
  `app/app.vue`, `app/assets/css/main.css` (import do CSS do Nuxt UI)
- Implementação: `pnpm add @nuxt/content @nuxt/image @nuxt/ui`; registrar os
  módulos em `nuxt.config.ts`; criar `main.css` com os imports exigidos pelo
  Nuxt UI (`@import "tailwindcss"; @import "@nuxt/ui";`) e referenciá-lo em
  `css:`; trocar `<NuxtWelcome />` por `<UApp>` + `<NuxtPage />` (estrutura
  mínima para as páginas da T3). **Requer acesso à rede** para baixar pacotes.
- Testes e comandos de validação: `pnpm install`, `pnpm exec nuxi prepare`,
  `pnpm build`
- Critério de conclusão: build passa com os três módulos ativos; app renderiza
  sem `<NuxtWelcome />`
- Evidências: instalados `@nuxt/content@3.16.2`, `@nuxt/image@2.2.1`,
  `@nuxt/ui@4.12.0` e `better-sqlite3@13.0.3` (peer nativo exigido pelo
  módulo de conteúdo); `pnpm-workspace.yaml` passou a permitir build scripts
  de `better-sqlite3` e `vue-demi` (`allowBuilds` + `onlyBuiltDependencies`);
  `pnpm install` limpo com postinstall/`nuxi prepare` OK; `pnpm build`
  concluído em ~24s sem erros; `git diff --check` limpo. Arquivos alterados:
  `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `nuxt.config.ts`,
  `app/app.vue`, novo `app/assets/css/main.css`. Aviso esperado e resolvido em
  T2: "No content configuration found" do `@nuxt/content`.

## T2 — Coleção `releases` e conteúdo inicial (v0.6.0)

- Status: concluída
- Requisitos/aceite: RF-02, CA-02 (parcial)
- Dependências: T1
- Escopo e arquivos prováveis: `content.config.ts`, `content/releases/v0.6.0.md`
- Implementação: definir coleção `releases` (`type: 'page'`) com schema zod
  do frontmatter (`tag`, `title`, `date`, `prerelease`, `url`); criar o arquivo
  da tag `v0.6.0` já existente como backfill inicial.
- Testes e comandos de validação: `pnpm build`; confirmar que
  `queryCollection('releases')` retorna o documento (verificável em T3 na
  página)
- Critério de conclusão: coleção reconhecida pelo `@nuxt/content` sem erros de
  schema; `v0.6.0.md` presente com frontmatter válido
- Evidências: `content.config.ts` criado com coleção `releases`
  (`type: 'page'`, `source: 'releases/**'`, schema zod com `tag`, `title`,
  `date`, `prerelease`, `url`); `content/releases/v0.6.0.md` criado com dados
  reais da release no GitHub (published_at 2026-11-03T16:49:11Z, corpo
  verbatim). Build: `Processed 2 collections and 1 files`; consulta direta ao
  `.data/content/contents.sqlite` retornou a linha com
  `path: /releases/v0.6.0`. `pnpm build` OK (~21s). Observação: a coluna
  `date` armazena apenas `YYYY-MM-DD` (hora truncada pelo schema `z.date()`) —
  ordenação por data mantida; ties no mesmo dia são caso de borda aceito.
  Achado de contexto: `4sllan/Prosa` é o repo público de releases espelhado do
  app privado `Prosa-app` — a spec permanece correta.

## T3 — Páginas: home com release em destaque, listagem e detalhe

- Status: concluída
- Requisitos/aceite: RF-01, RF-03, RF-06, RF-07, RNF-05, CA-02, CA-03, CA-04
- Dependências: T2
- Escopo e arquivos prováveis: `app/pages/index.vue`,
  `app/pages/releases/index.vue`, `app/pages/releases/[...slug].vue` (ou
  `[tag].vue`), componentes de card/hero em `app/components/` se necessário
- Implementação: home consulta a release estável mais recente
  (`prerelease: false`, ordenada por `date` desc) e renderiza tag, título,
  data e corpo via `<ContentRenderer>`; estado vazio quando a coleção não tem
  releases; `/releases` lista todas em ordem decrescente com selo de
  pré-release; página de detalhe por release; `useSeoMeta`/`useHead` básico.
- Testes e comandos de validação: `pnpm build`, `pnpm generate`,
  `pnpm preview` + inspeção manual de `/` e `/releases` (incl. estado vazio
  simulado)
- Critério de conclusão: home mostra `v0.6.0`; listagem ordenada; estado vazio
  sem exceção; build e generate passam
- Evidências: criados `app/pages/index.vue`, `app/pages/releases/index.vue`,
  `app/pages/releases/[...slug].vue`, `app/layouts/default.vue`,
  `app/utils/date.ts`; `app.vue` passou a usar `NuxtLayout`. Verificado no dev
  server (HTTP 200): home exibe `v0.6.0` com notas, listagem e detalhe
  renderizam; estado vazio validado removendo temporariamente o arquivo de
  conteúdo ("Nenhuma versão publicada ainda", sem exceção); detalhe inexistente
  retorna 404. `pnpm generate` pré-renderizou `/`, `/releases` e
  `/releases/v0-6-0`. Achado: o crawler do Nitro ignora URLs com sufixo de
  extensão — `v0.6.0.md` não pré-renderizava o detalhe; arquivo renomeado para
  `v0-6-0.md` (tag real preservada no frontmatter, spec 5.1 atualizada).
  `git diff --check` limpo. `pnpm build` já havia passado em T2; generate
  cobre client+server+nitro.

## T4 — Script de geração de conteúdo da release

- Status: concluída
- Requisitos/aceite: RF-05 (geração), RNF-04, seção 7 da spec (sanitização)
- Dependências: T2 (schema definido)
- Escopo e arquivos prováveis: `scripts/generate-release-content.mjs`,
  `scripts/fixtures/release-event.json` (payload de exemplo para validação
  local)
- Implementação: script Node puro (sem deps novas) que lê o evento
  `GITHUB_EVENT_PATH` (ou uma tag via argumento + `gh api`/GraphQL com
  `GITHUB_TOKEN`), sanitiza a tag para nome de arquivo seguro (rejeita `..`,
  `/`, espaços) e slugifica (`v0.6.0` → `v0-6-0`, ver nota da spec 5.1 sobre o
  crawler do Nitro), monta frontmatter + corpo e escreve
  `content/releases/<tag-slug>.md` somente se houver mudança (idempotente).
- Testes e comandos de validação: executar o script localmente com a fixture
  (`GITHUB_EVENT_PATH=scripts/fixtures/release-event.json node
  scripts/generate-release-content.mjs`); conferir arquivo gerado; rodar 2× e
  confirmar diff vazio; testar tag maliciosa (`../evil`) → erro/sem escrita
- Critério de conclusão: arquivo correto e idempotente a partir da fixture;
  tag inválida não escreve fora de `content/releases/`
- Evidências: `scripts/generate-release-content.mjs` (Node puro, sem deps)
  com dois modos — `GITHUB_EVENT_PATH` (payload do evento release) ou
  argumento de tag via GitHub API (`GITHUB_REPOSITORY` + `GITHUB_TOKEN`);
  normaliza `\r\n`→`\n` (a API retorna CRLF — confirmado na release real);
  slugifica tag (`v0.6.0`→`v0-6-0`) e rejeita `\s`, `/`, `\`, `..`; pula
  drafts; frontmatter com strings JSON-escapadas. Fixtures: `release-event.json`
  (payload real da v0.6.0) e `release-event.malicious.json` (`../evil`).
  Testes executados: run 1 regenerou `v0-6-0.md` no formato canônico;
  run 2 → "sem alterações" (idempotente); fixture maliciosa → erro exit 1,
  nenhum arquivo criado. Dev server reindexou e `/releases/v0-6-0` segue 200.
  Modo `--tag` não exercitado (sem GITHUB_TOKEN local); lógica trivial de
  fetch — validação real fica para o workflow (T5).

## T5 — Workflow de conteúdo disparado por release

- Status: aguardando validação
- Requisitos/aceite: RF-04, RF-05, CA-01, RNF-02
- Dependências: T4
- Escopo e arquivos prováveis: `.github/workflows/release-content.yml`
- Implementação: trigger `release` (`published`, `edited`, `released`,
  `prereleased`) + `workflow_dispatch` com input `tag` para reprocessamento;
  `permissions: contents: write`; checkout → setup Node 24 + pnpm →
  `pnpm install --frozen-lockfile` → script → `git diff` → commit/push em
  `main` com mensagem `chore(content): release <tag>` e `[skip ci]` para
  evitar loop (risco da seção 11).
- Testes e comandos de validação: revisão estática do YAML (actionlint se
  disponível); validação real depende de release de teste no GitHub —
  registrar como manual pendente se não houver autorização para publicar
  release
- Critério de conclusão: workflow sintaticamente válido, permissões mínimas,
  sem segredos hardcoded; CA-01 marcado como pendente de validação manual se
  a release de teste não for autorizada
- Evidências: `.github/workflows/release-content.yml` criado e validado por
  parse YAML (lib `yaml` do node_modules): triggers `release`
  [published, edited, released, prereleased] + `workflow_dispatch(tag)`;
  `permissions: contents: write`; `concurrency` com `cancel-in-progress:
  false`; passos checkout → Node 24 → script → commit/push condicional a diff.
  Decisões tomadas durante a execução (spec atualizada): (a) **sem `pnpm
  install`** — o script é Node puro; (b) **sem `[skip ci]`** — o commit do bot
  precisa disparar o deploy (T6) e não há loop porque o trigger não inclui
  `push`; (c) inputs e `tag_name` passados via `env:` para evitar injeção de
  shell. **Pendente (validação manual externa):** CA-01 — disparo real exige
  push + release de teste no GitHub; não autorizado/não possível localmente.
  `git diff --check` limpo.

## T6 — Deploy estático (GitHub Pages) e documentação

- Status: concluída
- Requisitos/aceite: RNF-01, RNF-04, CA-02 (deploy)
- Dependências: T3 (site buildável), T5
- Escopo e arquivos prováveis: `.github/workflows/deploy.yml`,
  `README.md` (substituir o starter por descrição do produto, fluxo de
  releases e comandos)
- Implementação: workflow em push para `main` + `workflow_dispatch`:
  `pnpm generate` → `actions/upload-pages-artifact` de `.output/public` →
  `actions/deploy-pages` com `permissions: pages: write, id-token: write` e
  `concurrency` para não publicar deploys simultâneos; `NUXT_APP_BASE_URL`
  conforme o nome do repo (`/Prosa/`); README com funcionamento do pipeline.
  **Pré-requisito externo:** Pages habilitado no repo com source "GitHub
  Actions" — sinalizar ao usuário se necessário.
- Testes e comandos de validação: `pnpm generate` local confirmando baseURL;
  revisão do YAML; deploy real pendente de push/configuração do Pages
- Critério de conclusão: workflow válido e coerente com o alvo Pages; README
  atualizado; limitação de validação registrada
- Evidências: `.github/workflows/deploy.yml` criado — jobs `build`
  (checkout → pnpm → Node 24 → `pnpm install --frozen-lockfile` →
  `pnpm generate` → configure-pages → upload-pages-artifact de
  `.output/public`) e `deploy` (deploy-pages com environment `github-pages`);
  `permissions: contents:read, pages:write, id-token:write`; `concurrency:
  pages`; `NUXT_APP_BASE_URL=/Prosa/` via env do job. `packageManager:
  pnpm@11.18.0` adicionado ao `package.json` (exigido pelo
  `pnpm/action-setup`). README reescrito: pipeline release→site, stack,
  comandos, contrato de conteúdo, pré-requisito do Pages. Validação local:
  YAML parseado OK; `NUXT_APP_BASE_URL=/Prosa/ pnpm generate` pré-renderizou
  `/Prosa/`, `/Prosa/releases`, `/Prosa/releases/v0-6-0` e assets
  `/Prosa/_nuxt/*`; `git diff --check` limpo. **Pendente (externo):** habilitar
  Pages com source "GitHub Actions" no repo e validar o primeiro deploy após
  push — não executável localmente.
