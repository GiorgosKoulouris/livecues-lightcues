---
name: make-show
description: Build a Show for a band from a Brief, and check it in the Visualiser. Use for "make a show for <band>", a new band's lighting, or regenerating a band's Show after a brief change.
---

# make-show

Turns a band's Brief (`bands/<Band>/brief.yaml`) into a Show and Cue Sheet with `npm run show:generate`, lints it, renders its key Scenes in the Visualiser, scores the Shot items of the rubric and hands the songs to light-song. Terms are in [CONTEXT.md](../../../CONTEXT.md) (Brief, Colour Set, Cue Sheet). Rubric: `.scratch/show-generator/research.md` section 4 (Aesthetic rubric; items 1, 3 and 7 are superseded by [ADR 0023](../../../docs/adr/0023-generated-shows-favour-variety-over-restraint.md), item 17 is now Variety).

Questions to the user go through AskUserQuestion.

`bands/` and the Venue Patch stay local. Stage only files the user names. Never commit either.

## Flow

Each step ends when its output exists. Do not start the next before it.

1. **Brief.** One AskUserQuestion round, [questions below](#the-brief). Skip what the user already stated. Done when every field of the Brief has an answer. Write `bands/<Band>/brief.yaml` (format: `tools/shows/make-shows/fixtures/sample-brief.yaml`). Put the venue file beside it and point `venue:` at it.
2. **Generate.** `npm run show:generate -- bands/<Band>/brief.yaml`. A Brief error names its line: fix and re-run. Done when it prints `Wrote` for the `.lcshow` and the Cue Sheet, and the Venue Check. Report each Venue Check gap.
3. **Lint.** `npm run show:lint -- bands/<Band>/<Band>.lcshow --bpm <fastest song BPM>`. The lint reads the Song sets table from the Cue Sheet beside the file for the Variety item. Done when every item that scored below 2 has a cause: fix the Brief and return to step 2, or record it as a generator gap for the user.
4. **Shots.** `npm run show:shots -- bands/<Band>/<Band>.lcshow <venue.lcvenue> --out bands/<Band>/shots`. It builds the app, then renders under xvfb. Done when it prints 8 PNG lines with no `BLANK`. Then open every PNG with Read.
5. **Score.** Score rubric items 4, 6, 14 and 15 from the PNGs, each 0, 1 or 2, one line of evidence per item naming the PNG. Add the lint's ten items (2, 4-6, 8-12 and Variety), and report the total. [What to look for](#reading-the-shots). Done when each of the four has a score and evidence.
6. **Hand off.** Tell the user the Show path and the Cue Sheet path. Offer light-song for each song (`/light-song`). A Plan names its Show with `show:`.

## The brief

One AskUserQuestion round, options built from what the user said so far:

- Band name, genre and mood (`upbeat`, `melancholy`, `aggressive`, `calm`, `dreamy`).
- Band colours: 1-3 swatches, most important first.
- Songs and BPMs (90-200). A song may carry its own colours or an existing Plan path.
- Venue: the `.lcvenue` path.
- Strobe: `capped` (4 Hz) or a Hz rate.

## Reading the shots

Camera FOH, haze 40 %. Spot the stage, the beams and the floor pools.

| Item | Pass (2) | Fail (0) |
| --- | --- | --- |
| 4 Front floor | Vocalist area lit in every shot except Silhouette | A shot where the front is dark |
| 6 Chill space | Chill shot has dark areas: at most 2 parts lit | Chill lights the whole stage |
| 14 Back halo | Back light separates the band from the back wall in the Looks | Back wall dark or flat |
| 15 Symmetry | Peak combo is mirrored left and right | One side clearly brighter or a different colour |

A score of 1 is partial: say what is missing. The combo shots catch one frame of moving Effects, so judge symmetry from colours and beam layout, not from a sweep position.

## Gaps

A rubric failure the Brief cannot fix is a generator gap. Say so, name the Scene, and propose the change to `tools/shows/make-shows/generate.ts` as separate work. Never edit the generated Show by hand.
