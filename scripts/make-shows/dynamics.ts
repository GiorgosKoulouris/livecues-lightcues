// The dynamic Layers of the Show generator: Movement, Pulse, Colour FX and
// Hits (spec: Dynamic Layers, Hits). Each is a Layer on its own MIDI channel,
// built from the options below, with Energy's counts in every tier. A cue
// stays inside the stacking cap (M4: Chill 2, Groove 3, Drive 3, Peak 4) by
// firing one Scene per Layer (a Move+FX combo is one Scene).
//
//   Movement    M1-M3, M5, T3   back washes and beams, never a front mover
//   Pulse       M1, M7, T3      every part and everything, the front included
//   Colour FX   M1, P7          slot colours, every part, no Rainbow
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
  type RuleTarget,
  type Scene,
  type Slot,
  type Trigger,
} from '../../src/shared/show';
import {
  ALL_ROWS,
  BACK_ROWS,
  COLUMNS,
  FRONT_ROWS,
  PARTS,
  slugOf,
  partTarget,
  TIER_BASE,
  TIER_FADE_OUT_BEATS,
  targetCovers,
  tierFadeIn,
  TIERS,
  type Part,
  type Tier,
} from './rules';
import type { ZoneRow } from '../../src/shared/venue-patch';

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
  /** The kind a Hit belongs to, for the Cue Sheet. */
  group?: string;
}

export interface DynamicsContext {
  /** The parts the rig can light. */
  present: readonly Part[];
  /** The fastest song's tempo: beat rates are quickest there. */
  bpm: number;
  /** The Strobe cap in Hz, for beat-rate square Effects. */
  strobeHz: number;
  /** Whether the beams have a prism. Prism Hits need it. */
  prism: boolean;
  /** Whether the beams have a gobo. Gobo Hits need it. */
  gobo: boolean;
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
  // A Move+FX combo: an intensity Effect on the beams, on top of the movement.
  fx?: IntensityEffect;
}

const move = (
  name: string,
  about: string,
  shape: MovementEffect['shape'],
  size: number,
  length: EffectLength,
  spread: MovementEffect['spread'],
  fx?: IntensityEffect,
): MoveOption => ({ name, about, effect: { shape, size, length, spread }, ...(fx ? { fx } : {}) });
const still: MoveOption = { name: 'Still', about: 'Beams and back washes held Down.' };
const fx = (
  shape: IntensityEffect['shape'],
  depth: number,
  length: EffectLength,
  spread: IntensityEffect['spread'],
  width?: IntensityEffect['width'],
): IntensityEffect => ({ shape, depth, length, spread, ...(width ? { width } : {}) });

