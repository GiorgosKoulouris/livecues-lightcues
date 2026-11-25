// Test helper: runs `lights:song generate` on a project in a temp folder.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import type { DensityMetric, Tier } from '../make-shows/rules';
import { sampleFiles } from '../make-shows/sample-fixture';
import { run } from './cli';
import { compilePlan } from './compile';
import { densityReport, type DensityReport } from './density';
import { parsePlan } from './plan';
import { findRegion, readProject } from './rpp';
import { loadShow } from './show';
import { stackingWarnings } from './stacking';
import { regionTimeline } from './timeline';

export const LANTERN = readFileSync(new URL('./fixtures/lantern.rpp', import.meta.url), 'utf8');

/** The sample Show's Colour Sets, as `Main`, `Break` and `Swap` of one song. */
export const SETS = {
  main: 'Orange / Amber / White',
  break: 'Blue / Amber / White',
  swap: 'Amber / Orange / White',
} as const;

/** A Cue Sheet with just the Song sets table: the same roles for every song. */
export const cueSheet = (songs: readonly string[]): string =>
  [
    '### Song sets',
    '',
    '| Song | Main | Break | Swap |',
    '|---|---|---|---|',
    ...songs.map((song) => `| ${song} | ${SETS.main} (C0) | ${SETS.break} | ${SETS.swap} |`),
    '',
  ].join('\n');

/** The songs the tests generate. */
const SONGS = ['Lantern', 'Moonrise', 'Song'];

export type SectionRow = [bar: number, label: string, tier?: Tier];

/** Sections at the project markers of the Lantern fixture, plus the unmarked intro. */
export const LANTERN_SECTIONS: SectionRow[] = [
  [1, 'intro', 'chill'],
  [9, 'verse1', 'groove'],
  [25, 'pre1', 'drive'],
  [29, 'chorus1', 'drive'],
  [41, 'verse2', 'groove'],
  [49, 'build', 'drive'],
  [53, 'chorus2', 'drive'],
  [65, 'break1', 'chill'],
  [69, 'break2', 'drive'],
  [73, 'solo', 'drive'],
  [77, 'chorus3', 'peak'],
  [89, 'outro', 'chill'],
];

export const sectionsFile = (sections: SectionRow[]): string =>
  `sections:\n${sections
    .map(([bar, label, tier]) => {
      const t = tier ? `, tier: ${tier}` : '';
      return `  - { bar: ${bar}, label: ${label}${t} }`;
    })
    .join('\n')}\n`;

/** A project at `bpm` in `beats`/4: one Region `Song` of `bars` bars, with a marker per section. */
export function project(bpm: number, bars: number, sections: SectionRow[], beats = 4): string {
  const at = (bar: number) => ((bar - 1) * beats * 60) / bpm;
  const markers = sections.map(
    ([bar, label], i) => `  MARKER ${i + 2} ${at(bar)} ${label} 0 0 1 R {M${i}} 0 2`,
  );
  return [
    '<REAPER_PROJECT 0.1 "7.0/win64" 1 0',
    `  TEMPO ${bpm} ${beats} 4 0`,
    '  MARKER 1 0 Song 1 0 1 R {R} 0 1',
    `  MARKER 1 ${at(bars + 1)} "" 1`,
    ...markers,
    '  <TRACK {T}',
    '    NAME MidiToLights',
    '  >',
    '>',
    '',
  ].join('\n');
}

/** A 4/4 song `Song` of `bars` bars, at 120 BPM unless given, with a marker at each section. */
export const markedSong = (bars: number, sections: SectionRow[], bpm = 120) => ({
  rpp: project(bpm, bars, sections),
  region: 'Song',
  sections,
});

export interface RawShow {
  scenes: { id: string; name: string; layer: string; tags?: string[] }[];
  triggers: { channel: number; note: number; scene: string; mode: string }[];
  colourSets?: unknown[];
}

export interface Song {
  rpp?: string;
  region?: string;
  sections?: SectionRow[];
  /** A Show file. Without one, the sample Show. */
  show?: string;
  flags?: string[];
}

export const EFFECTS = ['look', 'movement', 'pulse', 'colourfx'] as const;

/** Each scored section's metrics that are off, as `bar name metric count`. */
export const offBand = (report: DensityReport, metrics: readonly DensityMetric[]) =>
  report.sections.flatMap((s) =>
    s.scores
      ? metrics
          .filter((m) => s.scores?.[m] !== 2)
          .map((m) => `${s.bar} ${s.name} ${m} ${s.counts[m]}`)
      : [],
  );

/** A temp folder per test, and `generate` in it. Call at the top of a test file. */
export function useSongs() {
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lights-generate-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * Writes the sample Show, changed by `edit`, with a Cue Sheet beside it, and
   * returns its path.
   */
  function writeShow(name: string, edit?: (raw: RawShow) => void): string {
    const raw = JSON.parse(sampleFiles.show) as RawShow;
    edit?.(raw);
    const file = join(dir, `${name}.lcshow`);
    writeFileSync(file, JSON.stringify(raw));
    writeFileSync(join(dir, `${name} cue sheet.md`), cueSheet(SONGS));
    return file;
  }

  /** Runs `generate`, and reads the Plan back as `render` does. */
  function generate({
    rpp = LANTERN,
    region = 'Lantern',
    sections = LANTERN_SECTIONS,
    show = writeShow('band'),
    flags = [],
  }: Song = {}) {
    const file = join(dir, 'song.rpp');
    const list = join(dir, 'sections.yaml');
    writeFileSync(file, rpp);
    writeFileSync(list, sectionsFile(sections));
    const output = run(['generate', file, region, '--show', show, '--sections', list, ...flags]);
    const planPath = join(dir, 'Lights', `${region}.lights.yaml`);
    const text = readFileSync(planPath, 'utf8');
    const plan = parsePlan(text);
    const map = loadShow(readFileSync(show, 'utf8'));
    const read = readProject(rpp);
    const timeline = regionTimeline(read, findRegion(read, region));
    const events = compilePlan(plan, map, timeline);
    const report = densityReport(plan, events, map, timeline)!;
    const stacking = stackingWarnings(plan, events, map, timeline);
    return {
      output,
      project: file,
      planPath,
      text,
      plan,
      map,
      timeline,
      events,
      report,
      stacking,
    };
  }

  return { generate, writeShow, folder: () => dir };
}
