// The public repository, in one place: where updates, the plugin's
// marketplace and the help links point. `node scripts/set-repo.mjs owner/name`
// rewrites it here and everywhere else it appears.

export const REPO = 'jrojo-LEEX/oficina-de-agentes'
export const REPO_URL = `https://github.com/${REPO}`
export const RELEASES_URL = `${REPO_URL}/releases/latest`
/** The marketplace's name in Claude Code (its marketplace.json `name`) and the plugin's. */
export const MARKETPLACE = 'oficina-de-agentes'
export const PLUGIN = 'oficina'

/** What a person types in Claude Code to install, update or turn on the mod. */
export const MOD_COMMANDS = {
  install: [`/plugin marketplace add ${REPO}`, `/plugin install ${PLUGIN}@${MARKETPLACE}`],
  update: [`/plugin marketplace update ${MARKETPLACE}`, `/plugin update ${PLUGIN}@${MARKETPLACE}`],
  enable: [`/plugin enable ${PLUGIN}@${MARKETPLACE}`],
}
