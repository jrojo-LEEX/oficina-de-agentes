// The mod's words, in Spanish and English: two tables with the same keys.
// `{name}` in a string is filled by `say`. Pure: the language is picked by
// `langOf` from what the hooks module read (variables, settings).

export type Lang = 'es' | 'en'

export const ES = {
  commandDescription: 'Muestra u oculta el panel de la oficina (o: /oficina demo, /oficina latigo)',
  commandHint: '[demo|latigo]',
  demoOn: 'Demo encendida: agentes simulados, sin llamadas a modelos.',
  demoOff: 'Demo apagada.',
  whipOn: 'Látigo en mano.',
  whipOff: 'Látigo guardado.',
  paneHidden: 'Oficina oculta. El seguimiento de agentes sigue.',
  paneFailed: 'No se pudo mostrar el panel de la oficina: {reason}',
  paneOpened: 'Oficina abierta.',
  noSound: 'Sin sonido en este equipo: {reason}',
  active: 'En curso: {n}',
  activeWaiting: 'En curso: {n} ({waiting} esperando tu permiso)',
  done: 'Terminados: {n}',
  failed: 'Fallidos: {n}',
  unknown: 'Sin datos: {n}',
  demoBanner: 'DEMO: agentes simulados',
  agent: 'agente',
  sceneFailedProbe: 'La escena de la oficina no cargó en esta pantalla, aunque un módulo mínimo sí. Mientras tanto, los agentes se muestran como lista.',
  sceneFailed: 'Esta pantalla no carga las escenas de los mods, así que aquí no hay oficina dibujada. En la terminal, con `claude`, sí. Mientras tanto, los agentes se muestran como lista.',
  whipButtonOn: 'Látigo: en mano',
  whipButtonOff: 'Látigo: guardado',
  viewWide: 'Vista: amplia',
  viewCompact: 'Vista: compacta',
  soundOff: 'Sonido: no',
  soundOn: 'Sonido: {percent}%',
  quieter: 'Vol −',
  louder: 'Vol +',
  animationPaused: 'Animación: pausada',
  animationOn: 'Animación: sí',
  demoButtonOn: 'DEMO: encendida',
  demoButton: 'Demo',
  hide: 'Ocultar',
  opening: 'Abriendo la oficina…',
  working: 'trabajando',
  reading: 'leyendo',
  searching: 'buscando',
  editing: 'editando',
  tool: 'usando una herramienta',
  waiting: 'espera tu permiso',
  idle: 'en espera',
  finished: 'terminó',
  failedAs: 'falló',
  stateUnknown: 'estado desconocido',
  typeUnknown: 'tipo desconocido',
  whipHint: 'Haz clic y arrastra donde sea para agarrar el látigo; sacúdelo sobre ellos',
  emptyOffice: 'Sin agentes en curso: irán llegando aquí',
  pickHint: 'Haz clic en un agente para ver sus detalles',
  demoExplorer: 'Explorador',
  demoReviewer: 'Revisor',
  demoPlanner: 'Planificador',
}

export type Strings = typeof ES
export type StringKey = keyof Strings

export const EN: Strings = {
  commandDescription: 'Shows or hides the office pane (or: /oficina demo, /oficina whip)',
  commandHint: '[demo|whip]',
  demoOn: 'Demo on: simulated agents, no model calls.',
  demoOff: 'Demo off.',
  whipOn: 'Whip in hand.',
  whipOff: 'Whip put away.',
  paneHidden: 'Office hidden. Agent tracking goes on.',
  paneFailed: 'The office pane could not be shown: {reason}',
  paneOpened: 'Office open.',
  noSound: 'No sound on this computer: {reason}',
  active: 'Running: {n}',
  activeWaiting: 'Running: {n} ({waiting} waiting for your permission)',
  done: 'Finished: {n}',
  failed: 'Failed: {n}',
  unknown: 'No data: {n}',
  demoBanner: 'DEMO: simulated agents',
  agent: 'agent',
  sceneFailedProbe: 'The office scene did not load on this screen, though a minimal module did. Meanwhile, the agents are shown as a list.',
  sceneFailed: 'This screen does not load mod scenes, so no office is drawn here. In the terminal, with `claude`, it is. Meanwhile, the agents are shown as a list.',
  whipButtonOn: 'Whip: in hand',
  whipButtonOff: 'Whip: put away',
  viewWide: 'View: wide',
  viewCompact: 'View: compact',
  soundOff: 'Sound: off',
  soundOn: 'Sound: {percent}%',
  quieter: 'Vol −',
  louder: 'Vol +',
  animationPaused: 'Animation: paused',
  animationOn: 'Animation: on',
  demoButtonOn: 'DEMO: on',
  demoButton: 'Demo',
  hide: 'Hide',
  opening: 'Opening the office…',
  working: 'working',
  reading: 'reading',
  searching: 'searching',
  editing: 'editing',
  tool: 'using a tool',
  waiting: 'waiting for your permission',
  idle: 'idle',
  finished: 'finished',
  failedAs: 'failed',
  stateUnknown: 'unknown state',
  typeUnknown: 'unknown type',
  whipHint: 'Click and drag anywhere to pick up the whip; shake it over them',
  emptyOffice: 'No agents running: they will show up here',
  pickHint: 'Click an agent to see its details',
  demoExplorer: 'Explorer',
  demoReviewer: 'Reviewer',
  demoPlanner: 'Planner',
}

export const TABLES: Record<Lang, Strings> = { es: ES, en: EN }

/** The string under `key` in `lang`, each `{name}` filled from `vars`. */
export const say = (lang: Lang, key: StringKey, vars: Record<string, string | number> = {}): string =>
  TABLES[lang][key].replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole))

const SPANISH = /^(es([-_.@]|$)|spa|espa|castellano)/i

/**
 * Spanish when the first value given looks Spanish (`es`, `es_AR.UTF-8`,
 * `spanish`, `español`), else English. Each value is a language tag, a
 * locale or a language's name; empty and absent ones are skipped.
 */
export const langOf = (values: readonly unknown[]): Lang => {
  const first = values.find((value): value is string => typeof value === 'string' && value.trim() !== '')

  return first !== undefined && SPANISH.test(first.trim()) ? 'es' : 'en'
}
