# The Detached Visualiser is its own window with its own engine port

The Visualiser is a View, so it can only be seen while no other View is shown. Someone setting up a Venue Patch or performing wants to watch the rig in 3D at the same time. The Detached Visualiser shows it in a second window.

That window is a separate BrowserWindow, with the same preload and navigation guard as the main window and its own MessagePort to the engine. Main used to connect, and after a restart reconnect (ADR 0011), the one window. It now does that for every open window. The engine's preview feed counts its viewers. It starts with the first viewer and stops when none are left, so two windows never fight over one start/stop. When the window opens, the renderer hands it the camera and the haze slider. Only one Visualiser renders at a time.

The Fallback Panel keys still work while the detached window has focus. A safety control must not depend on focus. The window stops rendering, and leaves the preview feed, while it is minimized or hidden.

## Considered Options

- Open a child window with `window.open` and draw into it from the main renderer with a React portal: camera and haze are shared for free, and no second port is needed. But the drawing is tied to the main window's renderer, which Chromium throttles when that window is minimized or in the background, and the child gets no preload or navigation guard of its own.
- Render the Visualiser in both windows: simpler hand-over, but twice the GPU cost, and two cameras for one rig.
