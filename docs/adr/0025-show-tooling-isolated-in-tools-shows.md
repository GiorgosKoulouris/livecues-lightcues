# Show tooling is isolated in tools/shows/

This repo is the LightCues app. It also holds tooling that generates Shows and lights songs: the Show generator, Palette and Energy, and Reaper Lights. The tooling stays in this repo because it builds Shows with the app's own models, and its tests catch model changes that break it. It lives under `tools/shows/` so the root and `scripts/` read as the app. Generated output is gitignored. It is committed only when the installer ships it (`examples/`) or a tool loads it by default (Energy, for Reaper Lights). Each committed file has a staleness test.

## Considered Options

- Split the tooling into its own repo: rejected. It would need the app models as a package or submodule, and model drift would go unnoticed until someone ran it.
- An npm workspace package: rejected for now. It gives the clearest boundary, but adds a second package.json and build setup for one user.
- Ignore all generated Shows: rejected. Users load Energy into the app with their DAW, and Reaper Lights uses it as the default, so it has to be a ready file.

## Consequences

- Tooling tests run in their own vitest project but stay in `npm run check`.
- Golden output files (such as Neon Harbour) are replaced by checks on Shows generated in memory.
- Band output stays in `bands/` at the root, ignored. It is user data, not tooling source.
