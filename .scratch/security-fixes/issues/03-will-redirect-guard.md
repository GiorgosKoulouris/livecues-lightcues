# Guard redirects like navigation

Status: resolved

Hardening. The window already denies new windows and blocks `will-navigate` to other pages.

## Fix

- `src/main/index.ts`, `restrictNavigation`: add a `will-redirect` handler that calls `event.preventDefault()` unless `isAppPage(event.url, pageUrl)`.
- Optional: set `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` explicitly in `webPreferences`. These are the defaults today. Explicit values keep them if a default changes.

## Acceptance

- Extend `navigation` tests if the check moves into a testable function; otherwise a test with a fake `contents` that the handler blocks a foreign URL and allows the app page.
- `npm run check` passes.
- The dev server still reloads (Vite HMR).

## Comments

### 2026-11-12: done

`restrictContents` in `src/main/navigation.ts` guards windows, `will-navigate` and `will-redirect`. Main uses it. `webPreferences` now sets the three defaults explicitly. Tests added. `npm run check` passes.
