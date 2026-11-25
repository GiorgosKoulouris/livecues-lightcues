// The Looks, Effect swaps and Colour Set cues of a generated Plan (spec: Plan
// generator). Each section picks Scenes of its tier on phrase boundaries, as
// many as the tier's Density asks. A repeated section reuses the Scenes of its
// earlier pass and steps up by one element.
import { DARK_NAME, TIER_BANDS, type Tier } from '../make-shows/rules';
import { COLOUR_SET_LAYER } from './compile';
import { aim, densityRange } from './density';
import { GenerateError } from './errors';
import { earlierPasses, isStop, type Span } from './sections';
import { seededIndex } from './seed';
import { tierTag, type ShowMap, type ShowScene } from './show';

const EPS = 1e-6;
/** The bars between the places a Look may change. */
const LOOK_STEP = 8;
/** The bars between the places an Effect may swap. */
const EFFECT_STEP = 4;
const EFFECTS = ['movement', 'pulse', 'colourfx'] as const;
type Effect = (typeof EFFECTS)[number];
/** The Effects a cue gives up, in this order, to stay inside the stacking cap. */
const DROP_ORDER: readonly Effect[] = ['pulse', 'colourfx'];
/** The Effects a repeat may add, in the order it tries them. */
const ADD_ORDER: readonly Effect[] = ['colourfx', 'pulse', 'movement'];
export const RELEASE = 'release';

/** A Layer key to a Scene name, or `release`. */
export type Picks = Record<string, string>;

export interface CueDraft {
  bar: number;
  /** Set on a section's first cue. */
  section?: Span;
  picks: Picks;
}

/** A Layer to the bar offsets it changes on. */
type Offsets = Map<string, number[]>;

/** One section as built. */
interface Pass {
  section: Span;
  offsets: Offsets;
  cues: CueDraft[];
  /** The Scene each Layer runs as the section starts, before its first cue. */
  before: ReadonlyMap<string, string>;
  /** The state the section leaves behind. */
  held: Map<string, string>;
  last: Map<string, string>;
}

export const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The bar offsets inside a section a change may land on: 0, then each full-bar step. */
function places(bars: number, step: number): number[] {
  const out = [0];
  for (let at = step; at + 1 <= bars + EPS; at += step) out.push(at);
  return out;
}

/** `count` of the places, spread over the section from its first bar. */
const spread = (all: number[], count: number): number[] =>
  Array.from({ length: count }, (_, i) => all[Math.floor((i * all.length) / count)] as number);

/** The options that pass `keep`, or all of them where none does. */
function prefer<T>(options: T[], keep: (option: T) => boolean): T[] {
  const kept = options.filter(keep);
  return kept.length > 0 ? kept : options;
}

export class Looks {
  private readonly lookKey: string;
  private readonly dark: ShowScene | undefined;
  /** The Scene each Layer is running. */
  private held = new Map<string, string>();
  /** The Scene each Layer fired last, a release or not. A swap never repeats it. */
  private last = new Map<string, string>();
  private readonly passes = new Map<Span, Pass>();
  readonly cues: CueDraft[] = [];
  /** Per section, the colour changes its Looks, Colour FX and sets leave under the ceiling. */
  readonly colourRoom: number[] = [];

  constructor(
    private readonly song: string,
    private readonly show: ShowMap,
    private readonly sections: readonly Span[],
    /** Colour Set names by the bar they are cued on. */
    private readonly sets: ReadonlyMap<number, string>,
  ) {
    this.lookKey = show.baseLook?.layer ?? 'look';
    this.dark = show.scenes.find(
      (s) => s.layer === this.lookKey && s.mode === 'go' && DARK_NAME.test(s.name),
    );
    if (show.baseLook) this.last.set(this.lookKey, show.baseLook.name);
    // A Colour Set cued before the first section, as Main is at bar 1.
    for (const [bar] of sets) {
      if (bar < (sections[0]?.bar ?? 1)) this.cues.push({ bar, picks: this.setPick(bar) });
    }
    for (const section of sections) this.section(section);
  }

