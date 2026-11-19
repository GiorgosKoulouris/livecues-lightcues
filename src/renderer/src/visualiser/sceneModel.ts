// What the Visualiser draws, computed from the Venue Patch. Pure: no three.js,
// so it is testable without a canvas, and the three.js layer is a thin adapter
// over it. All coordinates are stage coordinates in metres, as in the Venue
// Patch: x from the centre line (Stage Left positive), y upstage from the
// downstage edge, z up from the stage floor. Angles are degrees.
import { audienceY, beamStrike, physicalAngles, type AimAngles } from '../../../shared/aim';
import type { Role } from '../../../shared/fixture-profile';
import type { FixtureLight, HouseAmbient } from '../../../shared/protocol';
import {
  DEFAULT_MOUNTING,
  fixtureMounting,
  fixtureRole,
  fixtureZone,
  isMovingFixture,
  type PatchedFixture,
  type StageBounds,
  type VenuePatch,
} from '../../../shared/venue-patch';

export interface Point {
  x: number;
  y: number;
  z: number;
}

// An axis-aligned box: where its middle is, and its size along x, y and z.
export interface Box {
  center: Point;
  size: Point;
}

export interface Surroundings {
  deck: Box;
  backWall: Box;
  audienceFloor: Box;
}

// The stage deck's thickness below the floor, the back wall's thickness, and
// the lowest the wall reaches above the stage, in metres.
const DECK_THICKNESS = 0.3;
const WALL_THICKNESS = 0.2;
const MIN_WALL_HEIGHT = 4;
// The wall reaches this far above the tallest thing on stage.
const WALL_CLEARANCE = 1.5;
// The audience floor runs this far past the audience plane, and this far
// beyond the stage's sides.
const AUDIENCE_RUN = 5;
const AUDIENCE_SIDE = 4;

// The deck, back wall and audience floor from the stage bounds. `top` is the
// highest point a Fixture reaches, which sets the wall's height.
export function surroundings(stage: StageBounds, top: number): Surroundings {
  const { width, depth } = stage;
  const wallHeight = Math.max(MIN_WALL_HEIGHT, top + WALL_CLEARANCE);
  const floorFront = audienceY(stage) - AUDIENCE_RUN;
  return {
    deck: {
      center: { x: 0, y: depth / 2, z: -DECK_THICKNESS / 2 },
      size: { x: width, y: depth, z: DECK_THICKNESS },
    },
    backWall: {
      center: { x: 0, y: depth + WALL_THICKNESS / 2, z: wallHeight / 2 },
      size: { x: width, y: WALL_THICKNESS, z: wallHeight },
    },
    audienceFloor: {
      center: { x: 0, y: floorFront / 2, z: -DECK_THICKNESS / 2 },
      size: { x: width + 2 * AUDIENCE_SIDE, y: -floorFront, z: DECK_THICKNESS },
    },
  };
}

// One bar of truss, hung over a row of Overhead Fixtures.
export interface TrussRow {
  y: number;
  // The height of the bar, above the Fixtures hung from it.
  height: number;
  x0: number;
  x1: number;
  fixtureIds: string[];
}

// How far the bar sits above the Fixtures, and sticks out past the end ones.
const TRUSS_CLEARANCE = 0.3;
const TRUSS_OVERHANG = 0.5;

// A bar for each row of Overhead Fixtures: those at the same y and height,
// to the centimetre. Downstage first, then lowest.
export function trussRows(patch: VenuePatch): TrussRow[] {
  const rows = new Map<string, PatchedFixture[]>();
  for (const fixture of patch.fixtures) {
    if (fixtureZone(patch, fixture).level !== 'Overhead') continue;
    const key = `${cm(fixture.y)}/${cm(fixture.height)}`;
    rows.set(key, [...(rows.get(key) ?? []), fixture]);
  }
  return [...rows.values()]
    .map((fixtures) => {
      const xs = fixtures.map((f) => f.x);
      return {
        y: Math.min(...fixtures.map((f) => f.y)),
        height: Math.min(...fixtures.map((f) => f.height)) + TRUSS_CLEARANCE,
        x0: Math.min(...xs) - TRUSS_OVERHANG,
        x1: Math.max(...xs) + TRUSS_OVERHANG,
        fixtureIds: fixtures.map((f) => f.id),
      };
    })
    .sort((a, b) => a.y - b.y || a.height - b.height);
}

const cm = (metres: number) => Math.round(metres * 100);

export type BodyKind = 'movingHead' | 'par' | 'bar' | 'blinder';

