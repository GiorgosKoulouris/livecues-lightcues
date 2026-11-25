// The Plan generator (ADR 0024): fills each confirmed section of a song to its
// tier's Density from the Show's tagged Scenes, and writes the result as a normal
// Plan. The counts come from the same bands the Density lint scores against.
// The same inputs give the same Plan.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  DARK_NAME,
  DENSITY,
  PHRASE_BARS,
  TIER_BANDS,
  type DensityMetric,
  type Tier,
} from '../make-shows/rules';
import { densityRange } from './density';
import { LightsError } from './errors';
import { PlanError, type Plan } from './plan';
import { findRegion, readProject } from './rpp';
import { isStop, parseSections, type Section } from './sections';
import { seededIndex } from './seed';
import { loadShowFor, tierTag, type ShowMap, type ShowScene } from './show';
import { EVENT_MARKERS, matchMarker } from './vocabulary';
import { regionTimeline, type SongTimeline } from './timeline';

export class GenerateError extends LightsError {}

const EPS = 1e-6;
/** The bars between the places a Look may change. */
const LOOK_STEP = 8;
/** The bars between the places an Effect may swap. */
const EFFECT_STEP = 4;
/** A section needs at least this many bars of song to start in. */
const MIN_SECTION_BARS = 0.25;
const EFFECTS = ['movement', 'pulse', 'colourfx'] as const;
type Effect = (typeof EFFECTS)[number];
/** The Effects a cue gives up, in this order, to stay inside the stacking cap. */
const DROP_ORDER: readonly Effect[] = ['pulse', 'colourfx'];
const RELEASE = 'release';

/** A section with its length in bars, fractional where the song ends mid-bar. */
export interface Span extends Section {
  bars: number;
}

/** A Layer key to a Scene name, or `release`. */
type Picks = Record<string, string>;

interface CueDraft {
  bar: number;
  /** Set on a section's first cue. */
  section?: Span;
  picks: Picks;
}

const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The bar offsets inside a section a change may land on: 0, then each full-bar step. */
function places(bars: number, step: number): number[] {
  const out = [0];
  for (let at = step; at + 1 <= bars + EPS; at += step) out.push(at);
  return out;
}

/** `count` of the places, spread over the section from its first bar. */
const spread = (all: number[], count: number): number[] =>
  Array.from({ length: count }, (_, i) => all[Math.floor((i * all.length) / count)] as number);

/** The swaps a tier aims for over a section, kept inside the band the lint scores. */
export function aim(tier: Tier, metric: DensityMetric, bars: number): number {
  const { min, max } = densityRange(tier, metric, bars);
  const target = Math.round((DENSITY[tier][metric][1] * bars) / PHRASE_BARS);
  return Math.min(max, Math.max(min, target));
}

class Looks {
  private readonly lookKey: string;
  private readonly dark: ShowScene | undefined;
  /** The Scene each Layer is running. */
  private readonly held = new Map<string, string>();
  /** The Scene each Layer fired last, a release or not. A swap never repeats it. */
  private readonly last = new Map<string, string>();
  readonly cues: CueDraft[] = [];

  constructor(
    private readonly song: string,
    private readonly show: ShowMap,
  ) {
    this.lookKey = show.baseLook?.layer ?? 'look';
    this.dark = show.scenes.find(
      (s) => s.layer === this.lookKey && s.mode === 'go' && DARK_NAME.test(s.name),
    );
    if (show.baseLook) this.last.set(this.lookKey, show.baseLook.name);
  }

  /** The tier's Go Scenes on a Layer. A still Scene is picked only when no other is there. */
  private pool(layer: string, tier: Tier): ShowScene[] {
    const all = this.show.scenes.filter(
      (s) => s.layer === layer && s.mode === 'go' && tierTag(s.tags) === tier,
    );
    const moving = all.filter((s) => s.tags.includes('dynamic'));
    return moving.length > 0 ? moving : all;
  }

  private release(layer: string, picks: Picks): void {
    if (!this.held.delete(layer)) return;
    if (this.show.layer(layer)?.releaseNote !== undefined) picks[layer] = RELEASE;
  }

