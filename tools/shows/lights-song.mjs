// Reaper Lights: turns one song of a Reaper project into MIDI that drives a Show.
// Usage: npm run lights:song -- inspect <project.rpp> <region>
//        npm run lights:song -- analyse <project.rpp> <region>
//        npm run lights:song -- generate <project.rpp> <region> --show <file.lcshow> --sections <file> [--force]
//        npm run lights:song -- render <project.rpp> <plan.lights.yaml>
//        npm run lights:song -- write <project.rpp> <plan.lights.yaml> [--force] [--allow-stack]
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

// Vite's module runner loads the TypeScript under tools/shows/reaper-lights.
const { module } = await runnerImport(
  fileURLToPath(new URL('./reaper-lights/cli.ts', import.meta.url)),
  { configFile: false, logLevel: 'warn' },
);
try {
  console.log(module.run(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
