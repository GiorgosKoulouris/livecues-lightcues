# Bump shipped dependencies

Status: ready-for-agent

## Fix

- `fast-xml-parser` to `5.12.0` (lockfile and `package.json` range if pinned).
- `electron` to `44.11.2`. Stay on major 44.

## Acceptance

- `npm run check` passes, including the GDTF import tests.
- `npm run security:scan` no longer lists `fast-xml-parser` or the Electron patch lag.
- Manual: the app starts and imports a `.gdtf` file.

## Comments

### 2026-11-12: partly done

`fast-xml-parser` is at 5.12.0 (commit 27ee0ce). Electron 44.11.2 is not on npm yet (latest is 44.11.1), so that part waits. Retry `npm install electron@^44.11.2` later.
