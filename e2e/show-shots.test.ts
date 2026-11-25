import { expect, test } from '@playwright/test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FIXTURES, sampleFiles } from '../tools/shows/make-shows/sample-fixture';
import { writeShowFiles } from '../tools/shows/make-shows/write';
import { takeShots } from './show-shots';

test('the key Scenes of the sample Show render as lit PNGs', async () => {
  const out = mkdtempSync(join(tmpdir(), 'lightcues-shots-out-'));
  try {
    const [show] = writeShowFiles(out, 'sample', sampleFiles);
    const shots = await takeShots({
      show,
      venue: join(FIXTURES, 'sample-venue.lcvenue'),
      out,
    });
    expect(shots.map((s) => s.scenes[0])).toContain('Base');
    expect(shots).toHaveLength(8);
    for (const shot of shots) {
      expect(existsSync(shot.file)).toBe(true);
      expect(shot.lit, shot.file).toBeGreaterThan(0.001);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
