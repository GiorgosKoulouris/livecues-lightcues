// The Hits of a generated Plan (spec: Plan generator, Hits). Each section takes
// its tier's Density of Hits: a turn Hit on its bar 1, a Riser on the bar before
// a build turns, a Strobe burst and a Blackout on a stop, and body Hits on the
// drum stem's onsets, or on the beat grid where the stem gives none. The last
// chorus adds the prism Hits and every backbeat; a repeated section takes more
// Hit kinds where its Looks and Effects add no element.
import {
  BLINDERS_PER_SONG,
  COLOUR_HIT,
  FULL_AREA_HIT,
  FULL_AREA_LIMIT,
  HIT_KINDS_MIN,
  PHRASE_BARS,
  STEM_MAX_ONSETS_PER_BEAT,
  TIERS,
  type Tier,
} from '../make-shows/rules';
import type { StemAnalysis } from './analyse';
import { aim, densityRange } from './density';
import { seededIndex } from './seed';
import { earlierPasses, isStop, lastChorus, type Span } from './sections';
import type { ShowMap } from './show';
import { formatBarBeat, type BarBeat, type SongTimeline } from './timeline';

const EPS = 1e-6;
/** The least time between two full-area Hit starts, so no window holds one too many. */
const FULL_AREA_GAP = FULL_AREA_LIMIT.windowSeconds / FULL_AREA_LIMIT.maxStarts;

const TURN_LENGTH = '1 beat';
const BODY_LENGTH = '1/2 beat';
const RISER_LENGTH = '1 bar';
const STROBE_LENGTH = '1 beat';

/** The partial Hits in the order they rotate, so that neighbours light other parts. */
const PARTIAL_ORDER = [
  'Punch beams',
  'Punch floor',
  'Side left',
  'Punch back',
  'Side right',
  'Punch front',
  'Colour Split',
  'Side front',
  'Side back',
];

/** The Show's Hit Scenes by the job each does. */
function hitKit(show: ShowMap) {
  const flashes = show.scenes.filter((s) => s.mode === 'flash').map((s) => s.name);
  const named = (pattern: RegExp) => flashes.find((name) => pattern.test(name));
  const special = /(blackout|riser|roll|strobe)$/i;
  const full = flashes.filter((n) => FULL_AREA_HIT.test(n) && !special.test(n));
  const rank = (name: string) => {
    const at = PARTIAL_ORDER.findIndex((p) => name.toLowerCase().endsWith(p.toLowerCase()));
    return at < 0 ? PARTIAL_ORDER.length : at;
  };
  const partial = flashes
    .filter((n) => !FULL_AREA_HIT.test(n) && !special.test(n))
    .toSorted((a, b) => rank(a) - rank(b));
  return {
    /** The body Hits: partial ones, else the full-area ones. */
    body: partial.length > 0 ? partial : full,
    blinder: named(/blinder$/i),
    white: named(/full white$/i),
    colours: full.filter((n) => /colour [^:]+$/i.test(n)),
    riser: named(/riser$/i),
    strobe: named(/strobe$/i),
    blackout: named(/blackout$/i),
  };
}

/** A place a Hit may start. */
interface Spot {
  at: BarBeat;
  /** Absolute seconds. */
  time: number;
  /** Written bars from the section start. */
  offset: number;
  /** Lower is picked first. */
  rank: number;
}

export interface HitEvent {
  /** Absolute seconds. */
  time: number;
  /** Whether it flashes the whole stage. */
  full: boolean;
  /** Written bars from the section start. */
  offset: number;
  /** Whether it is a body Hit, and so may take another kind. */
  body: boolean;
  section: Span;
  at: string;
  scene: string;
  length?: string;
  until?: string;
}

type Length = Pick<HitEvent, 'length' | 'until'>;

export interface HitInput {
  song: string;
  sections: Span[];
  /** Per section, the colour changes its Looks and Colour FX leave under the ceiling. */
  colourRoom: number[];
  show: ShowMap;
  timeline: SongTimeline;
  /** The drum stems' onsets. */
  stems: readonly StemAnalysis[];
  /** The elements other than Hits in a section's first `bars` bars. */
  elementsOf: (section: Span, bars: number) => number;
}

