// The song plan: YAML in, a checked structure out. Every error names its line.
// Scalars stay strings (the `failsafe` schema), so a time like `5.10` is read
// as bar 5 beat 10 and not as the number 5.1.
import { LightsError } from './errors';
import { LineCounter, parseDocument, isMap, isScalar, isSeq, type Node, type YAMLMap } from 'yaml';

export class PlanError extends LightsError {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(line === undefined ? message : `Line ${line}: ${message}`);
  }
}

/** A Scene name, or `release` to clear the Layer. */
export interface ScenePick {
  line: number;
  value: string;
  release: boolean;
}

export type Brief = string | Record<string, string | string[]>;

/** A Scene (or Release) per Layer at a section start. `tier` pulls Scenes from the palette. */
export interface Cue {
  line: number;
  at: string;
  tier?: string;
  /** A Colour Set to hold from this cue. */
  colourSet?: ScenePick;
  /** Layer key as written to its Pick. */
  picks: Record<string, ScenePick>;
}

/** A Scene at a time, or a Release of one Layer. A Flash Scene lasts `length` or until `until`. */
export interface TimedEvent {
  line: number;
  at: string;
  scene?: ScenePick;
  releaseLayer?: ScenePick;
  length?: string;
  until?: string;
}

/** A repeating event over a span: `from`..`to`, or the section `in` names. */
export interface Pattern {
  line: number;
  from?: string;
  to?: string;
  in?: string;
  every: string;
  /** The beat of each bar a bar period lands on. Not allowed on a beat period. */
  beat?: string;
  scenes: ScenePick[];
  length?: string;
}

export interface Plan {
  song: string;
  show?: string;
  brief?: Brief;
  /** Tier name (lower case) to Layer key to Pick. */
  palette: Record<string, Record<string, ScenePick>>;
  /** The song's Colour Set, cued at bar 1. */
  colourSet?: ScenePick;
  /** Overrides of the start-of-song reset. */
  start: Record<string, ScenePick>;
  cues: Cue[];
  events: TimedEvent[];
  patterns: Pattern[];
  /** The end cue per Layer. Absent: Intro/Outro: Fade on the Look Layer. */
  end?: Record<string, ScenePick>;
}

class Reader {
  private readonly lines = new LineCounter();
  private readonly doc;

  constructor(text: string) {
    this.doc = parseDocument(text, { schema: 'failsafe', lineCounter: this.lines });
    const [first] = this.doc.errors;
    if (first)
      throw new PlanError(first.message.split('\n')[0] ?? 'Invalid YAML', first.linePos?.[0].line);
  }

  get root(): Node | null {
    return this.doc.contents;
  }

  line(node: Node | null | undefined): number | undefined {
    const at = node?.range?.[0];
    return at === undefined ? undefined : this.lines.linePos(at).line;
  }

  fail(node: Node | null | undefined, message: string): never {
    throw new PlanError(message, this.line(node));
  }

  map(node: unknown, what: string, at?: Node | null): YAMLMap {
    if (!isMap(node)) this.fail((node as Node | null) ?? at, `${what} must be a mapping`);
    return node;
  }

  /** The entries of a mapping as key, value node and key line. */
  entries(node: YAMLMap): { key: string; value: Node | null; line: number }[] {
    return node.items.map((pair) => {
      const key = isScalar(pair.key) ? String(pair.key.value) : '';
      return { key, value: pair.value as Node | null, line: this.line(pair.key as Node) ?? 0 };
    });
  }

  text(node: unknown, what: string, at: Node | null | undefined): string {
    if (!isScalar(node) || String(node.value ?? '').trim() === '') {
      this.fail((node as Node | null) ?? at, `${what} must be a non-empty value`);
    }
    return String(node.value).trim();
  }

  pick(node: unknown, what: string, at: Node | null | undefined): ScenePick {
    const value = this.text(node, what, at);
    return {
      line: this.line(node as Node) ?? 0,
      value,
      release: value.toLowerCase() === 'release',
    };
  }

  picks(node: unknown, what: string): Record<string, ScenePick> {
    const out: Record<string, ScenePick> = {};
    for (const e of this.entries(this.map(node, what))) {
      out[e.key.toLowerCase()] = this.pick(e.value, `'${e.key}'`, e.value);
    }
    return out;
  }

  list(node: unknown, what: string): { text: string; node: Node }[] {
    const items = isSeq(node) ? node.items : [node];
    return items.map((item) => ({
      text: this.text(item, what, node as Node),
      node: item as Node,
    }));
  }
}

/** `colourset`, `colour-set` and `colour set` all name the Colour Set key. */
const isColourSetKey = (key: string): boolean => /^colour[ -]?set$/i.test(key);

const TOP = ['song', 'show', 'brief', 'palette', 'start', 'cues', 'events', 'patterns', 'end'];
const CUE = ['at', 'tier'];
const EVENT = ['at', 'scene', 'release', 'length', 'until'];
const PATTERN = ['from', 'to', 'in', 'every', 'beat', 'scene', 'alternate', 'length'];

