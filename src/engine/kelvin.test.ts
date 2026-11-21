import { describe, expect, it } from 'vitest';
import type {
  Capability,
  CapabilityRange,
  Channel,
  FixtureProfile,
} from '../shared/fixture-profile';
import type { Colour, Show } from '../shared/show';
import type { PatchedFixture, VenuePatch } from '../shared/venue-patch';
import { activate, resolveFrames, resolveLights } from './scene-resolution';

function channel(name: string, capability: Capability): Channel {
  return {
    kind: 'control',
    name,
    defaultValue: 0,
    ranges: [{ from: 0, to: 255, capability }],
  };
}

const dimmer = channel('Dimmer', { type: 'intensity' });
const emitter = (
  name: string,
  e: 'red' | 'green' | 'blue' | 'white' | 'amber' | 'warmWhite' | 'coldWhite',
) => channel(name, { type: 'emitter', emitter: e });

function profile(id: string, channels: Channel[]): FixtureProfile {
  return {
    id,
    manufacturer: 'Test',
    model: id,
    defaultRole: 'Wash',
    modes: [{ name: 'mode', channels }],
  };
}

const rgb = profile('rgb', [
  dimmer,
  emitter('R', 'red'),
  emitter('G', 'green'),
  emitter('B', 'blue'),
]);
const rgbw = profile('rgbw', [
  dimmer,
  emitter('R', 'red'),
  emitter('G', 'green'),
  emitter('B', 'blue'),
  emitter('W', 'white'),
]);
const rgba = profile('rgba', [
  dimmer,
  emitter('R', 'red'),
  emitter('G', 'green'),
  emitter('B', 'blue'),
  emitter('A', 'amber'),
]);
const cct = profile('cct', [dimmer, channel('CCT', { type: 'colourTemperature' })]);
const cctSpan = profile('cct-span', [
  dimmer,
  channel('CCT', { type: 'colourTemperature', kelvin: [3000, 6000] }),
]);
const warmCold = profile('warm-cold', [
  dimmer,
  emitter('WW', 'warmWhite'),
  emitter('CW', 'coldWhite'),
]);

const slot = (from: number, to: number, name: string, colour: string): CapabilityRange => ({
  from,
  to,
  capability: { type: 'wheelSlot', slot: { name, colour } },
});
const wheel = profile('wheel', [
  dimmer,
  {
    kind: 'control',
    name: 'Colour',
    defaultValue: 0,
    ranges: [
      slot(0, 9, 'Red', '#ff0000'),
      slot(10, 19, 'Open', '#ffffff'),
      slot(20, 29, 'CTO', '#ffb060'),
      slot(30, 39, 'CTB', '#a0c8ff'),
      slot(40, 49, 'Yellow', '#ffff00'),
    ],
  },
]);

// The channels one Fixture of `p` gets for a Rule colour, at full intensity.
function dmx(p: FixtureProfile, colour: Colour): number[] {
  const fixture: PatchedFixture = {
    id: 'f1',
    name: 'Fixture',
    profileId: p.id,
    mode: 'mode',
    universe: 1,
    address: 1,
    x: 0,
    y: 1,
    height: 0,
  };
  const rig: VenuePatch = {
    stage: { width: 12, depth: 9 },
    universes: [{ number: 1 }],
    fixtures: [fixture],
    profiles: [p],
  };
  const show: Show = {
    layers: [{ id: 'l1', name: 'Layer 1' }],
    scenes: [
      {
        id: 's',
        name: 's',
        tags: [],
        layer: 'l1',
        fadeIn: 0,
        rules: [{ target: {}, intensity: 1, colour }],
      },
    ],
    triggers: [],
  };
  const active = activate({}, show, rig, 's', 0);
  const frame = resolveFrames(show, rig, active, 0).get(1)!;
  return [...frame.subarray(0, p.modes[0]!.channels.length)];
}

