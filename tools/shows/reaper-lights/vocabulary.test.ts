import { describe, expect, it } from 'vitest';
import { matchMarker } from './vocabulary';

describe('matchMarker', () => {
  it('ignores case and trailing numbers', () => {
    expect(matchMarker('Verse1')).toBe('verse');
    expect(matchMarker('chorus2')).toBe('chorus');
    expect(matchMarker('Break 2')).toBe('break');
    expect(matchMarker('BUILD')).toBe('build');
    expect(matchMarker('endroll')).toBe('endroll');
  });

  it('tells a heavy breakdown from a quiet break', () => {
    expect(matchMarker('breakdown')).toBe('breakdown');
    expect(matchMarker('Breakdown2')).toBe('breakdown');
    expect(matchMarker('BREAKDOWN 3')).toBe('breakdown');
    expect(matchMarker('break')).toBe('break');
    expect(matchMarker('Break2')).toBe('break');
  });

  it('returns undefined for unknown labels', () => {
    expect(matchMarker('Pebbles')).toBeUndefined();
    expect(matchMarker('1')).toBeUndefined();
    expect(matchMarker('Verse1b')).toBeUndefined();
  });
});
