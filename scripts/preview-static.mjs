import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'

const root = resolve('.output/public')
const basePath = process.env.PREVIEW_BASE_PATH || '/Prosa/'
const port = Number(process.env.PORT || 3100)
assert.ok(basePath.startsWith('/') && basePath.endsWith('/') && !basePath.includes('..'))
assert.ok(Number.isInteger(port) && port > 0 && port <= 65535)
await stat(join(root, 'index.html'))

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

// Mount generated files under the repository prefix, without an SSR/SPA fallback.
createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end()
    return
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    if (pathname === '/' && basePath !== '/') {
      response.writeHead(302, { Location: basePath }).end()
      return
    }
    assert.ok(pathname.startsWith(basePath))
    let file = resolve(root, pathname.slice(basePath.length))
    const inside = relative(root, file)
    assert.ok(!isAbsolute(inside) && !inside.split(/[\\/]/).includes('..'))
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html')
    const body = await readFile(file)
    response.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-store'
    })
    response.end(request.method === 'HEAD' ? undefined : body)
  } catch {
    const body = await readFile(join(root, '404.html')).catch(() => Buffer.from('Not found'))
    response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(request.method === 'HEAD' ? undefined : body)
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Static preview: http://127.0.0.1:${port}${basePath}`)
})
