// The Brief: `bands/<Band>/brief.yaml` in, a checked structure out, plus a
// read of the Venue Patch it points at. Every error names its line. Scalars
// stay strings (the `failsafe` schema) and are converted here, so each bad
// value can be reported with its own line.
//
// Used by the show generator (`parseBrief`, `loadBrief`, `summariseVenue`).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { LineCounter, parseDocument, isMap, isScalar, isSeq, type Node, type YAMLMap } from 'yaml';
import { loadVenueFile } from '../../src/engine/venue-file';
import { SWATCHES, type Swatch } from '../../src/shared/colour';
import type { Role } from '../../src/shared/fixture-profile';
import { ROLES } from '../../src/shared/fixture-profile';
import { SWATCH_HUE } from './rules';
import {
  fixtureRole,
  fixtureZone,
  isMovingFixture,
  type VenuePatch,
  type Zone,
  type ZoneRow,
} from '../../src/shared/venue-patch';

export const MOODS = ['upbeat', 'melancholy', 'aggressive', 'calm', 'dreamy'] as const;
export type Mood = (typeof MOODS)[number];

export const FRONT_POLICIES = ['pale', 'colour'] as const;
export type FrontPolicy = (typeof FRONT_POLICIES)[number];

export const BPM_RANGE = [90, 200] as const;
/** The strobe rate for `strobe: capped`, in Hz. */
export const STROBE_CAP_HZ = 4;
/** The fastest strobe a Brief may ask for, in Hz. */
export const MAX_STROBE_HZ = 25;

export class BriefError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(line === undefined ? message : `Line ${line}: ${message}`);
  }
}

export interface BriefSong {
  name: string;
  bpm: number;
  /** The Plan path as written, relative to the brief. */
  plan?: string;
  /** A Colour Set override: Primary, then Secondary and Accent when given. */
  colours?: Swatch[];
  line: number;
}

export interface Brief {
  band: string;
  genre?: string;
  mood?: Mood;
  /** Band colours, in order of importance. */
  colours: Swatch[];
  songs: BriefSong[];
  /** The `.lcvenue` path as written, relative to the brief. */
  venue?: string;
  venueLine?: number;
  front: FrontPolicy;
  /** The strobe cap in Hz: `STROBE_CAP_HZ` for `capped`. */
  strobeHz: number;
}

const TOP = ['band', 'genre', 'mood', 'colours', 'songs', 'venue', 'front', 'strobe'];
const SONG = ['name', 'bpm', 'plan', 'colours'];

class Reader {
  private readonly lines = new LineCounter();
  private readonly doc;

  constructor(text: string) {
    this.doc = parseDocument(text, { schema: 'failsafe', lineCounter: this.lines });
    const [first] = this.doc.errors;
    if (first)
      throw new BriefError(first.message.split('\n')[0] ?? 'Invalid YAML', first.linePos?.[0].line);
  }

  get root(): Node | null {
    return this.doc.contents;
  }

  line(node: Node | null | undefined): number | undefined {
    const at = node?.range?.[0];
    return at === undefined ? undefined : this.lines.linePos(at).line;
  }

