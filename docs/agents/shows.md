# Generated Shows

`shows/` holds the Palette and Energy Shows and their Cue Sheets. They are generated and committed.

| Show | Source | Command | Files |
| --- | --- | --- | --- |
| Palette | `scripts/make-shows/palette.ts` | `npm run show:palette` | `shows/Palette.lcshow`, `shows/Palette cue sheet.md` |
| Energy | `scripts/make-shows/energy.ts` | `npm run show:energy` | `shows/Energy.lcshow`, `shows/Energy cue sheet.md` |

## Rules

- Never edit files in `shows/` by hand. Edit the source, then run the command.
- After any change to a source file, or to the app models it builds from, rerun the command and commit the source and `shows/` together. `npm test` fails while `shows/` is stale.
- The scripts write to `shows/` by default. Use `-- --out <folder>` only for a one-off copy.
- `--venue <file.lcvenue>` prints the Venue Check. Without it, the script asks for a path in an interactive terminal. From an agent shell there's no terminal, so the prompt is skipped: pass `--venue` when the user gives a venue file.
- Venue Patches are local to the user. Never commit one or copy it into the repo.
- Reaper Lights uses `shows/Energy.lcshow` when a Plan has no `show:` line. Read `shows/Energy cue sheet.md` for its Scene names.

## Show generator

`npm run show:generate -- <brief.yaml>` writes a Show and Cue Sheet beside the brief (or to `--out`). Its sample output is committed under `scripts/make-shows/fixtures/` with `git add -f`; rerun it after changing `scripts/make-shows/generate.ts`, `colour-sets.ts`, `dynamics.ts`, `rules.ts`, `brief.ts` or the app models, and commit both. Never write generated output into `shows/`. See [docs/development.md](../development.md#show-generator).

## Density lint

`npm run lights:song -- render` scores a Plan's [Density](../adr/0024-plans-generated-to-a-density.md) on a tagged Show. Source: `scripts/reaper-lights/density.ts`. The Density table and per-song limits are in `scripts/make-shows/rules.ts`.

- A section starts at each project marker (`roll`, `endroll` and `hit` start none). Its tier is that of the Look held there. No tier, or no markers: no scores.
- Per metric: below the floor scores 0, above the ceiling 1, between them 2. A section shorter than 8 bars rounds the band outward to whole events. A longer one compares the exact rate: floor over its whole bars, ceiling over its bars rounded up.
- The reset, `start:` overrides included, and the end cue count for nothing. A marker at the same time as the next one has no length: it is warned and not scored.
- Also warned: a repeat with fewer Scenes than the pass before it, Colour Set cues outside 4–6, too few Hit kinds in a Drive or Peak section, and full-area Hits over 3 starts a second outside a burst.
- Repeats are counted over the bars both passes have, without reset Scenes. A section shorter than 8 bars needs its share of the Hit kinds, rounded down.
- Report-only. `write` does not refuse on Density.

## Show lint

`npm run show:lint -- <file.lcshow> [--strict] [--bpm <n>]` scores any Show against the rubric items checkable from the file (2, 4-6, 8-12 and Variety; items 1, 3 and 7 are superseded by ADR 0023 and item 17 is replaced by Variety). Variety reads the Cue Sheet's Song sets table beside the file when it exists. It is report-only: Palette and Energy are a baseline, not a gate. `--strict` exits 1 when item 4 or 11 scores 0. Source: `scripts/make-shows/show-lint.ts`. Thresholds are in `scripts/make-shows/rules.ts`, which the generator shares. Tiers come from `tier:<name>` tags (or a `Chill: ` name prefix), parts from `part:<name>` tags.

See [docs/development.md](../development.md#palette-show) for the full workflow.
