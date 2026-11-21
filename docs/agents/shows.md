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

See [docs/development.md](../development.md#palette-show) for the full workflow.