export interface Hits {
  events: HitEvent[];
  /** Body Hits on a stem onset, and on the beat grid. */
  onStem: number;
  onGrid: number;
}

class Placer {
  private readonly kit;
  /** Whether the Show has only full-area Hits for the body. */
  private readonly bodyIsFull: boolean;
  private readonly events: HitEvent[] = [];
  private onStem = 0;
  private onGrid = 0;
  private readonly last: Span | undefined;

  constructor(private readonly input: HitInput) {
    this.kit = hitKit(input.show);
    this.bodyIsFull = this.kit.body.every((n) => FULL_AREA_HIT.test(n));
    this.last = lastChorus(input.sections);
  }

  /**
   * The body Hits a section rotates through. The prism Hits are the last
   * chorus's own, unless the other sections would then run short of kinds.
   */
  private kinds(section: Span): string[] {
    const { body } = this.kit;
    const prism = body.filter((n) => /prism/i.test(n));
    const others = body.filter((n) => !prism.includes(n));
    if (section === this.last) return [...prism, ...others];
    const spare = others.length >= (HIT_KINDS_MIN.peak ?? 0);
    return prism.length > 0 && spare ? others : body;
  }

  private spot(section: Span, at: BarBeat, rank: number): Spot {
    const { timeline } = this.input;
    const time = timeline.timeAt(at);
    return { at, time, offset: timeline.barsAt(time) - (section.bar - 1), rank };
  }

  /** Places a Hit. A body Hit is added with no Scene, and named once all are placed. */
  private add(section: Span, spot: Spot, scene: string, span: Length): void {
    const full = scene ? FULL_AREA_HIT.test(scene) : this.bodyIsFull;
    this.events.push({
      time: spot.time,
      full,
      offset: spot.offset,
      body: span.length === BODY_LENGTH,
      section,
      at: formatBarBeat(spot.at),
      scene,
      ...span,
    });
  }

  /** Whether a Hit here keeps a beat from every other Hit. */
  private free(spot: Spot): boolean {
    const { bar, beat } = spot.at;
    const oneBeat = this.input.timeline.timeAt({ bar, beat: beat + 1 }) - spot.time;
    return this.events.every((e) => Math.abs(e.time - spot.time) >= oneBeat - EPS);
  }

  /** Whether a full-area Hit may start here. */
  private clearOfFullArea(time: number): boolean {
    return this.events.every((e) => !e.full || Math.abs(e.time - time) >= FULL_AREA_GAP - EPS);
  }

  /** Whether a Hit of `scene` may start here, given the full-area rate. */
  private clearFor(scene: string, time: number): boolean {
    return !FULL_AREA_HIT.test(scene) || this.clearOfFullArea(time);
  }

  /**
   * The Strobe burst and Blackout of a stop; a blackout takes no Strobe. A Strobe
   * too close to another full-area Hit is left out.
   */
  private stop(section: Span, next: Span | undefined): void {
    const { strobe, blackout } = this.kit;
    let beat = 1;
    const first = this.spot(section, { bar: section.bar, beat }, 0);
    if (section.kind === 'stop' && strobe && this.clearFor(strobe, first.time)) {
      this.add(section, first, strobe, { length: STROBE_LENGTH });
      beat = 2;
    }
    if (!blackout) return;
    const start = this.spot(section, { bar: section.bar, beat }, 0);
    const { timeline } = this.input;
    const to = next ? timeline.timeAt({ bar: next.bar, beat: 1 }) : timeline.end;
    if (start.time >= to - EPS) return;
    const span = next ? { until: String(next.bar) } : { length: `${Math.ceil(section.bars)} bars` };
    this.add(section, start, blackout, span);
  }

  /** Whether a section builds into the next, so its last bar takes a Riser. */
  private rises(section: Span, next: Span | undefined): boolean {
    if (!next || isStop(next.kind)) return false;
    const level = (s: Span) => TIERS.indexOf(s.tier as Tier);
    return section.kind === 'build' || section.kind === 'pre' || level(next) > level(section);
  }

