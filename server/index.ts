import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPhotoHandler } from './photoCoordinates.ts'
import { PHOTO_ENDPOINT } from '../src/photoUpload.ts'

const root = fileURLToPath(new URL('../dist/', import.meta.url))
const photo = createPhotoHandler()
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.pdf': 'application/pdf' }
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (path === PHOTO_ENDPOINT) { await photo(req, res); return }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return }
    const file = resolve(root, '.' + decodeURIComponent(path === '/' ? '/index.html' : path))
    if (!file.startsWith(resolve(root) + sep)) { res.writeHead(403); res.end(); return }
    const bytes = await readFile(file)
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' })
    res.end(req.method === 'HEAD' ? undefined : bytes)
  } catch { res.writeHead(404); res.end('Not found. Run npm run build before npm start.') }
})
server.requestTimeout = 90_000
server.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '127.0.0.1', () => console.log('BetterPlan server listening on port', (server.address() as { port: number }).port))
