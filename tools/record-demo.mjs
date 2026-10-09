// Records the README's GIFs from the app's own demo scene: no Claude Code,
// no real data. Starts the built app (npm run build first) against an empty
// throwaway Claude Code folder, plays "Team of six", photographs the office
// ten times a second and has ffmpeg make a GIF of it. Also a still of the
// first-run guide.
//   node tools/record-demo.mjs [es|en]
// Needs ffmpeg on PATH (or FFMPEG naming it).

import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import { _electron as electron } from '@playwright/test'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const language = process.argv[2] === 'en' ? 'en' : 'es'
const suffix = language === 'en' ? '.en' : ''
const FPS = 8
const SECONDS = 13
const ffmpeg = process.env.FFMPEG || 'ffmpeg'

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-demo-'))
const userData = path.join(base, 'app')
const frames = path.join(base, 'frames')
fs.mkdirSync(path.join(base, 'claude', 'projects'), { recursive: true })
fs.mkdirSync(frames, { recursive: true })
fs.mkdirSync(userData, { recursive: true })
fs.writeFileSync(
  path.join(userData, 'config.json'),
  // The options as a newcomer finds them (under test neither Windows' startup nor updates are touched).
  JSON.stringify({ configVersion: 2, language, officeSize: 'm', officeCorner: 'br', officeTheme: 'normal', isOnboarded: false, isOpenAtLogin: true, isUpdateCheck: true }),
)

const env = { ...process.env, CLAUDE_CONFIG_DIR: path.join(base, 'claude'), OFICINA_USER_DATA_DIR: userData, OFICINA_E2E: '1' }
delete env.OFICINA_LIVE_DIR
delete env.CLAUDE_CODE_PLUGIN_DIRS

const app = await electron.launch({ executablePath: path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'), args: [ROOT], env })

const pageOf = async name => {
  for (let i = 0; i < 100; i++) {
    const found = app.windows().find(page => page.url().endsWith(`/${name}`))

    if (found) return found

    await new Promise(resolve => setTimeout(resolve, 200))
  }

  throw new Error(`no ${name}`)
}

try {
  // The guide, as a newcomer first sees it.
  const guide = await pageOf('setup.html')
  await guide.waitForSelector('#mod[data-state="missing"]')
  await guide.setViewportSize({ width: 620, height: 820 })
  // The folder line names this machine's user: a placeholder stands in for the picture.
  await guide.evaluate(text => {
    document.getElementById('claude-text').textContent = text
  }, language === 'en' ? String.raw`Found at C:\Users\ana\.claude` : String.raw`Encontrado en C:\Users\ana\.claude`)
  await guide.screenshot({ path: path.join(ROOT, 'docs', `guide${suffix}.png`) })
  await guide.close()

  const office = await pageOf('index.html')
  await app.evaluate(() => globalThis.__oficinaE2E.scene('team'))
  // A backdrop to photograph the see-through window against.
  await office.evaluate(() => {
    document.body.style.background = '#2b2420'
  })
  await office.waitForSelector('#office:not([hidden])')
  await new Promise(resolve => setTimeout(resolve, 2500))

  for (let i = 0; i < FPS * SECONDS; i++) {
    const started = Date.now()
    const box = await office.evaluate(() => {
      const rect = document.getElementById('office').getBoundingClientRect()

      return { x: Math.max(0, rect.x - 12), y: Math.max(0, rect.y - 12), width: rect.width + 24, height: rect.height + 24 }
    })
    await office.screenshot({ path: path.join(frames, `${String(i).padStart(4, '0')}.png`), clip: box })
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 1000 / FPS - (Date.now() - started))))
  }
} finally {
  await app.close()
}

const out = path.join(ROOT, 'docs', `demo${suffix}.gif`)
const scale = `fps=${FPS},scale=560:-1:flags=lanczos`
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, '%04d.png'), '-vf', `${scale},split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, out])
fs.rmSync(base, { recursive: true, force: true })
console.log(`${out}: ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB`)