  /**
   * The Hits a section takes: its tier's aim, and at least the Riser it needs.
   * The last chorus takes the ceiling, which holds its backbeats.
   */
  private count(section: Span, riser: boolean): number {
    const tier = section.tier as Tier;
    const { max } = densityRange(tier, 'hits', section.bars);
    if (section === this.last) return max;
    return Math.min(max, Math.max(riser ? 1 : 0, aim(tier, 'hits', section.bars)));
  }

  /** The turn Hit of a Drive or Peak section that gets no Blinder. */
  private loudTurn(section: Span, room: number): string | undefined {
    if (this.kit.white) return this.kit.white;
    const { colours } = this.kit;
    if (room <= 0 || colours.length === 0) return undefined;
    return colours[seededIndex(this.seed(section, 'turn'), colours.length)];
  }

  private seed(section: Span, what: string): string {
    return `${this.input.song}|${section.label}|${section.bar}|${what}`;
  }

  /** The sections whose turn Hit is a Blinder: Peak first, then Drive. */
  private blinderSections(turns: Span[]): Set<Span> {
    const loud = [
      ...turns.filter((s) => s.tier === 'peak'),
      ...turns.filter((s) => s.tier === 'drive'),
    ];
    return new Set(this.kit.blinder ? loud.slice(0, BLINDERS_PER_SONG) : []);
  }

  /** Every whole beat of a section before `until` bars into it. */
  private grid(section: Span, until: number): Spot[] {
    const out: Spot[] = [];
    for (let bar = section.bar; bar - section.bar < until - EPS; bar++) {
      for (let beat = 1; beat <= this.beatsIn(bar); beat++) {
        const spot = this.spot(section, { bar, beat }, this.rank(section, { bar, beat }));
        if (spot.offset < until - EPS) out.push(spot);
      }
    }
    return out;
  }

  /** Downbeats first, then the backbeats of a phrase's second half, then the rest. */
  private rank(section: Span, { bar, beat }: BarBeat): number {
    if (Math.abs(beat - Math.round(beat)) > EPS) return 4;
    if (Math.round(beat) === 1) return 0;
    if (Math.round(beat) % 2 !== 0) return 3;
    return (bar - section.bar) % PHRASE_BARS >= PHRASE_BARS / 2 ? 1 : 2;
  }

  /** The beats in a bar of the song. */
  private beatsIn(bar: number): number {
    return this.input.timeline.signatures.findLast((s) => s.bar <= bar)?.num ?? 4;
  }

  /**
   * The stem onsets of a section before `until` bars into it. A bar too dense in
   * a stem gives none from that stem. A breakdown follows the riff: any onset is
   * as good as any other, the kick stem's first.
   */
  private onsets(section: Span, until: number): Spot[] {
    const out = new Map<string, Spot>();
    for (const stem of this.input.stems) {
      const perBar = new Map<number, number>();
      for (const { position } of stem.onsets) {
        perBar.set(position.bar, (perBar.get(position.bar) ?? 0) + 1);
      }
      const inside = stem.onsets
        .filter(
          ({ position }) =>
            (perBar.get(position.bar) ?? 0) <=
            this.beatsIn(position.bar) * STEM_MAX_ONSETS_PER_BEAT,
        )
        .map((o) => this.spot(section, o.position, this.rank(section, o.position)));
      for (const spot of inside) {
        if (spot.offset < -EPS || spot.offset >= until - EPS) continue;
        if (section.kind === 'breakdown') spot.rank = /kick/i.test(stem.name) ? 0 : 1;
        const key = formatBarBeat(spot.at);
        const known = out.get(key);
        if (!known || spot.rank < known.rank) out.set(key, spot);
      }
    }
    return [...out.values()];
  }

  /** The spots body Hits may take before `until` bars in: the onsets, then the grid. */
  private spots(section: Span, until: number): Spot[][] {
    const byRank = (a: Spot, b: Spot) => a.rank - b.rank || a.time - b.time;
    return [this.onsets(section, until), this.grid(section, until)].map((s) => s.toSorted(byRank));
  }

  private usable(spot: Spot): boolean {
    return this.free(spot) && (!this.bodyIsFull || this.clearOfFullArea(spot.time));
  }

