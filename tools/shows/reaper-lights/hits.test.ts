import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DENSITY_METRICS, FULL_AREA_HIT, type Tier } from '../make-shows/rules';
import type { MidiEvent } from './compile';
import { offBand, project, useSongs, type SectionRow } from './generate-fixture';
import { writeWav } from './wav-fixture';

const { generate, writeShow, folder } = useSongs();

const flashes = (events: MidiEvent[]) => events.filter((e) => e.kind === 'flash');
const hitsIn = (events: MidiEvent[], from: number, to: number) =>
  flashes(events).filter((e) => e.at.bar >= from && e.at.bar < to);
const position = (e: MidiEvent) => `${e.at.bar}.${Number(e.at.beat.toFixed(2))}`;
const hitWarnings = (warnings: string[]) =>
  warnings.filter((w) => /Hits \d|Hit kinds|full-area/.test(w));

const RATE = 2000;
/** A WAV of `seconds`, silent but for an 8 ms burst at each file time. */
function clicks(file: string, seconds: number, times: number[]): void {
  const loud = new Map<number, number>();
  for (const time of times) {
    const first = Math.round(time * RATE);
    for (let i = 0; i < 16; i++) loud.set(first + i, 0.8 * (1 - i / 16) * (i % 2 ? -1 : 1));
  }
  writeWav(file, {
    sampleRate: RATE,
    channels: 1,
    bits: 16,
    frames: Math.ceil(seconds * RATE),
    sample: (f) => loud.get(f) ?? 0,
  });
}

/** The times in a song of `bars` bars at the beats given in every bar. */
const everyBar = (bpm: number, bars: number, beats: number[]): number[] =>
  Array.from({ length: bars }, (_, bar) =>
    beats.map((beat) => ((bar * 4 + beat - 1) * 60) / bpm),
  ).flat();

/** Beats at the 2nd and 4th 16th of each beat: never on the grid. */
const OFF_GRID = [1, 2, 3, 4].flatMap((b) => [b + 0.25, b + 0.75]);
const isOffGrid = (at: string): boolean => /\.\d\.(25|75)$/.test(at);

/** Writes the Lantern fixture's drum stem: bursts at the song beats given. */
function lanternStem(beats: number[]): void {
  drumFile(everyBar(150, 96, beats));
}

/** Writes that stem's file, with bursts at the song times given. */
function drumFile(times: number[]): void {
  mkdirSync(join(folder(), 'Stems'));
  // The item plays the file from 8 s at the Region start.
  clicks(
    join(folder(), 'Stems/drum-take.wav'),
    8 + 154,
    times.map((t) => 8 + t),
  );
}

/** A project with a stem track per entry, each a WAV of bursts from the Region start. */
function withStems(rpp: string, seconds: number, stems: Record<string, number[]>): string {
  const tracks = Object.entries(stems).map(([name, times]) => {
    clicks(join(folder(), `${name}.wav`), seconds, times);
    return [
      '  <TRACK {S}',
      `    NAME ${name}`,
      '    <ITEM',
      '      POSITION 0',
      `      LENGTH ${seconds}`,
      '      SOFFS 0',
      '      PLAYRATE 1 1 0 -1 0 0.0025',
      '      <SOURCE WAVE',
      `        FILE "${name}.wav"`,
      '      >',
      '    >',
      '  >',
    ].join('\n');
  });
  return rpp.replace('  <TRACK', `${tracks.join('\n')}\n  <TRACK`);
}

const SONG: SectionRow[] = [
  [1, 'verse', 'groove'],
  [9, 'pre', 'drive'],
  [17, 'chorus', 'peak'],
  [33, 'stop'],
  [34, 'chorus2', 'peak'],
  [50, 'blackout'],
  [51, 'solo', 'drive'],
];
const song = (bpm = 120) => ({
  rpp: project(bpm, 66, SONG),
  region: 'Song',
  sections: SONG,
});

