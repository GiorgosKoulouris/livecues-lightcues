// The three.js layer: a thin adapter that draws a `SceneModel` on a canvas.
// Everything it draws is computed in `sceneModel.ts`; this file only turns
// that into meshes. It builds the scene in stage coordinates (z up) under a
// root turned to three.js's y-up world, so model numbers go in unchanged.
import {
  AmbientLight,
  BoxGeometry,
  Color,
  AdditiveBlending,
  CircleGeometry,
  CylinderGeometry,
  MeshBasicMaterial,
  Vector3,
  DoubleSide,
  ShaderMaterial,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { HouseAmbient } from '../../../shared/protocol';
import {
  CAMERA_FOV,
  createHazeDensity,
  KEY_FULL,
  PRISM_BEAMS,
  roomLight,
  splitBeams,
  strobeVisible,
  type Cone,
  type Body,
  type Box,
  type CameraPose,
  type FixtureLook,
  type Point,
  type SceneModel,
} from './sceneModel';

// What the component drives.
export interface SceneRenderer {
  // Replaces what is drawn.
  setModel(model: SceneModel): void;
  // Sets how each Fixture looks: glow, aim, cone and pool. Cheap, and called
  // on every preview event.
  setLooks(looks: FixtureLook[]): void;
  // The Hazers' level (0–1) from the preview. The haze density follows it.
  setHaze(haze: number): void;
  // Assume haze (0–1): replaces the density at once. None follows the Hazers.
  setAssumedHaze(assumed: number | undefined): void;
  // The House Lights' ambient from the preview, none with no House Lights. It
  // tints and sets the room's own light.
  setHouse(house: HouseAmbient | undefined): void;
  // High scatters light by the haze density; Low draws plain additive cones.
  setQuality(quality: Quality): void;
  setCamera(pose: CameraPose): void;
  camera(): CameraPose;
  dispose(): void;
}

export type Quality = 'high' | 'low';

export interface RendererCallbacks {
  // The camera moved.
  onCamera(pose: CameraPose): void;
  // The pointer is over the named Fixture at client coordinates, or none.
  onHover(hover: { name: string; x: number; y: number } | undefined): void;
}

const DARK_BODY = 0x1b1c1a;
const DECK = 0x2c2d29;
const FLOOR = 0x1f201d;
const WALL = 0x232420;
const TRUSS = 0x3a3c34;
const BACKGROUND = 0x0c0d0b;

// Throws if WebGL cannot start, having freed whatever it made.
export function createSceneRenderer(
  host: HTMLElement,
  initial: CameraPose,
  callbacks: RendererCallbacks,
): SceneRenderer {
  const renderer = new WebGLRenderer({ antialias: true });
  // What `build` has made so far that needs undoing, if it throws or when
  // disposed. Undone last first.
  const undo: (() => void)[] = [];
  try {
    renderer.setPixelRatio(window.devicePixelRatio);
    host.appendChild(renderer.domElement);
    return build(renderer, host, initial, callbacks, undo);
  } catch (error) {
    for (const step of undo.reverse()) step();
    renderer.dispose();
    renderer.domElement.remove();
    throw error;
  }
}

function build(
  renderer: WebGLRenderer,
  host: HTMLElement,
  initial: CameraPose,
  callbacks: RendererCallbacks,
  undo: (() => void)[],
): SceneRenderer {
  const scene = new Scene();
  scene.background = new Color(BACKGROUND);
  const ambientLight = new AmbientLight(0xffffff, 0.9);
  scene.add(ambientLight);
  const key = new DirectionalLight(0xffffff, KEY_FULL);
  key.position.set(3, 8, 6);
  scene.add(key);

  // Stage coordinates (z up) to three.js (y up): (x, y, z) -> (x, z, -y).
  const root = new Group();
  root.rotation.x = -Math.PI / 2;
  scene.add(root);
  let drawn: Drawn = drawModel({ ...EMPTY_MODEL });
  root.add(drawn.group);
  // The latest looks, kept so a rebuilt scene and the strobe's frames use them.
  let looks: FixtureLook[] = [];
  let haze = 0;
  let assumed: number | undefined;
  let quality: Quality = 'high';
  const density = createHazeDensity();
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 500);
  const release = () => {
    for (const step of undo.splice(0).reverse()) step();
  };
  const controls = new OrbitControls(camera, renderer.domElement);
  undo.push(() => controls.dispose());
  controls.enableDamping = false;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;

  const placeCamera = (pose: CameraPose) => {
    const p = toWorld(pose.position);
    const t = toWorld(pose.target);
    camera.position.set(p.x, p.y, p.z);
    controls.target.set(t.x, t.y, t.z);
    controls.update();
  };
  placeCamera(initial);

  let frame = 0;
  undo.push(() => cancelAnimationFrame(frame));
  const invalidate = () => {
    if (frame) return;
    frame = requestAnimationFrame((now) => {
      frame = 0;
      const seconds = now / 1000;
      const animating = applyLooks(drawn, looks, seconds, reducedMotion() === true, {
        density: density.at(seconds, haze, assumed),
        quality,
      });
      renderer.render(scene, camera);
      // A strobe, a turning prism or a density still moving needs a frame after this one.
      if (animating || density.settling(haze, assumed)) invalidate();
    });
  };

  // Frames stop once the density settles, so after a pause the clock would
  // count from the last frame drawn. A change then starts it afresh.
  const restartIfIdle = () => {
    if (!frame) density.restart(performance.now() / 1000);
  };

  const readCamera = (): CameraPose => ({
    position: fromWorld(camera.position),
    target: fromWorld(controls.target),
  });
  controls.addEventListener('change', () => {
    callbacks.onCamera(readCamera());
    invalidate();
  });

  const resize = () => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    // The CSS sizes the canvas, so it cannot grow its host.
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    invalidate();
  };
  const observer = new ResizeObserver(resize);
  undo.push(() => observer.disconnect());
  observer.observe(host);
  resize();

  const raycaster = new Raycaster();
  const onPointerMove = (event: PointerEvent) => {
    // Orbiting and panning are not hovering.
    if (event.buttons !== 0) return callbacks.onHover(undefined);
    const rect = renderer.domElement.getBoundingClientRect();
    const pointer = new Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const name = fixtureAt(drawn, raycaster);
    callbacks.onHover(name ? { name, x: event.clientX, y: event.clientY } : undefined);
  };
  const onPointerLeave = () => callbacks.onHover(undefined);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);
  undo.push(() => {
    renderer.domElement.removeEventListener('pointermove', onPointerMove);
    renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
  });

  return {
    setModel(model) {
      root.remove(drawn.group);
      disposeTree(drawn.group);
      drawn = drawModel(model);
      root.add(drawn.group);
      invalidate();
    },
    setLooks(next) {
      looks = next;
      invalidate();
    },
    setHaze(next) {
      if (next !== haze) restartIfIdle();
      haze = next;
      invalidate();
    },
    setHouse(next) {
      const room = roomLight(next);
      ambientLight.color.setRGB(room.ambient.red, room.ambient.green, room.ambient.blue);
      ambientLight.intensity = room.ambient.intensity;
      invalidate();
    },
    setAssumedHaze(next) {
      if (next !== assumed) restartIfIdle();
      assumed = next;
      invalidate();
    },
    setQuality(next) {
      quality = next;
      invalidate();
    },
    setCamera(pose) {
      placeCamera(pose);
      callbacks.onCamera(readCamera());
      invalidate();
    },
    camera: readCamera,
    dispose() {
      release();
      disposeTree(drawn.group);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

const toWorld = ({ x, y, z }: Point): Point => ({ x, y: z, z: -y });
const fromWorld = ({ x, y, z }: Point): Point => ({ x, y: -z, z: y });

const material = (colour: number) => new MeshStandardMaterial({ color: colour, roughness: 0.8 });

function boxMesh({ center, size }: Box, colour: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(size.x, size.y, size.z), material(colour));
  mesh.position.set(center.x, center.y, center.z);
  return mesh;
}

// What is drawn, and the parts of each Fixture that change with its look.
export interface Drawn {
  group: Group;
  fixtures: Map<string, FixtureParts>;
  // What can be hovered or can hide a Fixture: every mesh but the cones and
  // pools, which three.js's Raycaster would hit even when hidden.
  solids: Mesh[];
}

interface FixtureParts {
  yoke?: Group;
  head?: Group;
  lens: MeshBasicMaterial;
  cone: ConeParts;
  pool: Mesh;
  // The split beams drawn in place of the cone while a prism is in.
  splits: ConeParts[];
}

interface ConeParts {
  mesh: Mesh;
  // The cone's two looks, swapped by quality.
  low: MeshBasicMaterial;
  high: ShaderMaterial;
}

const EMPTY_MODEL: SceneModel = {
  deck: { center: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } },
  backWall: { center: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } },
  audienceFloor: { center: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } },
  truss: [],
  bodies: [],
  cameras: {
    foh: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
    top: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
    side: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
  },
};

