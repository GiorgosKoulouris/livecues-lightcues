// The Density lint (ADR 0024): how busy a Plan is. Each project marker starts a
// section, whose tier is that of the Look held there. A section's swaps, Hits
// and colour changes are scored against the tier's floor and ceiling. The tags
// come from the Show, so an untagged Show is never scored. Report-only.
import {
  COLOUR_HIT,
  COLOUR_SET_CUES,
  DENSITY,
  DENSITY_METRICS,
  FULL_AREA_HIT,
  FULL_AREA_LIMIT,
  HIT_KINDS_MIN,
  PHRASE_BARS,
  TIERS,
  type DensityMetric,
  type Tier,
} from '../make-shows/rules';
import { COLOUR_SET_LAYER, type MidiEvent } from './compile';
import type { Plan } from './plan';
import { tierTag, type ShowMap, type ShowScene } from './show';
import { formatBarBeat, type SongTimeline } from './timeline';
import { EVENT_MARKERS, matchMarker, normaliseLabel } from './vocabulary';

/** 0 is below the floor, 1 above the ceiling, 2 between them. */
export type DensityScore = 0 | 1 | 2;

export interface SectionDensity {
  /** The marker that starts the section. */
  name: string;
  /** The song position of its start, e.g. `17.1`. */
  bar: string;
  /** Seconds from the region start. */
  time: number;
  /** Seconds. */
  duration: number;
  /** Its length in written bars. */
  bars: number;
  /** The tier of the Look held at its start. Without one it is not scored. */
  tier?: Tier;
  counts: Record<DensityMetric, number>;
  scores?: Record<DensityMetric, DensityScore>;
}

export interface DensityReport {
  sections: SectionDensity[];
  warnings: string[];
}

export const METRIC_NAMES: Record<DensityMetric, string> = {
  look: 'Look changes',
  movement: 'Movement swaps',
  pulse: 'Pulse swaps',
  colourfx: 'Colour FX swaps',
  hits: 'Hits',
  colour: 'Colour changes',
};

const EPS = 1e-6;
/** A marker this close after an event still takes it into its section, in seconds. */
const SNAP = 0.01;

const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const zeroCounts = (): Record<DensityMetric, number> => ({
  look: 0,
  movement: 0,
  pulse: 0,
  colourfx: 0,
  hits: 0,
  colour: 0,
});

/** Whether a Look lights something in another colour than the Look before it. */
function recolours(next: ShowScene | undefined, previous: ShowScene | undefined): boolean {
  const a = next?.paint ?? {};
  const b = previous?.paint ?? {};
  const set = (p: Record<string, string>) => [...new Set(Object.values(p))].sort().join('|');
  return set(a) !== set(b) || Object.keys(a).some((k) => k in b && a[k] !== b[k]);
}

/** What one event adds to its section's counts. */
type Tally = Partial<Record<DensityMetric, number>>;

/**
 * Each event with what it counts. A swap is a Layer firing another Scene than its
 * last one, so a release or a re-fire is none.
 */
function tally(events: readonly MidiEvent[], show: ShowMap, lookKey: string) {
  const last = new Map<string, string>();
  return events.map((e) => {
    const add: Tally = {};
    // The default reset sets the stage and asks for nothing: it has no plan line.
    const asked = e.line !== undefined;
    if (e.kind === 'flash') {
      add.hits = 1;
      if (COLOUR_HIT.test(e.scene ?? '')) add.colour = 1;
    } else if (e.kind === 'go' && e.scene !== undefined) {
      const previous = last.get(e.layer);
      last.set(e.layer, e.scene);
      if (e.layer === COLOUR_SET_LAYER) add.colour = 1;
      else if (previous !== e.scene) {
        if (e.layer === lookKey) {
          add.look = 1;
          const before = previous === undefined ? undefined : show.scene(previous);
          if (recolours(show.scene(e.scene), before)) add.colour = 1;
        } else if (e.layer === 'movement' || e.layer === 'pulse') add[e.layer] = 1;
        else if (e.layer === 'colourfx') {
          add.colourfx = 1;
          add.colour = 1;
        }
      }
    }
    return { event: e, add: asked ? add : {} };
  });
}

