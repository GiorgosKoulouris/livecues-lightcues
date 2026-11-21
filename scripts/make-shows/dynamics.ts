// The dynamic Layers of the Show generator: Movement, Pulse, Colour FX and
// Hits (spec: Generator, Dynamics and Hits). Each is a Layer on its own MIDI
// channel, built from the options below, which are curated so a cue meets M4:
// each tier offers dynamic Scenes on as many Layers as its stacking cap
// (Chill 1, Groove 2, Drive 2, Peak 3), so any cue that fires one of each
// stays inside it.
//
//   Movement    M1-M3, M5, T3   back washes and beams only, never the front
//   Pulse       M1, M7, T3      back, beams and floor, never the front
//   Colour FX   M1, P7          slot colours only, never the front, no Rainbow
//   Hits        R5, R6, L4      Flash mode only, short
//
// Speed: Effect lengths step up so movement stays under the Speed limit and
// beat-rate square Effects stay at or under the Strobe cap at the song BPM.
import { fitSpeedLimit } from '../../src/shared/speed-limit';
import {
  EFFECT_LENGTHS,
  NO_EFFECT,
  type ColourEffect,
  type EffectLength,
  type IntensityEffect,
  type Layer,
  type MovementEffect,
  type Rule,
  type RuleColour,
  type Scene,
  type Slot,
  type Trigger,
} from '../../src/shared/show';
import {
  partTarget,
  TIER_BASE,
  TIER_FADE_OUT_BEATS,
  tierFadeIn,
  TIERS,
  type Part,
  type Tier,
} from './rules';

// One MIDI channel per Layer. Colour Sets are on channel 6, where House and
// Haze Presets sit in Energy.
export const CH = { look: 1, movement: 2, pulse: 3, colourfx: 4, hit: 5, colourSets: 6 } as const;

export const LOOK_LAYER: Layer = { id: 'look', name: 'Look' };
export const MOVEMENT_LAYER: Layer = { id: 'movement', name: 'Movement' };
export const PULSE_LAYER: Layer = { id: 'pulse', name: 'Pulse' };
export const COLOUR_FX_LAYER: Layer = { id: 'colour-fx', name: 'Colour FX' };
export const HIT_LAYER: Layer = { id: 'hit', name: 'Hit' };
/** The Layers the dynamics add, in order above the Look Layer. */
export const DYNAMIC_LAYERS: Layer[] = [MOVEMENT_LAYER, PULSE_LAYER, COLOUR_FX_LAYER, HIT_LAYER];

const CHANNEL_OF: Record<string, number> = {
  [MOVEMENT_LAYER.id]: CH.movement,
  [PULSE_LAYER.id]: CH.pulse,
  [COLOUR_FX_LAYER.id]: CH.colourfx,
  [HIT_LAYER.id]: CH.hit,
};

/** Hits start here on their channel. */
const HIT_BASE = 12;

export interface Entry {
  scene: Scene;
  channel: number;
  note: number;
  mode: Trigger['mode'];
  about: string;
}

export interface DynamicsContext {
  /** The parts the rig can light. */
  present: readonly Part[];
  /** The fastest song's tempo: beat rates are quickest there. */
  bpm: number;
  /** The Strobe cap in Hz, for beat-rate square Effects. */
  strobeHz: number;
}

// ---------------------------------------------------------------- speed

/** A movement Effect stepped up in length, so it stays under the Speed limit at `bpm`. */
export function stepMovement(effect: MovementEffect, bpm: number): MovementEffect {
  const fit = fitSpeedLimit(effect, bpm);
  return { ...effect, length: fit.length, size: fit.size };
}

/** The shortest length from `length` up whose beat rate at `bpm` is at or under `maxHz`. */
export function stepFlashLength(length: EffectLength, bpm: number, maxHz: number): EffectLength {
  return (
    EFFECT_LENGTHS.find((l) => l >= length && bpm / 60 / l <= maxHz + 1e-9) ??
    EFFECT_LENGTHS[EFFECT_LENGTHS.length - 1]!
  );
}

// ---------------------------------------------------------------- options

const slot = (s: Slot): RuleColour => ({ slot: s });

interface MoveOption {
  name: string;
  about: string;
  // Absent: the still option, which holds the aim and runs no Effect (M5).
  effect?: MovementEffect;
}

