// Effects: where a movement Effect turns a moving Fixture from its base aim,
// in degrees, how an intensity Effect scales its intensity, and which colours
// a colour Effect mixes, at a point in the Tempo's beat count. Pure.
import type { Turn } from '../shared/aim';
import type {
  ColourEffect,
  IntensityEffect,
  IntensityShape,
  MovementEffect,
  RuleColour,
  Spread,
} from '../shared/show';
import type { StagePosition } from '../shared/venue-patch';

// The turn an Effect gives a Fixture at `beat`. `delay` is how far behind the
// cycle the Fixture runs under the Effect's Spread, 0–1. `fan` is where the
// Fixture stands across the targeted ones, -1 to 1 (see `fanPosition`); only a
// Fan uses it.
export function effectTurn(
  { shape, size, length }: MovementEffect,
  beat: number,
  delay: number,
  fixtureId: string,
  fan = 0,
): Turn {
  // Cycles run so far.
  const cycle = beat / length - delay;
  const wave = (cycles: number, offset = 0) => Math.sin(2 * Math.PI * (cycles * cycle + offset));
  switch (shape) {
    case 'Circle':
      return { pan: size * wave(1), tilt: size * wave(1, 0.25) };
    case 'Pan sweep':
      return { pan: size * wave(1), tilt: 0 };
    case 'Tilt sweep':
      return { pan: 0, tilt: size * wave(1) };
    case 'Fan': {
      // A half-sine over each length: closed at its start and end, open at
      // the half. The Fixture stays on its own side of centre.
      const phase = cycle - Math.floor(cycle);
      return { pan: size * fan * Math.sin(Math.PI * phase), tilt: 0 };
    }
    case 'Figure-8':
      return { pan: size * wave(1), tilt: size * wave(2) };
    case 'Ballyhoo': {
      // Two waves per axis at whole cycles, so it repeats each cycle, with
      // offsets of the Fixture's own. The weights add up to 1: at most `size`.
      // The Speed limit takes its peak speed from them (shared/speed-limit).
      const [a, b, c, d] = seeded(fixtureId, 4);
      return {
        pan: size * (0.6 * wave(1, a) + 0.4 * wave(2, b)),
        tilt: size * (0.6 * wave(1, c) + 0.4 * wave(3, d)),
      };
    }
  }
}

// Where a Fixture stands for a Fan, -1 to 1: its signed distance from centre
// stage (x = 0) as a share of the farthest targeted Fixture's, so the
// outermost one reaches the Effect's size. 0 if none is off the centre line.
export function fanPosition(fixture: StagePosition, targeted: StagePosition[]): number {
  const farthest = Math.max(0, ...targeted.map(({ x }) => Math.abs(x)));
  return farthest === 0 ? 0 : fixture.x / farthest;
}

// How much an intensity Effect scales a Fixture's intensity at `beat`, 0–1.
// `delay` is as for `effectTurn`. `positions` is how many Spread positions the
// targeted Fixtures take: a Chase lights its width of them (one by default,
// at least one) of each cycle, and with one position is a Square. A Random
// steps `positions` times a cycle (twice with one position) and lights its
// width's share of the targeted Fixtures on each, picked by `fixture`'s id
// among the ids of all the targeted, the same each cycle.
export function intensityScale(
  effect: IntensityEffect,
  beat: number,
  delay: number,
  positions: number,
  fixture?: RandomFixture,
): number {
  const { shape, depth, length, width } = effect;
  const level =
    shape === 'Random'
      ? randomLevel(cyclePhase(length, beat, 0), positions, width, fixture)
      : fullLevel(shape, cyclePhase(length, beat, delay), positions, width);
  return 1 - depth * (1 - level);
}

// A Fixture as a Random sees it: its id, and the ids of all the Fixtures the
// Effect targets.
export interface RandomFixture {
  id: string;
  targeted: string[];
}

// How many of `count` positions or Fixtures a `width` lights: its share,
// rounded up, and at least one. No width is one.
function litCount(count: number, width: number | undefined): number {
  // The epsilon keeps 1/3 of 18 at 6.
  return width === undefined ? 1 : Math.max(1, Math.ceil(count * width - 1e-9));
}

// A Random's level for a Fixture: lit when it is among the first `litCount`
// of the targeted, ordered by a seed from the step and each one's id.
function randomLevel(
  phase: number,
  positions: number,
  width: number | undefined,
  fixture: RandomFixture | undefined,
): number {
  if (!fixture) return 0;
  const step = Math.floor(phase * Math.max(positions, 2));
  const order = (id: string) => seededOne(`${step}:${id}`);
  const mine = order(fixture.id);
  const ahead = fixture.targeted.filter((id) => id !== fixture.id && order(id) < mine).length;
  return ahead < litCount(fixture.targeted.length, width) ? 1 : 0;
}