// T3 and M2 lengths and sizes per tier, M3 symmetry: Chill in sync, Groove
// left to right, Drive fans and texture, Peak mirrored. Each tier has pure
// Effects, a still and Move+FX combos, as Energy does.
const MOVEMENT: Record<Tier, MoveOption[]> = {
  chill: [
    move('Sway', 'Slow pan sweep, in sync.', 'Pan sweep', 12, 16, 'In sync'),
    move('Drift', 'Slow tilt, left to right.', 'Tilt sweep', 10, 8, 'Left→Right'),
    still,
    move('Slow Circle', 'Small circles, in sync.', 'Circle', 8, 16, 'In sync'),
    move(
      'Sway + Breathe',
      'Slow pan sweep; beams breathe.',
      'Pan sweep',
      12,
      16,
      'In sync',
      fx('Pulse', 0.3, 8, 'Alternate'),
    ),
    move(
      'Drift + Glint',
      'Slow tilt, left to right; beams glint at random.',
      'Tilt sweep',
      10,
      8,
      'Left→Right',
      fx('Random', 0.4, 4, 'Random', 1 / 4),
    ),
    move(
      'Bloom',
      'Beams open out slowly and dim.',
      'Fan',
      12,
      16,
      'In sync',
      fx('Ramp down', 0.3, 16, 'In sync'),
    ),
  ],
  groove: [
    move('Wave', 'Pan sweep that travels left to right.', 'Pan sweep', 20, 8, 'Left→Right'),
    move('Roll', 'Circles, mirrored from the centre.', 'Circle', 18, 8, 'Mirrored'),
    still,
    move('Figure-8', 'Figure-8s, mirrored.', 'Figure-8', 20, 8, 'Mirrored'),
    move(
      'Wave + Chase',
      'Pan sweep left to right; beams chase left to right.',
      'Pan sweep',
      20,
      8,
      'Left→Right',
      fx('Chase', 1, 2, 'Left→Right', 1 / 4),
    ),
    move(
      'Roll + Pulse',
      'Mirrored circles; beams pulse on the beat.',
      'Circle',
      18,
      8,
      'Mirrored',
      fx('Pulse', 0.5, 1, 'In sync'),
    ),
    move(
      'Figure-8 + Random',
      'Mirrored figure-8s; beams flicker at random.',
      'Figure-8',
      20,
      8,
      'Mirrored',
      fx('Random', 0.6, 1, 'Random', 1 / 3),
    ),
  ],
  drive: [
    move('Fan', 'Beams open out from the centre and close.', 'Fan', 30, 4, 'Mirrored'),
    move('Texture', 'Random wander.', 'Ballyhoo', 28, 4, 'Random'),
    still,
    move('Spin', 'Circles, mirrored.', 'Circle', 26, 4, 'Mirrored'),
    move(
      'Texture + Square',
      'Random wander; beams flip on and off.',
      'Ballyhoo',
      28,
      4,
      'Alternate',
      fx('Square', 1, 1, 'Alternate'),
    ),
    move(
      'Fan + Chase',
      'Mirrored fan; beams chase from the edges.',
      'Fan',
      30,
      4,
      'Mirrored',
      fx('Chase', 1, 1, 'Mirrored', 1 / 2),
    ),
    move(
      'Spin + Random',
      'Mirrored circles; beams flicker fast at random.',
      'Circle',
      26,
      2,
      'Mirrored',
      fx('Random', 1, 0.5, 'Random', 1 / 3),
    ),
  ],
  peak: [
    move('Wide Fan', 'The biggest Fan, mirrored.', 'Fan', 40, 2, 'Mirrored'),
    move('Mirror Circle', 'Circles, mirrored left and right.', 'Circle', 36, 2, 'Mirrored'),
    move(
      'Closing Sweep',
      'Pan sweep that closes from the edges to the centre.',
      'Pan sweep',
      40,
      4,
      'Edges→Centre',
    ),
    still,
    move(
      'Fan + Pulse',
      'The biggest Fan; beams pulse on the beat.',
      'Fan',
      40,
      2,
      'Mirrored',
      fx('Pulse', 0.7, 1, 'In sync'),
    ),
    move(
      'Circle + Square',
      'Mirrored circles; beams flip on and off.',
      'Circle',
      36,
      2,
      'Mirrored',
      fx('Square', 1, 0.5, 'Alternate'),
    ),
    move(
      'Sweep + Random',
      'Closing sweep; beams flicker at random.',
      'Pan sweep',
      40,
      4,
      'Edges→Centre',
      fx('Random', 1, 0.5, 'Random', 1 / 2),
    ),
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

const EVERYTHING: readonly Part[] = ['front', 'back', 'floor', 'beams', 'fx'];
const pulse = (
  name: string,
  about: string,
  parts: readonly Part[],
  effect: IntensityEffect,
): PulseOption => ({ name, about, effect, parts });

// Pulse by part (front, back, floor, beams, fx) and on everything: sines,
// squares, chases, Random and builds. Square is the only shape the Strobe cap
// reads, and its length steps up with the tempo. Lengths follow T3.
const PULSE: Record<Tier, PulseOption[]> = {
  chill: [
    pulse('Back Breathe', 'Back washes breathe.', ['back'], fx('Pulse', 0.3, 8, 'In sync')),
    pulse('Front Breathe', 'Front washes breathe.', ['front'], fx('Pulse', 0.3, 8, 'In sync')),
    pulse('Floor Swell', 'Floor washes swell.', ['floor'], fx('Pulse', 0.3, 4, 'In sync')),
    pulse(
      'Beam Breathe',
      'Beams breathe, alternating.',
      ['beams'],
      fx('Pulse', 0.4, 8, 'Alternate'),
    ),
    pulse(
      'Fx Glint',
      'Effect lights glint at random.',
      ['fx'],
      fx('Random', 0.5, 4, 'Random', 1 / 4),
    ),
    pulse(
      'Front-Back Wash',
      'A slow chase from the front washes to the back.',
      ['front', 'back'],
      fx('Chase', 0.5, 8, 'Front→Back', 1 / 3),
    ),
    pulse(
      'All Breathe',
      'Everything breathes slowly.',
      EVERYTHING,
      fx('Pulse', 0.25, 16, 'In sync'),
    ),
    pulse(
      'Slow Build',
      'Everything builds over 16 beats.',
      EVERYTHING,
      fx('Ramp up', 0.5, 16, 'In sync'),
    ),
    pulse(
      'Slow Fade',
      'Everything fades over 16 beats.',
      EVERYTHING,
      fx('Ramp down', 0.4, 16, 'In sync'),
    ),
  ],
  groove: [
    pulse('Back Pulse', 'Back washes pulse on the beat.', ['back'], fx('Pulse', 0.6, 1, 'In sync')),
    pulse(
      'Front Pulse',
      'Front washes pulse on the beat.',
      ['front'],
      fx('Pulse', 0.6, 1, 'In sync'),
    ),
    pulse(
      'Floor Chase',
      'A chase across the floor, mirrored.',
      ['floor'],
      fx('Chase', 1, 2, 'Mirrored', 1 / 3),
    ),
    pulse(
      'Beam Chase',
      'A chase across the beams, left to right.',
      ['beams'],
      fx('Chase', 1, 2, 'Left→Right', 1 / 4),
    ),
    pulse('Fx Flip', 'Effect lights flip on and off.', ['fx'], fx('Square', 1, 1, 'Alternate')),
    pulse(
      'Wash Pulse',
      'Front, back and floor washes pulse from front to back.',
      ['front', 'back', 'floor'],
      fx('Pulse', 0.6, 1, 'Front→Back'),
    ),
    pulse(
      'All Pulse',
      'Everything pulses on the beat.',
      EVERYTHING,
      fx('Pulse', 0.5, 1, 'In sync'),
    ),
    pulse(
      'Random Third',
      'A third of everything flickers.',
      EVERYTHING,
      fx('Random', 0.6, 1, 'Random', 1 / 3),
    ),
    pulse(
      'Quick Build',
      'Everything builds over 2 beats.',
      EVERYTHING,
      fx('Ramp up', 1, 2, 'In sync'),
    ),
  ],
  drive: [
    pulse(
      'Beat Pulse',
      'A sine on the beat, back and beams.',
      ['back', 'beams'],
      fx('Pulse', 0.5, 1, 'In sync'),
    ),
    pulse(
      'Beam Square',
      'Beams on and off each beat, alternating.',
      ['beams'],
      fx('Square', 0.6, 1, 'Alternate'),
    ),
    pulse(
      'Front Square',
      'Front washes flip on the beat.',
      ['front'],
      fx('Square', 0.8, 1, 'In sync'),
    ),
    pulse(
      'Back Square',
      'Back washes flip on the beat.',
      ['back'],
      fx('Square', 0.8, 1, 'In sync'),
    ),
    pulse(
      'Floor Chase',
      'A chase across the floor, edges to centre.',
      ['floor'],
      fx('Chase', 1, 1, 'Edges→Centre', 1 / 2),
    ),
    pulse(
      'Beam Random',
      'Beams flicker at random.',
      ['beams'],
      fx('Random', 1, 0.5, 'Random', 1 / 3),
    ),
    pulse(
      'Fx Random',
      'Effect lights flicker at random.',
      ['fx'],
      fx('Random', 1, 0.5, 'Random', 1 / 2),
    ),
    pulse(
      'All Chase',
      'A chase across everything, right to left.',
      EVERYTHING,
      fx('Chase', 1, 1, 'Right→Left', 1 / 4),
    ),
    pulse(
      'All Half Pulse',
      'Everything pulses twice a beat.',
      EVERYTHING,
      fx('Pulse', 0.6, 0.5, 'Alternate'),
    ),
  ],
  peak: [
    pulse(
      'Beat Pulse',
      'A sine on the beat, back, beams and floor.',
      ['back', 'beams', 'floor'],
      fx('Pulse', 0.6, 1, 'In sync'),
    ),
    pulse(
      'Beam Square',
      'Beams and floor on and off each beat, alternating.',
      ['beams', 'floor'],
      fx('Square', 0.7, 1, 'Alternate'),
    ),
    pulse(
      'Edge Chase',
      'A chase from the edges to the centre.',
      ['beams'],
      fx('Chase', 0.8, 1, 'Edges→Centre'),
    ),
    pulse(
      'Front Pulse',
      'Front washes pulse on the beat.',
      ['front'],
      fx('Pulse', 0.7, 1, 'In sync'),
    ),
    pulse(
      'Fx Square',
      'Effect lights flip twice a beat.',
      ['fx'],
      fx('Square', 1, 0.5, 'Alternate'),
    ),
    pulse(
      'All Square',
      'Everything flips twice a beat.',
      EVERYTHING,
      fx('Square', 0.7, 0.5, 'In sync'),
    ),
    pulse(
      'Floor Random',
      'The floor flickers at random.',
      ['floor'],
      fx('Random', 1, 0.5, 'Random', 1 / 2),
    ),
    pulse('Build', 'Everything builds.', EVERYTHING, fx('Ramp up', 1, 1, 'In sync')),
    pulse(
      'Front-Back Chase',
      'A chase from the front washes to the back.',
      ['front', 'back'],
      fx('Chase', 1, 1, 'Front→Back', 1 / 3),
    ),
  ],
};

interface ColourFxOption {
  name: string;
  about: string;
  effect: Extract<ColourEffect, { shape: 'Step' | 'Fade' }>;
  parts: readonly Part[];
}

const WASHES: readonly Part[] = ['front', 'back', 'floor'];
const colourFx = (
  name: string,
  about: string,
  parts: readonly Part[],
  shape: 'Step' | 'Fade',
  slots: readonly Slot[],
  length: EffectLength,
  spread: ColourEffect['spread'],
): ColourFxOption => ({
  name,
  about,
  parts,
  effect: { shape, colours: slots.map(slot), length, spread },
});

// P7: slot colours only, so a Colour Set change recolours them and they stay
// inside the song's palette. Rainbow is never offered.
const COLOUR_FX: Record<Tier, ColourFxOption[]> = {
  chill: [
    colourFx(
      'Back Drift',
      'Back washes drift between Primary and Secondary.',
      ['back'],
      'Fade',
      ['Primary', 'Secondary'],
      16,
      'Left→Right',
    ),
    colourFx(
      'Front Warm',
      'Front washes drift between Primary and Accent.',
      ['front'],
      'Fade',
      ['Primary', 'Accent'],
      16,
      'In sync',
    ),
    colourFx(
      'Floor Drift',
      'The floor drifts between Secondary and Accent.',
      ['floor'],
      'Fade',
      ['Secondary', 'Accent'],
      16,
      'Mirrored',
    ),
    colourFx(
      'Beam Drift',
      'Beams drift between Primary and Accent.',
      ['beams'],
      'Fade',
      ['Primary', 'Accent'],
      16,
      'Left→Right',
    ),
    colourFx(
      'Fx Glow',
      'Effect lights glow between Accent and Primary.',
      ['fx'],
      'Fade',
      ['Accent', 'Primary'],
      8,
      'Alternate',
    ),
    colourFx(
      'Wash Ember',
      'Front, back and floor fade through all three slots, front to back.',
      WASHES,
      'Fade',
      ['Primary', 'Secondary', 'Accent'],
      16,
      'Front→Back',
    ),
  ],
  groove: [
    colourFx(
      'Slow Fade',
      'Back washes fade between Primary and Secondary.',
      ['back'],
      'Fade',
      ['Primary', 'Secondary'],
      8,
      'In sync',
    ),
    colourFx(
      'Two Step',
      'Back washes step between Primary and Accent.',
      ['back'],
      'Step',
      ['Primary', 'Accent'],
      8,
      'Left→Right',
    ),
    colourFx(
      'Front Fade',
      'Front washes fade between Primary and Secondary.',
      ['front'],
      'Fade',
      ['Primary', 'Secondary'],
      8,
      'In sync',
    ),
    colourFx(
      'Floor Step',
      'The floor steps between Secondary and Accent.',
      ['floor'],
      'Step',
      ['Secondary', 'Accent'],
      2,
      'Alternate',
    ),
    colourFx(
      'Beam Step',
      'Beams step between Primary and Accent.',
      ['beams'],
      'Step',
      ['Primary', 'Accent'],
      2,
      'Left→Right',
    ),
    colourFx(
      'Fx Step',
      'Effect lights step between Accent and Primary.',
      ['fx'],
      'Step',
      ['Accent', 'Primary'],
      1,
      'Alternate',
    ),
    colourFx(
      'Wash Fade',
      'Front, back and floor fade through all three slots, back to front.',
      WASHES,
      'Fade',
      ['Primary', 'Secondary', 'Accent'],
      8,
      'Back→Front',
    ),
  ],
  drive: [
    colourFx(
      'Back Step',
      'Back washes step between Primary and Secondary.',
      ['back'],
      'Step',
      ['Primary', 'Secondary'],
      1,
      'Alternate',
    ),
    colourFx(
      'Front Step',
      'Front washes step between Primary and Accent.',
      ['front'],
      'Step',
      ['Primary', 'Accent'],
      1,
      'Alternate',
    ),
    colourFx(
      'Floor Step',
      'The floor steps between Secondary and Accent at random.',
      ['floor'],
      'Step',
      ['Secondary', 'Accent'],
      0.5,
      'Random',
    ),
    colourFx(
      'Beam Step',
      'Beams step between Primary and Secondary.',
      ['beams'],
      'Step',
      ['Primary', 'Secondary'],
      1,
      'Mirrored',
    ),
    colourFx(
      'Fx Step',
      'Effect lights step between Accent and Primary.',
      ['fx'],
      'Step',
      ['Accent', 'Primary'],
      0.5,
      'Alternate',
    ),
    colourFx(
      'Wash Fade',
      'Front, back and floor fade through all three slots, back to front.',
      WASHES,
      'Fade',
      ['Primary', 'Secondary', 'Accent'],
      4,
      'Back→Front',
    ),
  ],
  peak: [
    colourFx(
      'Colour Step',
      'Back and floor step through all three slot colours.',
      ['back', 'floor'],
      'Step',
      ['Primary', 'Secondary', 'Accent'],
      4,
      'Mirrored',
    ),
    colourFx(
      'Colour Fade',
      'Back and floor fade between Primary and Secondary.',
      ['back', 'floor'],
      'Fade',
      ['Primary', 'Secondary'],
      4,
      'Mirrored',
    ),
    colourFx(
      'Front Step',
      'Front washes step between Primary and Accent.',
      ['front'],
      'Step',
      ['Primary', 'Accent'],
      0.5,
      'Alternate',
    ),
    colourFx(
      'Beam Step',
      'Beams step between Primary and Accent at random.',
      ['beams'],
      'Step',
      ['Primary', 'Accent'],
      0.5,
      'Random',
    ),
    colourFx(
      'Fx Step',
      'Effect lights step between Accent and Primary.',
      ['fx'],
      'Step',
      ['Accent', 'Primary'],
      0.25,
      'Alternate',
    ),
    colourFx(
      'Flicker',
      'Front, back and floor flicker through all three slots at random.',
      WASHES,
      'Step',
      ['Primary', 'Secondary', 'Accent'],
      0.25,
      'Random',
    ),
  ],
};

// ---------------------------------------------------------------- Scenes

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
      const extra =
        option.fx && option.fx.shape === 'Square'
          ? { ...option.fx, length: stepFlashLength(option.fx.length, cx.bpm, cx.strobeHz) }
          : option.fx;
      return {
        // A Move+FX combo needs beams for its intensity Effect.
        parts: extra && !cx.present.includes('beams') ? [] : MOVEMENT_PARTS,
        dynamic: effect !== undefined,
        ruleFor: (part) =>
          effect
            ? {
                target: partTarget(part),
                movementEffect: effect,
                ...(extra && part === 'beams' ? { intensityEffect: extra } : {}),
              }
            : { target: partTarget(part), direction: 'Down', movementEffect: NO_EFFECT },
      };
    },
  );

