import { describe, expect, it } from 'vitest';
import type { Capability, Channel, FixtureProfile } from './fixture-profile';
import type { Rule, Show } from './show';
import {
  DEFAULT_MOUNTING,
  type Hazer,
  type HouseLook,
  type PatchedFixture,
  type VenuePatch,
} from './venue-patch';
import {
  approximatedAims,
  approximatedKelvins,
  approximatedStrobes,
  fixtureUnsupportedGoboPrisms,
  hazePresetsWithoutHazers,
  lookPresetsNotInShow,
  unsetHousePresets,
} from './venue-check';

function control(name: string, capability: Capability): Channel {
  return { kind: 'control', name, defaultValue: 0, ranges: [{ from: 0, to: 255, capability }] };
}

const dimmer = control('Dimmer', { type: 'intensity' });
const pan = control('Pan', { type: 'pan', degrees: [0, 540] });
const tilt = control('Tilt', { type: 'tilt', degrees: [-135, 135] });

function profile(id: string, channels: Channel[]): FixtureProfile {
  return {
    id,
    manufacturer: 'Test',
    model: id,
    defaultRole: 'Spot/Beam',
    modes: [{ name: 'mode', channels }],
  };
}

const mover = profile('test/mover', [dimmer, pan, tilt]);
// A moving head whose Profile gives no degrees.
const bare = profile('test/bare', [
  dimmer,
  control('Pan', { type: 'pan' }),
  control('Tilt', { type: 'tilt' }),
]);
// A moving head whose Profile gives pan degrees only.
const noTiltDegrees = profile('test/no-tilt-degrees', [
  dimmer,
  pan,
  control('Tilt', { type: 'tilt' }),
]);
// A bar that only tilts.
const bar = profile('test/bar', [dimmer, tilt]);
const par = profile('test/par', [dimmer]);
// Gobo wheel with a gobo, and a prism.
const spot = profile('test/spot', [
  dimmer,
  {
    kind: 'control',
    name: 'Gobo',
    defaultValue: 0,
    ranges: [
      { from: 0, to: 9, capability: { type: 'goboSlot', name: 'Open', open: true } },
      { from: 10, to: 255, capability: { type: 'goboSlot', name: 'Star' } },
    ],
  },
  control('Prism', { type: 'prism', effect: 'in' }),
]);
// A gobo wheel with only an open slot, and a prism rotation only.
const openOnly = profile('test/open-only', [
  dimmer,
  control('Gobo', { type: 'goboSlot', name: 'Open', open: true }),
  control('Rotation', { type: 'prismRotation' }),
]);
const strobe = profile('test/strobe', [dimmer, control('Strobe', { type: 'strobe', hz: [1, 25] })]);
// A strobe range that gives no Hz span.
const unspanned = profile('test/unspanned', [dimmer, control('Strobe', { type: 'strobe' })]);
// A strobe range turned on, and a speed channel without a Hz span.
const unspannedSpeed = profile('test/unspanned-speed', [
  dimmer,
  control('Shutter', { type: 'strobe' }),
  control('Speed', { type: 'strobeSpeed' }),
]);
// A strobe span made from words, like OFL's slow → fast.
const wordy = profile('test/wordy', [
  dimmer,
  control('Strobe', { type: 'strobe', hz: [1, 20], assumed: true }),
]);

// A colour wheel only, an RGB mixer and a colour temperature channel.
const wheel = profile('test/wheel', [
  dimmer,
  {
    kind: 'control',
    name: 'Colour',
    defaultValue: 0,
    ranges: [
      {
        from: 0,
        to: 255,
        capability: { type: 'wheelSlot', slot: { name: 'Open', colour: '#ffffff' } },
      },
    ],
  },
]);
const rgb = profile('test/rgb', [
  dimmer,
  control('R', { type: 'emitter', emitter: 'red' }),
  control('G', { type: 'emitter', emitter: 'green' }),
  control('B', { type: 'emitter', emitter: 'blue' }),
]);
const cct = profile('test/cct', [dimmer, control('CCT', { type: 'colourTemperature' })]);

function fixture(id: string, profileId: string, overrides: Partial<PatchedFixture> = {}) {
  return {
    id,
    name: id,
    profileId,
    mode: 'mode',
    universe: 1,
    address: 1,
    // Hung over Downstage Stage Left.
    x: 3,
    y: 2,
    height: 6,
    ...overrides,
  };
}

