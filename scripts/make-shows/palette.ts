// The Palette Show: a venue-independent set of Scenes, by feeling, that the
// DAW sequences per track through MIDI notes on channel 1. Built with the
// app's own models and file format, so it passes the same validation as a
// saved file. `npm run show:palette` writes the Show and its cue sheet.
//
// Four Layers stack: Look (colour and intensity) → Movement (aim and movement
// Effect) → Accent (intensity and colour Effects) → Hit (Flash only). Edit
// the lists below and re-run the script to change the palette.
import type { Role } from '../../src/shared/fixture-profile';
import {
  beatsText,
  type Colour,
  type Direction,
  type EffectLength,
  type HazePreset,
  type HousePreset,
  type Layer,
  type Rule,
  type RuleTarget,
  type Scene,
  type Show,
  type Spread,
  type Swatch,
  type Trigger,
} from '../../src/shared/show';
import type { Zone, ZoneColumn, ZoneRow } from '../../src/shared/venue-patch';
import { saveShowFile } from '../../src/engine/show-file';

export const SHOW_NAME = 'Palette';
const CHANNEL = 1;

// ---------------------------------------------------------------- targets

const ROWS: ZoneRow[] = ['Front', 'Downstage', 'Midstage', 'Upstage'];
const COLUMNS: ZoneColumn[] = ['Stage Right', 'Centre', 'Stage Left'];
const zonesWhere = (
  level: Zone['level'],
  rows: ZoneRow[] = ROWS,
  columns: ZoneColumn[] = COLUMNS,
): Zone[] => rows.flatMap((row) => columns.map((column) => ({ row, column, level })));
const target = (roles: Role[], zones?: Zone[]): RuleTarget =>
  zones ? { roles, zones } : { roles };

// Overhead washes: the main stage wash (the Quads in the venue).
const WASH = target(['Wash'], zonesWhere('Overhead'));
// The Front row of overhead washes: the FOH Quads in the venue.
const FRONT = target(['Wash'], zonesWhere('Overhead', ['Front']));
// The upstage half of the overhead washes, for back light.
const BACK = target(['Wash'], zonesWhere('Overhead', ['Midstage', 'Upstage']));
const WASH_SR = target(['Wash'], zonesWhere('Overhead', ROWS, ['Stage Right']));
// Floor washes and LED bars: the floor pars in the venue.
const FLOOR = target(['Wash', 'Pixel/Bar'], zonesWhere('Floor'));
const FLOOR_SR = target(['Wash', 'Pixel/Bar'], zonesWhere('Floor', ROWS, ['Stage Right']));
const BEAMS = target(['Spot/Beam']);
// Effect Fixtures: the Mini Dekkers in the venue (the hazer too, which the
// app can't drive).
const FX = target(['Effect']);
// Every wash and bar, overhead and floor, for colour Accents. Beams keep the
// Look's colour.
const WASHES = target(['Wash', 'Pixel/Bar']);
// Fixtures that hits flash: real blinders where a venue has them, and the
// front washes.
const BLINDERS = target(['Blinder', 'Strobe']);
// The moving Fixtures Movement Scenes aim: beams and the moving washes.
// Directions skip Fixtures that don't move.
const MOVERS = target(['Spot/Beam', 'Wash']);
const ALL: RuleTarget = {};

const swatch = (name: Swatch): Colour => ({ swatch: name });
const set = (t: RuleTarget, intensity: number, colour?: Swatch): Rule =>
  colour ? { target: t, intensity, colour: swatch(colour) } : { target: t, intensity };
const off = (t: RuleTarget): Rule => ({ target: t, intensity: 0 });

// ---------------------------------------------------------------- entries

// A Scene with its MIDI note, how the note fires it and a line for the cue
// sheet.
interface Entry {
  scene: Scene;
  note: number;
  mode: Trigger['mode'];
  about: string;
}

const LAYERS: Layer[] = [
  { id: 'look', name: 'Look' },
  { id: 'movement', name: 'Movement' },
  { id: 'accent', name: 'Accent' },
  { id: 'hit', name: 'Hit' },
];

// ---------------------------------------------------------------- Looks

interface LookSpec {
  id: string;
  name: string;
  about: string;
  rules: Rule[];
}

