# Generated files

What is generated, and whether git tracks it. Why the show tooling sits apart: [ADR 0025](../adr/0025-show-tooling-isolated-in-tools-shows.md).

## Rule

- Generated output is gitignored, unless the installer ships it or a tool loads it by default.
- Each committed generated file has a staleness test: `npm test` fails when the file differs from what its generator writes.
- Committed output is tracked through `.gitignore`, never through `git add -f`.
- A new generated file gets a row here.

Files that break the rule today are under [Exceptions](#exceptions).

## App: tracked

| Files | Made by | Used by | Staleness check |
| --- | --- | --- | --- |
| `examples/demo.lcvenue`, `examples/demo.lcshow` | `npm run examples` | Installer, **Open example** | `scripts/make-examples/demo.test.ts` |
| `build/icon.ico` | `npm run icon`, from `build/icon.svg` | Installer, dev window | None |
| `CHANGELOG.md` | `/branch-flow` | GitHub Release notes | None. The release fails without a section for its version |
| `package-lock.json` | npm | `npm ci`, security scan | `npm ci` fails when it differs from `package.json` |
| `DESIGN.md`, `.impeccable/design.json` | `impeccable` skill | `impeccable` skill | None |

## App: ignored

| Files | Made by | Used by |
| --- | --- | --- |
| `out/` | `npm run build` | The app, e2e tests, packaging |
| `out/*/bundled-packages.json` | `npm run build` (`scripts/bundled-packages.mjs`) | Third-party notices, security scan |
| `dist/` | `npm run package` | GitHub Release |
| `THIRD_PARTY_NOTICES.txt`, in the packed app under `dist/` | `afterPack` hook (`scripts/third-party-notices.mjs`) | Ships in the installer |
| `coverage/` | `npm run coverage` | The user, `coverage.yml` |
| `test-results/` | Playwright (`npm run e2e`) | The user |
| `reports/` | `npm run security:scan` and its triage, other reports | The user |
| `.impeccable/hook.cache.json`, `.impeccable/hook.pending.json` | `impeccable` hook | `impeccable` hook |

`coverage.yml` also commits `coverage.json` to the orphan `badges` branch, for the README badge.

## Show tooling: tracked

| Files | Made by | Used by | Staleness check |
| --- | --- | --- | --- |
| `tools/shows/Palette.lcshow`, `tools/shows/Palette cue sheet.md` | `npm run show:palette` | Users load it in the app | `tools/shows/make-shows/palette.test.ts` |
| `tools/shows/Energy.lcshow`, `tools/shows/Energy cue sheet.md` | `npm run show:energy` | Reaper Lights default Show, users load it in the app | `tools/shows/make-shows/energy.test.ts` |
| `Neon Harbour.lcshow` and `Neon Harbour cue sheet.md` in `tools/shows/make-shows/fixtures/` | `npm run show:generate` on `sample-brief.yaml` | Generator, shots, Reaper Lights and e2e tests | `tools/shows/make-shows/generate.test.ts` |
| `tools/shows/reaper-lights/__snapshots__/render.test.ts.snap` | Vitest | `render.test.ts` | The test itself |

Rules for editing and regenerating Shows: [shows.md](shows.md).

## Show tooling: ignored

| Files | Made by | Used by |
| --- | --- | --- |
| `bands/<Band>/`: Brief, Show, Cue Sheet | `make-show` skill, `npm run show:generate` | `show:lint`, `show:shots`, Reaper Lights |
| Shot PNGs, in the `--out` folder | `npm run show:shots` | `make-show` scoring |
| `.scratch/` | Agents and the user | Issue tracker |
| `temp/` | The user | Local working files |

Reaper Lights writes beside the Reaper project, normally outside the repo:

| Files | Made by | Used by |
| --- | --- | --- |
| `Lights/<Song>.sections.yaml` | `light-song` skill | `lights:song generate` |
| `Lights/<Song>.lights.yaml` (the Plan) | `lights:song generate`, or by hand | `render`, `write` |
| `<Song>.lights.html` | `lights:song render` | The user |
| `<name>.lights.rpp` | `lights:song write` | Reaper, the next `write` |
| `<Region>.lights.hash` | `lights:song write` | The next `write`, to detect MIDI edits |

## Exceptions

As of 2026-11-25:

- **Neon Harbour fixtures** are tracked with `git add -f`. The installer does not ship them and no tool loads them by default. `.scratch/repo-debloat/issues/03-drop-neon-harbour-golden.md` removes them.
- **Palette** is tracked by choice, so users get a ready file. No tool loads it by default.
- **No staleness test:** `build/icon.ico`, `CHANGELOG.md`, `DESIGN.md` and `.impeccable/design.json`.
