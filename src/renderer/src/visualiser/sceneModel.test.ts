import { describe, expect, it } from 'vitest';
import {
  BEAM_ANGLE_DEFAULTS,
  type Channel,
  type FixtureProfile,
  type Role,
} from '../../../shared/fixture-profile';
import { BEAM_UP_LENGTH, audienceY } from '../../../shared/aim';
import {
  DEFAULT_MOUNTING,
  emptyPatch,
  type Mounting,
  type PatchedFixture,
  type VenuePatch,
} from '../../../shared/venue-patch';
import {
  HAZE_MINIMUM,
  createHazeDensity,
  roomLight,
  AMBIENT_FULL,
  BODY_SIZES,
  beamAngle,
  buildScene,
  cameraPresets,
  fixtureLooks,
  strobeVisible,
  surroundings,
  trussRows,
  type Body,
} from './sceneModel';

const control = (name: string, type: 'pan' | 'tilt' | 'intensity'): Channel => ({
  kind: 'control',
  name,
  defaultValue: 0,
  ranges: [{ from: 0, to: 255, capability: { type } }],
});

const profile = (id: string, defaultRole: Role, channels: Channel[]): FixtureProfile => ({
  id,
  manufacturer: 'Acme',
  model: id,
  defaultRole,
  modes: [{ name: 'm', channels }],
});

const PROFILES = [
  profile('wash', 'Wash', [control('Dimmer', 'intensity')]),
  profile('head', 'Spot/Beam', [control('Pan', 'pan'), control('Tilt', 'tilt')]),
  profile('blinder', 'Blinder', [control('Dimmer', 'intensity')]),
  profile('bar', 'Pixel/Bar', [control('Dimmer', 'intensity')]),
  profile('strobe', 'Strobe', [control('Dimmer', 'intensity')]),
];

let nextAddress = 1;
const fixture = (id: string, profileId: string, more: Partial<PatchedFixture> = {}) => ({
  id,
  name: id.toUpperCase(),
  profileId,
  mode: 'm',
  universe: 1,
  address: nextAddress++,
  x: 0,
  y: 2,
  height: 0,
  ...more,
});

const patchOf = (fixtures: PatchedFixture[], stage = { width: 10, depth: 6 }): VenuePatch => ({
  ...emptyPatch(stage),
  profiles: PROFILES,
  fixtures,
});

const body = (patch: VenuePatch, id: string): Body => {
  const found = buildScene(patch).bodies.find((b) => b.id === id);
  if (!found) throw new Error(`no body ${id}`);
  return found;
};

describe('surroundings', () => {
  const { deck, backWall, audienceFloor } = surroundings({ width: 10, depth: 6 }, 3);

  it('puts the deck under the stage, its top at height 0', () => {
    expect(deck.size).toEqual({ x: 10, y: 6, z: expect.any(Number) });
    expect(deck.center.x).toBe(0);
    expect(deck.center.y).toBe(3);
    expect(deck.center.z + deck.size.z / 2).toBeCloseTo(0);
  });

  it('stands the back wall on the upstage edge, as wide as the stage', () => {
    expect(backWall.size.x).toBe(10);
    expect(backWall.center.y).toBeGreaterThanOrEqual(6);
    expect(backWall.center.y - backWall.size.y / 2).toBeCloseTo(6);
    expect(backWall.center.z - backWall.size.z / 2).toBeCloseTo(0);
  });

  it('reaches the wall to the top of the tallest thing, with a minimum', () => {
    expect(backWall.size.z).toBeGreaterThanOrEqual(4);
    expect(surroundings({ width: 10, depth: 6 }, 9).backWall.size.z).toBeGreaterThan(9);
  });

  it('lays the audience floor in front of the stage, past the audience plane', () => {
    expect(audienceFloor.center.z + audienceFloor.size.z / 2).toBeCloseTo(0);
    const front = audienceFloor.center.y - audienceFloor.size.y / 2;
    const back = audienceFloor.center.y + audienceFloor.size.y / 2;
    expect(back).toBeCloseTo(0);
    expect(front).toBeLessThan(audienceY({ width: 10, depth: 6 }));
  });

  it('scales with the stage', () => {
    const wide = surroundings({ width: 20, depth: 6 }, 3);
    expect(wide.deck.size.x).toBe(20);
    expect(wide.audienceFloor.size.x).toBeGreaterThan(audienceFloor.size.x);
  });
});

