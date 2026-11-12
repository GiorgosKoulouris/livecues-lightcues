# LightCues is MIT licensed

New releases of LightCues are MIT licensed. v0.1.2 and earlier were released under GPL-3.0-only and stay under it: a licence granted for a release cannot be taken back.

Why:

- **Family consistency.** LightCues is one of the LiveCues apps, which share a design system and should share a licence.
- **Bundled fonts.** [ADR 0003](0003-plain-css-tokens-and-radix-dark-only.md) kept the app on the system font because OFL-1.1 fonts are not GPL-3.0 compatible. With MIT that barrier is gone, so the family fonts (IBM Plex Sans and Mono, OFL-1.1) can be bundled with their OFL.txt. This supersedes the font clause of ADR 0003.
- **No blocker.** The author wrote all the code (apart from one Dependabot version bump), and no shipped dependency is GPL.

The dependency allow list in `scripts/security-scan/licenses.mjs` is now "compatible with MIT for distribution". The GPL and LGPL entries are gone. MPL-2.0 stays, and OFL-1.1 is added for fonts.
