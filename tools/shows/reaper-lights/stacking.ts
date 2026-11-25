// The stacking lint (rule M4): few things move at once. At each Plan cue it counts
// the Layers holding a `dynamic` Scene and compares them with the cap for the
// cue's tier. The tags come from the Show, so a Show without them is never linted.
import { TIER_BANDS, TIERS } from '../make-shows/rules';
import type { MidiEvent } from './compile';
import type { Plan } from './plan';
import { tierTag, type ShowMap } from './show';
import { formatBarBeat, type SongTimeline } from './timeline';

/** Dynamic Layers allowed at once per tier: the generator's M4 thresholds. */
export const STACK_CAPS: Record<string, number> = Object.fromEntries(
  TIERS.map((tier) => [tier, TIER_BANDS[tier].maxDynamic]),
);

export interface StackWarning {
  /** The plan line of the cue. */
  line: number;
  /** The song position of the cue, e.g. `17.1`. */
  bar: string;
  message: string;
}

const EPS = 1e-6;
const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The Go Scenes each Layer holds at a time: a later Go replaces, a Release clears. */
function held(events: readonly MidiEvent[], time: number): Map<string, string> {
  const layers = new Map<string, string>();
  for (const e of events) {
    if (e.time > time + EPS || e.kind === 'flash') continue;
    if (e.kind === 'release' || e.scene === undefined) layers.delete(e.layer);
    else layers.set(e.layer, e.scene);
  }
  return layers;
}

/** A cue's tier: its `tier`, else the tier tag of the Look it holds. */
function tierOf(plan: Plan['cues'][number], layers: Map<string, string>, show: ShowMap): string {
  if (plan.tier) return plan.tier;
  const look = show.baseLook?.layer ?? 'look';
  const tags = show.scene(layers.get(look) ?? '')?.tags ?? [];
  return tierTag(tags) ?? '';
}

/** One warning for each cue that holds more dynamic Layers than its tier allows. */
export function stackingWarnings(
  plan: Plan,
  events: readonly MidiEvent[],
  show: ShowMap,
  timeline: SongTimeline,
): StackWarning[] {
  const out: StackWarning[] = [];
  for (const cue of plan.cues) {
    const time = timeline.resolve(cue.at);
    const layers = held(events, time);
    const tier = tierOf(cue, layers, show);
    const max = STACK_CAPS[tier];
    if (max === undefined) continue;
    const dynamic = [...layers].filter(([, name]) => show.scene(name)?.tags.includes('dynamic'));
    if (dynamic.length <= max) continue;
    const bar = formatBarBeat(timeline.barBeatAt(time));
    const which = dynamic.map(([key, name]) => `${show.layer(key)?.name ?? key}: ${name}`);
    out.push({
      line: cue.line,
      bar,
      message:
        `Line ${cue.line}: Bar ${bar}: ${dynamic.length} dynamic Layers in a ${cap(tier)} cue, ` +
        `the cap is ${max} (${which.join('; ')})`,
    });
  }
  return out;
}
