// A tiny static server for the update test: serves one folder (an
// electron-builder output with latest.yml) on 127.0.0.1, nothing else.
//   node scripts/serve-feed.mjs <folder> <port>

import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, normalize, relative, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? 'feed')
const port = Number(process.argv[3] ?? 8765)

createServer((request, response) => {
  const name = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname)
  const file = normalize(join(root, name))
  const inside = relative(root, file)

  if (inside.startsWith('..') || inside === '') {
    response.writeHead(404).end()
    return
  }

  try {
    const { size } = statSync(file)
    response.writeHead(200, { 'content-length': size })
    createReadStream(file).pipe(response)
  } catch {
    response.writeHead(404).end()
  }
}).listen(port, '127.0.0.1', () => console.log(`feed: ${root} on http://127.0.0.1:${port}/`))
