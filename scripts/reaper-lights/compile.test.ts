import { describe, expect, it } from 'vitest';
import { compilePlan, type MidiEvent } from './compile';
import { parsePlan, PlanError } from './plan';
import { loadShow } from './show';
import type { TempoPoint } from './rpp';
import { SongTimeline, TempoMap } from './timeline';

const LAYERS = ['look', 'movement', 'pulse', 'colourfx', 'hit'];
const SCENES: [string, string, number, number, string][] = [
  ['base', 'Base: warm white', 1, 12, 'go'],
  ['fade', 'Intro/Outro: Fade', 1, 15, 'go'],
  ['candle', 'Chill: Candle', 1, 24, 'go'],
  ['drive', 'Drive: Red', 1, 72, 'go'],
  ['down', 'Chill: Down', 2, 24, 'go'],
  ['pulse', 'Chill: Pulse', 3, 24, 'go'],
  ['rainbow', 'Chill: Rainbow', 4, 24, 'go'],
  ['punch', 'Hit: Beam punch', 5, 25, 'flash'],
  ['riser', 'Hit: Riser', 5, 33, 'flash'],
];
const show = loadShow(
  JSON.stringify({
    layers: LAYERS.map((id) => ({ id, name: id === 'colourfx' ? 'Colour FX' : id })),
    scenes: SCENES.map(([id, name, ch]) => ({ id, name, layer: LAYERS[ch - 1] })),
    baseLook: 'base',
    triggers: [
      ...LAYERS.map((_, i) => ({
        channel: i + 1,
        note: 0,
        scene: SCENES[0]?.[0],
        mode: 'release',
      })),
      ...SCENES.map(([scene, , channel, note, mode]) => ({ channel, note, scene, mode })),
    ],
  }),
);

// 120 BPM in 4/4: a bar is 2 s. 20 bars. Chorus1 is bar 5, Break bar 9, outro bar 17.
const points: TempoPoint[] = [{ time: 0, bpm: 120, shape: 'square' }];
const markers = [
  { name: 'Verse1', time: 0 },
  { name: 'Chorus1', time: 8 },
  { name: 'Break', time: 16 },
  { name: 'outro', time: 32 },
];
const timeline = () =>
  new SongTimeline(
    new TempoMap(120, points),
    { num: 4, den: 4 },
    points,
    { start: 0, end: 40 },
    markers,
  );

const compile = (yaml: string): MidiEvent[] => compilePlan(parsePlan(yaml), show, timeline());
const HEAD = 'song: Test\n';
const at = (events: MidiEvent[], layer: string) => events.filter((e) => e.layer === layer);

