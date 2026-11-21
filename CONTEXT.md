# LightCues

A Windows lighting controller for live music shows. Shows are programmed once and re-used across venues with different lighting rigs.

## Language

### Rig

**Fixture**:
A single lighting device occupying a block of DMX channels in one Universe.
_Avoid_: Figure, light, device

**Fixture Profile**:
The manufacturer/model definition of a fixture type: its modes, channels and capabilities. Capabilities include colour wheel slots, gobo wheel slots (open or a named gobo), prism in or out, and prism rotation speed (relative to the channel's fastest rate, slow to fast, direction dropped). Gobo indexing and rotation stay unsupported.
_Avoid_: Fixture definition, personality

**Cell**:
One repeated section of a multi-cell Fixture (a pixel, a wash section). A Fixture Profile has no cell model: each Cell's channels are flattened into the mode, named e.g. "Red (Cell 2)" from GDTF or "Red 2" from Open Fixture Library. Not a Zone.
_Avoid_: Pixel, segment

**Profile Library**:
The app-level collection of Fixture Profiles, imported from Open Fixture Library or GDTF files, or made by hand. A Venue Patch embeds copies of the Profiles it uses, so it does not depend on the library.
_Avoid_: Fixture library, catalogue

**Universe**:
One independent set of 512 DMX channels.

**Output**:
A physical, network or virtual DMX interface port to which a Universe is mapped.
Virtual Output: an Output with no hardware, for trying a Show and for tests.
_Avoid_: Interface, node, dongle

**Channel monitor**:
A panel in the Venue Patch view showing the 512 values an Output gets for one Universe, in Blind too. Not the same as Monitor, the mode.
_Avoid_: DMX view, channel view

**Venue Patch**:
The per-venue description of the rig: which Fixtures exist, their Profile, Universe, address and position on stage, and optionally the gobo slot a Gobo Rule sends to a Fixture.
_Avoid_: Rig file, setup

### House

**House Light**:
A Fixture belonging to the venue (bar, ceiling) rather than the show rig, on a Universe the app drives. Patched in the Venue Patch with a Profile, Universe and address, but no stage position, Zone, Role or Mounting. Only intensity and colour are driven. Scenes never target it, and Blackout, Grand Master, Freeze and Blind do not apply to it.
_Avoid_: Venue light, room light

**House Group**:
A named set of House Lights in the Venue Patch, such as Bar or Ceiling. Each House Light is in exactly one.
_Avoid_: Area, Zone

**House Preset**:
A named slot in the Show, with a fade and an optional MIDI note, that sets the House Lights to that slot's house look. Fired by its note (Go only) or its button in Perform. One holds at a time.
_Avoid_: House Scene, house cue

**House look**:
Intensity and colour for some House Groups, defined in the Venue Patch for one House Preset or as the Startup look. Groups it does not list stay where they are.

**Startup look**:
The house look a Venue Patch sends from launch and when it is opened, and that Startup in Perform fades back to. Going to it sends the Groups it does not list to full white, as at launch. Full white when not set.

### Haze

**Hazer**:
A haze machine on a Universe the app drives. Patched in the Venue Patch with a Profile that has a haze channel, a Universe, an address, a max output and a fan level, but no stage position, Zone, Role or Mounting. Scenes never target it, and Blackout, Grand Master, Freeze and Blind do not apply to it. Every Hazer follows the same Haze Preset. It sends the Haze Preset's level times its max output, and its fan level whenever that output is above 0 (0 otherwise). It is off at launch and when a Show or Venue Patch is opened, and holds its output when the MIDI Input is lost. After an engine recovery the held Haze Preset comes back, its output at its level at once with no fade; Haze Off stays off, and a Haze Preset no longer in the Show comes back as none, at 0.
_Avoid_: Fogger, smoke machine, atmosphere

**Haze Preset**:
A named slot in the Show with a haze level (0–100%), a fade and an optional MIDI note, that takes every Hazer to that level. Fired by its note (Go only) or its button in Perform. One holds at a time. Haze Off, built into every Show, takes the Hazers to 0 at once.
_Avoid_: Haze Scene, haze cue, fog preset

### Visualiser

**Visualiser**:
A View that shows the rig in 3D: the stage, a back wall and an audience floor derived from the stage bounds, a bar of truss under each row of Overhead Fixtures, and a generic body for each Fixture (moving head, par, bar or blinder, by its Profile and Role, with Mounting applied). Read-only: hovering a Fixture shows its name, and the mouse orbits, zooms and pans the camera, with FOH, Top and Side presets. A Fixture with its prism in is drawn as several split beams around its aim, turning at a fixed visual speed for Rotate slow and a faster one for Rotate fast; the Gobo is not drawn. The free camera is kept while the app runs, never saved. The House Lights tint and set the Visualiser's ambient light (only; its key light stays full). Not the Preview, the 2D top-down and front views in Show and Perform.
_Avoid_: 3D preview, simulator

**Beam angle**:
The full angle, in degrees, of the cone of light a Fixture throws. An optional field of its Fixture Profile, more than 0 and at most 180, imported from an OFL lens range (its midpoint) or a GDTF Beam geometry, and editable in the Profile Editor. A Profile without one uses its Role's default: Wash 25°, Spot/Beam 8°, Blinder 60°, Strobe 90°, Pixel/Bar 30°, Effect 15°. Only the Visualiser draws it; the Preview ignores it. A zoom channel does not change it.
_Avoid_: zoom, spread

**Assume haze**:
A view-only slider in the Visualiser toolbar that sets the haze density the beams are drawn with, at once, in place of the Hazers' output. Cleared, the density follows the Hazers again. Never saved, and never sent to a Hazer. For rigs with no Hazer patched.
_Avoid_: fake haze, haze override

### Show

**Show**:
The venue-independent part of a project: Scenes, triggers and mappings. Combined with a Venue Patch to run.
_Avoid_: Project (ambiguous: a Show alone or a Show + Venue Patch)

**Scene**:
A reusable look or effect that targets Zones rather than specific Fixtures. Several Scenes can be active at once and are combined.
_Avoid_: Cue, preset

**Cue Sheet**:
A generated, human-readable companion to a built Show: the Scene names and notes per MIDI channel, and how its Layers combine. Read only, and rebuilt with the Show. A Plan picks Scenes by the names on it.
_Avoid_: Note map, cheat sheet

**Rule**:
One part of a Scene: a target (Zones × Roles) and the settings applied to it (intensity, colour, Direction, Effects, strobe, Prism, Gobo). Later Rules in a Scene override earlier ones.

**Effect**:
A time-varying change within a Rule, timed in beats of the Tempo. There are three kinds: movement, intensity and colour, and a Rule has one slot for each. A slot left unset leaves that kind to earlier Rules and lower Layers; set to None, it stops their Effect of that kind (a movement None holds the aim still, faded in like any Effect). Every Effect's length is 1/4, 1/2, 1, 2, 4, 8 or 16 beats. A movement Effect (Circle, Pan sweep, Tilt sweep, Ballyhoo, Fan, Figure-8) runs around a base Direction, which may come from another Scene; its size is in degrees. A Fan turns each moving Fixture's pan out from centre stage in proportion to its distance from it, the outermost of the targeted moving Fixtures reaching the size at the half of the length and all closing again by its end, never crossing to the other side, so a Fixture on the centre line stays still; a Figure-8 is one pan cycle and two tilt cycles over the length. An intensity Effect (Pulse, Ramp up, Ramp down, Square, Chase, Random) scales the intensity a Fixture gets, which may come from another Scene, by up to its depth (0–1); Chase lights one Spread position at a time, or with a width of 1/4, 1/3 or 1/2 that share of them (at least one); Random lights that width's share of the Fixtures, picked afresh on each step (an Effect length divided by the Spread positions) but the same every cycle, and takes the width too (one Fixture without it). With one Spread position (In sync) a Random steps twice a cycle, as a Chase falls back to a half-cycle Square. A colour Effect steps or fades through 2 to 4 colours, or runs a Rainbow (a hue cycle), in place of the Rule's colour: a Rule sets a colour or a colour Effect, not both. A colour set later stops it, and a colour None shows the colour under it. Size and depth fade in with the Scene, and a colour Effect crossfades from the colour before. A movement Effect too fast for a moving Fixture runs slower, under the Speed limit. Sequences over time are not Effects: the DAW sequences Scenes through Triggers. A spatial Effect is ordered by Fixture positions on stage (e.g. a left-to-right wave).
_Avoid_: Chase (for an Effect in general; Chase is one intensity Effect), FX

**Speed limit**:
The fastest a movement Effect may turn a moving Fixture: 300°/s, on pan and on tilt separately, for every Fixture, always on. An Effect that would go faster runs at the shortest longer Effect length that stays under it, keeping its size and the beat; only if 16 beats is still too fast does its size shrink. It switches length on a beat where no Fixture jumps, and steps back down only when well under the limit. The Show keeps the length as programmed.
_Avoid_: Speed cap, max speed

**Strobe**:
A Rule setting that makes the targeted Fixtures with a strobe channel flash: Off, Slow (2 Hz), Medium (6 Hz), Fast (12 Hz), or once per 1, 1/2 or 1/4 beat of the Tempo. Only the rate is sent; each Fixture times its own flashes, so they are not locked to the beat. Off stops strobe from earlier Rules and lower Layers. It snaps on and off at Scene start, and Freeze does not stop it. Not an Effect.
_Avoid_: Flash (a Trigger mode), shutter

**Prism**:
A Rule setting for the targeted Fixtures with a prism: Off, On, Rotate slow or Rotate fast. On moves the prism into the beam; a rotation sends the prism's rotation speed at a fixed slow or fast point of the Profile's speed span, with the prism in. Only a rate is sent, so nothing is locked to the beat. Off moves the prism out and stops it from earlier Rules and lower Layers. It snaps on and off at Scene start, and Freeze does not stop it. Not an Effect.
_Avoid_: Beam split (a Visualiser look, not the setting)

**Gobo**:
A Rule setting for the targeted Fixtures with a gobo wheel: Open or Gobo. Gobo sends the first slot of the wheel that is not open, or the gobo slot the Venue Patch picks for that Fixture. Open sends the open slot and stops the gobo from earlier Rules and lower Layers. It snaps on and off at Scene start, and Freeze does not stop it. Not an Effect.
_Avoid_: Pattern, wheel (the Fixture's part, not the setting)

**Snap setting**:
A Rule setting that takes effect at once at Scene start and is never crossfaded: Strobe, Prism and Gobo. Freeze does not stop it. The last Rule in a Scene that targets a Fixture with it wins, and across Layers the most recently started Scene's wins. Each has a resting value (Strobe Off, Prism Off, Gobo Open) that stops it from earlier Rules and lower Layers; any other value needs the Fixture's hardware, and the Venue Check notes a Fixture without it.
_Avoid_: Instant setting, non-fading setting

**Focus Check**:
A Venue Patch editor mode that sends every moving Fixture, open in white, to one chosen Direction on the real rig, in Blind too, so placement and Mounting can be corrected live. Blackout still wins. Ends when the editor is left.

**Spread**:
How an Effect is offset across the Fixtures it targets, by their stage positions: In sync, Left→Right, Right→Left, Mirrored (centre out), Edges→Centre, Front→Back (by stage y, from the front), Back→Front, Alternate or Random (a fixed order per Fixture, seeded by its id like Ballyhoo). Fixtures tied on the same x, |x| or y run together.
_Avoid_: Phase, wings

**Zone**:
A cell of the fixed stage grid: rows Front/Downstage/Midstage/Upstage × columns Stage Left/Centre/Stage Right × levels Floor/Overhead. The grid scales to each venue's stage bounds. A Fixture belongs to the Zone it is physically in, not the one it lights.
_Avoid_: Area, region

**Role**:
A Fixture's function, from a fixed list: Wash, Spot/Beam, Blinder, Strobe, Pixel/Bar, Effect. Used alongside Zones to target Rules.
_Avoid_: Type, group

**Direction**:
A named aim from a fixed vocabulary (Down, Audience, Up, Cross, Centre, Out), referenced by Scenes. A moving Fixture is one with a pan or tilt channel; it uses the axes it has. Each moving Fixture's pan/tilt for a Direction is computed from its stage position and Mounting, not stored per Fixture, so correcting a Fixture's placement corrects every Direction at once. Down and Up are straight down and up; Audience points each beam straight out at the audience; Cross aims each beam at the mirror point across centre stage; Centre converges every beam on centre stage; Out points away from centre into the audience. An aim a Fixture cannot reach is approximated and reported in the Venue Check.
_Avoid_: Position, preset, palette

**Mounting**:
How a moving Fixture is physically installed, recorded in the Venue Patch: Hung or Standing, the rotation of its base, pan/tilt inversion, and a pan/tilt offset for a fixture whose own zero is off. With its stage position, enough to compute where it points.
_Avoid_: Orientation, hang

**Tempo**:
The beats per minute that Effects run to. Taken from the MIDI Input's MIDI Clock when present, otherwise set by Tap Tempo, which also overrides it. When the clock is lost, the last Tempo holds.
_Avoid_: BPM, speed

**Freeze**:
Stops every Effect where it is, until turned off; they then jump to where the beat has got to. Directions and fades still apply. It holds the beat Effects run to, so a Scene started while frozen holds its Effect where that beat puts it. Not saved, off on launch, and kept when a Show is replaced, like Blackout.

**Layer**:
A slot that holds at most one active Scene. Activating a Scene replaces the active Scene in its Layer; different Layers stack.

**Trigger**:
A mapping from an incoming MIDI message to a Scene action: Go (activate and stay), Flash (active while held) or Release (clear the Layer).

**Scene button**:
A manual control for one Scene, in Perform. Toggles: it activates the Scene, or clears its Layer if that Scene is already active. Unlike a Trigger, which only does the action it maps.
_Avoid_: Trigger button

**MIDI Input**:
The MIDI port Triggers listen to, chosen per machine and kept between runs. When it is lost, the current look holds until it returns.
_Avoid_: MIDI device, controller

**Base Look**:
The Scene designated as the safe fallback look, available from the Fallback Panel at any time, and in Perform. Going to it clears every other Layer.

**Fallback Panel**:
The manual controls in the top bar that need no MIDI: Blackout, Base Look, Grand Master, Tap Tempo and Freeze, each with a keyboard shortcut. Hidden in Perform, which has its own controls; the keys still work there.
_Avoid_: Manual panel, fader panel

**Blackout**:
Takes every Fixture's intensity to 0 until turned off, in Blind too. The active Scenes stay active. House Lights and Hazers are not affected.

**Default Direction**:
The Direction a Show gives moving Fixtures where no Rule sets one, and the base of a movement Effect with none. Down unless changed.

**Default Colour**:
The colour a Show gives Fixtures where no Rule sets one. White unless changed.

**Grand Master**:
A global intensity scaler applied after all Scenes are combined. House Lights and Hazers are not affected.

**Monitor**:
The default mode, where the Preview and the Visualiser mirror exactly what is being sent to the rig.

**Blind**:
A mode where the Preview and the Visualiser update but nothing is sent to the rig, except Blackout, House Lights and Hazers, which always send.
_Avoid_: Offline, preview mode

**Venue Check**:
A report, produced when a Show is combined with a Venue Patch, listing Scenes whose targets are missing or only approximated in that rig, House Presets that Venue Patch has no house look for (not set up in this venue), and Haze Presets when it has no Hazer. Strobe is approximated on a Fixture with no strobe channel, which stays steady, and on one whose strobe rate has no Hz span, taken as 1–20 Hz, or a span made from words such as slow and fast. Prism and Gobo Rules on Fixtures with no prism, or no gobo wheel with a slot other than open, stay as they are; like Strobe, they are noted on that Fixture in the Venue editor, not listed Venue-wide.

### Reaper Lights

**Plan**:
A YAML file per song (`<Song>.lights.yaml`) that names the Scenes a song plays and when: a palette per tier, section cues, timed events and patterns. `lights:song write` compiles it to MIDI on the Show's note map. It holds Scene names, never notes. Not a Show.
_Avoid_: Cue list, script

**Region**:
A named span of the Reaper project that is one song. Its start is bar 1 beat 1 of the song, and the MIDI item written for it is named `lights:<region>`. Matched by name, ignoring case.
_Avoid_: Song marker, section

**Marker vocabulary**:
The section labels a Plan's markers are matched against, ignoring case and trailing numbers: intro, verse, pre, build, chorus, drop, break, bridge, solo, outro, roll, endroll, hit, blackout, stop. Each has a default treatment that the brief and the Plan override. An unknown label is allowed; Claude asks what it means.
_Avoid_: Section names

**End cue**:
The Go Scene fired in the last 1/16 of a Region so its note stays inside the item. Intro/Outro: Fade on the Look Layer unless the Plan sets `end`.

**Reset**:
The notes at a Region's start that set every Layer so a song works from cold and in any order: the Base Look on Look, the Down Scene on Movement, a Release on Pulse and Colour FX, nothing on Hit. A Layer with no Scene to rest on gets a Release. A Plan's `start` replaces it per Layer.

**Flash length**:
How long a Flash note is held in a Plan: `length` (beats or bars) or `until` a time, 1 beat if neither. Two Flash notes on the same note may not overlap. A Go or Release note is 1/16 of the signature's beat long and has no length.
