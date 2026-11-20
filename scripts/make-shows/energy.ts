// The Energy Show: a venue-independent Show of about 156 Scenes, by tier, that
// the DAW sequences per Layer through MIDI notes on channels 1–5. Where the
// Palette Show is shy, this one stacks: a Look, a Movement, a Pulse and a
// Colour FX can all run at once, each on its own channel. Built with the app's
// own models and file format. `npm run show:energy` writes the Show and its
// cue sheet.
//
// Five Layers stack: Look (colour and intensity) → Movement (aim, movement
// Effect, and Move+FX combos) → Pulse (intensity Effects) → Colour FX (colour
// Effects) → Hit (Flash only). Edit the lists below and re-run the script.
import type { Role } from '../../src/shared/fixture-profile';
import {
  beatsText,
  type Colour,
  type Direction,
  type EffectLength,
  type EffectWidth,
  type HazePreset,
  type HousePreset,
  type IntensityShape,
  type Layer,
  type PrismSetting,
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

export const SHOW_NAME = 'Energy';

// One MIDI channel per Layer. House and Haze Presets are on channel 6.
const CH = { look: 1, movement: 2, pulse: 3, colourfx: 4, hit: 5, presets: 6 } as const;

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

// The parts of the rig a Scene targets, by name. The label is how the cue
// sheet says it.
const PARTS = {
  all: { label: 'everything', target: {} as RuleTarget },
  // Overhead washes: the Quads in the venue.
  quads: { label: 'Quads', target: target(['Wash'], zonesWhere('Overhead')) },
  // The Front row of overhead washes: the FOH Quads.
  front: { label: 'front Quads', target: target(['Wash'], zonesWhere('Overhead', ['Front'])) },
  // The upstage half of the overhead washes, for back light.
  back: {
    label: 'back Quads',
    target: target(['Wash'], zonesWhere('Overhead', ['Midstage', 'Upstage'])),
  },
  quadsSR: {
    label: 'SR Quads',
    target: target(['Wash'], zonesWhere('Overhead', ROWS, ['Stage Right'])),
  },
  // Floor washes and LED bars: the floor pars.
  floor: { label: 'floor', target: target(['Wash', 'Pixel/Bar'], zonesWhere('Floor')) },
  floorSR: {
    label: 'SR floor',
    target: target(['Wash', 'Pixel/Bar'], zonesWhere('Floor', ROWS, ['Stage Right'])),
  },
  beams: { label: 'beams', target: target(['Spot/Beam']) },
  // Effect Fixtures: the Mini Dekkers.
  fx: { label: 'Dekkers', target: target(['Effect']) },
  // Every wash and bar, overhead and floor. Beams keep the Look's colour.
  washes: { label: 'washes', target: target(['Wash', 'Pixel/Bar']) },
} as const;
type Part = keyof typeof PARTS;

// The moving Fixtures Movement Scenes aim: beams and the moving washes.
const MOVERS = target(['Spot/Beam', 'Wash']);
// Fixtures that hits flash: real blinders where a venue has them, and the
// front washes.
const BLINDERS = target(['Blinder', 'Strobe']);
// Whole sides and depths, every Fixture in the zones.
const side = (column: ZoneColumn): RuleTarget => ({
  zones: [...zonesWhere('Overhead', ROWS, [column]), ...zonesWhere('Floor', ROWS, [column])],
});
const depth = (rows: ZoneRow[]): RuleTarget => ({
  zones: [...zonesWhere('Overhead', rows), ...zonesWhere('Floor', rows)],
});

const swatch = (name: Swatch): Colour => ({ swatch: name });
const set = (t: RuleTarget, intensity: number, colour?: Swatch): Rule =>
  colour ? { target: t, intensity, colour: swatch(colour) } : { target: t, intensity };
const off = (t: RuleTarget): Rule => ({ target: t, intensity: 0 });

// ---------------------------------------------------------------- tiers

const TIERS = [
  { id: 'chill', name: 'Chill', base: 24 }, // C1–B2
  { id: 'groove', name: 'Groove', base: 48 }, // C3–B4
  { id: 'drive', name: 'Drive', base: 72 }, // C5–B6
  { id: 'peak', name: 'Peak', base: 96 }, // C7–B8
] as const;
type TierId = (typeof TIERS)[number]['id'];

// A Scene with its MIDI channel and note, how the note fires it and a line for
// the cue sheet.
interface Entry {
  scene: Scene;
  channel: number;
  note: number;
  mode: Trigger['mode'];
  about: string;
}

const LAYERS: Layer[] = [
  { id: 'look', name: 'Look' },
  { id: 'movement', name: 'Movement' },
  { id: 'pulse', name: 'Pulse' },
  { id: 'colourfx', name: 'Colour FX' },
  { id: 'hit', name: 'Hit' },
];

const pct = (v: number) => Math.round(v * 100);
const WIDTH_TEXT = new Map<EffectWidth, string>([
  [1 / 4, '1/4'],
  [1 / 3, '1/3'],
  [1 / 2, '1/2'],
]);

// ---------------------------------------------------------------- Looks

type LookRule = [Part, number, Swatch];
interface LookSpec {
  id: string;
  name: string;
  rules: LookRule[];
}

const lookRule = ([part, intensity, colour]: LookRule): Rule =>
  set(PARTS[part].target, intensity, colour);
const lookAbout = (rules: LookRule[]): string =>
  rules.map(([part, i, colour]) => `${PARTS[part].label} ${colour} ${pct(i)}`).join(', ');

// Seven Looks a tier. Beams use colours their colour wheel has, so nothing is
// approximated. Good Palette Looks carry over.
const LOOKS: Record<TierId, { fadeIn: number; looks: LookSpec[] }> = {
  chill: {
    fadeIn: 3,
    looks: [
      {
        id: 'candle',
        name: 'Candle',
        rules: [
          ['quads', 0.5, 'Warm White'],
          ['floor', 0.4, 'Amber'],
        ],
      },
      {
        id: 'glow',
        name: 'Glow',
        rules: [
          ['quads', 0.6, 'Amber'],
          ['floor', 0.5, 'Orange'],
          ['beams', 0.4, 'Warm White'],
        ],
      },
      {
        id: 'sunset',
        name: 'Sunset',
        rules: [
          ['quads', 0.6, 'Orange'],
          ['floor', 0.6, 'Red'],
          ['beams', 0.5, 'Amber'],
        ],
      },
      {
        id: 'moon',
        name: 'Moon',
        rules: [
          ['quads', 0.4, 'Blue'],
          ['front', 0.5, 'Lavender'],
          ['beams', 0.4, 'White'],
        ],
      },
      {
        id: 'ocean',
        name: 'Ocean',
        rules: [
          ['quads', 0.5, 'Cyan'],
          ['floor', 0.6, 'Blue'],
          ['beams', 0.5, 'Blue'],
        ],
      },
      {
        id: 'rose',
        name: 'Rose',
        rules: [
          ['quads', 0.5, 'Pink'],
          ['floor', 0.5, 'Amber'],
          ['beams', 0.4, 'Cyan'],
        ],
      },
      {
        id: 'teal',
        name: 'Teal',
        rules: [
          ['quads', 0.5, 'Cyan'],
          ['floor', 0.5, 'Green'],
          ['beams', 0.5, 'White'],
        ],
      },
    ],
  },
  groove: {
    fadeIn: 1,
    looks: [
      {
        id: 'purple',
        name: 'Purple',
        rules: [
          ['quads', 0.7, 'Magenta'],
          ['floor', 0.7, 'Blue'],
          ['beams', 0.7, 'Magenta'],
          ['fx', 0.6, 'Blue'],
        ],
      },
      {
        id: 'tropic',
        name: 'Tropic',
        rules: [
          ['quads', 0.7, 'Cyan'],
          ['floor', 0.7, 'Amber'],
          ['beams', 0.7, 'Amber'],
          ['fx', 0.6, 'Cyan'],
        ],
      },
      {
        id: 'forest',
        name: 'Forest',
        rules: [
          ['quads', 0.7, 'Green'],
          ['floor', 0.7, 'Blue'],
          ['beams', 0.7, 'Cyan'],
          ['fx', 0.6, 'Green'],
        ],
      },
      {
        id: 'dusk',
        name: 'Dusk',
        rules: [
          ['quads', 0.7, 'Orange'],
          ['floor', 0.7, 'Blue'],
          ['beams', 0.7, 'Blue'],
          ['fx', 0.6, 'Orange'],
        ],
      },
      {
        id: 'twilight',
        name: 'Twilight',
        rules: [
          ['quads', 0.7, 'Lavender'],
          ['floor', 0.7, 'Magenta'],
          ['beams', 0.7, 'Cyan'],
          ['fx', 0.6, 'Lavender'],
        ],
      },
      {
        id: 'candy',
        name: 'Candy',
        rules: [
          ['quads', 0.7, 'Pink'],
          ['floor', 0.7, 'Cyan'],
          ['beams', 0.7, 'White'],
          ['fx', 0.6, 'Pink'],
        ],
      },
      {
        id: 'brass',
        name: 'Brass',
        rules: [
          ['quads', 0.7, 'Amber'],
          ['floor', 0.7, 'Red'],
          ['beams', 0.7, 'Warm White'],
          ['fx', 0.6, 'Amber'],
        ],
      },
    ],
  },
  drive: {
    fadeIn: 0.5,
    looks: [
      {
        id: 'red-white',
        name: 'Red + white',
        rules: [
          ['quads', 1, 'Red'],
          ['floor', 1, 'Red'],
          ['beams', 1, 'White'],
          ['fx', 1, 'White'],
        ],
      },
      {
        id: 'split',
        name: 'Split',
        rules: [
          ['quads', 1, 'Magenta'],
          ['quadsSR', 1, 'Cyan'],
          ['floor', 1, 'Magenta'],
          ['floorSR', 1, 'Cyan'],
          ['beams', 1, 'White'],
          ['fx', 1, 'Magenta'],
        ],
      },
      {
        id: 'neon',
        name: 'Neon',
        rules: [
          ['quads', 1, 'Green'],
          ['floor', 1, 'Magenta'],
          ['beams', 1, 'Cyan'],
          ['fx', 1, 'Green'],
        ],
      },
      {
        id: 'ice',
        name: 'Ice',
        rules: [
          ['quads', 0.9, 'Cyan'],
          ['floor', 0.9, 'Blue'],
          ['beams', 1, 'White'],
          ['fx', 1, 'White'],
        ],
      },
      {
        id: 'fire',
        name: 'Fire',
        rules: [
          ['quads', 1, 'Orange'],
          ['floor', 1, 'Red'],
          ['beams', 1, 'Amber'],
          ['fx', 1, 'Red'],
        ],
      },
      {
        id: 'storm',
        name: 'Storm',
        rules: [
          ['quads', 0.9, 'Blue'],
          ['floor', 0.9, 'Magenta'],
          ['beams', 1, 'White'],
          ['fx', 1, 'Blue'],
        ],
      },
      {
        id: 'gold',
        name: 'Gold',
        rules: [
          ['quads', 1, 'Amber'],
          ['floor', 1, 'Orange'],
          ['beams', 1, 'Warm White'],
          ['fx', 1, 'Amber'],
        ],
      },
    ],
  },
  peak: {
    fadeIn: 0,
    looks: [
      {
        id: 'crowd',
        name: 'Crowd light',
        rules: [
          ['quads', 1, 'Warm White'],
          ['front', 1, 'White'],
          ['floor', 0.8, 'Warm White'],
          ['beams', 1, 'White'],
        ],
      },
      {
        id: 'open-white',
        name: 'Open white',
        rules: [
          ['quads', 1, 'White'],
          ['floor', 1, 'White'],
          ['beams', 1, 'White'],
          ['fx', 1, 'White'],
        ],
      },
      {
        id: 'red',
        name: 'Red',
        rules: [
          ['quads', 1, 'Red'],
          ['floor', 1, 'Red'],
          ['beams', 1, 'Red'],
          ['fx', 1, 'Red'],
        ],
      },
      {
        id: 'blue',
        name: 'Blue',
        rules: [
          ['quads', 1, 'Blue'],
          ['floor', 1, 'Blue'],
          ['beams', 1, 'Blue'],
          ['fx', 1, 'Blue'],
        ],
      },
      {
        id: 'magenta',
        name: 'Magenta',
        rules: [
          ['quads', 1, 'Magenta'],
          ['floor', 1, 'Magenta'],
          ['beams', 1, 'Magenta'],
          ['fx', 1, 'Magenta'],
        ],
      },
      {
        id: 'blast',
        name: 'Blast',
        rules: [
          ['quads', 1, 'White'],
          ['floor', 1, 'White'],
          ['beams', 1, 'White'],
          ['fx', 1, 'White'],
        ],
      },
      {
        id: 'rave',
        name: 'Rave',
        rules: [
          ['quads', 1, 'UV'],
          ['floor', 1, 'Blue'],
          ['beams', 1, 'Magenta'],
          ['fx', 1, 'UV'],
        ],
      },
    ],
  },
};

// Looks to use between the tiers: the Base Look, Intro/Outro, Breakdown and
// Dark, on notes 12–23 of the Look channel.
interface UtilitySpec extends LookSpec {
  note: number;
  group: string;
  fadeIn: number;
  about?: string;
}
const UTILITIES: UtilitySpec[] = [
  {
    id: 'base',
    name: 'Base: warm white',
    group: 'Base',
    note: 12,
    fadeIn: 1,
    rules: [
      ['quads', 0.8, 'Warm White'],
      ['floor', 0.5, 'Warm White'],
    ],
    about: 'Safe general wash: Quads warm white 80, floor warm white 50, beams off',
  },
  {
    id: 'walk-on',
    name: 'Walk-on',
    group: 'Intro/Outro',
    note: 13,
    fadeIn: 4,
    rules: [
      ['quads', 0.3, 'Blue'],
      ['beams', 0.3, 'White'],
    ],
    about: 'Quads blue 30, beams white 30, front dark',
  },
  {
    id: 'reveal',
    name: 'Reveal',
    group: 'Intro/Outro',
    note: 14,
    fadeIn: 4,
    rules: [
      ['quads', 0.3, 'Amber'],
      ['floor', 0.3, 'Amber'],
      ['front', 0.8, 'Warm White'],
    ],
    about: 'Front Quads warm white 80, the rest amber 30',
  },
  {
    id: 'fade',
    name: 'Fade',
    group: 'Intro/Outro',
    note: 15,
    fadeIn: 4,
    rules: [['quads', 0.3, 'Amber']],
    about: 'Quads amber 30, the rest off',
  },
  {
    id: 'bow',
    name: 'Bow',
    group: 'Intro/Outro',
    note: 16,
    fadeIn: 4,
    rules: [
      ['quads', 0.7, 'Warm White'],
      ['front', 1, 'White'],
    ],
    about: 'Front Quads white full, Quads warm white 70, beams off',
  },
  {
    id: 'uv',
    name: 'UV',
    group: 'Breakdown',
    note: 17,
    fadeIn: 1,
    rules: [
      ['quads', 0.3, 'UV'],
      ['beams', 0.3, 'Blue'],
    ],
  },
  {
    id: 'shafts',
    name: 'Shafts',
    group: 'Breakdown',
    note: 18,
    fadeIn: 1,
    rules: [['beams', 0.8, 'White']],
  },
  {
    id: 'silhouette',
    name: 'Silhouette',
    group: 'Breakdown',
    note: 19,
    fadeIn: 1,
    rules: [
      ['back', 0.7, 'Warm White'],
      ['floor', 0.7, 'Warm White'],
    ],
    about: 'Back Quads and floor warm white 70, front dark',
  },
  {
    id: 'floor',
    name: 'Floor',
    group: 'Breakdown',
    note: 20,
    fadeIn: 1,
    rules: [['floor', 0.6, 'Blue']],
  },
];

function lookEntries(): Entry[] {
  const utilities = UTILITIES.map(({ id, name, group, note, fadeIn, rules, about }) => ({
    scene: {
      id: id === 'base' ? 'base' : `look-${id}`,
      name: id === 'base' ? name : `${group}: ${name}`,
      tags: ['Look', 'Utility', group],
      layer: 'look',
      fadeIn,
      rules: rules.map(lookRule),
    },
    channel: CH.look,
    note,
    mode: 'go' as const,
    about: about ?? lookAbout(rules),
  }));
  const dark: Entry = {
    scene: {
      id: 'look-dark',
      name: 'Dark',
      tags: ['Look', 'Utility', 'Dark'],
      layer: 'look',
      fadeIn: 1,
      rules: [off({})],
    },
    channel: CH.look,
    note: 21,
    mode: 'go',
    about: 'Everything dark, held; fire another Look to bring light back',
  };
  const tiers = TIERS.flatMap(({ id: tier, name: tierName, base }) =>
    LOOKS[tier].looks.map(({ id, name, rules }, i) => ({
      scene: {
        id: `${tier}-look-${id}`,
        name: `${tierName}: ${name}`,
        tags: ['Look', tierName],
        layer: 'look',
        fadeIn: LOOKS[tier].fadeIn,
        rules: rules.map(lookRule),
      },
      channel: CH.look,
      note: base + i,
      mode: 'go' as const,
      about: lookAbout(rules),
    })),
  );
  return [...utilities, dark, ...tiers];
}

// ---------------------------------------------------------------- Movement

// A movement Effect, with an intensity Effect on the beams and an optional
// prism for a Move+FX combo.
interface MoveSpec {
  id: string;
  name: string;
  direction: Direction;
  effect?: {
    shape: 'Circle' | 'Pan sweep' | 'Tilt sweep' | 'Ballyhoo' | 'Fan' | 'Figure-8';
    size: number;
    length: EffectLength;
    spread: Spread;
  };
  fx?: PulseFx;
  prism?: PrismSetting;
}

interface PulseFx {
  shape: IntensityShape;
  depth: number;
  length: EffectLength;
  spread: Spread;
  width?: EffectWidth;
}

const fxText = ({ shape, depth, length, spread, width }: PulseFx): string =>
  `${shape} ${beatsText(length)}, depth ${depth}, ${spread}` +
  (width ? `, width ${WIDTH_TEXT.get(width)}` : '');

// Still and slow tiers aim the beams and the moving washes together; fast
// ones move the beams only and hold the washes Down, so the stage wash stays
// on the band. Four pure Scenes and three Move+FX combos a tier.
const MOVEMENT: Record<TierId, { fadeIn: number; fast: boolean; moves: MoveSpec[] }> = {
  chill: {
    fadeIn: 3,
    fast: false,
    moves: [
      { id: 'down', name: 'Down', direction: 'Down' },
      { id: 'audience', name: 'Audience', direction: 'Audience' },
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
        id: 'sway-breathe',
        name: 'Sway + breathe',
        direction: 'Down',
        effect: { shape: 'Pan sweep', size: 25, length: 16, spread: 'Mirrored' },
        fx: { shape: 'Pulse', depth: 0.3, length: 8, spread: 'Alternate' },
      },
      {
        id: 'bloom',
        name: 'Bloom',
        direction: 'Audience',
        effect: { shape: 'Fan', size: 25, length: 16, spread: 'In sync' },
        fx: { shape: 'Ramp down', depth: 0.3, length: 16, spread: 'In sync' },
      },
      {
        id: 'drift-glint',
        name: 'Drift + glint',
        direction: 'Down',
        effect: { shape: 'Circle', size: 12, length: 16, spread: 'Left→Right' },
        fx: { shape: 'Random', depth: 0.4, length: 4, spread: 'Random', width: 1 / 4 },
      },
    ],
  },
  groove: {
    fadeIn: 2,
    fast: false,
    moves: [
      { id: 'cross', name: 'Cross', direction: 'Cross' },
      {
        id: 'wave',
        name: 'Wave',
        direction: 'Down',
        effect: { shape: 'Pan sweep', size: 25, length: 4, spread: 'Left→Right' },
      },
      {
        id: 'fan',
        name: 'Fan',
        direction: 'Out',
        effect: { shape: 'Fan', size: 25, length: 8, spread: 'In sync' },
      },
      {
        id: 'figure-8',
        name: 'Figure-8',
        direction: 'Down',
        effect: { shape: 'Figure-8', size: 25, length: 8, spread: 'Mirrored' },
      },
      {
        id: 'wave-chase',
        name: 'Wave + chase',
        direction: 'Down',
        effect: { shape: 'Pan sweep', size: 25, length: 4, spread: 'Left→Right' },
        fx: { shape: 'Chase', depth: 1, length: 2, spread: 'Left→Right', width: 1 / 4 },
      },
      {
        id: 'fan-pulse',
        name: 'Fan + pulse',
        direction: 'Out',
        effect: { shape: 'Fan', size: 25, length: 8, spread: 'In sync' },
        fx: { shape: 'Pulse', depth: 0.5, length: 1, spread: 'In sync' },
      },
      {
        id: 'eight-random',
        name: 'Figure-8 + random',
        direction: 'Audience',
        effect: { shape: 'Figure-8', size: 25, length: 8, spread: 'Mirrored' },
        fx: { shape: 'Random', depth: 0.6, length: 1, spread: 'Random', width: 1 / 3 },
      },
    ],
  },
  drive: {
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
        effect: { shape: 'Circle', size: 12, length: 2, spread: 'Mirrored' },
      },
      {
        id: 'fan-fast',
        name: 'Fan fast',
        direction: 'Out',
        effect: { shape: 'Fan', size: 35, length: 4, spread: 'In sync' },
      },
      {
        id: 'ballyhoo-hit',
        name: 'Ballyhoo + square',
        direction: 'Down',
        effect: { shape: 'Ballyhoo', size: 25, length: 2, spread: 'Alternate' },
        fx: { shape: 'Square', depth: 1, length: 1, spread: 'Alternate' },
      },
      {
        id: 'fan-chase',
        name: 'Fan + chase',
        direction: 'Out',
        effect: { shape: 'Fan', size: 35, length: 4, spread: 'In sync' },
        fx: { shape: 'Chase', depth: 1, length: 1, spread: 'Mirrored', width: 1 / 2 },
      },
      {
        id: 'spin-random',
        name: 'Spin + random',
        direction: 'Centre',
        effect: { shape: 'Circle', size: 12, length: 2, spread: 'Mirrored' },
        fx: { shape: 'Random', depth: 1, length: 0.5, spread: 'Random', width: 1 / 3 },
      },
    ],
  },
  peak: {
    fadeIn: 0.5,
    fast: true,
    moves: [
      {
        id: 'crowd-sweep',
        name: 'Crowd sweep',
        direction: 'Audience',
        effect: { shape: 'Pan sweep', size: 45, length: 4, spread: 'In sync' },
      },
      {
        id: 'anthem-fan',
        name: 'Anthem fan',
        direction: 'Audience',
        effect: { shape: 'Fan', size: 45, length: 8, spread: 'In sync' },
      },
      {
        id: 'wide-out',
        name: 'Wide out',
        direction: 'Out',
        effect: { shape: 'Pan sweep', size: 45, length: 8, spread: 'Mirrored' },
      },
      {
        id: 'spin-fast',
        name: 'Spin fast',
        direction: 'Centre',
        effect: { shape: 'Circle', size: 12, length: 1, spread: 'Mirrored' },
      },
      {
        id: 'anthem-prism',
        name: 'Anthem fan + prism',
        direction: 'Audience',
        effect: { shape: 'Fan', size: 45, length: 8, spread: 'In sync' },
        fx: { shape: 'Pulse', depth: 0.5, length: 1, spread: 'In sync' },
        prism: 'Rotate slow',
      },
      {
        id: 'crowd-prism',
        name: 'Crowd sweep + prism',
        direction: 'Audience',
        effect: { shape: 'Pan sweep', size: 45, length: 4, spread: 'In sync' },
        fx: { shape: 'Square', depth: 1, length: 0.5, spread: 'Alternate' },
        prism: 'On',
      },
      {
        id: 'eight-storm',
        name: 'Figure-8 + random',
        direction: 'Audience',
        effect: { shape: 'Figure-8', size: 35, length: 4, spread: 'Mirrored' },
        fx: { shape: 'Random', depth: 1, length: 0.25, spread: 'Random', width: 1 / 2 },
      },
    ],
  },
};