  /** Adds a body Hit on the first usable spot that `fits`, an onset before a grid beat. */
  private takeBody(
    section: Span,
    spots: Spot[][],
    fits: (spot: Spot) => boolean,
    scene = '',
  ): boolean {
    for (const [i, list] of spots.entries()) {
      const spot = list.find((s) => fits(s) && this.usable(s));
      if (!spot) continue;
      this.add(section, spot, scene, { length: BODY_LENGTH });
      if (i === 0) this.onStem++;
      else this.onGrid++;
      return true;
    }
    return false;
  }

  /** The last chorus's pattern: every downbeat, then each phrase's second-half backbeats. */
  private pattern(section: Span, until: number): BarBeat[] {
    const downbeats: BarBeat[] = [];
    const backbeats: BarBeat[] = [];
    for (let bar = section.bar; bar - section.bar < until - EPS; bar++) {
      downbeats.push({ bar, beat: 1 });
      if ((bar - section.bar) % PHRASE_BARS < PHRASE_BARS / 2) continue;
      for (let beat = 2; beat <= this.beatsIn(bar); beat += 2) backbeats.push({ bar, beat });
    }
    return [...downbeats, ...backbeats];
  }

  /**
   * Places `count` body Hits, unnamed. The last chorus takes its pattern first.
   * Otherwise the section is cut into equal stretches, one per Hit, and each
   * takes its best free onset, else its best free grid beat. Stretches that had
   * neither are made up from anywhere in the section.
   */
  private placeBody(section: Span, until: number, count: number, taken: number): void {
    const spots = this.spots(section, until);
    let placed = 0;
    // A Hit is added as it is picked, so that the next keeps its beat from it.
    const take = (fits: (spot: Spot) => boolean): void => {
      if (this.takeBody(section, spots, fits)) placed++;
    };
    const within = (from: number, to: number) => (s: Spot) =>
      s.offset >= from - EPS && s.offset < to - EPS;
    if (section === this.last) {
      const [onsets] = spots as [Spot[], Spot[]];
      for (const at of this.pattern(section, until)) {
        const on = (s: Spot) => s.at.bar === at.bar && Math.abs(s.at.beat - at.beat) < EPS;
        // A bar the stems play in takes the pattern's beat only on an onset.
        const played = onsets.some((s) => s.at.bar === at.bar);
        if (placed < count) take((s) => on(s) && (!played || onsets.includes(s)));
      }
    } else {
      // The turn Hit takes the first stretch.
      const stretches = count + taken;
      for (let i = taken; i < stretches; i++) {
        take(within((i * until) / stretches, ((i + 1) * until) / stretches));
      }
    }
    for (let before = -1; placed < count && placed > before;) {
      before = placed;
      take(within(0, until));
    }
  }

  /** Names the body Hits of a section in time order, rotating through the kinds. */
  private nameBody(section: Span): void {
    const body = this.kinds(section);
    // The last chorus starts at the head of its list, where the prism Hits are.
    let next = section === this.last ? 0 : seededIndex(this.seed(section, 'hits'), body.length);
    const unnamed = this.events
      .filter((e) => e.section === section && e.scene === '')
      .toSorted((a, b) => a.time - b.time);
    for (const event of unnamed) {
      event.scene = body[next % body.length] as string;
      next++;
    }
  }

  /** The distinct Hit Scenes a section fires in its first `bars` bars. */
  private fired(section: Span, bars: number): Set<string> {
    const inside = this.events.filter((e) => e.section === section && e.offset < bars - EPS);
    return new Set(inside.map((e) => e.scene));
  }

