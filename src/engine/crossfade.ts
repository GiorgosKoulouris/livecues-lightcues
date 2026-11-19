import { clamp } from './scene-resolution';

// A crossfade from `from` to `to`, started at `since` (seconds), over `fade`
// seconds. House Groups and the Hazers each fade this way.
export interface Crossfade<T> {
  from: T;
  to: T;
  since: number;
  fade: number;
}

// How far along a crossfade is at `time` (seconds), 0–1: done at once with no
// fade.
export function crossfadeProgress({ since, fade }: Crossfade<unknown>, time: number): number {
  return fade > 0 ? clamp((time - since) / fade) : 1;
}