  /** The tier's Go Scenes on a Layer. A still Scene is picked only when no other is there. */
  private pool(layer: string, tier: Tier): ShowScene[] {
    const all = this.show.scenes.filter(
      (s) => s.layer === layer && s.mode === 'go' && tierTag(s.tags) === tier,
    );
    const moving = all.filter((s) => s.tags.includes('dynamic'));
    return moving.length > 0 ? moving : all;
  }

  private release(layer: string, held: Map<string, string>, picks: Picks): void {
    if (!held.delete(layer)) return;
    if (this.show.layer(layer)?.releaseNote !== undefined) picks[layer] = RELEASE;
  }

  /** The Colour Set cue on a bar, as a pick. */
  private setPick(bar: number): Picks {
    const name = this.sets.get(bar);
    return name === undefined ? {} : { [COLOUR_SET_LAYER]: name };
  }

  /** The bar offsets of the Colour Set cues inside a section. */
  private setOffsets({ bar, bars }: Span): number[] {
    return [...this.sets.keys()].map((at) => at - bar).filter((at) => at >= 0 && at < bars);
  }

  /** The Dark Look with every Effect off. */
  private stop(section: Span): void {
    const picks = this.setPick(section.bar);
    if (this.dark) {
      picks[this.lookKey] = this.dark.name;
      this.last.set(this.lookKey, this.dark.name);
    }
    for (const layer of EFFECTS) this.release(layer, this.held, picks);
    if (Object.keys(picks).length > 0) this.cues.push({ bar: section.bar, section, picks });
  }

  /** How often each Layer changes in a section: the bar offsets of its swaps. */
  private tierOffsets(section: Span, tier: Tier): Offsets {
    const { bars } = section;
    if (this.pool(this.lookKey, tier).length === 0) {
      throw new GenerateError(`The Show has no ${cap(tier)} Look`);
    }
    // Chill and Groove change Look again only where the floor asks for it.
    const busy = tier === 'drive' || tier === 'peak';
    const looks = busy ? aim(tier, 'look', bars) : densityRange(tier, 'look', bars).min;
    const lookPlaces = places(bars, LOOK_STEP);
    const out: Offsets = new Map([
      [this.lookKey, spread(lookPlaces, Math.min(lookPlaces.length, Math.max(1, looks)))],
    ]);

    const effectPlaces = places(bars, EFFECT_STEP);
    for (const layer of EFFECTS) {
      // Every section moves: Movement swaps at least on its first bar.
      const wanted = Math.max(layer === 'movement' ? 1 : 0, aim(tier, layer, bars));
      const there = this.pool(layer, tier).length > 0;
      const count = there ? Math.min(effectPlaces.length, wanted) : 0;
      out.set(layer, spread(effectPlaces, count));
    }
    return out;
  }

  /** Adds the swaps of an earlier pass of the same tier, up to the ceiling. */
  private keepSwaps(offsets: Offsets, model: Pass, { bars }: Span, tier: Tier): void {
    for (const [layer, own] of offsets) {
      const earlier = (model.offsets.get(layer) ?? []).filter((at) => at === 0 || at + 1 <= bars);
      const metric = layer === this.lookKey ? 'look' : (layer as Effect);
      const most = Math.max(own.length, densityRange(tier, metric, bars).max);
      const union = [...new Set([...earlier, ...own])].slice(0, most);
      offsets.set(
        layer,
        union.toSorted((a, b) => a - b),
      );
    }
  }

  /** Releases Effects until the section is inside its tier's stacking cap. */
  private capStack(offsets: Offsets, model: Pass | undefined, bars: number, tier: Tier): void {
    const running = () => EFFECTS.filter((l) => offsets.get(l)?.length).length;
    // What the earlier pass did not run is given up first.
    const order = DROP_ORDER.toSorted(
      (a, b) =>
        Number(Boolean(model?.offsets.get(a)?.length)) -
        Number(Boolean(model?.offsets.get(b)?.length)),
    );
    for (const layer of order) {
      if (running() <= TIER_BANDS[tier].maxDynamic) break;
      if (densityRange(tier, layer, bars).min === 0) offsets.set(layer, []);
    }
  }

