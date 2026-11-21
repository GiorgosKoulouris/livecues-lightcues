import { describe, expect, it } from 'vitest';
import { suggestZone, type StageBounds } from './venue-patch';

// 12 m wide, 9 m deep: columns split at x = ±2, rows at y = 3 and 6.
const stage: StageBounds = { width: 12, depth: 9 };

describe('Zone suggestion', () => {
  it.each([
    { x: -4, y: 1, row: 'Downstage', column: 'Stage Right' },
    { x: 0, y: 1, row: 'Downstage', column: 'Centre' },
    { x: 4, y: 1, row: 'Downstage', column: 'Stage Left' },
    { x: -4, y: 4.5, row: 'Midstage', column: 'Stage Right' },
    { x: 0, y: 4.5, row: 'Midstage', column: 'Centre' },
    { x: 4, y: 4.5, row: 'Midstage', column: 'Stage Left' },
    { x: -4, y: 8, row: 'Upstage', column: 'Stage Right' },
    { x: 0, y: 8, row: 'Upstage', column: 'Centre' },
    { x: 4, y: 8, row: 'Upstage', column: 'Stage Left' },
  ])('puts ($x, $y) in $row $column', ({ x, y, row, column }) => {
    expect(suggestZone(stage, { x, y, height: 0 })).toEqual({ row, column, level: 'Floor' });
  });

  it.each([
    { x: -4, column: 'Stage Right' },
    { x: 0, column: 'Centre' },
    { x: 4, column: 'Stage Left' },
  ])('puts a Fixture in front of the stage at x = $x in the Front row', ({ x, column }) => {
    expect(suggestZone(stage, { x, y: -1.5, height: 0 })).toEqual({
      row: 'Front',
      column,
      level: 'Floor',
    });
  });

  it('suggests Overhead from 2 m up', () => {
    expect(suggestZone(stage, { x: 0, y: 1, height: 1.99 }).level).toBe('Floor');
    expect(suggestZone(stage, { x: 0, y: 1, height: 2 }).level).toBe('Overhead');
    expect(suggestZone(stage, { x: 0, y: -2, height: 6 })).toEqual({
      row: 'Front',
      column: 'Centre',
      level: 'Overhead',
    });
  });

  it('puts a Fixture on a boundary in the next cell upstage or toward Stage Left', () => {
    expect(suggestZone(stage, { x: 2, y: 3, height: 0 })).toEqual({
      row: 'Midstage',
      column: 'Stage Left',
      level: 'Floor',
    });
    expect(suggestZone(stage, { x: -2, y: 0, height: 0 })).toEqual({
      row: 'Downstage',
      column: 'Centre',
      level: 'Floor',
    });
  });

  it('puts a Fixture outside the stage in the nearest cell', () => {
    expect(suggestZone(stage, { x: -9, y: 12, height: 0 })).toEqual({
      row: 'Upstage',
      column: 'Stage Right',
      level: 'Floor',
    });
    expect(suggestZone(stage, { x: 9, y: -3, height: 0 })).toEqual({
      row: 'Front',
      column: 'Stage Left',
      level: 'Floor',
    });
  });

  it('puts a Fixture on a boundary of a decimal-sized stage in the next cell', () => {
    // Thirds at y = 4.1 and 8.2, and at x = ±1.05.
    const decimal = { width: 6.3, depth: 12.3 };

    expect(suggestZone(decimal, { x: -1.05, y: 4.1, height: 0 })).toEqual({
      row: 'Midstage',
      column: 'Centre',
      level: 'Floor',
    });
    expect(suggestZone(decimal, { x: 1.05, y: 8.2, height: 0 })).toEqual({
      row: 'Upstage',
      column: 'Stage Left',
      level: 'Floor',
    });
  });
});
