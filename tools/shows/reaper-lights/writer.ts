// Writes a compiled song into a copy of a Reaper project (`<name>.lights.rpp`) as
// one MIDI item on lane 1 of the MidiToLights track. The raw text is spliced, so
// every other byte stays. The original project is never written.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { compilePlan, type MidiEvent } from './compile';
import { parsePlan } from './plan';
import { LightsError } from './errors';
import { findRegion, readProject, type Region, type RppNode, type RppProject } from './rpp';
import { loadShowFor } from './show';
import { stackingWarnings } from './stacking';
import { PPQ, regionTimeline, TempoMap } from './timeline';

export class WriteError extends LightsError {}

export const TRACK_NAME = 'MidiToLights';
/** Ticks per quarter note of the written item. */
export { PPQ };
const ITEM_PREFIX = 'lights:';

/** One note-on or note-off at a tick from the item start. */
interface RawNote {
  tick: number;
  status: number;
  d1: number;
  d2: number;
}

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');

/** A GUID derived from a name, so a rewritten item keeps its ids. */
function guidFor(seed: string): string {
  const h = sha256(seed).slice(0, 32).toUpperCase();
  return `{${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}}`;
}

/** Notes sorted by tick, note-offs before note-ons at a tick, as Reaper stores them. */
function sortNotes(notes: RawNote[]): RawNote[] {
  const order = (n: RawNote) => (n.status >> 4 === 8 ? 0 : 1);
  return [...notes].sort((a, b) => a.tick - b.tick || order(a) - order(b) || a.d1 - b.d1);
}

/** The hash of an item's notes. Independent of how Reaper chops them into lines. */
export function hashNotes(notes: RawNote[]): string {
  const lines = sortNotes(
    notes.map((n) => (n.status >> 4 === 9 && n.d2 === 0 ? { ...n, status: n.status - 16 } : n)),
  ).map((n) => `${n.tick} ${n.status >> 4 === 8 ? 'off' : 'on'} ${n.status & 15} ${n.d1} ${n.d2}`);
  return sha256(lines.join('\n'));
}

/** Notes of an existing item's `<SOURCE MIDI`, ticks made absolute. */
function readNotes(item: RppNode): RawNote[] {
  const source = item.children.find((c) => c.chunk && c.name === 'SOURCE' && c.args[0] === 'MIDI');
  const notes: RawNote[] = [];
  let tick = 0;
  for (const line of source?.children ?? []) {
    if (line.chunk || (line.name !== 'E' && line.name !== 'e')) continue;
    // The delta is decimal; status and data bytes are hex.
    tick += Number.parseInt(line.args[0] ?? '0', 10);
    const [, status, d1, d2] = line.args.map((t) => parseInt(t, 16));
    if (status === undefined || d1 === undefined || d2 === undefined) continue;
    if (status >> 4 === 8 || status >> 4 === 9) notes.push({ tick, status, d1, d2 });
  }
  return notes;
}

const hex = (n: number): string => n.toString(16).padStart(2, '0');

/** Quotes a name for a line, picking a quote the name does not hold. */
function quote(text: string): string {
  if (!text.includes('"')) return `"${text}"`;
  return text.includes("'") ? `\`${text.replaceAll('`', "'")}\`` : `'${text}'`;
}

export interface BuiltItem {
  /** The chunk's lines joined by `\n`, indented, no trailing newline. */
  text: string;
  hash: string;
  notes: number;
}

