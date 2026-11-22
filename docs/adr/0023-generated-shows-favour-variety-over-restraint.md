# Generated Shows favour variety over restraint

The Show generator was first built to industry restraint rules. A song had one primary and one secondary hue with a white accent (P1, P4), and the front was pale and steady (P3, I3). Few dynamic Layers could stack, and there were few Scenes per Layer, because research critique #7 faulted the Energy Show for "too many Scenes". The first band Show built this way had 2 distinct colour pairs and about a third of Energy's Scenes, and it looked monotonous on stage. We now hold generated Shows to Energy's range. That means a pool of 6–8 Colour Sets with each song cueing a Main, a Break and a Swap (Set roles), any colour in the Accent slot, Energy's Scene counts per Layer per tier, front Fixtures included in every Effect kind (the Brief's `front:` option is gone), and stacking caps raised by one (Chill 2, Groove 3, Drive 3, Peak 4). We keep Colour Sets and Slots rather than baking colours into Looks as Energy does, so the Scene count stays bounded while colour varies by cue.

## Considered Options

- Keep restraint and add variety only within the rules: rejected, because the rules themselves caused the sameness.
- Bake colours into Looks like Energy: rejected, because it multiplies the Scene count by the number of palettes and drops Colour Sets from generated Shows.

## Consequences

- Rubric item 1 (at most 2 hues per Look) and item 3 (front pale) no longer apply. Item 2 (no near-miss pair) still checks Primary against Secondary.
- A new Variety lint item scores the counts per Layer and the Set roles.
