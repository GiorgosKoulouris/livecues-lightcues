# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Windows 10/11 desktop app built on Electron. The renderer is web UI (React, plain CSS tokens, Radix primitives), so it follows web design rules, not native iOS/Android ones.

## Users

Primary user: a band's tech or touring lighting person (LD) who looks after the lights for a band. They know DMX terms: Universes, addresses, Fixture Profiles, modes. They program a Show once, then re-patch it at each venue on the tour, often under time pressure at load-in.

Secondary, not confirmed: musicians who set up the lights themselves. They should not be blocked, but the UI does not have to explain basic DMX to them.

## Product Purpose

LightCues runs a band's lighting at live shows from a Windows laptop. The DAW or a MIDI controller fires Scenes through MIDI notes in each song, so no one needs to work a desk during the set. Success: the same Show plays correctly in every venue after a re-patch, and the lights follow the songs.

## Positioning

- **Venue-independent Shows.** Scenes aim at Zones (a fixed stage grid) and Roles (Wash, Spot/Beam, Blinder, …), never at single Fixtures. A new venue means re-patching, not re-programming. Conventional consoles tie cues to fixture numbers. (ADR 0001.)
- **DAW-driven, hands-free.** Each song's MIDI notes trigger Scenes. Go, Flash and Release modes.
- **Free and open source.** MIT, no paid tiers, works fully offline.

## Operating Context

- **At the gig:** the room is dark. A bright screen ruins night vision and can be seen from the stage. This is why the theme is dark only (ADR 0003).
- **Prep (home or rehearsal):** import Fixture Profiles (Open Fixture Library `.json`, GDTF `.gdtf`), build Scenes and Rules, map MIDI Triggers.
- **Load-in at each venue:** make or open a Venue Patch: stage size, Universes and Outputs, Fixtures placed on the stage plan, House Lights.
- **MIDI routes:** rtpMIDI from a DAW on another laptop, loopMIDI from a DAW on the same PC, or a hardware controller.
- **Hardware:** Enttec DMX USB Pro or DMXking ultraDMX (FTDI USB serial). The Virtual Output needs no hardware.

## Capabilities and Constraints

- Four views: Show, Venue Patch, Profile Library, Perform (Ctrl+1 to Ctrl+4).
- The Fallback Panel is on screen in every view: Blackout, Base Look, Grand Master, Tap Tempo, Freeze, chosen Scene buttons and House Presets, each with a key (B, 0, 1–9, -/+, T, F, Shift+1–8). If MIDI drops, the current look holds.
- Blind edits without changing the real lights. The Preview shows the stage from above and from the front.
- Undo history lives in the engine. Edits commit instantly, with no Save-per-field (ADRs 0004, 0005).
- The engine runs in a separate process from the UI (ADR 0002).
- The update check only checks. It shows a notice in the Sidebar, never in Perform, and downloads nothing (ADR 0012).
- Terminology is fixed by [CONTEXT.md](CONTEXT.md). UI copy uses its capitalised terms and avoids the listed alternatives.
- Dark theme only. Tokens keep a light theme possible later (ADR 0003).
- Icons are bundled, because the app must work offline. No web fonts or CDN assets.
- Text uses the Windows system font (Segoe UI) for now. The family fonts (IBM Plex, OFL-1.1) are bundled once the family styling lands, and any bundled asset must be MIT compatible (ADR 0017).
- The installer is not code-signed yet.

## Brand Commitments

- Name: **LightCues**, part of a **LiveCues** family (data folder `%APPDATA%\LiveCues\LightCues`, install folder `LiveCues\LightCues`).
- App icon: [build/icon.svg](build/icon.svg).
- Voice, as in the README: short, plain sentences, second person, concrete actions, named controls in bold. No marketing claims.

## Evidence on Hand

- Screenshots and a demo animation: [docs/images/](docs/images/) (`perform.png`, `venue-patch.png`, `scene-editor.png`, `profile-import.png`, `demo.gif`).
- Example Show and Venue Patch: [examples/demo.lcshow](examples/demo.lcshow), [examples/demo.lcvenue](examples/demo.lcvenue), described in [examples/README.md](examples/README.md).
- None yet: testimonials, user counts, named bands or venues, press, benchmarks. Do not make these up.

## Product Principles

1. **The Show is portable.** Nothing in a Show may depend on one venue's Fixtures. Venue-specific facts live in the Venue Patch.
2. **The gig must not stop.** A failure (MIDI lost, Output unplugged) holds the current look and is shown clearly. Recovery controls are always one key away.
3. **Perform stays calm.** Nothing non-essential appears in Perform: no update notices, no prompts.
4. **Speak the lighting tech's language.** Use DMX and CONTEXT.md terms exactly. Do not water them down.
5. **Offline and free.** No network dependency for any core function, and nothing that conflicts with the MIT licence.

## Accessibility & Inclusion

No product-specific standard has been set. The fixed constraint is the dark venue: low glare, no bright surfaces.
