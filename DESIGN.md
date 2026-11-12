---
name: LightCues
description: A dark, quiet Windows lighting controller for live music shows.
colors:
  booth-black: "#0e1014"
  desk-panel: "#15181e"
  raised-panel: "#1c2028"
  lifted-panel: "#262b35"
  hairline: "#2f3541"
  hairline-strong: "#444c5b"
  label-white: "#e3e6eb"
  label-grey: "#9aa2b1"
  label-faint: "#6b7383"
  cue-blue: "#5b9dff"
  cue-blue-hover: "#7aafff"
  cue-blue-soft: "rgb(91 157 255 / 16%)"
  live-green: "#3ddc97"
  live-green-soft: "rgb(61 220 151 / 16%)"
  blackout-red: "#ff4d4f"
  blackout-red-hover: "#ff6b6d"
  blackout-red-soft: "rgb(255 77 79 / 16%)"
  blind-amber: "#ffb020"
  blind-amber-soft: "rgb(255 176 32 / 16%)"
typography:
  perform:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.4
  headline:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
  caption:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
  mono:
    fontFamily: "ui-monospace, Consolas, 'Cascadia Mono', monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tnum"
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
components:
  button-primary:
    backgroundColor: "{colors.cue-blue}"
    textColor: "{colors.booth-black}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.cue-blue-hover}"
  button-secondary:
    backgroundColor: "{colors.raised-panel}"
    textColor: "{colors.label-white}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-secondary-hover:
    backgroundColor: "{colors.lifted-panel}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.label-grey}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-danger:
    backgroundColor: "{colors.blackout-red}"
    textColor: "{colors.booth-black}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-large:
    padding: "0 16px"
    height: "44px"
  perform-control:
    typography: "{typography.perform}"
    height: "64px"
  scene-button:
    backgroundColor: "{colors.raised-panel}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "52px"
    width: "160px"
  scene-button-active:
    backgroundColor: "{colors.live-green-soft}"
  input:
    backgroundColor: "{colors.desk-panel}"
    textColor: "{colors.label-white}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "32px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.label-grey}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "32px"
  nav-item-current:
    backgroundColor: "{colors.cue-blue-soft}"
    textColor: "{colors.cue-blue}"
  tab:
    textColor: "{colors.label-grey}"
    padding: "0 12px"
    height: "32px"
  badge:
    backgroundColor: "{colors.lifted-panel}"
    textColor: "{colors.label-grey}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "20px"
  layer-panel:
    backgroundColor: "{colors.desk-panel}"
    rounded: "{rounded.lg}"
    padding: "12px"
  dialog:
    backgroundColor: "{colors.raised-panel}"
    rounded: "{rounded.lg}"
    padding: "24px"
    width: "480px"
---

# Design System: LightCues

## Overview

**Creative North Star: "The Front-of-House Desk"**

LightCues looks like a lighting desk at the back of a dark room. Every control is labelled, numbers are exact, and nothing glows unless it has to. The screen sits in a dark venue during the show, so the base is near-black and text steps down to muted greys. Colour is kept for state: what is selected, what is live, what is dark, what is unseen.

The system is dense and made for a pro. It assumes the user knows DMX, fits a lot on one screen like a console does, and uses small type (11–16px) with tight 4px-step spacing. Perform is the exception. Its controls grow to gig size (64px high, 20px text) so they can be read and hit from arm's length.

Structure comes from tonal steps and 1px hairlines, not from decoration. There is no gradient, texture, illustration or brand flourish anywhere in the app. Fonts and icons are local (Segoe UI from Windows, bundled Lucide icons), because the app must run offline and stay MIT compatible.

**Key Characteristics:**
- Dark only, with a glare budget: near-black base, greys for text, colour only for state.
- One hue per meaning: blue for action, green for live, red for Blackout, amber for Blind.
- Dense, 4px-step layout. Perform scales up to gig size.
- Flat: tonal layers and hairlines. Shadows only on overlays.
- Hardware-style controls: bordered, labelled, keys printed on the buttons.

## Colors

A cool blue-grey neutral ramp with four saturated signal colours, each tied to one meaning.

### Primary
- **Cue Blue** (`cue-blue`): the action and selection colour. Primary buttons, the current Sidebar item, the selected tab underline, focus rings, selected list rows and selected Fixtures on the stage plan, the Grand Master thumb. **Cue Blue Hover** (`cue-blue-hover`) is its hover state. **Cue Blue Soft** (`cue-blue-soft`, 16% tint) fills selected rows and the current nav item.