  fail(node: Node | null | undefined, message: string): never {
    throw new BriefError(message, this.line(node));
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

  oneOf<T extends string>(node: unknown, what: string, allowed: readonly T[], at: Node | null): T {
    const value = this.text(node, what, at).toLowerCase();
    const found = allowed.find((a) => a.toLowerCase() === value);
    if (!found) this.fail(node as Node, `${what} must be ${allowed.join(', ')}`);
    return found;
  }

  /** A list of swatch names, written as a list or as one name. */
  swatches(node: unknown, what: string, max: number, at: Node | null): Swatch[] {
    const items = isSeq(node) ? node.items : [node];
    if (items.length === 0 || items.length > max) {
      this.fail((node as Node | null) ?? at, `${what} must have 1 to ${max} colours`);
    }
    return items.map((item) => {
      const name = this.text(item, what, node as Node | null).toLowerCase();
      const swatch = SWATCHES.find((s) => s.toLowerCase() === name);
      if (!swatch)
        this.fail(item as Node, `${what}: '${name}' is not one of ${SWATCHES.join(', ')}`);
      return swatch;
    });
  }
}

/** Parses and checks a brief. The venue path is not opened here: see `loadBrief`. */
export function parseBrief(text: string): Brief {
  const r = new Reader(text);
  const top = r.map(r.root, 'The brief', undefined);
  const brief: Brief = {
    band: '',
    colours: [],
    songs: [],
    front: 'pale',
    strobeHz: STROBE_CAP_HZ,
  };
  const seen = new Set<string>();
  for (const { key, value, line } of r.entries(top)) {
    if (!TOP.includes(key)) throw new BriefError(`Unknown key '${key}'`, line);
    seen.add(key);
    if (key === 'band') brief.band = r.text(value, 'band', value);
    else if (key === 'genre') brief.genre = r.text(value, 'genre', value);
    else if (key === 'mood') brief.mood = r.oneOf(value, 'mood', MOODS, value);
    else if (key === 'colours')
      brief.colours = r.swatches(value, 'colours', SWATCHES.length, value);
    else if (key === 'songs') brief.songs = readSongs(r, value);
    else if (key === 'venue') {
      brief.venue = r.text(value, 'venue', value);
      brief.venueLine = r.line(value) ?? line;
    } else if (key === 'front') brief.front = r.oneOf(value, 'front', FRONT_POLICIES, value);
    else brief.strobeHz = readStrobe(r, value);
  }
  if (!seen.has('band')) throw new BriefError("The brief needs a 'band'", r.line(top));
  if (!seen.has('songs')) throw new BriefError("The brief needs 'songs'", r.line(top));
  return brief;
}

function readStrobe(r: Reader, node: Node | null): number {
  const text = r.text(node, 'strobe', node);
  if (text.toLowerCase() === 'capped') return STROBE_CAP_HZ;
  const hz = /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
  if (!(hz > 0 && hz <= MAX_STROBE_HZ)) {
    r.fail(node, `strobe must be 'capped' or a rate from above 0 to ${MAX_STROBE_HZ} Hz`);
  }
  return hz;
}

function readSongs(r: Reader, node: Node | null): BriefSong[] {
  if (!isSeq(node) || node.items.length === 0) r.fail(node, 'songs must be a list of songs');
  const songs = node.items.map((item) => readSong(r, r.map(item, 'Each song', node)));
  const names = new Set<string>();
  for (const song of songs) {
    const key = song.name.toLowerCase();
    if (names.has(key)) throw new BriefError(`Song '${song.name}' is listed twice`, song.line);
    names.add(key);
  }
  return songs;
}

function readSong(r: Reader, node: YAMLMap): BriefSong {
  const line = r.line(node) ?? 0;
  let name: string | undefined;
  let bpm: number | undefined;
  let plan: string | undefined;
  let colours: Swatch[] | undefined;
  for (const { key, value, line: keyLine } of r.entries(node)) {
    if (!SONG.includes(key)) throw new BriefError(`Unknown key '${key}'`, keyLine);
    if (key === 'name') name = r.text(value, 'name', value);
    else if (key === 'plan') plan = r.text(value, 'plan', value);
    else if (key === 'colours') {
      colours = r.swatches(value, 'colours', 3, value);
      // P4: beams take the Accent, and Peak beams are white.
      const accent = colours[2];
      if (accent !== undefined && SWATCH_HUE[accent] !== undefined) {
        throw new BriefError(
          `colours: the Accent '${accent}' must be White or Warm White`,
          r.line(value) ?? keyLine,
        );
      }
    } else bpm = readBpm(r, value);
  }
  if (name === undefined) throw new BriefError("A song needs a 'name'", line);
  if (bpm === undefined) throw new BriefError(`Song '${name}' needs a 'bpm'`, line);
  return { name, bpm, plan, colours, line };
}

function readBpm(r: Reader, node: Node | null): number {
  const text = r.text(node, 'bpm', node);
  const bpm = /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
  if (!(bpm >= BPM_RANGE[0] && bpm <= BPM_RANGE[1])) {
    r.fail(node, `bpm must be a number from ${BPM_RANGE[0]} to ${BPM_RANGE[1]}`);
  }
  return bpm;
}

/** The rows that count as the front of the stage: Downstage counts as front. */
export const FRONT_ROWS: readonly ZoneRow[] = ['Front', 'Downstage'];

/** A Role in a Zone: how many Fixtures, and how many of them move. */
export interface VenueGroup {
  role: Role;
  zone: Zone;
  count: number;
  moving: number;
}

export interface VenueSummary {
  /** `venue` when read from a Venue Patch, `default` for the default rig. */
  source: 'venue' | 'default';
  /** Fixtures per Role; every Role is present, with 0 for none. */
  roleCounts: Record<Role, number>;
  /** The Roles with at least one Fixture. */
  roles: Role[];
  /** One group per distinct Role and Zone. */
  groups: VenueGroup[];
  fixtures: number;
  /** Moving Fixtures (a pan or tilt channel). */
  movers: number;
  /** Wash Fixtures in the front rows that move. The generator keeps movement off them. */
  movingFrontWashes: number;
}

export interface VenueFilter {
  role?: Role;
  row?: ZoneRow;
  rows?: readonly ZoneRow[];
  level?: Zone['level'];
  column?: Zone['column'];
}

/** The number of Fixtures in a summary that match `filter`. */
export function venueCount(summary: VenueSummary, filter: VenueFilter = {}): number {
  return summary.groups
    .filter(
      (g) =>
        (filter.role === undefined || g.role === filter.role) &&
        (filter.row === undefined || g.zone.row === filter.row) &&
        (filter.rows === undefined || filter.rows.includes(g.zone.row)) &&
        (filter.level === undefined || g.zone.level === filter.level) &&
        (filter.column === undefined || g.zone.column === filter.column),
    )
    .reduce((sum, g) => sum + g.count, 0);
}

interface Placed {
  role: Role;
  zone: Zone;
  moving: boolean;
}

function summarise(source: VenueSummary['source'], placed: Placed[]): VenueSummary {
  const roleCounts = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
  const groups = new Map<string, VenueGroup>();
  for (const { role, zone, moving } of placed) {
    roleCounts[role]++;
    const key = `${role}|${zone.row}|${zone.column}|${zone.level}`;
    const group = groups.get(key) ?? { role, zone, count: 0, moving: 0 };
    group.count++;
    if (moving) group.moving++;
    groups.set(key, group);
  }
  return {
    source,
    roleCounts,
    roles: ROLES.filter((r) => roleCounts[r] > 0),
    groups: [...groups.values()],
    fixtures: placed.length,
    movers: placed.filter((p) => p.moving).length,
    movingFrontWashes: placed.filter(
      (p) => p.moving && p.role === 'Wash' && FRONT_ROWS.includes(p.zone.row),
    ).length,
  };
}

/** The rig the generator assumes when the brief names no venue: front and back washes, beams, floor. */
export const DEFAULT_RIG: VenueSummary = summarise('default', [
  ...rep(4, 'Wash', { row: 'Front', column: 'Centre', level: 'Overhead' }),
  ...rep(4, 'Wash', { row: 'Upstage', column: 'Centre', level: 'Overhead' }),
  ...rep(4, 'Spot/Beam', { row: 'Upstage', column: 'Centre', level: 'Overhead' }),
  ...rep(4, 'Wash', { row: 'Midstage', column: 'Centre', level: 'Floor' }),
]);

function rep(n: number, role: Role, zone: Zone): Placed[] {
  return Array.from({ length: n }, () => ({ role, zone, moving: false }));
}

/** Reads a Venue Patch for Roles, counts per Role and Zone, and movers. With none: the default rig. */
export function summariseVenue(patch?: VenuePatch): VenueSummary {
  if (!patch) return DEFAULT_RIG;
  return summarise(
    'venue',
    patch.fixtures.map((f) => ({
      role: fixtureRole(patch, f),
      zone: fixtureZone(patch, f),
      moving: isMovingFixture(patch, f),
    })),
  );
}

export interface LoadedBrief {
  brief: Brief;
  venue: VenueSummary;
  /** The folder of the brief; Plan paths resolve against it. */
  dir: string;
}

/** Reads a brief file and its venue (relative to the file). The venue file is never copied. */
export function loadBrief(path: string): LoadedBrief {
  const brief = parseBrief(readFileSync(path, 'utf8'));
  const dir = dirname(resolve(path));
  if (brief.venue === undefined) return { brief, venue: summariseVenue(), dir };
  let patch: VenuePatch;
  try {
    patch = loadVenueFile(readFileSync(resolve(dir, brief.venue), 'utf8'));
  } catch (error) {
    throw new BriefError(
      `venue '${brief.venue}' can't be read: ${error instanceof Error ? error.message : String(error)}`,
      brief.venueLine,
    );
  }
  return { brief, venue: summariseVenue(patch), dir };
}