function movementEntries(): Entry[] {
  return TIERS.flatMap(({ id: tier, name: tierName, base }) => {
    const { fadeIn, fast, moves } = MOVEMENT[tier];
    return moves.map(({ id, name, direction, effect, fx, prism }, i) => {
      const movementEffect = effect ?? ('None' as const);
      const beams: Rule = {
        target: PARTS.beams.target,
        direction,
        movementEffect,
        ...(fx ? { intensityEffect: fx } : {}),
        ...(prism ? { prism } : {}),
      };
      const rules: Rule[] = fast
        ? [{ target: target(['Wash']), direction: 'Down', movementEffect: 'None' }, beams]
        : [{ ...beams, target: MOVERS }];
      const aim = effect
        ? `${effect.shape} ${beatsText(effect.length)}, ${effect.size}°, ${effect.spread}, around ${direction}`
        : `Beams and washes aim ${direction}, still`;
      const about =
        aim +
        (fx ? `; beams also ${fxText(fx)}` : '') +
        (prism ? `; prism ${prism}` : '') +
        (fast ? '; beams only, washes Down' : '');
      return {
        scene: {
          id: `${tier}-move-${id}`,
          name: `${tierName}: ${name}`,
          tags: ['Movement', tierName, ...(fx ? ['Move+FX'] : [])],
          layer: 'movement',
          fadeIn,
          rules,
        },
        channel: CH.movement,
        note: base + i,
        mode: 'go' as const,
        about,
      };
    });
  });
}

