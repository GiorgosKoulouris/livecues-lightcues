# Bump dev-only dependencies with advisories

Status: ready-for-agent

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
