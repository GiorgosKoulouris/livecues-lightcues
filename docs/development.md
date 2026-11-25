# Development

Building, testing and changing LightCues. For using the app, see the [README](../README.md).

## Where to run what

The app targets Windows. Engine and logic work can also run in the [devcontainer](../.devcontainer/README.md).

| Task | Devcontainer | Windows host |
| --- | --- | --- |
| `test`, `typecheck`, `lint`, `format`, `check` | ✓ | ✓ |
| `build` | ✓ | ✓ |
| `security:scan`, `security:test-rules` | ✓ | |
| `package` (Windows installer) | | ✓ |
| `dev`, `start` (runs the Electron app) | | ✓ |
| `e2e` (launches the built app) | `e2e:linux` | ✓ |
| DMX Outputs, rtpMIDI | | ✓ |

The container and the host each need their own `npm install`. In the container, `node_modules` is a separate Docker volume.

## Quickstart from source

Prerequisites (Windows): Git, Node.js 22.12 or newer (see [.nvmrc](../.nvmrc)), Visual Studio Build Tools 2022 with the C++ workload, and Python 3. Full details and troubleshooting: [setup.md](setup.md).

This builds `main`, the released code:

```powershell
git clone https://github.com/GiorgosKoulouris/livecues-lightcues.git
cd livecues-lightcues
npm install
npm run dev
```

The window opens on the Venue Patch view. The top bar's right end shows a green disc and "Engine": the engine process is running. Hover it for the reply time and uptime.

Run the tests:

