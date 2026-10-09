// A surface module with nothing in it: no imports, one line drawn. Mounted
// beside the office while the office has not loaded, it tells apart a surface
// that loads no module at all from one that cannot load the office's.

import type { ClientModule, JsonValue } from 'claude-code'

const Probe: ClientModule<JsonValue, boolean> = (_props, surface) => {
  const { Text } = surface.elements

  if (surface.state === undefined) {
    surface.setState(true)
    surface.post({ scene: 'probe' })
  }

  return <Text dimColor>·</Text>
}

export default Probe