// Six feelings, four Looks each, on notes C1–B2. Beams use colours their
// colour wheel has, so nothing is approximated.
const BUCKETS: { name: string; fadeIn: number; looks: LookSpec[] }[] = [
  {
    name: 'Warm slow',
    fadeIn: 3,
    looks: [
      {
        id: 'candle',
        name: 'Candle',
        about: 'Wash warm white 50, floor amber, beams off',
        rules: [set(WASH, 0.5, 'Warm White'), set(FLOOR, 0.4, 'Amber')],
      },
      {
        id: 'glow',
        name: 'Glow',
        about: 'Wash amber 60, floor orange, beams warm white 40',
        rules: [set(WASH, 0.6, 'Amber'), set(FLOOR, 0.5, 'Orange'), set(BEAMS, 0.4, 'Warm White')],
      },
      {
        id: 'sunset',
        name: 'Sunset',
        about: 'Wash orange 60, floor red, beams amber 50',
        rules: [set(WASH, 0.6, 'Orange'), set(FLOOR, 0.6, 'Red'), set(BEAMS, 0.5, 'Amber')],
      },
      {
        id: 'rose',
        name: 'Rose',
        about: 'Wash pink 50, floor amber, beams cyan 40 (contrast)',
        rules: [set(WASH, 0.5, 'Pink'), set(FLOOR, 0.5, 'Amber'), set(BEAMS, 0.4, 'Cyan')],
      },
    ],
  },
  {
    name: 'Cool slow',
    fadeIn: 3,
    looks: [
      {
        id: 'moon',
        name: 'Moon',
        about: 'Wash blue 40, front lavender 50, beams white 40',
        rules: [set(WASH, 0.4, 'Blue'), set(FRONT, 0.5, 'Lavender'), set(BEAMS, 0.4, 'White')],
      },
      {
        id: 'ocean',
        name: 'Ocean',
        about: 'Wash cyan 50, floor blue, beams blue 50',
        rules: [set(WASH, 0.5, 'Cyan'), set(FLOOR, 0.6, 'Blue'), set(BEAMS, 0.5, 'Blue')],
      },
      {
        id: 'twilight',
        name: 'Twilight',
        about: 'Wash lavender 50, floor magenta, beams cyan (contrast)',
        rules: [set(WASH, 0.5, 'Lavender'), set(FLOOR, 0.5, 'Magenta'), set(BEAMS, 0.5, 'Cyan')],
      },
      {
        id: 'teal',
        name: 'Teal',
        about: 'Wash cyan 50, floor green, beams white',
        rules: [set(WASH, 0.5, 'Cyan'), set(FLOOR, 0.5, 'Green'), set(BEAMS, 0.5, 'White')],
      },
    ],
  },
  {
    name: 'Groove',
    fadeIn: 1,
    looks: [
      {
        id: 'purple',
        name: 'Purple',
        about: 'Wash magenta 70, floor blue, beams magenta, Dekkers blue',
        rules: [
          set(WASH, 0.7, 'Magenta'),
          set(FLOOR, 0.7, 'Blue'),
          set(BEAMS, 0.7, 'Magenta'),
          set(FX, 0.6, 'Blue'),
        ],
      },
      {
        id: 'tropic',
        name: 'Tropic',
        about: 'Wash cyan 70, floor amber, beams amber (contrast), Dekkers cyan',
        rules: [
          set(WASH, 0.7, 'Cyan'),
          set(FLOOR, 0.7, 'Amber'),
          set(BEAMS, 0.7, 'Amber'),
          set(FX, 0.6, 'Cyan'),
        ],
      },
      {
        id: 'forest',
        name: 'Forest',
        about: 'Wash green 70, floor blue, beams cyan, Dekkers green',
        rules: [
          set(WASH, 0.7, 'Green'),
          set(FLOOR, 0.7, 'Blue'),
          set(BEAMS, 0.7, 'Cyan'),
          set(FX, 0.6, 'Green'),
        ],
      },
      {
        id: 'dusk',
        name: 'Dusk',
        about: 'Wash orange 70, floor blue, beams blue (contrast), Dekkers orange',
        rules: [
          set(WASH, 0.7, 'Orange'),
          set(FLOOR, 0.7, 'Blue'),
          set(BEAMS, 0.7, 'Blue'),
          set(FX, 0.6, 'Orange'),
        ],
      },
    ],
  },
  {
    name: 'High',
    fadeIn: 0,
    looks: [
      {
        id: 'red',
        name: 'Red',
        about: 'Everything red, full',
        rules: [set(WASH, 1, 'Red'), set(FLOOR, 1, 'Red'), set(BEAMS, 1, 'Red'), set(FX, 1, 'Red')],
      },
      {
        id: 'red-white',
        name: 'Red + white',
        about: 'Wash and floor red, beams and Dekkers white',
        rules: [
          set(WASH, 1, 'Red'),
          set(FLOOR, 1, 'Red'),
          set(BEAMS, 1, 'White'),
          set(FX, 1, 'White'),
        ],
      },
      {
        id: 'split',
        name: 'Split',
        about: 'Stage Left magenta, Stage Right cyan, beams white',
        rules: [
          set(WASH, 1, 'Magenta'),
          set(WASH_SR, 1, 'Cyan'),
          set(FLOOR, 1, 'Magenta'),
          set(FLOOR_SR, 1, 'Cyan'),
          set(BEAMS, 1, 'White'),
          set(FX, 1, 'Magenta'),
        ],
      },
      {
        id: 'blast',
        name: 'Blast',
        about: 'Everything white, full',
        rules: [
          set(WASH, 1, 'White'),
          set(FLOOR, 1, 'White'),
          set(BEAMS, 1, 'White'),
          set(FX, 1, 'White'),
        ],
      },
    ],
  },
  {
    name: 'Breakdown',
    fadeIn: 1,
    looks: [
      {
        id: 'uv',
        name: 'UV',
        about: 'Wash UV 30, beams blue 30',
        rules: [set(WASH, 0.3, 'UV'), set(BEAMS, 0.3, 'Blue')],
      },
      {
        id: 'shafts',
        name: 'Shafts',
        about: 'Beams white 80 only',
        rules: [set(BEAMS, 0.8, 'White')],
      },
      {
        id: 'silhouette',
        name: 'Silhouette',
        about: 'Back light warm white 70, floor warm white, front dark',
        rules: [set(BACK, 0.7, 'Warm White'), set(FLOOR, 0.7, 'Warm White')],
      },
      {
        id: 'floor',
        name: 'Floor',
        about: 'Floor blue 60 only',
        rules: [set(FLOOR, 0.6, 'Blue')],
      },
    ],
  },
  {
    name: 'Intro/Outro',
    fadeIn: 4,
    looks: [
      {
        id: 'walk-on',
        name: 'Walk-on',
        about: 'Wash blue 30, front dark, beams white 30',
        rules: [set(WASH, 0.3, 'Blue'), off(FRONT), set(BEAMS, 0.3, 'White')],
      },
      {
        id: 'reveal',
        name: 'Reveal',
        about: 'Front warm white 80, rest amber 30',
        rules: [set(WASH, 0.3, 'Amber'), set(FLOOR, 0.3, 'Amber'), set(FRONT, 0.8, 'Warm White')],
      },
      {
        id: 'fade',
        name: 'Fade',
        about: 'Wash amber 30, beams off',
        rules: [set(WASH, 0.3, 'Amber')],
      },
      {
        id: 'bow',
        name: 'Bow',
        about: 'Front white full, wash warm white 70, beams off',
        rules: [set(WASH, 0.7, 'Warm White'), set(FRONT, 1, 'White')],
      },
    ],
  },
];

