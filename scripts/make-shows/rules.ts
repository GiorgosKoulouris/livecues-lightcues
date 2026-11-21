// The lighting rule thresholds, in one place. `show-lint.ts` scores a Show
// against them and the Show generator builds to them. Rule IDs (P1, M4, ...)
// refer to the rules catalogue in the show generator research. Plain data and
// small helpers only: no Show or app imports beyond types.
import type { Role } from '../../src/shared/fixture-profile';
import type { Swatch } from '../../src/shared/colour';

// ---------------------------------------------------------------- tiers

export const TIERS = ['chill', 'groove', 'drive', 'peak'] as const;
export type Tier = (typeof TIERS)[number];

export interface TierBand {
  // I2: the least the front is lit in a sung Look.
  frontMin: number;
  // I4: the most parts a Look lights.
  maxParts: number;
  // M4: the most dynamic Layers that stack in one cue.
  maxDynamic: number;
  // T3 and M2: movement Effect length (beats) and size (degrees), inclusive.
  movementLength: readonly [number, number];
  movementSize: readonly [number, number];
  // T3: intensity Effect length, in beats, inclusive.
  intensityLength: readonly [number, number];
  // T2: the fade-in of a Look, in beats, inclusive.
  fadeBeats: readonly [number, number];
}

export const TIER_BANDS: Record<Tier, TierBand> = {
  chill: {
    frontMin: 0.35,
    maxParts: 2,
    maxDynamic: 1,
    movementLength: [8, 16],
    movementSize: [8, 15],
    intensityLength: [4, 16],
    fadeBeats: [4, 8],
  },
  groove: {
    frontMin: 0.5,
    maxParts: 4,
    maxDynamic: 2,
    movementLength: [4, 8],
    movementSize: [15, 25],
    intensityLength: [1, 2],
    fadeBeats: [1, 2],
  },
  drive: {
    frontMin: 0.5,
    maxParts: 5,
    maxDynamic: 2,
    movementLength: [2, 4],
    movementSize: [25, 35],
    intensityLength: [0.5, 1],
    fadeBeats: [0, 0.5],
  },
  peak: {
    frontMin: 0.5,
    maxParts: 5,
    maxDynamic: 3,
    movementLength: [1, 4],
    movementSize: [35, 45],
    intensityLength: [0.5, 1],
    fadeBeats: [0, 0],
  },
};

// I1, I5: a tier's typical Look level climbs by at least this over the one below.
export const MIN_TIER_CLIMB = 0.05;

// I4: Looks that may leave the front dark: Silhouette, Dark, Walk-on and the like.
export const UNLIT_FRONT_NAME = /silhouette|dark|walk-on|blackout/i;

// L3, M5: the Dark Scene.
export const DARK_NAME = /(^|[^a-z])dark([^a-z]|$)/i;

// D11, D12: Looks a tier offers to pick from.
export const MAX_LOOKS_PER_TIER = 8;

// ---------------------------------------------------------------- stage parts

export const PARTS = ['front', 'back', 'floor', 'beams', 'fx'] as const;
export type Part = (typeof PARTS)[number];

// R1, D10: Downstage counts as front light.
export const FRONT_ROWS = ['Front', 'Downstage'] as const;
export const BACK_ROWS = ['Midstage', 'Upstage'] as const;

// Roles that make up the washes (front, back, floor), the beams and the effects.
export const WASH_ROLES: readonly Role[] = ['Wash', 'Pixel/Bar'];
export const BEAM_ROLES: readonly Role[] = ['Spot/Beam'];
export const FX_ROLES: readonly Role[] = ['Effect', 'Blinder', 'Strobe'];

// ---------------------------------------------------------------- colour