### Secondary
- **Live Green** (`live-green`): something is playing now. The outline and dot of an active Scene button, the running Engine dot, success toasts. **Live Green Soft** fills an active Scene button in Perform, so it reads from a distance.

### Tertiary
- **Blackout Red** (`blackout-red`): Blackout, errors and destructive actions. The danger button, the red window frame during Blackout, the Fallback Panel's top edge and tint during Blackout, invalid inputs, a lost MIDI Input.
- **Blind Amber** (`blind-amber`): Blind, warnings and unsaved changes. The amber window frame during Blind, the unsaved dot in the top bar, Fixture markers on the stage plan.

### Neutral
- **Booth Black** (`booth-black`): the app background, the stage plan canvas, and text on coloured buttons.
- **Desk Panel** (`desk-panel`): Sidebar, top bar, Fallback Panel, Layer panels, input fields.
- **Raised Panel** (`raised-panel`): secondary buttons, dialogs, popovers, menus, toasts, list hover.
- **Lifted Panel** (`lifted-panel`): hover on raised items, the stage shape, neutral badges, tooltips, the fader track.
- **Hairline** (`hairline`) and **Hairline Strong** (`hairline-strong`): 1px borders and dividers. The stronger one is for hover borders and key hints.
- **Label White** (`label-white`): main text.
- **Label Grey** (`label-grey`): field labels, idle nav items and tabs, secondary text.
- **Label Faint** (`label-faint`): hints, captions, empty states, group headings, the file kind in the top bar.

### Named Rules
**The Signal Colour Rule.** Each signal hue currently has one meaning: blue is action or selection, green is live, red is Blackout or danger, amber is Blind or a warning. This is the house convention, not a hard law. Break it only with a clear reason, and never for decoration.

**The Glare Budget Rule.** No large bright areas. Fills behind state use the 16% soft tints, not the solid hue. Solid signal colour goes on small marks (dots, outlines, thin frames) and on the few primary or danger buttons.

## Typography

**Body Font:** Segoe UI Variable Text (with Segoe UI, system-ui, sans-serif)
**Mono Font:** ui-monospace (Consolas, Cascadia Mono)

**Character:** the Windows system face, used as a tool font: neutral, compact, legible at 11–14px. Mono with tabular numbers is for anything you'd read off a desk: DMX addresses, channel values, percentages, BPM.

### Hierarchy
- **Perform** (500, 20px, 1.4): text on Perform's big controls (Blackout, Base Look, Tap, Freeze).
- **Headline** (600, 16px, 1.4): the app name, Layer headings, dialog titles. All h1–h4 are 600 weight.
- **Body** (400, 14px, 1.4): the default size for text, buttons and inputs. Buttons use 500.
- **Label** (500, 12px): field labels, hints, the top bar's status text, captions.
- **Caption** (500, 11px): badges, key hints, Fixture names on the stage plan, uppercase list group headings.
- **Mono** (400, 14px, tabular numbers): addresses, channel values, Grand Master percent, BPM.

### Named Rules
**The Readout Rule.** Any number that changes or is read as a value uses the mono font with tabular figures, so it doesn't shift sideways as it changes.

**The No Bundled Font Rule.** Don't add a web font. Text stays in the Windows system face, and any new font asset must be MIT compatible (OFL-1.1 is) and work offline. ADR 0017 lifted the old licence barrier; the family fonts arrive with the family styling.

## Layout

Fixed app shell: a 176px Sidebar on the left, then a 44px top bar, the view, and the Fallback Panel strip at the bottom. Only the view scrolls. The top bar and the strip stay put, and the window never scrolls. Views fill the space and scroll their own columns.

Spacing uses a 4px base (4, 8, 12, 16, 24, 32). 8px is by far the most used gap, 12–16px for panel padding, 24px for dialog padding. Controls are 32px high by default and 44px when large. Perform uses 64px controls and 160×52px Scene buttons, in a fill-in grid.

The layout is for desktop windows. The one breakpoint is 1280px: below it, side columns such as the Preview in Show and Perform become a panel over the view.

### Named Rules
**The Fixed Frame Rule.** The Sidebar, top bar and Fallback Panel never scroll away. Recovery controls stay visible in every view.

## Elevation & Depth

Flat. Depth comes from the four surface steps (Booth Black → Desk Panel → Raised Panel → Lifted Panel) and 1px hairlines. The only shadow is `--shadow-overlay` (`0 12px 32px rgb(0 0 0 / 50%)`), used on dialogs, popovers, menus, tooltips and toasts, over a 60% black backdrop for dialogs. Today a shadow means "this floats above the app". Subtle shadows on in-page cards are open for later, as long as they stay dark and low-glare.