describe('truss rows', () => {
  it('has none without Overhead Fixtures', () => {
    expect(trussRows(patchOf([fixture('a', 'wash', { height: 1 })]))).toEqual([]);
  });

  it('groups Overhead Fixtures by y and height, one bar spanning their x', () => {
    const rows = trussRows(
      patchOf([
        fixture('a', 'wash', { x: -3, y: 4, height: 5 }),
        fixture('b', 'wash', { x: 2, y: 4, height: 5 }),
        fixture('c', 'wash', { x: 0, y: 1, height: 5 }),
        fixture('d', 'wash', { x: 0, y: 1, height: 4 }),
        fixture('e', 'wash', { x: 0, y: 1, height: 0.5 }),
      ]),
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => [r.y, r.fixtureIds])).toEqual([
      [1, ['d']],
      [1, ['c']],
      [4, ['a', 'b']],
    ]);
    const back = rows[2]!;
    expect(back.x0).toBeLessThan(-3);
    expect(back.x1).toBeGreaterThan(2);
    expect(back.height).toBeGreaterThan(5);
  });
});

describe('body kinds', () => {
  const patch = patchOf([
    fixture('w', 'wash'),
    fixture('h', 'head'),
    fixture('b', 'blinder'),
    fixture('p', 'bar'),
    fixture('s', 'strobe'),
    fixture('r', 'wash', { role: 'Blinder' }),
    fixture('m', 'bar', { role: 'Wash' }),
  ]);

  it('picks a kind by moving or Role', () => {
    const kinds = Object.fromEntries(buildScene(patch).bodies.map((b) => [b.id, b.kind]));
    expect(kinds).toEqual({
      w: 'par',
      h: 'movingHead',
      b: 'blinder',
      p: 'bar',
      s: 'par',
      r: 'blinder',
      m: 'par',
    });
  });

  it('gives each a fixed size and its name', () => {
    const scene = buildScene(patch);
    for (const b of scene.bodies) expect(b.size).toEqual(BODY_SIZES[b.kind]);
    expect(scene.bodies.find((b) => b.id === 'w')?.name).toBe('W');
  });
});

