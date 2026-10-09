import { execFileSync } from 'node:child_process'

import { expect, test } from '@playwright/test'

import { cleanUp, launch, stage } from './fixtures'

// An installed version finds a newer one on a feed, downloads it and
// installs it. CI serves a build with a higher version on a local feed
// (OFICINA_UPDATE_URL) and runs this against the installed app; locally it
// is skipped.
const FEED = process.env.OFICINA_UPDATE_URL
const NEXT = process.env.OFICINA_E2E_NEXT_VERSION
const EXE = process.env.OFICINA_E2E_EXE

/** The product version Windows reads from an .exe. */
const versionOf = (exe: string) =>
  execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Item -LiteralPath '${exe.replace(/'/g, "''")}').VersionInfo.ProductVersion`], { encoding: 'utf8' }).trim()

test('an installed version updates itself to the newer one on the feed', async () => {
  test.skip(!FEED || !NEXT || !EXE, 'needs OFICINA_UPDATE_URL, OFICINA_E2E_NEXT_VERSION and an installed OFICINA_E2E_EXE')
  test.setTimeout(240_000)

  const at = stage()
  const app = await launch(at)
  const before = await app.evaluate(({ app: electronApp }) => electronApp.getVersion())

  expect(before).not.toBe(NEXT)

  await app.evaluate(() => (globalThis as unknown as { __oficinaE2E: { checkUpdates: () => void } }).__oficinaE2E.checkUpdates())
  await expect
    .poll(() => app.evaluate(() => (globalThis as unknown as { __oficinaE2E: { updateState: () => { kind: string; version: string } } }).__oficinaE2E.updateState()), {
      timeout: 180_000,
    })
    .toEqual({ kind: 'ready', version: NEXT })

  // Installs and restarts; the installer replaces the .exe in place.
  const closed = app.waitForEvent('close')
  await app.evaluate(() => (globalThis as unknown as { __oficinaE2E: { installUpdate: () => void } }).__oficinaE2E.installUpdate())
  await closed

  await expect.poll(() => versionOf(EXE!), { timeout: 120_000, intervals: [2000] }).toBe(NEXT)

  // The new version left running by the installer is closed by the workflow.
  cleanUp(at)
})
