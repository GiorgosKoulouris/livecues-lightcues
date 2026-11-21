// The lighting rule thresholds, in one place. `show-lint.ts` scores a Show
// against them and the Show generator builds to them. Rule IDs (P1, M4, ...)
// refer to the rules catalogue in the show generator research. Plain data and
// small helpers only: no app imports beyond types and the shared strobe maths.
import type { Role } from '../../src/shared/fixture-profile';
import type { Swatch } from '../../src/shared/colour';
import { NO_EFFECT, type Rule, type RuleTarget } from '../../src/shared/show';
import { strobeHz } from '../../src/shared/strobe';
import type { Zone, ZoneRow } from '../../src/shared/venue-patch';

// ---------------------------------------------------------------- tiers

export const TIERS = ['chill', 'groove', 'drive', 'peak'] as const;
export type Tier = (typeof TIERS)[number];

export interface TierBand {
  // I2: the least the front is lit in a sung Look.
  frontMin: number;
  // I4: the most parts a Look lights.
  maxParts: number;
  // M4: the most dynamic Layers that stack at once.
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
export const FRONT_ROWS: readonly ZoneRow[] = ['Front', 'Downstage'];
export const BACK_ROWS: readonly ZoneRow[] = ['Midstage', 'Upstage'];
export const ALL_ROWS: readonly ZoneRow[] = ['Front', 'Downstage', 'Midstage', 'Upstage'];
export const COLUMNS = ['Stage Right', 'Centre', 'Stage Left'] as const;

// Roles that make up the washes (front, back, floor) and the beams.
export const WASH_ROLES: readonly Role[] = ['Wash', 'Pixel/Bar'];
export const BEAM_ROLES: readonly Role[] = ['Spot/Beam'];
// The fx part is the Effect Role only. A Blinder is a Hit (R5) and a Strobe is
// for drops and endings (R6), so no sustained Look lights either one.
export const FX_ROLES: readonly Role[] = ['Effect'];

/** What makes up a stage part: its Roles, and the rows and level it sits in. Beams and fx sit anywhere. */
export interface PartDef {
  roles: readonly Role[];
  rows?: readonly ZoneRow[];
  level?: Zone['level'];
}

// The one map from a part to Roles and Zones, for the generator (what a Rule
// targets), the lint (what a Rule covers) and the venue summary (what the rig has).
export const PART_DEFS: Record<Part, PartDef> = {
  front: { roles: WASH_ROLES, rows: FRONT_ROWS, level: 'Overhead' },
  back: { roles: WASH_ROLES, rows: BACK_ROWS, level: 'Overhead' },
  floor: { roles: WASH_ROLES, rows: ALL_ROWS, level: 'Floor' },
  beams: { roles: BEAM_ROLES },
  fx: { roles: FX_ROLES },
};

/** Whether a Fixture of `role` in `zone` is in `part`. */
export function inPart(part: Part, role: Role, zone: Zone): boolean {
  const def = PART_DEFS[part];
  return (
    def.roles.includes(role) &&
    (def.rows === undefined || def.rows.includes(zone.row)) &&
    (def.level === undefined || def.level === zone.level)
  );
}

/** The Roles and Zones a Rule targets to light `part`. Never a Fixture. */
export function partTarget(part: Part): RuleTarget {
  const { roles, rows, level } = PART_DEFS[part];
  return {
    roles: [...roles],
    ...(rows !== undefined && level !== undefined
      ? { zones: rows.flatMap((row) => COLUMNS.map((column) => ({ row, column, level }))) }
      : {}),
  };
}

/** Whether `target` takes in a stage part. An absent role or zone list takes in all. */
export function targetCovers(target: RuleTarget, part: Part): boolean {
  const { roles, rows, level } = PART_DEFS[part];
  const roleIn = target.roles === undefined || target.roles.some((r) => roles.includes(r));
  const zoneIn =
    rows === undefined ||
    target.zones === undefined ||
    target.zones.some((z) => z.level === level && rows.includes(z.row));
  return roleIn && zoneIn;
}

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
// It is also the rate of the Brief's `strobe: capped`.
export const STROBE_MAX_HZ = 4;

/**
 * The flashes per second a Rule makes at `bpm`: its Strobe rate and its square
 * intensity Effect, 0 for each it does not set. Beat rates scale with the Tempo.
 */
export function flashHz(rule: Rule, bpm: number): { strobe: number; square: number } {
  const pulse = rule.intensityEffect;
  const square =
    pulse !== undefined && pulse !== NO_EFFECT && pulse.shape === 'Square'
      ? bpm / 60 / pulse.length
      : 0;
  return { strobe: rule.strobe === undefined ? 0 : strobeHz(rule.strobe, bpm), square };
}

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
export const MOODS = ['upbeat', 'melancholy', 'aggressive', 'calm', 'dreamy'] as const;
export type Mood = (typeof MOODS)[number];

export const MOOD_PRIMARIES: Record<Mood, readonly Swatch[]> = {
  upbeat: ['Amber', 'Orange'],
  melancholy: ['Blue', 'Lavender'],
  aggressive: ['Red', 'Orange'],
  calm: ['Cyan', 'Green'],
  dreamy: ['Magenta', 'Lavender'],
};
export const DEFAULT_MOOD: Mood = 'upbeat';
// P2: calm moods take an analogous Secondary, the others a complementary one.
export const ANALOGOUS_MOODS: readonly Mood[] = ['melancholy', 'calm', 'dreamy'];

// R5, P4: the most songs that may share one Colour Set.
export const MAX_SONGS_PER_COLOUR_SET = 3;