const BASE_LOOK: Entry = {
  scene: {
    id: 'base',
    name: 'Base: warm white',
    tags: ['Look', 'Base'],
    layer: 'look',
    fadeIn: 1,
    rules: [set(WASH, 0.8, 'Warm White'), set(FLOOR, 0.5, 'Warm White')],
  },
  note: 12, // C0
  mode: 'go',
  about: 'Safe general wash: warm white 80, beams off',
};

function lookEntries(): Entry[] {
  let note = 24; // C1
  return BUCKETS.flatMap(({ name: bucket, fadeIn, looks }) =>
    looks.map(({ id, name, about, rules }) => ({
      scene: {
        id,
        name: `${bucket}: ${name}`,
        tags: ['Look', bucket],
        layer: 'look',
        fadeIn,
        rules,
      },
      note: note++,
      mode: 'go' as const,
      about,
    })),
  );
}

// ---------------------------------------------------------------- Movement

// Still and slow Scenes aim the beams and the moving washes together; fast
// ones move the beams only and hold the washes Down, so the stage wash stays
// on the band. Notes C3–C#4.
interface MoveSpec {
  id: string;
  name: string;
  direction: Direction;
  effect?: {
    shape: 'Circle' | 'Pan sweep' | 'Tilt sweep' | 'Ballyhoo';
    size: number;
    length: EffectLength;
    spread: Spread;
  };
}