// Fixed sizes by kind, in metres: x across the Fixture, y front to back, z
// along its axis.
export const BODY_SIZES: Record<BodyKind, Point> = {
  movingHead: { x: 0.3, y: 0.3, z: 0.45 },
  par: { x: 0.2, y: 0.2, z: 0.25 },
  bar: { x: 1, y: 0.1, z: 0.1 },
  blinder: { x: 0.4, y: 0.12, z: 0.25 },
};

export interface Body {
  id: string;
  name: string;
  kind: BodyKind;
  size: Point;
  position: Point;
  // Which way the Fixture faces along z: -1 down, 1 up. For a moving head,
  // the way from its base toward its head: down when Hung, up when Standing.
  axis: 1 | -1;
  // The turn of the base about z, anticlockwise seen from above.
  yaw: number;
  // A moving head's yoke turn about z, and head turn about x, in the base's
  // frame. Both 0 for other kinds.
  yoke: number;
  head: number;
}

// Channel angles by Fixture id.
export type Aims = Record<string, AimAngles | undefined>;

function bodyKind(patch: VenuePatch, fixture: PatchedFixture): BodyKind {
  if (isMovingFixture(patch, fixture)) return 'movingHead';
  const role = fixtureRole(patch, fixture);
  return role === 'Blinder' ? 'blinder' : role === 'Pixel/Bar' ? 'bar' : 'par';
}

// A Fixture's body: its kind and transform, with Mounting applied. `aim` is
// where a moving head points, as channel angles; at pan and tilt 0 without.
export function fixtureBody(
  patch: VenuePatch,
  fixture: PatchedFixture,
  aim: AimAngles | undefined,
): Body {
  const kind = bodyKind(patch, fixture);
  const position = { x: fixture.x, y: fixture.y, z: fixture.height };
  const common = { id: fixture.id, name: fixture.name, kind, size: BODY_SIZES[kind], position };
  if (kind !== 'movingHead') {
    const overhead = fixtureZone(patch, fixture).level === 'Overhead';
    return { ...common, axis: overhead ? -1 : 1, yaw: 0, yoke: 0, head: 0 };
  }
  const mounting = fixtureMounting(fixture);
  const axis = mounting.mount === 'Hung' ? -1 : 1;
  const physical = physicalAngles(mounting, aim ?? {});
  // Positive pan and tilt turn right-handed about the yoke axis, and tilt
  // swings the beam toward the front (src/shared/aim.ts).
  return {
    ...common,
    axis,
    yaw: -mounting.rotation,
    yoke: axis * physical.pan,
    head: axis * physical.tilt,
  };
}

export interface CameraPose {
  position: Point;
  target: Point;
}

export type CameraPresetName = 'foh' | 'top' | 'side';

// Vertical field of view of every camera, and the audience's eye height.
export const CAMERA_FOV = 50;
const EYE_HEIGHT = 1.7;

// FOH, Top and Side, from the stage bounds. FOH stands in the audience at eye
// height, centred, and looks at the middle of the stage. Top looks down at it,
// a little toward the audience so the view keeps an up. Side looks across it
// from Stage Left.
export function cameraPresets(stage: StageBounds): Record<CameraPresetName, CameraPose> {
  const { width, depth } = stage;
  const middle = { x: 0, y: depth / 2, z: 0 };
  const reach = Math.max(width, depth);
  return {
    foh: {
      position: { x: 0, y: -(depth + Math.max(3, width / 2)), z: EYE_HEIGHT },
      target: { x: 0, y: depth / 2, z: 2 },
    },
    top: {
      position: { x: 0, y: depth / 2 - 0.5, z: reach * 1.3 + 3 },
      target: middle,
    },
    side: {
      position: { x: width / 2 + reach * 1.2 + 2, y: depth / 2, z: 3 },
      target: { ...middle, z: 1.5 },
    },
  };
}

export interface SceneModel extends Surroundings {
  truss: TrussRow[];
  bodies: Body[];
  cameras: Record<CameraPresetName, CameraPose>;
}

// Everything the Visualiser draws for a Venue Patch. `aims` are the moving
// heads' channel angles by Fixture id.
export function buildScene(patch: VenuePatch, aims: Aims = {}): SceneModel {
  return {
    ...surroundings(patch.stage, stageTop(patch)),
    truss: trussRows(patch),
    bodies: patch.fixtures.map((fixture) => fixtureBody(patch, fixture, aims[fixture.id])),
    cameras: cameraPresets(patch.stage),
  };
}

// The highest a Fixture reaches, which sets the back wall's height.
const stageTop = (patch: VenuePatch): number => Math.max(0, ...patch.fixtures.map((f) => f.height));

