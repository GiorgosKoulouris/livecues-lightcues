// Song time: converts seconds to and from a region's `bar.beat` through the
// project's tempo map, ramps and time-signature changes included.
import { LightsError } from './errors';
import type { Marker, Region, RppProject, TempoPoint } from './rpp';

export interface Signature {
  num: number;
  den: number;
}

/** A position in a song. Bar 1 beat 1 is the region start; beats may be fractional. */
export interface BarBeat {
  bar: number;
  beat: number;
}

// Tolerance in quarter notes when snapping a position onto a beat line.
const EPS = 1e-6;

interface Segment {
  time: number;
  qn: number;
  bpm: number;
  /** BPM at the end of the segment: a ramp's target, else equal to `bpm`. */
  endBpm: number;
  duration: number;
}

/** Quarter notes and seconds, through tempo points with square or linear shape. */
export class TempoMap {
  private readonly segments: Segment[] = [];

  constructor(initialBpm: number, points: readonly TempoPoint[]) {
    const pts: { time: number; bpm: number; shape: TempoPoint['shape'] }[] = [...points];
    if (pts.length === 0 || (pts[0]?.time ?? 0) > 0) {
      pts.unshift({ time: 0, bpm: initialBpm, shape: 'square' });
    }
    let qn = 0;
    pts.forEach((p, i) => {
      const next = pts[i + 1];
      const duration = next ? next.time - p.time : Infinity;
      const endBpm = next && p.shape === 'linear' ? next.bpm : p.bpm;
      this.segments.push({ time: p.time, qn, bpm: p.bpm, endBpm, duration });
      if (next) qn += (duration * (p.bpm + endBpm)) / 2 / 60;
    });
  }

  /** Quarter notes from time 0 to `time` seconds. */
  quarterNotesAt(time: number): number {
    let seg = this.segments[0] as Segment;
    for (const s of this.segments) if (s.time <= time) seg = s;
    const dt = time - seg.time;
    const slope = Number.isFinite(seg.duration) ? (seg.endBpm - seg.bpm) / seg.duration : 0;
    return seg.qn + (seg.bpm * dt + (slope * dt * dt) / 2) / 60;
  }

  /** Seconds at which `qn` quarter notes have passed. */
  timeAtQuarterNotes(qn: number): number {
    let seg = this.segments[0] as Segment;
    for (const s of this.segments) if (s.qn <= qn) seg = s;
    const dq = qn - seg.qn;
    const slope = Number.isFinite(seg.duration) ? (seg.endBpm - seg.bpm) / seg.duration : 0;
    // Solves slope/2 * dt^2 + bpm * dt = 60 * dq for dt, stable when slope is 0.
    const dt = (120 * dq) / (seg.bpm + Math.sqrt(seg.bpm * seg.bpm + 120 * slope * dq));
    return seg.time + dt;
  }
}

interface Measures {
  /** Quarter notes from the region start where this signature begins. */
  qn: number;
  /** Bars before this signature begins (0-based). */
  bars: number;
  num: number;
  /** Quarter notes per beat. */
  beatQn: number;
  barQn: number;
}

export interface SongMarker {
  name: string;
  time: number;
}

export class TimelineError extends LightsError {}

/** Song bars and beats for one region. */
export class SongTimeline {
  readonly start: number;
  readonly end: number;
  readonly markers: readonly SongMarker[];
  private readonly startQn: number;
  private readonly measures: Measures[] = [];

  constructor(
    private readonly tempo: TempoMap,
    initial: Signature,
    points: readonly TempoPoint[],
    region: { start: number; end: number },
    markers: readonly SongMarker[] = [],
  ) {
    this.start = region.start;
    this.end = region.end;
    this.markers = markers;
    this.startQn = tempo.quarterNotesAt(region.start);
    // The signature at the region start, then each change inside the region.
    let current = initial;
    const changes: { time: number; sig: Signature }[] = [];
    for (const p of points) {
      if (!p.signature) continue;
      if (p.time <= region.start + 1e-9) current = p.signature;
      else if (p.time < region.end) changes.push({ time: p.time, sig: p.signature });
    }
    const entries = [{ time: region.start, sig: current }, ...changes];
    let bars = 0;
    entries.forEach(({ time, sig }, i) => {
      const qn = i === 0 ? 0 : tempo.quarterNotesAt(time) - this.startQn;
      const prev = this.measures[i - 1];
      // A signature that starts mid-bar closes the previous bar early.
      if (prev) bars = prev.bars + Math.ceil((qn - prev.qn) / prev.barQn - EPS);
      const beatQn = 4 / sig.den;
      this.measures.push({ qn, bars, num: sig.num, beatQn, barQn: sig.num * beatQn });
    });
  }

