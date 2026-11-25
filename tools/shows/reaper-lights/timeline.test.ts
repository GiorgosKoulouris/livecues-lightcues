import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readProject, type TempoPoint } from './rpp';
import { formatBarBeat, regionTimeline, SongTimeline, TempoMap, TimelineError } from './timeline';

const sq = (time: number, bpm: number, signature?: TempoPoint['signature']): TempoPoint => ({
  time,
  bpm,
  shape: 'square',
  signature,
});
const build = (points: TempoPoint[], region = { start: 0, end: 20 }, markers = []) =>
  new SongTimeline(new TempoMap(100, points), { num: 4, den: 4 }, points, region, markers);

describe('SongTimeline', () => {
  it('counts bars at a constant tempo', () => {
    const t = build([sq(0, 120)]);
    expect(t.timeAt({ bar: 1, beat: 1 })).toBeCloseTo(0);
    expect(t.timeAt({ bar: 3, beat: 2 })).toBeCloseTo(4.5);
    expect(t.barBeatAt(4.5)).toEqual({ bar: 3, beat: 2 });
    expect(t.lengthInBars).toBeCloseTo(10);
  });

  it('starts bar 1 at the region start, past earlier tempo changes', () => {
    const t = build([sq(0, 60), sq(10, 120)], { start: 10, end: 30 });
    expect(t.barBeatAt(10)).toEqual({ bar: 1, beat: 1 });
    expect(t.barBeatAt(14)).toEqual({ bar: 3, beat: 1 });
    expect(t.timeAt({ bar: 2, beat: 1 })).toBeCloseTo(12);
  });

  it('converts across a linear ramp', () => {
    // 120 to 160 BPM over 8 s: 140 BPM average, 18.667 quarter notes.
    const t = build([{ time: 0, bpm: 120, shape: 'linear' }, sq(8, 160)]);
    expect(t.timeAt({ bar: 2, beat: 1 })).toBeCloseTo(1.923, 3);
    expect(t.barBeatAt(8).bar).toBe(5);
    expect(t.barBeatAt(8).beat).toBeCloseTo(3.667, 3);
    // After the ramp, 160 BPM: one bar is 1.5 s. Bar 6 starts at 20 quarter notes.
    expect(t.timeAt({ bar: 6, beat: 1 })).toBeCloseTo(8.5, 6);
    for (const time of [0.3, 3.1, 7.99, 8.5, 12.2]) {
      expect(t.timeAt(t.barBeatAt(time))).toBeCloseTo(time, 6);
    }
  });

  it('reads a bar line as beat 1 when a tempo point sits just ahead of the grid', () => {
    // Reaper can leave a tempo point off the grid: the change meant for bar 3
    // (6.4 s at 75 BPM) is 6 µs early, so a marker on that bar is just short
    // of it.
    const t = build([sq(0, 75), sq(6.399994, 150)]);
    expect(t.barBeatAt(6.399994)).toEqual({ bar: 3, beat: 1 });
    expect(t.barBeatAt(6.799994)).toEqual({ bar: 3, beat: 2 });
    expect(t.barBeatAt(6.39).bar).toBe(2);
    expect(t.barBeatAt(6.39).beat).toBeCloseTo(4.9875, 3);
  });

  it('adds no bar for a signature change that sits just past a bar line', () => {
    const t = build([sq(0, 120), sq(8.000008, 120, { num: 3, den: 4 })]);
    expect(t.signatures[1]).toEqual({ bar: 5, num: 3, den: 4 });
  });

  it('follows a time-signature change', () => {
    // 4/4 at 120 BPM (2 s a bar), 3/4 from bar 5 (1.5 s), 4/4 again from bar 8.
    const t = build([
      sq(0, 120, { num: 4, den: 4 }),
      sq(8, 120, { num: 3, den: 4 }),
      sq(12.5, 120, { num: 4, den: 4 }),
    ]);
    expect(t.timeAt({ bar: 5, beat: 3 })).toBeCloseTo(9);
    expect(t.timeAt({ bar: 6, beat: 1 })).toBeCloseTo(9.5);
    expect(t.barBeatAt(12.5)).toEqual({ bar: 8, beat: 1 });
    expect(t.timeAt({ bar: 9, beat: 1 })).toBeCloseTo(14.5);
    expect(t.barBeatAt(14.5)).toEqual({ bar: 9, beat: 1 });
    expect(t.signatures).toEqual([
      { bar: 1, num: 4, den: 4 },
      { bar: 5, num: 3, den: 4 },
      { bar: 8, num: 4, den: 4 },
    ]);
  });

  it('resolves marker-relative times', () => {
    const markers = [
      { name: 'Verse1', time: 8 },
      { name: 'Chorus1', time: 16 },
      { name: 'roll', time: 18 },
      { name: 'Roll', time: 19 },
    ];
    const t = build([sq(0, 120)], { start: 0, end: 40 }, markers as never);
    expect(t.resolve('Chorus1')).toBeCloseTo(16);
    expect(t.resolve('chorus1 +4')).toBeCloseTo(24);
    expect(t.resolve('Chorus1 +4.3')).toBeCloseTo(25.5);
    expect(t.resolve('Chorus1 -1')).toBeCloseTo(14);
    expect(t.resolve('9.3')).toBeCloseTo(17);
    expect(t.resolve('9')).toBeCloseTo(16);
    expect(() => t.resolve('Bridge +1')).toThrow(TimelineError);
    expect(() => t.resolve('roll')).toThrow(/ambiguous/);
  });

  it('reads a fraction of a beat, as it formats one', () => {
    const t = build([sq(0, 120)], { start: 0, end: 40 });
    // 120 BPM: a beat is 0.5 s.
    expect(t.resolve('9.3.5')).toBeCloseTo(17.25);
    expect(t.resolve('9.3.25')).toBeCloseTo(17.125);
    expect(t.resolve('1.1.75')).toBeCloseTo(0.375);
  });

  it('formats positions', () => {
    expect(formatBarBeat({ bar: 12, beat: 4 })).toBe('12.4');
    expect(formatBarBeat({ bar: 5, beat: 2.5 })).toBe('5.2.5');
  });
});

describe('regionTimeline on Lantern', () => {
  const project = readProject(
    readFileSync(new URL('./fixtures/lantern.rpp', import.meta.url), 'utf8'),
  );
  const t = regionTimeline(
    project,
    project.regions.find((r) => r.name === 'Lantern')!,
  );

  it('spans 96 bars at 150 BPM', () => {
    expect(t.lengthInBars).toBeCloseTo(96, 3);
    expect(t.markers).toHaveLength(15);
  });

  it('puts markers at song bars', () => {
    expect(formatBarBeat(t.barBeatAt(t.resolve('Verse1')))).toBe('9.1');
    expect(formatBarBeat(t.barBeatAt(t.resolve('Chorus1')))).toBe('29.1');
    expect(formatBarBeat(t.barBeatAt(t.resolve('Verse2 +0.2')))).toBe('41.3');
  });
});