// The full beam angle, in degrees, of a Role's Fixtures that give none.
export const BEAM_ANGLE_DEFAULTS: Record<Role, number> = {
  Wash: 25,
  'Spot/Beam': 8,
  Blinder: 60,
  Strobe: 90,
  'Pixel/Bar': 30,
  Effect: 15,
};

// A Fixture's full beam angle, in degrees. The one place that decides it: the
// Role's default for now, until Profiles carry a Beam angle.
export function beamAngle(patch: VenuePatch, fixture: PatchedFixture): number {
  return BEAM_ANGLE_DEFAULTS[fixtureRole(patch, fixture)];
}

// The preview blinks no faster than this, in Hz, as `strobeBlink` does.
export const MAX_BLINK_HZ = 4;

// Whether a strobing light shows at `seconds`: on for the first half of each
// cycle, off for the second, at its rate up to `MAX_BLINK_HZ`. Steady when it
// does not strobe or under reduced motion.
export function strobeVisible(
  strobe: number | undefined,
  seconds: number,
  reducedMotion = false,
): boolean {
  if (!strobe || strobe <= 0 || reducedMotion) return true;
  const cycles = seconds * Math.min(strobe, MAX_BLINK_HZ);
  return cycles - Math.floor(cycles) < 0.5;
}

// How far a lens sits out along the Fixture's axis from its position, for a
// moving head's pivot and the head's reach past it, in metres.
const HEAD_PIVOT = 0.3;
const HEAD_REACH = 0.16;
// The widest a light pool gets, in metres.
const MAX_POOL_RADIUS = 4;

// A beam cone, apex at the lens. `halfAngle` is in degrees; `direction` is a
// unit vector.
export interface Cone {
  origin: Point;
  direction: Point;
  length: number;
  halfAngle: number;
}

// Where a beam lights a surface: the floor (the deck or the audience floor)
// or the back wall.
export interface Pool {
  surface: 'floor' | 'wall';
  position: Point;
  normal: Point;
  radius: number;
}

// What one Fixture shows now. A dark Fixture has no cone or pool.
export interface FixtureLook {
  id: string;
  // A moving head's yoke and head turns, as in `Body`.
  yoke: number;
  head: number;
  colour: { red: number; green: number; blue: number };
  intensity: number;
  // The strobe rate in Hz, while it strobes.
  strobe?: number;
  cone?: Cone;
  pool?: Pool;
}

const DARK: FixtureLight = { intensity: 0, red: 0, green: 0, blue: 0 };

// The look of every Fixture for the engine's lights, by Fixture id. A Fixture
// without an entry is dark.
export function fixtureLooks(
  patch: VenuePatch,
  lights: Record<string, FixtureLight | undefined>,
): FixtureLook[] {
  const surfaces = surroundings(patch.stage, stageTop(patch));
  return patch.fixtures.map((fixture) =>
    fixtureLook(patch, fixture, lights[fixture.id] ?? DARK, surfaces),
  );
}

function fixtureLook(
  patch: VenuePatch,
  fixture: PatchedFixture,
  light: FixtureLight,
  surfaces: Surroundings,
): FixtureLook {
  const placed = fixtureBody(patch, fixture, light.aim);
  const look: FixtureLook = {
    id: fixture.id,
    yoke: placed.yoke,
    head: placed.head,
    colour: { red: light.red, green: light.green, blue: light.blue },
    intensity: light.intensity,
    ...(light.strobe ? { strobe: light.strobe } : {}),
  };
  if (light.intensity <= 0) return look;

  // Moving heads follow their aim. Others beam along their axis: down when
  // Overhead, up on the Floor.
  const moving = placed.kind === 'movingHead';
  const mounting = moving
    ? fixtureMounting(fixture)
    : {
        ...DEFAULT_MOUNTING,
        mount: placed.axis === -1 ? ('Hung' as const) : ('Standing' as const),
      };
  const strike = beamStrike({
    position: { x: fixture.x, y: fixture.y, height: fixture.height },
    mounting,
    stage: patch.stage,
    angles: moving ? (light.aim ?? {}) : {},
    // The crowd is not a wall: a beam into it lands on the audience floor.
    audience: false,
    wall: { halfWidth: surfaces.backWall.size.x / 2, height: surfaces.backWall.size.z },
    onFloor: (x, y) => onFloorOf(surfaces, x, y),
  });
  const direction = strike.direction;
  const reach = moving ? HEAD_REACH : 0;
  const lens = moving ? HEAD_PIVOT : placed.size.z;
  const origin = {
    x: fixture.x + direction.x * reach,
    y: fixture.y + direction.y * reach,
    z: fixture.height + placed.axis * lens + direction.z * reach,
  };
  // Measured from the lens, so the cone ends on the surface.
  const out = Math.hypot(origin.x - fixture.x, origin.y - fixture.y, origin.z - fixture.height);
  const length = Math.max(0, strike.distance - out);
  const halfAngle = beamAngle(patch, fixture) / 2;
  look.cone = { origin, direction, length, halfAngle };

  const landed = { x: strike.position.x, y: strike.position.y, z: strike.position.height };
  const radius = Math.min(MAX_POOL_RADIUS, strike.distance * Math.tan(rad(halfAngle)));
  if (strike.surface === 'floor') {
    look.pool = { surface: 'floor', position: landed, normal: { x: 0, y: 0, z: 1 }, radius };
  } else if (strike.surface === 'wall') {
    look.pool = { surface: 'wall', position: landed, normal: { x: 0, y: -1, z: 0 }, radius };
  }
  return look;
}

