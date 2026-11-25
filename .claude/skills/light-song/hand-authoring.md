# Hand-authoring (untagged Shows)

For Energy and Palette, which `generate` rejects. These steps replace steps 3-5 of [the flow](SKILL.md#flow); the other steps are the same. [Editing a Plan](SKILL.md#editing-a-plan) applies, without Colour Sets (the Show has none), stacking and Density (neither is linted).

3. **Brief.** One AskUserQuestion round, [questions below](#the-brief). Skip what the user already stated. Done when every question has an answer, including "none".
4. **Draft** `Lights/<Song>.lights.yaml` next to the `.rpp`. Format: [example.lights.yaml](example.lights.yaml). Confirm every placement taken from `analyse` with the user. Done when every marker has a [treatment](SKILL.md#marker-vocabulary) and every Scene name is copied from the Show.

## The brief

One AskUserQuestion round, each with options built from the song so far:

- Vibe in 2-3 words.
- Energy curve: which sections are quiet, which peak.
- Palette: 1-3 colour families, and colours to avoid.
- Movement feel: still, slow or aggressive.
- Strobe and blinder tolerance.
- Special moments: stops, hits, solos, key lyrics.
- The meaning of each unknown marker.

Store the answers under `brief:` in the Plan.

## Scenes and palette

- The default Show is `tools/shows/Energy.lcshow` (a Plan with no `show:` line); its Cue Sheet is `tools/shows/Energy cue sheet.md`.
- Map the brief's palette to Scenes per tier under `palette:`, then cue with `tier: drive`.
- A Gap here (no amber Peak Look, avoided green in every Chill Look) is a change to `tools/shows/make-shows/energy.ts` (Palette: `palette.ts`).
