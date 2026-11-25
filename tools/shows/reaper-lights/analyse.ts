// Stem analysis: for the audio items inside a region, the RMS per song bar and
// the onsets (energy-flux peaks) as song `bar.beat`. A helper for the plan:
// it proposes where the music hits, the user confirms.
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import type { Item, Region, RppProject, Track } from './rpp';
import { formatBarBeat, regionTimeline, type BarBeat, type SongTimeline } from './timeline';
import { openWav, WavError } from './wav';

export interface AnalyseOptions {
  /** The folder of the project; relative source files resolve against it. */
  dir: string;
}

export interface Onset {
  /** Song time in project seconds. */
  time: number;
  position: BarBeat;
}

export interface StemAnalysis {
  /** The track's name. */
  name: string;
  /** Source files read, without their folders. */
  files: string[];
  /** dBFS per song bar: `null` where no item covers the bar, `-Infinity` for silence. */
  rms: (number | null)[];
  onsets: Onset[];
}

export interface Analysis {
  region: string;
  bars: number;
  markers: { bar: number; name: string }[];
  stems: StemAnalysis[];
  warnings: string[];
}

// Seconds per energy block: the time resolution of an onset.
const BLOCK_SECONDS = 0.01;
const MIN_GAP_SECONDS = 0.05;
// Frames per read, a multiple of the block size.
const READ_FRAMES = 1 << 20;

/**
 * Peak-picks onsets in an energy envelope (one value per block). The flux is
 * the rise of the log-compressed level from one block to the next; a peak
 * counts when it is a local maximum above the local mean flux and a floor.
 * Returns block indices.
 */
export function detectOnsets(env: ArrayLike<number>, blockSeconds = BLOCK_SECONDS): number[] {
  const n = env.length;
  const flux = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    flux[i] = Math.max(0, Math.log1p(1000 * (env[i] ?? 0)) - Math.log1p(1000 * (env[i - 1] ?? 0)));
  }
  const reach = Math.max(1, Math.round(0.5 / blockSeconds));
  const near = Math.max(1, Math.round(0.02 / blockSeconds));
  const minGap = Math.max(1, Math.round(MIN_GAP_SECONDS / blockSeconds));
  // Running sum for the local mean.
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = (prefix[i] ?? 0) + (flux[i] ?? 0);

  const peaks: number[] = [];
  for (let i = 1; i < n; i++) {
    const f = flux[i] ?? 0;
    const lo = Math.max(0, i - reach);
    const hi = Math.min(n, i + reach + 1);
    const mean = ((prefix[hi] ?? 0) - (prefix[lo] ?? 0)) / (hi - lo);
    if (f < Math.max(1, 2 * mean)) continue;
    let isMax = true;
    for (let j = Math.max(0, i - near); j <= Math.min(n - 1, i + near) && isMax; j++) {
      if ((flux[j] ?? 0) > f || ((flux[j] ?? 0) === f && j < i)) isMax = false;
    }
    if (!isMax) continue;
    const last = peaks.at(-1);
    if (last !== undefined && i - last < minGap) {
      if (f > (flux[last] ?? 0)) peaks[peaks.length - 1] = i;
    } else {
      peaks.push(i);
    }
  }
  return peaks;
}

interface Block {
  /** Song time of the middle of the block, in project seconds. */
  time: number;
  /** Mean square over the block's frames and channels. */
  energy: number;
  frames: number;
}

const child = (item: Item, name: string) => item.node.children.find((c) => c.name === name);
const numberOf = (token: string | undefined, fallback: number) => {
  const n = Number(token);
  return token === undefined || !Number.isFinite(n) ? fallback : n;
};

