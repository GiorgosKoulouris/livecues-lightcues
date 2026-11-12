import { describe, expect, it } from 'vitest';
import { badge, summaryTable } from './coverage-summary.mjs';

const metric = (pct, covered, total) => ({ pct, covered, total, skipped: 0 });
const summary = {
  total: {
    lines: metric(85.5, 171, 200),
    statements: metric(84, 168, 200),
    functions: metric(70, 7, 10),
    branches: metric(60, 6, 10),
  },
};

describe('summaryTable', () => {
  it('has a row per metric', () => {
    const table = summaryTable(summary).split('\n');
    expect(table).toHaveLength(6);
    expect(table[2]).toBe('| Lines | 85.5% | 171 / 200 |');
    expect(table[5]).toBe('| Branches | 60% | 6 / 10 |');
  });
});

describe('badge', () => {
  it('reports line coverage', () => {
    expect(badge(summary)).toEqual({
      schemaVersion: 1,
      label: 'coverage',
      message: '85.5%',
      color: 'green',
    });
  });

  it.each([
    [95, 'brightgreen'],
    [80, 'green'],
    [70, 'yellow'],
    [69.9, 'orange'],
  ])('colours %s%% as %s', (pct, color) => {
    expect(badge({ total: { lines: metric(pct, 0, 0) } }).color).toBe(color);
  });
});
