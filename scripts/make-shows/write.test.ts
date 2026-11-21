import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadVenueFile } from '../../src/engine/venue-file';
import { energyFiles, energyShow } from './energy';
import { parseWriteArgs, venueCheckLines, venueCheckReport, writeShowFiles } from './write';

const demoVenue = readFileSync(new URL('../../examples/demo.lcvenue', import.meta.url), 'utf8');

describe('parseWriteArgs', () => {
  it('defaults to shows/ and no venue', () => {
    expect(parseWriteArgs([])).toEqual({ out: 'shows', venue: undefined });
  });

  it('reads --out and --venue', () => {
    expect(parseWriteArgs(['--out', 'x', '--venue', 'v.lcvenue'])).toEqual({
      out: 'x',
      venue: 'v.lcvenue',
    });
  });

  it('rejects a positional folder', () => {
    expect(() => parseWriteArgs(['temp/venue'])).toThrow();
  });
});

describe('writeShowFiles', () => {
  let folder: string | undefined;
  afterEach(() => folder && rmSync(folder, { recursive: true, force: true }));

  it('writes the Show and its Cue Sheet, creating the folder', () => {
    folder = mkdtempSync(join(tmpdir(), 'lightcues-shows-'));
    const out = join(folder, 'nested');
    const [show, sheet] = writeShowFiles(out, 'Test', { show: '{}', cueSheet: '# sheet' });
    expect([show, sheet]).toEqual([join(out, 'Test.lcshow'), join(out, 'Test cue sheet.md')]);
    expect(readFileSync(show, 'utf8')).toBe('{}');
    expect(readFileSync(sheet, 'utf8')).toBe('# sheet');
  });
});

describe('the Venue Check report', () => {
  it('lists every Scene as missing and every Haze Preset in a venue with no Fixtures or Hazers', () => {
    const empty = { ...loadVenueFile(demoVenue), fixtures: [], hazers: [] };
    const show = energyShow();
    const lines = venueCheckLines(show, empty);
    const withRules = show.scenes.filter((s) => s.rules.length > 0);
    expect(lines.filter((l) => l.startsWith('Scene '))).toHaveLength(withRules.length);
    expect(lines.filter((l) => l.startsWith('Haze Preset '))).toHaveLength(
      show.hazePresets?.length ?? 0,
    );
  });

  it('names the venue in its heading', () => {
    const report = venueCheckReport(energyFiles().show, demoVenue, 'demo.lcvenue');
    expect(report.split('\n')[0]).toMatch(/^Venue Check in demo\.lcvenue:/);
  });
});