describe('compilePlan', () => {
  it('resets every Layer at the region start', () => {
    const events = compile(HEAD);
    const start = events.filter((e) => e.time === 0);
    // Base on Look, Down on Movement; Release on Pulse, Colour FX; nothing on Hit.
    expect(start.map((e) => [e.channel, e.note, e.kind])).toEqual([
      [1, 12, 'go'],
      [2, 24, 'go'],
      [3, 0, 'release'],
      [4, 0, 'release'],
    ]);
  });

  it('lets a cue or the start block replace the reset on a Layer', () => {
    const events = compile(
      `${HEAD}start:\n  movement: "Chill: Down"\ncues:\n  - at: 1\n    look: "Chill: Candle"\n`,
    );
    const start = events.filter((e) => e.time === 0).map((e) => [e.channel, e.note]);
    expect(start).toEqual([
      [1, 24],
      [2, 24],
      [3, 0],
      [4, 0],
    ]);
  });

  it('releases Movement when the Show has no Down Scene on it', () => {
    const bare = loadShow(
      JSON.stringify({
        layers: [
          { id: 'look', name: 'look' },
          { id: 'movement', name: 'movement' },
        ],
        scenes: [
          { id: 'base', name: 'Base', layer: 'look' },
          { id: 'sway', name: 'Chill: Sway', layer: 'movement' },
        ],
        baseLook: 'base',
        triggers: [
          { channel: 1, note: 0, scene: 'base', mode: 'release' },
          { channel: 1, note: 12, scene: 'base', mode: 'go' },
          { channel: 2, note: 0, scene: 'sway', mode: 'release' },
          { channel: 2, note: 26, scene: 'sway', mode: 'go' },
        ],
      }),
    );
    const start = compilePlan(parsePlan(`${HEAD}end:\n  look: Base\n`), bare, timeline()).filter(
      (e) => e.time === 0,
    );
    expect(start.map((e) => [e.channel, e.note, e.kind])).toEqual([
      [1, 12, 'go'],
      [2, 0, 'release'],
    ]);
  });

  it('makes Go and Release notes 1/16 long, measured ahead of the note', () => {
    // 120 BPM to bar 5, then 60 BPM: a 1/16 at bar 5 is 0.25 s, not the 0.125 s behind it.
    const slow: TempoPoint[] = [
      { time: 0, bpm: 120, shape: 'square' },
      { time: 8, bpm: 60, shape: 'square' },
    ];
    const tl = new SongTimeline(
      new TempoMap(120, slow),
      { num: 4, den: 4 },
      slow,
      { start: 0, end: 40 },
      markers,
    );
    const events = compilePlan(
      parsePlan(`${HEAD}cues:\n  - at: 5\n    look: "Chill: Candle"\n`),
      show,
      tl,
    );
    expect(events.find((e) => e.note === 24 && e.layer === 'look')?.duration).toBeCloseTo(0.25);
  });

  it('keeps the default Go length', () => {
    const [first] = compile(HEAD);
    // A 1/16 note at 120 BPM is 0.125 s.
    expect(first?.duration).toBeCloseTo(0.125);
  });

  it('places section cues by marker, with palette tiers', () => {
    const events = compile(
      `${HEAD}palette:\n  drive:\n    look: "Drive: Red"\n    pulse: "Chill: Pulse"\ncues:\n  - at: Chorus1\n    tier: drive\n    pulse: release\n`,
    );
    const chorus = events.filter((e) => e.time === 8);
    expect(chorus.map((e) => [e.layer, e.kind, e.note])).toEqual([
      ['look', 'go', 72],
      ['pulse', 'release', 0],
    ]);
  });

  it('resolves marker-relative events', () => {
    const events = compile(`${HEAD}events:\n  - at: Chorus1 +4.3\n    scene: "Hit: Beam punch"\n`);
    const hit = at(events, 'hit')[0];
    // Bar 5 + 4 bars + 3 beats: bar 9 beat 4 = 16 + 1.5 s.
    expect(hit?.time).toBeCloseTo(17.5);
    expect(hit?.at).toEqual({ bar: 9, beat: 4 });
  });

  it('resolves absolute bar.beat', () => {
    const hit = at(
      compile(`${HEAD}events:\n  - at: 5.3\n    scene: "Hit: Beam punch"\n`),
      'hit',
    )[0];
    expect(hit?.time).toBeCloseTo(9);
  });

  it('makes a Flash last its length', () => {
    const run = (extra: string) =>
      at(compile(`${HEAD}events:\n  - at: 3\n    scene: "Hit: Riser"\n${extra}`), 'hit')[0];
    expect(run('    length: 2 beats\n')?.duration).toBeCloseTo(1);
    expect(run('    length: 1/2 beat\n')?.duration).toBeCloseTo(0.25);
    expect(run('    length: 1 bar\n')?.duration).toBeCloseTo(2);
    expect(run('')?.duration).toBeCloseTo(0.5);
    expect(run('    until: Chorus1\n')?.duration).toBeCloseTo(4);
    expect(run('')?.kind).toBe('flash');
  });

  it('expands a pattern over a section', () => {
    const events = compile(
      `${HEAD}patterns:\n  - in: Chorus1\n    every: 1 bar\n    beat: 1\n    scene: "Hit: Beam punch"\n    length: 1 beat\n`,
    );
    const hits = at(events, 'hit');
    // Chorus1 runs bars 5 to 8: four hits, one per bar.
    expect(hits.map((h) => h.time)).toEqual([8, 10, 12, 14]);
    expect(hits.every((h) => h.duration === 0.5)).toBe(true);
  });

  it('expands from..to, alternating scenes, on a beat period', () => {
    const events = compile(
      `${HEAD}patterns:\n  - from: 5\n    to: 5.4\n    every: 1 beat\n    alternate: ["Hit: Beam punch", "Hit: Riser"]\n`,
    );
    const hits = at(events, 'hit');
    expect(hits.map((h) => h.note)).toEqual([25, 33, 25]);
    expect(hits.map((h) => h.time)).toEqual([8, 8.5, 9]);
  });

  it('fires the end cue at the region end', () => {
    const events = compile(HEAD);
    const last = events.at(-1);
    expect([last?.channel, last?.note, last?.kind]).toEqual([1, 15, 'go']);
    // Inside the last 1/16 of the region.
    expect(last?.time).toBeCloseTo(40 - 0.125);
    expect((last?.time ?? 0) + (last?.duration ?? 0)).toBeCloseTo(40);
  });

  it('takes an end cue from the plan', () => {
    const events = compile(`${HEAD}end:\n  look: "Chill: Candle"\n  pulse: release\n`);
    const tail = events.filter((e) => e.time > 39);
    expect(tail.map((e) => [e.layer, e.note])).toEqual([
      ['look', 24],
      ['pulse', 0],
    ]);
  });

  it('sorts events by time', () => {
    const events = compile(
      `${HEAD}events:\n  - at: 9\n    scene: "Hit: Beam punch"\n  - at: 2\n    scene: "Hit: Riser"\n`,
    );
    const times = events.map((e) => e.time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('rejects a missing Scene, naming the line', () => {
    const run = () => compile(`${HEAD}events:\n  - at: 2\n    scene: "Hit: Nope"\n`);
    expect(run).toThrow(PlanError);
    expect(run).toThrow("Line 4: Unknown Scene 'Hit: Nope'");
  });

  it('rejects a missing Scene in a cue and in the palette', () => {
    expect(() => compile(`${HEAD}cues:\n  - at: 1\n    look: Nope\n`)).toThrow(
      "Line 4: Unknown Scene 'Nope'",
    );
    expect(() => compile(`${HEAD}palette:\n  drive:\n    look: Nope\n`)).toThrow('Line 4:');
  });

  it('rejects a Scene on the wrong Layer, a Flash in a cue and a clash', () => {
    expect(() => compile(`${HEAD}cues:\n  - at: 1\n    pulse: "Chill: Candle"\n`)).toThrow(
      'not on the pulse Layer',
    );
    expect(() => compile(`${HEAD}cues:\n  - at: 1\n    hit: "Hit: Riser"\n`)).toThrow(
      'Flash Scene',
    );
    expect(() =>
      compile(
        `${HEAD}cues:\n  - at: 2\n    look: "Chill: Candle"\n  - at: 2\n    look: "Drive: Red"\n`,
      ),
    ).toThrow('Line 6: The look Layer is already set');
  });

  it('rejects times outside the region or on an ambiguous marker', () => {
    expect(() => compile(`${HEAD}events:\n  - at: 30\n    scene: "Hit: Riser"\n`)).toThrow(
      'outside the region',
    );
    expect(() => compile(`${HEAD}events:\n  - at: Nope\n    scene: "Hit: Riser"\n`)).toThrow(
      "Line 3: No marker 'Nope'",
    );
  });
});

describe('compilePlan checks', () => {
  const err = (yaml: string) => {
    try {
      compile(yaml);
    } catch (e) {
      return e as PlanError;
    }
    throw new Error('expected a PlanError');
  };

  it('rejects `beat` on a beat period, naming the line', () => {
    const e = err(
      `${HEAD}patterns:\n  - from: 5\n    to: 6\n    every: 1 beat\n    beat: 3\n    scene: "Hit: Beam punch"\n`,
    );
    expect(e.message).toMatch(/^Line 3: .*beat/);
  });

  it('rejects overlapping Flash notes on one note, naming both lines', () => {
    const e = err(
      `${HEAD}events:\n  - at: 5\n    scene: "Hit: Beam punch"\n    length: 2 beats\n  - at: 5.2\n    scene: "Hit: Beam punch"\n`,
    );
    expect(e.message).toMatch(/^Line 6: .*overlaps.*line 3/);
  });

  it('allows back-to-back Flash notes and overlaps on different notes', () => {
    const ok = compile(
      `${HEAD}events:\n  - at: 5\n    scene: "Hit: Beam punch"\n    length: 1 beat\n  - at: 5.2\n    scene: "Hit: Beam punch"\n  - at: 6\n    scene: "Hit: Riser"\n    length: 4 beats\n`,
    );
    expect(at(ok, 'hit')).toHaveLength(3);
  });
});