// A beam cone unit high, its apex at the origin and its base, a unit
// radius, at +y. Scaled and turned per look.
const CONE = new CylinderGeometry(1, 0, 1, 32, 1, true).translate(0, 0.5, 0);
const POOL = new CircleGeometry(1, 40);
// How bright a cone and a pool are at full intensity, before haze.
const CONE_OPACITY = 0.22;
const POOL_OPACITY = 0.5;

const glowMaterial = (opacity: number, side = DoubleSide) =>
  new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
    side,
  });

// The high-quality cone: light scattering in haze. It fades towards the
// cone's edge (seen side-on it is thickest at the middle) and along the beam,
// and its strength scales with the haze density.
const coneHaze = () =>
  new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(1, 1, 1) },
      uOpacity: { value: 0 },
      uDensity: { value: 0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vAlong;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = -view.xyz;
        vAlong = uv.y;
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uDensity;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vAlong;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float scatter = pow(facing, 1.5) * (1.0 - 0.6 * vAlong);
        gl_FragColor = vec4(uColor, uOpacity * uDensity * scatter * 1.8);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });

// A hidden beam cone with both its looks.
function coneParts(): ConeParts {
  const low = glowMaterial(CONE_OPACITY);
  const high = coneHaze();
  const mesh = new Mesh(CONE, high);
  mesh.userData.materials = [low, high];
  mesh.visible = false;
  mesh.renderOrder = 1;
  return { mesh, low, high };
}

