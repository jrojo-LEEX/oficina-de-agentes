# Security policy

*En español: para reportar una vulnerabilidad, usa el [reporte privado de GitHub](https://github.com/jrojo-LEEX/oficina-de-agentes/security/advisories/new), nunca un issue público. Puedes escribir en español o en inglés.*

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub:

1. Go to the repository's **Security** tab → **Report a vulnerability**, or open <https://github.com/jrojo-LEEX/oficina-de-agentes/security/advisories/new>.
2. Describe the problem, the version (tray → *Status and help…* shows it), the steps to reproduce and what an attacker would gain.
3. Leave out real transcripts, tokens and personal paths. Made-up data is enough.

We will acknowledge the report, work on a fix in a private advisory, and credit you in the release notes unless you prefer otherwise.

## Supported versions

Only the latest release gets security fixes. The installed app updates itself (unless you turned the check off); the mod updates with `/plugin marketplace update oficina-de-agentes` and `/plugin update oficina@oficina-de-agentes`.

## Scope

In scope:

- The desktop app (`electron/`, `src/`), its installer and portable build.
- The Oficina mod (`plugin/oficina/`) and the marketplace file.
- The release and update pipeline: how releases are built, published and downloaded by the updater.
- Anything that turns a file the app reads (a snapshot, a transcript, the ledger, the config, a replay) into code execution, a write outside the app's folders, or a network request.

Out of scope:

- Claude Code itself: report it to Anthropic.
- Bugs in Electron, Chromium or Node.js themselves: report them upstream (tell us too if the app should take a fix).
- Known, documented trade-offs: the executables are not code-signed, updates are verified by checksum rather than signature, and the Node.js CLI inspect fuse is left on for end-to-end tests. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#security-model).
- Attacks that need someone already running code as your Windows user, unless the app makes them meaningfully worse.

## What the app and the mod access

**The desktop app reads:**

- Claude Code's folder (`CLAUDE_CONFIG_DIR`, or `%USERPROFILE%\.claude`): the mod's live snapshots in `oficina-live\`, the session transcripts in `projects\` (only numeric fields, timestamps, ids, model names, the folder and the custom title; message content is dropped while parsing), and `settings.json`, `plugins\installed_plugins.json` and the `plugin.json` of folders listed in `CLAUDE_CODE_PLUGIN_DIRS` (to tell whether the mod is installed and enabled).
- Its own folder, `%APPDATA%\oficina-de-agentes`.
- A replay file, only when you open one.

**The desktop app writes:**

- Its own folder: `config.json`, `ledger.json` (numbers only), `errors.log`, diagnostics you ask for, and its pages' local storage.
- `Videos\Oficina de agentes`, only when you save a recording.
- Deletes snapshot files in `oficina-live\` whose session has been dead for 24 hours.
- The Windows startup entry, when *Open when Windows starts* is on.

**The desktop app connects** only to GitHub Releases, to check for and download updates. You can turn that off. Its pages cannot reach the network at all. No telemetry, no analytics, no crash reporting.

**The mod** writes one snapshot per session (and, with `OFICINA_LOG=1`, a log) inside the live folder and nowhere else. It uses no network, calls no model and runs no programs. See [its README](plugin/oficina/README.md#privacy).
