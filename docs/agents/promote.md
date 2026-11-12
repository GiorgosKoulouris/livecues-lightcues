# Promote notes: repo steps for `/branch-flow promote` and `ship`

The branch-flow skill runs the flow and the changelog. These are this repo's extra steps. The skill reads this file before promote and ship.

## Before promote

- **Dependabot PRs.** Merge or close every open Dependabot PR against `dev` first (`gh pr list --base dev --author app/dependabot`). Before merging one, run `npm run check` on its branch, since no CI runs on `dev`. Pull `dev` after a merge. See [development.md § Dependabot](../development.md#dependabot).
- **Release batch.** Bump the version on `dev` before promoting, in its own commit: `npm version X.Y.Z --no-git-tag-version`. Leave CHANGELOG.md alone: promote moves the `[Unreleased]` lines under `## [X.Y.Z]`. See [releasing.md](releasing.md).

## Pushing

- **Rulesets.** `dev` and `stage` block force pushes and deletion for everyone but the repository admin. The force push after promote and the `stage` delete after ship need the user's admin credentials. If GitHub rejects one, stop and tell the user. Don't work around it.

## Before ship

- **Wait for `stage` CI.** Push `stage` and wait for a green run ([development.md § CI](../development.md#ci)).
- **Install test.** If the batch touches the app, download the `LightCues-Setup-<version>` artifact from that run (kept 7 days), install it on Windows and check the app starts.

## After ship

- **Release batch.** Run the suggested security scan on `main`, then tag. See [releasing.md](releasing.md) § Flow.