function patch(...fixtures: PatchedFixture[]): VenuePatch {
  return {
    stage: { width: 10, depth: 8 },
    universes: [{ number: 1 }],
    fixtures: fixtures.map((f, i) => ({ ...f, address: 1 + i * 3 })),
    profiles: [
      mover,
      bare,
      noTiltDegrees,
      bar,
      par,
      strobe,
      unspanned,
      unspannedSpeed,
      wordy,
      spot,
      openOnly,
      wheel,
      rgb,
      cct,
    ],
  };
}

function show(rules: Rule[], overrides: Partial<Show> = {}): Show {
  return {
    layers: [{ id: 'l1', name: 'Layer 1' }],
    scenes: [{ id: 's1', name: 'Scene', tags: [], layer: 'l1', fadeIn: 0, rules }],
    triggers: [],
    ...overrides,
  };
}

describe('approximatedAims', () => {
  it('lists nothing for aims a mover reaches exactly', () => {
    const rig = patch(fixture('head', mover.id));

    expect(approximatedAims(show([{ target: {}, direction: 'Audience' }]), rig)).toEqual([]);
  });

  it('skips Fixtures that do not move', () => {
    expect(
      approximatedAims(show([{ target: {}, direction: 'Up' }]), patch(fixture('par', par.id))),
    ).toEqual([]);
  });

  it('reports assumed pan and tilt ranges, at the Default Direction', () => {
    const rig = patch(fixture('head', bare.id));

    expect(approximatedAims(show([]), rig)).toEqual([
      {
        fixtureId: 'head',
        direction: 'Down',
        approximations: ['assumedPanRange', 'assumedTiltRange'],
      },
    ]);
  });

  it('reports an assumed tilt range on its own', () => {
    const rig = patch(fixture('head', noTiltDegrees.id));

    expect(approximatedAims(show([]), rig)).toEqual([
      { fixtureId: 'head', direction: 'Down', approximations: ['assumedTiltRange'] },
    ]);
  });

  it('reports an aim out of reach, at a changed Default Direction', () => {
    const rig = patch(fixture('head', mover.id));

    expect(approximatedAims(show([], { defaultDirection: 'Up' }), rig)).toEqual([
      { fixtureId: 'head', direction: 'Up', approximations: ['outOfReach'] },
    ]);
  });

  it('reports an aim that needs a missing axis', () => {
    // Facing Stage Right, the bar tilts only across the stage.
    const rig = patch(fixture('bar', bar.id, { mounting: { ...DEFAULT_MOUNTING, rotation: 90 } }));

    expect(approximatedAims(show([{ target: {}, direction: 'Audience' }]), rig)).toEqual([
      { fixtureId: 'bar', direction: 'Audience', approximations: ['missingAxis'] },
    ]);
  });

  it('checks a Rule’s Direction only on the movers it targets', () => {
    const rig = patch(fixture('spot', mover.id), fixture('wash', mover.id, { role: 'Wash' }));
    const s = show([{ target: { roles: ['Wash'] }, direction: 'Up' }]);

    expect(approximatedAims(s, rig)).toEqual([
      { fixtureId: 'wash', direction: 'Up', approximations: ['outOfReach'] },
    ]);
  });

  it('lists each mover × Direction once, in patch and Direction order', () => {
    const rig = patch(fixture('a', bare.id), fixture('b', mover.id));
    const s = show([
      { target: {}, direction: 'Up' },
      { target: {}, direction: 'Audience' },
      { target: {}, direction: 'Up' },
    ]);

    expect(
      approximatedAims(s, rig).map(({ fixtureId, direction }) => [fixtureId, direction]),
    ).toEqual([
      ['a', 'Down'],
      ['a', 'Audience'],
      ['a', 'Up'],
      ['b', 'Up'],
    ]);
  });
});