/** The energy blocks of one item inside the region, or why it was skipped. */
function readItem(
  item: Item,
  region: Region,
  dir: string,
): { blocks: Block[]; file: string } | { skip: string } | undefined {
  if (item.source?.type === 'MIDI') return undefined;
  if (child(item, 'MUTE')?.args[0] === '1') return undefined;
  const start = Math.max(item.position, region.start);
  const end = Math.min(item.position + item.length, region.end);
  if (end - start < 0.001) return undefined;
  if (!item.source?.file) {
    const label = item.name ? `'${item.name}'` : `item at ${item.position.toFixed(3)}s`;
    return { skip: `${label} skipped: no source file` };
  }

  const file = basename(item.source.file.replace(/\\/g, '/'));
  if (item.source.type !== 'WAVE') {
    return { skip: `'${file}' skipped: ${item.source.type} is not supported, WAV only` };
  }
  const path = resolve(dir, item.source.file.replace(/\\/g, '/'));
  if (!existsSync(path)) return { skip: `'${file}' skipped: file not found at ${path}` };

  let wav;
  try {
    wav = openWav(path);
  } catch (error) {
    if (error instanceof WavError) return { skip: `'${file}' skipped: ${error.message}` };
    throw error;
  }
  try {
    const rate = numberOf(child(item, 'PLAYRATE')?.args[0], 1) || 1;
    const soffs = numberOf(child(item, 'SOFFS')?.args[0], 0);
    const hop = Math.max(1, Math.round(wav.sampleRate * BLOCK_SECONDS));
    const first = Math.round((soffs + (start - item.position) * rate) * wav.sampleRate);
    const last = Math.round((soffs + (end - item.position) * rate) * wav.sampleRate);
    const blocks: Block[] = [];
    const chunk = hop * Math.max(1, Math.floor(READ_FRAMES / hop));
    for (let at = first; at < last; at += chunk) {
      const data = wav.readFrames(at, Math.min(chunk, last - at));
      const got = Math.floor(data.length / wav.channels);
      if (got === 0) break;
      for (let b = 0; b < got; b += hop) {
        const count = Math.min(hop, got - b);
        let sum = 0;
        for (let i = b * wav.channels; i < (b + count) * wav.channels; i++) {
          sum += (data[i] ?? 0) * (data[i] ?? 0);
        }
        const centre = (at + b + count / 2 - first) / wav.sampleRate / rate;
        blocks.push({ time: start + centre, energy: sum / (count * wav.channels), frames: count });
      }
    }
    return { blocks, file };
  } finally {
    wav.close();
  }
}

/** The bar a time falls in, 0-based, by binary search over the bar start times. */
function barIndex(starts: readonly number[], time: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] ?? Infinity) <= time) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Rounds a position to a 16th note, carrying into the next bar when it reaches it. */
function snap(timeline: SongTimeline, time: number): BarBeat {
  const here = timeline.barBeatAt(time);
  const rounded = { bar: here.bar, beat: Math.round(here.beat * 4) / 4 };
  const back = timeline.barBeatAt(timeline.timeAt(rounded));
  return back.bar === here.bar ? rounded : { bar: here.bar + 1, beat: 1 };
}

// Tracks the spec names as stems: Drums, KickBand, Snare.
const STEM_NAME = /drums|kickband|snare/i;

/**
 * A stem track is named Drums, KickBand or Snare, or holds the full mix: an
 * item whose file name contains the region's name (`01. Lantern.wav`).
 */
function isStemTrack(track: Track, region: Region): boolean {
  if (STEM_NAME.test(track.name)) return true;
  const song = region.name.trim().toLowerCase();
  return (
    song !== '' &&
    track.items.some((i) =>
      basename((i.source?.file ?? '').replace(/\\/g, '/'))
        .toLowerCase()
        .includes(song),
    )
  );
}

/** Whether a track is a drum stem by its name: Drums, KickBand or Snare. */
export const isDrumStem = (name: string): boolean => STEM_NAME.test(name);

const trackName = (track: Track, index: number) => track.name || `Track ${index + 1}`;

