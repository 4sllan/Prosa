# Spec — Automação de releases na página inicial

- **Status:** aprovada
- **Slug:** `automacao-release-home`
- **Repositório:** `4sllan/Prosa` (branch `main`)

## 1. Objetivo e contexto

O Prosa é um site Nuxt 4 recém-iniciado (`app/app.vue` ainda exibe o starter).
O objetivo é construir o site com `@nuxt/content`, `@nuxt/image` e `@nuxt/ui` e
criar uma automação de CI que, sempre que uma release do repositório for
publicada ou editada, atualize o conteúdo do site para que a página inicial
exiba as informações da release mais recente (versão, título, data e notas).

## 2. Escopo

**Dentro:**
- Instalação e configuração de `@nuxt/content`, `@nuxt/image` e `@nuxt/ui`.
- Coleção de conteúdo `releases` em `content/releases/*.md` com frontmatter
  padronizado.
- Página inicial (`/`) renderizando a release publicada mais recente e página
  de histórico/listagem de releases.
- Script Node (`scripts/`) que converte os dados de uma release do GitHub em
  um arquivo markdown da coleção.
- Workflow GitHub Actions (`.github/workflows/`) disparado por eventos de
  release, que executa o script, comita o resultado em `main` e dispara o
  build/deploy.
- Conteúdo inicial para a tag `v0.6.0` já existente (backfill da release atual).

**Fora de escopo:**
- Modelo de branching Git Flow (develop/release/hotfix) — "gitflow" aqui
  significa o workflow de CI.
- Releases de outros repositórios/produtos; apenas `4sllan/Prosa`.
- Autenticação, busca, i18n, comentários, RSS/feed.
- Suite de testes automatizados (ver seção 9).
- Tema visual completo/identidade de marca além do necessário para exibir as
  releases com `@nuxt/ui`.

## 3. Requisitos

### Funcionais

- **RF-01:** A página inicial (`/`) deve exibir a release **publicada** mais
  recente: tag, título, data de publicação e corpo das notas renderizado a
  partir de markdown.
- **RF-02:** Deve existir uma coleção `releases` via `@nuxt/content`, com um
  arquivo por release em `content/releases/<tag>.md`, contendo frontmatter com
  `tag`, `title`, `date`, `prerelease` e `url` (link para a release no GitHub).
- **RF-03:** Deve existir uma página de histórico (`/releases`) listando todas
  as releases em ordem decrescente de data, com link para o detalhe de cada uma.
- **RF-04:** O workflow deve ser acionado pelos eventos `release` dos tipos
  `published`, `edited`, `released` e `prereleased`. Eventos `created`
  (rascunho) e `deleted` ficam fora do disparo nesta versão.
- **RF-05:** O workflow deve executar o script de geração, que escreve/atualiza
  `content/releases/<tag-slug>.md` de forma **idempotente** (mesma release →
  mesmo conteúdo), e comitar o resultado em `main` usando `GITHUB_TOKEN`, com
  mensagem de commit padronizada (ex.: `chore(content): release vX.Y.Z`).
- **RF-06:** Quando não houver nenhuma release publicada, a página inicial deve
  exibir um estado vazio amigável (sem erro de renderização).
- **RF-07:** Releases marcadas como `prerelease` devem ser identificadas
  visualmente e **não** devem ocupar o destaque da home se existir release
  estável mais recente.

### Não funcionais

- **RNF-01:** O site deve ser gerável estaticamente via `pnpm generate` e
  também funcionar com `pnpm build` (SSR híbrido do Nuxt 4).
- **RNF-02:** Nenhum segredo no bundle do cliente; o workflow usa somente
  `GITHUB_TOKEN` com permissões mínimas (`contents: write`).
- **RNF-03:** Imagens devem passar por `@nuxt/image`; componentes de UI por
  `@nuxt/ui`, preservando SSR/hidratação corretos (sem APIs de browser no
  setup).
- **RNF-04:** Falha do workflow não pode deixar o site publicado em estado
  inconsistente: o commit de conteúdo e o build são etapas separadas; se o
  build falhar, o deploy anterior permanece.
- **RNF-05:** O site deve manter acessibilidade básica (landmarks, contraste,
  heading order) e responsividade.

## 4. Estratégia de renderização

- **Estático como alvo principal:** `pnpm generate` pré-renderiza todas as
  páginas (`/` e `/releases/*`), pois o conteúdo só muda quando uma release é
  publicada — cenário ideal para estático.
- O conteúdo é versionado no próprio repo; não há fetch em runtime para a
  GitHub API no cliente. Toda atualização passa pelo pipeline commit → build →
  deploy.

## 5. Contratos afetados

### 5.1 Frontmatter da coleção `releases`

O nome do arquivo usa a tag **slugificada** (`v0.6.0` → `v0-6-0.md`), pois o
crawler de pré-render do Nitro ignora URLs com sufixo semelhante a extensão de
arquivo — `path` resulta em `/releases/v0-6-0`. A tag real permanece no campo
`tag` (exibição) e na `url`. Verificado em T3: `/releases/v0.6.0` não era
pré-renderizado; com o arquivo slugificado, a página é gerada estaticamente.