// P1: saturated hues in one Look, White not counted.
export const MAX_SATURATED_HUES = 2;
// Hues this close, in degrees, count as one.
export const HUE_MERGE_DEG = 15;
// "Pale" is at most this saturation. "Saturated" is at least the next.
export const PALE_MAX_SATURATION = 0.3;
export const SATURATED_MIN_SATURATION = 0.6;
// P2: hue gaps, in degrees (0-180).
export const ANALOGOUS_MAX_DEG = 45;
export const COMPLEMENTARY_MIN_DEG = 150;
export const NEAR_MISS_DEG = [60, 120] as const;

// The hue of each hue Swatch, in degrees. White Swatches and kelvin are pale.
export const SWATCH_HUE: Partial<Record<Swatch, number>> = {
  Red: 0,
  Orange: 30,
  Amber: 40,
  Yellow: 60,
  Green: 120,
  Cyan: 180,
  Blue: 240,
  Lavender: 270,
  Magenta: 300,
  Pink: 330,
  UV: 275,
};

// The shortest distance between two hues, 0-180 degrees.
export function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// ---------------------------------------------------------------- timing

// Beat counts are read at this tempo where a Show gives none.
export const REFERENCE_BPM = 120;

// R6: the most flashes per second a sustained strobe or square Effect makes.
export const STROBE_MAX_HZ = 4;

// ---------------------------------------------------------------- scoring

// A rubric item with up to this share of its checks failing scores 1, not 0.
export const PARTIAL_SHARE = 0.25;

// ---------------------------------------------------------------- generator knobs

// Values the Show generator picks inside the bands above. The lint does not
// read them: it scores the Show that comes out.

// I1, I2: the level each part is lit to in a tier's Looks. Back climbs 40-50 %,
// 60-70 %, 85-90 %, 100 %. The front stays steady and above its I2 floor.
export const TIER_LEVELS: Record<Tier, Record<Part, number>> = {
  chill: { front: 0.4, back: 0.45, floor: 0.4, beams: 0.3, fx: 0.3 },
  groove: { front: 0.55, back: 0.65, floor: 0.5, beams: 0.5, fx: 0.5 },
  drive: { front: 0.6, back: 0.9, floor: 0.7, beams: 0.85, fx: 0.7 },
  peak: { front: 0.7, back: 1, floor: 1, beams: 1, fx: 1 },
};

// P3: the colour temperature of the pale front light, in kelvin, warmer when quiet.
export const TIER_FRONT_KELVIN: Record<Tier, number> = {
  chill: 3000,
  groove: 3400,
  drive: 3800,
  peak: 4200,
};

// T2: a Look's fade-out, in beats. A release is slower than the fade-in snaps.
export const TIER_FADE_OUT_BEATS: Record<Tier, number> = {
  chill: 4,
  groove: 2,
  drive: 1,
  peak: 0.5,
};

// The fade-in of a Look, in beats: the top of the tier's band, so a quiet
// tier is slow and Peak snaps (T2).
export const tierFadeIn = (tier: Tier): number => TIER_BANDS[tier].fadeBeats[1];

// L3: the Base Look's kelvin and levels. Warm, front and back, nothing moving.
export const BASE_KELVIN = 3200;
export const BASE_LEVELS = { front: 0.6, back: 0.5 } as const;

// Seconds a Colour Set takes to crossfade the slot colours (set between songs).
export const COLOUR_SET_FADE_S = 2;

// P6: the primary hues a mood suggests when the brief gives no band colours.
export const MOOD_PRIMARIES: Record<string, readonly Swatch[]> = {
  upbeat: ['Amber', 'Orange'],
  melancholy: ['Blue', 'Lavender'],
  aggressive: ['Red', 'Orange'],
  calm: ['Cyan', 'Green'],
  dreamy: ['Magenta', 'Lavender'],
};
export const DEFAULT_MOOD = 'upbeat';
// P2: calm moods take an analogous Secondary, the others a complementary one.
export const ANALOGOUS_MOODS: readonly string[] = ['melancholy', 'calm', 'dreamy'];

// R5, P4: the most songs that may share one Colour Set.
export const MAX_SONGS_PER_COLOUR_SET = 3;