export function drawModel(model: SceneModel): Drawn {
  const group = new Group();
  group.add(boxMesh(model.deck, DECK));
  group.add(boxMesh(model.backWall, WALL));
  group.add(boxMesh(model.audienceFloor, FLOOR));
  for (const row of model.truss) {
    group.add(
      boxMesh(
        {
          center: { x: (row.x0 + row.x1) / 2, y: row.y, z: row.height },
          size: { x: row.x1 - row.x0, y: 0.1, z: 0.1 },
        },
        TRUSS,
      ),
    );
  }
  const fixtures = new Map<string, FixtureParts>();
  const solids: Mesh[] = [];
  group.traverse((child) => {
    if (child instanceof Mesh) solids.push(child);
  });
  for (const body of model.bodies) {
    const { group: drawnBody, yoke, head, lens } = drawBody(body);
    group.add(drawnBody);
    drawnBody.traverse((child) => {
      if (child instanceof Mesh) solids.push(child);
    });
    const cone = coneParts();
    const splits = Array.from({ length: PRISM_BEAMS }, coneParts);
    const pool = new Mesh(POOL, glowMaterial(POOL_OPACITY));
    pool.visible = false;
    pool.renderOrder = 1;
    group.add(cone.mesh, pool, ...splits.map((split) => split.mesh));
    fixtures.set(body.id, { yoke, head, lens, cone, pool, splits });
  }
  return { group, fixtures, solids };
}

