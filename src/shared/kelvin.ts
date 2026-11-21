// How a Fixture shows a white in kelvin (a Colour `{ kelvin }`), from its
// channels. Shared by the engine, which translates it, and the Venue Check,
// which notes the Fixtures that can only approximate it.
import type { Channel, Emitter } from './fixture-profile';
import { KELVIN_RANGE } from './colour';

// How one Fixture shows a kelvin white:
// - `cct`: a colour temperature channel, or warm and cold white emitters, so
//   the temperature is made exactly.
// - `mixed`: red, green and blue (with white or amber) mix it.
// - `wheel`: only a colour wheel, so the nearest white or CTO/CTB slot is
//   used. An approximation.
// - `none`: no colour control; it stays as it is.
export type KelvinSupport = 'cct' | 'mixed' | 'wheel' | 'none';

export function kelvinSupport(channels: Channel[]): KelvinSupport {
  const capabilities = channels.flatMap((channel) =>
    channel.kind === 'control' ? channel.ranges.map((r) => r.capability) : [],
  );
  const emitters = new Set<Emitter>(
    capabilities.flatMap((c) => (c.type === 'emitter' ? [c.emitter] : [])),
  );
  if (capabilities.some((c) => c.type === 'wheelSlot')) return 'wheel';
  if (emitters.has('red') && emitters.has('green') && emitters.has('blue')) return 'mixed';
  if (capabilities.some((c) => c.type === 'colourTemperature')) return 'cct';
  if (emitters.has('warmWhite') && emitters.has('coldWhite')) return 'cct';
  return 'none';
}

// Where `kelvin` falls across a span, 0 at its start and 1 at its end; the
// whole kelvin range when none is given. Clamped.
export function kelvinFraction(kelvin: number, span: readonly [number, number] = KELVIN_RANGE) {
  const [a, b] = span;
  if (a === b) return 0;
  return Math.min(1, Math.max(0, (kelvin - a) / (b - a)));
}
