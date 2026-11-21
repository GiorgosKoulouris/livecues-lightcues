// Plan to MIDI: a sorted list of note events in song time, ready to write into
// the project. Notes follow the Show's note map; `loadShow` reads it.
import { PlanError, type ScenePick, type Plan } from './plan';
import type { ShowLayer, ShowMap, ShowScene, TriggerMode } from './show';
import { TimelineError, type BarBeat, type SongTimeline } from './timeline';

export type MidiEventKind = TriggerMode;

export interface MidiEvent {
  /** Seconds from the region start. */
  time: number;
  /** Note length in seconds. */
  duration: number;
  /** The song position of `time`. */
  at: BarBeat;
  /** MIDI channel, 1-based. */
  channel: number;
  note: number;
  velocity: number;
  kind: MidiEventKind;
  /** The Layer's key, e.g. `look`. */
  layer: string;
  /** The Scene fired; absent on a release. */
  scene?: string;
  /** The plan line that asked for it; absent for the default reset and end cue. */
  line?: number;
}

export const VELOCITY = 100;
/** The `layer` of the events that cue a Colour Set. */
export const COLOUR_SET_LAYER = 'colourset';
/** The Scene on the Look Layer the end cue fires when the plan sets none. */
export const DEFAULT_END_SCENE = 'Intro/Outro: Fade';
/** A Flash with no `length` lasts this many beats. */
const DEFAULT_FLASH_BEATS = 1;
const EPS = 1e-6;

interface Span {
  amount: number;
  unit: 'beat' | 'bar';
}

function parseNumber(text: string): number | undefined {
  const m = /^(\d+)(?:\/(\d+)|\.(\d+))?$/.exec(text);
  if (!m) return undefined;
  if (m[2]) return Number(m[1]) / Number(m[2]);
  return Number(text);
}

function parseSpan(text: string, line: number, what: string): Span {
  const m = /^(\S+?)\s*(beats?|bars?)?$/i.exec(text.trim());
  const amount = m ? parseNumber(m[1] ?? '') : undefined;
  if (!m || !amount) {
    throw new PlanError(
      `Cannot read the ${what} '${text}' (try '1 beat', '1/2 beat', '2 bars')`,
      line,
    );
  }
  return { amount, unit: m[2]?.toLowerCase().startsWith('bar') ? 'bar' : 'beat' };
}

const addSpan = ({ bar, beat }: BarBeat, { amount, unit }: Span, times = 1): BarBeat =>
  unit === 'bar' ? { bar: bar + amount * times, beat } : { bar, beat: beat + amount * times };

interface Draft {
  /** Absolute seconds. */
  time: number;
  /** Absolute end of a Flash, in seconds. */
  until?: number;
  layer: ShowLayer;
  scene?: ShowScene;
  line?: number;
}

class Compiler {
  private readonly drafts: Draft[] = [];

  constructor(
    private readonly plan: Plan,
    private readonly show: ShowMap,
    private readonly timeline: SongTimeline,
  ) {}

  build(): MidiEvent[] {
    const { plan } = this;
    for (const tier of Object.values(plan.palette)) {
      for (const [key, pick] of Object.entries(tier)) this.layerPick(key, pick);
    }
    if (plan.colourSet) this.colourSet(plan.colourSet, this.timeline.start, plan.colourSet.line);
    for (const cue of plan.cues) this.cue(cue);
    for (const ev of plan.events) this.event(ev);
    for (const p of plan.patterns) this.pattern(p);
    this.reset();
    this.endCue();
    return this.finish();
  }

  private time(ref: string, line: number): number {
    let t: number;
    try {
      t = this.timeline.resolve(ref);
    } catch (e) {
      if (e instanceof TimelineError) throw new PlanError(e.message, line);
      throw e;
    }
    const { start, end } = this.timeline;
    if (t < start - EPS || t >= end - EPS) {
      throw new PlanError(`'${ref}' is outside the region`, line);
    }
    return t;
  }

  private layerOf(key: string, line: number): ShowLayer {
    const layer = this.show.layer(key);
    if (!layer) {
      const names = this.show.layers.map((l) => l.key).join(', ');
      throw new PlanError(`Unknown Layer '${key}'. The Show has: ${names}`, line);
    }
    return layer;
  }

  private sceneOf(pick: ScenePick): ShowScene {
    const scene = this.show.scene(pick.value);
    if (!scene) throw new PlanError(`Unknown Scene '${pick.value}'`, pick.line);
    return scene;
  }

  /** The Scene a Layer key names, checking that the Scene sits on that Layer. */
  private layerPick(key: string, pick: ScenePick): { layer: ShowLayer; scene?: ShowScene } {
    const layer = this.layerOf(key, pick.line);
    if (pick.release) {
      if (layer.releaseNote === undefined) {
        throw new PlanError(`The Show has no release note for the ${layer.name} Layer`, pick.line);
      }
      return { layer };
    }
    const scene = this.sceneOf(pick);
    if (scene.layer !== layer.key) {
      throw new PlanError(`Scene '${scene.name}' is not on the ${layer.name} Layer`, pick.line);
    }
    return { layer, scene };
  }

