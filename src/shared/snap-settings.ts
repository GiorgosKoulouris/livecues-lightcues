// Snap settings: Strobe, Prism and Gobo. A Scene sets one on a Fixture at
// once, not crossfaded, and the last setting wins. One place for that rule, so
// resolution and the Venue Check cannot drift apart.
import {
  ruleTargets,
  type GoboSetting,
  type PrismSetting,
  type Scene,
  type StrobeRate,
} from './show';
import type { PatchedFixture, VenuePatch } from './venue-patch';

export interface SnapSettings {
  strobe?: StrobeRate;
  prism?: PrismSetting;
  gobo?: GoboSetting;
}

type SnapKey = keyof SnapSettings;

const KEYS: SnapKey[] = ['strobe', 'prism', 'gobo'];

// What each setting is when it does nothing.
export const SNAP_REST = { strobe: 'Off', prism: 'Off', gobo: 'Open' } as const;

// What a Scene sets on a Fixture: per key, the value from the last Rule that
// targets the Fixture and sets that key.
export function sceneSnap(patch: VenuePatch, fixture: PatchedFixture, scene: Scene): SnapSettings {
  const snap: Record<string, unknown> = {};
  for (const rule of scene.rules) {
    if (!ruleTargets(patch, fixture, rule)) continue;
    for (const key of KEYS) if (rule[key] !== undefined) snap[key] = rule[key];
  }
  return snap as SnapSettings;
}

// `below` with every key set in `above` replaced.
export function mergeSnap(below: SnapSettings, above: SnapSettings): SnapSettings {
  const merged: Record<string, unknown> = { ...below };
  for (const key of KEYS) if (above[key] !== undefined) merged[key] = above[key];
  return merged as SnapSettings;
}

// Whether a value is set and is not the setting's resting value.
export function engages(key: SnapKey, value: SnapSettings[SnapKey]): boolean {
  return value !== undefined && value !== SNAP_REST[key];
}