const pulseEntries = (cx: DynamicsContext): Entry[] =>
  layerEntries(
    PULSE_LAYER,
    (tier) => PULSE[tier],
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
    (tier) => COLOUR_FX[tier],
    cx,
    (option) => ({
      parts: option.parts,
      dynamic: true,
      ruleFor: (part) => ({ target: partTarget(part), colourEffect: option.effect }),
    }),
  );

/** The kinds of Hit, in note order. The Cue Sheet groups Hits by them. */
export const HIT_KINDS = [
  'Core',
  'Target punches',
  'Side and depth',
  'Colour',
  'Prism and Gobo',
] as const;
type HitKind = (typeof HIT_KINDS)[number];

interface HitSpec {
  id: string;
  name: string;
  about: string;
  kind: HitKind;
  // The parts it takes; it is left out when the rig has none. None (and no targets): every Fixture.
  parts?: readonly Part[];
  // Explicit targets, for a Hit by side or depth.
  targets?: RuleTarget[];
  // What the beams must have for it.
  needs?: 'prism' | 'gobo' | 'both';
  rule: (target: Rule['target']) => Rule;
  fadeOut?: number;
  tags?: string[];
}

const WHITE: RuleColour = { swatch: 'White' };
const LEVELS = ['Overhead', 'Floor'] as const;

