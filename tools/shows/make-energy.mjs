// Writes the Energy Show and its Cue Sheet from tools/shows/make-shows/energy.ts.
// Usage: npm run show:energy [-- --out <folder>] [--venue <file.lcvenue>]
// The folder defaults to tools/shows/. See tools/shows/make-shows/write.ts.
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

// Vite's module runner loads the TypeScript and the app modules it imports.
const load = (file) =>
  runnerImport(fileURLToPath(new URL(`./make-shows/${file}`, import.meta.url)), {
    configFile: false,
    logLevel: 'warn',
  });
const [{ module: show }, { module: writer }] = await Promise.all([
  load('energy.ts'),
  load('write.ts'),
]);
const root = fileURLToPath(new URL('../..', import.meta.url));
try {
  await writer.run(root, process.argv.slice(2), show.SHOW_NAME, show.energyFiles());
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
