import { describe, expect, it } from 'vitest';
import { isBeamAngle, modeHasHaze, type Capability, type FixtureMode } from './fixture-profile';

const mode = (...capabilities: Capability[]): FixtureMode => ({
  name: 'm',
  channels: capabilities.map((capability, i) => ({
    kind: 'control',
    name: `C${i}`,
    defaultValue: 0,
    ranges: [{ from: 0, to: 255, capability }],
  })),
});

describe('modeHasHaze', () => {
  it('is true when a channel has a haze range', () => {
    expect(modeHasHaze(mode({ type: 'fan' }, { type: 'haze' }))).toBe(true);
  });

  it('is false with only a fan, other capabilities, or an unused slot', () => {
    expect(modeHasHaze(mode({ type: 'fan' }, { type: 'intensity' }))).toBe(false);
    expect(modeHasHaze({ name: 'm', channels: [{ kind: 'unused' }] })).toBe(false);
  });
});

describe('isBeamAngle', () => {
  it('accepts more than 0 up to 180', () => {
    expect(isBeamAngle(0.05)).toBe(true);
    expect(isBeamAngle(180)).toBe(true);
  });

  it('refuses 0, above 180, NaN, Infinity and non-numbers', () => {
    expect(isBeamAngle(0)).toBe(false);
    expect(isBeamAngle(180.1)).toBe(false);
    expect(isBeamAngle(NaN)).toBe(false);
    expect(isBeamAngle(Infinity)).toBe(false);
    expect(isBeamAngle('30')).toBe(false);
    expect(isBeamAngle(undefined)).toBe(false);
  });
});