  /** A Layer key's pick that must be a Go Scene or a release, for a cue, the start or the end. */
  private goPick(
    key: string,
    pick: ScenePick,
    time: number,
    line: number | undefined,
    where: string,
  ): void {
    const { layer, scene } = this.layerPick(key, pick);
    if (scene?.mode === 'flash') {
      throw new PlanError(`'${scene.name}' is a Flash Scene; ${where} needs a Go Scene`, pick.line);
    }
    this.drafts.push({ time, layer, scene, line });
  }

  /** A Colour Set is Go only, on the channel and note the Show gives it. It is no Layer of the Show. */
  private colourSet(pick: ScenePick, time: number, line: number): void {
    const { show } = this;
    if (show.colourSets.length === 0) throw new PlanError('The Show has no Colour Sets', line);
    const set = show.colourSet(pick.value);
    if (!set) {
      const names = show.colourSets.map((s) => s.name).join(', ');
      throw new PlanError(`Unknown Colour Set '${pick.value}'. The Show has: ${names}`, line);
    }
    if (set.channel === undefined || set.note === undefined) {
      throw new PlanError(`Colour Set '${set.name}' has no MIDI note in the Show`, line);
    }
    const layer: ShowLayer = { key: COLOUR_SET_LAYER, name: 'Colour Set', channel: set.channel };
    const scene: ShowScene = {
      id: set.id,
      name: set.name,
      layer: COLOUR_SET_LAYER,
      channel: set.channel,
      note: set.note,
      mode: 'go',
      colours: [],
      tags: [],
    };
    this.drafts.push({ time, layer, scene, line });
  }

  private cue(cue: Plan['cues'][number]): void {
    const time = this.time(cue.at, cue.line);
    if (cue.colourSet) this.colourSet(cue.colourSet, time, cue.colourSet.line);
    const picks = { ...cue.picks };
    if (cue.tier) {
      const tier = this.plan.palette[cue.tier];
      if (!tier) throw new PlanError(`No palette for tier '${cue.tier}'`, cue.line);
      for (const [key, pick] of Object.entries(tier)) if (!(key in picks)) picks[key] = pick;
    }
    for (const [key, pick] of Object.entries(picks)) {
      this.goPick(key, pick, time, key in cue.picks ? pick.line : cue.line, 'a cue');
    }
  }

  private event(ev: Plan['events'][number]): void {
    const time = this.time(ev.at, ev.line);
    if (ev.releaseLayer) {
      const { layer } = this.layerPick(ev.releaseLayer.value, {
        ...ev.releaseLayer,
        release: true,
      });
      this.drafts.push({ time, layer, line: ev.line });
      return;
    }
    this.scenePlaced(ev.scene as ScenePick, time, ev);
  }

  private scenePlaced(
    pick: ScenePick,
    time: number,
    opts: { line: number; length?: string; until?: string },
  ): void {
    const scene = this.sceneOf(pick);
    const layer = this.layerOf(scene.layer, pick.line);
    if (scene.mode === 'go') {
      if (opts.length || opts.until) {
        throw new PlanError(`'${scene.name}' is a Go Scene and takes no length`, opts.line);
      }
      this.drafts.push({ time, layer, scene, line: opts.line });
      return;
    }
    let until: number;
    if (opts.until) {
      until = this.time(opts.until, opts.line);
      if (until <= time + EPS) throw new PlanError(`'until' must be after 'at'`, opts.line);
    } else {
      const span = opts.length
        ? parseSpan(opts.length, opts.line, 'length')
        : ({ amount: DEFAULT_FLASH_BEATS, unit: 'beat' } as const);
      until = this.timeline.timeAt(addSpan(this.timeline.barBeatAt(time), span));
    }
    this.drafts.push({
      time,
      until: Math.min(until, this.timeline.end),
      layer,
      scene,
      line: opts.line,
    });
  }

  private pattern(p: Plan['patterns'][number]): void {
    const { timeline } = this;
    let from: number;
    let to: number;
    if (p.in) {
      from = this.time(p.in, p.line);
      const next = [...timeline.markers]
        .sort((a, b) => a.time - b.time)
        .find((m) => m.time > from + EPS);
      to = next?.time ?? timeline.end;
    } else {
      from = this.time(p.from as string, p.line);
      to = Math.min(this.time(p.to as string, p.line), timeline.end);
    }
    const every = parseSpan(p.every, p.line, 'period');
    if (p.beat !== undefined && every.unit === 'beat') {
      throw new PlanError(
        `'beat' only places a bar period; a beat period steps from the start`,
        p.line,
      );
    }
    const beat = parseNumber(p.beat ?? '1');
    if (beat === undefined || beat < 1) {
      throw new PlanError(`Cannot read the beat '${p.beat}'`, p.line);
    }
    const start = timeline.barBeatAt(from);
    // A bar period lands on the same beat of each bar; a beat period steps from `from`.
    const origin: BarBeat = every.unit === 'bar' ? { bar: start.bar, beat } : start;
    let count = 0;
    for (let k = 0; ; k++) {
      const t = timeline.timeAt(addSpan(origin, every, k));
      if (t >= to - EPS) break;
      if (t < from - EPS) continue;
      const pick = p.scenes[count % p.scenes.length] as ScenePick;
      this.scenePlaced(pick, t, { line: p.line, length: p.length });
      count++;
    }
  }