// ---------------------------------------------------------------- Pulse

// Intensity Effects scale whatever the Look gives. Nine a tier, by target:
// beams, Quads, floor, Dekkers, front and back. Chill breathes, Peak is
// fast and wide.
type PulseSpec = [id: string, name: string, part: Part, fx: PulseFx];
const p = (
  id: string,
  name: string,
  part: Part,
  shape: IntensityShape,
  depth: number,
  length: EffectLength,
  spread: Spread,
  width?: EffectWidth,
): PulseSpec => [id, name, part, { shape, depth, length, spread, ...(width ? { width } : {}) }];

const PULSES: Record<TierId, PulseSpec[]> = {
  chill: [
    p('quads-breathe', 'Quads breathe', 'quads', 'Pulse', 0.3, 8, 'In sync'),
    p('beams-breathe', 'Beams breathe', 'beams', 'Pulse', 0.4, 8, 'Alternate'),
    p('floor-swell', 'Floor swell', 'floor', 'Pulse', 0.3, 4, 'In sync'),
    p('dekker-glint', 'Dekker glint', 'fx', 'Random', 0.5, 4, 'Random', 1 / 4),
    p('front-back', 'Front→back wash', 'quads', 'Chase', 0.5, 8, 'Front→Back', 1 / 3),
    p('back-front', 'Back→front wash', 'quads', 'Chase', 0.5, 8, 'Back→Front', 1 / 3),
    p('all-slow', 'All slow pulse', 'all', 'Pulse', 0.25, 16, 'In sync'),
    p('build-16', 'Build 16b', 'all', 'Ramp up', 0.5, 16, 'In sync'),
    p('fade-16', 'Fade 16b', 'all', 'Ramp down', 0.4, 16, 'In sync'),
  ],
  groove: [
    p('all-pulse', 'All pulse 1b', 'all', 'Pulse', 0.5, 1, 'In sync'),
    p('quads-front-back', 'Quads front→back', 'quads', 'Pulse', 0.6, 1, 'Front→Back'),
    p('beams-chase', 'Beams chase L>R', 'beams', 'Chase', 1, 2, 'Left→Right', 1 / 4),
    p('floor-chase', 'Floor chase mirror', 'floor', 'Chase', 1, 2, 'Mirrored', 1 / 3),
    p('dekker-square', 'Dekker flip', 'fx', 'Square', 1, 1, 'Alternate'),
    p('front-pulse', 'Front pulse', 'front', 'Pulse', 0.6, 1, 'In sync'),
    p('back-pulse', 'Back pulse', 'back', 'Pulse', 0.6, 1, 'In sync'),
    p('random-third', 'Random third', 'all', 'Random', 0.6, 1, 'Random', 1 / 3),
    p('build-8', 'Build 8b', 'all', 'Ramp up', 1, 8, 'In sync'),
  ],
  drive: [
    p('all-half', 'All pulse 1/2b', 'all', 'Pulse', 0.6, 0.5, 'Alternate'),
    p('beams-chase', 'Beams chase', 'beams', 'Chase', 1, 1, 'Left→Right', 1 / 4),
    p('quads-chase', 'Quads front→back', 'quads', 'Chase', 1, 1, 'Front→Back', 1 / 3),
    p('floor-chase', 'Floor edges→centre', 'floor', 'Chase', 1, 1, 'Edges→Centre', 1 / 2),
    p('dekker-random', 'Dekker random', 'fx', 'Random', 1, 0.5, 'Random', 1 / 2),
    p('beams-random', 'Beams random', 'beams', 'Random', 1, 0.5, 'Random', 1 / 3),
    p('front-square', 'Front square', 'front', 'Square', 1, 0.5, 'In sync'),
    p('back-square', 'Back square', 'back', 'Square', 1, 0.5, 'In sync'),
    p('all-chase-rl', 'All chase R>L', 'all', 'Chase', 1, 1, 'Right→Left', 1 / 4),
  ],
  peak: [
    p('all-quarter', 'All square 1/4b', 'all', 'Square', 0.7, 0.25, 'In sync'),
    p('beams-chase', 'Beams chase wide', 'beams', 'Chase', 1, 0.5, 'Mirrored', 1 / 2),
    p('quads-random', 'Quads random', 'quads', 'Random', 1, 0.25, 'Random', 1 / 2),
    p('floor-square', 'Floor square', 'floor', 'Square', 1, 0.5, 'Alternate'),
    p('dekker-square', 'Dekker strobe-ish', 'fx', 'Square', 1, 0.25, 'Alternate'),
    p('quads-sweep', 'Quads sweep', 'quads', 'Chase', 1, 1, 'Front→Back', 1 / 2),
    p('all-build-4', 'Build 4b', 'all', 'Ramp up', 1, 4, 'In sync'),
    p('all-build-8', 'Build 8b', 'all', 'Ramp up', 1, 8, 'In sync'),
    p('all-pulse', 'All pulse 1b', 'all', 'Pulse', 0.7, 1, 'In sync'),
  ],
};