// T3 and M2 lengths and sizes per tier, M3 symmetry: Chill in sync, Groove
// left to right, Drive fans and texture, Peak mirrored.
const MOVEMENT: Record<Tier, MoveOption[]> = {
  chill: [
    {
      name: 'Sway',
      about: 'Slow pan sweep, in sync.',
      effect: { shape: 'Pan sweep', size: 12, length: 16, spread: 'In sync' },
    },
    {
      name: 'Drift',
      about: 'Slow tilt, left to right.',
      effect: { shape: 'Tilt sweep', size: 10, length: 8, spread: 'Left→Right' },
    },
    { name: 'Still', about: 'Beams and back washes held Down.' },
  ],
  groove: [
    {
      name: 'Wave',
      about: 'Pan sweep that travels left to right.',
      effect: { shape: 'Pan sweep', size: 20, length: 8, spread: 'Left→Right' },
    },
    {
      name: 'Roll',
      about: 'Circles, mirrored from the centre.',
      effect: { shape: 'Circle', size: 18, length: 8, spread: 'Mirrored' },
    },
    { name: 'Still', about: 'Beams and back washes held Down.' },
  ],
  drive: [
    {
      name: 'Fan',
      about: 'Beams open out from the centre and close.',
      effect: { shape: 'Fan', size: 30, length: 4, spread: 'Mirrored' },
    },
    {
      name: 'Texture',
      about: 'Random wander.',
      effect: { shape: 'Ballyhoo', size: 28, length: 4, spread: 'Random' },
    },
    { name: 'Still', about: 'Beams and back washes held Down.' },
  ],
  peak: [
    {
      name: 'Wide Fan',
      about: 'The biggest Fan, mirrored.',
      effect: { shape: 'Fan', size: 40, length: 2, spread: 'Mirrored' },
    },
    {
      name: 'Mirror Circle',
      about: 'Circles, mirrored left and right.',
      effect: { shape: 'Circle', size: 36, length: 2, spread: 'Mirrored' },
    },
    {
      name: 'Closing Sweep',
      about: 'Pan sweep that closes from the edges to the centre.',
      effect: { shape: 'Pan sweep', size: 40, length: 4, spread: 'Edges→Centre' },
    },
    { name: 'Still', about: 'Beams and back washes held Down.' },
  ],
};

// Movement leaves the front out: no part but the back and the beams (M1).
const MOVEMENT_PARTS: readonly Part[] = ['back', 'beams'];

interface PulseOption {
  name: string;
  about: string;
  effect: IntensityEffect;
  parts: readonly Part[];
}

// Pulse is on the Layers of Drive and Peak, Colour FX on Groove and Peak, so
// that no tier offers more Layers than its cap. Square is the only shape the
// Strobe cap reads, and its length steps up with the tempo.
const PULSE: Partial<Record<Tier, PulseOption[]>> = {
  drive: [
    {
      name: 'Beat Pulse',
      about: 'A sine on the beat, back and beams.',
      effect: { shape: 'Pulse', depth: 0.5, length: 1, spread: 'In sync' },
      parts: ['back', 'beams'],
    },
    {
      name: 'Beam Square',
      about: 'Beams on and off each beat, alternating.',
      effect: { shape: 'Square', depth: 0.6, length: 1, spread: 'Alternate' },
      parts: ['beams'],
    },
  ],
  peak: [
    {
      name: 'Beat Pulse',
      about: 'A sine on the beat, back, beams and floor.',
      effect: { shape: 'Pulse', depth: 0.6, length: 1, spread: 'In sync' },
      parts: ['back', 'beams', 'floor'],
    },
    {
      name: 'Beam Square',
      about: 'Beams and floor on and off each beat, alternating.',
      effect: { shape: 'Square', depth: 0.7, length: 1, spread: 'Alternate' },
      parts: ['beams', 'floor'],
    },
    {
      name: 'Edge Chase',
      about: 'A chase from the edges to the centre.',
      effect: { shape: 'Chase', depth: 0.8, length: 1, spread: 'Edges→Centre' },
      parts: ['beams'],
    },
  ],
};

interface ColourFxOption {
  name: string;
  about: string;
  effect: Extract<ColourEffect, { shape: 'Step' | 'Fade' }>;
  parts: readonly Part[];
}

