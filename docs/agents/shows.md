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

## Show lint

`npm run show:lint -- <file.lcshow> [--strict] [--bpm <n>]` scores any Show against the rubric items checkable from the file (1-12 and 17). It is report-only: Palette and Energy are a baseline, not a gate. `--strict` exits 1 when item 3, 4 or 11 scores 0. Source: `scripts/make-shows/show-lint.ts`. Thresholds are in `scripts/make-shows/rules.ts`, which the generator shares. Tiers come from `tier:<name>` tags (or a `Chill: ` name prefix), parts from `part:<name>` tags.

See [docs/development.md](../development.md#palette-show) for the full workflow.
