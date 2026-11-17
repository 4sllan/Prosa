# Prosa

Site do Prosa, com landing page, documentação e notas de versão, gerado com
Nuxt 4 e publicado no GitHub Pages. As notas são alimentadas pelas
**releases publicadas neste repositório** (`4sllan/Prosa`, espelho público de
releases do app).

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
site atualizado (selo da home acompanha a última release estável)
```

- **`content/releases/*.md`** — um arquivo por release, com frontmatter
  (`tag`, `title`, `date`, `prerelease`, `url`) e as notas em markdown. O nome
  do arquivo é a tag slugificada (`v0.6.0` → `v0-6-0.md`) porque URLs com
  sufixo tipo extensão não são pré-renderizadas pelo crawler do Nitro.
- **Home (`/`)** — landing definida em `content/<locale>/index.md` e componentes
  `Landing*`, com hero, seções ilustradas e cards sobre atualizações.
  O selo usa a release estável mais recente com tag e data válidas; fica oculto
  quando não há candidata. Pré-releases não aparecem nesse selo.
- **Animações da home** — entrada sequencial no hero e revelação de textos,
  ilustrações e cards ao entrar na tela, uma vez por montagem. Botões respondem
  ao hover/pressionamento; cards têm realce de hover, mas não são clicáveis.
  Os efeitos respeitam `prefers-reduced-motion`, inclusive mudanças durante a
  sessão, e preservam foco e conteúdo visível sem JavaScript ou observer.
  Header, rodapé e páginas internas não recebem esses efeitos. Não há loops,
  novas dependências nem requisições adicionais para animar.
- **Ilustrações** — SVGs locais e originais, inspirados em `docs/home.png`;
  não são exportações do Figma. A landing mantém o visual escuro sem mudar
  a preferência de tema da documentação.
- **Rodapé da home** — links existentes para documentação, downloads, releases
  e GitHub; itens sem destino aparecem como “Em breve”, sem clique. Destinos
  futuros são definidos em `app/components/LandingFooter.vue`.
- **`/introducao` e `/download`** — documentação e acesso aos instaladores.
  O botão da home detecta a plataforma no cliente e consulta os assets da última
  release no GitHub; se a consulta falhar, mantém o link para a release oficial.
  Sem plataforma reconhecida ou antes do JavaScript, aponta para `/releases`.
- **`/releases`** — histórico completo, com página de detalhe por release.
- **Reprocessamento manual** — `Actions → Conteúdo de release → Run workflow`
  informando a tag.

## Internacionalização

O site é servido em três idiomas com `@nuxtjs/i18n` e estratégia
`prefix_except_default`:

| Idioma | Locale | `lang` | URLs |
| ------ | ------ | ------ | ---- |
| Português (Brasil, padrão) | `pt` | `pt-BR` | `/`, `/introducao`, … |
| Inglês | `en` | `en-US` | `/en/`, `/en/introducao`, … |
| Espanhol (latino-americano) | `es` | `es-419` | `/es/`, `/es/introducao`, … |

- **Textos da interface** — `i18n/locales/{pt,en,es}.json`, consumidos com
  `useI18n()`/`t()` nos componentes e páginas. Chaves visíveis de
  `app.config.ts` (TOC, links) também apontam para essas mensagens.
- **Conteúdo** — `content/<locale>/` com coleções `landing_<locale>` e
  `docs_<locale>` por idioma (`content.config.ts`); as queries fazem fallback
  para `pt` quando um documento não existe no locale ativo. O componente
  `app/components/content/ProseA.vue` localiza links internos do markdown.
- **Notas de versão** — `content/releases/*.md` é compartilhada entre os
  idiomas e permanece em português, pois é gerada automaticamente a partir
  das releases do GitHub.
- **Detecção de idioma** — desativada (`detectBrowserLanguage: false`);
  `/` sempre serve pt-BR sem redirecionar. A troca é feita pelo seletor no
  header e no rodapé da landing, que emite links reais para as outras
  versões (funciona sem JavaScript).
- **SEO** — `lang`, `hreflang`/`x-default` e `og:locale` por página via
  `useLocaleHead`; datas de release formatadas com o locale ativo.
- **Novo idioma ou texto** — adicionar as chaves nos três arquivos de
  `i18n/locales/`, criar o documento correspondente em `content/<locale>/`
  e, para um idioma novo, registrar o locale em `nuxt.config.ts` e as
  coleções em `content.config.ts`.

## Stack

- [Nuxt 4](https://nuxt.com) + Vue 3
- [@nuxt/content](https://content.nuxt.com) — coleções `landing_{pt,en,es}`,
  `docs_{pt,en,es}` e `releases` (`content.config.ts`)
- [@nuxtjs/i18n](https://i18n.nuxt.com) — roteamento e mensagens por locale
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

Validações locais da landing, sem instalar um runner:

```bash
node scripts/verify-landing-hero.mjs
node scripts/verify-landing-motion.mjs
node scripts/verify-landing-art.mjs
node scripts/verify-landing-assets.mjs
node scripts/verify-landing-browser.mjs
```

O teste de navegador usa Chrome instalado, perfil temporário isolado e o preview
em `http://127.0.0.1:3100` por padrão. Inicie um servidor do build nessa porta
antes de executá-lo. `PREVIEW_URL` permite outro endereço local e base path;
`CHROME_EXECUTABLE` permite informar o executável do Chrome.
As requisições externas da página são bloqueadas e a API de releases é simulada.
Os avisos esperados do fallback Iconify são reportados separadamente; os testes
não comprovam disponibilidade real de serviços externos.

O teste de movimento cobre fallbacks, foco, revelação única, cancelamento e
limpeza dos recursos. No navegador, a suíte também verifica rolagem, hover,
toque emulado, movimento reduzido inicial/dinâmico e navegação entre rotas em
360, 390, 768, 1024 e 1440 px. Capturas pausadas e emulação não substituem a
avaliação de fluidez em tempo real ou o teste em aparelho físico.
Na simulação sem `IntersectionObserver`, o conteúdo permanece visível, mas o
prefetch de visibilidade existente do `NuxtLink` gera exceções de construtor.
Somente essas exceções, nesse cenário, são reportadas separadamente; erros em
navegação normal continuam reprovando a suíte.

Para gerar o site com o mesmo prefixo usado em produção:

```bash
NUXT_APP_BASE_URL=/Prosa/ pnpm generate
```

Para servir somente os arquivos gerados sob esse prefixo e executar a validação:

```bash
node scripts/preview-static.mjs
# Em outro terminal:
PREVIEW_URL=http://127.0.0.1:3100/Prosa/ node scripts/verify-landing-browser.mjs
```

O preview estático local monta `.output/public` em `/Prosa/`, responde 404 para
arquivos ausentes e não inicia um servidor SSR. `PORT` e `PREVIEW_BASE_PATH`
permitem ajustar porta e ponto de montagem; o prefixo deve corresponder ao
usado na geração.

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
