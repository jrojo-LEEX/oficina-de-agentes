# Architecture

Oficina de agentes is two pieces that never talk to each other directly. They share files on disk.

```text
Claude Code session ──(function hooks)──▶ Oficina mod ──writes──▶ <Claude Code folder>/oficina-live/<session>.json
                                                                              │
Claude Code ──writes──▶ <Claude Code folder>/projects/**/*.jsonl              │ read every 0.7 s
                                  │                                           ▼
                                  └──── read every 60 s, incrementally ──▶ Desktop app (Electron)
```

## The two pieces

| Piece | Where | What it does |
| --- | --- | --- |
| **Oficina mod** | `plugin/oficina/` | A Claude Code plugin. It listens to each session's agents (subagents, teammates and the session's own Claude) and rewrites one snapshot per session on every change and every 4 seconds. It also has an optional in-terminal pane (`/oficina`). See [its README](../plugin/oficina/README.md). |
| **Desktop app** | `electron/` (main process), `src/` (pages) | A transparent, always-on-top, click-through window over one display. It reads the snapshots, draws the office, sends Windows notifications and builds the spending ledger from Claude Code's transcripts. |

The mod is distributed through this repository's Claude Code marketplace (`.claude-plugin/marketplace.json`). The app is distributed through GitHub Releases.

### Main process modules

| File | Role |
| --- | --- |
| `electron/main.ts` | Windows, click-through switch, global shortcuts, tray, first-run guide, notifications, IPC, hardening |
| `electron/paths.ts` | Every folder: Claude Code's (`CLAUDE_CONFIG_DIR` or `~/.claude`), the live folder, the transcripts, the app's own folder |
| `electron/config.ts` | `config.json`: per-field validation with Zod, migration from the old app's shape, atomic writes |
| `electron/snapshot.ts` | The snapshot schema the app accepts, and the "mod is too old" check |
| `electron/live.ts` | Reads the live folder each poll |
| `electron/changes.ts` | Turns two consecutive polls into notifications |
| `electron/ledger.ts` | The spending ledger, read incrementally from the transcripts |
| `electron/setup.ts` | What the first-run guide checks |
| `electron/updater.ts` | electron-updater against GitHub Releases |
| `electron/scenes.ts` | Demo scenes, generated in-process |
| `electron/i18n.ts`, `electron/locales/` | Spanish and English tables, shared with the pages |
| `electron/repo.ts` | The public repository's `owner/name`, in one place |

Modules other than `main.ts`, `preload.ts`, `setup-preload.ts` and `updater.ts` do not import Electron, so the tests can load them directly.

## The snapshot contract

`plugin/oficina/types/snapshot.d.ts` is the **only** definition of the snapshot file. The mod writes it; the app imports these types and checks at compile time that its Zod schema (`electron/snapshot.ts`) agrees with them in both directions.

At run time the app trusts nothing in the file:

- A file must name its session and carry an `agents` array, or it is skipped.
- Every other field falls back to a default on its own; an agent that does not fit is dropped alone; strings and lists are capped; unknown fields are ignored.
- Files over 2 MB, and more than 500 files per poll, are not read.
- A session whose file has not changed for 45 seconds is gone; files dead for 24 hours are deleted by the app.

**`schemaVersion` policy.** The current version is `1`.

- New **optional** fields do not bump it. Older apps ignore them.
- A change that would **break an older reader** (removing or renaming a field, changing a type or a meaning) bumps it.
- The app reads any version as far as the fields fit. A snapshot with a lower `schemaVersion` than the app's `SCHEMA_VERSION`, or a `modVersion` below `MIN_MOD_VERSION`, makes the guide and the corner badge ask the person to update the mod.

## Data files

