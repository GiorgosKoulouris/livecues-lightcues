---
name: LightCues
description: A flat dark hardware panel (silkscreen legends, recessed display slots, one signal orange) for running live lighting from MIDI.
colors:
  chassis: "#191a17"
  bar: "#141512"
  display: "#0c0d0b"
  key: "#282a25"
  key-hover: "#343630"
  edge: "#3a3c34"
  line: "#2d2e29"
  active-wash: "#22241f"
  legend: "#dcdbcd"
  legend-dim: "#8d8c80"
  signal: "#ff6a1a"
  signal-ink: "#1c0b00"
  led-green: "#79e08a"
  led-red: "#ff4a3a"
  warn-amber: "#e0a030"
typography:
  title:
    fontFamily: "IBM Plex Sans"
    fontSize: "18px"
    fontWeight: 600
  perform:
    fontFamily: "IBM Plex Sans"
    fontSize: "20px"
    fontWeight: 600
  body:
    fontFamily: "IBM Plex Sans"
    fontSize: "14px"
    fontWeight: 500
  key-label:
    fontFamily: "IBM Plex Sans"
    fontSize: "14px"
    fontWeight: 600
    letterSpacing: "0.04em"
  legend:
    fontFamily: "IBM Plex Sans"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.12em"
  readout:
    fontFamily: "IBM Plex Mono"
    fontSize: "14px"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  none: "0px"
  chamfer: "8px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
components:
  key:
    backgroundColor: "{colors.key}"
    textColor: "{colors.legend}"
    typography: "{typography.key-label}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "32px"
  key-hover:
    backgroundColor: "{colors.key-hover}"
  key-pressed:
    backgroundColor: "{colors.legend}"
    textColor: "{colors.chassis}"
  key-lit:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.signal-ink}"
  key-sunk:
    backgroundColor: "{colors.chassis}"
    textColor: "{colors.led-red}"
  key-large:
    padding: "0 16px"
    height: "44px"
  perform-control:
    typography: "{typography.perform}"
    height: "64px"
  scene-button:
    backgroundColor: "{colors.key}"
    textColor: "{colors.legend}"
    padding: "8px 12px"
    height: "52px"
    width: "160px"
  scene-button-live:
    backgroundColor: "{colors.active-wash}"
    textColor: "{colors.legend}"
  field:
    backgroundColor: "{colors.display}"
    textColor: "{colors.legend}"
    rounded: "{rounded.none}"
    padding: "0 8px"
    height: "32px"
  nav-item:
    textColor: "{colors.legend-dim}"
    typography: "{typography.legend}"
    height: "32px"
  nav-item-current:
    backgroundColor: "{colors.active-wash}"
    textColor: "{colors.legend}"
  tab:
    textColor: "{colors.legend-dim}"
    typography: "{typography.legend}"
    height: "32px"
  state-chip:
    textColor: "{colors.legend}"
    typography: "{typography.legend}"
  dialog:
    backgroundColor: "{colors.chassis}"
    rounded: "{rounded.none}"
    padding: "24px"
    width: "480px"
---

# Design System: LightCues

## Overview

**Creative North Star: "The Silkscreen Desk"**

LightCues is a piece of show hardware: a matte dark panel with legends silkscreened onto it, values in recessed display slots, and keys you press. It sits in a dark venue during the show, so it is calm, legible and deliberate. Nothing moves or glows unless the state changed, and every mark means something.

