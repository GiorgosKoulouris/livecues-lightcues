# The Fallback Panel is a top-bar cluster without Scene or preset buttons

The Fallback Panel was a strip under every view but Perform. Besides Blackout, Base Look, Grand Master, Tap Tempo and Freeze, it held the Show's Scene buttons (keys 1–8, picked per Show), the House Preset buttons (Shift+1–8) and Haze Off with the Haze Presets. With a real Show, those three groups scrolled sideways and were too busy to use live. They also took a full row of height in every view.

The Fallback Panel is now a cluster in the top bar: Blackout, Base Look, Grand Master, Tap Tempo and Freeze, with their keys kept and shown in tooltips. Perform already has big buttons for every Scene, House Preset and Haze Preset, so those go from the panel, with the keys 1–8 and Shift+1–8. The panel is hidden in Perform, which has its own controls. When the bar is short, the file names ellipsize first, then the MIDI chip text. The panel never hides, wraps or scrolls.

The Show's `panelScenes` list had no other use, so it goes too, with the `setPanelScenes` edit, its validation and the Show settings section. The Show file format moves to version 8 without it. Versions 1–7 still load, and a `panelScenes` field in versions 1–7 is ignored and dropped on the next save. A version-8 file that holds one is rejected as an unknown field, like any other.

## Considered Options

- Keep the strip and wrap or shrink its buttons: Scene names do not fit a small target, and the strip still costs a row in every view.
- Move the Scene and preset buttons into the top bar too: the bar is 44px high and has room for five controls, not a Show's worth of buttons.
- A Haze fader on the Fallback Panel, which ADR 0018 named as an option: haze is set by Haze Presets and the DAW, and a fader would add a control that Blackout and Blind must not reach.
- Keep keys 1–8 and Shift+1–8 without buttons: keys that fire things with nothing on screen to show them are easy to hit by mistake. A replacement way to fire Scenes or presets by keyboard is out of scope.