function pulseEntries(): Entry[] {
  return TIERS.flatMap(({ id: tier, name: tierName, base }) =>
    PULSES[tier].map(([id, name, part, fx], i) => ({
      scene: {
        id: `${tier}-pulse-${id}`,
        name: `${tierName}: ${name}`,
        tags: ['Pulse', tierName],
        layer: 'pulse',
        fadeIn: 0.5,
        rules: [{ target: PARTS[part].target, intensityEffect: fx }],
      },
      channel: CH.pulse,
      note: base + i,
      mode: 'go' as const,
      about: `${PARTS[part].label}: ${fxText(fx)}`,
    })),
  );
}

// ---------------------------------------------------------------- Colour FX

// Colour Effects replace the colour of what they target. Six a tier. A Look
// fired later stops them, so fire Colour FX after the Look.
type ColourFxSpec = [
  id: string,
  name: string,
  part: Part,
  shape: 'Step' | 'Fade' | 'Rainbow',
  length: EffectLength,
  spread: Spread,
  colours?: Swatch[],
];

const COLOUR_FX: Record<TierId, ColourFxSpec[]> = {
  chill: [
    ['drift-warm', 'Drift warm', 'washes', 'Fade', 16, 'Left→Right', ['Amber', 'Orange', 'Pink']],
    ['drift-cool', 'Drift cool', 'quads', 'Fade', 16, 'Front→Back', ['Blue', 'Cyan', 'Lavender']],
    ['floor-drift', 'Floor drift', 'floor', 'Fade', 16, 'Mirrored', ['Amber', 'Red']],
    ['beam-drift', 'Beam drift', 'beams', 'Fade', 16, 'Left→Right', ['Blue', 'Cyan']],
    ['dekker-glow', 'Dekker glow', 'fx', 'Fade', 8, 'Alternate', ['Amber', 'Orange']],
    ['rainbow-slow', 'Rainbow slow', 'washes', 'Rainbow', 16, 'Left→Right'],
  ],
  groove: [
    [
      'step-blue-magenta',
      'Step blue/magenta',
      'washes',
      'Step',
      1,
      'Alternate',
      ['Blue', 'Magenta'],
    ],
    ['quads-fade', 'Quads cyan/magenta', 'quads', 'Fade', 8, 'Front→Back', ['Cyan', 'Magenta']],
    ['floor-step', 'Floor amber/blue', 'floor', 'Step', 2, 'Alternate', ['Amber', 'Blue']],
    ['beams-step', 'Beams cyan/magenta', 'beams', 'Step', 2, 'Left→Right', ['Cyan', 'Magenta']],
    ['dekker-step', 'Dekker blue/green', 'fx', 'Step', 1, 'Alternate', ['Blue', 'Green']],
    ['rainbow', 'Rainbow 8b', 'washes', 'Rainbow', 8, 'Left→Right'],
  ],
  drive: [
    ['step-red-white', 'Step red/white', 'washes', 'Step', 1, 'Alternate', ['Red', 'White']],
    ['quads-step', 'Quads magenta/cyan', 'quads', 'Step', 0.5, 'Alternate', ['Magenta', 'Cyan']],
    ['floor-step', 'Floor blue/amber', 'floor', 'Step', 0.5, 'Random', ['Blue', 'Amber']],
    ['beams-step', 'Beams red/blue', 'beams', 'Step', 1, 'Mirrored', ['Red', 'Blue']],
    ['dekker-step', 'Dekker green/magenta', 'fx', 'Step', 0.5, 'Alternate', ['Green', 'Magenta']],
    ['rainbow', 'Rainbow 4b', 'washes', 'Rainbow', 4, 'Back→Front'],
  ],
  peak: [
    ['step-red-white', 'Step red/white', 'washes', 'Step', 0.5, 'Alternate', ['Red', 'White']],
    ['quads-step', 'Quads white/blue', 'quads', 'Step', 0.5, 'Front→Back', ['White', 'Blue']],
    ['floor-step', 'Floor magenta/cyan', 'floor', 'Step', 0.5, 'Alternate', ['Magenta', 'Cyan']],
    ['beams-step', 'Beams red/white', 'beams', 'Step', 0.5, 'Random', ['Red', 'White']],
    ['dekker-step', 'Dekker UV/white', 'fx', 'Step', 0.25, 'Alternate', ['UV', 'White']],
    ['rainbow', 'Rainbow 2b', 'washes', 'Rainbow', 2, 'Edges→Centre'],
  ],
};