/** Every Fixture in the stage columns and rows given, at any level. */
function zonesOf(
  columns: readonly (typeof COLUMNS)[number][],
  rows: readonly ZoneRow[] = ALL_ROWS,
): RuleTarget {
  return {
    zones: rows.flatMap((row) =>
      columns.flatMap((column) => LEVELS.map((level) => ({ row, column, level }))),
    ),
  };
}

const full =
  (colour: RuleColour) =>
  (target: Rule['target']): Rule => ({
    target,
    intensity: 1,
    colour,
  });
const punch = (part: Part): HitSpec => ({
  id: `punch-${part}`,
  name: `Punch ${part}`,
  about: `${titleCase(part)} lights to full white. Flash 2 beats or less.`,
  kind: 'Target punches',
  parts: [part],
  rule: full(WHITE),
});
const side = (
  id: string,
  name: string,
  about: string,
  target: RuleTarget,
  kind: HitKind = 'Side and depth',
): HitSpec => ({
  id,
  name,
  about: `${about}, every Fixture, white, full. Flash 2 beats or less.`,
  kind,
  targets: [target],
  rule: (t) => ({ target: t, intensity: 1, colour: WHITE }),
});
const slotHit = (name: Slot, about: string): HitSpec => ({
  id: `colour-${slugOf(name)}`,
  name: `Colour ${name}`,
  about: `${about} Follows the held Colour Set. Flash 2 beats or less.`,
  kind: 'Colour',
  rule: full(slot(name)),
});
const beamHit = (
  id: string,
  name: string,
  about: string,
  needs: HitSpec['needs'],
  extra: Partial<Rule>,
): HitSpec => ({
  id,
  name,
  about: `${about} Flash 2 beats or less.`,
  kind: 'Prism and Gobo',
  parts: ['beams'],
  needs,
  rule: (target) => ({ target, intensity: 1, colour: WHITE, ...extra }),
});

