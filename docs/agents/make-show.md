# make-show

The `make-show` skill builds a band's Show from a Brief and checks it. It lives in `.claude/skills/make-show/SKILL.md`. Git tracks it; the rest of `.claude/` is ignored.

## Flow

1. Interview (no Front question: the front takes slot colours), then write `bands/<Band>/brief.yaml`.
2. `npm run show:generate -- <brief.yaml>`, then `npm run show:lint -- <file.lcshow>`.
3. `npm run show:shots -- <show.lcshow> <venue.lcvenue> --out <folder>`.
4. Score rubric items 4, 6, 14 and 15 from the PNGs. Add the lint's ten items and report the total.
5. Hand off to light-song.

## show:shots

Source: `e2e/show-shots.ts` (the run), `tools/shows/make-shows/shots.ts` (the arguments and the choice of Scenes), `tools/shows/show-shots.mjs` (the command).

- It runs the built app (`npm run build` first, which the npm script does), opens the venue and the Show through the Open buttons, and Detaches the Visualiser. Camera FOH, Assume haze 40 %.
- Shots: Base, one Look per tier, Silhouette, the chorus combo (Drive Look and up to 2 dynamic Scenes) and the peak combo (Peak Look and up to 3). A shot the Show cannot make is skipped.
- On Linux without a display it re-runs under `xvfb-run`. In the devcontainer that is all it needs.
- It prints each PNG with its lit share. `BLANK` means no pixel was clearly lit.
- `e2e/show-shots.test.ts` runs it on the sample Show (`npm run e2e` or `npm run e2e:linux`).

## Rules

- `bands/`, shot folders and Venue Patches are never committed.
- Never edit a generated Show by hand. Fix the Brief, or the generator.
- The Show stays venue-independent: the venue is only for the Venue Check and the shots.
