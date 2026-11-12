# Semgrep rules: recognise existing validators

Status: ready-for-agent

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