It shares this system with its LiveCues siblings, [VideoCues](https://github.com/GiorgosKoulouris/livecues-videocues) and [Reaper Remote](https://github.com/GiorgosKoulouris/livecues-reaper-remote). VideoCues is the closest, since it is also a Windows desktop app. Hex values stay identical across the three. LightCues adds sections for its own surfaces: the Fallback Panel, Perform, the Scene list and editor, the Preview and Stage Plan, Blackout and Blind.

The density is a working rack unit's. It assumes the user knows DMX, and fits a lot on one screen like a console. Perform is the exception: its controls grow to gig size.

**Key Characteristics:**
- Dark only. A light theme stays possible because tokens are named by role.
- Flat: depth is tone (Bar, Chassis, Display) plus 1px rules. No shadows, blur or gradients. The only exceptions are a lit LED's 6px halo and inset hard lines.
- Square corners everywhere. A key has one chamfered corner, top right, 8px, cut with `clip-path`.
- One Signal Orange: the one lit key, keyboard focus, selection and the selected view.
- State is always a drawn shape plus a word, never colour alone: disc, ring, triangle, square.
- IBM Plex Sans for anything printed on the panel, IBM Plex Mono for values the machine reports.

## Colors

A near-black, slightly olive chassis palette, warm off-white legends, one hot orange and three indicator-lamp colours. The values live in `src/renderer/src/ui/tokens.css` and nowhere else.

### Primary
- **Signal Orange** (`signal`): the one raised voice. The lit key, the 2px focus ring, the 3px edge of a selected row or view, selection on the Stage Plan, and "LightCues" in the top bar.
- **Signal Ink** (`signal-ink`): text and glyphs on a Signal fill. Never used on its own.

### Neutral
- **Chassis** (`chassis`): the panel itself, dialogs, and the face of a sunk key.
- **Bar** (`bar`): the strip above and beside the panel: top bar, Sidebar, Fallback Panel, table headers, tooltips and popups.
- **Display** (`display`): recessed slots: fields, readouts, tables. The darkest tone.
- **Key** (`key`) and **Key Hover** (`key-hover`): the key face and its hover face. Key Hover also colours scrollbar handles.
- **Edge** (`edge`): the 1px border round a Display slot, and the outline of a quiet key.
- **Line** (`line`): 1px dividers between sections, under bars and between table rows.
- **Active Wash** (`active-wash`): the face of a live Scene, the selected view and a selected row. A tint, not a highlight.
- **Legend** (`legend`): all primary text and glyphs.
- **Legend Dim** (`legend-dim`): secondary text: captions, hints, unselected tabs, placeholders and disabled text.

### Indicator lamps
- **LED Green** (`led-green`): something is live and healthy. A live Scene (triangle), a running Engine (disc).
- **LED Red** (`led-red`): Blackout, errors and destructive actions.
- **Warn Amber** (`warn-amber`): needs attention. Blind, unsaved changes, warnings.

### Named Rules
**The Lit-Key Rule.** At most one Signal-filled key per view, and only for the forward action. Every other primary button is a plain key.

**The LED Rule.** Green, red and amber only report state, and always appear beside a drawn shape and a word. They never fill a key face or tint a background.

**The Dark Room Rule.** Text is Legend or Legend Dim. No new greys, no new hues, no hex outside `tokens.css`. The one exception is Preview and Stage Plan data (see below).

## Typography

**Sans:** IBM Plex Sans (500, 600, 700). **Mono:** IBM Plex Mono (400, 500).

Both are bundled as woff2 in `src/renderer/src/assets/fonts` with `OFL.txt`, loaded with `font-display: block`, because the stage machine may be offline. Segoe UI is the fallback. ADR 0017 lifted the old font ban.

### Hierarchy
- **Title** (600, 18px): the top bar. "LiveCues" in Legend, "LightCues" in Signal.
- **Perform** (600, 20px): text on Perform's 64px controls.
- **Body** (500, 14px): the default for text and fields.
- **Key label** (600, 14px, 0.04em): key faces. A lit key goes up to 700.
- **Legend** (600, 11px, 0.12em, uppercase): captions, field labels, table headers, Sidebar and tab labels, and the word in a state chip.
- **Readout** (Mono 400, 14px, tabular figures): DMX addresses, channel values, MIDI notes, percentages, BPM and times.

### Named Rules
**The Silkscreen Rule.** Anything that labels the panel is a legend: small, spaced, upper-case, Legend Dim. Anything the machine reports is in Mono. Words the operator acts on (key labels) are sentence-case Sans.

**The Readout Rule.** Any number that changes or is read as a value is Mono with tabular figures, so it does not shift as it changes.

## Layout

Fixed app shell: a 176px Sidebar, a 44px top bar, the view, and the Fallback Panel strip at the bottom. Only the view scrolls.

Spacing uses a 4px base (4, 8, 12, 16, 24, 32). Sizes stay as they are: 32px controls, 44px large, 52px Scene buttons (160px wide), 64px Perform controls. The one breakpoint is 1280px: below it, side columns such as the Preview become a panel over the view.

### Named Rules
**The Fixed Frame Rule.** The Sidebar, top bar and Fallback Panel never scroll away. Recovery controls stay visible in every view.

## Elevation & Depth

Flat. Depth is three tones (Bar, Chassis, Display) and 1px Edge and Line rules. Overlays are separated by a Bar or Chassis face and an Edge line, over a 60% black backdrop for dialogs.

### Named Rules
**The Flat-Panel Rule.** No shadows, blur or gradients. The only exceptions are a lit LED's 6px halo and inset hard lines.

**The Sunk-Is-On Rule.** A pressed-in look is reserved for state. A key sinks only while something it controls is on.

## Shapes

Every corner is square (`--radius-*` are 0). The **key** (any button that acts) has its top right corner cut at 8px (`--chamfer`) with `clip-path`. The focus ring is 2px Signal drawn inside the key.

State shapes are drawn, never typed: a disc (live), ring (warning), triangle (playing) and square (idle). A 3px edge marks selection and the window frame for Blackout and Blind.

## Components

### Keys
- **Normal:** Key face, Legend label, hover lifts to Key Hover. 32px high, 44px large.
- **Pressed:** inverts to a Legend face with Chassis text.
- **Lit:** Signal face, Signal Ink label at 700. At most one per view.
- **Quiet:** no face, an Edge outline.
- **Sunk:** Chassis face, 2px inset LED Red outline, LED Red label.
- **Disabled:** 40% opacity.
- **Key hint:** the keyboard key (B, 0, 1 to 9, T, F) printed in Legend Dim at the right of the key.

### Fields
A Display slot with a 1px Edge, 32px high, 8px padding. Label above as a legend. Focus draws the 2px Signal ring. Error uses an LED Red border and a message beside a triangle. Values are Mono.

### Navigation
- **Sidebar:** legend caps. The selected view gets Active Wash and a 3px Signal edge.
- **Tabs:** legend caps in Legend Dim. The selected tab is Legend with a 3px Signal underline.

### State chip
A drawn shape, a gap, then an upper-case legend word. It never relies on colour alone.

### Scene list and editor
A Scene button is a key at 160 by 52px: name left, wrapping to two lines, key hint on the right. The **live Scene** uses the family's active-row language: Active Wash face, 3px Signal edge, an LED Green triangle and the name at 700. There is no green fill. The Scene editor's Rules and Layers are Bar panels with a Line border; their numbers are Mono.

### Perform
Gig-size: 64px controls, 20px text, 52px Scene buttons. The same shapes and tokens as the rest of the app, only bigger. Blackout and Base Look sit among them.

### Fallback Panel
A Bar strip at the bottom of every view, with Line above it. It holds Blackout, Blind, Freeze, Grand Master and the Scene keys, each with its key hint. It never scrolls away.

### Blackout
At rest it is a plain key with an LED Red mark and the word BLACKOUT. When engaged it is sunk: Chassis face, 2px inset LED Red outline, a red disc and BLACKOUT. It has no red fill. The window frame goes red.

### Blind
Blind is Warn Amber. At rest a plain key. When on, an amber ring and BLIND in a state chip, and the window frame goes amber (Blackout wins).

### Preview and Stage Plan
The content is exempt from the palette. Beam colours and intensity are data, drawn as they are. The chrome (floor, grid, Zone lines, labels) uses tokens. Selection is a Signal edge.

### Dialog and Toast
Dialogs are Chassis with an Edge line, 24px padding, at most 480px wide, over a 60% black backdrop. A toast sits bottom right with a 3px edge and a drawn shape in the state colour.

## Do's and Don'ts

### Do:
- **Do** take every colour, size and spacing from the tokens in `src/renderer/src/ui/tokens.css`. Add a token rather than hard-coding a value.
- **Do** pair every state colour with a drawn shape and an upper-case word.
- **Do** put values the machine reports in Mono with tabular figures.
- **Do** print the keyboard key on any control that has one.
- **Do** keep Perform's targets at gig size.
- **Do** keep hex values identical to the sibling apps.

### Don't:
- **Don't** light more than one key per view, or fill a key red or green.
- **Don't** add shadows, blur, gradients, rounded corners or illustrations.
- **Don't** use colour alone to report state.
- **Don't** add a light theme surface or any large bright area.
- **Don't** load fonts, icons or images from the network. Everything ships with the app.
- **Don't** let the Sidebar, top bar or Fallback Panel scroll out of view.