describe('body transforms', () => {
  const mounting = (more: Partial<Mounting> = {}): Mounting => ({
    mount: 'Hung',
    rotation: 0,
    panInvert: false,
    tiltInvert: false,
    panOffset: 0,
    tiltOffset: 0,
    ...more,
  });

  it('places a body at its stage position', () => {
    const patch = patchOf([fixture('w', 'wash', { x: 1.5, y: 3, height: 2.5 })]);
    expect(body(patch, 'w').position).toEqual({ x: 1.5, y: 3, z: 2.5 });
  });

  it('points a static Fixture down when Overhead and up on the Floor', () => {
    const patch = patchOf([
      fixture('hi', 'wash', { height: 4 }),
      fixture('lo', 'wash', { height: 0.2 }),
    ]);
    expect(body(patch, 'hi').axis).toBe(-1);
    expect(body(patch, 'lo').axis).toBe(1);
  });

  it('flips a moving head by Mounting', () => {
    const patch = patchOf([
      fixture('hung', 'head', { mounting: mounting({ mount: 'Hung' }) }),
      fixture('stand', 'head', { mounting: mounting({ mount: 'Standing' }) }),
      fixture('default', 'head'),
    ]);
    expect(body(patch, 'hung').axis).toBe(-1);
    expect(body(patch, 'stand').axis).toBe(1);
    expect(body(patch, 'default').axis).toBe(-1);
  });

  it('turns the base by its rotation, clockwise seen from above', () => {
    const patch = patchOf([fixture('h', 'head', { mounting: mounting({ rotation: 90 }) })]);
    // Counterclockwise-positive about up, so clockwise is negative.
    expect(body(patch, 'h').yaw).toBe(-90);
  });

  it('does not turn a static Fixture', () => {
    expect(body(patchOf([fixture('w', 'wash')]), 'w').yaw).toBe(0);
  });

  it('rests a moving head at pan and tilt 0', () => {
    const b = body(patchOf([fixture('h', 'head')]), 'h');
    expect(b.yoke).toBeCloseTo(0);
    expect(b.head).toBeCloseTo(0);
  });

  it('turns the yoke and head with an aim, signed by the mount', () => {
    const aim = { pan: 30, tilt: 40 };
    const hung = patchOf([fixture('h', 'head', { mounting: mounting({ mount: 'Hung' }) })]);
    const standing = patchOf([fixture('h', 'head', { mounting: mounting({ mount: 'Standing' }) })]);
    const hungBody = buildScene(hung, { h: aim }).bodies[0]!;
    const standingBody = buildScene(standing, { h: aim }).bodies[0]!;
    expect(hungBody.yoke).toBeCloseTo(-30);
    expect(hungBody.head).toBeCloseTo(-40);
    expect(standingBody.yoke).toBeCloseTo(30);
    expect(standingBody.head).toBeCloseTo(40);
  });

  it('applies inversion and offset to the angles', () => {
    const patch = patchOf([
      fixture('h', 'head', {
        mounting: mounting({ mount: 'Standing', panInvert: true, tiltOffset: 10 }),
      }),
    ]);
    const b = buildScene(patch, { h: { pan: 30, tilt: 5 } }).bodies[0]!;
    expect(b.yoke).toBeCloseTo(-30);
    expect(b.head).toBeCloseTo(15);
  });
});

describe('camera presets', () => {
  const stage = { width: 10, depth: 6 };
  const presets = cameraPresets(stage);

  it('puts FOH at eye height, centred in front of the stage, looking at it', () => {
    expect(presets.foh.position.x).toBe(0);
    expect(presets.foh.position.y).toBeLessThan(0);
    expect(presets.foh.position.z).toBeCloseTo(1.7);
    expect(presets.foh.target.x).toBe(0);
    expect(presets.foh.target.y).toBeGreaterThan(0);
  });

  it('puts Top above the middle of the stage, looking down', () => {
    expect(presets.top.position.x).toBe(0);
    expect(presets.top.position.z).toBeGreaterThan(stage.width);
    expect(presets.top.target).toEqual({ x: 0, y: 3, z: 0 });
    // Not straight down, so the view keeps an up.
    expect(presets.top.position.y).not.toBe(3);
  });

  it('puts Side to Stage Left, level with the stage, looking at its middle', () => {
    expect(presets.side.position.x).toBeGreaterThan(stage.width / 2);
    expect(presets.side.position.y).toBe(3);
    expect(presets.side.target.x).toBe(0);
  });

  it('moves further back for a bigger stage', () => {
    const big = cameraPresets({ width: 30, depth: 12 });
    expect(big.foh.position.y).toBeLessThan(presets.foh.position.y);
    expect(big.top.position.z).toBeGreaterThan(presets.top.position.z);
    expect(big.side.position.x).toBeGreaterThan(presets.side.position.x);
  });
});

describe('buildScene', () => {
  it('collects the surroundings, truss, bodies and presets', () => {
    const patch = patchOf([fixture('w', 'wash', { height: 5 })]);
    const scene = buildScene(patch);
    expect(scene.bodies).toHaveLength(1);
    expect(scene.truss).toHaveLength(1);
    expect(scene.backWall.size.z).toBeGreaterThan(5);
    expect(scene.cameras.foh).toEqual(cameraPresets(patch.stage).foh);
  });
});

