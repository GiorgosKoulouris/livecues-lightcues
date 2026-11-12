# Semgrep rules: recognise existing validators

Status: ready-for-agent

Three rows in the scan are false positives: two `electron-ipc-unvalidated-payload` and one `electron-open-external-non-literal`. The handlers already check their input.

## Fix

- Rules in `security/semgrep/`: treat `isEngineDocument`, `isDocumentKind`, `licensePath` and `isReleasePageUrl` as validators for the IPC rule, and `isReleasePageUrl` as a guard for the `openExternal` rule.
- No inline suppressions and no entries in `security/accepted.yml`.
- Add test cases for each new validator, if the rules have tests.

## Acceptance

- `npm run security:scan` no longer lists the three rows.
- A handler with no check still triggers each rule.

## Comments