const MOVEMENT: { name: string; fadeIn: number; fast: boolean; moves: MoveSpec[] }[] = [
  {
    name: 'Still',
    fadeIn: 2,
    fast: false,
    moves: [
      { id: 'down', name: 'Down', direction: 'Down' },
      { id: 'audience', name: 'Audience', direction: 'Audience' },
      { id: 'cross', name: 'Cross', direction: 'Cross' },
      { id: 'centre', name: 'Centre', direction: 'Centre' },
      { id: 'out', name: 'Out', direction: 'Out' },
    ],
  },
  {
    name: 'Slow',
    fadeIn: 3,
    fast: false,
    moves: [
      {
        id: 'sway',
        name: 'Sway',
        direction: 'Down',
        effect: { shape: 'Pan sweep', size: 25, length: 16, spread: 'Mirrored' },
      },
      {
        id: 'drift',
        name: 'Drift',
        direction: 'Down',
        effect: { shape: 'Circle', size: 12, length: 16, spread: 'Left→Right' },
      },
      {
        id: 'breathe',
        name: 'Breathe',
        direction: 'Audience',
        effect: { shape: 'Tilt sweep', size: 12, length: 8, spread: 'In sync' },
      },
      {
        id: 'slow-fan',
        name: 'Slow fan',
        direction: 'Out',
        effect: { shape: 'Pan sweep', size: 25, length: 8, spread: 'Alternate' },
      },
    ],
  },
  {
    name: 'Fast',
    fadeIn: 0.5,
    fast: true,
    moves: [
      {
        id: 'ballyhoo',
        name: 'Ballyhoo',
        direction: 'Down',
        effect: { shape: 'Ballyhoo', size: 25, length: 2, spread: 'Alternate' },
      },
      {
        id: 'tilt-chop',
        name: 'Tilt chop',
        direction: 'Audience',
        effect: { shape: 'Tilt sweep', size: 25, length: 1, spread: 'Alternate' },
      },
      {
        id: 'spin',
        name: 'Spin',
        direction: 'Centre',
        effect: { shape: 'Circle', size: 12, length: 1, spread: 'Mirrored' },
      },
      {
        id: 'wave',
        name: 'Wave',
        direction: 'Down',
        effect: { shape: 'Pan sweep', size: 25, length: 2, spread: 'Left→Right' },
      },
      {
        id: 'crowd-sweep',
        name: 'Crowd sweep',
        direction: 'Audience',
        effect: { shape: 'Pan sweep', size: 45, length: 4, spread: 'In sync' },
      },
    ],
  },
];

function movementEntries(): Entry[] {
  let note = 48; // C3
  return MOVEMENT.flatMap(({ name: group, fadeIn, fast, moves }) =>
    moves.map(({ id, name, direction, effect }) => {
      const movementEffect = effect ?? ('None' as const);
      const rules: Rule[] = fast
        ? [
            { target: target(['Wash']), direction: 'Down', movementEffect: 'None' },
            { target: BEAMS, direction, movementEffect },
          ]
        : [{ target: MOVERS, direction, movementEffect }];
      const about = effect
        ? `${effect.shape} ${beatsText(effect.length)}, ${effect.size}°, ${effect.spread}, around ${direction}` +
          (fast ? '; beams only, washes Down' : '')
        : `Beams and washes aim ${direction}, still`;
      return {
        scene: {
          id: `move-${id}`,
          name: `${group}: ${name}`,
          tags: ['Movement', group],
          layer: 'movement',
          fadeIn,
          rules,
        },
        note: note++,
        mode: 'go' as const,
        about,
      };
    }),
  );
}

// ---------------------------------------------------------------- Accents

