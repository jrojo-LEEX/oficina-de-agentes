# Contributing

Thanks for helping. *Resumen en español [al final](#resumen-en-español).*

Before you start, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the app and the mod are two pieces that share files, and the snapshot contract between them has rules.

## Setup

You need Windows 10 or 11, [Node.js 22.18 or newer](https://nodejs.org/) and Git. Claude Code is needed only for the mod's own tests.

```powershell
git clone https://github.com/jrojo-LEEX/oficina-de-agentes.git
cd oficina-de-agentes
npm ci
npm start
```

- `npm ci` downloads Electron in `postinstall`. If the binary is ever missing: `node node_modules/electron/install.js`.
- Keep the clone in a short path: Electron does not start when the full path passes Windows' 260-character limit.
- To try a change to the mod, start Claude Code with `claude --plugin-dir plugin/oficina`.
- To keep your real data out of the way, point the app at throwaway folders with `CLAUDE_CONFIG_DIR`, `OFICINA_LIVE_DIR` and `OFICINA_USER_DATA_DIR` (see the [README](README.en.md#environment-variables)).

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Builds and opens the app |
| `npm run build` | Compiles the main process (`tsc`) and the pages (Vite) |
| `npm run typecheck` | Type-checks the pages, the main process and the tools |
| `npm run lint` / `npm run format` | Biome: check, or format in place |
| `npm test` | `test:legacy` and `test:unit` |
| `npm run test:legacy` | The older suites in `test/*.test.ts`, on `node:test` (Node runs the TypeScript directly) |
| `npm run test:unit` | Vitest suites in `test/unit/` |
| `npm run test:e2e` | Playwright end-to-end tests on the real app |
| `npm run test:plugin` | `claude plugin test` on the mod |
| `npm run validate:plugin` | `claude plugin validate` on the mod and on the marketplace |
| `npm run selftest` | Opens the app with a simulated hand; writes `selftest-out/report.json` and screenshots |
| `npm run icon` | Draws `build/icon.png` |
| `npm run pack` | Unpacked build in `release\win-unpacked\` |
| `npm run dist` | Installer and portable `.exe` in `release\`, not published |
| `npm run release` | Builds and publishes to GitHub Releases. CI runs this; you should not |

## Tests

- **Unit**: new modules get Vitest tests in `test/unit/`. Modules that do not import Electron can be tested directly; keep it that way.
- **End-to-end**: `npm run build`, then `npm run test:e2e`. Each test starts the app against a throwaway Claude Code folder and app folder. To test the packaged app instead, set `OFICINA_E2E_EXE` to its `.exe` (for example after `npm run pack`). `OFICINA_UPDATE_URL` points the updater at a local feed.
- **Mod**: `npm run test:plugin` and `npm run validate:plugin` need the `claude` CLI on `PATH`, or `CLAUDE_BIN` set to its executable. `npx tsc -p plugin/oficina` needs the engine's types, which `claude --plugin-dir plugin/oficina` lays down.
- Never use real transcripts, real session data or real paths in tests or fixtures. Use made-up names like `C:\work\tienda` or `acme`.

## Code style

- TypeScript, formatted like the existing code: two spaces, single quotes, no semicolons. Run `npm run lint` before you push.
- **Comments in English**, saying why rather than what.
- **No user-facing text in code.** Every text goes in **both** `electron/locales/es.ts` and `electron/locales/en.ts`, with the same keys (a test checks it). The mod's texts live in `plugin/oficina/hooks/i18n.ts`, under the same rule. Spanish uses neutral *tú* ("Abre", "Instala").
- Validate anything read from disk or from a page (Zod), and let a bad value fall back alone instead of failing the whole file.
- Snapshot changes: edit `plugin/oficina/types/snapshot.d.ts` first. New optional fields are fine; a change that breaks older readers bumps `schemaVersion` (see [the policy](docs/ARCHITECTURE.md#the-snapshot-contract)).
- No new network calls, telemetry or analytics. The update check is the only one, and it stays optional.

## Commits and pull requests

- One topic per commit. Subject in the imperative, sentence case, no trailing period, about 70 characters at most ("Add the weekly limit to the footer"). Add a body when the reason is not obvious.
- Open an issue first for anything large, so we can agree on the approach.
- A pull request says what changed and why, how you tested it, and has a screenshot or a short clip for visible changes (a demo scene is perfect for that).
- **Never paste transcripts, snapshots, ledgers, diagnostics or logs with personal paths** in issues or pull requests. Replace names and paths first.
- Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Cutting a release

1. Bump the version in **all three** places, to the same `X.Y.Z`:
   - `package.json` (`npm version X.Y.Z --no-git-tag-version` also updates `package-lock.json`);
   - `plugin/oficina/.claude-plugin/plugin.json`;
   - the `oficina` entry in `.claude-plugin/marketplace.json`.
2. If the snapshot shape changed in a breaking way, bump `OficinaSchemaVersion` in `plugin/oficina/types/snapshot.d.ts` and the value the mod writes (`plugin/oficina/hooks/register.tsx`), and `SCHEMA_VERSION` / `MIN_MOD_VERSION` in `electron/snapshot.ts`.
3. Update `CHANGELOG.md`: move *Unreleased* to the new version with today's date, and update the links at the bottom.
4. Run everything: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run validate:plugin`, `npm run test:plugin`.
5. Run `/security-review` in Claude Code on the changes since the last release, and fix what it finds.
6. Commit, tag `vX.Y.Z` and push the tag. CI builds the installer, the portable `.exe` and `latest.yml` from the tagged commit and publishes the release.
7. Check the published release: the files are there, the installer runs on a clean machine, and an installed older version picks up the update.

People get the new mod with `/plugin marketplace update oficina-de-agentes` and `/plugin update oficina@oficina-de-agentes`; the app's guide tells them when theirs is too old.

## Resumen en español

- **Preparar**: Windows 10/11, Node.js 22.18 o más nuevo y Git. `npm ci` y `npm start`. Clona en una ruta corta. Para probar el mod: `claude --plugin-dir plugin/oficina`.
- **Pruebas**: `npm test` (node:test y Vitest), `npm run test:e2e` (Playwright; compila antes con `npm run build`), `npm run test:plugin` y `npm run validate:plugin` (necesitan el CLI `claude` o `CLAUDE_BIN`). Nunca uses transcripciones, datos ni rutas reales.
- **Estilo**: comentarios en inglés; ningún texto de interfaz en el código: va en `electron/locales/es.ts` **y** `en.ts`, con las mismas claves; español con *tú*. `npm run lint` (Biome) antes de subir.
- **Commits y PRs**: un tema por commit, asunto en imperativo. En issues y PRs **nunca pegues transcripciones ni rutas personales**. Los problemas de seguridad van por [SECURITY.md](SECURITY.md).
- **Publicar una versión**: sube la versión en `package.json`, en `plugin/oficina/.claude-plugin/plugin.json` y en la entrada de `.claude-plugin/marketplace.json`; actualiza `CHANGELOG.md`; corre todas las pruebas y `/security-review`; crea la etiqueta `vX.Y.Z` y súbela. CI compila y publica.
