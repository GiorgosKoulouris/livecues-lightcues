# Prism and Gobo are rates and a slot, not beat-locked

A Rule's Prism and Gobo only set channels on the Fixture. Prism is Off, On, Rotate slow or Rotate fast. A rotation sends the prism's rotation speed at a fixed point of the Profile's speed span, one quarter of the way for slow and three quarters for fast, so a Show behaves the same on every Fixture. The Fixture's own motor turns the prism, as its own circuit times a strobe (ADR 0014). Nothing is locked to the beat and the engine adds no timing.

Gobo is Open or Gobo. Gobo sends the first slot of the Fixture's gobo wheel that is not open. The Venue Patch can name another slot for a Fixture, since the first gobo is rarely the one a rig wants. The slot is a per-venue choice like a Mounting, so it lives in the Venue Patch and not in the Show. A slot name the mode lacks is rejected when the Venue Patch is validated.

## Considered Options

- Prism rotation as an Effect, turning the prism in step with the beat: the prism's channel is a speed, not a position, and a fixed-rate motor cannot be phase-locked to a beat from DMX. It would also take an Effect slot for no gain.
- A gobo slot in the Rule: Shows would then name slots that differ between Fixtures and venues, and stop being venue-independent (ADR 0001).
- A rotation speed in the Rule: more rates to pick from, but a Show would then depend on each Fixture's speed span. Two points keep it simple.

## Consequences

- Like Strobe, Prism and Gobo snap on and off at Scene start rather than crossfading, and Freeze does not stop them. A value between two gobo slots or two rotation speeds is not a look.
- Unset leaves them to earlier Rules and lower Layers. Off and Open stop them, and send the prism out and the open slot, on Fixtures that have those ranges. Otherwise the channel stays at its default.
- On a Fixture where the prism and its rotation share a channel, a rotation sends the rotation range; on separate channels, the prism goes in and the rotation channel gets its speed. A Fixture whose rotation has no span is taken as 0 to 1 across its range.
- The Venue Check lists Scenes that set Prism or Gobo on a Fixture with no prism, or no gobo wheel with a slot other than open. Those Fixtures stay as they are.
- The Venue Patch file moves to version 5 for the optional gobo slot. The Show file stays at version 7, which this release already bumped.