describe('beamAngle', () => {
  it.each([
    ['wash', 25],
    ['head', 8],
    ['blinder', 60],
    ['strobe', 90],
    ['bar', 30],
  ])('defaults the %s Profile by its Role to %d degrees', (profileId, degrees) => {
    const f = fixture('a', profileId);
    expect(beamAngle(patchOf([f]), f)).toBe(degrees);
  });

  it("uses the Profile's Beam angle over the Role's default", () => {
    const f = fixture('a', 'wash');
    const patch = patchOf([f]);
    patch.profiles = patch.profiles.map((p) => (p.id === 'wash' ? { ...p, beamAngle: 40 } : p));
    expect(beamAngle(patch, f)).toBe(40);
  });

  it('has a default for every Role', () => {
    expect(Object.keys(BEAM_ANGLE_DEFAULTS).sort()).toEqual(
      ['Blinder', 'Effect', 'Pixel/Bar', 'Spot/Beam', 'Strobe', 'Wash'].sort(),
    );
  });
});

describe('strobeVisible', () => {
  it('is steady when not strobing', () => {
    expect(strobeVisible(undefined, 0.3)).toBe(true);
    expect(strobeVisible(0, 0.3)).toBe(true);
  });

  it('is on for the first half of each cycle and off for the second', () => {
    expect(strobeVisible(2, 0)).toBe(true);
    expect(strobeVisible(2, 0.2)).toBe(true);
    expect(strobeVisible(2, 0.3)).toBe(false);
    expect(strobeVisible(2, 0.5)).toBe(true);
  });

  it('blinds at most 4 Hz', () => {
    // At 20 Hz asked, the cycle is 0.25 s: off from 0.125 s.
    expect(strobeVisible(20, 0.1)).toBe(true);
    expect(strobeVisible(20, 0.15)).toBe(false);
  });

  it('stays steady under reduced motion', () => {
    expect(strobeVisible(2, 0.3, true)).toBe(true);
  });
});