function colourFxEntries(): Entry[] {
  return TIERS.flatMap(({ id: tier, name: tierName, base }) =>
    COLOUR_FX[tier].map(([id, name, part, shape, length, spread, colours], i) => ({
      scene: {
        id: `${tier}-colourfx-${id}`,
        name: `${tierName}: ${name}`,
        tags: ['Colour FX', tierName],
        layer: 'colourfx',
        fadeIn: 0.5,
        rules: [
          {
            target: PARTS[part].target,
            colourEffect:
              shape === 'Rainbow'
                ? { shape, length, spread }
                : { shape, colours: (colours ?? []).map(swatch), length, spread },
          },
        ],
      },
      channel: CH.colourfx,
      note: base + i,
      mode: 'go' as const,
      about:
        `${PARTS[part].label}: ${shape} ${beatsText(length)}, ${spread}` +
        (colours ? `, ${colours.join(' → ')}` : ''),
    })),
  );
}

// ---------------------------------------------------------------- Hits

// Flash: on while the note is held, so the DAW note length is the hit or roll
// length. Grouped by kind on channel 5. The Blackout hit is on the Look Layer:
// intensity is the highest any Layer gives, so only replacing the Look can
// take it to 0.
interface HitSpec {
  id: string;
  name: string;
  about: string;
  rules: Rule[];
  layer?: string;
}

