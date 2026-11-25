# light-song

The `light-song` skill turns one song of a Reaper project into MIDI that fires its Show. It lives in `.claude/skills/light-song/SKILL.md`. `.claude/` is gitignored, so the skill is local to each checkout.

## Flow

For a generated band Show (`tier:` tags):

1. Inspect: `npm run lights:song -- inspect <project.rpp> <region>`.
2. Analyse: `npm run lights:song -- analyse <project.rpp> <region>`.
3. Claude proposes sections and tiers. The user confirms them through AskUserQuestion. Claude writes `Lights/<Song>.sections.yaml` beside the project.
4. Generate: `npm run lights:song -- generate <project.rpp> <region> --show bands/<Band>/<Band>.lcshow --sections <file>`.
5. Claude edits the highlights in the Plan.
6. Render, review loop, then write.

An untagged Show (Energy, Palette) is hand-authored: a brief round and a drafted Plan replace steps 3–5 (`.claude/skills/light-song/hand-authoring.md`).

The commands, the sections file and what the generator places: [development.md § Reaper Lights](../development.md#reaper-lights). Why: [ADR 0024](../adr/0024-plans-generated-to-a-density.md). Density scoring: [shows.md](shows.md#density-lint).

## Rules

- Plans, sections files, `bands/` and Venue Patches are never committed.
- `generate --force` writes over hand edits. Ask the user first, and keep a copy of the old Plan.
- `render` scores Density per project marker and compares repeats by marker name. A section with no marker is not scored on its own.
- A muted drum stem item is skipped without a warning. With no other usable stem, the body Hits go on the beat grid. The user unmutes it for `generate`.
- The Density figures in `tools/shows/make-shows/rules.ts` are tuned from songs the user has watched, as separate work.
