// Renders a Show's key Scenes in the Visualiser, with e2e/show-shots.ts.
// Usage: npm run show:shots -- <show.lcshow> <venue.lcvenue> --out <folder>
// Needs the built app (`npm run build`, which the npm script runs). On Linux
// without a display it re-runs itself under xvfb-run.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

if (process.platform === 'linux' && !process.env['DISPLAY']) {
  const run = spawnSync(
    'xvfb-run',
    ['-a', process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit' },
  );
  process.exit(run.status ?? 1);
}

const root = (path) => fileURLToPath(new URL(path, import.meta.url));
try {
  const { module: args } = await runnerImport(root('./make-shows/shots.ts'), {
    configFile: false,
    logLevel: 'warn',
  });
  const parsed = args.parseShotArgs(process.argv.slice(2));
  const { module: shots } = await runnerImport(root('../../e2e/show-shots.ts'), {
    configFile: false,
    logLevel: 'warn',
  });
  for (const shot of await shots.takeShots(parsed)) {
    const warn = shot.lit < 0.001 ? '  BLANK' : '';
    console.log(
      `${shot.file}  ${shot.scenes.join(' + ')}  lit ${(shot.lit * 100).toFixed(1)}%${warn}`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