```powershell
npm test
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app with hot reload. Windows host only. |
| `npm run build` | Build main, engine, preload and renderer into `out/`. |
| `npm start` | Run the built app. Windows host only. |
| `npm run package` | Build the Windows x64 installer, its blockmap and `latest.yml` into `dist/`. Never publishes. Windows host only: on Linux the NSIS step needs Wine. |
| `npm run icon` | Regenerate `build/icon.ico` from `build/icon.svg`. |
| `npm run examples` | Regenerate the example Venue Patch and Show in [examples/](../examples/). |
| `npm run show:palette` | Write the Palette Show and its Cue Sheet to `tools/shows/`. Options: `-- --out <folder>` to write elsewhere, `--venue <file.lcvenue>` to print the Venue Check. See [Palette Show](#palette-show). |
| `npm run show:generate` | Generate a Show and its Cue Sheet from a Brief: `-- <brief.yaml> [--out <folder>] [--venue <file.lcvenue>]`. Writes beside the brief and prints the Venue Check against its venue. See [Show generator](#show-generator). |
| `npm run show:energy` | Write the Energy Show and its Cue Sheet to `tools/shows/`. Same options as `show:palette`. See [Energy Show](#energy-show). |
| `npm run lights:song` | Reaper Lights: `inspect <project.rpp> <region>` prints a song's span, tempo and markers; `analyse <project.rpp> <region>` prints RMS and onsets per bar from the WAV stems; `generate <project.rpp> <region> --show <file.lcshow> --sections <file> [--force]` writes a Plan filled to its [Density](agents/shows.md#density-lint) (see [Plan generator](#plan-generator)); `render <project.rpp> <plan>` writes the timeline page; `write <project.rpp> <plan> [--force] [--allow-stack]` saves a Plan's MIDI into `<name>.lights.rpp`. `render` warns, and `write` refuses, when a cue stacks more `dynamic` Scenes than its tier allows (M4); `--allow-stack` writes anyway. On a tagged Show, `render` also prints [Density](agents/shows.md#density-lint) warnings and draws a Density row; `write` ignores them. See [Reaper Lights](#reaper-lights). |
| `npm test` | Run the test suite (Vitest). |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run coverage` | Run the tests with coverage. Prints a summary and writes an HTML report and `coverage-summary.json` to `coverage/`. CI runs it too: see [CI](#ci). Not part of `check`. |
| `npm run e2e` | Build, then launch the app and run the end-to-end tests in [e2e/](../e2e/) (Playwright). Opens the example, fires a Scene and checks the Virtual Output's frame in the channel monitor. Not part of `check`, not run in CI. Run it on the Windows host before promoting. |
| `npm run e2e:linux` | `e2e` in the devcontainer: runs it under `xvfb-run` with `ELECTRON_RUN_AS_NODE` unset, which the container sets. |
| `npm run typecheck` | Typecheck engine, Electron side and renderer separately. |
| `npm run lint` | ESLint. Also blocks Electron/UI imports in `src/engine` and `src/shared`. |
| `npm run format` | Format with Prettier. |
| `npm run format:check` | Check formatting without writing. |
| `npm run check` | Typecheck, lint, format check and tests, in that order. Run before merging. |
| `npm run security:scan` | Security scan raw outputs. Devcontainer only. See [Security scan](#security-scan). |
| `npm run security:test-rules` | Test the custom Electron semgrep rules. Devcontainer only. |

## Palette Show

A venue-independent Show of 61 Scenes by feeling, fired from the DAW on MIDI channel 1. It is built from [tools/shows/make-shows/palette.ts](../tools/shows/make-shows/palette.ts) with the app's own models.

To change it:

1. Edit the lists in `palette.ts`: Looks, Movement, Accents, Hits, notes, House Presets and Haze Presets.
2. Run `npm run show:palette`. It writes `tools/shows/Palette.lcshow` and `tools/shows/Palette cue sheet.md`, which holds the note map and how the Layers combine. Both are committed.
3. Check the Show against a venue. Pass `--venue <file.lcvenue>`, or paste the path when the script asks (Enter skips). It prints the Venue Check: Rules that target no Fixture, approximated aims and strobes, missing Prism or Gobo, and House and Haze Presets the venue has not set up. Venue Patches stay local, not in the repo.
4. Run `npm test` to check that the Show is valid, every note is unique, and the output matches `palette.ts`.
5. Commit `palette.ts` and its two output files together.

Don't edit the output files by hand. They are overwritten on the next run, and a test fails when they differ from the script.

## Energy Show

A venue-independent Show of about 156 Scenes, grouped in four tiers (Chill, Groove, Drive, Peak). Where Palette is shy, Energy stacks: five Layers, one MIDI channel each, so a Look, a Movement, a Pulse and a Colour FX run together. It is built from [tools/shows/make-shows/energy.ts](../tools/shows/make-shows/energy.ts) with the app's own models, and uses Spreads, Chase width, Random, Fan, Figure-8, Prism and Gobo.

| Ch | Layer | Holds |
|---|---|---|
| 1 | Look | Colour and intensity. Utilities (Base, Intro/Outro, Breakdown, Dark) on notes 12–23 |
| 2 | Movement | Aim, movement Effect, and Move+FX combos |
| 3 | Pulse | Intensity Effects by target: beams, Quads, floor, Dekkers, front, back |
| 4 | Colour FX | Colour Effects by target |
| 5 | Hit | Flash only, grouped by kind. The Blackout hit is on the Look Layer |
| 6 | — | House and Haze Presets |

Tiers sit on two octaves each, on channels 1–4: Chill C1–B2 (24–47), Groove C3–B4 (48–71), Drive C5–B6 (72–95), Peak C7–B8 (96–119). Notes 0–11 release the channel's Layer.

To change it:

1. Edit the lists in `energy.ts`: Looks, Movement, Pulse, Colour FX, Hits, House Presets and Haze Presets.
2. Run `npm run show:energy`. It writes `tools/shows/Energy.lcshow` and `tools/shows/Energy cue sheet.md`, which holds the note map per channel, a tier guide, how the Layers combine and the House and Haze notes. Both are committed.
3. Check the Show against a venue with `--venue` or the prompt, as for the Palette Show. In the venue it lists the Blinder Rule of `Hit: Blinder` (no Blinders; the hit falls back to the front Quads), assumed pan and tilt ranges on the Quads and assumed strobe Hz spans.
4. Run `npm test` to check that the Show is valid, every note is unique within its channel, and the output matches `energy.ts`.
5. Commit `energy.ts` and its two output files together.

Don't edit the output files by hand. They are overwritten on the next run, and a test fails when they differ from the script.

## Show generator

`npm run show:generate -- <brief.yaml>` builds a venue-independent Show and its Cue Sheet from a Brief (`bands/<Band>/brief.yaml`). Source: [tools/shows/make-shows/generate.ts](../tools/shows/make-shows/generate.ts). Thresholds and the generator's knobs are in `tools/shows/make-shows/rules.ts`, shared with `npm run show:lint`.

- One Colour Set per song, on channel 6. Looks per tier and the utilities (Base, Dark, Silhouette, Shafts, Walk-on, Reveal, Bow) are on channel 1, built from slots. Scenes carry `tier:`, `part:` and `dynamic` tags for the lint.
- Parts the venue has no Fixtures for are left out, and the Cue Sheet says so. With no venue it builds for the default rig.
- Movement, Pulse, Colour FX and Hits are not built yet (`dynamicEntries` is the seam).
- The sample brief's output is committed in `tools/shows/make-shows/fixtures/`. After a change to the generator or the app models, run `npm run show:generate -- tools/shows/make-shows/fixtures/sample-brief.yaml` and commit it (`git add -f`, as `fixtures/` is ignored). `npm test` fails while it is stale. Never commit a real Venue Patch.

## Reaper Lights

Turns one song (a Region) of a Reaper project into MIDI that fires its Show: a generated band Show, or the Energy Show. Code is in [tools/shows/reaper-lights/](../tools/shows/reaper-lights/). The specs and issues are under `.scratch/reaper-lights/` and `.scratch/plan-density/`.

- `inspect` prints the Region's span, length in bars, tempo and signature changes, and its markers at song bars.
- The `light-song` skill ([.claude/skills/light-song/](../.claude/skills/light-song/SKILL.md), [agent notes](agents/light-song.md)) runs the session. On a generated band Show: inspect, analyse, a sections and tiers round the user confirms, [generate](#plan-generator), edits to the highlights, render and review, then write. On Energy or Palette: a brief round and a hand-written Plan take the place of the sections round, generate and the highlights. `.claude/` is git-ignored and the skill stays untracked.
- `render` compiles a Plan and writes `<Song>.lights.html` next to it: one self-contained page with section bands, a bar ruler and a lane per Layer showing Scene names, Flash ticks and the Scenes' colours from the Show. Local only; re-run it after each plan edit.
- `analyse` reads the WAV items inside the Region on stem tracks: tracks named Drums, KickBand or Snare (case-insensitive, name contains it), and any track with an item whose file name contains the Region's name (the full mix) and prints one line per bar: section marker, RMS in dBFS per track, and onsets as song `bar.beat` rounded to a 16th note. Item position, offset and length are honoured; source files resolve against the `.rpp` folder. Other tracks are ignored. MP3 and other formats, items with no source file, and files that are missing, are skipped with a warning. Onsets are energy-flux peaks: dense full mixes yield few, a drum stem many. A helper only: placements are proposed to the user, not written.
- `write` compiles a Plan (`<Song>.lights.yaml`, with the Show at `tools/shows/Energy.lcshow` unless it names one; a relative `show:` path is found from the working directory, then from the Plan's folder) and saves one MIDI item, `lights:<region>`, on lane 1 of the `MidiToLights` track. It never edits the original `.rpp`: it writes `<name>.lights.rpp` next to it. An existing `.lights.rpp` is the base, so other Regions' items stay; delete it to start again from the original. The file is written to a temp file and renamed, then a per-Region hash goes beside the Plan.
- If the item's MIDI was edited in Reaper (it matches neither the stored hash nor what the Plan would write), `write` stops. Fold the edits into the Plan, or pass `--force`.
- Errors in a Plan name the line. Run `npm test` for the tests. The fixture `tools/shows/reaper-lights/fixtures/lantern.rpp` is force-added to git (`fixtures/` is git-ignored).

### Plan generator

`npm run lights:song -- generate <project.rpp> <region> --show <file.lcshow> --sections <file>` writes `Lights/<Region>.lights.yaml` beside the project ([ADR 0024](adr/0024-plans-generated-to-a-density.md)). It does not overwrite an existing Plan without `--force`. The Show must carry `tier:` tags (a generated band Show). A relative `--show` is found as a Plan's `show:` is. Edit the Plan by hand, then `render` and `write` as usual.

The sections file holds the sections and tiers the user confirmed. Errors name its line.

```yaml
sections:
  - { bar: 1, label: intro, tier: chill }
  - { bar: 9, label: verse1, tier: groove }
  - { bar: 25, label: chorus1, tier: drive }
  - { bar: 41, label: stop }
  - { bar: 42, label: breakdown }
```

| Key     | Value                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------------- |
| `bar`   | A whole song bar from 1, inside the Region, rising down the list. A section ends where the next one starts. |
| `label` | A Marker vocabulary label; trailing numbers allowed. Not `roll`, `endroll` or `hit`.                       |
| `tier`  | `chill`, `groove`, `drive` or `peak`. Optional on `stop` and `blackout`. A `breakdown` without one is Peak. |

- **Looks and Effects.** Each section picks Scenes of its tier. Looks change on its bar 1, and each 8 bars where the Density asks (Drive and Peak aim for the target; Chill and Groove only meet the floor). Movement, Pulse and Colour FX swap on 4-bar steps. Colour FX swaps, then extra Looks, are given up where the Colour Set cues would push a section over its colour ceiling. A swap never repeats the Layer's last Scene. A Layer the section does not use is released. A running Colour FX is fired again beside each new Look. Chill gives up a Pulse or Colour FX to stay inside its stacking cap. `stop` and `blackout` hold Dark with every Effect released.
- **Hits.** Each section takes its tier's Hit Density as `events` (the last chorus its ceiling). Its bar 1 takes a turn Hit: a Blinder on up to 2 sections (Peak first), a full-area Hit on other Drive and Peak turns while the colour ceiling has room, else a partial one. The last bar of a `build` or `pre`, or of a section before a higher tier, holds a Riser (never before a stop). `stop` is a 1-beat Strobe, then Blackout to the next section; `blackout` is the Blackout alone.
- **Body Hits** keep a beat from every other Hit and rotate through the partial Hits. They sit on onsets from the WAV items on the Drums, KickBand and Snare tracks (muted items and MP3 are skipped, as in `analyse`). A bar with more than 3 onsets a beat in a stem is too dense for that stem. Where no onset fits, they sit on the beat grid: downbeats first, then backbeats. A `breakdown` takes onsets on or off the beat, the KickBand stem's first, at its tier's rate (Peak unless given).
- **Full-area rate.** A Show with no partial Hit uses full-area ones, at least 1/3 s apart, so above 180 BPM they sit 2 beats apart.
- **Last chorus.** The last `chorus` section is raised to Peak, whatever the sections file says. It takes the Swap Colour Set and the Hit ceiling: every downbeat, plus beats 2 and 4 in the second half of each phrase (on onsets in bars the stems play in). The prism Hits are its own, unless the other sections would be left with fewer than 6 partial Hits.
- **Colour Sets.** The Show's Cue Sheet (`<Show> cue sheet.md`) names the song's Main, Break and Swap in its Song sets table, matched on the Region name. A missing table or row, or a named set the Show does not have, stops `generate`. Main is cued at bar 1, Break on `bridge`, `break` and `breakdown`, Main again after them, Swap on the last chorus (with none, the last `drop`, else the loudest section). A last chorus on bar 1 swaps on its last 8-bar boundary.
- **4 to 6 Colour Set cues.** Over 6, a `breakdown` keeps its Break first, then a `bridge`, then a `break`. Under 4, Break borrows a `solo`, else the quietest section before the Swap, else 8 bars of one. `generate` prints what it borrowed, and warns when there is too little before the Swap for 4.
- **Repeats.** Sections share a label without its trailing number (`stop` and `blackout` are no pass). A repeat fires the Scenes of the last pass of its tier again, keeps the first pass's Movement shape, and takes one element more than the pass before it over the bars both have. A verse tries a Pulse or another Movement first, any other section a Colour FX. Else it takes another Hit kind, moving a Hit into those bars when at the ceiling. A Look is not fired again straight after itself, so a back-to-back repeat may open on another. The Effect ceilings and stacking cap still hold; `generate` warns where a repeat could take no more. The colour ceiling gives way to a repeat: it keeps a Colour FX its earlier pass ran, and takes colour Hits when no other kind is left.
- **Same inputs, same Plan.** Picks are seeded by the Region name and the section. The stem audio is an input too.
- **Markers.** `render` scores [Density](agents/shows.md#density-lint) per project marker, so put a marker at each section. `generate` warns where the markers and the sections differ.

## CI

GitHub Actions on `windows-latest` ([.github/workflows/](../.github/workflows/)):

| Event | What runs |
| --- | --- |
| Push to `stage` | Semver check on the `package.json` version, a warning when it has no [CHANGELOG.md](../CHANGELOG.md) section, `npm run check`, `npm run package`. The installer is uploaded as a workflow artifact, kept 7 days. |
| Push to `main` | Same as `stage`. Also warns when code changed since the last `v*` tag and HEAD is untagged. |
| Push of tag `vX.Y.Z` | Fails unless the tag equals `v` + the `package.json` version and is on `main`. Also fails when the version has no [CHANGELOG.md](../CHANGELOG.md) section. Then `npm run check`, `npm run package`, and a GitHub Release with the installer, its blockmap and `latest.yml`, and the changelog section as its body ([release.yml](../.github/workflows/release.yml)). |
| Pull request to `main` | `npm run check` |
| Push to `dev` | Nothing |

Coverage has its own workflow, [coverage.yml](../.github/workflows/coverage.yml): `npm run coverage` on pushes to `main`, pull requests to `main` and by hand. It never fails on a number. The run's summary page shows a table, and the HTML report is an artifact kept 14 days. A push to `main` also writes `coverage.json` to the orphan `badges` branch (one commit, force-pushed each run), which the README badge reads through shields.io. Run `npm run coverage` locally for the same report in `coverage/`.

`stage` is the squashed batch on its way to `main`, made by `/branch-flow promote`. See [agents/promote.md](agents/promote.md). Releases: [agents/releasing.md](agents/releasing.md).

Actions are pinned by commit SHA, with the version in a trailing comment.

### Dependabot

[.github/dependabot.yml](../.github/dependabot.yml) opens weekly PRs against `dev`. npm gets two grouped PRs: dev dependencies and runtime. GitHub Actions get one PR each.

- No CI runs on `dev`. Run `npm run check` on the PR branch before merging, then pull `dev`.
- Merge or close open Dependabot PRs before a promote ([agents/promote.md](agents/promote.md)).
- Security updates are a repo setting, ungrouped. GitHub always opens them against `main`, whatever `target-branch` says. Don't merge them there: it breaks the fast-forward from `stage`. Apply the bump on `dev` and close the PR. The alert closes when the batch reaches `main`.
- TypeScript majors are ignored in [.github/dependabot.yml](../.github/dependabot.yml): typescript-eslint 8.x peers `typescript <6.1.0`. Drop the rule once typescript-eslint accepts TS 7.
- `global-agent` is pinned by an override in `package.json` (under `@electron/get`). Dependabot doesn't need an ignore rule for it. Check the pin by hand when `@electron/get` moves.

## Third-party notices

The installer ships `resources/THIRD_PARTY_NOTICES.txt`: the name, version, license and license files of every npm package in the app, and the Open Fixture Library credit from [examples/README.md](../examples/README.md). Electron ships its own `LICENSE.electron.txt` and `LICENSES.chromium.html`. **Licenses** in the sidebar opens it and `resources/LICENSE.txt`. Main opens fixed paths only; the renderer names the file, never a path.

[scripts/third-party-notices.mjs](../scripts/third-party-notices.mjs) writes it as electron-builder's `afterPack` hook, so `npm run package` makes it. The security scan's build skips it (`LIGHTCUES_SKIP_NOTICES=1`) and reports licenses instead. "What ships" is the scan's inventory of the packed app: its `node_modules`, Electron, and the packages Vite bundled into `out/` ([scripts/bundled-packages.mjs](../scripts/bundled-packages.mjs) lists them in `out/*/bundled-packages.json`).

Packaging fails when a package:

- has a license off the allow list in [scripts/security-scan/licenses.mjs](../scripts/security-scan/licenses.mjs) (compatible with MIT for distribution). Replace the package, or add the license to the list if it is compatible.
- ships no LICENSE, COPYING or NOTICE file. Copy the upstream license file to `build/licenses/<name>@<version>.txt`. The version is in the name, so an update is checked again.

## Security scan

An ad hoc scan, not part of CI. It builds the app from one commit in a temporary worktree and checks what ships in the installer:

- dependency advisories (osv-scanner),
- source code (semgrep, with custom Electron rules),
- the Electron runtime against its release feed,
- licenses.

Claude then reviews the Electron security surface and writes one report to `reports/security/` (gitignored).

Runs in the [devcontainer](../.devcontainer/README.md) only. Ask Claude to "run the security scan", or run `npm run security:scan` for the raw outputs without a report. Options, reading the report and accepting risks: [security-scan.md](security-scan.md).

## Architecture

Electron app with three processes ([ADR 0002](adr/0002-electron-with-separate-engine-process.md)):

- **Engine** (`src/engine/`): an Electron utilityProcess. MIDI in, Scene resolution, DMX out, files, undo history. No Electron or UI imports, so it is testable under plain Node.
- **Main** (`src/main/`): creates the window, starts the engine and hands out MessagePorts.
- **Renderer** (`src/renderer/`): React UI. It talks to the engine directly over a MessagePort.

`src/shared/` holds the typed message contract and the data models used by both sides. See [setup.md §8](setup.md#8-source-layout) for the full layout. Design decisions: [adr/](adr/). Glossary: [CONTEXT.md](../CONTEXT.md).

## Contributing

Pull requests by arrangement: open an issue first.

- Work on the `dev` branch: `git switch dev`. `dev` reaches `main` squashed, through `stage`, by `/branch-flow promote` and `ship`. Promote writes the [CHANGELOG.md](../CHANGELOG.md) lines. See [agents/promote.md](agents/promote.md).
- Run `npm run check` before merging. CI runs it again on `stage` and on pull requests to `main`.
- Claude Code's commit gate ([check-before-commit.mjs](../scripts/hooks/check-before-commit.mjs)) runs the `check` steps before each `git commit`. Where semgrep is installed (the devcontainer), it then runs the Electron rules in [security/semgrep/](../security/semgrep/) on `src/main` and `src/preload`.
- Issues and specs are markdown files under `.scratch/<feature>/`. See [agents/issue-tracker.md](agents/issue-tracker.md).
- Use the domain terms from [CONTEXT.md](../CONTEXT.md) in code, UI and docs.