### Named Rules
**The Tonal Step Rule.** To raise something, move it one surface step lighter and give it a hairline. Use a shadow only when it floats over other content.

## Shapes

Small, even radii: 4px for tabs, menu items, list rows and key hints; 6px for buttons, inputs and the stage plan; 10px for Layer panels and dialogs; pills for badges, status dots and the fader. Borders are 1px hairlines everywhere. Two state edges are thicker: the 3px left edge of a toast, and the 3px window frame for Blackout (red) and Blind (amber), drawn over everything.

## Components

Controls are like labelled hardware: plain, bordered, with the key printed on them and a clear on/off state.

### Buttons
- **Shape:** gently rounded (6px), 32px high with 12px side padding; large is 44px with 16px padding and 16px text.
- **Primary:** Cue Blue fill, Booth Black text. One per area at most.
- **Secondary:** Raised Panel fill with a hairline border. The default for most actions and for every Scene button.
- **Ghost:** no fill, Label Grey text, for toolbars and icon buttons.
- **Danger:** Blackout Red fill, Booth Black text.
- **Hover / Focus:** one surface step lighter and a stronger border, in 120ms. Focus is a 2px Cue Blue ring, separated by a 2px Booth Black gap.
- **Toggle on (`aria-pressed`):** secondary buttons get a Live Green outline (1px border plus 1px inset). Ghost icon toggles turn Cue Blue.
- **Disabled:** 45% opacity.

### Key hints
A small bordered box (Hairline Strong border, 4px radius, 11px Label Grey text) printed inside a button with its keyboard key: B, 0, 1–9, T, F. Used on the Fallback Panel and Perform controls and on Scene buttons.

### Badges
Pill-shaped, 20px high, 11px medium text. The fill is the 16% soft tint and the text is the solid hue: neutral, blue, green, amber or red.

### Cards / Containers
- **Layer panel:** Desk Panel fill, hairline border, 10px radius, 12px padding, 16px headline.
- **Dialog:** Raised Panel fill, hairline, 10px radius, 24px padding, max 480px wide, overlay shadow over a 60% black backdrop.
- **Popover / Menu:** Raised Panel, hairline, 6px radius, overlay shadow. Highlighted menu item uses Lifted Panel.

### Inputs / Fields
- **Style:** Desk Panel fill, hairline border, 6px radius, 32px high. Label above in 12px Label Grey. Hints below in 12px Label Faint.
- **Focus:** the border turns Cue Blue, plus the focus ring.
- **Error:** Blackout Red border and 12px red message. **Disabled:** 50% opacity.
- **Select:** the same field with an inline chevron, drawn as a data URI so nothing loads from the network.

### Navigation
- **Sidebar items:** 32px rows, 18px icons, Label Grey medium text. Hover goes Raised Panel with white text. The current view is a Cue Blue Soft fill with Cue Blue text.
- **Tabs:** 32px, Label Grey; the selected tab gets white text and a 2px Cue Blue underline sitting on the hairline.

### Scene button (signature)
A secondary button at 160×52px minimum, with the name left-aligned and wrapping to two lines rather than cut off, and the key hint on the right. When live: Live Green outline, Live Green Soft fill, and a green dot before the name, so it reads from across the stage.

### Live-state frame (signature)
A 3px border around the whole window, drawn above everything and ignoring clicks: amber during Blind, red during Blackout (red wins). It shows the state of the real lights from any view.

### Toast
Bottom right, max 380px wide. Raised Panel, hairline, 6px radius, overlay shadow, with a 3px left edge and icon in the signal hue (blue info, green success, red error).

## Do's and Don'ts

### Do:
- **Do** take every colour, size and spacing value from the tokens in `src/renderer/src/ui/tokens.css`. Add a token rather than hard-coding a value.
- **Do** use the 16% soft tints for fills behind state and keep solid signal colour to small marks.
- **Do** put numbers that change in mono with tabular figures.
- **Do** print the keyboard key on any control that has one, using the key hint.
- **Do** keep Perform's targets at gig size (64px controls, 52px Scene buttons).
- **Do** raise surfaces by one tonal step plus a hairline.

### Don't:
- **Don't** add a light theme surface, a bright panel, or any large solid-colour area. The screen is in a dark room.
- **Don't** load fonts, icons or images from the network. Everything ships with the app.
- **Don't** use the signal colours for decoration or branding.
- **Don't** add gradients, textures or illustrations to the app.
- **Don't** let the Sidebar, top bar or Fallback Panel scroll out of view.