  private fire(section: Span, offset: number, layer: string, picks: Picks): void {
    const pool = this.pool(layer, section.tier as Tier).filter(
      (s) => s.name !== this.last.get(layer),
    );
    if (pool.length === 0) return;
    const seed = `${this.song}|${section.label}|${section.bar}|${layer}|${offset}`;
    const { name } = pool[seededIndex(seed, pool.length)] as ShowScene;
    picks[layer] = name;
    this.held.set(layer, name);
    this.last.set(layer, name);
  }

  /** The Dark Look with every Effect off. */
  private stop(section: Span): void {
    const picks: Picks = {};
    if (this.dark) {
      picks[this.lookKey] = this.dark.name;
      this.last.set(this.lookKey, this.dark.name);
    }
    for (const layer of EFFECTS) this.release(layer, picks);
    if (Object.keys(picks).length > 0) this.cues.push({ bar: section.bar, section, picks });
  }

  /** How often each Layer changes in a section: the bar offsets of its swaps. */
  private offsets(section: Span, tier: Tier): Map<string, number[]> {
    const { bars } = section;
    if (this.pool(this.lookKey, tier).length === 0) {
      throw new GenerateError(`The Show has no ${cap(tier)} Look`);
    }
    // Chill and Groove change Look again only where the floor asks for it.
    const busy = tier === 'drive' || tier === 'peak';
    const looks = busy ? aim(tier, 'look', bars) : densityRange(tier, 'look', bars).min;
    const lookPlaces = places(bars, LOOK_STEP);
    const out = new Map([
      [this.lookKey, spread(lookPlaces, Math.min(lookPlaces.length, Math.max(1, looks)))],
    ]);

    const effectPlaces = places(bars, EFFECT_STEP);
    const counts = new Map(
      EFFECTS.map((layer) => {
        // Every section moves: Movement swaps at least on its first bar.
        const wanted = Math.max(layer === 'movement' ? 1 : 0, aim(tier, layer, bars));
        const there = this.pool(layer, tier).length > 0;
        return [layer, there ? Math.min(effectPlaces.length, wanted) : 0];
      }),
    );
    for (const layer of DROP_ORDER) {
      const running = [...counts.values()].filter((n) => n > 0).length;
      if (running <= TIER_BANDS[tier].maxDynamic) break;
      if (densityRange(tier, layer, bars).min === 0) counts.set(layer, 0);
    }
    for (const [layer, count] of counts) out.set(layer, spread(effectPlaces, count));
    return out;
  }

  section(section: Span): void {
    if (isStop(section.kind)) return this.stop(section);
    const offsets = this.offsets(section, section.tier as Tier);
    const all = [...new Set([...offsets.values()].flat())].sort((a, b) => a - b);
    for (const offset of all) {
      const picks: Picks = {};
      for (const [layer, at] of offsets) {
        if (at.includes(offset)) this.fire(section, offset, layer, picks);
        // A Layer the section does not use goes quiet on its first bar.
        else if (offset === 0 && at.length === 0) this.release(layer, picks);
      }
      // A Look stops the Colour FX under it, so the running one is fired again.
      const colour = this.held.get('colourfx');
      if (picks[this.lookKey] && colour) picks.colourfx = colour;
      if (Object.keys(picks).length === 0) continue;
      this.cues.push({
        bar: section.bar + offset,
        ...(offset === 0 ? { section } : {}),
        picks,
      });
    }
  }

  /** The end cue: the Base Look, else Dark, with every Effect released. */
  end(): Picks {
    const picks: Picks = {};
    const rest = this.show.baseLook ?? this.dark;
    picks[this.lookKey] = rest?.name ?? RELEASE;
    for (const layer of EFFECTS) {
      if (this.show.layer(layer)?.releaseNote !== undefined) picks[layer] = RELEASE;
    }
    return picks;
  }
}

/** The sections with their lengths, checked against the song's. */
function spans(sections: Section[], timeline: SongTimeline): Span[] {
  const total = timeline.lengthInBars;
  return sections.map((section, i) => {
    if (total - (section.bar - 1) < MIN_SECTION_BARS) {
      throw new PlanError(
        `bar ${section.bar} is past the end of the song (${Number(total.toFixed(2))} bars)`,
        section.line,
      );
    }
    const next = sections[i + 1];
    const to = next ? Math.min(next.bar - 1, total) : total;
    return { ...section, bars: to - (section.bar - 1) };
  });
}

