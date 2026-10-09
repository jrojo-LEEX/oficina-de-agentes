import { expect, test } from '@playwright/test'

import { cleanUp, command, installMod, launch, notesOf, pageOf, stage, writeSession, writeTranscript } from './fixtures'

test('the first run guides a newcomer: Claude Code found, the mod missing, then installed', async () => {
  const at = stage({ isOnboarded: false })
  const app = await launch(at)

  try {
    const guide = await pageOf(app, 'setup.html')

    await expect(guide.locator('#claude')).toHaveAttribute('data-state', 'ok')
    await expect(guide.locator('#claude-text')).toContainText('CLAUDE_CONFIG_DIR')
    await expect(guide.locator('#mod')).toHaveAttribute('data-state', 'missing')
    await expect(guide.locator('#mod-commands code')).toHaveText(['/plugin marketplace add jrojo-LEEX/oficina-de-agentes', '/plugin install oficina@oficina-de-agentes'])

    // The person types the two commands in Claude Code; the guide notices by itself.
    installMod(at)
    await expect(guide.locator('#mod')).toHaveAttribute('data-state', 'ok')
    await expect(guide.locator('#mod-commands code')).toHaveCount(0)

    // A session starts: the guide says so.
    writeSession(at, 'ses-1', 'tienda', [{ id: 'a1', name: 'Explorador' }])
    await expect(guide.locator('#sessions')).toHaveAttribute('data-state', 'ok')
  } finally {
    await app.close()
    cleanUp(at)
  }
})

test('the guide speaks English when asked to', async () => {
  const at = stage({ isOnboarded: false, language: 'en' })
  const app = await launch(at)

  try {
    const guide = await pageOf(app, 'setup.html')

    await expect(guide.locator('#mod-text')).toHaveText('Missing. In Claude Code, type these two commands:')
    await expect(guide.locator('#done')).toHaveText('Done')
  } finally {
    await app.close()
    cleanUp(at)
  }
})

test('with no session yet, the corner says what to do', async () => {
  const at = stage()
  installMod(at)
  const app = await launch(at)

  try {
    const office = await pageOf(app, 'index.html')

    await expect(office.locator('#empty')).toBeVisible()
    await expect(office.locator('#empty')).toHaveText('Abre Claude Code y lanza un agente')
  } finally {
    await app.close()
    cleanUp(at)
  }
})

test('two sessions with agents show up in the office, and a finished agent sends a notification', async () => {
  const at = stage()
  installMod(at)
  writeSession(at, 'ses-1', 'tienda', [
    { id: 'a1', name: 'Explorador', type: 'Explore', activity: 'reading' },
    { id: 'a2', name: 'Revisor' },
  ])
  writeSession(at, 'ses-2', 'blog', [{ id: 'b1', name: 'Planificador', type: 'Plan' }])
  const app = await launch(at)

  try {
    const office = await pageOf(app, 'index.html')
    const roster = office.locator('#roster li')

    await expect(roster).toHaveCount(5)
    // Sessions in order of their ids: ses-1 (tienda), then ses-2 (blog).
    await expect(roster).toContainText(['tienda · Claude · working', 'tienda · Explorador · trabajando', 'tienda · Revisor · trabajando', 'blog · Claude · working', 'blog · Planificador · trabajando'])
    await expect(office.locator('#office')).toBeVisible()
    await expect(office.locator('#empty')).toBeHidden()

    // The Explorer finishes; the reviewer asks for permission.
    writeSession(at, 'ses-1', 'tienda', [
      { id: 'a1', name: 'Explorador', type: 'Explore', status: 'done' },
      { id: 'a2', name: 'Revisor', activity: 'waiting' },
    ])
    writeSession(at, 'ses-2', 'blog', [{ id: 'b1', name: 'Planificador', type: 'Plan' }])

    await expect.poll(async () => (await notesOf(app)).map(note => note.title)).toEqual(
      expect.arrayContaining(['Explorador terminó', 'Revisor espera tu permiso']),
    )
    await expect(roster).toContainText(['tienda · Explorador · terminó'])
  } finally {
    await app.close()
    cleanUp(at)
  }
})

test('the spending panel adds up the transcripts of every session', async () => {
  const at = stage()
  installMod(at)
  writeTranscript(at, 'aaaaaaaa-0000-0000-0000-000000000001', 'C:/work/tienda', { input: 1000, output: 500, cacheRead: 9000 })
  writeTranscript(at, 'aaaaaaaa-0000-0000-0000-000000000002', 'C:/work/blog', { input: 2000, output: 1500, cacheRead: 1000 })
  const app = await launch(at)

  try {
    const office = await pageOf(app, 'index.html')
    await command(app, 'spend')
    const panel = office.locator('#spend')

    await expect(panel).toBeVisible()
    await expect(office.locator('#spend-total')).toContainText('2 sesiones')
    // 1000 + 500 + 2000 + 1500 new tokens, 2000 of them output, 10 000 read from cache.
    await expect(office.locator('#spend-total')).toContainText('5,0 k tokens nuevos (2,0 k de salida) y 10,0 k leídos de caché')
    await expect(office.locator('#spend-rows tr')).toHaveCount(2)
    await expect(office.locator('#spend-rows')).toContainText('tienda')
    await expect(office.locator('#spend-rows')).toContainText('blog')
  } finally {
    await app.close()
    cleanUp(at)
  }
})