  /** The colour changes a section's Looks, Colour FX swaps and Colour Set cues make. */
  private colourUsed(offsets: Offsets, section: Span): number {
    const swaps = [this.lookKey, 'colourfx'].reduce((n, l) => n + (offsets.get(l)?.length ?? 0), 0);
    return swaps + this.setOffsets(section).length;
  }

  /**
   * Gives up Colour FX swaps, then Look changes, over the colour ceiling, down to
   * their floors. A repeat keeps a Colour FX its earlier pass ran.
   */
  private capColour(offsets: Offsets, model: Pass | undefined, section: Span, tier: Tier): void {
    const { max } = densityRange(tier, 'colour', section.bars);
    const ran = model?.offsets.get('colourfx')?.length ? 1 : 0;
    const floors = [
      ['colourfx', Math.max(ran, densityRange(tier, 'colourfx', section.bars).min)],
      [this.lookKey, Math.max(1, densityRange(tier, 'look', section.bars).min)],
    ] as const;
    for (const [layer, floor] of floors) {
      while (this.colourUsed(offsets, section) > max) {
        const at = offsets.get(layer) ?? [];
        if (at.length <= floor) break;
        offsets.set(layer, at.slice(0, -1));
      }
    }
  }

  /**
   * Fires a section's swaps. A pick of `model` is fired again where it can be;
   * a Movement Scene stays in the `family` of the first pass.
   */
  private play(
    section: Span,
    offsets: Offsets,
    model: Pass | undefined,
    family: ReadonlySet<string>,
  ): Pass {
    const held = new Map(this.held);
    const last = new Map(this.last);
    const used = new Set<string>();
    const cues: CueDraft[] = [];
    const reuse = (layer: string, offset: number): string | undefined =>
      model?.cues.find((c) => c.bar - model.section.bar === offset)?.picks[layer];

    // Swaps a Layer to another Scene of the section's tier, if it has one.
    const fire = (offset: number, layer: string, picks: Picks): void => {
      let pool = this.pool(layer, section.tier as Tier).filter((s) => s.name !== last.get(layer));
      if (pool.length === 0) return;
      const wanted = reuse(layer, offset);
      const again = pool.find((s) => s.name === wanted);
      if (layer === 'movement') pool = prefer(pool, (s) => family.has(s.shape ?? ''));
      pool = prefer(pool, (s) => !used.has(s.name));
      const seed = `${this.song}|${section.label}|${section.bar}|${layer}|${offset}`;
      const { name } = again ?? (pool[seededIndex(seed, pool.length)] as ShowScene);
      picks[layer] = name;
      used.add(name);
      held.set(layer, name);
      last.set(layer, name);
    };

    const sets = this.setOffsets(section);
    const all = [...new Set([...offsets.values(), sets].flat())].sort((a, b) => a - b);
    for (const offset of all) {
      const picks = this.setPick(section.bar + offset);
      for (const [layer, at] of offsets) {
        if (at.includes(offset)) fire(offset, layer, picks);
        // A Layer the section does not use goes quiet on its first bar.
        else if (offset === 0 && at.length === 0) this.release(layer, held, picks);
      }
      // A Look stops the Colour FX under it, so the running one is fired again.
      const colour = held.get('colourfx');
      if (picks[this.lookKey] && colour) picks.colourfx = colour;
      if (Object.keys(picks).length === 0) continue;
      cues.push({ bar: section.bar + offset, ...(offset === 0 ? { section } : {}), picks });
    }
    return { section, offsets, cues, before: this.held, held, last };
  }

