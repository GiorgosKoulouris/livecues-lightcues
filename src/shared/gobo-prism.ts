// How a Fixture's gobo wheel and prism are driven. Shared because the engine
// sends them and the Venue Check and the Venue Patch editor report on them.
import type { Capability, CapabilityRange, Channel, Span } from './fixture-profile';
import { PRISM_BEHAVIOUR, type GoboSetting, type PrismSetting } from './show';

type ControlChannel = Extract<Channel, { kind: 'control' }>;

const controls = (channels: Channel[]): ControlChannel[] =>
  channels.filter((c): c is ControlChannel => c.kind === 'control');

// The gobo slot ranges of a gobo channel that are not open, in DMX order.
function goboRanges(channel: ControlChannel): CapabilityRange[] {
  return channel.ranges.filter((r) => r.capability.type === 'goboSlot' && !r.capability.open);
}

// The names of the gobo slots a mode offers, open slots left out, without
// repeats, in channel and DMX order.
export function goboSlotNames(channels: Channel[]): string[] {
  const names = controls(channels).flatMap((c) =>
    goboRanges(c).flatMap(({ capability }) =>
      capability.type === 'goboSlot' ? capability.name : [],
    ),
  );
  return [...new Set(names)];
}

// Whether a mode has a gobo wheel with a slot other than open.
export function hasGobo(channels: Channel[]): boolean {
  return goboSlotNames(channels).length > 0;
}

// Whether a mode has a prism, or a prism rotation speed.
export function hasPrism(channels: Channel[]): boolean {
  return controls(channels).some((c) =>
    c.ranges.some((r) => r.capability.type === 'prism' || r.capability.type === 'prismRotation'),
  );
}

// What a Fixture's gobo wheel and prism set on one control channel, as the
// range to send the middle of, or the rotation speed to send across its
// ranges.
export type GoboPrismDrive =
  | { kind: 'range'; range: CapabilityRange }
  | { kind: 'rotation'; ranges: CapabilityRange[]; speed: number };

// What `gobo` and `prism` set on a control channel, if anything. Gobo sends the
// slot named `slot`, else the first slot that is not open; Open sends the open
// slot. Prism On sends in, Off out; a rotation sends the prism in too when its
// channel holds the in range. Unset settings, and ranges the channel lacks,
// leave the channel at its default.
export function goboPrismDrive(
  channel: ControlChannel,
  gobo: GoboSetting | undefined,
  slot: string | undefined,
  prism: PrismSetting | undefined,
): GoboPrismDrive | undefined {
  const { ranges } = channel;
  const ofType = <T extends CapabilityRange['capability']['type']>(type: T) =>
    ranges.flatMap((range) =>
      range.capability.type === type
        ? [{ range, capability: range.capability as Extract<Capability, { type: T }> }]
        : [],
    );
  if (gobo !== undefined) {
    const slots = ofType('goboSlot');
    const range =
      gobo === 'Open'
        ? slots.find(({ capability }) => capability.open)
        : (slots.find(({ capability }) => !capability.open && capability.name === slot) ??
          slots.find(({ capability }) => !capability.open));
    if (range) return { kind: 'range', range: range.range };
  }
  if (prism === undefined) return undefined;
  const { sends, rotation: speed } = PRISM_BEHAVIOUR[prism];
  const rotation = ofType('prismRotation');
  if (speed !== undefined && rotation.length > 0) {
    return { kind: 'rotation', ranges: rotation.map((r) => r.range), speed };
  }
  const range = ofType('prism').find(({ capability }) => capability.effect === sends);
  return range && { kind: 'range', range: range.range };
}

// A rotation range's speed span, the whole of its channel when it gives none.
export function rotationSpan({ capability }: CapabilityRange): Span {
  return (capability.type === 'prismRotation' && capability.speed) || [0, 1];
}
