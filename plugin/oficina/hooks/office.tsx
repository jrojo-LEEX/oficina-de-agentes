// The surface module: runs where the pane is drawn, owns the scene, the
// pointer and the frame clock, and posts what happened to the hooks module.

import type { ClientModule, JsonValue } from 'claude-code'

import { say } from './i18n.ts'
import { World } from './scene/world.ts'
import type { SceneProps } from './scene/world.ts'

type State = { world: World; frame: number }

/** The frame clock: 25 steps a second while something moves. */
const TICK_MS = 40
/** With nothing but typing going on, one frame in this many is drawn. */
const AMBIENT_EVERY = 4
/** A redraw at least this often, so the elapsed times keep counting. */
const CLOCK_EVERY = 25

const Office: ClientModule<JsonValue, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  let state = surface.state

  if (state === undefined) {
    const world = new World()
    let ticks = 0
    state = { world, frame: 0 }
    surface.setState(state)
    // Loaded: the pane stops waiting on the scene.
    surface.post({ scene: 'ready' })

    const redraw = () => surface.setState({ world, frame: (surface.state?.frame ?? 0) + 1 })

    surface.every(TICK_MS, () => {
      ticks += 1
      world.resize(surface.columns, surface.rows)
      // A fixed step per tick: the scene runs on the surface's own clock.
      const { events, isBusy } = world.step(TICK_MS / 1000)

      if (events.length > 0) {
        surface.post({ events })
      }

      if (isBusy || (!world.props.isPaused && ticks % AMBIENT_EVERY === 0) || ticks % CLOCK_EVERY === 0) {
        redraw()
      }
    })

    surface.onPointer(event => {
      if (world.pointer(event)) {
        redraw()
      }
    })
  }

  const { world } = state
  world.props = props as unknown as SceneProps
  world.resize(surface.columns, surface.rows)

  if (world.canvas.columns === 0) {
    return <Text dimColor>{say(world.props.lang ?? 'en', 'opening')}</Text>
  }

  return (
    <Box flexDirection="column">
      {world.draw().map(runs => (
        <Text wrap="truncate-end">
          {runs.map(run =>
            run.color || run.backgroundColor ? (
              <Text color={run.color} backgroundColor={run.backgroundColor}>
                {run.text}
              </Text>
            ) : (
              run.text
            ),
          )}
        </Text>
      ))}
    </Box>
  )
}

export default Office
