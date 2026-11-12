# Security fixes

Follow-up to the 2026-11-12 scan. Details stay in `reports/security/` (gitignored). Issues here name the change only.

## Plan

Four small issues, independent. Suggested order:

1. `01` shipped dependencies. Ships in the next release.
2. `03` navigation hardening.
3. `02` dev dependency bumps.
4. `04` semgrep rule fixes.

One commit per issue on `dev`. `npm run check` before each commit. Run `npm run security:scan` after 01 to 03 and confirm the rows are gone, then promote with `/branch-flow promote` when ready.

## Out of scope

- Accepting any finding in `security/accepted.yml`.
- Electron 45 and TypeScript 7 (held back on purpose, see the last dependency bump).