// Scale or recolour whatever the Look gives. A Look fired later stops a
// colour Accent, so fire colour Accents after the Look. Notes C5–B5.
function accentEntries(): Entry[] {
  const accent = (
    id: string,
    name: string,
    about: string,
    rule: Omit<Rule, 'target'>,
    t: RuleTarget = ALL,
  ) => ({ id, name, about, rule: { target: t, ...rule } });
  const list = [
    accent('pulse-1', 'Pulse 1b', 'Pulse on the beat, depth .6, in sync', {
      intensityEffect: { shape: 'Pulse', depth: 0.6, length: 1, spread: 'In sync' },
    }),
    accent('pulse-half', 'Pulse 1/2b', 'Pulse every 1/2 beat, depth .5, alternate', {
      intensityEffect: { shape: 'Pulse', depth: 0.5, length: 0.5, spread: 'Alternate' },
    }),
    accent('chase-lr', 'Chase L>R', 'One position at a time, left to right, 1 beat', {
      intensityEffect: { shape: 'Chase', depth: 1, length: 1, spread: 'Left→Right' },
    }),
    accent('chase-mirror', 'Chase mirror', 'Chase from centre out, 2 beats', {
      intensityEffect: { shape: 'Chase', depth: 1, length: 2, spread: 'Mirrored' },
    }),
    accent('build-8', 'Build 8b', 'Ramp up over 8 beats, depth 1', {
      intensityEffect: { shape: 'Ramp up', depth: 1, length: 8, spread: 'In sync' },
    }),
    accent('build-16', 'Build 16b', 'Ramp up over 16 beats, depth 1', {
      intensityEffect: { shape: 'Ramp up', depth: 1, length: 16, spread: 'In sync' },
    }),
    accent('breath-8', 'Breath 8b', 'Ramp down over 8 beats, depth .4', {
      intensityEffect: { shape: 'Ramp down', depth: 0.4, length: 8, spread: 'In sync' },
    }),
    accent(
      'step-red-white',
      'Step red/white',
      'Washes step red ↔ white every beat, alternate',
      {
        colourEffect: {
          shape: 'Step',
          colours: [swatch('Red'), swatch('White')],
          length: 1,
          spread: 'Alternate',
        },
      },
      WASHES,
    ),
    accent(
      'step-blue-magenta',
      'Step blue/magenta',
      'Washes step blue ↔ magenta every beat, alternate',
      {
        colourEffect: {
          shape: 'Step',
          colours: [swatch('Blue'), swatch('Magenta')],
          length: 1,
          spread: 'Alternate',
        },
      },
      WASHES,
    ),
    accent(
      'drift-warm',
      'Drift warm',
      'Washes fade amber → orange → pink over 16 beats',
      {
        colourEffect: {
          shape: 'Fade',
          colours: [swatch('Amber'), swatch('Orange'), swatch('Pink')],
          length: 16,
          spread: 'Left→Right',
        },
      },
      WASHES,
    ),
    accent(
      'drift-cool',
      'Drift cool',
      'Washes fade blue → cyan → lavender over 16 beats',
      {
        colourEffect: {
          shape: 'Fade',
          colours: [swatch('Blue'), swatch('Cyan'), swatch('Lavender')],
          length: 16,
          spread: 'Left→Right',
        },
      },
      WASHES,
    ),
    accent(
      'rainbow',
      'Rainbow',
      'Washes cycle the hue over 16 beats, left to right',
      { colourEffect: { shape: 'Rainbow', length: 16, spread: 'Left→Right' } },
      WASHES,
    ),
  ];
  return list.map(({ id, name, about, rule }, i) => ({
    scene: {
      id: `accent-${id}`,
      name: `Accent: ${name}`,
      tags: ['Accent'],
      layer: 'accent',
      fadeIn: 0.5,
      rules: [rule],
    },
    note: 72 + i, // C5 up
    mode: 'go' as const,
    about,
  }));
}

// ---------------------------------------------------------------- Hits