```yaml
---
tag: v0.6.0
title: "v0.6.0"
date: 2025-10-28T00:00:00Z
prerelease: false
url: https://github.com/4sllan/Prosa/releases/tag/v0.6.0
---
```

Corpo do arquivo: notas da release (markdown vindo do campo `body` da release,
sanitizado de HTML perigoso pelo parser do `@nuxt/content`).

### 5.2 Workflow

- Arquivo: `.github/workflows/release-content.yml`
- Trigger: `on: release: types: [published, edited, released, prereleased]`
- Passos: checkout → setup Node 24 → `node
  scripts/generate-release-content.mjs` (lê `github.event.release` ou consulta
  a API com `GITHUB_TOKEN` no modo `--tag` do `workflow_dispatch`) →
  commit/push se houver diff. O script é Node puro — não requer `pnpm
  install`.
- Workflow de deploy (se GitHub Pages — ver decisão em aberto): trigger em push
  para `main` + `workflow_dispatch`; `pnpm generate` → upload de
  `.output/public` → deploy Pages.

### 5.3 Rotas Nitro / runtimeConfig

Não se aplica: não há endpoints `server/` nem variáveis sensíveis; o site é
estático e o token vive apenas no runner do GitHub Actions.

## 6. Estado, persistência e migrações

- Persistência = arquivos markdown em `content/releases/`, versionados no git.
- Sem banco de dados, sem `.data/` em produção. Migrações: não se aplica.

## 7. Segurança e validação

- `GITHUB_TOKEN` com `permissions: contents: write` apenas no job que comita;
  job de deploy com `pages: write` + `id-token: write` (se Pages).
- O corpo da release é conteúdo do próprio mantenedor do repo; ainda assim, a
  renderização via `@nuxt/content` não injeta HTML arbitrário por padrão.
- Validar nome de arquivo derivado da tag para impedir path traversal: o
  script deve sanitizar a tag (`/`, `..`, espaços → rejeitar ou normalizar)
  antes de escrever o arquivo. A slugificação (`v0.6.0` → `v0-6-0`) já reduz o
  nome a caracteres seguros, mas a validação contra `..` e separadores de
  diretório continua obrigatória.

## 8. Falhas e recuperação

- Workflow falha → nenhum commit é feito; site permanece na versão anterior.
- Release editada → mesma tag, arquivo sobrescrito com novo conteúdo.
- Release publicada e depois a action falha → re-run manual do workflow via
  `workflow_dispatch` reproduz o arquivo (idempotente).
- Home sem releases → estado vazio renderizado normalmente (RF-06).

## 9. Critérios de aceite

- **CA-01 (RF-05, RF-04):** Publicar/editar uma release de teste dispara o
  workflow, que cria/atualiza `content/releases/<tag>.md` e comita em `main`.
- **CA-02 (RF-01, RNF-01):** `pnpm build` e `pnpm generate` concluem sem erro;
  a home renderiza tag, título, data e notas da última release estável.
- **CA-03 (RF-03):** `/releases` lista todas as releases em ordem decrescente.
- **CA-04 (RF-06):** Com `content/releases/` vazio, a home renderiza o estado
  vazio sem exceções.
- **CA-05 (RNF-02):** Nenhum token ou valor de `runtimeConfig` privado aparece
  no bundle do cliente.
- **CA-06 (RF-07):** Uma prerelease não assume o destaque da home quando há
  release estável mais recente; é exibida com indicador de "pré-release".

## 10. Estratégia de testes e validação

- Não há runner de testes no projeto; a validação é por comandos de build
  (`pnpm build`, `pnpm generate`, `pnpm preview`) e inspeção manual da home e
  de `/releases`.
- O workflow é validado com uma release de teste (pode ser `v0.0.0-test` marcada
  como prerelease, removível depois) ou via `workflow_dispatch` com input de
  tag.
- Validação de segurança: `git diff --check`, revisão do diff e grep por
  tokens no `.output/`.

## 11. Riscos

- **Loop de CI:** mitigado por desenho — o workflow de conteúdo só é acionado
  por eventos `release` e `workflow_dispatch`, nunca por `push`; o commit do
  bot em `main` não pode re-dispará-lo. **Não** usar `[skip ci]`: o commit de
  conteúdo precisa disparar o workflow de deploy (push em `main`), senão o
  site não atualiza.
- **Permissões:** `GITHUB_TOKEN` padrão pode ser read-only conforme
  configuração do repo — declarar `permissions` explícitas no workflow.
- **Deploy:** se o alvo for plataforma externa (Vercel/Netlify), o passo de
  deploy muda para deploy hook; spec assume GitHub Pages por padrão.
- **Conteúdo malicioso na tag:** nomes de tag com caracteres especiais podem
  quebrar o nome do arquivo — sanitização obrigatória (seção 7).

## 12. Decisões em aberto

1. **Destino de deploy:** GitHub Pages (assumido) × Vercel/Netlify/outro.
2. **Prerelease na home:** ocultar do destaque (assumido, RF-07) × exibir com
   selo.
3. **Abrangência visual:** estrutura mínima funcional (home + listagem +
   detalhe) × design mais elaborado.
