// Reads a Reaper .rpp project: a tree of chunks, keeping the raw text and the
// span of every node so a later write can splice the file without touching
// anything else.
import { LightsError } from './errors';

export interface RppNode {
  /** First token of the line, without the leading `<` of a chunk. */
  name: string;
  /** The remaining tokens of the line, quotes removed. */
  args: string[];
  /** Child lines and chunks. Empty for a plain line. */
  children: RppNode[];
  /** True for a `<NAME ... >` chunk. */
  chunk: boolean;
  /** Offset of the node's first character (its indentation included) in the raw text. */
  start: number;
  /** Offset just after the node's last character: the line, or a chunk's closing `>`. */
  end: number;
}

export interface TempoPoint {
  /** Seconds from the project start. */
  time: number;
  bpm: number;
  /** `square` holds the tempo to the next point, `linear` ramps to it. */
  shape: 'square' | 'linear';
  /** Time signature set at this point, if any. */
  signature?: { num: number; den: number };
}

export interface Region {
  index: number;
  name: string;
  start: number;
  end: number;
}

export interface Marker {
  index: number;
  name: string;
  time: number;
}

export interface Item {
  position: number;
  length: number;
  name: string;
  /** Source kind (`WAVE`, `MP3`, `MIDI`, ...) and its file, when it has one. */
  source?: { type: string; file?: string };
  node: RppNode;
}

export interface Track {
  name: string;
  items: Item[];
  node: RppNode;
}

export interface RppProject {
  raw: string;
  root: RppNode;
  /** The project's initial tempo and signature (the `TEMPO` line). */
  initial: { bpm: number; num: number; den: number };
  tempoPoints: TempoPoint[];
  regions: Region[];
  markers: Marker[];
  tracks: Track[];
}

export class RppError extends LightsError {}

/** Splits a line into tokens, honouring "double", 'single' and `backtick` quotes. */
function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === ' ' || c === '\t' || c === '\r') {
      i++;
    } else if (c === '"' || c === "'" || c === '`') {
      const close = line.indexOf(c, i + 1);
      const stop = close === -1 ? line.length : close;
      tokens.push(line.slice(i + 1, stop));
      i = stop + 1;
    } else {
      let j = i;
      while (j < line.length && !' \t\r'.includes(line.charAt(j))) j++;
      tokens.push(line.slice(i, j));
      i = j;
    }
  }
  return tokens;
}

/** Parses the raw text into the project's chunk tree. */
export function parseRpp(raw: string): RppNode {
  const stack: RppNode[] = [];
  let root: RppNode | undefined;
  let offset = 0;
  let lineNo = 0;
  while (offset < raw.length) {
    lineNo++;
    const nl = raw.indexOf('\n', offset);
    const lineEnd = nl === -1 ? raw.length : nl;
    const text = raw.slice(offset, lineEnd).replace(/\r$/, '');
    const trimmed = text.trim();
    const start = offset;
    const end = start + text.length;
    offset = nl === -1 ? raw.length : nl + 1;
    if (trimmed === '') continue;
    if (trimmed === '>') {
      const node = stack.pop();
      if (!node) throw new RppError(`Line ${lineNo}: unexpected '>'`);
      node.end = end;
      continue;
    }
    const chunk = trimmed.startsWith('<');
    const tokens = tokenize(chunk ? trimmed.slice(1) : trimmed);
    const node: RppNode = {
      name: tokens[0] ?? '',
      args: tokens.slice(1),
      children: [],
      chunk,
      start,
      end,
    };
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else if (root) throw new RppError(`Line ${lineNo}: content after the project's closing '>'`);
    else root = node;
    if (chunk) stack.push(node);
  }
  if (stack.length > 0) throw new RppError(`Unclosed chunk <${stack.at(-1)?.name}`);
  if (!root || root.name !== 'REAPER_PROJECT') throw new RppError('Not a Reaper project');
  return root;
}

const num = (token: string | undefined, fallback = 0): number => {
  const n = Number(token);
  return token === undefined || !Number.isFinite(n) ? fallback : n;
};

const child = (node: RppNode, name: string) => node.children.find((c) => c.name === name);

function readTempoPoints(root: RppNode): TempoPoint[] {
  const env = root.children.find((c) => c.chunk && c.name === 'TEMPOENVEX');
  if (!env) return [];
  return env.children
    .filter((c) => c.name === 'PT')
    .map((pt): TempoPoint => {
      const packed = num(pt.args[3]);
      const point: TempoPoint = {
        time: num(pt.args[0]),
        bpm: num(pt.args[1]),
        shape: num(pt.args[2]) === 1 ? 'square' : 'linear',
      };
      // The signature is packed as numerator + denominator * 65536.
      if (packed > 0) point.signature = { num: packed & 0xffff, den: Math.floor(packed / 65536) };
      return point;
    })
    .sort((a, b) => a.time - b.time);
}

/**
 * Regions are a `MARKER idx start name 1 ...` line followed by a short
 * `MARKER idx end "" 1` line with the same index. Markers have flag 0.
 */
function readMarkers(root: RppNode): { regions: Region[]; markers: Marker[] } {
  const regions: Region[] = [];
  const markers: Marker[] = [];
  const open = new Map<number, Region>();
  for (const line of root.children) {
    if (line.name !== 'MARKER') continue;
    const index = num(line.args[0]);
    const time = num(line.args[1]);
    if (line.args[3] === '0') {
      markers.push({ index, name: line.args[2] ?? '', time });
      continue;
    }
    const region = open.get(index);
    if (region && line.args.length <= 4) {
      region.end = time;
      open.delete(index);
    } else {
      const r: Region = { index, name: line.args[2] ?? '', start: time, end: time };
      open.set(index, r);
      regions.push(r);
    }
  }
  return { regions, markers };
}

function readItem(node: RppNode): Item {
  const src = child(node, 'SOURCE');
  const file = src && child(src, 'FILE');
  return {
    position: num(child(node, 'POSITION')?.args[0]),
    length: num(child(node, 'LENGTH')?.args[0]),
    name: child(node, 'NAME')?.args[0] ?? '',
    source: src ? { type: src.args[0] ?? '', file: file?.args[0] } : undefined,
    node,
  };
}

/** Reads the tempo map, regions, markers and tracks of a project. */
/** A region by name, ignoring case. The error lists the regions there are. */
export function findRegion(project: RppProject, name: string): Region {
  const hit = project.regions.find((r) => r.name.toLowerCase() === name.toLowerCase());
  if (!hit) {
    const names = project.regions.map((r) => r.name).join(', ');
    throw new RppError(`No region '${name}'. Regions: ${names || 'none'}`);
  }
  return hit;
}

export function readProject(raw: string): RppProject {
  const root = parseRpp(raw);
  const tempo = child(root, 'TEMPO');
  return {
    raw,
    root,
    initial: {
      bpm: num(tempo?.args[0], 120),
      num: num(tempo?.args[1], 4),
      den: num(tempo?.args[2], 4),
    },
    tempoPoints: readTempoPoints(root),
    ...readMarkers(root),
    tracks: root.children
      .filter((c) => c.chunk && c.name === 'TRACK')
      .map((t) => ({
        name: child(t, 'NAME')?.args[0] ?? '',
        items: t.children.filter((c) => c.chunk && c.name === 'ITEM').map(readItem),
        node: t,
      })),
  };
}
