import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { analyseRegion, detectOnsets, formatAnalysis } from './analyse';
import { run } from './cli';
import { findRegion, readProject } from './rpp';
import { writeWav } from './wav-fixture';

const dir = mkdtempSync(join(tmpdir(), 'analyse-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
mkdirSync(join(dir, 'Stems'));

const RATE = 16000;
const SECONDS = 17;
const frames = RATE * SECONDS;

// 120 BPM in 4/4: a beat is 0.5 s and a bar 2 s. Region "Song" is 4 s to 20 s: 8 bars.
const CLICKS_AT = [7, 12, 14.75]; // song 2.3, 5.1 and 6.2.5 (seconds 7, 12, 14.75)

/** A 4 ms decaying burst at each click time, in file seconds. */
function clickTrain(times: number[]) {
  return (frame: number): number => {
    const t = frame / RATE;
    for (const c of times) {
      const dt = t - c;
      if (dt >= 0 && dt < 0.004) return 0.8 * Math.sin(2 * Math.PI * 1000 * dt) * (1 - dt / 0.004);
    }
    return 0;
  };
}

// Drums item: position 4, offset 1, so song time t is file time t - 3.
writeWav(join(dir, 'Stems/drums.wav'), {
  sampleRate: RATE,
  channels: 2,
  bits: 24,
  frames,
  sample: (f) => clickTrain(CLICKS_AT.map((t) => t - 3))(f),
});
// Bass item: starts at the region start. A 0.5 amplitude sine for 2 bars, then 0.05.
writeWav(join(dir, 'Stems/bass.wav'), {
  sampleRate: RATE,
  channels: 1,
  bits: 16,
  frames,
  sample: (f) => (f / RATE < 4 ? 0.5 : 0.05) * Math.sin((2 * Math.PI * 110 * f) / RATE),
});

copyFileSync(join(dir, 'Stems/bass.wav'), join(dir, 'Stems/Song mix.wav'));

const item = (pos: number, len: number, soffs: number, type: string, file: string, extra = '') =>
  [
    '    <ITEM',
    `      POSITION ${pos}`,
    `      LENGTH ${len}`,
    `      ${extra}`,
    `      SOFFS ${soffs}`,
    '      PLAYRATE 1 1 0 -1 0 0.0025',
    `      <SOURCE ${type}`,
    `        FILE "${file}"`,
    '      >',
    '    >',
  ].join('\n');

const track = (name: string, ...items: string[]) =>
  [`  <TRACK`, `    NAME ${name}`, ...items, '  >'].join('\n');

const rpp = (...tracks: string[]) =>
  [
    '<REAPER_PROJECT 0.1',
    '  TEMPO 120 4 4',
    '  MARKER 1 4 Song 1 0 1 R {A} 0 1',
    '  MARKER 1 20 "" 1',
    '  MARKER 1 8 Verse 0 0 1 R {B} 0 2',
    ...tracks,
    '>',
    '',
  ].join('\n');

const analyse = (text: string) => {
  const project = readProject(text);
  return analyseRegion(project, findRegion(project, 'Song'), { dir });
};

describe('detectOnsets', () => {
  it('picks peaks in the rise of a signal and ignores steady levels', () => {
    const env = Array.from({ length: 200 }, (_, i) => (i < 50 ? 0.1 : i < 52 ? 0.9 : 0.1));
    expect(detectOnsets(env)).toEqual([50]);
    expect(detectOnsets(new Array(100).fill(0.3))).toEqual([]);
    expect(detectOnsets([])).toEqual([]);
  });

  it('merges onsets closer than the minimum gap', () => {
    const env = new Array(200).fill(0);
    env[50] = 1;
    env[52] = 1;
    env[120] = 1;
    expect(detectOnsets(env)).toEqual([50, 120]);
  });
});

describe('analyseRegion', () => {
  const a = analyse(
    rpp(
      track('Drums', item(4, 16, 1, 'WAVE', 'Stems/drums.wav')),
      track('KickBand', item(4, 16, 0, 'WAVE', 'Stems/bass.wav')),
    ),
  );
  const drums = a.stems.find((s) => s.name === 'Drums')!;
  const bass = a.stems.find((s) => s.name === 'KickBand')!;

  it('finds onsets at the beats the clicks sit on, honouring position and offset', () => {
    expect(a.bars).toBe(8);
    expect(drums.onsets).toHaveLength(3);
    const at = drums.onsets.map((o) => [o.position.bar, Number(o.position.beat.toFixed(1))]);
    expect(at).toEqual([
      [2, 3],
      [5, 1],
      [6, 2.5],
    ]);
    drums.onsets.forEach((o, i) =>
      expect(Math.abs(o.time - (CLICKS_AT[i] ?? 0))).toBeLessThan(0.02),
    );
  });

  it('reports RMS per bar in dBFS', () => {
    expect(bass.rms[0]).toBeCloseTo(20 * Math.log10(0.5 / Math.SQRT2), 1);
    expect(bass.rms[1]).toBeCloseTo(-9, 0);
    expect(bass.rms[2]).toBeCloseTo(20 * Math.log10(0.05 / Math.SQRT2), 1);
    expect(drums.rms[0]).toBe(-Infinity);
  });

  it('prints a compact table with sections and onsets', () => {
    const out = formatAnalysis(a);
    expect(out).toContain('Region: Song (8 bars)');
    expect(out).toContain('Drums, KickBand');
    expect(out).toMatch(/^\s*3\s+Verse\s/m);
    expect(out).toMatch(/^\s*6\s.*Drums 6\.2\.5/m);
    expect(out).toMatch(/^\s*2\s.*Drums 2\.3/m);
  });
});

describe('analyseRegion with partial and unusable items', () => {
  it('leaves bars outside an item empty and clips an item to the region', () => {
    // The item starts at 8 s (bar 3) and runs past the region end.
    const a = analyse(rpp(track('KickBand', item(8, 100, 0, 'WAVE', 'Stems/bass.wav'))));
    const rms = a.stems[0]!.rms;
    expect(rms.slice(0, 2)).toEqual([null, null]);
    expect(rms[2]).toBeCloseTo(-9, 0);
    expect(rms).toHaveLength(8);
  });

  it('skips MP3 and missing files with a warning, and muted or MIDI items quietly', () => {
    const a = analyse(
      rpp(
        track(
          'Drums',
          item(4, 16, 0, 'MP3', 'Stems/mix.mp3'),
          item(4, 16, 0, 'WAVE', 'Stems/gone.wav'),
          item(4, 16, 0, 'WAVE', 'Stems/bass.wav', 'MUTE 1 0'),
        ),
        track('Notes', item(4, 16, 0, 'MIDI', '')),
        track('Snare', item(100, 5, 0, 'MP3', 'Stems/later.mp3')),
      ),
    );
    expect(a.stems).toEqual([]);
    expect(a.warnings).toEqual([
      expect.stringMatching(/Drums.*mix\.mp3.*MP3/),
      expect.stringMatching(/Drums.*gone\.wav.*not found/),
    ]);
  });

  it('warns about an item with no source file', () => {
    const noSource = [
      '    <ITEM',
      '      POSITION 4',
      '      LENGTH 16',
      '      NAME gap',
      '    >',
    ].join('\n');
    const a = analyse(rpp(track('Drums', noSource)));
    expect(a.stems).toEqual([]);
    expect(a.warnings).toEqual([expect.stringMatching(/Drums.*'gap'.*no source file/)]);
  });

  it('reads only stem tracks and the full mix', () => {
    const a = analyse(
      rpp(
        track('snare', item(4, 16, 0, 'WAVE', 'Stems/bass.wav')),
        track('Bass', item(4, 16, 0, 'WAVE', 'Stems/bass.wav')),
        track('Guitar', item(4, 16, 0, 'MP3', 'Stems/guitar.mp3')),
        track('Track', item(4, 16, 0, 'WAVE', 'Stems/Song mix.wav')),
      ),
    );
    expect(a.stems.map((s) => s.name)).toEqual(['snare', 'Track']);
    expect(a.warnings).toEqual([]);
  });

  it('resolves Windows separators relative to the project folder', () => {
    const a = analyse(rpp(track('KickBand', item(4, 16, 0, 'WAVE', 'Stems\\bass.wav'))));
    expect(a.stems).toHaveLength(1);
  });
});

describe('lights:song analyse', () => {
  it('runs from the command line against the project folder', () => {
    const file = join(dir, 'song.rpp');
    writeFileSync(file, rpp(track('Drums', item(4, 16, 1, 'WAVE', 'Stems/drums.wav'))));
    const out = run(['analyse', file, 'song'], (p) => readFileSync(p, 'utf8'));
    expect(out).toContain('Region: Song (8 bars)');
    expect(out).toContain('Drums 2.3');
    expect(() => run(['analyse'])).toThrow(/Usage/);
  });
});
