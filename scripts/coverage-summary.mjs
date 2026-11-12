// Turns `coverage/coverage-summary.json` (npm run coverage) into a Markdown
// table for the Actions job summary, and a shields.io endpoint file for the
// README badge. Used by .github/workflows/coverage.yml.
//   node scripts/coverage-summary.mjs [summary.json] [badge.json]

import { readFileSync, writeFileSync } from 'node:fs';

const METRICS = [
  ['lines', 'Lines'],
  ['statements', 'Statements'],
  ['functions', 'Functions'],
  ['branches', 'Branches'],
];

// The table, one row per metric: percent and covered/total.
export function summaryTable(summary) {
  const rows = METRICS.map(([key, label]) => {
    const { pct, covered, total } = summary.total[key];
    return `| ${label} | ${pct}% | ${covered} / ${total} |`;
  });
  return ['| Metric | Covered | Count |', '| --- | --- | --- |', ...rows].join('\n');
}

// shields.io endpoint schema, for the line coverage.
export function badge(summary) {
  const pct = summary.total.lines.pct;
  const color = pct >= 90 ? 'brightgreen' : pct >= 80 ? 'green' : pct >= 70 ? 'yellow' : 'orange';
  return { schemaVersion: 1, label: 'coverage', message: `${pct}%`, color };
}

if (process.argv[1]?.endsWith('coverage-summary.mjs')) {
  const [input = 'coverage/coverage-summary.json', badgeFile] = process.argv.slice(2);
  const summary = JSON.parse(readFileSync(input, 'utf8'));
  console.log(summaryTable(summary));
  if (badgeFile) writeFileSync(badgeFile, JSON.stringify(badge(summary)) + '\n');
}