  /** The Scenes and Colour Sets a pass runs or fires in its first `bars` bars. */
  private elements({ section, cues, before }: Pass, bars: number): number {
    const inside = cues.filter((c) => c.bar - section.bar < bars - EPS);
    const first = inside.find((c) => c.bar === section.bar)?.picks ?? {};
    const carried = [...before].filter(([layer]) => !(layer in first)).map(([, name]) => name);
    const fired = inside.flatMap((c) => Object.values(c.picks).filter((v) => v !== RELEASE));
    const set = [...this.sets].filter(([at]) => at <= section.bar).sort(([a], [b]) => b - a)[0];
    return new Set([...carried, ...fired, ...(set ? [set[1]] : [])]).size;
  }

  /** The Scenes and Colour Sets a built section runs or fires in its first `bars` bars. */
  elementsOf(section: Span, bars: number): number {
    const pass = this.passes.get(section);
    return pass ? this.elements(pass, bars) : 0;
  }

  /**
   * Adds an Effect to a repeat, then swaps, until it has more elements than the
   * pass before it over the bars both have.
   */
  private stepUp(pass: Pass, previous: Pass, again: (offsets: Offsets) => Pass): Pass {
    const { section } = pass;
    const tier = section.tier as Tier;
    const bars = Math.min(section.bars, previous.section.bars);
    const target = this.elements(previous, bars);
    // Bar 9 first, then the other 4-bar steps both passes have.
    const steps = places(bars, EFFECT_STEP)
      .slice(1)
      .toSorted((a, b) => Number(b === LOOK_STEP) - Number(a === LOOK_STEP) || a - b);
    const changes = [
      ...ADD_ORDER.map((layer) => ({ layer, at: 0 })),
      ...steps.flatMap((at) => EFFECTS.map((layer) => ({ layer, at }))),
    ];

    let best = pass;
    for (const { layer, at } of changes) {
      if (this.elements(best, bars) > target) break;
      const own = best.offsets.get(layer) ?? [];
      if (own.includes(at) || (at > 0 && own.length === 0)) continue;
      if (this.pool(layer, tier).length === 0) continue;
      if (own.length >= densityRange(tier, layer, section.bars).max) continue;
      const running = EFFECTS.filter((l) => best.offsets.get(l)?.length).length;
      if (own.length === 0 && running >= TIER_BANDS[tier].maxDynamic) continue;
      const colourMax = densityRange(tier, 'colour', section.bars).max;
      // The colour ceiling gives way only to a repeat that would otherwise have fewer.
      const full = this.colourUsed(best.offsets, section) >= colourMax;
      if (layer === 'colourfx' && full && this.elements(best, bars) >= target) continue;
      const offsets = new Map(best.offsets).set(
        layer,
        [...own, at].sort((a, b) => a - b),
      );
      const trial = again(offsets);
      if (this.elements(trial, bars) > this.elements(best, bars)) best = trial;
    }
    return best;
  }

  private section(section: Span): void {
    if (isStop(section.kind)) {
      this.colourRoom.push(0);
      return this.stop(section);
    }
    const tier = section.tier as Tier;
    const earlier = earlierPasses(this.sections, section).flatMap((s) => this.passes.get(s) ?? []);
    const model = earlier.findLast((p) => p.section.tier === tier);
    const previous = earlier.at(-1);
    const family = new Set(
      (earlier[0]?.cues ?? []).flatMap((c) => this.show.scene(c.picks.movement ?? '')?.shape ?? []),
    );

    const offsets = this.tierOffsets(section, tier);
    if (model) this.keepSwaps(offsets, model, section, tier);
    this.capStack(offsets, model, section.bars, tier);
    this.capColour(offsets, model, section, tier);
    const again = (changed: Offsets) => this.play(section, changed, model, family);
    let pass = again(offsets);
    if (previous) pass = this.stepUp(pass, previous, again);

    this.passes.set(section, pass);
    this.held = pass.held;
    this.last = pass.last;
    this.cues.push(...pass.cues);
    const { max } = densityRange(tier, 'colour', section.bars);
    this.colourRoom.push(max - this.colourUsed(pass.offsets, section));
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