/** The item chunk for a region: events in ticks that follow the tempo map. */
export function buildItem(
  project: RppProject,
  region: Region,
  events: readonly MidiEvent[],
  indent: string,
): BuiltItem {
  const tempo = new TempoMap(project.initial.bpm, project.tempoPoints);
  const startQn = tempo.quarterNotesAt(region.start);
  const tickAt = (seconds: number) =>
    Math.max(0, Math.round((tempo.quarterNotesAt(region.start + seconds) - startQn) * PPQ));
  const notes: RawNote[] = [];
  for (const e of events) {
    const on = tickAt(e.time);
    const off = Math.max(on + 1, tickAt(e.time + e.duration));
    const ch = e.channel - 1;
    notes.push({ tick: on, status: 0x90 | ch, d1: e.note, d2: e.velocity });
    notes.push({ tick: off, status: 0x80 | ch, d1: e.note, d2: 0 });
  }
  const sorted = sortNotes(notes);
  const length = region.end - region.start;
  const endTick = Math.max(tickAt(length), sorted.at(-1)?.tick ?? 0);

  const name = `${ITEM_PREFIX}${region.name}`;
  const i1 = `${indent}  `;
  const i2 = `${indent}    `;
  const lines = [
    `${indent}<ITEM`,
    `${i1}POSITION ${region.start}`,
    `${i1}SNAPOFFS 0`,
    `${i1}LENGTH ${length}`,
    `${i1}LOOP 0`,
    `${i1}ALLTAKES 0`,
    `${i1}FADEIN 1 0 0 1 0 0 0 1 0 0 1 0 0`,
    `${i1}FADEOUT 1 0 0 1 0 0 0 1 0 0 1 0 0`,
    `${i1}MUTE 0 0`,
    `${i1}SEL 0`,
    `${i1}IGUID ${guidFor(`${name}:item`)}`,
    `${i1}NAME ${quote(name)}`,
    `${i1}VOLPAN 1 0 1 -1`,
    `${i1}SOFFS 0`,
    `${i1}PLAYRATE 1 1 0 -1 0 0.0025`,
    `${i1}CHANMODE 0`,
    `${i1}GUID ${guidFor(`${name}:guid`)}`,
    `${i1}<SOURCE MIDI`,
    `${i2}HASDATA 1 ${PPQ} QN`,
    `${i2}CCINTERP 32`,
    `${i2}POOLEDEVTS ${guidFor(`${name}:pool`)}`,
  ];
  let tick = 0;
  for (const n of sorted) {
    lines.push(`${i2}E ${n.tick - tick} ${hex(n.status)} ${hex(n.d1)} ${hex(n.d2)}`);
    tick = n.tick;
  }
  // All notes off at the item's end pads the data to the region length.
  lines.push(`${i2}E ${endTick - tick} b0 7b 00`);
  lines.push(
    `${i2}CCINTERP 32`,
    `${i2}GUID ${guidFor(`${name}:source`)}`,
    `${i2}IGNTEMPO 0 ${project.initial.bpm} ${project.initial.num} ${project.initial.den}`,
    `${i1}>`,
    `${indent}>`,
  );
  return { text: lines.join('\n'), hash: hashNotes(notes), notes: events.length };
}

/** Line ending of the file. A file that mixes both is refused. */
export function detectEol(raw: string): '\r\n' | '\n' {
  const crlf = (raw.match(/\r\n/g) ?? []).length;
  const lf = (raw.match(/\n/g) ?? []).length - crlf;
  if (crlf > 0 && lf > 0) {
    throw new WriteError(
      `The project mixes CRLF (${crlf} lines) and LF (${lf} lines) line endings; ` +
        'fix them before writing so no line changes.',
    );
  }
  return crlf > 0 ? '\r\n' : '\n';
}

export interface Spliced {
  raw: string;
  replaced: boolean;
  /** Hash of the notes in the item that was replaced, if any. */
  previousHash?: string;
  hash: string;
  notes: number;
}

/** What is in the file now for a region: its track and owned item. */
function find(project: RppProject, region: Region) {
  const track = project.tracks.find((t) => t.name === TRACK_NAME);
  if (!track) throw new WriteError(`The project has no track named ${TRACK_NAME}`);
  const owned = track.items.filter((i) => i.name === `${ITEM_PREFIX}${region.name}`);
  if (owned.length > 1) {
    throw new WriteError(`${owned.length} items on ${TRACK_NAME} are named lights:${region.name}`);
  }
  return { track, owned: owned[0] };
}

