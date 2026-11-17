# Contribuindo com o Prosa

Obrigado por considerar contribuir com o **Prosa**!
Este repositório contém o site do app — landing page, documentação e notas de
versão — gerado com Nuxt 4 e publicado no GitHub Pages.

Este documento explica como contribuir com código, conteúdo, documentação,
relatos de bug e melhorias.

---

## 📌 Formas de contribuir

- 🐛 Reportando bugs
- 💡 Sugerindo novas funcionalidades
- 📖 Melhorando o conteúdo e a documentação
- 🎨 Ajustando componentes e ilustrações da landing
- 🔧 Corrigindo bugs
- 🚀 Melhorando performance, acessibilidade ou SEO

---

## 🐞 Reportando bugs

Antes de abrir uma issue:

1. Pesquise as issues existentes para evitar duplicatas.
2. Confirme que o problema ocorre na versão publicada mais recente.
3. Use o template **Bug Report** ao criar a issue.

Inclua no relato:

- Navegador e versão
- Sistema operacional e dispositivo
- URL da página afetada (`/`, `/introducao`, `/download`, `/releases`, ...)
- Passos para reproduzir
- Comportamento esperado vs. comportamento observado
- Capturas de tela ou logs do console, se possível

---

## 💡 Sugerindo funcionalidades

Sugestões são bem-vindas! Use o template **Feature Request** e inclua:

- Uma descrição clara da funcionalidade
- O problema que ela resolve
- Ideias de implementação (opcional)

Para dúvidas e conversas abertas, prefira as
[Discussions](https://github.com/4sllan/Prosa/discussions).

---

## 🛠 Setup de desenvolvimento

Requisitos: **Node 24** e **pnpm 11**.

```bash
git clone https://github.com/4sllan/Prosa.git
cd Prosa
pnpm install    # instala dependências (roda nuxi prepare)
pnpm dev        # dev server em http://localhost:3000
```

Build e pré-render:

```bash
pnpm build      # build de produção em .output/
pnpm generate   # pré-render estático em .output/public
pnpm preview    # serve o build localmente
```

Para gerar com o mesmo base path de produção (`/Prosa/`):

```bash
NUXT_APP_BASE_URL=/Prosa/ pnpm generate
node scripts/preview-static.mjs   # serve .output/public em /Prosa/
```

---

## 📝 Contribuindo com conteúdo

O conteúdo do site vive em `content/` e é organizado em coleções
(`landing`, `docs` e `releases`, definidas em `content.config.ts`):

- **`content/index.md`** — textos da landing page.
- **`content/1.introducao.md`**, **`content/2.download.md`** — páginas de
  documentação. O prefixo numérico define a ordem na navegação.
- **`content/releases/*.md`** — **gerados automaticamente** pelo workflow
  `release-content.yml` a partir das releases do GitHub. **Não edite esses
  arquivos manualmente** — correções nas notas devem ser feitas na própria
  release ou via `Actions → Conteúdo de release → Run workflow`.

### Validações da landing

Antes de abrir PR com mudanças na home, rode os scripts de verificação:

```bash
node scripts/verify-landing-hero.mjs
node scripts/verify-landing-motion.mjs
node scripts/verify-landing-art.mjs
node scripts/verify-landing-assets.mjs
node scripts/verify-landing-browser.mjs   # requer Chrome e preview em :3100
```

Veja o [README](../README.md) para detalhes de cada validação, incluindo o
teste de navegador (`PREVIEW_URL`, `CHROME_EXECUTABLE`).

---

## 🌿 Estratégia de branches

1. Faça um fork do repositório.
2. Crie uma branch a partir de `main`:

```bash
git checkout -b feat/minha-feature
```

| Tipo     | Exemplo                     |
| -------- | --------------------------- |
| Feature  | `feat/secao-faq`            |
| Fix      | `fix/botao-download-safari` |
| Docs     | `docs/atualiza-introducao`  |
| Refactor | `refactor/landing-hero`     |

## ✍️ Commits

Escreva mensagens descritivas em português. Para mudanças estruturais,
o formato de Conventional Commits também é aceito:

```text
feat(landing): adiciona seção de depoimentos
fix(download): corrige detecção de plataforma no Firefox
docs: atualiza guia de contribuição
```

## 📦 Pull Requests

Antes de abrir o PR, confirme que:

- [ ] `pnpm generate` executa sem erros
- [ ] As validações da landing passam (se a home foi alterada)
- [ ] O conteúdo/documentação foi atualizado quando necessário
- [ ] Nenhum arquivo desnecessário foi incluído
- [ ] O PR tem uma descrição clara do que muda e por quê

## 🔐 Vulnerabilidades de segurança

**Não abra uma issue pública.** Reporte de forma privada via
[GitHub Security Advisory](https://github.com/4sllan/Prosa/security/advisories/new).
Veja a [política de segurança](SECURITY.md).

## ❤️ Comunidade

Seja respeitoso e construtivo nas discussões. Queremos um ambiente
acolhedor para todos os contribuidores.

## 🙌 Obrigado

Obrigado por ajudar a melhorar o Prosa!
