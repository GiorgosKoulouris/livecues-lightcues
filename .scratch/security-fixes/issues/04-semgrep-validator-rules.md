# Semgrep rules: recognise existing validators

Status: resolved

Four rows in the scan are false positives: two `electron-ipc-unvalidated-payload`, one `electron-open-external-non-literal`, and `electron-missing-navigation-guards` (the guard now lives in `restrictContents` in `src/main/navigation.ts`, called from `restrictNavigation`). The handlers already check their input.

## Fix

- Rules in `security/semgrep/`: treat `isEngineDocument`, `isDocumentKind`, `licensePath` and `isReleasePageUrl` as validators for the IPC rule, and `isReleasePageUrl` as a guard for the `openExternal` rule.
- Navigation rule: accept guards set through `restrictContents`.
- No inline suppressions and no entries in `security/accepted.yml`.
- Add test cases for each new validator, if the rules have tests.

## Acceptance

- `npm run security:scan` no longer lists the four rows.
- A handler with no check still triggers each rule.

## Comments

### 2026-11-12: done

Rules in `security/semgrep/electron.yml`:

- IPC: a use of the payload as an argument to `licensePath` or `saveFromSnapshot` does not count. They check their own payload. A name list, so add one only after reading the function.
- `openExternal`: an `if` on, or an early return on, an `is*` / `validate*` check of the same URL counts as a guard. A check of another variable does not.
- Navigation: an app-wide `web-contents-created` handler that passes the contents to a `restrict*` / `guard*` function counts. The helper may be in another file; check it by hand.

Fixtures added, including wrong-check cases. `npm run security:test-rules` passes. The scan shows 0 findings.
