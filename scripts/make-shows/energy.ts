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
// A swatch name or a custom hue and saturation.
type Tint = Swatch | Colour;
const tint = (c: Tint): Colour => (typeof c === 'string' ? swatch(c) : c);
const tintText = (c: Tint): string =>
  typeof c === 'string'
    ? c
    : 'swatch' in c
      ? c.swatch
      : 'kelvin' in c
        ? `${c.kelvin} K`
        : (TINT_NAMES.get(`${c.hue}/${c.saturation}`) ?? `${c.hue}°`);
const set = (t: RuleTarget, intensity: number, colour?: Tint): Rule =>
  colour ? { target: t, intensity, colour: tint(colour) } : { target: t, intensity };

// The palette's custom colours. Beams cannot make these, so they use swatches.
const PETROL: Colour = { hue: 192, saturation: 1 };
const PETROL_DEEP: Colour = { hue: 194, saturation: 1 };
const PETROL_PALE: Colour = { hue: 186, saturation: 0.72 };
const CRIMSON: Colour = { hue: 352, saturation: 1 };
const RUST: Colour = { hue: 18, saturation: 0.85 };
const BRASS: Colour = { hue: 30, saturation: 0.9 };
const RUST_ORANGE: Colour = { hue: 22, saturation: 0.9 };
const TINT_NAMES = new Map<string, string>([
  ['192/1', 'petrol'],
  ['194/1', 'deep petrol'],
  ['186/0.72', 'pale petrol'],
  ['352/1', 'crimson'],
  ['18/0.85', 'rust'],
  ['30/0.9', 'brass'],
  ['22/0.9', 'rust orange'],
]);
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

type LookRule = [Part, number, Tint];
interface LookSpec {
  id: string;
  name: string;
  rules: LookRule[];
}

const lookRule = ([part, intensity, colour]: LookRule): Rule =>
  set(PARTS[part].target, intensity, colour);
const lookAbout = (rules: LookRule[]): string =>
  rules.map(([part, i, colour]) => `${PARTS[part].label} ${tintText(colour)} ${pct(i)}`).join(', ');

// Seven palettes, one Look each per tier. Washes, floor and Dekkers use the
// palette's own colours, petrol and rust included. Beams use swatches their
// colour wheel has, so nothing is approximated. The numbers are the intensity
// at Peak; the tier scales them.
const PALETTES: LookSpec[] = [
  {
    id: 'red-wall',
    name: 'Red Wall',
    rules: [
      ['quads', 0.95, 'Red'],
      ['floor', 0.9, CRIMSON],
      ['beams', 1, 'Red'],
      ['fx', 0.9, 'Red'],
    ],
  },
  {
    id: 'red-pop',
    name: 'Red Pop',
    rules: [
      ['quads', 1, 'Red'],
      ['floor', 1, 'Amber'],
      ['beams', 1, 'Amber'],
      ['fx', 1, 'Amber'],
    ],
  },
  {
    id: 'rust',
    name: 'Rust',
    rules: [
      ['quads', 0.8, RUST],
      ['floor', 0.75, BRASS],
      ['beams', 1, 'Warm White'],
      ['fx', 0.75, RUST_ORANGE],
    ],
  },
  {
    id: 'petrol-amber',
    name: 'Petrol and Amber',
    rules: [
      ['quads', 0.8, PETROL],
      ['floor', 0.8, 'Amber'],
      ['beams', 1, 'Amber'],
      ['fx', 0.75, 'Orange'],
    ],
  },
  {
    id: 'two-tone',
    name: 'Two Tone',
    rules: [
      ['quads', 0.9, PETROL],
      ['floor', 0.95, 'Red'],
      ['beams', 1, 'Red'],
      ['fx', 0.9, PETROL],
    ],
  },
  {
    id: 'silhouette',
    name: 'Silhouette',
    rules: [
      ['back', 0.7, PETROL],
      ['floor', 0.2, PETROL_DEEP],
      ['beams', 0.8, 'White'],
      ['fx', 0.5, PETROL],
    ],
  },
  {
    id: 'breakdown',
    name: 'Breakdown',
    rules: [
      ['quads', 0.35, PETROL_DEEP],
      ['floor', 0.25, PETROL_DEEP],
      ['beams', 0.9, 'White'],
      ['fx', 0.4, 'Red'],
    ],
  },
];

const LOOKS: Record<TierId, { fadeIn: number; scale: number; looks: LookSpec[] }> =
  Object.fromEntries(
    (
      [
        ['chill', 3, 0.45],
        ['groove', 1, 0.7],
        ['drive', 0.5, 0.9],
        ['peak', 0, 1],
      ] as const
    ).map(([tier, fadeIn, scale]) => [
      tier,
      {
        fadeIn,
        scale,
        looks: PALETTES.map((look) => ({
          ...look,
          rules: look.rules.map(([part, i, colour]): LookRule => [
            part,
            Math.round(i * scale * 100) / 100,
            colour,
          ]),
        })),
      },
    ]),
  ) as Record<TierId, { fadeIn: number; scale: number; looks: LookSpec[] }>;

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

// Colour Effects replace the colour of what they target. Six a tier, from the
// palettes' colours. A Look
// fired later stops them, so fire Colour FX after the Look.
type ColourFxSpec = [
  id: string,
  name: string,
  part: Part,
  shape: 'Step' | 'Fade' | 'Rainbow',
  length: EffectLength,
  spread: Spread,
  colours?: Tint[],
];