// R5, R6, L4: Hits are Flash only and short. They may flash faster than the
// Strobe cap, which does not apply to a Scene held by Flash.
const HITS: HitSpec[] = [
  {
    id: 'blinder',
    name: 'Blinder',
    about:
      'Front and effect lights to full white. An audience accent: the chorus downbeat or a big stop, twice a song at most. Flash 2 beats or less.',
    kind: 'Core',
    parts: ['front', 'fx'],
    rule: (target) => ({ target, intensity: 1, colour: WHITE }),
    fadeOut: 0.5,
  },
  {
    id: 'strobe',
    name: 'Strobe',
    about:
      'White strobe at 6 Hz on beams, effect lights and back washes. For drops and endings. Flash 2 beats or less.',
    kind: 'Core',
    parts: ['fx', 'beams', 'back'],
    rule: (target) => ({ target, intensity: 1, colour: WHITE, strobe: 'Medium' }),
  },
  {
    id: 'blackout',
    name: 'Blackout',
    about: 'Everything off at once, back on at release. For stops.',
    kind: 'Core',
    rule: (target) => ({ target, intensity: 0 }),
  },
  {
    id: 'riser',
    name: 'Riser',
    about: 'Back, beams and floor ramp up over 8 beats. Hold through the last bars of a build.',
    kind: 'Core',
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
    kind: 'Core',
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
  ...PARTS.map(punch),
  side('side-left', 'Side left', 'The Stage Left column', zonesOf(['Stage Left'])),
  side('side-right', 'Side right', 'The Stage Right column', zonesOf(['Stage Right'])),
  side('depth-front', 'Side front', 'Front and Downstage rows', zonesOf(COLUMNS, FRONT_ROWS)),
  side('depth-back', 'Side back', 'Midstage and Upstage rows', zonesOf(COLUMNS, BACK_ROWS)),
  slotHit('Primary', 'Everything flashes the Primary colour.'),
  slotHit('Secondary', 'Everything flashes the Secondary colour.'),
  slotHit('Accent', 'Everything flashes the Accent colour.'),
  {
    id: 'colour-split',
    name: 'Colour Split',
    about:
      'Back washes flash Secondary and the floor Primary, the Look swapped. Follows the held Colour Set. Flash 2 beats or less.',
    kind: 'Colour',
    parts: ['back', 'floor'],
    rule: (target) => ({
      target,
      intensity: 1,
      colour: slot(targetCovers(target, 'floor') ? 'Primary' : 'Secondary'),
    }),
  },
  beamHit('prism-burst', 'Prism burst', 'Beams to full white with the prism in.', 'prism', {
    prism: 'On',
  }),
  beamHit('prism-spin', 'Prism spin', 'Beams to full white with the prism turning fast.', 'prism', {
    prism: 'Rotate fast',
  }),
  beamHit('gobo-beams', 'Gobo beams', 'Beams to full white on a gobo.', 'gobo', { gobo: 'Gobo' }),
  beamHit('gobo-prism', 'Gobo + prism', 'Beams on a gobo with the prism turning slow.', 'both', {
    gobo: 'Gobo',
    prism: 'Rotate slow',
  }),
];

/** Whether the beams have what a Hit needs. */
const hasNeeds = (spec: HitSpec, cx: DynamicsContext): boolean =>
  spec.needs === undefined ||
  (spec.needs === 'prism' ? cx.prism : spec.needs === 'gobo' ? cx.gobo : cx.prism && cx.gobo);

/** The Hits left out because the beams lack a prism or a gobo, as text for the Cue Sheet. */
export function hitSkips(cx: DynamicsContext): string[] {
  if (!cx.present.includes('beams')) return [];
  if (!cx.prism && !cx.gobo) return ['Prism and Gobo Hits (no prism or gobo on the beams)'];
  const lacks = cx.prism ? 'gobo' : 'prism';
  return HITS.filter((s) => !hasNeeds(s, cx)).map(
    (s) => `Hit: ${s.name} (no ${s.needs === 'both' ? lacks : s.needs} on the beams)`,
  );
}

function hitEntries(cx: DynamicsContext): Entry[] {
  const out: Entry[] = [];
  for (const spec of HITS) {
    if (!hasNeeds(spec, cx)) continue;
    const present = spec.parts?.filter((p) => cx.present.includes(p));
    if (spec.parts !== undefined && present!.length === 0) continue;
    const targets = spec.targets ?? present?.map((p) => partTarget(p)) ?? [{}];
    out.push({
      scene: {
        id: `hit-${spec.id}`,
        name: `Hit: ${spec.name}`,
        tags: ['hit', `kind:${slugOf(spec.kind)}`, ...(spec.tags ?? [])],
        layer: HIT_LAYER.id,
        fadeIn: 0,
        fadeUnit: 'beats',
        ...(spec.fadeOut !== undefined ? { fadeOut: spec.fadeOut, fadeOutUnit: 'beats' } : {}),
        rules: targets.map((t) => spec.rule(t)),
      },
      channel: CH.hit,
      note: HIT_BASE + out.length,
      mode: 'flash',
      about: spec.about,
      group: spec.kind,
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
