// The demo: synthetic events that walk three made-up agents through every
// state, through the same registry real agents use. It starts no agent and
// makes no model call; every agent it adds is flagged `isDemo`.

import type { OficinaAgent } from '../types/snapshot'
import { started, toolBegan, toolEnded, turnEnded, waiting, withoutDemo } from './agents.ts'
import { say } from './i18n.ts'
import type { Lang } from './i18n.ts'

/** Half-second steps in one run of the script, after which it starts over. */
export const DEMO_STEPS = 56
export const DEMO_STEP_MS = 500

type Beat = (list: OficinaAgent[], now: number) => OficinaAgent[]

/** The script for one run; each run's agents get ids of their own. */
const script = (run: number, lang: Lang): Record<number, Beat[]> => {
  const A = `demo-explorador-${run}`
  const B = `demo-revisor-${run}`
  const D = `demo-planificador-${run}`
  const tool = (id: string, name: string, detail: string): Beat => (list, now) =>
    toolBegan(toolEnded(list, id), id, name, detail, now)

  return {
    0: [(list, now) => started(list, { id: A, name: say(lang, 'demoExplorer'), type: 'Explore', isDemo: true }, now)],
    3: [(list, now) => started(list, { id: B, name: say(lang, 'demoReviewer'), type: 'general-purpose', isDemo: true, isBackground: true }, now)],
    5: [tool(A, 'Read', 'Read README.md')],
    6: [(list, now) => started(list, { id: D, name: say(lang, 'demoPlanner'), type: 'Plan', isDemo: true }, now)],
    8: [tool(B, 'Edit', 'Edit app.ts')],
    10: [tool(D, 'Bash', 'Bash npm')],
    12: [tool(A, 'Grep', 'Grep TODO')],
    16: [list => waiting(list, B)],
    18: [list => toolEnded(list, A)],
    20: [tool(D, 'Read', 'Read plan.md')],
    24: [tool(B, 'Edit', 'Edit app.ts')],
    26: [tool(A, 'Bash', 'Bash test')],
    30: [list => toolEnded(list, D)],
    34: [(list, now) => turnEnded(list, A, 'answer', now)],
    40: [(list, now) => turnEnded(list, B, 'error', now)],
    46: [(list, now) => turnEnded(list, D, 'answer', now)],
  }
}

/** The registry after the demo's step `step`; step 0 clears the last run first. Its agents are named in `lang`. */
export const demoStep = (list: OficinaAgent[], step: number, now: number, lang: Lang = 'en'): OficinaAgent[] => {
  const at = step % DEMO_STEPS
  let next = at === 0 ? withoutDemo(list) : list

  for (const beat of script(Math.floor(step / DEMO_STEPS), lang)[at] ?? []) {
    next = beat(next, now)
  }

  return next
}
