// Runs `claude plugin validate` or `claude plugin test` on the repo's plugin
// and marketplace. The CLI is found on PATH, or named by CLAUDE_BIN.
//   node scripts/plugin.mjs validate | test

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const plugin = join(root, 'plugin', 'oficina')
const claude = process.env.CLAUDE_BIN || 'claude'
const what = process.argv[2]

const run = args => {
  console.log(`> ${claude} ${args.join(' ')}`)
  const result = spawnSync(claude, args, { stdio: 'inherit', shell: process.platform === 'win32' && !process.env.CLAUDE_BIN })

  if (result.error) {
    console.error(`Could not run "${claude}": ${result.error.message}. Install Claude Code or set CLAUDE_BIN to its executable.`)
    process.exit(1)
  }

  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (what === 'validate') {
  run(['plugin', 'validate', plugin])
  run(['plugin', 'validate', root])
} else if (what === 'test') {
  run(['plugin', 'test', plugin])
} else {
  console.error('Usage: node scripts/plugin.mjs validate | test')
  process.exit(2)
}