// P7: slot colours only, so a Colour Set change recolours them and they stay
// inside the song's palette. Rainbow is never offered.
const COLOUR_FX: Partial<Record<Tier, ColourFxOption[]>> = {
  groove: [
    {
      name: 'Slow Fade',
      about: 'Back washes fade between Primary and Secondary.',
      effect: {
        shape: 'Fade',
        colours: [slot('Primary'), slot('Secondary')],
        length: 8,
        spread: 'In sync',
      },
      parts: ['back'],
    },
    {
      name: 'Two Step',
      about: 'Back washes step between Primary and Accent.',
      effect: {
        shape: 'Step',
        colours: [slot('Primary'), slot('Accent')],
        length: 8,
        spread: 'Left→Right',
      },
      parts: ['back'],
    },
  ],
  peak: [
    {
      name: 'Colour Step',
      about: 'Back and floor step through all three slot colours.',
      effect: {
        shape: 'Step',
        colours: [slot('Primary'), slot('Secondary'), slot('Accent')],
        length: 4,
        spread: 'Mirrored',
      },
      parts: ['back', 'floor'],
    },
    {
      name: 'Colour Fade',
      about: 'Back and floor fade between Primary and Secondary.',
      effect: {
        shape: 'Fade',
        colours: [slot('Primary'), slot('Secondary')],
        length: 4,
        spread: 'Mirrored',
      },
      parts: ['back', 'floor'],
    },
  ],
};

// ---------------------------------------------------------------- Scenes

const slugOf = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A tier's dynamic Scene on `layer`, one Rule per part present. Undefined when the rig has none of its parts. */
function tierEntry(
  tier: Tier,
  layer: Layer,
  index: number,
  spec: { name: string; about: string; parts: readonly Part[]; dynamic: boolean },
  ruleFor: (part: Part) => Rule,
  present: readonly Part[],
): Entry | undefined {
  const parts = spec.parts.filter((p) => present.includes(p));
  if (parts.length === 0) return undefined;
  return {
    scene: {
      id: `${layer.id}-${tier}-${slugOf(spec.name)}`,
      name: `${titleCase(tier)}: ${spec.name}`,
      tags: [
        layer.id,
        ...(spec.dynamic ? ['dynamic'] : []),
        `tier:${tier}`,
        ...parts.map((p) => `part:${p}`),
      ],
      layer: layer.id,
      fadeIn: tierFadeIn(tier),
      fadeUnit: 'beats',
      fadeOut: TIER_FADE_OUT_BEATS[tier],
      fadeOutUnit: 'beats',
      rules: parts.map(ruleFor),
    },
    channel: CHANNEL_OF[layer.id]!,
    note: TIER_BASE[tier] + index,
    mode: 'go',
    about: spec.about,
  };
}

/** Builds each tier's Scenes for a Layer from `options`, numbering the notes of those the rig can light. */
function layerEntries<O extends { name: string; about: string }>(
  layer: Layer,
  options: (tier: Tier) => O[],
  cx: DynamicsContext,
  build: (
    option: O,
    tier: Tier,
    index: number,
  ) => { parts: readonly Part[]; dynamic: boolean; ruleFor: (part: Part) => Rule },
): Entry[] {
  const out: Entry[] = [];
  for (const tier of TIERS) {
    let index = 0;
    for (const option of options(tier)) {
      const { parts, dynamic, ruleFor } = build(option, tier, index);
      const entry = tierEntry(
        tier,
        layer,
        index,
        { name: option.name, about: option.about, parts, dynamic },
        ruleFor,
        cx.present,
      );
      if (entry) {
        out.push(entry);
        index++;
      }
    }
  }
  return out;
}

const movementEntries = (cx: DynamicsContext): Entry[] =>
  layerEntries(
    MOVEMENT_LAYER,
    (tier) => MOVEMENT[tier],
    cx,
    (option) => {
      const effect = option.effect && stepMovement(option.effect, cx.bpm);
      return {
        parts: MOVEMENT_PARTS,
        dynamic: effect !== undefined,
        ruleFor: (part) =>
          effect
            ? { target: partTarget(part), movementEffect: effect }
            : { target: partTarget(part), direction: 'Down', movementEffect: NO_EFFECT },
      };
    },
  );

const pulseEntries = (cx: DynamicsContext): Entry[] =>
  layerEntries(
    PULSE_LAYER,
    (tier) => PULSE[tier] ?? [],
    cx,
    (option) => {
      const { effect } = option;
      const stepped: IntensityEffect =
        effect.shape === 'Square'
          ? { ...effect, length: stepFlashLength(effect.length, cx.bpm, cx.strobeHz) }
          : effect;
      return {
        parts: option.parts,
        dynamic: true,
        ruleFor: (part) => ({ target: partTarget(part), intensityEffect: stepped }),
      };
    },
  );

const colourFxEntries = (cx: DynamicsContext): Entry[] =>
  layerEntries(
    COLOUR_FX_LAYER,
    (tier) => COLOUR_FX[tier] ?? [],
    cx,
    (option) => ({
      parts: option.parts,
      dynamic: true,
      ruleFor: (part) => ({ target: partTarget(part), colourEffect: option.effect }),
    }),
  );

