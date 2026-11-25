import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { run, UsageError } from './cli';

const raw = readFileSync(new URL('./fixtures/lantern.rpp', import.meta.url), 'utf8');
const read = () => raw;

describe('lights:song inspect', () => {
  const out = run(['inspect', 'x.rpp', 'lantern'], read);

  it('prints the span and length', () => {
    expect(out).toContain('Region: Lantern');
    expect(out).toContain('Span: 32.000s to 185.600s (2:33.600)');
    expect(out).toContain('Length: 96 bars');
  });

  it('prints the tempo and signature', () => {
    expect(out).toContain('  1.1  150 BPM');
    expect(out).toContain('  1.1  4/4');
  });

  it('prints the markers at song bars', () => {
    expect(out).toContain('Markers (15):');
    expect(out).toContain('  9.1     Verse1  (44.800s)');
    expect(out).toContain('  29.1    Chorus1');
    expect(out).toContain('  89.1    Outro');
  });

  it('fails on an unknown region or bad usage', () => {
    expect(() => run(['inspect', 'x.rpp', 'Nope'], read)).toThrow(/Regions: Opening, Lantern/);
    expect(() => run(['inspect'], read)).toThrow(UsageError);
  });
});
