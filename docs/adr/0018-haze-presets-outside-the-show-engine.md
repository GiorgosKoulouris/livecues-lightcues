# Haze Presets in the Show, Hazers in the Venue Patch

Many venues have a hazer on the Universe the app takes over. While the app drives that Universe, every channel it does not patch goes to 0, so the hazer goes off and beam looks lose most of their impact. A Fixture Profile could only hold the haze channel at a fixed default, which gives one level for the whole set.

Haze is a room-wide device, not a light: it has no position that matters, no colour and no intensity in the Scene sense, and it takes minutes to build or clear. So it stays out of the show engine, like House Lights (ADR 0013). A Hazer is patched in the Venue Patch with no stage position, Zone, Role or Mounting. Scenes never target it, and Blackout, Grand Master, Freeze and Blind do not apply to it: a Blackout must not clear the room's haze, and haze must stay controllable while programming blind.

How much haze a song wants is a Show decision, so the Show holds Haze Presets: named slots with a level (0–100%), a fade and an optional MIDI note, fired by the DAW like House Presets. How much a given machine and room need is a venue fact, so each Hazer in the Venue Patch has a max output that scales the level, and a fan level sent whenever its output is above 0. Every Hazer follows the same Haze Preset. A built-in Haze Off goes to 0 at once.

Hazers are off at launch and whenever a Show or Venue Patch is opened. The app never starts haze before a cue asks for it. A lost MIDI Input holds the current output, like the rest of the look.

## Considered Options

- Mirror ADR 0013 exactly, with a level per Haze Preset per Venue Patch: more control, but every venue needs every slot set up. One max output per Hazer covers the real difference between rooms.
- A haze level in Scene Rules, or a Hazer Role: haze would follow songs through the existing Triggers, but a room-wide device would enter the Zone and Role model, and Blackout and Blind would reach it.
- A Haze fader on the Fallback Panel only: simplest, but not DAW-driven.
- A fixed level held through the Profile's channel defaults: works today, but one level for the whole set.
