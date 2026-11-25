import { describe, expect, it } from 'vitest';
import { loadShowFile } from '../../../src/engine/show-file';
import { sampleFiles } from './sample-fixture';
import { keyShots, parseShotArgs, shotFile } from './shots';

const sample = loadShowFile(sampleFiles.show);

describe('parseShotArgs', () => {
  it('reads the show, the venue and --out', () => {
    expect(parseShotArgs(['a.lcshow', 'v.lcvenue', '--out', 'shots'])).toEqual({
      show: 'a.lcshow',
      venue: 'v.lcvenue',
      out: 'shots',
    });
  });

  it('refuses a missing venue or --out', () => {
    expect(() => parseShotArgs(['a.lcshow', '--out', 'x'])).toThrow(/Usage/);
    expect(() => parseShotArgs(['a.lcshow', 'v.lcvenue'])).toThrow(/Usage/);
  });
});

describe('keyShots', () => {
  const shots = keyShots(sample);
  const find = (name: string) => shots.find((s) => s.name === name);

  it('lists Base, a Look per tier, Silhouette and the two combos, in order', () => {
    expect(shots.map((s) => s.name)).toEqual([
      'base',
      'chill-look',
      'groove-look',
      'drive-look',
      'peak-look',
      'silhouette',
      'chorus-combo',
      'peak-combo',
    ]);
  });

  it('uses the Show Base Look', () => {
    expect(find('base')?.scenes).toEqual(['Base']);
  });

  it('picks one Look per tier, and Silhouette', () => {
    expect(
      ['chill-look', 'groove-look', 'drive-look', 'peak-look', 'silhouette'].map(
        (name) => find(name)?.scenes,
      ),
    ).toEqual([
      ['Chill: Glow'],
      ['Groove: Steady'],
      ['Drive: Wide'],
      ['Peak: Everything'],
      ['Silhouette'],
    ]);
  });

  it('builds the chorus combo from Drive Scenes within the cap of 3 dynamic Layers', () => {
    expect(find('chorus-combo')?.scenes).toEqual([
      'Drive: Chorus',
      'Drive: Fan',
      'Drive: Beat Pulse',
      'Drive: Back Step',
    ]);
  });

  it('builds the peak combo within the cap of 4 dynamic Layers', () => {
    expect(find('peak-combo')?.scenes).toEqual([
      'Peak: Everything',
      'Peak: Wide Fan',
      'Peak: Beat Pulse',
      'Peak: Colour Step',
    ]);
  });

  it('skips a shot the Show cannot make', () => {
    const bare = { ...sample, scenes: sample.scenes.filter((s) => !s.name.startsWith('Peak')) };
    expect(keyShots(bare).map((s) => s.name)).not.toContain('peak-look');
    expect(keyShots(bare).map((s) => s.name)).not.toContain('peak-combo');
  });
});

describe('shotFile', () => {
  it('numbers the shot so a folder sorts in order', () => {
    expect(shotFile(2, 'chill-look')).toBe('03-chill-look.png');
  });
});