describe('approximatedStrobes', () => {
  function shows(...scenes: [string, Rule[]][]): Show {
    return {
      ...show([]),
      scenes: scenes.map(([id, rules]) => ({
        id,
        name: id,
        tags: [],
        layer: 'l1',
        fadeIn: 0,
        rules,
      })),
    };
  }

  it('lists the Scenes that strobe a Fixture with no strobe channel or no Hz span', () => {
    const rig = patch(
      fixture('par', par.id),
      fixture('strobe', strobe.id),
      fixture('unspanned', unspanned.id),
      fixture('speed', unspannedSpeed.id),
      fixture('wordy', wordy.id),
    );
    const s = shows(
      ['fast', [{ target: {}, strobe: 'Fast' }]],
      ['steady', [{ target: {}, intensity: 1 }]],
      ['beat', [{ target: {}, strobe: 0.5 }]],
    );

    expect(approximatedStrobes(s, rig)).toEqual([
      { fixtureId: 'par', scenes: ['fast', 'beat'], approximation: 'noStrobeChannel' },
      { fixtureId: 'unspanned', scenes: ['fast', 'beat'], approximation: 'assumedHzSpan' },
      { fixtureId: 'speed', scenes: ['fast', 'beat'], approximation: 'assumedHzSpan' },
      { fixtureId: 'wordy', scenes: ['fast', 'beat'], approximation: 'assumedHzSpan' },
    ]);
  });

  it('counts only Scenes whose Rules leave the Fixture strobing', () => {
    const rig = patch(fixture('par', par.id), fixture('wash', par.id, { role: 'Wash' }));
    const s = shows(
      ['off', [{ target: {}, strobe: 'Off' }]],
      [
        'stopped',
        [
          { target: {}, strobe: 'Slow' },
          { target: { roles: ['Wash'] }, strobe: 'Off' },
        ],
      ],
    );

    expect(approximatedStrobes(s, rig)).toEqual([
      { fixtureId: 'par', scenes: ['stopped'], approximation: 'noStrobeChannel' },
    ]);
  });
});

describe('approximatedKelvins', () => {
  const rig = patch(
    fixture('wheel', wheel.id),
    fixture('rgb', rgb.id),
    fixture('cct', cct.id),
    fixture('par', par.id),
  );

  it('lists the Fixtures with only a colour wheel that a Scene gives a kelvin white', () => {
    const s = show([{ target: {}, colour: { kelvin: 3200 } }]);

    expect(approximatedKelvins(s, rig)).toEqual([
      { fixtureId: 'wheel', scenes: ['s1'], defaultColour: false },
    ]);
  });

  it('counts a kelvin in a colour Effect and in the Default Colour', () => {
    const effect = show([
      {
        target: {},
        colourEffect: {
          shape: 'Fade',
          colours: [{ swatch: 'Red' }, { kelvin: 5600 }],
          length: 4,
          spread: 'In sync',
        },
      },
    ]);
    expect(approximatedKelvins(effect, rig)).toEqual([
      { fixtureId: 'wheel', scenes: ['s1'], defaultColour: false },
    ]);

    const fallback = show([{ target: {}, intensity: 1 }], { defaultColour: { kelvin: 2700 } });
    expect(approximatedKelvins(fallback, rig)).toEqual([
      { fixtureId: 'wheel', scenes: [], defaultColour: true },
    ]);
  });

  it('lists nothing without a kelvin white, or for a Rule that misses the Fixture', () => {
    expect(approximatedKelvins(show([{ target: {}, colour: { swatch: 'White' } }]), rig)).toEqual(
      [],
    );
    const wash = show([{ target: { roles: ['Blinder'] }, colour: { kelvin: 3200 } }]);
    expect(approximatedKelvins(wash, rig)).toEqual([]);
  });
});

describe('unsetHousePresets', () => {
  const dim = { id: 'dim', name: 'Dim', fade: 2 };
  const up = { id: 'up', name: 'Up', fade: 5 };
  const white = { intensity: 1, colour: { swatch: 'White' } } as const;

  function housed(looks?: Record<string, HouseLook>): VenuePatch {
    return {
      ...patch(),
      house: { groups: [{ id: 'bar', name: 'Bar' }], lights: [], ...(looks && { looks }) },
    };
  }

  it('lists the House Presets this Venue Patch has no look for, in Show order', () => {
    const presets = show([], { housePresets: [dim, up] });

    expect(unsetHousePresets(presets, patch())).toEqual([dim, up]);
    expect(unsetHousePresets(presets, housed({ up: { bar: white } }))).toEqual([dim]);
    expect(unsetHousePresets(presets, housed({ dim: { bar: white }, up: { bar: white } }))).toEqual(
      [],
    );
  });

  it('ignores looks for House Presets the Show lacks', () => {
    expect(unsetHousePresets(show([]), housed({ gone: { bar: white } }))).toEqual([]);
  });

  it('lists the looks for House Presets the Show lacks, in patch order', () => {
    const rig = housed({ gone: { bar: white }, dim: { bar: white }, old: { bar: white } });

    expect(lookPresetsNotInShow(show([], { housePresets: [dim, up] }), rig)).toEqual([
      'gone',
      'old',
    ]);
    expect(lookPresetsNotInShow(show([]), patch())).toEqual([]);
  });
});