  /** The song position of a time in seconds. */
  barBeatAt(time: number): BarBeat {
    const qn = this.tempo.quarterNotesAt(time) - this.startQn;
    let m = this.measures[0] as Measures;
    for (const s of this.measures) if (s.qn <= qn + EPS) m = s;
    const bars = Math.floor((qn - m.qn) / m.barQn + EPS);
    const beat = (qn - m.qn - bars * m.barQn) / m.beatQn + 1;
    return {
      bar: m.bars + bars + 1,
      beat: Math.abs(beat - Math.round(beat)) < EPS ? Math.round(beat) : beat,
    };
  }

  /** Seconds at a song position. A beat past the bar's last carries on into the next. */
  timeAt({ bar, beat }: BarBeat): number {
    let m = this.measures[0] as Measures;
    for (const s of this.measures) if (s.bars <= bar - 1) m = s;
    const qn = m.qn + (bar - 1 - m.bars) * m.barQn + (beat - 1) * m.beatQn;
    return this.tempo.timeAtQuarterNotes(this.startQn + qn);
  }

  /** The region's length in bars, fractional when it ends mid-bar. */
  get lengthInBars(): number {
    const { bar, beat } = this.barBeatAt(this.end);
    const m =
      [...this.measures].reverse().find((s) => s.bars <= bar - 1) ?? (this.measures[0] as Measures);
    return bar - 1 + (beat - 1) / m.num;
  }

  /** The signature at each change in the region, with its start bar. */
  get signatures(): { bar: number; num: number; den: number }[] {
    return this.measures.map((m) => ({ bar: m.bars + 1, num: m.num, den: 4 / m.beatQn }));
  }

  /**
   * Seconds for a plan time. `5` and `5.3` are song bar and beat. `Chorus1`
   * is a marker, and `Chorus1 +4` or `Chorus1 -1.2` move it by whole bars and
   * beats (an offset of `4.3` is 4 bars and 3 beats). Markers match
   * case-insensitively, and a label that names several markers is an error.
   */
  resolve(ref: string): number {
    const text = ref.trim();
    const abs = /^(\d+)(?:\.(\d+))?$/.exec(text);
    if (abs) return this.timeAt({ bar: Number(abs[1]), beat: abs[2] ? Number(abs[2]) : 1 });
    const rel = /^(.+?)(?:\s+([+-])(\d+)(?:\.(\d+))?)?$/.exec(text);
    if (!rel) throw new TimelineError(`Cannot read the time '${ref}'`);
    const [, label = '', sign, bars, beats] = rel;
    const hits = this.markers.filter((m) => m.name.toLowerCase() === label.toLowerCase());
    if (hits.length === 0) throw new TimelineError(`No marker '${label}' in this region`);
    if (hits.length > 1) {
      const at = hits.map((h) => formatBarBeat(this.barBeatAt(h.time))).join(', ');
      throw new TimelineError(`Marker '${label}' is ambiguous (at ${at}); use a bar position`);
    }
    const hit = hits[0] as SongMarker;
    const here = this.barBeatAt(hit.time);
    if (!sign) return hit.time;
    const dir = sign === '-' ? -1 : 1;
    return this.timeAt({
      bar: here.bar + dir * Number(bars),
      beat: here.beat + dir * Number(beats ?? 0),
    });
  }
}

/** `5.1`, or `5.1.5` style with a trimmed decimal when the beat is fractional. */
export function formatBarBeat({ bar, beat }: BarBeat): string {
  return `${bar}.${Number(beat.toFixed(2))}`;
}

/** The timeline of one region of a project; its markers are those inside the region. */
export function regionTimeline(project: RppProject, region: Region): SongTimeline {
  const tempo = new TempoMap(project.initial.bpm, project.tempoPoints);
  const markers = project.markers.filter(
    (m: Marker) => m.time >= region.start - 1e-6 && m.time < region.end,
  );
  return new SongTimeline(tempo, project.initial, project.tempoPoints, region, markers);
}