/** The Scenes running at a section's start or fired inside it. */
function elements(events: readonly MidiEvent[], from: number, to: number, lookKey: string) {
  const held = new Map<string, string>();
  const fired = new Set<string>();
  for (const e of events) {
    if (e.time >= to - SNAP) break;
    if (e.time >= from - SNAP && e.scene !== undefined) fired.add(e.scene);
    if (e.time > from + SNAP || e.kind === 'flash') continue;
    // A Look fired after a Colour FX stops it.
    if (e.layer === lookKey) held.delete('colourfx');
    if (e.scene === undefined) held.delete(e.layer);
    else held.set(e.layer, e.scene);
  }
  return new Set([...held.values(), ...fired]);
}

/** The section's tier: the tier tag of the Look held at its start. */
function tierAt(
  events: readonly MidiEvent[],
  time: number,
  show: ShowMap,
  lookKey: string,
): Tier | undefined {
  const look = events.findLast(
    (e) => e.layer === lookKey && e.kind !== 'flash' && e.time <= time + SNAP,
  );
  const tag = tierTag(show.scene(look?.scene ?? '')?.tags ?? []);
  return TIERS.find((t) => t === tag);
}

/**
 * The band scaled to the section's bars, in whole events. A section shorter than
 * a phrase rounds outward, so that one event is not judged as a rate.
 */
function score(count: number, tier: Tier, metric: DensityMetric, bars: number) {
  const [floor, , ceiling] = DENSITY[tier][metric];
  const phrases = bars / PHRASE_BARS;
  const short = phrases < 1 - EPS;
  const low = floor * phrases;
  const high = ceiling * phrases;
  const min = short ? Math.floor(low + EPS) : Math.ceil(low - EPS);
  const max = short ? Math.ceil(high - EPS) : Math.floor(high + EPS);
  const value: DensityScore = count < min ? 0 : count > max ? 1 : 2;
  return { value, min, max };
}

/** Warnings for full-area Hits that start too fast for longer than a burst. */
function fullAreaWarnings(
  events: readonly MidiEvent[],
  timeline: SongTimeline,
  where: (time: number) => string,
): string[] {
  const { maxStarts, windowSeconds, burstBeats } = FULL_AREA_LIMIT;
  const starts = events
    .filter((e) => e.kind === 'flash' && FULL_AREA_HIT.test(e.scene ?? ''))
    .map((e) => e.time);
  // Runs of start indexes that are too fast, overlapping windows joined.
  const runs: [number, number][] = [];
  for (let i = 0; i + maxStarts < starts.length; i++) {
    const end = i + maxStarts;
    if ((starts[end] as number) - (starts[i] as number) >= windowSeconds - EPS) continue;
    const run = runs.at(-1);
    if (run && i <= run[1]) run[1] = end;
    else runs.push([i, end]);
  }
  return runs.flatMap(([first, end]) => {
    const from = timeline.start + (starts[first] as number);
    const to = timeline.start + (starts[end] as number);
    const { bar, beat } = timeline.barBeatAt(from);
    if (to <= timeline.timeAt({ bar, beat: beat + burstBeats }) + EPS) return [];
    return [
      `${where(starts[first] as number)}: more than ${maxStarts} full-area Hits start within ` +
        `${windowSeconds} s, for longer than a ${burstBeats} beat burst`,
    ];
  });
}

