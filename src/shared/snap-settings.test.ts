import { describe, expect, it } from 'vitest';
import { engages, mergeSnap, sceneSnap, SNAP_REST } from './snap-settings';
import type { Rule, Scene } from './show';
import type { PatchedFixture, VenuePatch } from './venue-patch';

const fixture = {
  id: 'a',
  role: 'Wash',
  zone: { row: 'Midstage', column: 'Centre', level: 'Floor' },
} as unknown as PatchedFixture;
const patch = { fixtures: [fixture] } as VenuePatch;

function scene(...rules: Partial<Rule>[]): Scene {
  return { id: 's', rules } as unknown as Scene;
}

const all: Pick<Rule, 'target'> = { target: {} };
const other: Pick<Rule, 'target'> = { target: { roles: ['Strobe'] } };

describe('sceneSnap', () => {
  it('takes the last targeting Rule, per key', () => {
    const s = scene({ ...all, strobe: 'Slow' }, { ...all, strobe: 'Off' });
    expect(sceneSnap(patch, fixture, s).strobe).toBe('Off');
  });

  it('ignores a Rule that does not target the Fixture', () => {
    const s = scene({ ...all, strobe: 'Slow' }, { ...other, strobe: 'Off' });
    expect(sceneSnap(patch, fixture, s).strobe).toBe('Slow');
  });

  it('keeps keys independent', () => {
    const s = scene({ ...all, strobe: 'Slow' }, { ...all, prism: 'Off' });
    expect(sceneSnap(patch, fixture, s)).toEqual({ strobe: 'Slow', prism: 'Off' });
  });
});

describe('mergeSnap', () => {
  it('lets keys set in above win and keeps the rest', () => {
    expect(mergeSnap({ strobe: 'Slow', gobo: 'Open' }, { strobe: 'Off', prism: 'Off' })).toEqual({
      strobe: 'Off',
      prism: 'Off',
      gobo: 'Open',
    });
  });
});

describe('engages', () => {
  it('is false for unset and for each resting value', () => {
    expect(engages('strobe', undefined)).toBe(false);
    expect(engages('strobe', SNAP_REST.strobe)).toBe(false);
    expect(engages('prism', SNAP_REST.prism)).toBe(false);
    expect(engages('gobo', SNAP_REST.gobo)).toBe(false);
  });
  it('is true otherwise', () => {
    expect(engages('strobe', 'Slow')).toBe(true);
    expect(engages('gobo', 'Rotate slow')).toBe(true);
  });
});
