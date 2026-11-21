// Claude Code PreToolUse hook for Bash. Runs `npm run check` before any
// `git commit` and blocks the commit (exit 2) when it fails.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
const command = input.tool_input?.command ?? '';
if (!/\bgit\s+(?:-\S+\s+)*commit\b/.test(command)) process.exit(0);

const run = spawnSync('npm', ['run', 'check'], {
  cwd: input.cwd,
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
if (run.status === 0) process.exit(0);

const tail = `${run.stdout}${run.stderr}`.split('\n').slice(-60).join('\n');
console.error(`npm run check failed. Fix it, then commit again.\n${tail}`);
process.exit(2);
