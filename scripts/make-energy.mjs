// Writes the Energy Show and its cue sheet from scripts/make-shows/energy.ts.
// Usage: npm run show:energy [-- <output folder>]. The folder defaults to
// temp/venue.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

// Vite's module runner loads the TypeScript and the app modules it imports.
const { module } = await runnerImport(
  fileURLToPath(new URL('./make-shows/energy.ts', import.meta.url)),
  { configFile: false, logLevel: 'warn' },
);
const root = fileURLToPath(new URL('..', import.meta.url));
const folder = resolve(root, process.argv[2] ?? 'temp/venue');
const { show, cueSheet } = module.energyFiles();
mkdirSync(folder, { recursive: true });
const showPath = join(folder, `${module.SHOW_NAME}.lcshow`);
const sheetPath = join(folder, `${module.SHOW_NAME} cue sheet.md`);
writeFileSync(showPath, show);
writeFileSync(sheetPath, cueSheet);
console.log(`Wrote ${showPath}\nWrote ${sheetPath}`);