/** The raw text with the region's item replaced, or inserted at the end of the track. */
export function spliceItem(
  raw: string,
  region: Region,
  events: readonly MidiEvent[],
  storedHash: string | undefined,
  force: boolean,
): Spliced {
  const eol = detectEol(raw);
  const project = readProject(raw);
  const { track, owned } = find(project, region);
  const previousHash = owned && hashNotes(readNotes(owned.node));
  const trackIndent = /^[ \t]*/.exec(raw.slice(track.node.start, track.node.end))?.[0] ?? '';
  const built = buildItem(project, region, events, `${trackIndent}  `);
  // The item is the user's when it matches neither the recorded hash nor what
  // this write would produce. Matching the new MIDI also covers a crash after
  // the .rpp was renamed but before the hash file was written.
  if (previousHash !== undefined && !force && previousHash !== built.hash) {
    if (storedHash === undefined) {
      throw new WriteError(
        `The item lights:${region.name} exists but no hash file records what was written. ` +
          'Use --force to overwrite it, or fold its edits into the plan first.',
      );
    }
    if (previousHash !== storedHash) {
      throw new WriteError(
        `The MIDI of lights:${region.name} was edited since it was written. ` +
          'Use --force to overwrite it, or fold the edits into the plan first.',
      );
    }
  }
  const text = built.text.replaceAll('\n', eol);
  let out: string;
  if (owned) {
    out = raw.slice(0, owned.node.start) + text + raw.slice(owned.node.end);
  } else {
    const at = raw.lastIndexOf('\n', track.node.end - 1) + 1;
    out = raw.slice(0, at) + text + eol + raw.slice(at);
  }
  return { raw: out, replaced: !!owned, previousHash, hash: built.hash, notes: built.notes };
}

export interface WriteOptions {
  rpp: string;
  plan: string;
  force?: boolean;
  /** Write a plan that stacks more dynamic Layers than its tier allows (M4). */
  allowStack?: boolean;
}

export interface WriteResult {
  /** The stacking warnings that `allowStack` let through. */
  warnings: string[];
  region: string;
  notes: number;
  replaced: boolean;
  /** The `.lights.rpp` that was written. */
  output: string;
  hashFile: string;
}

const safeName = (name: string): string => name.replace(/[^A-Za-z0-9._-]+/g, '_');
/** The file holding the hash of the MIDI last written for a region. */
export const hashFileFor = (planPath: string, region: string): string =>
  join(dirname(planPath), `${safeName(region)}.lights.hash`);

/** `Show.rpp` becomes `Show.lights.rpp`, in the same folder. */
export const outputFor = (rppPath: string): string => {
  const ext = extname(rppPath);
  return join(dirname(rppPath), `${basename(rppPath, ext)}.lights${ext || '.rpp'}`);
};

/**
 * Compiles the plan and writes its item into `<name>.lights.rpp` next to the
 * project, which is never touched. An existing `.lights.rpp` is the base, so
 * other regions' items survive; delete it to start again from the original.
 *
 * Order: the `.rpp` is written to a temp file and renamed, then the hash file.
 * A crash between the two leaves an item the old hash does not match, but it
 * matches what a re-run writes, so `spliceItem` accepts it: no false hand-edit.
 */
export function writeLights(opts: WriteOptions): WriteResult {
  const output = outputFor(opts.rpp);
  const raw = readFileSync(existsSync(output) ? output : opts.rpp, 'utf8');
  const project = readProject(readFileSync(opts.rpp, 'utf8'));

  const plan = parsePlan(readFileSync(opts.plan, 'utf8'));
  const region = findRegion(project, plan.song);
  const show = loadShowFor(plan, opts.plan);
  const timeline = regionTimeline(project, region);
  const events = compilePlan(plan, show, timeline);
  const warnings = stackingWarnings(plan, events, show, timeline).map((w) => w.message);
  if (warnings.length > 0 && !opts.allowStack) {
    throw new WriteError(
      `The plan stacks too many dynamic Layers (M4):\n${warnings.join('\n')}\n` +
        'Fix the cues, or pass --allow-stack to write it anyway.',
    );
  }

  const hashFile = hashFileFor(opts.plan, region.name);
  const stored = existsSync(hashFile) ? readFileSync(hashFile, 'utf8').trim() : undefined;
  const spliced = spliceItem(raw, region, events, stored, opts.force ?? false);

  const temp = `${output}.${process.pid}.tmp`;
  writeFileSync(temp, spliced.raw);
  renameSync(temp, output);
  writeFileSync(hashFile, `${spliced.hash}\n`);
  return {
    warnings,
    region: region.name,
    notes: spliced.notes,
    replaced: spliced.replaced,
    output,
    hashFile,
  };
}