describe('fixtureLooks', () => {
  const white = { intensity: 1, red: 1, green: 1, blue: 1 };
  const look = (
    patch: VenuePatch,
    id: string,
    light: Parameters<typeof fixtureLooks>[1][string],
  ) => {
    const found = fixtureLooks(patch, { [id]: light }).find((l) => l.id === id);
    if (!found) throw new Error(`no look ${id}`);
    return found;
  };

  it('has no cone or pool for a dark Fixture, or one without a light', () => {
    const patch = patchOf([fixture('a', 'wash', { height: 5 })]);
    expect(look(patch, 'a', { ...white, intensity: 0 })).not.toHaveProperty('cone');
    expect(look(patch, 'a', undefined)).not.toHaveProperty('cone');
  });

  it('beams an Overhead static Fixture straight down, with the Role half-angle', () => {
    const patch = patchOf([fixture('a', 'wash', { x: 1, y: 2, height: 5 })]);
    const { cone, pool } = look(patch, 'a', white);
    expect(cone?.halfAngle).toBeCloseTo(12.5);
    expect(cone?.direction).toEqual({ x: 0, y: 0, z: -1 });
    expect(cone?.length).toBeCloseTo(5 - BODY_SIZES.par.z);
    expect(pool?.surface).toBe('floor');
    expect(pool?.position).toEqual({ x: 1, y: 2, z: 0 });
    expect(pool?.radius).toBeCloseTo(5 * Math.tan((12.5 * Math.PI) / 180));
  });

  it('beams a Floor static Fixture up, with no pool', () => {
    const patch = patchOf([fixture('a', 'wash', { y: 2, height: 0 })]);
    const { cone, pool } = look(patch, 'a', white);
    expect(cone?.direction).toEqual({ x: 0, y: 0, z: 1 });
    expect(pool).toBeUndefined();
  });

  it("passes the light's colour and intensity through", () => {
    const patch = patchOf([fixture('a', 'wash', { height: 5 })]);
    const shown = look(patch, 'a', { intensity: 0.5, red: 1, green: 0.5, blue: 0, strobe: 3 });
    expect(shown).toMatchObject({
      intensity: 0.5,
      colour: { red: 1, green: 0.5, blue: 0 },
      strobe: 3,
    });
  });

  describe('a moving head', () => {
    const patch = patchOf([fixture('m', 'head', { x: 2, y: 3, height: 6, mounting: mounting() })]);
    function mounting(): Mounting {
      return { ...DEFAULT_MOUNTING };
    }

    it('turns the yoke with pan and the head with tilt', () => {
      const shown = look(patch, 'm', { ...white, aim: { pan: 30, tilt: 20 } });
      expect(shown.yoke).toBeCloseTo(-30);
      expect(shown.head).toBeCloseTo(-20);
    });

    it('lands a pool on the floor where tilt aims it', () => {
      // 45 degrees toward the audience from 6 m up: 6 m to the front.
      const { pool, cone } = look(patch, 'm', { ...white, aim: { pan: 0, tilt: 45 } });
      expect(pool?.surface).toBe('floor');
      expect(pool?.position.x).toBeCloseTo(2);
      expect(pool?.position.y).toBeCloseTo(-3);
      expect(cone?.halfAngle).toBeCloseTo(4);
    });

    it('lands a pool on the back wall when aimed upstage', () => {
      // Stage depth 6, 3 m upstage of the Fixture: 45 degrees drops 3 m.
      const { pool, cone } = look(patch, 'm', { ...white, aim: { pan: 180, tilt: 45 } });
      expect(pool?.surface).toBe('wall');
      expect(pool?.position.x).toBeCloseTo(2);
      expect(pool?.position.y).toBeCloseTo(6);
      expect(pool?.position.z).toBeCloseTo(3);
      expect(pool?.normal).toEqual({ x: 0, y: -1, z: 0 });
      expect(cone?.length).toBeLessThan(3 * Math.SQRT2);
    });

    it('lights no pool past the ends of the wall', () => {
      const wide = patchOf([fixture('m', 'head', { x: 4.5, y: 3, height: 6 })]);
      // Hung pan 180 tilt 45 heads upstage; pan 90 turns it toward -x, so +x is -90.
      const { pool } = look(wide, 'm', { ...white, aim: { pan: -135, tilt: 80 } });
      expect(pool).toBeUndefined();
    });

    it('lands a beam into the crowd on the audience floor, with a pool', () => {
      // 60 degrees toward the audience from 6 m up: 6 * tan(60) m to the front of y = 3,
      // past the audience plane at y = -11 and 3 m short of its floor's end.
      const { pool, cone } = look(patch, 'm', { ...white, aim: { pan: 0, tilt: 60 } });
      expect(pool?.surface).toBe('floor');
      expect(pool?.position.y).toBeCloseTo(3 - 6 * Math.tan((60 * Math.PI) / 180));
      expect(pool?.position.z).toBeCloseTo(0);
      expect(cone?.length).toBeGreaterThan(11);
    });

    it('lets a beam above the wall go past it, with no pool', () => {
      // Wall is 7.5 m high (6 m Fixture + 1.5); this beam rises and meets the plane above it.
      const rising = patchOf([fixture('m', 'head', { x: 0, y: 3, height: 6 })]);
      const { pool, cone } = look(rising, 'm', { ...white, aim: { pan: 180, tilt: 120 } });
      expect(pool).toBeUndefined();
      expect(cone?.length).toBeCloseTo(BEAM_UP_LENGTH - 0.16 - 0.3, 0);
    });

    it('has no pool where a floor hit is off the deck and the audience floor', () => {
      // Aimed far out to Stage Right: lands past the audience floor's side.
      const wide = patchOf([fixture('m', 'head', { x: 0, y: -2, height: 6 })]);
      const { pool } = look(wide, 'm', { ...white, aim: { pan: -90, tilt: 75 } });
      expect(pool).toBeUndefined();
    });
  });
});

