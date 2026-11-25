// Scores a Show file against the aesthetic rubric, from tools/shows/make-shows/show-lint.ts.
// Usage: npm run show:lint -- <file.lcshow> [--strict] [--bpm <n>]
// Report-only. With --strict, exits 1 when item 4 or 11 scores 0.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

// Vite's module runner loads the TypeScript and the app modules it imports.
const { module: lint } = await runnerImport(
  fileURLToPath(new URL('./make-shows/show-lint.ts', import.meta.url)),
  { configFile: false, logLevel: 'warn' },
);
try {
  const { text, code } = lint.runLint(process.argv.slice(2), (path) => readFileSync(path, 'utf8'));
  console.log(text);
  process.exitCode = code;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
