---
name: light-song
description: Turn one song (Region) of a Reaper project into MIDI that fires a band's Show (or the Energy Show). Use for "light this song", a section deep-dive, regenerating or recompiling a song's Plan.
---

# light-song

Turns one Region of a Reaper project into a Plan (`<Song>.lights.yaml`), shows it as a timeline, and writes its MIDI into `<project>.lights.rpp`. You cannot hear the song. Musical detail comes from the user, the markers and `analyse`. The script (`npm run lights:song --`) analyses, generates, compiles and writes. Terms are in [CONTEXT.md](../../../CONTEXT.md) (Reaper Lights).

Questions to the user go through AskUserQuestion.

## Flow

Each step ends when its output exists. Do not start the next before it.

1. **Inspect.** Get the project path, Region name and Show, then run `npm run lights:song -- inspect <project.rpp> <region>`. The Show is the band's `bands/<Band>/<Band>.lcshow` when there is one; ask if unsure. An untagged Show (Energy, Palette: no `tier:` tags in its Cue Sheet) takes [hand-authoring](hand-authoring.md) in place of steps 3-5. Done when you can state the Show, the song's bar count, tempo and signature changes, and every marker with its bar. Flag markers outside the [vocabulary](#marker-vocabulary), repeated labels, and tempo or signature changes.
2. **Analyse.** `npm run lights:song -- analyse <project.rpp> <region>` prints RMS per bar and onsets as song `bar.beat`. Read it for where the song swells, drops or goes silent, and where drum rolls and hits sit. Say which drum stems it found (Drums, KickBand, Snare): with none, `generate` puts the body Hits on the beat grid. A muted stem item is skipped without a warning: look for one in the `.rpp` and ask the user to unmute it until step 4 is done. Done when every swell, drop and silence has a bar.
3. **Sections and tiers.** Propose [the whole song as sections](#sections-file), from the markers and `analyse`. Onsets are energy-flux peaks, so a dense mix yields few. One [AskUserQuestion round](#the-sections-round). Done when the user has confirmed every section's bar, label and tier, and `Lights/<Song>.sections.yaml` beside the `.rpp` holds them.
4. **Generate.** `npm run lights:song -- generate <project.rpp> <region> --show <file.lcshow> --sections <file>` writes `Lights/<Song>.lights.yaml`. An existing Plan needs `--force`, which loses its hand edits: ask first, and copy it to `Lights/<Song>.lights.yaml.bak`. Done when it prints `Wrote:`. Report every warning, and the notes (body Hits on stem or grid, the last chorus raised to Peak, borrowed Colour Sets).
5. **Highlights.** Edit the Plan for each special moment and event marker from step 3 and the user's overrides of the [treatments](#marker-vocabulary). [Editing rules](#editing-a-plan). Done when each is in the Plan at its bar, or the user has left it out.
6. **Render.** `npm run lights:song -- render <project.rpp> <plan>` writes `<Song>.lights.html` beside the Plan. Plan errors name the line: fix and re-run. Done when you have told the user the path and every `Warning:` line, and each section below 2 on Density is fixed in the Plan or has a stated cause.
7. **Review loop.** The user reads the timeline and asks for changes. Edit the Plan, re-render, repeat. Done on the user's explicit OK.
8. **Write.** [Reaper must be closed](#writing): ask through AskUserQuestion and wait for the answer. `npm run lights:song -- write <project.rpp> <plan>`.

## The sections round

Show the proposed table (bar, label, tier, evidence from `analyse` or the marker) as an option preview. Ask, skipping what the user already stated:

- Are the sections and tiers right? One question per song.
- Special moments: stops, hits, solos, key lyrics.
- The meaning of each unknown marker.
- What each `roll`, `endroll` and `hit` marker fires: `generate` places nothing for them.
- Markers, when a section has none: `render` scores Density by project marker, and compares repeats by marker name, so each is named as its section's label. The user adds them in Reaper, or you render from a temporary copy of the `.rpp` with the markers added, leaving theirs untouched.

After the user saves markers, run `inspect` again. Where they differ from the confirmed sections, ask again: the user's markers may move a boundary.

## Sections file

```yaml
sections:
  - { bar: 1, label: intro, tier: chill }
  - { bar: 17, label: verse1, tier: groove }
  - { bar: 44, label: stop }
```

- `label` is a [Marker vocabulary](#marker-vocabulary) label, not `roll`, `endroll` or `hit`. Trailing numbers allowed: sections sharing a label are repeats, and each steps up.
- `tier` is `chill`, `groove`, `drive` or `peak`. `stop` and `blackout` take none. A `breakdown` with none is Peak.
- Label by what the bars do, not by the marker's name: a marked "drop" that is a bar of silence is a `stop`.
- Field rules: [development.md, Plan generator](../../../docs/development.md#plan-generator).

## Editing a Plan

- Read the Show's Cue Sheet (`<Show> cue sheet.md` beside the `.lcshow`) for Scene names and the Layer rules. The Plan holds names, never notes. Names are exact. A missing name is an error.
- Cue keys are the Go Layers: `look`, `movement`, `pulse`, `colourfx`. A cue sets a Scene or `release` per Layer. Hits are Flash Scenes: put them in `events` or `patterns`.
- Every Layer is set or released at the Region start (the Reset), and the Region ends on an end cue (Intro/Outro: Fade unless the Plan sets `end`). Override with `start:` and `end:` only when the user asks.
- Go cues sit on bar lines. Only Hits fall mid-bar.
- A Look fired after a Colour FX stops it: cue the Look first or in the same cue.
- Generated Hits keep a beat apart. When you add one, move or delete its neighbours: two notes of the same Flash Scene may not overlap.
- **Colour Sets.** The Cue Sheet's "Song sets" table gives each song a Main, a Break and a Swap (set names, without the note), cued by a `colourset:` beside the Layers. `generate` places them. The Show's set recolours the Scenes, so pick Scenes by feel, not colour.
- **Stacking (M4).** Scenes tagged `dynamic` in the Cue Sheet may stack per cue up to the tier's cap: Chill 2, Groove 3, Drive 3, Peak 4. `render` prints `Warning: ...` with the bar. `write` refuses until the cue is fixed. Pass `--allow-stack` only when the user asks for it.
- **Density.** `render` scores each section against its tier's floor and ceiling ([lint rules](../../../docs/agents/shows.md#density-lint); figures in `tools/shows/make-shows/rules.ts`). Below the floor, add Hits or Effect swaps; above the ceiling, take them out. Strobe is not a way to add Density. Report-only: `write` does not refuse. Changing the figures is separate work, from what the user saw in the Visualiser.
- **Gaps.** If no Scene fits, say so, pick the nearest, and propose a change to the Show's source (`tools/shows/make-shows/`: `generate.ts`, `energy.ts` or `palette.ts`) as separate work. Never invent a Scene name.

## Marker vocabulary

Labels match ignoring case and trailing numbers (`Chorus2` is `chorus`). The user's answers and the Plan override any default. Ask about unknown labels through AskUserQuestion.

| Label             | Default treatment                                              |
| ----------------- | -------------------------------------------------------------- |
| intro             | Intro/Outro: Walk-on, Chill movement                           |
| verse             | Chill (first verse), Groove (later)                            |
| pre               | Groove + a Pulse build                                         |
| build             | Pulse Ramp up, Hit: Riser on the last bar                      |
| chorus            | Drive; the last chorus is Peak                                 |
| drop              | Peak + a Hit on beat 1                                         |
| break             | Quiet: Chill, Break Colour Set (Energy: a Breakdown utility)   |
| breakdown         | Peak, Hits on the drum-stem riff, the Break Colour Set         |
| bridge            | Groove, palette shift                                          |
| solo              | Groove or Drive, beams on the soloist's side                   |
| outro             | Chill, then Intro/Outro: Fade at the end                       |
| roll ... endroll  | A Hit: Roll held until `endroll` or the next marker            |
| hit               | A single Hit, kind from the user                               |
| blackout          | Hit: Blackout until the next marker                            |
| stop              | Dark until the next marker (`generate` opens it with a Strobe) |

A repeated label (`Build`, `roll`) is ambiguous as a time: address those by bar. A Roll nearly always needs a `length` or `until` (a Flash lasts 1 beat by default).

## Deep-dives

- **One section.** Edit only that section's cues, events and patterns in the Plan, then re-render the whole song and write it. Neighbouring sections keep their Scenes.
- **New sections or tiers.** Change the sections file and `generate --force` (step 4 again), then redo the highlights.
- **Recompile.** After any Plan edit, `render` then `write`. The write replaces the Region's `lights:<region>` item and leaves other Regions' items.

## Writing

- Reaper must be closed on the `.lights.rpp`. Ask the user to close it through AskUserQuestion, and wait for the answer.
- `write` never touches the original: it saves `<name>.lights.rpp` next to it, and an existing one is the base. Changes saved to the original since then are not in it: tell the user. Deleting the `.lights.rpp` starts again from the original, and every other song then needs its `write` again.
- **Hand edit.** When `write` stops with "edited since it was written" (or "no hash file"), the item's MIDI was changed in Reaper. Ask through AskUserQuestion which: overwrite with `--force`, or fold the edits into the Plan. To fold, ask the user (AskUserQuestion) what they changed (or read the item in `<name>.lights.rpp`), put that into the Plan, re-render, get the OK, then `write`.
- **Stacking.** When `write` stops with "stacks too many dynamic Layers", release a dynamic Layer in that cue, or ask the user (AskUserQuestion) whether to re-run with `--allow-stack`.
- Done when `write` prints `Wrote:`. Tell the user to reopen the `.lights.rpp`.
