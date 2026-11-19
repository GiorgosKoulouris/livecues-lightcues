// The Hazers' output. They are kept apart from the Show: Scenes, Blackout, the
// Grand Master, Freeze and Blind never reach them (ADR 0018).
import type { EngineEvent, HazeFired } from '../shared/protocol';
import { findHazePreset, type Show } from '../shared/show';
import type { Point } from '../shared/dmx-point';
import type { Channel } from '../shared/fixture-profile';
import { DMX_CHANNELS, fixtureMode, patchHazers, type VenuePatch } from '../shared/venue-patch';
import { crossfadeProgress, type Crossfade } from './crossfade';
import { encodeControls, lerp, levelPoint } from './scene-resolution';

export interface HazeOptions {
  patch: () => VenuePatch;
  show: () => Show;
  // Milliseconds.
  now: () => number;
  emit: (event: EngineEvent) => void;
}

// The haze level (0–1) every Hazer follows, before each Hazer's max output.
// Firing a Haze Preset crossfades it from where it is; Haze Off goes to 0 at
// once. It is off at the start, and while the MIDI Input is lost it just goes
// on as it was.
export function createHaze({ patch, show, now, emit }: HazeOptions) {
  let fade: Crossfade<number> = { from: 0, to: 0, since: 0, fade: 0 };
  let fired: HazeFired = { type: 'off' };

  function levelNow(): number {
    return lerp(fade.from, fade.to, crossfadeProgress(fade, now() / 1000));
  }

  function emitHaze(): void {
    emit({ type: 'haze', fired });
  }

  // Goes to 0 at once.
  function off(): void {
    fade = { from: 0, to: 0, since: 0, fade: 0 };
    fired = { type: 'off' };
    emitHaze();
  }

  // Crossfades to `preset` from where the output is.
  function crossfade(id: string, level: number, seconds: number): void {
    fade = { from: levelNow(), to: level, since: now() / 1000, fade: seconds };
    fired = { type: 'preset', id };
    emitHaze();
  }

  return {
    // Off at once, when a Show or Venue Patch is opened or replaced.
    reset: off,
    // Haze Off: 0 at once, no fade.
    off,
    // Crossfades to the Haze Preset's level over its fade. Does nothing when
    // the Show lacks the Haze Preset.
    fire(id: string): void {
      const preset = findHazePreset(show(), id);
      if (!preset) return;
      crossfade(id, preset.level, preset.fade);
    },
    // After the Show is edited. The output holds, but if the held Haze Preset
    // is gone nothing is held any more, and if its level changed the output
    // crossfades to the new level over its fade.
    showEdited(): void {
      if (fired.type !== 'preset') return;
      const preset = findHazePreset(show(), fired.id);
      if (!preset) {
        fired = { type: 'none' };
        emitHaze();
      } else if (preset.level !== fade.to) {
        crossfade(preset.id, preset.level, preset.fade);
      }
    },
    emitHaze,
    // The haze level (0–1) the Hazers follow now, mid-fade too.
    level: levelNow,
    // `stage` with the Hazers written over it.
    frames: (stage: Map<number, Uint8Array>): Map<number, Uint8Array> =>
      hazerFrames(patch(), levelNow(), stage),
  };
}

// `stage`, the frames per Universe, with each Hazer's channels set for the
// haze `level` (0–1): its haze channel at the level times its max output, its
// fan at its fan level while that output is above 0, and 0 otherwise. Returns
// new frames; `stage` is not changed.
export function hazerFrames(
  patch: VenuePatch,
  level: number,
  stage: Map<number, Uint8Array>,
): Map<number, Uint8Array> {
  const hazers = patchHazers(patch);
  if (hazers.length === 0) return stage;
  const frames = new Map([...stage].map(([number, frame]) => [number, frame.slice()]));
  for (const hazer of hazers) {
    const output = level * hazer.maxOutput;
    const { channels } = fixtureMode(patch, hazer);
    let frame = frames.get(hazer.universe);
    if (!frame) frames.set(hazer.universe, (frame = new Uint8Array(DMX_CHANNELS)));
    frame.set(hazerChannels(channels, output, output > 0 ? hazer.fanLevel : 0), hazer.address - 1);
  }
  return frames;
}

// The DMX values of a Hazer's channels set to `haze` and `fan` (0–1): the
// other channels stay at their defaults.
function hazerChannels(channels: Channel[], haze: number, fan: number): number[] {
  return encodeControls(channels, (channel) => hazerPoint(channel, haze, fan));
}

// Where a Hazer's control channel is set: its haze or fan ranges, or undefined
// for any other channel.
function hazerPoint(
  { ranges }: Extract<Channel, { kind: 'control' }>,
  haze: number,
  fan: number,
): Point | undefined {
  const hazeRanges = ranges.filter((r) => r.capability.type === 'haze');
  if (hazeRanges.length > 0) return levelPoint(hazeRanges, haze);
  const fanRanges = ranges.filter((r) => r.capability.type === 'fan');
  return fanRanges.length > 0 ? levelPoint(fanRanges, fan) : undefined;
}