describe('kelvin whites', () => {
  it('mixes 3200 K and 5600 K on an RGB Fixture, warmer lower in blue', () => {
    const warm = dmx(rgb, { kelvin: 3200 });
    const cool = dmx(rgb, { kelvin: 5600 });
    expect(warm[0]).toBe(255);
    const near = (actual: number | undefined, expected: number) =>
      expect(Math.abs(actual! - expected)).toBeLessThanOrEqual(1);
    expect(warm[1]).toBe(255);
    near(warm[2], 184);
    near(warm[3], 123);
    expect(cool[1]).toBe(255);
    near(cool[2], 239);
    near(cool[3], 225);
  });

  it('puts the common part on the white emitter of an RGBW Fixture', () => {
    const [, red, green, blue, white] = dmx(rgbw, { kelvin: 3200 });
    expect(white).toBeGreaterThan(100);
    expect(blue).toBe(0);
    expect(red! + white!).toBe(255);
    expect(green! + white!).toBeLessThan(255);
  });

  it('uses the amber emitter of an RGBA Fixture, with less blue when warm', () => {
    const warm = dmx(rgba, { kelvin: 3200 });
    const cool = dmx(rgba, { kelvin: 5600 });
    expect(warm[4]).toBeGreaterThan(0);
    expect(warm[3]).toBeLessThan(cool[3]!);
  });

  it('sets a CCT channel across its span, defaulting to 2700–6500 K', () => {
    expect(dmx(cct, { kelvin: 2700 })[1]).toBe(0);
    expect(dmx(cct, { kelvin: 6500 })[1]).toBe(255);
    expect(dmx(cct, { kelvin: 4600 })[1]).toBe(128);
    // 3200 K is 0.13 of the way across, 5600 K 0.76.
    expect(dmx(cct, { kelvin: 3200 })[1]).toBe(34);
    expect(dmx(cct, { kelvin: 5600 })[1]).toBe(195);
    // A given span: clamped at its ends.
    expect(dmx(cctSpan, { kelvin: 3000 })[1]).toBe(0);
    expect(dmx(cctSpan, { kelvin: 4500 })[1]).toBe(128);
    expect(dmx(cctSpan, { kelvin: 6500 })[1]).toBe(255);
  });

  it('crossfades warm and cold white emitters', () => {
    expect(dmx(warmCold, { kelvin: 2700 }).slice(1)).toEqual([255, 0]);
    expect(dmx(warmCold, { kelvin: 6500 }).slice(1)).toEqual([0, 255]);
    expect(dmx(warmCold, { kelvin: 4600 }).slice(1)).toEqual([255, 255]);
    const [, warm, cold] = dmx(warmCold, { kelvin: 3200 });
    expect(warm).toBe(255);
    expect(cold).toBeGreaterThan(0);
    expect(cold).toBeLessThan(128);
  });

  it('picks the nearest white or CTO/CTB slot on a wheel Fixture', () => {
    // Warm: CTO. Cool: Open, the nearest of the whites. Never red or yellow.
    expect(dmx(wheel, { kelvin: 2700 })[1]).toBe(24);
    expect(dmx(wheel, { kelvin: 3200 })[1]).toBe(24);
    expect(dmx(wheel, { kelvin: 5600 })[1]).toBe(14);
    expect(dmx(wheel, { kelvin: 6500 })[1]).toBe(14);
  });

  it('previews the temperature on the Fixtures that make it', () => {
    const light = (p: FixtureProfile) => {
      const rig: VenuePatch = {
        stage: { width: 12, depth: 9 },
        universes: [{ number: 1 }],
        fixtures: [
          {
            id: 'f1',
            name: 'F',
            profileId: p.id,
            mode: 'mode',
            universe: 1,
            address: 1,
            x: 0,
            y: 1,
            height: 0,
          },
        ],
        profiles: [p],
      };
      const show: Show = {
        layers: [{ id: 'l1', name: 'L' }],
        scenes: [],
        triggers: [],
        defaultColour: { kelvin: 3200 },
      };
      const lit: Show = {
        ...show,
        scenes: [
          {
            id: 's',
            name: 's',
            tags: [],
            layer: 'l1',
            fadeIn: 0,
            rules: [{ target: {}, intensity: 1 }],
          },
        ],
      };
      return resolveLights(lit, rig, activate({}, lit, rig, 's', 0), 0).f1!;
    };
    const warm = light(rgb);
    expect(warm.red).toBe(1);
    expect(warm.blue).toBeLessThan(0.6);
    expect(light(cct)).toEqual(warm);
    expect(light(warmCold)).toEqual(warm);
  });
});