  /**
   * Every Layer is set at the region start so a song works from cold: the Base
   * Look on Look, the Down Scene on Movement, a release on any other Layer that has
   * one. A `start` pick replaces it.
   */
  private reset(): void {
    const { show, plan, timeline } = this;
    for (const layer of show.layers) {
      if (!show.scenes.some((s) => s.layer === layer.key && s.mode === 'go')) continue;
      const taken = this.drafts.some(
        (d) => d.layer === layer && Math.abs(d.time - timeline.start) < EPS && !d.until,
      );
      if (taken) continue;
      const pick = plan.start[layer.key];
      const rest = layer.key === show.baseLook?.layer ? show.baseLook : show.downScene(layer.key);
      if (pick) {
        this.goPick(layer.key, pick, timeline.start, pick.line, 'the start');
      } else if (rest) {
        this.drafts.push({ time: timeline.start, layer, scene: rest });
      } else if (layer.releaseNote !== undefined) {
        this.drafts.push({ time: timeline.start, layer });
      }
    }
    for (const key of Object.keys(plan.start))
      this.layerOf(key, (plan.start[key] as ScenePick).line);
  }

  /** The end cue sits in the region's last 1/16 so its note stays inside the item. */
  private endCue(): void {
    const { plan, timeline } = this;
    const time = timeline.end - this.sixteenthBefore(timeline.end);
    const picks = plan.end ?? {
      look: { line: 0, value: DEFAULT_END_SCENE, release: false },
    };
    for (const [key, pick] of Object.entries(picks)) {
      this.goPick(key, pick, time, pick.line || undefined, 'the end cue');
    }
  }

  /** The length of a 1/16 note in beats of the signature at a time: den/16. */
  private sixteenthBeats(time: number): { here: BarBeat; beats: number } {
    const here = this.timeline.barBeatAt(time);
    const sig = [...this.timeline.signatures].reverse().find((s) => s.bar <= here.bar);
    return { here, beats: (sig?.den ?? 4) / 16 };
  }

  /** Seconds of the 1/16 note that ends at a time. */
  private sixteenthBefore(time: number): number {
    const { here, beats } = this.sixteenthBeats(time);
    return time - this.timeline.timeAt({ bar: here.bar, beat: here.beat - beats });
  }

  /** Seconds of the 1/16 note that starts at a time, following the tempo ahead of it. */
  private sixteenthAfter(time: number): number {
    const { here, beats } = this.sixteenthBeats(time);
    return this.timeline.timeAt({ bar: here.bar, beat: here.beat + beats }) - time;
  }

  /** Two Flash notes on one note may not overlap: the second would cut the first short. */
  private checkFlashOverlaps(): void {
    const last = new Map<string, Draft>();
    const flashes = this.drafts
      .filter((d) => d.until !== undefined && d.scene)
      .sort((a, b) => a.time - b.time);
    for (const d of flashes) {
      const key = `${d.layer.channel}:${d.scene?.note}`;
      const prev = last.get(key);
      if (prev && d.time < (prev.until as number) - EPS) {
        const first = prev.line === undefined ? '' : ` (line ${prev.line})`;
        throw new PlanError(`'${d.scene?.name}' overlaps the same Flash note${first}`, d.line);
      }
      last.set(key, d);
    }
  }

  private finish(): MidiEvent[] {
    const { timeline } = this;
    this.checkFlashOverlaps();
    const seen = new Map<string, Draft>();
    const out: MidiEvent[] = [];
    for (const d of this.drafts) {
      const key = `${d.layer.key}@${Math.round((d.time - timeline.start) * 1e5)}`;
      const clash = seen.get(key);
      if (clash) {
        const first = clash.line === undefined ? '' : ` (line ${clash.line})`;
        throw new PlanError(
          `The ${d.layer.name} Layer is already set at this time${first}`,
          d.line,
        );
      }
      seen.set(key, d);
      const at = timeline.barBeatAt(d.time);
      const note = d.scene ? d.scene.note : (d.layer.releaseNote as number);
      const full = d.until ?? d.time + this.sixteenthAfter(d.time);
      out.push({
        time: d.time - timeline.start,
        duration: Math.min(full, timeline.end) - d.time,
        at,
        channel: d.layer.channel,
        note,
        velocity: VELOCITY,
        kind: d.scene ? d.scene.mode : 'release',
        layer: d.layer.key,
        ...(d.scene ? { scene: d.scene.name } : {}),
        ...(d.line === undefined ? {} : { line: d.line }),
      });
    }
    return out.sort((a, b) => a.time - b.time || a.channel - b.channel || a.note - b.note);
  }
}

/** Compiles a plan into MIDI events for one song, sorted by time. */
export function compilePlan(plan: Plan, show: ShowMap, timeline: SongTimeline): MidiEvent[] {
  return new Compiler(plan, show, timeline).build();
}
