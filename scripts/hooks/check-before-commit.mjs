// Claude Code PreToolUse hook for Bash. Before any `git commit`, runs the
// steps of `npm run check`, then the Electron semgrep rules where semgrep is
// installed (the devcontainer). Blocks the commit (exit 2) at the first
// failing step and prints only that step's output.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
const command = input.tool_input?.command ?? '';
if (!/\bgit\s+(?:-\S+\s+)*commit\b/.test(command)) process.exit(0);

const run = (file, args) =>
  spawnSync(file, args, {
    cwd: input.cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

// Keep in step with the `check` script in package.json.
const steps = ['typecheck', 'lint', 'format:check', 'test'].map((script) => ({
  name: `npm run ${script}`,
  run: () => run('npm', ['run', '--silent', script]),
}));

if (run('semgrep', ['--version']).status === 0) {
  steps.push({
    name: 'semgrep (security/semgrep on src/main, src/preload)',
    run: () =>
      run('semgrep', [
        '--metrics=off',
        '--error',
        '--quiet',
        '--exclude=*.test.ts',
        '--config=security/semgrep',
        'src/main',
        'src/preload',
      ]),
  });
}

for (const step of steps) {
  const result = step.run();
  if (result.status === 0) continue;
  const tail = `${result.stdout}${result.stderr}`.trim().split('\n').slice(-60).join('\n');
  console.error(`${step.name} failed. Fix it, then commit again.\n${tail}`);
  process.exit(2);
}
