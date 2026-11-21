import { describe, expect, it } from 'vitest';
import { compilePlan, type MidiEvent } from './compile';
import { parsePlan, PlanError } from './plan';
import { loadShow } from './show';
import type { TempoPoint } from './rpp';
import { SongTimeline, TempoMap } from './timeline';

const show = loadShow(
  JSON.stringify({
    layers: [{ id: 'look', name: 'Look' }],
    scenes: [
      { id: 'base', name: 'Base', layer: 'look' },
      { id: 'fade', name: 'Intro/Outro: Fade', layer: 'look' },
    ],
    baseLook: 'base',
    triggers: [
      { channel: 1, note: 0, scene: 'base', mode: 'release' },
      { channel: 1, note: 12, scene: 'base', mode: 'go' },
      { channel: 1, note: 15, scene: 'fade', mode: 'go' },
    ],
    colourSets: [
      { id: 'a', name: 'Opener', colours: {}, fade: 2, note: { channel: 6, note: 12 } },
      { id: 'b', name: 'Slow Tide', colours: {}, fade: 2, note: { channel: 6, note: 13 } },
      { id: 'c', name: 'Silent', colours: {}, fade: 2 },
    ],
  }),
);

// 120 BPM in 4/4: a bar is 2 s. 20 bars. Chorus1 is bar 5.
const points: TempoPoint[] = [{ time: 0, bpm: 120, shape: 'square' }];
const timeline = () =>
  new SongTimeline(new TempoMap(120, points), { num: 4, den: 4 }, points, { start: 0, end: 40 }, [
    { name: 'Verse1', time: 0 },
    { name: 'Chorus1', time: 8 },
  ]);
const compile = (yaml: string): MidiEvent[] => compilePlan(parsePlan(yaml), show, timeline());
const sets = (events: MidiEvent[]) => events.filter((e) => e.layer === 'colourset');

describe('Colour Set cues', () => {
  it('reads Colour Sets and their notes from the Show', () => {
    expect(show.colourSets.map((s) => [s.name, s.channel, s.note])).toEqual([
      ['Opener', 6, 12],
      ['Slow Tide', 6, 13],
      ['Silent', undefined, undefined],
    ]);
    expect(show.colourSet(' slow tide ')?.name).toBe('Slow Tide');
  });

  it('writes the song colour set at bar 1', () => {
    const events = compile('song: Test\ncolourset: Opener\n');
    expect(sets(events).map((e) => [e.time, e.channel, e.note, e.kind, e.scene])).toEqual([
      [0, 6, 12, 'go', 'Opener'],
    ]);
  });

  it('cues a colour set mid-song from a cue', () => {
    const events = compile(
      'song: Test\ncolourset: Opener\ncues:\n  - at: Chorus1\n    colour-set: Slow Tide\n',
    );
    expect(sets(events).map((e) => [e.time, e.note])).toEqual([
      [0, 12],
      [8, 13],
    ]);
  });

  it('writes none when the plan names none', () => {
    expect(sets(compile('song: Test\n'))).toEqual([]);
  });

  it('rejects an unknown name with its line', () => {
    const run = () => compile('song: Test\n\ncolourset: Nope\n');
    expect(run).toThrow(PlanError);
    expect(run).toThrow(/^Line 3: Unknown Colour Set 'Nope'. The Show has: Opener, Slow Tide/);
    expect(() => compile('song: Test\ncues:\n  - at: Chorus1\n    colourset: Nope\n')).toThrow(
      /^Line 4: Unknown Colour Set/,
    );
  });

  it('rejects a set with no MIDI note', () => {
    expect(() => compile('song: Test\ncolourset: Silent\n')).toThrow(/^Line 2: .*no MIDI note/);
  });

  it('rejects a Show with no Colour Sets', () => {
    const bare = loadShow(JSON.stringify({ scenes: [], triggers: [] }));
    expect(() => compilePlan(parsePlan('song: T\ncolourset: X\n'), bare, timeline())).toThrow(
      /^Line 2: The Show has no Colour Sets/,
    );
  });

  it('refuses two sets at one time', () => {
    expect(() =>
      compile('song: Test\ncolourset: Opener\ncues:\n  - at: 1.1\n    colourset: Slow Tide\n'),
    ).toThrow(/already set/);
  });
});
