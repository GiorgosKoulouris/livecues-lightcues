// Writes a built Show and its Cue Sheet, and prints the Venue Check against a
// Venue Patch when one is given. Shared by `npm run show:palette` and
// `npm run show:energy`.
//
// Usage: npm run show:<name> [-- --out <folder>] [--venue <file.lcvenue>]
// The folder defaults to tools/shows/. With no --venue in an interactive terminal,
// the script asks for one; Enter skips the check.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadVenueFile } from '../../../src/engine/venue-file';
import { loadShowFile } from '../../../src/engine/show-file';
import { ruleTargets, type Show } from '../../../src/shared/show';
import {
  approximatedAims,
  approximatedStrobes,
  fixtureUnsupportedGoboPrisms,
  hazePresetsWithoutHazers,
  unsetHousePresets,
} from '../../../src/shared/venue-check';
import type { VenuePatch } from '../../../src/shared/venue-patch';

export const SHOWS_FOLDER = 'tools/shows';

export interface ShowFiles {
  show: string;
  cueSheet: string;
}

export interface WriteOptions {
  out: string;
  venue?: string;
}

/** Reads `--out` and `--venue`. Paths stay as given; the caller resolves them. */
export function parseWriteArgs(argv: string[]): WriteOptions {
  const { values } = parseArgs({
    args: argv,
    options: { out: { type: 'string' }, venue: { type: 'string' } },
    strict: true,
    allowPositionals: false,
  });
  return { out: values.out ?? SHOWS_FOLDER, venue: values.venue || undefined };
}

/** The Show file and Cue Sheet paths for a Show named `name` in `folder`. */
export function showPaths(folder: string, name: string): { show: string; cueSheet: string } {
  return { show: join(folder, `${name}.lcshow`), cueSheet: join(folder, `${name} cue sheet.md`) };
}

/** Writes the Show and its Cue Sheet to `folder` and returns their paths. */
export function writeShowFiles(folder: string, name: string, files: ShowFiles): [string, string] {
  const paths = showPaths(folder, name);
  mkdirSync(folder, { recursive: true });
  writeFileSync(paths.show, files.show);
  writeFileSync(paths.cueSheet, files.cueSheet);
  return [paths.show, paths.cueSheet];
}

const scenes = (n: number) => `${n} Scene${n === 1 ? '' : 's'}`;

/** The Venue Check of a Show in a Venue Patch, one line per finding. Empty when nothing is missing or approximated. */
export function venueCheckLines(show: Show, patch: VenuePatch): string[] {
  const lines: string[] = [];
  for (const scene of show.scenes) {
    const missing = scene.rules.filter(
      (rule) => !patch.fixtures.some((f) => ruleTargets(patch, f, rule)),
    );
    if (missing.length > 0) {
      lines.push(
        `Scene "${scene.name}": ${missing.length} of ${scene.rules.length} Rules target no Fixture`,
      );
    }
  }
  for (const aim of approximatedAims(show, patch)) {
    lines.push(
      `Fixture ${aim.fixtureId}: aim ${aim.direction} approximated (${aim.approximations.join(', ')})`,
    );
  }
  for (const strobe of approximatedStrobes(show, patch)) {
    lines.push(
      `Fixture ${strobe.fixtureId}: strobe approximated (${strobe.approximation}) in ${scenes(strobe.scenes.length)}`,
    );
  }
  for (const fixture of patch.fixtures) {
    for (const item of fixtureUnsupportedGoboPrisms(show, patch, fixture)) {
      lines.push(
        `Fixture ${item.fixtureId}: no ${item.kind}, set in ${scenes(item.scenes.length)}`,
      );
    }
  }
  for (const preset of unsetHousePresets(show, patch)) {
    lines.push(`House Preset "${preset.name}": not set up in this venue`);
  }
  for (const preset of hazePresetsWithoutHazers(show, patch)) {
    lines.push(`Haze Preset "${preset.name}": no Hazer in this venue`);
  }
  return lines;
}

/** The Venue Check report for a written Show file and a Venue Patch file. */
export function venueCheckReport(showJson: string, venueJson: string, venueName: string): string {
  const lines = venueCheckLines(loadShowFile(showJson), loadVenueFile(venueJson));
  if (lines.length === 0) return `Venue Check in ${venueName}: nothing missing or approximated`;
  return [`Venue Check in ${venueName}:`, ...lines.map((l) => `  ${l}`)].join('\n');
}

/** Asks for a Venue Patch path in an interactive terminal. Undefined when skipped or not interactive. */
async function askVenue(): Promise<string | undefined> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return undefined;
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question('Venue Patch to check against (Enter to skip): ');
    // Pasted Windows paths often come quoted.
    return answer.trim().replace(/^"(.*)"$/, '$1') || undefined;
  } finally {
    rl.close();
  }
}

/** The command: writes the files, then prints the Venue Check if a venue is given or entered. */
export async function run(
  root: string,
  argv: string[],
  name: string,
  files: ShowFiles,
): Promise<void> {
  const options = parseWriteArgs(argv);
  const written = writeShowFiles(resolve(root, options.out), name, files);
  for (const path of written) console.log(`Wrote ${path}`);
  const venue = options.venue ?? (await askVenue());
  if (!venue) return;
  const venuePath = resolve(venue);
  console.log(venueCheckReport(files.show, readFileSync(venuePath, 'utf8'), venuePath));
}
