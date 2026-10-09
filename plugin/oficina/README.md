# oficina

*English below.*

## Español

Plugin de Claude Code que alimenta la app de escritorio **Oficina de agentes**. Escucha los agentes de cada sesión (subagentes, compañeros de equipo y el propio Claude de la sesión) y escribe un resumen por sesión en una carpeta local; la app lee esa carpeta y los dibuja. Incluye además un panel opcional con una oficina en pixel art dentro de la terminal, y un látigo de juguete (apagado por defecto).

### Instalación

En Claude Code:

```text
/plugin marketplace add jrojo-LEEX/oficina-de-agentes
/plugin install oficina@oficina-de-agentes
```

### Qué escribe y dónde

Un archivo por sesión, `<sesión>.json`, reescrito con cada cambio y cada 4 segundos mientras la sesión vive. Su forma está definida en `types/snapshot.d.ts` (`schemaVersion: 1`). Lleva: el id de la sesión, la carpeta en la que corre, la versión del plugin, cada agente (nombre, tipo, estado, actividad, los últimos archivos que tocó y cómo terminaron sus últimas herramientas), el estado del Claude principal, y el uso (tokens, contexto, costo y límites de la cuenta).

La carpeta es la primera que corresponda:

1. `OFICINA_LIVE_DIR`, si está definida;
2. si no, `CLAUDE_CONFIG_DIR` + `/oficina-live`;
3. si no, `.claude/oficina-live` dentro de `USERPROFILE` (o `HOME`).

Una ruta que no sea absoluta se ignora y se pasa a la siguiente regla. El plugin no escribe fuera de esa carpeta. Con `OFICINA_LOG=1` también escribe ahí un registro de diagnóstico, `<sesión>.log`.

### Privacidad

Todo queda en tu equipo: el plugin no usa la red, no llama a ningún modelo (tampoco la demo) y no ejecuta programas. Lee solo los eventos de la sesión, las variables de entorno nombradas aquí, su propio `plugin.json` y la opción `language` de la configuración de Claude Code. Las preferencias del panel las guarda Claude Code en el almacén del plugin.

### Comandos

| Comando | Qué hace |
| --- | --- |
| `/oficina` | Muestra u oculta el panel (el seguimiento sigue aunque esté oculto) |
| `/oficina demo` | Enciende o apaga una demo con agentes simulados |
| `/oficina latigo` | Saca o guarda el látigo (también `/oficina whip`) |

El panel no se abre solo: la vista principal es la app de escritorio. Sus botones cambian la vista, el sonido, la animación, la demo y el látigo.

### Idioma

Español o inglés. Gana el primero que esté definido: `OFICINA_LANG`, la opción `language` de Claude Code, `LC_ALL`, `LANG`. Si parece español (`es`, `es_AR.UTF-8`, `spanish`) habla español; si no, inglés.

### Desarrollo

Desde la raíz del repositorio:

```bash
claude plugin validate plugin/oficina
claude plugin test plugin/oficina
npx tsc -p plugin/oficina
```

`claude --plugin-dir plugin/oficina` carga el plugin desde la carpeta y deja los tipos del motor en `.claude-plugin/types/`, que `tsc` necesita.

## English

A Claude Code plugin that feeds the **Oficina de agentes** desktop app. It listens to each session's agents (subagents, teammates and the session's own Claude) and writes one summary per session to a local folder; the app reads that folder and draws them. It also has an optional pane with a pixel-art office inside the terminal, and a whip toy (off by default).

### Install

In Claude Code:

```text
/plugin marketplace add jrojo-LEEX/oficina-de-agentes
/plugin install oficina@oficina-de-agentes
```

### What it writes, and where

One file per session, `<session>.json`, rewritten on every change and every 4 seconds while the session lives. Its shape is defined in `types/snapshot.d.ts` (`schemaVersion: 1`). It holds: the session id, the folder it runs in, the plugin's version, each agent (name, type, status, activity, the last files it touched and how its last tool calls ended), the main Claude's status, and usage (tokens, context, cost and account limits).

The folder is the first rule that applies:

1. `OFICINA_LIVE_DIR`, when set;
2. else `CLAUDE_CONFIG_DIR` + `/oficina-live`;
3. else `.claude/oficina-live` inside `USERPROFILE` (or `HOME`).

A path that is not absolute is skipped for the next rule. The plugin writes nowhere outside that folder. With `OFICINA_LOG=1` it also writes a diagnostic log there, `<session>.log`.

### Privacy

Everything stays on your computer: the plugin uses no network, calls no model (the demo neither) and runs no programs. It reads only the session's events, the environment variables named here, its own `plugin.json` and Claude Code's `language` setting. Claude Code keeps the pane's preferences in the plugin's store.

### Commands

| Command | What it does |
| --- | --- |
| `/oficina` | Shows or hides the pane (tracking goes on while hidden) |
| `/oficina demo` | Turns a demo with simulated agents on or off |
| `/oficina whip` | Takes the whip in hand or puts it away (also `/oficina latigo`) |

The pane does not open by itself: the desktop app is the main view. Its buttons switch the view, sound, animation, demo and whip.

### Language

Spanish or English. The first one set wins: `OFICINA_LANG`, Claude Code's `language` setting, `LC_ALL`, `LANG`. When it looks Spanish (`es`, `es_AR.UTF-8`, `spanish`) the plugin speaks Spanish; otherwise English.

### Development

From the repository root:

```bash
claude plugin validate plugin/oficina
claude plugin test plugin/oficina
npx tsc -p plugin/oficina
```

`claude --plugin-dir plugin/oficina` loads the plugin from the folder and lays the engine's types in `.claude-plugin/types/`, which `tsc` needs.

## Licencia / License

MIT. The whip sounds in `fx/` are CC0 recordings from BigSoundBank.