/** Parses and checks a plan. Scene names and times are resolved later, in `compile`. */
export function parsePlan(text: string): Plan {
  const r = new Reader(text);
  const top = r.map(r.root, 'The plan', undefined);
  const plan: Plan = { song: '', palette: {}, start: {}, cues: [], events: [], patterns: [] };
  let song = false;
  for (const { key, value, line } of r.entries(top)) {
    if (isColourSetKey(key)) {
      plan.colourSet = r.pick(value, key, value);
      continue;
    }
    if (!TOP.includes(key)) throw new PlanError(`Unknown key '${key}'`, line);
    if (key === 'song') {
      plan.song = r.text(value, 'song', value);
      song = true;
    } else if (key === 'show') plan.show = r.text(value, 'show', value);
    else if (key === 'brief') plan.brief = readBrief(r, value);
    else if (key === 'palette') {
      for (const tier of r.entries(r.map(value, 'palette'))) {
        plan.palette[tier.key.toLowerCase()] = r.picks(tier.value, `palette '${tier.key}'`);
      }
    } else if (key === 'start') plan.start = r.picks(value, 'start');
    else if (key === 'end') {
      plan.end = isScalar(value) ? { look: r.pick(value, 'end', value) } : r.picks(value, 'end');
    } else if (key === 'cues') plan.cues = readList(r, value, 'cues', (n) => readCue(r, n));
    else if (key === 'events') plan.events = readList(r, value, 'events', (n) => readEvent(r, n));
    else plan.patterns = readList(r, value, 'patterns', (n) => readPattern(r, n));
  }
  if (!song) throw new PlanError("The plan needs a 'song'", r.line(top));
  return plan;
}

function readBrief(r: Reader, node: Node | null): Brief {
  if (isScalar(node)) return r.text(node, 'brief', node);
  const out: Record<string, string | string[]> = {};
  for (const e of r.entries(r.map(node, 'brief'))) {
    out[e.key] = isSeq(e.value)
      ? r.list(e.value, `brief '${e.key}'`).map((i) => i.text)
      : r.text(e.value, `brief '${e.key}'`, e.value);
  }
  return out;
}

function readList<T>(r: Reader, node: Node | null, what: string, read: (n: YAMLMap) => T): T[] {
  if (node === null || (isScalar(node) && node.value === null)) return [];
  if (!isSeq(node)) r.fail(node, `${what} must be a list`);
  return node.items.map((item) => read(r.map(item, `Each of ${what}`, node)));
}

function readCue(r: Reader, node: YAMLMap): Cue {
  const cue: Cue = { line: r.line(node) ?? 0, at: '', picks: {} };
  for (const { key, value, line } of r.entries(node)) {
    const k = key.toLowerCase();
    if (k === 'at') cue.at = r.text(value, 'at', value);
    else if (isColourSetKey(k)) cue.colourSet = r.pick(value, key, value);
    else if (k === 'tier') cue.tier = r.text(value, 'tier', value).toLowerCase();
    else if (CUE.includes(k)) continue;
    else if (k in cue.picks) throw new PlanError(`Layer '${key}' is set twice`, line);
    else cue.picks[k] = r.pick(value, `'${key}'`, value);
  }
  if (!cue.at) throw new PlanError("A cue needs an 'at'", cue.line);
  return cue;
}

function checkKeys(r: Reader, node: YAMLMap, allowed: string[]): Map<string, Node | null> {
  const found = new Map<string, Node | null>();
  for (const { key, value, line } of r.entries(node)) {
    if (!allowed.includes(key)) throw new PlanError(`Unknown key '${key}'`, line);
    found.set(key, value);
  }
  return found;
}

function readEvent(r: Reader, node: YAMLMap): TimedEvent {
  const keys = checkKeys(r, node, EVENT);
  const line = r.line(node) ?? 0;
  const at = keys.get('at');
  if (at === undefined) throw new PlanError("An event needs an 'at'", line);
  const ev: TimedEvent = { line, at: r.text(at, 'at', at) };
  const scene = keys.get('scene');
  const release = keys.get('release');
  if ((scene === undefined) === (release === undefined)) {
    throw new PlanError("An event needs either a 'scene' or a 'release'", line);
  }
  if (scene !== undefined) ev.scene = r.pick(scene, 'scene', scene);
  if (release !== undefined) ev.releaseLayer = r.pick(release, 'release', release);
  const length = keys.get('length');
  const until = keys.get('until');
  if (length !== undefined && until !== undefined) {
    throw new PlanError("An event takes a 'length' or an 'until', not both", line);
  }
  if (length !== undefined) ev.length = r.text(length, 'length', length);
  if (until !== undefined) ev.until = r.text(until, 'until', until);
  if ((length ?? until) !== undefined && ev.releaseLayer) {
    throw new PlanError("A release has no 'length' or 'until'", line);
  }
  return ev;
}

function readPattern(r: Reader, node: YAMLMap): Pattern {
  const keys = checkKeys(r, node, PATTERN);
  const line = r.line(node) ?? 0;
  const get = (k: string): string | undefined => {
    const v = keys.get(k);
    return v === undefined ? undefined : r.text(v, k, v);
  };
  const every = get('every');
  if (!every) throw new PlanError("A pattern needs an 'every'", line);
  const scene = keys.get('scene');
  const alternate = keys.get('alternate');
  if ((scene === undefined) === (alternate === undefined)) {
    throw new PlanError("A pattern needs either a 'scene' or an 'alternate' list", line);
  }
  const scenes =
    scene !== undefined
      ? [r.pick(scene, 'scene', scene)]
      : r.list(alternate, 'alternate').map((i) => r.pick(i.node, 'alternate', i.node));
  const p: Pattern = { line, every, scenes };
  const beat = get('beat');
  if (beat !== undefined) p.beat = beat;
  const from = get('from');
  const to = get('to');
  const inside = get('in');
  const length = get('length');
  if (from !== undefined) p.from = from;
  if (to !== undefined) p.to = to;
  if (inside !== undefined) p.in = inside;
  if (length !== undefined) p.length = length;
  if (inside !== undefined ? from !== undefined || to !== undefined : !from || !to) {
    throw new PlanError("A pattern spans either 'in' or 'from' and 'to'", line);
  }
  return p;
}
