# Plans are generated to a Density

Hand-authored Plans came out at about a quarter of the cue rate of timecoded touring metal. Claude wrote one cue per 8–16 bars and Hits every 4 bars in choruses, and repeats got thinner. The Plan generator now fills each confirmed section to its tier's Density, and a Density lint scores floor and ceiling per section. Claude edits the highlights afterwards. The user still confirms the sections and tiers, because wrong boundaries would go straight to MIDI. Hits follow the drum stem's onsets, with a beat grid as fallback, so they lock to the riff and not just to the bar.

## Considered Options

- Lint and skill rules only, with Claude still writing every cue: rejected, because it is slow and inconsistent per song, and it already fell short of the rules it had.
- Fully automatic sections from RMS: rejected, because RMS boundaries in a dense mix are unreliable.
- Hits on the beat grid only: rejected, because they are not riff-locked. They remain the fallback.

## Consequences

- The generator only works on tagged Shows (generated band Shows). Energy and Palette stay hand-authored.
- Regenerating a Plan overwrites hand edits, so it needs `--force`.
- Density raises Hit, swap and colour rates, not strobe. The Strobe cap and the 3-per-second full-area Hit limit still apply.
