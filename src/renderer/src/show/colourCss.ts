import type { HeldColourSet } from '../../../shared/protocol';
import type { Colour, ColourSet, Swatch } from '../../../shared/show';

// A sample of each swatch for the screen. The Visualiser and the Fixtures show
// the real levels; this only tells colours apart in a list.
const SWATCH_CSS: Record<Swatch, string> = {
  Red: '#ff0000',
  Orange: '#ff8000',
  Amber: '#ffbf00',
  Yellow: '#ffff00',
  Green: '#00ff00',
  Cyan: '#00ffff',
  Blue: '#0000ff',
  Lavender: '#9966ff',
  Magenta: '#ff00ff',
  Pink: '#ff66b3',
  White: '#ffffff',
  'Warm White': '#ffd999',
  UV: '#4d00ff',
};

// A Colour as a CSS colour: a sample for a swatch or a white in kelvin, and
// full value for a hue and saturation.
export function colourCss(colour: Colour): string {
  if ('swatch' in colour) return SWATCH_CSS[colour.swatch];
  if ('kelvin' in colour) {
    // From warm (2700 K) to cool (6500 K).
    const cool = Math.min(1, Math.max(0, (colour.kelvin - 2700) / (6500 - 2700)));
    return `rgb(255 ${Math.round(169 + 80 * cool)} ${Math.round(87 + 166 * cool)})`;
  }
  return `hsl(${colour.hue} 100% ${100 - 50 * colour.saturation}%)`;
}

// A Colour in words, for screen readers and titles.
export function colourName(colour: Colour): string {
  if ('swatch' in colour) return colour.swatch;
  if ('kelvin' in colour) return `${colour.kelvin} K white`;
  return `hue ${Math.round(colour.hue)}, saturation ${Math.round(colour.saturation * 100)}%`;
}

// The slot colours of the held Colour Set; none when no set is held.
export type SlotColours = ColourSet['colours'] | undefined;

// The Colour Set the engine holds, from the Show's own list so that an edit of
// its colours shows at once.
export function heldSlotColours(
  sets: readonly ColourSet[],
  held: HeldColourSet | undefined,
): SlotColours {
  return held?.id === undefined ? undefined : sets.find((set) => set.id === held.id)?.colours;
}