// Flash: on while the note is held, so the DAW note length is the hit or roll
// length. Notes C7–A7. Blackout hit is on the Look Layer: intensity is the
// highest any Layer gives, so only replacing the Look can take it to 0.
function hitEntries(): Entry[] {
  const hit = (id: string, name: string, about: string, rules: Rule[], layer = 'hit') => ({
    id,
    name,
    about,
    rules,
    layer,
  });
  const roll = (beats: EffectLength, spread: Spread) =>
    hit(
      `roll-${beats === 1 ? '1' : beats === 0.5 ? 'half' : 'quarter'}`,
      `Roll ${beats === 1 ? '1b' : beats === 0.5 ? '1/2b' : '1/4b'}`,
      `Square every ${beatsText(beats)}, depth 1, ${spread}; for drum rolls`,
      [{ target: ALL, intensityEffect: { shape: 'Square', depth: 1, length: beats, spread } }],
    );
  const list = [
    hit('blinder', 'Blinder', 'Blinders and front washes white, full', [
      set(BLINDERS, 1, 'White'),
      set(FRONT, 1, 'White'),
    ]),
    hit('beam-punch', 'Beam punch', 'Beams aim Audience, white, full, still', [
      {
        target: BEAMS,
        intensity: 1,
        colour: swatch('White'),
        direction: 'Audience',
        movementEffect: 'None',
      },
    ]),
    hit('full-white', 'Full white', 'Everything white, full', [set(ALL, 1, 'White')]),
    hit('colour-red', 'Colour hit red', 'Everything red, full', [set(ALL, 1, 'Red')]),
    hit(
      'blackout',
      'Blackout hit',
      'Everything dark while held (Look Layer); the Look returns on release',
      [off(ALL)],
      'look',
    ),
    hit('strobe', 'Strobe', 'Everything white, full, Fast strobe (12 Hz)', [
      { ...set(ALL, 1, 'White'), strobe: 'Fast' },
    ]),
    roll(1, 'Alternate'),
    roll(0.5, 'Alternate'),
    roll(0.25, 'In sync'),
    hit('riser', 'Riser', 'Ramp up every 4 beats, beams converge Centre', [
      {
        target: ALL,
        intensityEffect: { shape: 'Ramp up', depth: 1, length: 4, spread: 'In sync' },
      },
      { target: BEAMS, direction: 'Centre', movementEffect: 'None' },
    ]),
  ];
  return list.map(({ id, name, about, rules, layer }, i) => ({
    scene: { id: `hit-${id}`, name: `Hit: ${name}`, tags: ['Hit'], layer, fadeIn: 0, rules },
    note: 96 + i, // C7 up
    mode: 'flash' as const,
    about,
  }));
}

// ---------------------------------------------------------------- House

// The house looks for these are set per venue, in the Venue Patch.
const HOUSE_PRESETS: HousePreset[] = [
  { id: 'walk-in', name: 'Walk-in', fade: 3, note: { channel: CHANNEL, note: 13 } }, // C#0
  { id: 'show', name: 'Show', fade: 5, note: { channel: CHANNEL, note: 14 } }, // D0
  { id: 'walk-out', name: 'Walk-out', fade: 3, note: { channel: CHANNEL, note: 15 } }, // D#0
];

// ---------------------------------------------------------------- Haze

// Levels are scaled by each Hazer's max output in the Venue Patch. Haze Off is
// built in; Clear is its slow, DAW-driven twin.
const HAZE_PRESETS: HazePreset[] = [
  { id: 'haze-light', name: 'Light', level: 0.25, fade: 8, note: { channel: CHANNEL, note: 16 } }, // E0
  { id: 'haze-medium', name: 'Medium', level: 0.5, fade: 8, note: { channel: CHANNEL, note: 17 } }, // F0
  { id: 'haze-heavy', name: 'Heavy', level: 0.8, fade: 8, note: { channel: CHANNEL, note: 18 } }, // F#0
  { id: 'haze-clear', name: 'Clear', level: 0, fade: 10, note: { channel: CHANNEL, note: 19 } }, // G0
];

// ---------------------------------------------------------------- Show

const RELEASES = [
  { note: 62, scene: 'move-down', about: 'Release Movement: aims return to Down, still' }, // D4
  { note: 84, scene: 'accent-pulse-1', about: 'Release Accents' }, // C6
];

const PANEL = [
  'base',
  'candle',
  'moon',
  'purple',
  'red',
  'shafts',
  'move-down',
  'hit-blinder',
  'hit-strobe',
];

export function paletteEntries(): Entry[] {
  return [BASE_LOOK, ...lookEntries(), ...movementEntries(), ...accentEntries(), ...hitEntries()];
}