  /**
   * Gives a section one more Hit kind in its first `bars` bars: a body Hit that
   * doubles another takes it, else an added body Hit does. A kind the body
   * rotates through comes before a colour Hit, which flashes the whole stage.
   */
  private addKind(section: Span, bars: number): boolean {
    const have = this.fired(section, bars);
    const unused = (names: string[]) => names.filter((n) => !have.has(n));
    // A colour Hit counts as a colour change too, so those come last.
    const body = unused(this.kinds(section)).toSorted(
      (a, b) => Number(COLOUR_HIT.test(a)) - Number(COLOUR_HIT.test(b)),
    );
    const inside = this.events.filter((e) => e.section === section && e.offset < bars - EPS);
    const doubles = inside.filter(
      (e) => e.body && inside.some((other) => other !== e && other.scene === e.scene),
    );
    const all = this.events.filter((e) => e.section === section);
    const room = all.length < densityRange(section.tier as Tier, 'hits', section.bars).max;
    const riser = all.some((e) => e.scene === this.kit.riser);
    const until = Math.min(bars, riser ? section.bars - 1 : section.bars);
    return [...new Set([...body, ...unused(this.kit.colours)])].some((kind) => {
      const full = FULL_AREA_HIT.test(kind);
      const double = doubles.findLast((e) => !full || this.clearOfFullArea(e.time));
      if (double) {
        double.scene = kind;
        double.full = full;
        return true;
      }
      if (!room) return false;
      const fits = (s: Spot) => s.offset < until - EPS && this.clearFor(kind, s.time);
      return this.takeBody(section, this.spots(section, until), fits, kind);
    });
  }

  /** Adds Hit kinds to each repeat until it has more elements than the pass before it. */
  private stepUpRepeats(): void {
    const { sections, elementsOf } = this.input;
    for (const section of sections) {
      const previous = earlierPasses(sections, section).at(-1);
      if (isStop(section.kind) || !previous) continue;
      const bars = Math.min(section.bars, previous.bars);
      const count = (s: Span) => elementsOf(s, bars) + this.fired(s, bars).size;
      const target = count(previous);
      while (count(section) <= target && this.addKind(section, bars));
    }
  }

  run(): Hits {
    const { sections, colourRoom } = this.input;
    const plans = sections.map((section, i) => {
      const next = sections[i + 1];
      if (isStop(section.kind)) return { section, next, riser: false, turn: false, body: 0 };
      // A Riser holds the section's last bar, up to the turn.
      const wantsRiser = this.kit.riser !== undefined && this.rises(section, next);
      const count = this.count(section, wantsRiser);
      const riser = wantsRiser && count > 0;
      // A one-bar section's Riser starts on its bar 1, where the turn Hit would be.
      const covered = riser && section.bars <= 1 + EPS;
      const turn = !covered && count - (riser ? 1 : 0) > 0;
      const body = covered ? 0 : count - (riser ? 1 : 0) - (turn ? 1 : 0);
      return { section, next, riser, turn, body };
    });

    // The fixed Hits go in first, so that the body Hits keep clear of them all.
    for (const { section, next } of plans) {
      if (isStop(section.kind)) this.stop(section, next);
    }
    const blinders = this.blinderSections(plans.filter((p) => p.turn).map((p) => p.section));
    plans.forEach((plan, i) => {
      const { section, next, riser } = plan;
      if (riser && next) {
        const start = this.spot(section, { bar: next.bar - 1, beat: 1 }, 0);
        this.add(section, start, this.kit.riser as string, { length: RISER_LENGTH });
      }
      if (!plan.turn) return;
      const loud = section.tier === 'drive' || section.tier === 'peak';
      const named = blinders.has(section)
        ? this.kit.blinder
        : loud
          ? this.loudTurn(section, colourRoom[i] ?? 0)
          : undefined;
      // A turn too close to another full-area Hit takes the first body Hit, if
      // that one is clear; else its place goes to the body.
      const start = this.spot(section, { bar: section.bar, beat: 1 }, 0);
      const fallback = this.kinds(section)[0];
      const scene = [named, fallback].find(
        (s): s is string => s !== undefined && this.clearFor(s, start.time),
      );
      if (scene) {
        this.add(section, start, scene, { length: TURN_LENGTH });
      } else if (named ?? fallback) {
        plan.turn = false;
        plan.body++;
      }
    });

    for (const { section, riser, turn, body } of plans) {
      if (body <= 0 || this.kit.body.length === 0) continue;
      const until = riser ? section.bars - 1 : section.bars;
      this.placeBody(section, until, body, turn ? 1 : 0);
      this.nameBody(section);
    }
    this.stepUpRepeats();
    return {
      events: this.events.toSorted((a, b) => a.time - b.time),
      onStem: this.onStem,
      onGrid: this.onGrid,
    };
  }
}

export function placeHits(input: HitInput): Hits {
  return new Placer(input).run();
}