/** RMS per song bar and onsets for every stem track (Drums, KickBand, Snare, the full mix) with audio in the region. */
export function analyseRegion(
  project: RppProject,
  region: Region,
  options: AnalyseOptions,
): Analysis {
  const timeline = regionTimeline(project, region);
  const bars = Math.max(1, Math.ceil(timeline.lengthInBars - 1e-6));
  const starts = Array.from({ length: bars }, (_, i) => timeline.timeAt({ bar: i + 1, beat: 1 }));
  const warnings: string[] = [];
  const stems: StemAnalysis[] = [];

  project.tracks.forEach((track, index) => {
    if (!isStemTrack(track, region)) return;
    const name = trackName(track, index);
    const sums = new Array<number>(bars).fill(0);
    const counts = new Array<number>(bars).fill(0);
    const onsets: Onset[] = [];
    const files: string[] = [];
    for (const item of track.items) {
      const read = readItem(item, region, options.dir);
      if (!read) continue;
      if ('skip' in read) {
        const warning = `${name}: ${read.skip}`;
        if (!warnings.includes(warning)) warnings.push(warning);
        continue;
      }
      if (!files.includes(read.file)) files.push(read.file);
      for (const b of read.blocks) {
        const bar = barIndex(starts, b.time);
        sums[bar] = (sums[bar] ?? 0) + b.energy * b.frames;
        counts[bar] = (counts[bar] ?? 0) + b.frames;
      }
      const env = read.blocks.map((b) => Math.sqrt(b.energy));
      for (const i of detectOnsets(env)) {
        const time = (read.blocks[i] as Block).time;
        onsets.push({ time, position: snap(timeline, time) });
      }
    }
    if (files.length === 0) return;
    onsets.sort((a, b) => a.time - b.time);
    const rms = sums.map((s, i) => {
      const n = counts[i] ?? 0;
      return n === 0 ? null : 10 * Math.log10(s / n);
    });
    stems.push({ name, files, rms, onsets });
  });

  const markers = timeline.markers.map((m) => ({
    bar: timeline.barBeatAt(m.time).bar,
    name: m.name,
  }));
  return { region: region.name, bars, markers, stems, warnings };
}

const db = (value: number | null): string => {
  if (value === null) return '.';
  return value === -Infinity || value < -99 ? '-inf' : value.toFixed(1);
};

/** The analysis as a compact table: one line per bar. */
export function formatAnalysis(a: Analysis): string {
  const lines = [`Region: ${a.region} (${a.bars} bars)`];
  if (a.stems.length === 0) lines.push('Stems: none with usable audio in this region');
  else lines.push(`Stems: ${a.stems.map((s) => s.name).join(', ')}`);
  for (const s of a.stems)
    lines.push(`  ${s.name}: ${s.files.join(', ')}, ${s.onsets.length} onsets`);
  if (a.warnings.length > 0) lines.push('Warnings:', ...a.warnings.map((w) => `  ${w}`));
  if (a.stems.length === 0) return lines.join('\n');

  lines.push(
    'RMS is dBFS per bar ("." where the stem has no audio). Onsets are song bar.beat, to a 16th note.',
    '',
  );
  const sections = a.markers.reduce((map, m) => {
    map.set(m.bar, [...(map.get(m.bar) ?? []), m.name]);
    return map;
  }, new Map<number, string[]>());
  const secWidth = Math.max(7, ...[...sections.values()].map((n) => n.join('/').length));
  const widths = a.stems.map((s) => Math.max(s.name.length, 5));
  const head = ['Bar'.padStart(4), 'Section'.padEnd(secWidth)];
  a.stems.forEach((s, i) => head.push(s.name.padStart(widths[i] ?? 5)));
  lines.push(`${head.join('  ')}  Onsets`);

  for (let bar = 1; bar <= a.bars; bar++) {
    const row = [String(bar).padStart(4), (sections.get(bar)?.join('/') ?? '').padEnd(secWidth)];
    a.stems.forEach((s, i) => row.push(db(s.rms[bar - 1] ?? null).padStart(widths[i] ?? 5)));
    const onsets = a.stems
      .map((s) => {
        const hits = s.onsets.filter((o) => o.position.bar === bar);
        return hits.length === 0
          ? ''
          : `${s.name} ${hits.map((o) => formatBarBeat(o.position)).join(' ')}`;
      })
      .filter(Boolean);
    lines.push(`${row.join('  ')}  ${onsets.join(' | ')}`.trimEnd());
  }
  return lines.join('\n');
}
