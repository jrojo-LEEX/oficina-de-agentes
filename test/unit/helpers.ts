import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach } from 'vitest'

const made: string[] = []

/** A fresh temporary folder, removed after the test. */
export const tempDir = (name = 'oficina') => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))
  made.push(dir)

  return dir
}

afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

/** Writes `data` as JSON at `file`, making its folders. */
export const writeJson = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data))
}