| File | Written by | Holds |
| --- | --- | --- |
| `<Claude Code folder>/oficina-live/<session>.json` | Mod | The live snapshot: session id, folder, agent names and types, state, a short detail (tool plus a file name, the first word of a command, or a search pattern, at most 22 characters), the paths of the last files touched, how the last tool calls ended, usage and limits |
| `<Claude Code folder>/oficina-live/<session>.log` | Mod, only with `OFICINA_LOG=1` | A diagnostic log |
| `%APPDATA%\oficina-de-agentes\config.json` | App | Settings ([fields](../README.en.md#configuration)) |
| `%APPDATA%\oficina-de-agentes\ledger.json` | App | Spending: numbers only, never message content (see below) |
| `%APPDATA%\oficina-de-agentes\errors.log` | App | Errors from the pages |
| `%APPDATA%\oficina-de-agentes\diagnostico-*.json` | App, on request | Window and mode state for "it got stuck" reports |
| The pages' local storage, inside `%APPDATA%\oficina-de-agentes` | App | Today's report (agent names, types, session labels, times), whip counters and achievements |
| `Videos\Oficina de agentes\` | App, on request | Clips, timelapses (WebM) and replays (JSON): the office's pixels and the names under the desks, never the screen |

`OFICINA_USER_DATA_DIR` moves the app's folder; `OFICINA_LIVE_DIR` moves the live folder for both pieces.

**The ledger** reads only these fields of each transcript line: `sessionId`, `cwd`, `type`, `customTitle`, `timestamp`, `isSidechain`, `message.id`, `message.model` and `message.usage`. Everything else is dropped while parsing. It stores, per session: id, project name and path, last folder, custom title, first and last timestamps, active time per day and per hour, token counts per day and per model, model names with answer counts, the cost Claude Code reported while the mod watched, and the ids of the last 60 answers (to count each once). Per transcript file it stores the path, size and read offset. A damaged ledger is discarded and rebuilt from the transcripts; only the reported costs are lost.

## Security model

The app reads local files that other processes write, and shows them. It has no server, no account and no telemetry.

**Pages (renderers)**

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`.
- A strict Content-Security-Policy in each HTML file: `default-src 'none'`, scripts only from the app's own files, no `object`, `base-uri 'none'`, `form-action 'none'`, `frame-ancestors 'none'`. The guide also has `connect-src 'none'`.
- No navigation: `will-navigate`, `will-redirect` and `will-attach-webview` are prevented, and `window.open` is denied, for every web contents.
- No network for pages: the default session cancels every `http`, `https`, `ws`, `wss` and `ftp` request. The updater runs in its own session, so it is not affected.
- Every permission request (camera, notifications, and so on) is denied.
- The preloads expose a handful of named functions, never `ipcRenderer` itself.

**IPC**

- The main process accepts a message only when the sending frame's URL is one of the app's own pages **and** the sender is the expected window (the overlay or the guide).
- Settings patches from a page are checked field by field against the config schema; a value that does not fit as given is ignored.
- The guide can copy to the clipboard only the exact commands it shows, and open only two URLs: the repository and its latest release.
- Recordings are written only with a plain file name of the expected shape, only into the recordings folder, and under a size cap. Replays are read under 25 MB, parsed as JSON and checked field by field; nothing in them runs.

**Electron fuses** (set at packaging, in `package.json` → `build.electronFuses`)

| Fuse | Value | Why |
| --- | --- | --- |
| `runAsNode` | off | The app's `.exe` cannot be used as a plain Node.js runtime |
| `enableNodeOptionsEnvironmentVariable` | off | `NODE_OPTIONS` cannot inject code |
| `onlyLoadAppFromAsar` | on | Only the packaged `app.asar` is loaded |
| `enableEmbeddedAsarIntegrityValidation` | on | A modified `app.asar` is refused |
| `enableCookieEncryption` | on | Cookies on disk are encrypted |
| `grantFileProtocolExtraPrivileges` | off | `file://` pages get no extra privileges |
| `enableNodeCliInspectArguments` | **on** | Left on on purpose, so Playwright can drive the packaged app in CI. It means a local user can attach a debugger to the app with `--inspect`; that user can already run code as themselves |

**Updates and signing.** The executables are not code-signed in v1 (`verifyUpdateCodeSignature: false`). electron-updater verifies each download against the SHA-512 in the release's `latest.yml`. That detects corruption, not a compromised release. Releases are built by CI from a tagged commit.

**The mod** uses no network, calls no model and runs no programs. It writes only inside the live folder.