interface HitSpec {
  id: string;
  name: string;
  about: string;
  // The parts it takes; it is left out when the rig has none. None: every Fixture.
  parts: readonly Part[];
  rule: (target: Rule['target']) => Rule;
  fadeOut?: number;
  tags?: string[];
}

const WHITE: RuleColour = { swatch: 'White' };

// R5, R6, L4: Hits are Flash only and short. They may flash faster than the
// Strobe cap, which does not apply to a Scene held by Flash.
const HITS: HitSpec[] = [
  {
    id: 'blinder',
    name: 'Blinder',
    about:
      'Front and effect lights to full white. An audience accent: the chorus downbeat or a big stop, twice a song at most. Flash 2 beats or less.',
    parts: ['front', 'fx'],
    rule: (target) => ({ target, intensity: 1, colour: WHITE }),
    fadeOut: 0.5,
  },
  {
    id: 'strobe',
    name: 'Strobe',
    about:
      'White strobe at 6 Hz on beams, effect lights and back washes. For drops and endings. Flash 2 beats or less.',
    parts: ['fx', 'beams', 'back'],
    rule: (target) => ({ target, intensity: 1, colour: WHITE, strobe: 'Medium' }),
  },
  {
    id: 'blackout',
    name: 'Blackout',
    about: 'Everything off at once, back on at release. For stops.',
    parts: [],
    rule: (target) => ({ target, intensity: 0 }),
  },
  {
    id: 'riser',
    name: 'Riser',
    about: 'Back, beams and floor ramp up over 8 beats. Hold through the last bars of a build.',
    parts: ['back', 'beams', 'floor'],
    rule: (target) => ({
      target,
      intensity: 1,
      colour: slot('Accent'),
      intensityEffect: { shape: 'Ramp up', depth: 1, length: 8, spread: 'In sync' },
    }),
    fadeOut: 0.5,
    tags: ['roll'],
  },
  {
    id: 'roll',
    name: 'Roll',
    about:
      'A quarter-beat square on back, beams and floor, like a drum roll. Flash 2 beats or less.',
    parts: ['back', 'beams', 'floor'],
    rule: (target) => ({
      target,
      intensity: 1,
      colour: slot('Accent'),
      intensityEffect: { shape: 'Square', depth: 0.7, length: 0.25, spread: 'In sync' },
    }),
    fadeOut: 0.5,
    tags: ['roll'],
  },
];

function hitEntries(cx: DynamicsContext): Entry[] {
  const out: Entry[] = [];
  for (const spec of HITS) {
    const present = spec.parts.filter((p) => cx.present.includes(p));
    if (spec.parts.length > 0 && present.length === 0) continue;
    const rules =
      spec.parts.length === 0 ? [spec.rule({})] : present.map((p) => spec.rule(partTarget(p)));
    out.push({
      scene: {
        id: `hit-${spec.id}`,
        name: `Hit: ${spec.name}`,
        tags: ['hit', ...(spec.tags ?? [])],
        layer: HIT_LAYER.id,
        fadeIn: 0,
        fadeUnit: 'beats',
        ...(spec.fadeOut !== undefined ? { fadeOut: spec.fadeOut, fadeOutUnit: 'beats' } : {}),
        rules,
      },
      channel: CH.hit,
      note: HIT_BASE + out.length,
      mode: 'flash',
      about: spec.about,
    });
  }
  return out;
}

/** Movement, Pulse, Colour FX and Hit Scenes, each on its Layer's channel. */
export function dynamicEntries(cx: DynamicsContext): Entry[] {
  return [...movementEntries(cx), ...pulseEntries(cx), ...colourFxEntries(cx), ...hitEntries(cx)];
}

/** Note 0 on each of Movement, Pulse and Colour FX that has Scenes releases it. */
export function dynamicReleases(entries: readonly Entry[]): Trigger[] {
  return [MOVEMENT_LAYER, PULSE_LAYER, COLOUR_FX_LAYER].flatMap((layer) => {
    const first = entries.find((e) => e.scene.layer === layer.id);
    return first === undefined
      ? []
      : [
          {
            channel: CHANNEL_OF[layer.id]!,
            note: 0,
            scene: first.scene.id,
            mode: 'release' as const,
          },
        ];
  });
}

/** The dynamic Layers that have Scenes. */
export function layersWithScenes(entries: readonly Entry[]): Layer[] {
  return DYNAMIC_LAYERS.filter((l) => entries.some((e) => e.scene.layer === l.id));
}