const COLOUR_FX: Record<TierId, ColourFxSpec[]> = {
  chill: [
    ['drift-rust', 'Drift rust', 'washes', 'Fade', 16, 'Left→Right', [RUST, 'Amber', 'Orange']],
    [
      'drift-petrol',
      'Drift petrol',
      'quads',
      'Fade',
      16,
      'Front→Back',
      [PETROL, PETROL_PALE, 'Blue'],
    ],
    ['floor-drift', 'Floor drift', 'floor', 'Fade', 16, 'Mirrored', ['Amber', CRIMSON]],
    ['beam-drift', 'Beam drift', 'beams', 'Fade', 16, 'Left→Right', ['Cyan', 'White']],
    ['dekker-glow', 'Dekker glow', 'fx', 'Fade', 8, 'Alternate', ['Amber', 'Orange']],
    ['ember-fade', 'Ember fade', 'washes', 'Fade', 16, 'Left→Right', ['Red', RUST]],
  ],
  groove: [
    ['step-petrol-red', 'Step petrol/red', 'washes', 'Step', 1, 'Alternate', [PETROL, 'Red']],
    ['quads-fade', 'Quads petrol/amber', 'quads', 'Fade', 8, 'Front→Back', [PETROL, 'Amber']],
    ['floor-step', 'Floor amber/red', 'floor', 'Step', 2, 'Alternate', ['Amber', 'Red']],
    ['beams-step', 'Beams red/amber', 'beams', 'Step', 2, 'Left→Right', ['Red', 'Amber']],
    ['dekker-step', 'Dekker petrol/orange', 'fx', 'Step', 1, 'Alternate', [PETROL, 'Orange']],
    ['ember-fade', 'Ember fade', 'washes', 'Fade', 8, 'Left→Right', ['Red', RUST, 'Orange']],
  ],
  drive: [
    ['step-red-white', 'Step red/white', 'washes', 'Step', 1, 'Alternate', ['Red', 'White']],
    ['quads-step', 'Quads petrol/red', 'quads', 'Step', 0.5, 'Alternate', [PETROL, 'Red']],
    ['floor-step', 'Floor amber/red', 'floor', 'Step', 0.5, 'Random', ['Amber', 'Red']],
    ['beams-step', 'Beams red/amber', 'beams', 'Step', 1, 'Mirrored', ['Red', 'Amber']],
    ['dekker-step', 'Dekker orange/petrol', 'fx', 'Step', 0.5, 'Alternate', ['Orange', PETROL]],
    ['fire-fade', 'Fire fade', 'washes', 'Fade', 4, 'Back→Front', ['Red', 'Orange', 'Amber']],
  ],
  peak: [
    ['step-red-white', 'Step red/white', 'washes', 'Step', 0.5, 'Alternate', ['Red', 'White']],
    ['quads-step', 'Quads white/petrol', 'quads', 'Step', 0.5, 'Front→Back', ['White', PETROL]],
    ['floor-step', 'Floor red/orange', 'floor', 'Step', 0.5, 'Alternate', ['Red', 'Orange']],
    ['beams-step', 'Beams red/white', 'beams', 'Step', 0.5, 'Random', ['Red', 'White']],
    ['dekker-step', 'Dekker red/white', 'fx', 'Step', 0.25, 'Alternate', ['Red', 'White']],
    ['fire-flicker', 'Fire flicker', 'washes', 'Step', 0.25, 'Random', ['Red', 'Orange', 'Amber']],
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
                : { shape, colours: (colours ?? []).map(tint), length, spread },
          },
        ],
      },
      channel: CH.colourfx,
      note: base + i,
      mode: 'go' as const,
      about:
        `${PARTS[part].label}: ${shape} ${beatsText(length)}, ${spread}` +
        (colours ? `, ${colours.map(tintText).join(' → ')}` : ''),
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
const colourHit = (colour: Tint): HitSpec => {
  const name = tintText(colour);
  return hit(
    `colour-${name.toLowerCase().replace(/ /g, '-')}`,
    `Colour ${name.toLowerCase()}`,
    `Everything ${name}, full`,
    [set({}, 1, colour)],
  );
};
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
    hits: (['Amber', 'Orange', PETROL, 'Cyan', 'Warm White', 'Blue'] as const).map(colourHit),
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
    scene: 'chill-colourfx-ember-fade',
    about: 'Release Colour FX: colours return to the Look',
  },
  { channel: CH.hit, scene: 'hit-blinder', about: 'Release Hit: stop any held hit' },
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
      `${l} ${['Quiet verses, intros and ballads: the seven palettes at low level, slow fades, gentle breathing.', 'Mid-energy verses and pre-choruses: steady beat, wave, fan and Figure-8.', 'Choruses and drops: the palettes near full, fast chases, Random, fast Fan.', 'Last chorus, big moments and anthems: the palettes at full, wide sweeps with Fan and Prism.'][i]} |`,
  )
  .join('\n')}

Peak also holds the anthem material.

## How the Layers combine

Five Layers stack, one per MIDI channel. Each holds one Scene at a time, so a Look, a Movement, a Pulse and a Colour FX can all run together.

- **Look** (ch 1) sets colour and intensity. **Movement** (ch 2) sets aim and a movement Effect, and the Move+FX combos add an intensity Effect on the beams. **Pulse** (ch 3) scales intensity with Effects: pulses, chases, builds, Random. **Colour FX** (ch 4) replaces colour with steps or fades. **Hit** (ch 5) is Flash only: on while the note is held.
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