// The name of the Fixture the ray meets first, if what it meets first is a
// Fixture: a wall or another Fixture in front hides it, a cone or pool does
// not.
export function fixtureAt({ solids }: Drawn, raycaster: Raycaster): string | undefined {
  const name: unknown = raycaster.intersectObjects(solids, false)[0]?.object.userData.name;
  return typeof name === 'string' ? name : undefined;
}

const UP = new Vector3(0, 1, 0);
const FACING = new Vector3(0, 0, 1);

// Places and lights one beam cone.
function drawCone(
  parts: ConeParts,
  cone: Cone,
  colour: Color,
  intensity: number,
  density: number,
  quality: Quality,
): void {
  const radius = cone.length * Math.tan(rad(cone.halfAngle));
  parts.mesh.position.set(cone.origin.x, cone.origin.y, cone.origin.z);
  parts.mesh.quaternion.setFromUnitVectors(
    UP,
    new Vector3(cone.direction.x, cone.direction.y, cone.direction.z),
  );
  parts.mesh.scale.set(radius, cone.length, radius);
  if (quality === 'high') {
    parts.mesh.material = parts.high;
    parts.high.uniforms.uColor!.value.copy(colour);
    parts.high.uniforms.uOpacity!.value = intensity;
    parts.high.uniforms.uDensity!.value = density;
  } else {
    parts.mesh.material = parts.low;
    parts.low.color.copy(colour);
    parts.low.opacity = CONE_OPACITY * intensity;
  }
}

// Applies the looks to the drawn Fixtures at `seconds`. Returns whether any
// strobes or has a turning prism, so the caller keeps drawing frames.
export function applyLooks(
  { fixtures }: Drawn,
  looks: FixtureLook[],
  seconds: number,
  reducedMotion: boolean,
  { density, quality }: { density: number; quality: Quality } = { density: 1, quality: 'low' },
): boolean {
  let animating = false;
  for (const look of looks) {
    const parts = fixtures.get(look.id);
    if (!parts) continue;
    if (parts.yoke) parts.yoke.rotation.z = rad(look.yoke);
    if (parts.head) parts.head.rotation.x = rad(look.head);
    const shown = strobeVisible(look.strobe, seconds, reducedMotion);
    if (look.strobe && !reducedMotion) animating = true;
    const intensity = shown ? look.intensity : 0;
    const { red, green, blue } = look.colour;
    parts.lens.color.setRGB(red * intensity, green * intensity, blue * intensity);
    const { cone, pool } = look;
    const colour = new Color(red, green, blue);
    const beam = intensity > 0 ? cone : undefined;
    // A prism in the beam draws it split, and not whole.
    const split = beam && look.prism ? splitBeams(beam, look.prism, seconds, reducedMotion) : [];
    if (beam && look.prism && look.prism !== 'on' && !reducedMotion) animating = true;
    const draws: [ConeParts, Cone | undefined][] = [
      [parts.cone, split.length === 0 ? beam : undefined],
      ...parts.splits.map((p, i): [ConeParts, Cone | undefined] => [p, split[i]]),
    ];
    for (const [drawnCone, drawnBeam] of draws) {
      drawnCone.mesh.visible = drawnBeam !== undefined;
      if (drawnBeam) drawCone(drawnCone, drawnBeam, colour, intensity, density, quality);
    }
    parts.pool.visible = Boolean(pool) && intensity > 0;
    if (pool && parts.pool.visible) {
      // Just off the surface, so it does not fight it.
      const lift = 0.01;
      parts.pool.position.set(
        pool.position.x + pool.normal.x * lift,
        pool.position.y + pool.normal.y * lift,
        pool.position.z + pool.normal.z * lift,
      );
      parts.pool.quaternion.setFromUnitVectors(
        FACING,
        new Vector3(pool.normal.x, pool.normal.y, pool.normal.z),
      );
      parts.pool.scale.set(pool.radius, pool.radius, 1);
      const material = parts.pool.material as MeshBasicMaterial;
      material.color.copy(colour);
      material.opacity = POOL_OPACITY * intensity;
    }
  }
  return animating;
}

