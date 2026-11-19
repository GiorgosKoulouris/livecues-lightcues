# A three.js Visualiser, with surroundings derived from the Venue Patch

The 2D Preview is a top-down plan and a front elevation in a narrow side panel. It does not give a feel for the room, which is what someone leaving the app listening to the DAW wants to see. The Visualiser is a fifth View that draws the rig in 3D.

It uses three.js, bundled in the renderer (MIT, so it goes through the third-party notices and the bundled-packages list like React). Raw WebGL would mean writing a scene graph, picking and orbit controls by hand. A heavier engine such as Babylon.js is more than a read-only view needs. One React component owns the canvas and the renderer, and later updates reach the scene imperatively, outside React state, so React does not re-render at the preview rate. A pure scene-model module with no three.js imports computes what to draw (body transforms, truss rows, camera poses, and later cones and pools), and the three.js layer is a thin adapter over it. The numbers are unit-tested without a canvas, and the component is tested with the adapter mocked.

The stage deck, back wall, audience floor and truss are derived from data the Venue Patch already has: the stage bounds and the Overhead Fixtures' positions. The Venue Patch format does not change. Fixture bodies are generic shapes by kind at fixed sizes. The same aim maths as the engine (ADR 0007) turns a moving head's yoke and head.

## Considered Options

- Model the room in the Venue Patch (walls, truss, audience): a truer picture, but every venue needs more setup, the file format grows, and the Show-and-rig split of ADR 0001 gets another thing to keep in step. The derived room is a close enough stage for judging looks.
- Load GDTF 3D models for bodies: needs a model per Profile and many imports carry none. Generic bodies work for every Profile.
- Draw it with SVG or 2D canvas like the Preview: no real beams, haze or camera.
- Run the render loop continuously: simpler, but it wastes a GPU on a static scene. The renderer draws on change, and the View is mounted only while it is shown.
