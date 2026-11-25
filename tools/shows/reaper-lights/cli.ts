// `npm run lights:song -- <subcommand> ...`: `inspect`, `analyse`, `generate`, `render` and `write`.
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { analyseRegion, formatAnalysis } from './analyse';
import { LightsError } from './errors';
import { generateLights } from './generate';
import { findRegion, readProject, type Region, type RppProject } from './rpp';
import { formatBarBeat, regionTimeline } from './timeline';
import { renderLights } from './render';
import { writeLights } from './writer';

export class UsageError extends LightsError {}

const USAGE = [
  'Usage: npm run lights:song -- inspect <project.rpp> <region>',
  '       npm run lights:song -- analyse <project.rpp> <region>',
  '       npm run lights:song -- generate <project.rpp> <region> --show <file.lcshow> --sections <file> [--force]',
  '       npm run lights:song -- render <project.rpp> <plan.lights.yaml>',
  '       npm run lights:song -- write <project.rpp> <plan.lights.yaml> [--force] [--allow-stack]',
].join('\n');

const clock = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  return `${m}:${(seconds - m * 60).toFixed(3).padStart(6, '0')}`;
};

/** Parses the project text and finds the region in it. */
function openRegion(raw: string, regionName: string): { project: RppProject; region: Region } {
  const project = readProject(raw);
  return { project, region: findRegion(project, regionName) };
}

/** The region span, length, tempo and signature changes, and markers at song bars. */
export function inspect(raw: string, regionName: string): string {
  const { project, region } = openRegion(raw, regionName);
  const timeline = regionTimeline(project, region);
  const at = (time: number) => formatBarBeat(timeline.barBeatAt(time));
  const bars = Number(timeline.lengthInBars.toFixed(2));
  const lines = [
    `Region: ${region.name}`,
    `Span: ${region.start.toFixed(3)}s to ${region.end.toFixed(3)}s (${clock(region.end - region.start)})`,
    `Length: ${bars} bars`,
  ];

  // Tempo at the region start, then each point inside it that changes tempo or shape.
  const before = project.tempoPoints.filter((p) => p.time <= region.start + 1e-9).at(-1);
  let bpm = before?.bpm ?? project.initial.bpm;
  let shape = before?.shape ?? 'square';
  const tempo = [`  ${at(region.start)}  ${bpm} BPM`];
  for (const p of project.tempoPoints) {
    if (p.time <= region.start + 1e-9 || p.time >= region.end) continue;
    if (p.bpm === bpm && p.shape === shape) continue;
    const ramp = shape === 'linear' ? ' (ramp from the previous point)' : '';
    tempo.push(`  ${at(p.time)}  ${p.bpm} BPM${ramp}`);
    bpm = p.bpm;
    shape = p.shape;
  }
  lines.push('Tempo:', ...tempo);

  lines.push('Signature:');
  const sigs = timeline.signatures;
  sigs.forEach((s, i) => {
    const prev = sigs[i - 1];
    if (prev && s.num === prev.num && s.den === prev.den) return;
    lines.push(`  ${s.bar}.1  ${s.num}/${s.den}`);
  });

  lines.push(`Markers (${timeline.markers.length}):`);
  for (const m of timeline.markers) {
    const pos = at(m.time).padEnd(7);
    lines.push(`  ${pos} ${m.name}  (${m.time.toFixed(3)}s)`);
  }
  return lines.join('\n');
}

/** `generate <project.rpp> <region> --show <file> --sections <file> [--force]`. */
function generate(file: string, args: string[]): string {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      options: {
        show: { type: 'string' },
        sections: { type: 'string' },
        force: { type: 'boolean' },
      },
      allowPositionals: true,
    });
  } catch {
    throw new UsageError(USAGE);
  }
  const { values, positionals } = parsed;
  const { show, sections, force = false } = values;
  if (positionals.length === 0 || !show || !sections) throw new UsageError(USAGE);
  const r = generateLights({ rpp: file, region: positionals.join(' '), show, sections, force });
  return [...r.warnings.map((w) => `Warning: ${w}`), ...r.notes, `Wrote: ${r.output}`].join('\n');
}

/** Runs the command line and returns what to print. */
export function run(
  argv: string[],
  read: (path: string) => string = (p) => readFileSync(p, 'utf8'),
): string {
  const [command, file, ...rest] = argv;
  if (command === 'inspect' && file && rest.length > 0) return inspect(read(file), rest.join(' '));
  if (command === 'generate' && file) return generate(file, rest);
  if (command === 'render' && file && rest.length === 1) {
    const warnings: string[] = [];
    const output = renderLights({
      rpp: file,
      plan: rest[0] as string,
      onWarning: (m) => warnings.push(`Warning: ${m}`),
    });
    return [...warnings, `Wrote: ${output}`].join('\n');
  }
  if (command === 'analyse' && file && rest.length > 0) {
    const { project, region } = openRegion(read(file), rest.join(' '));
    return formatAnalysis(analyseRegion(project, region, { dir: dirname(file) }));
  }
  if (command === 'write' && file) {
    const force = rest.includes('--force');
    const allowStack = rest.includes('--allow-stack');
    const [plan, ...extra] = rest.filter((a) => a !== '--force' && a !== '--allow-stack');
    if (!plan || extra.length > 0) throw new UsageError(USAGE);
    const r = writeLights({ rpp: file, plan, force, allowStack });
    return [
      ...r.warnings.map((w) => `Warning: ${w}`),
      `${r.replaced ? 'Replaced' : 'Inserted'} lights:${r.region} on MidiToLights (${r.notes} events).`,
      `Wrote: ${r.output}`,
      `Hash: ${r.hashFile}`,
    ].join('\n');
  }
  throw new UsageError(USAGE);
}
