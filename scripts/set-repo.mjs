// Points the project at another GitHub repository: the updater, the
// marketplace, the install commands and every link.
//   node scripts/set-repo.mjs owner/name

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const next = process.argv[2] ?? ''

if (!/^[\w.-]+\/[\w.-]+$/.test(next)) {
  console.error('Usage: node scripts/set-repo.mjs owner/name')
  process.exit(2)
}

const current = /REPO = '([^']+)'/.exec(readFileSync('electron/repo.ts', 'utf8'))?.[1]

if (!current) throw new Error('electron/repo.ts has no REPO')

const [owner, name] = next.split('/')
const [oldOwner, oldName] = current.split('/')
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter(file => file && !/\.(png|wav|gif|ico)$|package-lock\.json$/.test(file))
let changed = 0

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  let out = text.split(current).join(next)

  if (file === 'package.json') {
    out = out.replace(`"owner": "${oldOwner}"`, `"owner": "${owner}"`).replace(`"repo": "${oldName}"`, `"repo": "${name}"`)
  }

  if (out !== text) {
    writeFileSync(file, out)
    changed += 1
    console.log(`  ${file}`)
  }
}

console.log(`${current} → ${next} in ${changed} files.`)