describe('haze density', () => {
  it('starts at the minimum', () => {
    expect(createHazeDensity().at(0, 0)).toBe(HAZE_MINIMUM);
  });

  it('rises over about 10 s', () => {
    const density = createHazeDensity();
    density.at(0, 1);
    expect(density.at(5, 1)).toBeGreaterThan(0.5);
    expect(density.at(5, 1)).toBeLessThan(0.9);
    expect(density.at(10, 1)).toBeGreaterThan(0.9);
    expect(density.at(10, 1)).toBeLessThan(1);
  });

  it('decays over about 60 s, slower than it rises', () => {
    const density = createHazeDensity();
    density.at(0, 1);
    density.at(100, 1);
    expect(density.at(110, 0)).toBeGreaterThan(0.5);
    expect(density.at(170, 0)).toBeLessThan(0.15);
    expect(density.at(170, 0)).toBeGreaterThan(HAZE_MINIMUM);
  });

  it('never falls below the minimum', () => {
    const density = createHazeDensity();
    density.at(0, 1);
    density.at(100, 1);
    expect(density.at(100000, 0)).toBeCloseTo(HAZE_MINIMUM, 5);
    expect(density.at(100001, 0)).toBeGreaterThanOrEqual(HAZE_MINIMUM);
  });

  it('is replaced at once by the Assume haze', () => {
    const density = createHazeDensity();
    density.at(0, 0);
    expect(density.at(0.01, 0, 0.7)).toBe(0.7);
    expect(density.settling(0, 0.7)).toBe(false);
  });

  it('gives the minimum for an Assume haze of 0', () => {
    const density = createHazeDensity();
    expect(density.at(0, 1, 0)).toBe(HAZE_MINIMUM);
  });

  it('counts a restarted clock from the restart, not from the last frame', () => {
    const density = createHazeDensity();
    density.at(0, 0);
    density.restart(1000);
    // The first frame after the restart has no time behind it.
    expect(density.at(1000, 1)).toBeCloseTo(HAZE_MINIMUM, 5);
    expect(density.at(1005, 1)).toBeGreaterThan(0.5);
    expect(density.at(1005, 1)).toBeLessThan(0.9);
  });

  it('follows the Hazers again from where it was when the Assume haze is cleared', () => {
    const density = createHazeDensity();
    density.at(0, 0);
    density.at(1, 0, 0.7);
    const after = density.at(2, 0);
    expect(after).toBeLessThan(0.7);
    expect(after).toBeGreaterThan(0.65);
    expect(density.settling(0)).toBe(true);
  });

  it('is settled at its goal', () => {
    const density = createHazeDensity();
    density.at(0, 0);
    expect(density.settling(0)).toBe(false);
    expect(density.settling(1)).toBe(true);
  });
});

describe('roomLight', () => {
  it('is full white with no House Lights', () => {
    expect(roomLight(undefined)).toEqual({
      ambient: { red: 1, green: 1, blue: 1, intensity: AMBIENT_FULL },
    });
  });

  it('takes the House Lights colour and scales the ambient by their intensity', () => {
    const lit = roomLight({ intensity: 0.5, red: 1, green: 0.5, blue: 0 });
    expect(lit.ambient).toMatchObject({ red: 1, green: 0.5, blue: 0 });
    expect(lit.ambient.intensity).toBeCloseTo(AMBIENT_FULL * 0.5);
  });

  it('puts the ambient out with the House Lights', () => {
    const dark = roomLight({ intensity: 0, red: 1, green: 1, blue: 1 });
    expect(dark.ambient.intensity).toBe(0);
  });
});
