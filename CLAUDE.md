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

### Releasing

A release is a `vX.Y.Z` tag on `main` that equals `v` + the `package.json` version. Bump the version on `dev`, promote and ship, then tag by hand. See `docs/agents/releasing.md`.

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
