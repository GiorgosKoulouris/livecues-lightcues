// The Colour model, shared by Rules and house looks. Translated per Fixture by
// the engine.

// Named colours.
export const SWATCHES = [
  'Red',
  'Orange',
  'Amber',
  'Yellow',
  'Green',
  'Cyan',
  'Blue',
  'Lavender',
  'Magenta',
  'Pink',
  'White',
  'Warm White',
  'UV',
] as const;
export type Swatch = (typeof SWATCHES)[number];

// A white's colour temperature in kelvin, from 2700 (warm) to 6500 (cool).
export const KELVIN_RANGE = [2700, 6500] as const;

// hue in degrees, 0 to under 360; saturation 0–1; kelvin 2700–6500.
export type Colour = { hue: number; saturation: number } | { swatch: Swatch } | { kelvin: number };

export function colourProblems(colour: Colour): string[] {
  if ('kelvin' in colour) {
    return inRange(colour.kelvin, KELVIN_RANGE[0], KELVIN_RANGE[1])
      ? []
      : [`kelvin must be from ${KELVIN_RANGE[0]} to ${KELVIN_RANGE[1]}`];
  }
  if ('swatch' in colour) {
    return SWATCHES.includes(colour.swatch) ? [] : [`"${colour.swatch}" is not a swatch`];
  }
  const problems: string[] = [];
  if (!inRange(colour.hue, 0, 360) || colour.hue === 360) {
    problems.push('hue must be from 0 to under 360');
  }
  if (!inRange(colour.saturation, 0, 1)) problems.push('saturation must be from 0 to 1');
  return problems;
}

// False for NaN and non-numbers.
export function inRange(value: number, min: number, max: number): boolean {
  return typeof value === 'number' && value >= min && value <= max;
}