describe('generated Hits', () => {
  it('score 2 in every section of the sample song on the beat grid', () => {
    const { report, output } = generate();
    expect(offBand(report, ['hits'])).toEqual([]);
    expect(hitWarnings(report.warnings)).toEqual([]);
    expect(output).toContain('file not found');
    expect(output).toContain('on the beat grid');
  });

  it('sit on the drum stem onsets, and still score 2', () => {
    lanternStem(OFF_GRID);
    const { report, events, output } = generate();
    expect(offBand(report, ['hits'])).toEqual([]);
    expect(hitWarnings(report.warnings)).toEqual([]);
    expect(output).toContain('Drums');
    // All but the turn Hits on a section's bar 1, and the Risers, land on an onset.
    // The drum item ends at bar 91.
    const body = hitsIn(events, 1, 91)
      .map(position)
      .filter((at) => !at.endsWith('.1'));
    expect(body.length).toBeGreaterThan(40);
    expect(body.filter((at) => !isOffGrid(at))).toEqual([]);
  });

  it('give the same Plan for the same stem', () => {
    lanternStem(OFF_GRID);
    const first = generate().text;
    expect(generate({ flags: ['--force'] }).text).toBe(first);
  });

  it('fall back to the grid where the stem is too dense to pick from', () => {
    // Every 16th: 4 onsets a beat.
    lanternStem([1, 2, 3, 4].flatMap((b) => [b, b + 0.25, b + 0.5, b + 0.75]));
    const { events, report } = generate();
    expect(offBand(report, ['hits'])).toEqual([]);
    for (const e of flashes(events)) expect(Number.isInteger(e.at.beat), position(e)).toBe(true);
  });

  it('keeps to the onsets in the bars around a dense one', () => {
    // Bar 78 is a fill of 16ths; the others play off the grid. A bar lasts 1.6 s.
    const fill = [1, 2, 3, 4].flatMap((b) => [b, b + 0.25, b + 0.5, b + 0.75]);
    const beats = everyBar(150, 96, OFF_GRID).filter((t) => t < 123.2 || t >= 124.8);
    drumFile([...beats, ...fill.map((beat) => 123.2 + (beat - 1) * 0.4)]);
    const { events } = generate();
    expect(hitsIn(events, 78, 79).length).toBeGreaterThan(0);
    for (const e of hitsIn(events, 78, 79)) expect(Number.isInteger(e.at.beat)).toBe(true);
    expect(hitsIn(events, 79, 83).some((e) => isOffGrid(position(e)))).toBe(true);
  });

  it('fill from the grid where the stem is silent', () => {
    // The stem plays only the first 28 bars.
    drumFile(everyBar(150, 28, OFF_GRID));
    const { events, report } = generate();
    expect(offBand(report, ['hits'])).toEqual([]);
    expect(hitsIn(events, 10, 28).some((e) => isOffGrid(position(e)))).toBe(true);
    expect(hitsIn(events, 30, 44).some((e) => isOffGrid(position(e)))).toBe(false);
  });

  it('keep a beat between two Hits', () => {
    lanternStem(OFF_GRID);
    const { events } = generate();
    const times = flashes(events).map((e) => e.time);
    const gaps = times.slice(1).map((t, i) => t - (times[i] as number));
    expect(Math.min(...gaps)).toBeGreaterThan(0.4 - 1e-6);
  });

  it('put a turn Hit on bar 1 of each section', () => {
    const { events } = generate(song());
    for (const bar of [9, 17, 34, 51]) {
      expect(flashes(events).map(position), `bar ${bar}`).toContain(`${bar}.1`);
    }
    const turns = flashes(events).filter((e) => [17, 34].includes(e.at.bar) && e.at.beat === 1);
    expect(turns.map((e) => e.scene)).toEqual(['Hit: Blinder', 'Hit: Blinder']);
  });

  it('use the Blinder twice a song at most', () => {
    const { events } = generate();
    expect(flashes(events).filter((e) => e.scene === 'Hit: Blinder').length).toBeLessThanOrEqual(2);
  });

  it('put a Riser on the last bar before a build turns', () => {
    const { events } = generate(song());
    const risers = flashes(events).filter((e) => e.scene === 'Hit: Riser');
    // verse into drive, pre into the chorus. Not into a stop or down into the solo.
    expect(risers.map(position)).toEqual(['8.1', '16.1']);
    // Nothing else fires while a Riser holds its bar.
    expect(hitsIn(events, 8, 9)).toHaveLength(1);
  });

  it('burst the Strobe on a stop, then black out to the next section', () => {
    const { events, timeline } = generate(song());
    const stop = hitsIn(events, 33, 34);
    expect(stop.map((e) => [e.scene, position(e)])).toEqual([
      ['Hit: Strobe', '33.1'],
      ['Hit: Blackout', '33.2'],
    ]);
    const next = timeline.timeAt({ bar: 34, beat: 1 });
    expect(stop[1]!.time + stop[1]!.duration).toBeCloseTo(next);
    expect(hitsIn(events, 50, 51).map((e) => e.scene)).toEqual(['Hit: Blackout']);
  });

  it('hold a closing stop dark to the end of the song', () => {
    const sections: SectionRow[] = [
      [1, 'chorus', 'peak'],
      [9, 'stop'],
    ];
    const { events, timeline } = generate({
      rpp: project(120, 12, sections),
      region: 'Song',
      sections,
    });
    const blackout = flashes(events).find((e) => e.scene === 'Hit: Blackout')!;
    expect(blackout.time + blackout.duration).toBeCloseTo(timeline.end);
  });

  it('give 4 Hit kinds to a Drive section and 6 to a Peak one', () => {
    const { report } = generate(song());
    expect(report.warnings.filter((w) => w.includes('Hit kinds'))).toEqual([]);
  });

  it('score Hit Density 2 in sections of every length and tier', () => {
    const lengths = [1, 2, 3, 4, 6, 8, 9, 12, 15, 16, 23, 24, 33, 40];
    for (const tier of ['chill', 'groove', 'drive', 'peak'] as Tier[]) {
      for (const length of lengths) {
        for (const label of ['verse', 'build']) {
          const sections: SectionRow[] = [
            [1, label, tier],
            [1 + length, 'chorus', tier],
          ];
          const { report } = generate({
            rpp: project(120, 2 * length, sections),
            region: 'Song',
            sections,
            flags: ['--force'],
          });
          const what = `${tier} ${label} ${length} bars`;
          expect(offBand(report, ['hits']), what).toEqual([]);
          expect(hitWarnings(report.warnings), what).toEqual([]);
        }
      }
    }
  });

  describe('a breakdown', () => {
    const sections: SectionRow[] = [
      [1, 'breakdown'],
      [17, 'chorus', 'peak'],
    ];
    const rpp = project(120, 32, sections);

    it('takes Hits at the rate of Peak', () => {
      const { events, report } = generate({ rpp, region: 'Song', sections });
      // The chorus after it is the last one, at the ceiling for its backbeats.
      expect(report.sections.map((s) => s.counts.hits)).toEqual([24, 32]);
      expect(hitsIn(events, 1, 17)).toHaveLength(24);
    });

    it('takes them on the riff: the kick stem first', () => {
      const stems = withStems(rpp, 64, {
        KickBand: everyBar(120, 16, [1.75, 3.25]),
        Snare: everyBar(120, 16, [2.5, 4.5]),
      });
      const { events } = generate({ rpp: stems, region: 'Song', sections });
      const body = hitsIn(events, 1, 17)
        .map(position)
        .filter((at) => at !== '1.1');
      const kick = body.filter((at) => /\.(1\.75|3\.25)$/.test(at));
      expect(kick.length).toBeGreaterThan(body.length * 0.8);
      expect(
        body.filter((at) => Number.isInteger(Number(at.split('.').slice(1).join('.')))),
      ).toEqual([]);
    });

    it('takes the rate of a lower tier when given one', () => {
      const drive: SectionRow[] = [
        [1, 'breakdown', 'drive'],
        [17, 'chorus', 'peak'],
      ];
      const { report } = generate({ rpp, region: 'Song', sections: drive });
      expect(report.sections[0]!.counts.hits).toBe(12);
      expect(offBand(report, ['hits'])).toEqual([]);
    });
  });

  describe('full-area Hits', () => {
    const fullArea = (events: MidiEvent[]) =>
      flashes(events).filter((e) => FULL_AREA_HIT.test(e.scene ?? ''));

    it.each([120, 160, 200])('stay inside the rate limit at %i BPM', (bpm) => {
      const { report } = generate(song(bpm));
      expect(report.warnings.filter((w) => w.includes('full-area'))).toEqual([]);
      expect(offBand(report, ['hits'])).toEqual([]);
    });

    /** The sample Show with no partial Hit, so every body Hit is full-area. */
    function fullAreaShow(): string {
      return writeShow('full-area', (raw) => {
        raw.scenes = raw.scenes.filter((s) => !/^Hit: (Punch|Side|Colour Split)/.test(s.name));
      });
    }

    it.each([
      [160, 1],
      [200, 2],
    ])('at %i BPM with no partial Hit, sit %i beats apart or more', (bpm, beats) => {
      const sections: SectionRow[] = [
        [1, 'chorus', 'peak'],
        [2, 'chorus', 'peak'],
        [3, 'stop'],
        [4, 'chorus', 'peak'],
      ];
      // An onset on every beat, and a stop right after one.
      const rpp = withStems(project(bpm, 12, sections), 20, {
        Snare: everyBar(bpm, 12, [1, 2, 3, 4]),
      });
      const { events, report } = generate({
        rpp,
        region: 'Song',
        sections,
        show: fullAreaShow(),
      });
      const times = fullArea(events).map((e) => e.time);
      const gaps = times.slice(1).map((t, i) => t - (times[i] as number));
      expect(Math.min(...gaps)).toBeGreaterThan((beats * 60) / bpm - 1e-6);
      expect(report.warnings.filter((w) => w.includes('full-area'))).toEqual([]);
    });

    it('keep turn and stop Hits inside the rate limit in one-bar sections at 400 BPM in 2/4', () => {
      // Each bar lasts 0.3 s, so a Blinder or Strobe on every bar is too fast.
      const sections: SectionRow[] = [
        [1, 'verse', 'drive'],
        [2, 'chorus', 'peak'],
        [3, 'stop'],
        [4, 'chorus', 'peak'],
        [5, 'stop'],
        [6, 'outro', 'peak'],
      ];
      const { events, report } = generate({
        rpp: project(400, 8, sections, 2),
        region: 'Song',
        sections,
      });
      const times = fullArea(events).map((e) => e.time);
      const gaps = times.slice(1).map((t, i) => t - (times[i] as number));
      expect(Math.min(...gaps)).toBeGreaterThan(1 / 3 - 1e-6);
      expect(report.warnings.filter((w) => w.includes('full-area'))).toEqual([]);
      // The Strobes go in first; a Peak turn 0.3 s before one takes a partial Hit.
      const turns = flashes(events).filter((e) => e.at.beat === 1 && [2, 4].includes(e.at.bar));
      expect(turns.map((e) => [position(e), e.scene])).toEqual([
        ['2.1', 'Hit: Punch beams'],
        ['4.1', 'Hit: Punch beams'],
      ]);
      expect(fullArea(events).map(position)).toEqual(['3.1', '5.1']);
    });
  });

  it('leave the Look and Effect Density as it was', () => {
    const { report } = generate(song());
    const metrics = DENSITY_METRICS.filter((m) => m !== 'colour');
    expect(offBand(report, metrics)).toEqual([]);
  });
});
