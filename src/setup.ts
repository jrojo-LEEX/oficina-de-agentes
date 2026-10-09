// The first-run guide: is Claude Code here, is the mod installed, are agents
// showing up. It checks again every two seconds while open, so typing the
// commands in Claude Code turns each step green without a click.

import type { SetupPatch, SetupView } from '../electron/shared.ts'
import { setLanguage, t } from './i18n.ts'

type SetupBridge = {
  view: () => Promise<SetupView>
  refresh: () => Promise<SetupView>
  copy: (text: string) => Promise<void>
  save: (patch: SetupPatch) => Promise<SetupView>
  demo: () => Promise<void>
  open: (what: 'repo' | 'releases') => Promise<void>
  close: () => Promise<void>
}

const REFRESH_MS = 2000

const bridge = (window as unknown as { setup: SetupBridge }).setup
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const say = (id: string, text: string) => {
  const element = $(id)

  if (element.textContent !== text) element.textContent = text
}

/** One command to type, with its copy button. */
const commandRow = (command: string) => {
  const row = document.createElement('li')
  const code = document.createElement('code')
  code.textContent = command
  const copy = document.createElement('button')
  copy.type = 'button'
  copy.textContent = t('setup.copy')
  copy.addEventListener('click', () => {
    void bridge.copy(command).then(() => {
      copy.textContent = t('setup.copied')
      setTimeout(() => (copy.textContent = t('setup.copy')), 1500)
    })
  })
  row.append(code, copy)

  return row
}

let shownCommands = ''

const render = (view: SetupView) => {
  setLanguage(view.language)
  document.documentElement.lang = view.language
  document.title = t('setup.title')

  say('title', t('setup.title'))
  say('lead', t('setup.lead'))
  say('privacy', t('setup.privacy'))

  say('claude-title', t('setup.claudeTitle'))
  $('claude').dataset.state = view.hasClaude ? 'ok' : 'missing'
  say(
    'claude-text',
    view.hasClaude
      ? view.isCustomDir
        ? t('setup.claudeCustom', { dir: view.claudeDir })
        : t('setup.claudeOk', { dir: view.claudeDir })
      : t('setup.claudeMissing', { dir: view.claudeDir }),
  )

  say('mod-title', t('setup.modTitle'))
  $('mod').dataset.state = view.mod === 'ok' || view.mod === 'folder' || view.mod === 'seen' ? 'ok' : view.mod === 'missing' ? 'missing' : 'warn'
  const version = view.modVersion || '?'
  say(
    'mod-text',
    {
      ok: t('setup.modOk', { version }),
      folder: t('setup.modOkFolder', { version }),
      seen: t('setup.modSeen', { version }),
      missing: t('setup.modMissing'),
      old: t('setup.modOld'),
      off: t('setup.modDisabled'),
    }[view.mod],
  )

  // Rebuilt only when the commands change, so a copy button's "Copied" survives the refresh.
  const commands = `${view.language}|${view.commands.join('\n')}`

  if (commands !== shownCommands) {
    shownCommands = commands
    $('mod-commands').replaceChildren(...view.commands.map(commandRow))
  }

  $('mod-restart').hidden = view.commands.length === 0
  say('mod-restart', t('setup.modRestart'))

  say('sessions-title', t('setup.sessionsTitle'))
  $('sessions').dataset.state = view.liveSessions > 0 ? 'ok' : 'pending'
  say('sessions-text', view.liveSessions > 0 ? t('setup.sessionsSome', { count: view.liveSessions }) : t('setup.sessionsNone'))
  say('demo', t('setup.demo'))
  say('demo-hint', t('setup.demoHint'))

  say('options-title', t('setup.optionsTitle'))
  say('opt-login-label', t('setup.openAtLogin'))
  say('opt-updates-label', t('setup.updates'))
  say('opt-whip-label', t('setup.whip'))
  say('opt-language-label', t('setup.language'))
  $<HTMLOptionElement>('opt-language').querySelector('option[value="auto"]')!.textContent = t('tray.languages.auto')
  $<HTMLInputElement>('opt-login').checked = view.options.isOpenAtLogin
  $<HTMLInputElement>('opt-updates').checked = view.options.isUpdateCheck
  $<HTMLInputElement>('opt-whip').checked = view.options.isWhipOn
  $<HTMLSelectElement>('opt-language').value = view.options.language

  say('shortcuts', t('setup.shortcuts', view.shortcuts))
  say('version', `${t('app.name')} ${view.appVersion}`)
  say('done', t('setup.done'))
}

const start = async () => {
  render(await bridge.view())

  const save = (patch: SetupPatch) => void bridge.save(patch).then(render)
  $<HTMLInputElement>('opt-login').addEventListener('change', event => save({ isOpenAtLogin: (event.target as HTMLInputElement).checked }))
  $<HTMLInputElement>('opt-updates').addEventListener('change', event => save({ isUpdateCheck: (event.target as HTMLInputElement).checked }))
  $<HTMLInputElement>('opt-whip').addEventListener('change', event => save({ isWhipOn: (event.target as HTMLInputElement).checked }))
  $<HTMLSelectElement>('opt-language').addEventListener('change', event =>
    save({ language: (event.target as HTMLSelectElement).value as SetupPatch['language'] }),
  )
  $('demo').addEventListener('click', () => void bridge.demo())
  $('done').addEventListener('click', () => void bridge.close())
  $('repo').addEventListener('click', () => void bridge.open('repo'))

  setInterval(() => void bridge.refresh().then(render), REFRESH_MS)
}

void start()
