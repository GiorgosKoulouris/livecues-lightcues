// Generates a Show and its Cue Sheet from a brief, with tools/shows/make-shows/generate.ts.
// Usage: npm run show:generate -- <brief.yaml> [--out <folder>] [--venue <file.lcvenue>]
// Writes beside the brief unless --out is given. Prints the Venue Check against the
// brief's venue, or --venue.
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

// Vite's module runner loads the TypeScript and the app modules it imports.
const { module: generate } = await runnerImport(
  fileURLToPath(new URL('./make-shows/generate.ts', import.meta.url)),
  { configFile: false, logLevel: 'warn' },
);
try {
  for (const line of generate.run(process.argv.slice(2))) console.log(line);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