const hit = (id: string, name: string, about: string, rules: Rule[], layer?: string): HitSpec => ({
  id,
  name,
  about,
  rules,
  layer,
});
const rollHit = (beats: EffectLength, spread: Spread): HitSpec => {
  const label = beats === 1 ? '1b' : beats === 0.5 ? '1/2b' : '1/4b';
  return hit(
    `roll-${beats === 1 ? '1' : beats === 0.5 ? 'half' : 'quarter'}`,
    `Roll ${label}`,
    `Square every ${beatsText(beats)}, depth 1, ${spread}; for drum rolls`,
    [{ target: {}, intensityEffect: { shape: 'Square', depth: 1, length: beats, spread } }],
  );
};
const punch = (id: string, name: string, part: Part): HitSpec =>
  hit(id, name, `${PARTS[part].label} white, full`, [set(PARTS[part].target, 1, 'White')]);
const sideHit = (id: string, name: string, about: string, t: RuleTarget): HitSpec =>
  hit(id, name, `${about}, white, full`, [set(t, 1, 'White')]);
const colourHit = (colour: Swatch): HitSpec =>
  hit(
    `colour-${colour.toLowerCase()}`,
    `Colour ${colour.toLowerCase()}`,
    `Everything ${colour}, full`,
    [set({}, 1, colour)],
  );
const strobe: Rule = { ...set({}, 1, 'White'), strobe: 'Fast' };

