import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRpp, readProject, RppError } from './rpp';

const raw = readFileSync(new URL('./fixtures/lantern.rpp', import.meta.url), 'utf8');
const project = readProject(raw);

describe('parseRpp', () => {
  it('records the span of every node in the raw text', () => {
    const root = parseRpp(raw);
    expect(raw.slice(root.start, root.end)).toBe(raw.trimEnd());
    const track = root.children.find((c) => c.name === 'TRACK')!;
    expect(raw.slice(track.start, track.end)).toMatch(/^ {2}<TRACK[\s\S]*\n {2}>$/);
  });

  it('reads CRLF files the same way', () => {
    const crlf = readProject(raw.replace(/\n/g, '\r\n'));
    expect(crlf.regions).toEqual(project.regions);
    expect(crlf.markers).toEqual(project.markers);
  });

  it('rejects unbalanced chunks and other files', () => {
    expect(() => parseRpp('<REAPER_PROJECT\n  A 1\n')).toThrow(RppError);
    expect(() => parseRpp('<REAPER_PROJECT\n>\n>\n')).toThrow(RppError);
    expect(() => parseRpp('<OTHER\n>\n')).toThrow('Not a Reaper project');
  });
});

describe('readProject', () => {
  it('reads regions with their start and end', () => {
    expect(project.regions.map((r) => r.name)).toEqual(['Opening', 'Lantern', 'Pebbles']);
    const lantern = project.regions[1]!;
    expect(lantern.start).toBeCloseTo(32, 3);
    expect(lantern.end).toBeCloseTo(185.6, 3);
  });

  it('reads markers apart from regions, in file order', () => {
    expect(project.markers).toHaveLength(15);
    expect(project.markers.slice(0, 3).map((m) => m.name)).toEqual(['Verse1', 'Pre1', 'Chorus1']);
    expect(project.markers[0]?.time).toBeCloseTo(44.8, 3);
  });

  it('reads the tempo envelope with signature and shape', () => {
    expect(project.initial).toEqual({ bpm: 90, num: 4, den: 4 });
    expect(project.tempoPoints.map((p) => p.bpm)).toEqual([90, 150, 110]);
    expect(project.tempoPoints[1]).toMatchObject({
      shape: 'square',
      signature: { num: 4, den: 4 },
    });
  });

  it('reads a ramp and a changed signature', () => {
    const p = readProject(
      `<REAPER_PROJECT 0.1\n  <TEMPOENVEX\n    PT 0 100 0 262147 0 1\n    PT 4 140 1\n  >\n>\n`,
    );
    expect(p.tempoPoints).toEqual([
      { time: 0, bpm: 100, shape: 'linear', signature: { num: 3, den: 4 } },
      { time: 4, bpm: 140, shape: 'square' },
    ]);
  });

  it('reads tracks with their items and sources', () => {
    expect(project.tracks.map((t) => t.name)).toEqual(['Drums', 'MidiToLights']);
    const [item] = project.tracks[0]!.items;
    expect(item?.name).toBe('drum-take.wav');
    expect(item?.position).toBeCloseTo(32, 3);
    expect(item?.length).toBeCloseTo(144, 2);
    expect(item?.source).toEqual({ type: 'WAVE', file: 'Stems/drum-take.wav' });
    expect(project.tracks[1]?.items).toEqual([]);
  });
});
