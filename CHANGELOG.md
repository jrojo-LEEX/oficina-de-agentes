# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The app and the Oficina mod share one version number.

## [Unreleased]

## [1.0.0] - 2026-10-09

First public release. Oficina de agentes grew out of a private, whip-first desktop toy; this version turns it into a local monitor of your Claude Code agents.

### Added

- **Live office**: each Claude Code session is a boss and each subagent or teammate a character at a desk, with its real state (working, reading, searching, editing, running a tool, waiting for permission, done, failed), an org chart, a same-file hint, a tool trail, the most-touched folders and an offline marker.
- **Interactive mode** (`Ctrl+Alt+L`): hover an agent for its details. `Ctrl+Alt+H` hides or shows the office.
- **Windows notifications** when an agent waits for permission, finishes or fails (bursts merged into one), when a 5-hour or weekly limit passes 80 %, and a weekly summary on Fridays.
- **Spending panel**: active time, tokens and reported cost per project, client, model and session, for today, 7 days, 30 days or overall, with a 30-day chart, a weekday-by-hour map and the live 5-hour and weekly limits. Read incrementally from Claude Code's transcripts; only numbers are stored.
- **First-run guide** (*Status and help*): checks Claude Code's folder and the mod (missing, out of date or turned off), shows the exact commands to copy, counts live sessions and sets the main options.
- **Demo scenes** (tray → Office → Demo scenes) to try the office without Claude Code. They never notify.
- **Spanish and English**, following Windows' language or picked from the tray.
- **Installer and updates**: per-user NSIS installer (no administrator rights) and a portable `.exe`, built by CI. The installed version updates itself from GitHub Releases; the portable one only says a new version is out. The update check can be turned off.
- **Oficina mod as a Claude Code plugin**, installed from this repository's marketplace: `/plugin marketplace add jrojo-LEEX/oficina-de-agentes` and `/plugin install oficina@oficina-de-agentes`.
- **`CLAUDE_CONFIG_DIR` support** in the app and the mod, plus `OFICINA_LIVE_DIR` and `OFICINA_USER_DATA_DIR`.
- **Configurable clients**: `clientFolders` in `config.json` (empty by default).
- **Illustrated style** for the office, besides the original pixel art.
- Unit tests (Vitest) and end-to-end tests (Playwright on the real app).

### Changed

- Renamed from *Látigo* to **Oficina de agentes**. The app's folder moved from `%APPDATA%\latigo-overlay` to `%APPDATA%\oficina-de-agentes`; on first run the old `config.json` and `ledger.json` are copied over (the old folder is left untouched). Recordings now go to `Videos\Oficina de agentes`.
- **The whip is an optional game mode, off by default** (tray → Whip (game mode)). Configs from the old app keep it on.
- The tray menu was rebuilt monitor-first.
- Client grouping no longer assumes `clients` and `clientes` folders; it is off unless configured. Configs from the old app keep both.
- The live snapshot is now a versioned contract (`schemaVersion: 1`) defined once in `plugin/oficina/types/snapshot.d.ts`; the guide asks you to update a mod that is too old.

### Security

- Every file read from disk (snapshots, transcripts, ledger, config) is validated with Zod, field by field; a bad value falls back alone. `config.json` is read with or without a BOM and written atomically.
- Pages run sandboxed with context isolation and a strict Content-Security-Policy; navigation, new windows, permissions and network access are blocked for them.
- IPC is accepted only from the app's own pages and windows.
- Electron fuses: `runAsNode` off, `NODE_OPTIONS` off, app loaded only from `app.asar`, asar integrity validation on.
- No telemetry. The only network call is the optional update check.

[Unreleased]: https://github.com/jrojo-LEEX/oficina-de-agentes/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/jrojo-LEEX/oficina-de-agentes/releases/tag/v1.0.0