// A body at its position: the base turned by its yaw, built in its own frame
// with z along the Fixture's axis. The Fixture's name rides on every mesh, for
// hover.
function drawBody(body: Body): {
  group: Group;
  yoke?: Group;
  head?: Group;
  lens: MeshBasicMaterial;
} {
  const group = new Group();
  group.position.set(body.position.x, body.position.y, body.position.z);
  group.rotation.z = rad(body.yaw);
  const { size, axis } = body;
  const part = (geometry: BufferGeometry, parent: Object3D, at: Point = { x: 0, y: 0, z: 0 }) => {
    const mesh = new Mesh(geometry, material(DARK_BODY));
    mesh.position.set(at.x, at.y, at.z);
    mesh.userData.name = body.name;
    parent.add(mesh);
    return mesh;
  };
  // The lens: dark until `applyLooks` colours it.
  const lens = new MeshBasicMaterial({ color: 0x000000 });
  const lensMesh = (geometry: BufferGeometry, parent: Object3D, at: Point) => {
    const mesh = new Mesh(geometry, lens);
    mesh.position.set(at.x, at.y, at.z);
    mesh.userData.name = body.name;
    parent.add(mesh);
    return mesh;
  };
  switch (body.kind) {
    case 'movingHead': {
      // Base, then yoke (turns with pan) carrying the head (turns with tilt).
      part(new BoxGeometry(size.x, size.y, 0.12), group, { x: 0, y: 0, z: axis * 0.06 });
      const yoke = new Group();
      yoke.position.z = axis * 0.12;
      yoke.rotation.z = rad(body.yoke);
      group.add(yoke);
      for (const side of [-1, 1]) {
        part(new BoxGeometry(0.04, 0.08, 0.26), yoke, { x: side * 0.14, y: 0, z: axis * 0.13 });
      }
      const head = new Group();
      head.position.z = axis * 0.18;
      head.rotation.x = rad(body.head);
      yoke.add(head);
      const barrel = part(new CylinderGeometry(0.11, 0.11, 0.24, 16), head, {
        x: 0,
        y: 0,
        z: axis * 0.02,
      });
      // Cylinders stand along y; lay this one along the axis.
      barrel.rotation.x = Math.PI / 2;
      lensMesh(new SphereGeometry(0.1, 12, 8), head, { x: 0, y: 0, z: axis * 0.16 });
      return { group, yoke, head, lens };
    }
    case 'par': {
      const can = part(new CylinderGeometry(size.x / 2, size.x / 2, size.z, 16), group, {
        x: 0,
        y: 0,
        z: axis * (size.z / 2),
      });
      can.rotation.x = Math.PI / 2;
      lensMesh(new SphereGeometry(size.x * 0.4, 12, 8), group, { x: 0, y: 0, z: axis * size.z });
      break;
    }
    case 'bar':
    case 'blinder':
      part(new BoxGeometry(size.x, size.y, size.z), group, { x: 0, y: 0, z: axis * (size.z / 2) });
      lensMesh(new BoxGeometry(size.x * 0.9, size.y * 0.9, 0.02), group, {
        x: 0,
        y: 0,
        z: axis * size.z,
      });
      break;
  }
  return { group, lens };
}

const rad = (degrees: number) => (degrees * Math.PI) / 180;

function disposeTree(object: Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    // The cone and pool geometries are shared by every Fixture and rebuild.
    if (child.geometry !== CONE && child.geometry !== POOL) child.geometry.dispose();
    const materials = new Set<Material>(
      Array.isArray(child.material) ? child.material : [child.material],
    );
    // A cone keeps both its looks, one of them not on the mesh.
    const spare: unknown = child.userData.materials;
    if (Array.isArray(spare)) for (const m of spare as Material[]) materials.add(m);
    for (const m of materials) m.dispose();
  });
}
