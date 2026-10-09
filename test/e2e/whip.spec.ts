import { expect, test } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'

import { cleanUp, installMod, launch, pageOf, stage } from './fixtures'

const setInteractive = (app: ElectronApplication, isOn: boolean) =>
  app.evaluate((_electron, on) => (globalThis as unknown as { __oficinaE2E: { interactive: (on: boolean) => void } }).__oficinaE2E.interactive(on), isOn)

// Dragging the whip all the way is not tested here: the window covers the whole
// screen, so once it takes the mouse, Windows also hands it the real cursor's
// moves, which a simulated pointer elsewhere can't agree with.

test('in interactive mode the whip offers its handle to be grabbed', async () => {
  const at = stage({ isWhipOn: true, anchor: { x: 500, y: 400 } })
  installMod(at)
  const app = await launch(at)

  try {
    const office = await pageOf(app, 'index.html')
    await setInteractive(app, true)

    // Interactive mode reaches the page a moment later, and the pointer is looked
    // at again only when it moves.
    let nudge = 0
    await expect(async () => {
      nudge = 1 - nudge
      await office.mouse.move(500 + nudge, 400)
      await expect(office.locator('body')).toHaveClass(/can-grab/, { timeout: 250 })
    }).toPass()

    // Passive again: nothing to grab.
    await setInteractive(app, false)
    await expect(async () => {
      nudge = 1 - nudge
      await office.mouse.move(500 + nudge, 400)
      await expect(office.locator('body')).not.toHaveClass(/can-grab/, { timeout: 250 })
    }).toPass()
  } finally {
    await app.close()
    cleanUp(at)
  }
})

test('with the whip off, interactive mode never offers to grab anything there', async () => {
  const at = stage({ isWhipOn: false, anchor: { x: 500, y: 400 } })
  installMod(at)
  const app = await launch(at)

  try {
    const office = await pageOf(app, 'index.html')
    await setInteractive(app, true)

    for (const x of [500, 501, 500, 501]) {
      await office.mouse.move(x, 400)
      await office.waitForTimeout(150)
    }
    await expect(office.locator('body')).not.toHaveClass(/can-grab|is-grabbing/)
  } finally {
    await app.close()
    cleanUp(at)
  }
})