/** The Density of a compiled Plan, or undefined for a Show without tier tags. */
export function densityReport(
  plan: Plan,
  events: readonly MidiEvent[],
  show: ShowMap,
  timeline: SongTimeline,
): DensityReport | undefined {
  if (!show.scenes.some((s) => tierTag(s.tags) !== undefined)) return undefined;
  const lookKey = show.baseLook?.layer ?? 'look';
  // The end cue closes the song and is no part of its Density. Past the region
  // start, only the default end cue has no plan line.
  const endLines = new Set(Object.values(plan.end ?? {}).map((p) => p.line));
  const isEnd = (e: MidiEvent) => (e.line === undefined ? e.time > EPS : endLines.has(e.line));
  const own = events.filter((e) => !isEnd(e));
  const counted = tally(own, show, lookKey);

  const markers = timeline.markers
    .filter((m) => !EVENT_MARKERS.some((k) => k === matchMarker(m.name)))
    .toSorted((a, b) => a.time - b.time);
  const warnings: string[] = [];
  const previous = new Map<string, { name: string; bar: string; count: number }>();

  const sections = markers.map((marker, i): SectionDensity => {
    const next = markers[i + 1]?.time ?? timeline.end;
    const from = marker.time - timeline.start;
    const to = next - timeline.start;
    const inside = counted.filter((c) => c.event.time >= from - SNAP && c.event.time < to - SNAP);
    const counts = zeroCounts();
    for (const { add } of inside) {
      for (const m of DENSITY_METRICS) counts[m] += add[m] ?? 0;
    }
    const bars = timeline.barsAt(next) - timeline.barsAt(marker.time);
    const bar = formatBarBeat(timeline.barBeatAt(marker.time));
    const tier = tierAt(own, from, show, lookKey);
    const section: SectionDensity = {
      name: marker.name,
      bar,
      time: from,
      duration: to - from,
      bars,
      counts,
      ...(tier ? { tier } : {}),
    };
    const size = `${Number(bars.toFixed(2))} bars`;
    const head = `Bar ${bar}: ${marker.name} (${tier ? `${cap(tier)}, ` : ''}${size})`;

    if (tier) {
      const below: string[] = [];
      const above: string[] = [];
      const scores = {} as Record<DensityMetric, DensityScore>;
      for (const m of DENSITY_METRICS) {
        const { value, min, max } = score(counts[m], tier, m, bars);
        scores[m] = value;
        if (value === 0) below.push(`${METRIC_NAMES[m]} ${counts[m]} (min ${min})`);
        if (value === 1) above.push(`${METRIC_NAMES[m]} ${counts[m]} (max ${max})`);
      }
      section.scores = scores;
      if (below.length) warnings.push(`${head}: below the Density floor: ${below.join(', ')}`);
      if (above.length) warnings.push(`${head}: above the Density ceiling: ${above.join(', ')}`);
      const kinds = new Set(
        inside.filter((c) => c.event.kind === 'flash').map((c) => c.event.scene),
      ).size;
      const needed = HIT_KINDS_MIN[tier];
      if (needed !== undefined && bars >= PHRASE_BARS - EPS && kinds < needed) {
        warnings.push(`${head}: too few Hit kinds: ${kinds}, needs ${needed}`);
      }
    }

    const label = normaliseLabel(marker.name);
    const count = elements(own, from, to, lookKey).size;
    const before = previous.get(label);
    if (before && count < before.count) {
      warnings.push(
        `${head}: a repeat with fewer elements than ${before.name} at ${before.bar}: ` +
          `${count} Scenes against ${before.count}`,
      );
    }
    previous.set(label, { name: marker.name, bar, count });
    return section;
  });

  if (sections.length === 0) {
    warnings.push('The Region has no section markers, so no section is scored for Density');
  }

  if (show.colourSets.length > 0) {
    const cues = own.filter((e) => e.layer === COLOUR_SET_LAYER).length;
    const { min, max } = COLOUR_SET_CUES;
    if (cues < min || cues > max) {
      warnings.push(
        `Bar 1.1: ${cues} Colour Set cues in the song, ${cues < min ? `needs ${min}` : `at most ${max}`}`,
      );
    }
  }

  const where = (time: number) => {
    const bar = formatBarBeat(timeline.barBeatAt(timeline.start + time));
    const section = sections.findLast((s) => s.time <= time + SNAP);
    return `Bar ${bar}${section ? `: ${section.name}` : ''}`;
  };
  warnings.push(...fullAreaWarnings(own, timeline, where));
  return { sections, warnings };
}
