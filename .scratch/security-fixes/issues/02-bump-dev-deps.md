# Bump dev-only dependencies with advisories

Status: resolved

## Fix

Lockfile bumps, lowest fixed version:

- `undici` `7.30.0` to `7.30.1`.
- `zod` `4.6.5` to `4.6.6`.
- `glob` `13.0.6`: fixed in `14.0.2`. Prefer a 13.x fix if one exists; else check the major bump against the build scripts.
- `minimatch` `10.2.6` and `9.0.9`: fixed in `11.0.1`. Often transitive. Try `npm update`, then an `overrides` entry only if needed.

## Acceptance

- `npm run check` and `npm run build` pass.
- `npm run security:scan` no longer lists these packages.
- No new `overrides` unless a transitive dependency forces one, and then with a comment.

## Comments

### 2026-11-12: done

`undici` 7.30.2 and `zod` 4.6.7 by `npm update`. `glob` and `minimatch` come from `@electron/asar`, `@electron/universal`, `app-builder-lib`, `eslint` and `typescript-eslint`, which still ask for the old majors, so `package.json` `overrides` pin `glob@13.0.6` to 14.0.5 and `minimatch` 9.0.9 and 10.2.6 to 11.0.8 (the estree package is scoped, since its range needs a scoped key). Drop the overrides when those packages ship fixed ranges. `npm audit` shows 0. `npm run check`, `build` and the pack step (to `win-unpacked`) pass; the NSIS step needs wine, which this container lacks.