const HIT_GROUPS: { name: string; base: number; hits: HitSpec[] }[] = [
  {
    name: 'Core',
    base: 24, // C1
    hits: [
      hit('blinder', 'Blinder', 'Blinders and front Quads white, full', [
        set(BLINDERS, 1, 'White'),
        set(PARTS.front.target, 1, 'White'),
      ]),
      hit('beam-punch', 'Beam punch', 'Beams aim Audience, white, full, still', [
        {
          target: PARTS.beams.target,
          intensity: 1,
          colour: swatch('White'),
          direction: 'Audience',
          movementEffect: 'None',
        },
      ]),
      hit('full-white', 'Full white', 'Everything white, full', [set({}, 1, 'White')]),
      colourHit('Red'),
      hit(
        'blackout',
        'Blackout',
        'Everything dark while held (Look Layer); the Look returns on release',
        [off({})],
        'look',
      ),
      hit('strobe', 'Strobe', 'Everything white, full, Fast strobe (12 Hz)', [strobe]),
      rollHit(1, 'Alternate'),
      rollHit(0.5, 'Alternate'),
      rollHit(0.25, 'In sync'),
      hit('riser', 'Riser', 'Ramp up every 4 beats, beams converge Centre', [
        {
          target: {},
          intensityEffect: { shape: 'Ramp up', depth: 1, length: 4, spread: 'In sync' },
        },
        { target: PARTS.beams.target, direction: 'Centre', movementEffect: 'None' },
      ]),
      hit('beam-strobe', 'Beam strobe', 'Beams white, full, Fast strobe', [
        { ...set(PARTS.beams.target, 1, 'White'), strobe: 'Fast' },
      ]),
      hit('quad-strobe', 'Quad strobe', 'Quads white, full, Fast strobe', [
        { ...set(PARTS.quads.target, 1, 'White'), strobe: 'Fast' },
      ]),
    ],
  },
  {
    name: 'Target punches',
    base: 48, // C3
    hits: [
      punch('punch-beams', 'Punch beams', 'beams'),
      punch('punch-quads', 'Punch Quads', 'quads'),
      punch('punch-floor', 'Punch floor', 'floor'),
      punch('punch-dekkers', 'Punch Dekkers', 'fx'),
    ],
  },
  {
    name: 'Side and depth',
    base: 60, // C4
    hits: [
      sideHit('side-sl', 'Side SL', 'Stage Left, every Fixture', side('Stage Left')),
      sideHit('side-sr', 'Side SR', 'Stage Right, every Fixture', side('Stage Right')),
      sideHit('front', 'Front', 'Front row, every Fixture', depth(['Front'])),
      sideHit(
        'back',
        'Back',
        'Midstage and upstage, every Fixture',
        depth(['Midstage', 'Upstage']),
      ),
    ],
  },
  {
    name: 'Colour',
    base: 72, // C5
    hits: (['Amber', 'Orange', 'Magenta', 'Blue', 'Cyan', 'Green'] as const).map(colourHit),
  },
  {
    name: 'Prism and Gobo',
    base: 96, // C7
    hits: [
      hit(
        'prism-audience',
        'Prism audience',
        'Beams white, full, aim Audience, prism Rotate fast',
        [
          {
            target: PARTS.beams.target,
            intensity: 1,
            colour: swatch('White'),
            direction: 'Audience',
            movementEffect: 'None',
            prism: 'Rotate fast',
          },
        ],
      ),
      hit('prism-burst', 'Prism burst', 'Beams white, full, prism On', [
        { ...set(PARTS.beams.target, 1, 'White'), prism: 'On' },
      ]),
      hit('gobo-beams', 'Gobo beams', 'Beams white, full, on a gobo', [
        { ...set(PARTS.beams.target, 1, 'White'), gobo: 'Gobo' },
      ]),
      hit('gobo-prism', 'Gobo + prism', 'Beams white, full, on a gobo, prism Rotate slow', [
        { ...set(PARTS.beams.target, 1, 'White'), gobo: 'Gobo', prism: 'Rotate slow' },
      ]),
    ],
  },
];

function hitEntries(): Entry[] {
  return HIT_GROUPS.flatMap(({ base, hits }) =>
    hits.map(({ id, name, about, rules, layer }, i) => ({
      scene: {
        id: `hit-${id}`,
        name: `Hit: ${name}`,
        tags: ['Hit'],
        layer: layer ?? 'hit',
        fadeIn: 0,
        rules,
      },
      channel: CH.hit,
      note: base + i,
      mode: 'flash' as const,
      about,
    })),
  );
}

// ---------------------------------------------------------------- Presets

// The house looks for these are set per venue, in the Venue Patch.
const HOUSE_PRESETS: HousePreset[] = [
  { id: 'walk-in', name: 'Walk-in', fade: 3, note: { channel: CH.presets, note: 12 } },
  { id: 'show', name: 'Show', fade: 5, note: { channel: CH.presets, note: 13 } },
  { id: 'walk-out', name: 'Walk-out', fade: 3, note: { channel: CH.presets, note: 14 } },
];

// Levels are scaled by each Hazer's max output in the Venue Patch. Haze Off is
// built in; Clear is its slow, DAW-driven twin.
const HAZE_PRESETS: HazePreset[] = [
  {
    id: 'haze-light',
    name: 'Light',
    level: 0.25,
    fade: 8,
    note: { channel: CH.presets, note: 16 },
  },
  {
    id: 'haze-medium',
    name: 'Medium',
    level: 0.5,
    fade: 8,
    note: { channel: CH.presets, note: 17 },
  },
  { id: 'haze-heavy', name: 'Heavy', level: 0.8, fade: 8, note: { channel: CH.presets, note: 18 } },
  { id: 'haze-clear', name: 'Clear', level: 0, fade: 10, note: { channel: CH.presets, note: 19 } },
];

// ---------------------------------------------------------------- Show

// Note 0 of each Layer's channel releases that Layer. Release works on any
// Scene of the Layer.
const RELEASES = [
  { channel: CH.look, scene: 'base', about: 'Release Look: back to the Base Look' },
  {
    channel: CH.movement,
    scene: 'chill-move-down',
    about: 'Release Movement: aims return to Down, still',
  },
  {
    channel: CH.pulse,
    scene: 'chill-pulse-all-slow',
    about: 'Release Pulse: intensity Effects stop',
  },
  {
    channel: CH.colourfx,
    scene: 'chill-colourfx-rainbow-slow',
    about: 'Release Colour FX: colours return to the Look',
  },
  { channel: CH.hit, scene: 'hit-blinder', about: 'Release Hit: stop any held hit' },
];

const PANEL = [
  'base',
  'chill-look-candle',
  'groove-look-purple',
  'drive-look-red-white',
  'peak-look-crowd',
  'chill-move-down',
  'hit-blinder',
  'hit-strobe',
];

export function energyEntries(): Entry[] {
  return [
    ...lookEntries(),
    ...movementEntries(),
    ...pulseEntries(),
    ...colourFxEntries(),
    ...hitEntries(),
  ];
}