// Whether the deck or the audience floor is under (x, y).
function onFloorOf({ deck, audienceFloor }: Surroundings, x: number, y: number): boolean {
  const within = ({ center, size }: Box) =>
    Math.abs(x - center.x) <= size.x / 2 && Math.abs(y - center.y) <= size.y / 2;
  return within(deck) || within(audienceFloor);
}

const rad = (degrees: number) => (degrees * Math.PI) / 180;

// Seconds for the haze density to cover most (about 95%) of the way to a
// new level, as a real room does: it fills in about 10 s and clears in about
// 60 s. Fixed.
export const HAZE_RISE_SECONDS = 10;
export const HAZE_DECAY_SECONDS = 60;
// The density at no haze, so beams stay faintly visible.
export const HAZE_MINIMUM = 0.08;

// How a time constant (seconds) relates to "about 95% of the way".
const SETTLED_TIME_CONSTANTS = 3;

export interface HazeDensity {
  // The density (0–1) at `seconds`, given the Hazers' level (0–1) and, while
  // set, the Assume haze (0–1). The Assume haze replaces the density at once;
  // cleared, the density follows the Hazers again from where it is.
  at(seconds: number, haze: number, assumed?: number): number;
  // Whether the density is still moving towards where it is headed.
  settling(haze: number, assumed?: number): boolean;
  // Starts the clock at `seconds`, so the next call counts from there and not
  // from the last frame drawn, however long ago. For a change after the
  // scene sat idle.
  restart(seconds: number): void;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

// The haze density over time. It starts at the minimum, or where the first
// call puts it.
export function createHazeDensity(): HazeDensity {
  let density = HAZE_MINIMUM;
  let last: number | undefined;
  const target = (haze: number) => Math.max(HAZE_MINIMUM, clamp01(haze));
  return {
    at(seconds, haze, assumed) {
      const elapsed = last === undefined ? 0 : Math.max(0, seconds - last);
      last = seconds;
      if (assumed !== undefined) {
        density = target(assumed);
        return density;
      }
      const goal = target(haze);
      const over = goal > density ? HAZE_RISE_SECONDS : HAZE_DECAY_SECONDS;
      const tau = over / SETTLED_TIME_CONSTANTS;
      density = goal + (density - goal) * Math.exp(-elapsed / tau);
      return density;
    },
    restart(seconds) {
      last = seconds;
    },
    settling(haze, assumed) {
      return assumed === undefined && Math.abs(density - target(haze)) > 0.001;
    },
  };
}

// The room's own light. The House Lights tint it and set its level; they have
// no bodies in the scene. With no House Lights patched the room stays lit as
// at full white.
export interface RoomLight {
  // The ambient light's colour (each 0–1) and strength.
  ambient: { red: number; green: number; blue: number; intensity: number };
  // The strength of the key light that shades the bodies and the stage.
  key: number;
}

// The ambient strength at full house, and the share of it, and of the key
// light, that stays when the House Lights are out, so the stage can be seen.
export const AMBIENT_FULL = 0.9;
export const KEY_FULL = 1.2;
export const ROOM_MINIMUM = 0.15;

export function roomLight(house: HouseAmbient | undefined): RoomLight {
  const level = house ? clamp01(house.intensity) : 1;
  const share = ROOM_MINIMUM + (1 - ROOM_MINIMUM) * level;
  const { red, green, blue } = house ?? { red: 1, green: 1, blue: 1 };
  return {
    ambient: {
      red: clamp01(red),
      green: clamp01(green),
      blue: clamp01(blue),
      intensity: AMBIENT_FULL * share,
    },
    key: KEY_FULL * share,
  };
}
