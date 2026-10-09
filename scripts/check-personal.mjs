// Fails when a tracked file holds what looks like someone's own machine: a
// Windows or Unix home folder with a real name in it, or an e-mail address
// that is not a placeholder. Examples in docs and tests use made-up names
// (`ana`, `<usuario>`, `you`), listed below.
//   node scripts/check-personal.mjs

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const PLACEHOLDER_USERS = new Set(['ana', 'you', 'user', 'usuario', 'name', 'nombre', 'runneradmin', 'public', 'default', '%username%', '$env:username', 'me', 'tu-usuario', 'your-name'])
const PLACEHOLDER_MAIL = /@(example\.(com|org)|users\.noreply\.github\.com|anthropic\.com)$/i
const SKIP = /\.(png|wav|ico|gif|jpg|webp|woff2?)$|^package-lock\.json$/

const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' }).split('\n').filter(Boolean)
const found = []

for (const file of files) {
  if (SKIP.test(file)) continue

  let text = ''

  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }

  text.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(/(?:[A-Za-z]:[\\/]+Users[\\/]+|\/home\/|\/Users\/)([^\\/\s'"`<>{}$%)]+)/g)) {
      if (!PLACEHOLDER_USERS.has(match[1].toLowerCase())) found.push(`${file}:${index + 1}: home folder "${match[0]}"`)
    }

    for (const match of line.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)) {
      if (!PLACEHOLDER_MAIL.test(match[0]) && !/^git@github\.com$/.test(match[0])) found.push(`${file}:${index + 1}: e-mail "${match[0]}"`)
    }
  })
}

if (found.length > 0) {
  console.error(`Personal data in the tree:\n${found.join('\n')}`)
  process.exit(1)
}

console.log(`No personal paths or addresses in ${files.length} files.`)