/** Where the sections and the project markers disagree: `render` scores by marker. */
function markerWarnings(sections: Span[], timeline: SongTimeline): string[] {
  const markers = timeline.markers
    .filter((m) => !EVENT_MARKERS.some((k) => k === matchMarker(m.name)))
    .map((m) => ({ name: m.name, ...timeline.barBeatAt(m.time) }));
  const unmarked = sections
    .filter((s) => !markers.some((m) => m.bar === s.bar && m.beat === 1))
    .map(
      (s) =>
        `Bar ${s.bar}: no project marker for ${s.label}, so render does not score it as a section`,
    );
  const extra = markers
    .filter((m) => !sections.some((s) => s.bar === m.bar && m.beat === 1))
    .map((m) => `Bar ${m.bar}: marker ${m.name} has no section in the sections file`);
  return [...unmarked, ...extra];
}

const quote = (text: string): string => JSON.stringify(text);
const value = (text: string): string => (text === RELEASE ? RELEASE : quote(text));
const flow = (picks: Picks): string =>
  `{ ${Object.entries(picks)
    .map(([key, v]) => `${key}: ${value(v)}`)
    .join(', ')} }`;
const tierName = (s: Section): string => (s.tier && !isStop(s.kind) ? `, ${cap(s.tier)}` : '');

/** The Plan as text: one line per pick, with a comment at each section. */
function planText(song: string, show: string, sections: Span[], looks: Looks): string {
  const cues = looks.cues.flatMap((cue) => [
    ...(cue.section ? [`  # ${cue.section.label}${tierName(cue.section)}`] : []),
    `  - at: ${quote(String(cue.bar))}`,
    ...Object.entries(cue.picks).map(([key, v]) => `    ${key}: ${value(v)}`),
  ]);
  return [
    '# Written by `lights:song generate`. Edit the highlights by hand.',
    '# `generate --force` writes over those edits.',
    `song: ${quote(song)}`,
    `show: ${quote(show)}`,
    'brief:',
    '  sections:',
    ...sections.map((s) => `    - ${quote(`Bar ${s.bar}: ${s.label}${tierName(s)}`)}`),
    'cues:',
    ...cues,
    `end: ${flow(looks.end())}`,
    '',
  ].join('\n');
}

export interface GenerateOptions {
  rpp: string;
  region: string;
  /** The Show as the Plan names it. */
  show: string;
  /** The sections file. */
  sections: string;
  force: boolean;
}

export interface Generated {
  output: string;
  warnings: string[];
  /** What the generator did, to print. */
  notes: string[];
}

/** Runs `parse`, naming the sections file in its errors. */
function fromSectionsFile<T>(parse: () => T): T {
  try {
    return parse();
  } catch (e) {
    if (e instanceof PlanError) throw new GenerateError(`Sections file: ${e.message}`);
    throw e;
  }
}

/** `Lights/<Song>.lights.yaml` beside the project. */
function planPathFor(rpp: string, song: string): string {
  const file = song.replace(/[\\/:*?"<>|]/g, '').trim() || 'Song';
  return join(dirname(rpp), 'Lights', `${file}.lights.yaml`);
}

/** Writes the Plan of one song. It never writes over a Plan without `force`. */
export function generateLights(options: GenerateOptions): Generated {
  const project = readProject(readFileSync(options.rpp, 'utf8'));
  const region = findRegion(project, options.region);
  const timeline = regionTimeline(project, region);
  const output = planPathFor(options.rpp, region.name);
  if (!options.force && existsSync(output)) {
    throw new GenerateError(`${output} already exists. Pass --force to write over it`);
  }
  const show = loadShowFor({ show: options.show } as Plan, output);
  if (!show.scenes.some((s) => tierTag(s.tags) !== undefined)) {
    throw new GenerateError(
      `${options.show} is untagged: generate needs a Show with tier: tags (a generated band Show)`,
    );
  }
  const text = readFileSync(options.sections, 'utf8');
  const sections = fromSectionsFile(() => spans(parseSections(text), timeline));

  const looks = new Looks(region.name, show);
  for (const section of sections) looks.section(section);

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, planText(region.name, options.show, sections, looks), {
    flag: options.force ? 'w' : 'wx',
  });
  return { output, warnings: markerWarnings(sections, timeline), notes: [] };
}