describe('hazePresetsWithoutHazers', () => {
  const light = { id: 'light', name: 'Light', level: 0.3, fade: 2 };
  const heavy = { id: 'heavy', name: 'Heavy', level: 0.9, fade: 5 };
  const hazer: Hazer = {
    ...{ id: 'h', name: 'Haze', profileId: 'test/haze', mode: 'mode' },
    ...{ universe: 1, address: 100, maxOutput: 1, fanLevel: 1 },
  };

  it('lists every Haze Preset, in Show order, when the Venue Patch has no Hazer', () => {
    const presets = show([], { hazePresets: [light, heavy] });

    expect(hazePresetsWithoutHazers(presets, patch())).toEqual([light, heavy]);
  });

  it('lists none when the Venue Patch has a Hazer, or the Show has no Haze Preset', () => {
    const presets = show([], { hazePresets: [light, heavy] });

    expect(hazePresetsWithoutHazers(presets, { ...patch(), hazers: [hazer] })).toEqual([]);
    expect(hazePresetsWithoutHazers(show([]), patch())).toEqual([]);
  });
});

describe('fixtureUnsupportedGoboPrisms', () => {
  function shows(...scenes: [string, Rule[]][]): Show {
    return {
      ...show([]),
      scenes: scenes.map(([id, rules]) => ({
        id,
        name: id,
        tags: [],
        layer: 'l1',
        fadeIn: 0,
        rules,
      })),
    };
  }

  it('lists the Scenes that set Prism or Gobo on a Fixture without the hardware', () => {
    const rig = patch(
      fixture('par', par.id),
      fixture('spot', spot.id),
      fixture('open', openOnly.id),
    );
    const s = shows(
      ['both', [{ target: {}, prism: 'On', gobo: 'Gobo' }]],
      ['spin', [{ target: {}, prism: 'Rotate slow' }]],
      ['steady', [{ target: {}, intensity: 1 }]],
    );

    const [parFx, spotFx, openFx] = rig.fixtures as [
      PatchedFixture,
      PatchedFixture,
      PatchedFixture,
    ];
    expect(fixtureUnsupportedGoboPrisms(s, rig, parFx)).toEqual([
      { fixtureId: 'par', kind: 'prism', scenes: ['both', 'spin'] },
      { fixtureId: 'par', kind: 'gobo', scenes: ['both'] },
    ]);
    expect(fixtureUnsupportedGoboPrisms(s, rig, spotFx)).toEqual([]);
    expect(fixtureUnsupportedGoboPrisms(s, rig, openFx)).toEqual([
      { fixtureId: 'open', kind: 'gobo', scenes: ['both'] },
    ]);
  });

  it('counts only Scenes whose Rules leave the Fixture with Prism or Gobo set', () => {
    const rig = patch(fixture('par', par.id), fixture('wash', par.id, { role: 'Wash' }));
    const s = shows(
      ['off', [{ target: {}, prism: 'Off', gobo: 'Open' }]],
      [
        'stopped',
        [
          { target: {}, prism: 'On', gobo: 'Gobo' },
          { target: { roles: ['Wash'] }, prism: 'Off', gobo: 'Open' },
        ],
      ],
    );

    expect(fixtureUnsupportedGoboPrisms(s, rig, rig.fixtures[0]!)).toEqual([
      { fixtureId: 'par', kind: 'prism', scenes: ['stopped'] },
      { fixtureId: 'par', kind: 'gobo', scenes: ['stopped'] },
    ]);
    expect(fixtureUnsupportedGoboPrisms(s, rig, rig.fixtures[1]!)).toEqual([]);
  });
});