// An intensity Effect's level at full depth, `phase` into its cycle. A Random
// has none: its level goes with the Fixtures' ids (see `randomLevel`).
function fullLevel(
  shape: Exclude<IntensityShape, 'Random'>,
  phase: number,
  positions: number,
  width?: number,
): number {
  const lit = (share: number) => (phase < share ? 1 : 0);
  switch (shape) {
    case 'Pulse':
      return (1 + Math.cos(2 * Math.PI * phase)) / 2;
    case 'Ramp up':
      return phase;
    case 'Ramp down':
      return 1 - phase;
    case 'Square':
      return lit(1 / 2);
    case 'Chase':
      return lit(positions > 1 ? litCount(positions, width) / positions : 1 / 2);
  }
}

// A colour `p` (0–1) of the way from `from` to `to`.
export interface ColourMix {
  from: RuleColour;
  to: RuleColour;
  p: number;
}

// The colours a colour Effect mixes at `beat`. `delay` is as for
// `effectTurn`. A Step holds each colour for an equal share of the cycle; a
// Fade spends that share fading to the next, the last back to the first.
export function colourEffectMix(effect: ColourEffect, beat: number, delay: number): ColourMix {
  const phase = cyclePhase(effect.length, beat, delay);
  if (effect.shape === 'Rainbow') {
    const hue = { hue: phase * 360, saturation: 1 };
    return { from: hue, to: hue, p: 0 };
  }
  const { colours } = effect;
  const at = phase * colours.length;
  const index = Math.floor(at);
  const from = colours[index]!;
  if (effect.shape === 'Step') return { from, to: from, p: 0 };
  return { from, to: colours[(index + 1) % colours.length]!, p: at - index };
}

// How far into its cycle an Effect of `length` beats is at `beat`, `delay`
// of a cycle behind, 0 to under 1.
function cyclePhase(length: number, beat: number, delay: number): number {
  return (((beat / length - delay) % 1) + 1) % 1;
}

// A targeted Fixture as a Spread sees it: its stage position, and its id for
// Random.
export type SpreadFixture = StagePosition & { id: string };

// How many distinct delays a Spread gives the targeted Fixtures.
export function spreadPositions(spread: Spread, targeted: SpreadFixture[]): number {
  return new Set(targeted.map((fixture) => spreadDelay(spread, fixture, targeted))).size;
}

// What a Spread orders a Fixture by, and whether it runs the order backwards.
// Random's key is seeded from the Fixture's id, salted so it does not follow
// the Ballyhoo seeded from the same id.
function spreadOrder(spread: Spread): { key: (f: SpreadFixture) => number; reverse: boolean } {
  switch (spread) {
    case 'Left→Right':
      return { key: ({ x }) => x, reverse: false };
    case 'Right→Left':
      return { key: ({ x }) => x, reverse: true };
    case 'Mirrored':
      return { key: ({ x }) => Math.abs(x), reverse: false };
    case 'Edges→Centre':
      return { key: ({ x }) => Math.abs(x), reverse: true };
    case 'Front→Back':
      return { key: ({ y }) => y, reverse: false };
    case 'Back→Front':
      return { key: ({ y }) => y, reverse: true };
    case 'Random':
      return { key: ({ id }) => seededOne(`spread:${id}`), reverse: false };
    // Ordered by x, as Left→Right: Alternate alternates by that order.
    case 'In sync':
    case 'Alternate':
      return { key: ({ x }) => x, reverse: false };
  }
}

// How far behind the cycle a Fixture runs under a Spread, 0–1, among the
// Fixtures the Effect targets. Each Spread orders them by one key and runs
// from the lowest: Left→Right by stage x, Mirrored by |x| (centre out),
// Front→Back by stage y (the front is the lowest), Random by a seed from the
// Fixture's id. Right→Left, Edges→Centre and Back→Front run those backwards.
// Alternate gives every other one half a cycle. Fixtures at the same place in
// the order run together.
export function spreadDelay(
  spread: Spread,
  fixture: SpreadFixture,
  targeted: SpreadFixture[],
): number {
  if (spread === 'In sync') return 0;
  const { key, reverse } = spreadOrder(spread);
  const keys = [...new Set(targeted.map(key))].sort((a, b) => a - b);
  const rank = keys.indexOf(key(fixture));
  if (rank < 0) return 0;
  if (spread === 'Alternate') return (rank % 2) / 2;
  return (reverse ? keys.length - 1 - rank : rank) / keys.length;
}

// One number 0–1, the same each time for `id`.
function seededOne(id: string): number {
  return seeded(id, 1)[0]!;
}

// `count` numbers 0–1, the same each time for `id`.
function seeded(id: string, count: number): number[] {
  // FNV-1a, then a xorshift for each number.
  let state = 0x811c9dc5;
  for (const char of id) state = Math.imul(state ^ char.charCodeAt(0), 0x01000193);
  return Array.from({ length: count }, () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  });
}
