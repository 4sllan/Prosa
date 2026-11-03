#!/usr/bin/env node
// Gera/atualiza content/releases/<tag-slug>.md a partir de uma release do GitHub.
// Uso:
//   node scripts/generate-release-content.mjs          -> lê GITHUB_EVENT_PATH
//   node scripts/generate-release-content.mjs <tag>    -> busca na API (GITHUB_TOKEN + GITHUB_REPOSITORY)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const contentDir = join(root, 'content', 'releases')

function slugifyTag(tag) {
  if (typeof tag !== 'string' || !tag || /\s|[/\\]|\.\./.test(tag)) {
    throw new Error(`Tag inválida para nome de arquivo: ${JSON.stringify(tag)}`)
  }
  const slug = tag
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
  if (!slug) {
    throw new Error(`Tag sem caracteres utilizáveis: ${JSON.stringify(tag)}`)
  }
  return slug
}

async function loadRelease() {
  const tag = process.argv[2]
  if (tag) {
    const repo = process.env.GITHUB_REPOSITORY
    const token = process.env.GITHUB_TOKEN
    if (!repo || !token) {
      throw new Error('Modo --tag requer GITHUB_REPOSITORY e GITHUB_TOKEN no ambiente')
    }
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })
    if (!res.ok) {
      throw new Error(`GitHub API respondeu ${res.status} para a tag ${tag}`)
    }
    return await res.json()
  }

  const eventPath = process.env.GITHUB_EVENT_PATH
  if (!eventPath) {
    throw new Error('Defina GITHUB_EVENT_PATH (evento release) ou passe a tag como argumento')
  }
  const event = JSON.parse(readFileSync(eventPath, 'utf8'))
  if (!event.release) {
    throw new Error(`Evento em ${eventPath} não contém "release"`)
  }
  return event.release
}

function renderFile(release) {
  const tag = release.tag_name
  const slug = slugifyTag(tag)
  const title = release.name || tag
  const date = release.published_at || release.created_at
  const prerelease = release.prerelease === true
  const url = release.html_url
  const body = (release.body ?? '').replace(/\r\n/g, '\n').trim()

  const frontmatter = [
    '---',
    `tag: ${JSON.stringify(tag)}`,
    `title: ${JSON.stringify(title)}`,
    `date: ${date}`,
    `prerelease: ${prerelease ? 'true' : 'false'}`,
    `url: ${JSON.stringify(url)}`,
    '---',
    ''
  ].join('\n')

  return { slug, content: `${frontmatter}${body}\n` }
}

const release = await loadRelease()

if (release.draft === true) {
  console.log(`Release ${release.tag_name} é rascunho — nada a fazer.`)
  process.exit(0)
}

const { slug, content } = renderFile(release)
const filePath = join(contentDir, `${slug}.md`)

const alreadyExists = existsSync(filePath)
if (alreadyExists && readFileSync(filePath, 'utf8') === content) {
  console.log(`sem alterações: ${filePath}`)
  process.exit(0)
}

mkdirSync(contentDir, { recursive: true })
writeFileSync(filePath, content)
console.log(`${alreadyExists ? 'atualizado' : 'criado'}: ${filePath}`)
