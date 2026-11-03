# Prosa

Site de notas de versão do Prosa, gerado com Nuxt 4 e publicado no GitHub
Pages. O conteúdo é alimentado automaticamente pelas **releases publicadas
neste repositório** (`4sllan/Prosa`, espelho público de releases do app).

## Como funciona

```text
release publicada/editada no GitHub
        │
        ▼
.github/workflows/release-content.yml
        │  roda scripts/generate-release-content.mjs
        │  e escreve content/releases/<tag-slug>.md
        ▼
commit em main ("chore(content): release <tag>")
        │
        ▼
.github/workflows/deploy.yml
        │  pnpm generate → deploy no GitHub Pages
        ▼
site atualizado (home destaca a última release estável)
```

- **`content/releases/*.md`** — um arquivo por release, com frontmatter
  (`tag`, `title`, `date`, `prerelease`, `url`) e as notas em markdown. O nome
  do arquivo é a tag slugificada (`v0.6.0` → `v0-6-0.md`) porque URLs com
  sufixo tipo extensão não são pré-renderizadas pelo crawler do Nitro.
- **Home (`/`)** — destaca a release estável mais recente; pré-releases só
  aparecem em destaque (com selo) se não houver release estável.
- **`/releases`** — histórico completo, com página de detalhe por release.
- **Reprocessamento manual** — `Actions → Conteúdo de release → Run workflow`
  informando a tag.

## Stack

- [Nuxt 4](https://nuxt.com) + Vue 3
- [@nuxt/content](https://content.nuxt.com) — coleção `releases`
  (`content.config.ts`)
- [@nuxt/ui](https://ui.nuxt.com) — componentes e tema
- [@nuxt/image](https://image.nuxt.com) — otimização de imagens
- pnpm 11 + Node 24

## Desenvolvimento

```bash
pnpm install    # instala dependências (roda nuxi prepare)
pnpm dev        # dev server em http://localhost:3000
pnpm build      # build de produção em .output/
pnpm generate   # pré-render estático em .output/public
pnpm preview    # serve o build localmente
```

Para regenerar um arquivo de release localmente a partir de um payload de
evento:

```bash
GITHUB_EVENT_PATH=scripts/fixtures/release-event.json \
  node scripts/generate-release-content.mjs
```

## Deploy

O deploy é feito via GitHub Pages com source **"GitHub Actions"** (precisa
estar habilitado em `Settings → Pages`). Todo push em `main` — incluindo os
commits de conteúdo feitos pelo workflow de releases — dispara o build
estático e a publicação. O site é servido sob o base path `/Prosa/`
(`NUXT_APP_BASE_URL` definido no workflow de deploy).
