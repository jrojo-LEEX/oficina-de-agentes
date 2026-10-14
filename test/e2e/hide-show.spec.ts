import { expect, test } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'

import { cleanUp, installMod, launch, pageOf, stage } from './fixtures'

type Hooks = {
  interactive: (on: boolean) => void
  visible: (on: boolean) => void
  mouse: () => { isVisible: boolean; isInteractive: boolean; isCapturing: boolean }
  cursor: { x: number; y: number } | null
}

/** A hand is never perfectly still: the pointer is sent again only when it moves. */
const nudged = (point: { x: number; y: number }, beat: number) => ({ x: point.x + (beat % 2), y: point.y })

const hooks = (app: ElectronApplication) => ({
  interactive: (isOn: boolean) => app.evaluate((_e, on) => (globalThis as unknown as { __oficinaE2E: Hooks }).__oficinaE2E.interactive(on), isOn),
  visible: (isOn: boolean) => app.evaluate((_e, on) => (globalThis as unknown as { __oficinaE2E: Hooks }).__oficinaE2E.visible(on), isOn),
  mouse: () => app.evaluate(() => (globalThis as unknown as { __oficinaE2E: Hooks }).__oficinaE2E.mouse()),
  /** The real cursor, in window coordinates (the window covers the work area). */
  cursorAt: (point: { x: number; y: number } | null) =>
    app.evaluate(({ BrowserWindow }, at) => {
      const bounds = BrowserWindow.getAllWindows()[0]!.getBounds()
      ;(globalThis as unknown as { __oficinaE2E: Hooks }).__oficinaE2E.cursor = at && { x: at.x + bounds.x, y: at.y + bounds.y }
    }, point),
})

// The whip's handle sits at the anchor. A real cursor on it makes the window
// take the mouse; after hiding and showing the office it must do so again.
const HANDLE = { x: 500, y: 400 }
let beat = 0
const ELSEWHERE = { x: 1200, y: 700 }

/** Waits for the main process's capture flag while the cursor jiggles where it is. */
const captureIs = (h: ReturnType<typeof hooks>, at: { x: number; y: number }, want: boolean, message: string) =>
  expect
    .poll(
      async () => {
        await h.cursorAt(nudged(at, beat++))

        return (await h.mouse()).isCapturing
      },
      { message },
    )
    .toBe(want)

test('hiding and showing the office leaves the whip grabbable, however many times', async () => {
  const at = stage({ isWhipOn: true, anchor: HANDLE })
  installMod(at)
  const app = await launch(at)
  const h = hooks(app)

  try {
    const office = await pageOf(app, 'index.html')
    await h.interactive(true)
    await captureIs(h, HANDLE, true, 'before hiding, cursor on the handle')

    for (let cycle = 1; cycle <= 20; cycle++) {
      await h.visible(false)
      // Hidden is passive: nothing invisible holds the mouse.
      await expect.poll(async () => (await h.mouse()).isCapturing, { message: `cycle ${cycle}: hidden` }).toBe(false)

      await h.visible(true)
      await captureIs(h, HANDLE, true, `cycle ${cycle}: shown again, cursor on the handle`)
      // The page agrees with the main process (a real mouse moving over the window
      // competes with the simulated one, so it is looked at again until they meet).
      await expect(async () => {
        await h.cursorAt(nudged(HANDLE, beat++))
        await expect(office.locator('body')).toHaveClass(/can-grab/, { timeout: 300 })
      }).toPass()
    }
  } finally {
    await app.close()
    cleanUp(at)
  }
})

test('the whip can be grabbed after showing, also when the cursor arrives later', async () => {
  const at = stage({ isWhipOn: true, anchor: HANDLE })
  installMod(at)
  const app = await launch(at)
  const h = hooks(app)

  try {
    const office = await pageOf(app, 'index.html')
    await h.interactive(true)

    for (let cycle = 1; cycle <= 10; cycle++) {
      await h.visible(false)
      await h.visible(true)
      await captureIs(h, ELSEWHERE, false, `cycle ${cycle}: cursor away`)

      await captureIs(h, HANDLE, true, `cycle ${cycle}: cursor on the handle`)
      // The page agrees with the main process (a real mouse moving over the window
      // competes with the simulated one, so it is looked at again until they meet).
      await expect(async () => {
        await h.cursorAt(nudged(HANDLE, beat++))
        await expect(office.locator('body')).toHaveClass(/can-grab/, { timeout: 300 })
      }).toPass()
      // The hand leaves. While the window holds the mouse the page gets the real
      // moves (a test has none to give), so the next hide and show tells the rest.
      await h.cursorAt(ELSEWHERE)
    }
  } finally {
    await app.close()
    cleanUp(at)
  }
})
