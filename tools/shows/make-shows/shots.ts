// Pure helpers of `show:shots`: the arguments, and which Scenes make the key
// shots of a Show. The Playwright run is in `e2e/show-shots.ts`.
import type { Scene, Show } from '../../../src/shared/show';
import { TIER_BANDS, TIERS, type Tier } from './rules';
import { tierOf } from './show-lint';

export interface ShotArgs {
  show: string;
  venue: string;
  out: string;
}

export interface KeyShot {
  /** Slug of the PNG name. */
  name: string;
  /** Scene names to fire together, the Look first. */
  scenes: string[];
}

const USAGE = 'Usage: npm run show:shots -- <show.lcshow> <venue.lcvenue> --out <folder>';

export function parseShotArgs(argv: string[]): ShotArgs {
  const out = argv.indexOf('--out');
  const outValue = out === -1 ? undefined : argv[out + 1];
  const [show, venue] = argv.filter((_, i) => i !== out && i !== out + 1);
  if (!show || !venue || !outValue) throw new Error(USAGE);
  return { show, venue, out: outValue };
}

/** `03-chill-look.png`: the position keeps a folder in shot order. */
export function shotFile(index: number, name: string): string {
  return `${String(index + 1).padStart(2, '0')}-${name}.png`;
}

const isLook = (scene: Scene): boolean => scene.tags.includes('look');
const isDynamic = (scene: Scene): boolean => scene.tags.includes('dynamic');

/**
 * Base, one Look per tier, Silhouette, and a combo for Drive (the chorus) and
 * Peak. A combo is the tier's Look plus the first dynamic Scene on each other
 * Layer, up to the tier's cap. The Look is the one lighting the most parts,
 * as the Cue Sheet's chorus and peak Looks do. A shot the Show cannot make is
 * left out.
 */
export function keyShots(show: Show): KeyShot[] {
  const shots: KeyShot[] = [];
  const base = show.scenes.find((s) => s.id === show.baseLook);
  if (base) shots.push({ name: 'base', scenes: [base.name] });

  const parts = (scene: Scene): number => scene.tags.filter((t) => t.startsWith('part:')).length;
  const looks = (tier: Tier): Scene[] => show.scenes.filter((s) => isLook(s) && tierOf(s) === tier);
  const richest = (tier: Tier): Scene | undefined =>
    looks(tier).reduce<Scene | undefined>(
      (best, s) => (best === undefined || parts(s) > parts(best) ? s : best),
      undefined,
    );

  for (const tier of TIERS) {
    const look = looks(tier)[0];
    if (look) shots.push({ name: `${tier}-look`, scenes: [look.name] });
  }
  const silhouette = show.scenes.find((s) => /silhouette/i.test(s.name));
  if (silhouette) shots.push({ name: 'silhouette', scenes: [silhouette.name] });

  const combo = (tier: Tier): string[] | undefined => {
    const look = richest(tier);
    if (!look) return undefined;
    const layers = new Set<string>();
    const extras: string[] = [];
    for (const scene of show.scenes) {
      if (extras.length >= TIER_BANDS[tier].maxDynamic) break;
      if (tierOf(scene) !== tier || !isDynamic(scene) || layers.has(scene.layer)) continue;
      layers.add(scene.layer);
      extras.push(scene.name);
    }
    return [look.name, ...extras];
  };
  const chorus = combo('drive');
  if (chorus) shots.push({ name: 'chorus-combo', scenes: chorus });
  const peak = combo('peak');
  if (peak) shots.push({ name: 'peak-combo', scenes: peak });
  return shots;
}