export function energyShow(): Show {
  const entries = energyEntries();
  const trigger = (
    channel: number,
    note: number,
    scene: string,
    mode: Trigger['mode'],
  ): Trigger => ({
    channel,
    note,
    scene,
    mode,
  });
  return {
    layers: LAYERS,
    scenes: entries.map((e) => e.scene),
    triggers: [
      ...entries.map((e) => trigger(e.channel, e.note, e.scene.id, e.mode)),
      ...RELEASES.map((r) => trigger(r.channel, 0, r.scene, 'release')),
    ].sort((a, b) => a.channel - b.channel || a.note - b.note),
    baseLook: 'base',
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
  const entries = energyEntries();
  const mode = { go: 'Go', flash: 'Flash', release: 'Release' };
  const row = (note: number, name: string, how: string, fade: string, about: string) =>
    `| ${noteName(note)} | ${note} | ${name} | ${how} | ${fade} | ${about} |`;
  const header = '| Note | # | Scene | Mode | Fade | What it does |\n|---|---|---|---|---|---|';
  const channelTable = (channel: number): string => {
    const rows = [
      ...entries
        .filter((e) => e.channel === channel)
        .map((e) => ({
          note: e.note,
          line: row(e.note, e.scene.name, mode[e.mode], `${e.scene.fadeIn}s`, e.about),
        })),
      ...RELEASES.filter((r) => r.channel === channel).map((r) => ({
        note: 0,
        line: row(0, '—', 'Release', '', r.about),
      })),
    ].sort((a, b) => a.note - b.note);
    return `${header}\n${rows.map((r) => r.line).join('\n')}`;
  };
  const presetTable = [
    ...HOUSE_PRESETS.map((p) =>
      row(p.note?.note ?? 0, `House: ${p.name}`, 'Go', `${p.fade}s`, 'House look set per venue'),
    ),
    ...HAZE_PRESETS.map((p) =>
      row(
        p.note?.note ?? 0,
        `Haze: ${p.name}`,
        'Go',
        `${p.fade}s`,
        `Every Hazer to ${Math.round(p.level * 100)}% of its max output`,
      ),
    ),
  ];
  const layerSection = (channel: number, title: string, intro: string) =>
    `### Channel ${channel}: ${title}\n\n${intro}\n\n${channelTable(channel)}`;
  const panel = (show.panelScenes ?? [])
    .map((id, i) => `${i + 1}. ${show.scenes.find((s) => s.id === id)?.name ?? id}`)
    .join('\n');
  const tiers = TIERS.map(
    ({ name, base }) =>
      `| ${name} | ${noteName(base)}–${noteName(base + 23)} | ${base}–${base + 23} |`,
  ).join('\n');
  return `# ${SHOW_NAME}: cue sheet

Generated by \`npm run show:energy\` from \`scripts/make-shows/energy.ts\`. Do not edit; edit the script and re-run.

${show.scenes.length} Scenes on MIDI channels 1–5, one per Layer, plus House and Haze Presets on channel 6. C4 = note 60. Send MIDI Clock from the DAW for the Tempo.

## Tier guide

Channels 1–4 use two octaves per tier. Notes 0–11 release the channel's Layer; notes 12–23 on channel 1 are utilities (Base, Intro/Outro, Breakdown, Dark).

| Tier | Notes | # | Use |
|---|---|---|---|
${tiers
  .split('\n')
  .map(
    (l, i) =>
      `${l} ${['Quiet verses, intros and ballads: slow fades, warm and cool washes, gentle breathing.', 'Mid-energy verses and pre-choruses: steady beat, wave, fan and Figure-8.', 'Choruses and drops: saturated colour, fast chases, Random, fast Fan.', 'Last chorus, big moments and anthems: crowd light, open white, wide sweeps with Fan and Prism.'][i]} |`,
  )
  .join('\n')}

Peak also holds the anthem material.

## How the Layers combine

Five Layers stack, one per MIDI channel. Each holds one Scene at a time, so a Look, a Movement, a Pulse and a Colour FX can all run together.

- **Look** (ch 1) sets colour and intensity. **Movement** (ch 2) sets aim and a movement Effect, and the Move+FX combos add an intensity Effect on the beams. **Pulse** (ch 3) scales intensity with Effects: pulses, chases, builds, Random. **Colour FX** (ch 4) replaces colour with steps, fades or Rainbow. **Hit** (ch 5) is Flash only: on while the note is held.
- Intensity is the highest any Layer gives. Colour, aim and Effects come from the Scene fired last.
- Fire Colour FX *after* the Look: a Look fired later stops it.
- Hits restore what was under them on release. Blackout is a Flash on the Look Layer, so the Look returns on release.
- Releasing Movement returns every mover to Down. Releasing Pulse or Colour FX stops their Effects.
- Pulse and Colour FX Scenes target one part of the rig: beams, Quads, floor, Dekkers, front or back. Stack one of each part for a layered chase.
- Scenes target Roles and Zones, so this Show runs in any venue. In a venue with no Blinder Fixtures, the Blinder hit uses the front-row overhead washes.
- Prism and Gobo are on the beams only, and a Fixture with no prism or gobo wheel stays as it is.

## Note map

${layerSection(CH.look, 'Look', 'Tiers on C1–B8, utilities on C0–A0 (notes 12–21).')}

${layerSection(CH.movement, 'Movement', 'Four pure Scenes and three Move+FX combos per tier. Chill has Down at C1 for a return to still.')}

${layerSection(CH.pulse, 'Pulse', 'Nine per tier, by target.')}

${layerSection(CH.colourfx, 'Colour FX', 'Six per tier, by target.')}

${layerSection(CH.hit, 'Hit', 'Grouped by kind: Core C1–B1, Target punches C3–D#3, Side and depth C4–D#4, Colour C5–F5, Prism and Gobo C7–D#7.')}

### Channel ${CH.presets}: House and Haze

Set the house look for each House Preset in the venue's Venue Patch, or the Venue Check reports it. Haze Off is built in and has no note. Clear fades to 0 and is the DAW's way to take haze out. Haze starts off at launch.

${header}
${presetTable.join('\n')}

## Fallback Panel (keys 1–9)

${panel}
`;
}

// The Show as saved by the app, indented so changes read well in a diff, and
// its cue sheet.
export function energyFiles(): { show: string; cueSheet: string } {
  const show = energyShow();
  return {
    show: `${JSON.stringify(JSON.parse(saveShowFile(show)), null, 2)}\n`,
    cueSheet: cueSheet(show),
  };
}
