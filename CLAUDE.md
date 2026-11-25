## User preferences and rules

### Output style

- Keep responses compact and technical.
- Use short sentences and plain wording. No filler or flourish.
- Ask every question through the AskUserQuestion tool, never as plain text. This includes grilling and planning rounds.

### Branching

- Make all modifications on the `dev` branch. Create it if it doesn't exist.
- Before starting, check `dev` for pending work (uncommitted changes). If there is any, ask the user how to proceed. You can proceed without asking if dev is not yet merged to main, this is OK.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage roles (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Edits

Show and Venue Patch edits go through `applyShowEdit` and `applyVenueEdit`. See `docs/agents/edits.md`.

### Review

Reviewers apply `CODING_STANDARDS.md`.

### Releasing

A release is a `vX.Y.Z` tag on `main` that equals `v` + the `package.json` version. Bump the version on `dev`, promote and ship, then tag by hand. See `docs/agents/releasing.md`.

### Generated Shows

The Palette and Energy Shows and their Cue Sheets are generated into `shows/` and committed. Never edit them by hand: edit `scripts/make-shows/`, rerun `npm run show:palette` or `npm run show:energy`, and commit both. See `docs/agents/shows.md`.

### Make show

The `make-show` skill turns a band's Brief into a Show, lints it, renders its key Scenes with `npm run show:shots` and scores the Shot rubric items. It never commits `bands/` or a Venue Patch. See `docs/agents/make-show.md`.

### Light song

The `light-song` skill turns a song into a Plan and MIDI: on a generated band Show, the user confirms sections and tiers, `generate` fills the Plan and Claude edits the highlights. It never commits Plans, sections files, `bands/` or a Venue Patch. See `docs/agents/light-song.md`.

### Security scan

When asked to "run the security scan", run `npm run security:scan`, triage its outputs, review the code and write a report to `reports/security/`. Report-only: change and commit nothing. Follow `docs/agents/security-scan.md`.

## Branch flow

Branches run dev → stage → main. All commits go on `dev`. `stage` and `main` change only through `/branch-flow promote` and `/branch-flow ship`. The skill also writes `CHANGELOG.md`.

- Groups: 10
- Changelog: keep-a-changelog
- Version: package.json
- Glossary: CONTEXT.md
- Release-notes: scripts/changelog-section.sh
- Promote-notes: docs/agents/promote.md
- Ship: pr