export function paletteShow(): Show {
  const entries = paletteEntries();
  const trigger = (note: number, scene: string, mode: Trigger['mode']): Trigger => ({
    channel: CHANNEL,
    note,
    scene,
    mode,
  });
  return {
    layers: LAYERS,
    scenes: entries.map((e) => e.scene),
    triggers: [
      ...entries.map((e) => trigger(e.note, e.scene.id, e.mode)),
      ...RELEASES.map((r) => trigger(r.note, r.scene, 'release')),
    ].sort((a, b) => a.note - b.note),
    baseLook: BASE_LOOK.scene.id,
    panelScenes: PANEL,
    housePresets: HOUSE_PRESETS,
    hazePresets: HAZE_PRESETS,
  };
}

// ---------------------------------------------------------------- cue sheet

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// The app's naming: C4 = note 60.
export const noteName = (note: number): string =>
  `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;

function cueSheet(show: Show): string {
  const entries = paletteEntries();
  const layerName = (id: string) => LAYERS.find((l) => l.id === id)?.name ?? id;
  const mode = { go: 'Go', flash: 'Flash', release: 'Release' };
  const row = (
    note: number,
    name: string,
    layer: string,
    how: string,
    fade: string,
    about: string,
  ) => `| ${noteName(note)} | ${note} | ${name} | ${layer} | ${how} | ${fade} | ${about} |`;
  const rows = [
    ...entries.map((e) =>
      row(
        e.note,
        e.scene.name,
        layerName(e.scene.layer),
        mode[e.mode],
        `${e.scene.fadeIn}s`,
        e.about,
      ),
    ),
    ...RELEASES.map((r) => {
      const scene = show.scenes.find((s) => s.id === r.scene);
      return row(r.note, '—', layerName(scene?.layer ?? ''), 'Release', '', r.about);
    }),
    ...HOUSE_PRESETS.map((p) =>
      row(
        p.note?.note ?? 0,
        `House: ${p.name}`,
        'House',
        'Go',
        `${p.fade}s`,
        'House look set per venue',
      ),
    ),
    ...HAZE_PRESETS.map((p) =>
      row(
        p.note?.note ?? 0,
        `Haze: ${p.name}`,
        'Haze',
        'Go',
        `${p.fade}s`,
        `Every Hazer to ${Math.round(p.level * 100)}% of its max output`,
      ),
    ),
  ].sort((a, b) => Number(a.split('|')[2]) - Number(b.split('|')[2]));
  const panel = (show.panelScenes ?? [])
    .map((id, i) => `${i + 1}. ${show.scenes.find((s) => s.id === id)?.name ?? id}`)
    .join('\n');
  return `# ${SHOW_NAME}: cue sheet

Generated by \`npm run show:palette\` from \`scripts/make-shows/palette.ts\`. Do not edit; edit the script and re-run.

All Triggers are on MIDI channel ${CHANNEL}. C4 = note 60. Send MIDI Clock from the DAW for the Tempo.

## How the Layers combine

- **Look** sets colour and intensity. **Movement** sets aim and movement Effect only. **Accent** scales or recolours what the Look gives. **Hit** is Flash only: on while the note is held.
- Intensity is the highest any Layer gives. Colour, aim and Effects come from the Scene fired last.
- Fire a colour Accent *after* the Look: a Look fired later stops it.
- Rolls and hits restore what was under them on release. Blackout hit is a Flash on the Look Layer, so the Look returns on release.
- Releasing Movement returns every mover to Down. Releasing Accents stops their Effects.
- Scenes target Roles and Zones, so this Show runs in any venue. In a venue with no Blinder Fixtures, the Blinder hit uses the front-row overhead washes.

## Note map

| Note | # | Scene | Layer | Mode | Fade | What it does |
|---|---|---|---|---|---|---|
${rows.join('\n')}

## Fallback Panel (keys 1–9)

${panel}

## House Presets (Shift+1–3)

Set the house look for each one in the venue's Venue Patch, or the Venue Check reports it.

## Haze Presets (buttons in Perform and on the Fallback Panel, no keys)

Every Hazer goes to the level times its max output, set per Hazer in the Venue Patch. Haze Off is built in and has no note: it goes to 0 at once. Clear fades to 0 and is the DAW's way to take haze out. Haze starts off at launch.
`;
}

// The Show as saved by the app, indented so changes read well in a diff, and
// its cue sheet.
export function paletteFiles(): { show: string; cueSheet: string } {
  const show = paletteShow();
  return {
    show: `${JSON.stringify(JSON.parse(saveShowFile(show)), null, 2)}\n`,
    cueSheet: cueSheet(show),
  };
}
