import { execFileSync } from 'node:child_process';

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
if (run('git', ['status', '--porcelain'])) throw Error('Commit all changes before deployment.');
const commit = run('git', ['rev-parse', 'HEAD']);
const checks = JSON.parse(run('gh', ['api', `repos/adam0white/commonstead/commits/${commit}/check-runs`]));
if (!checks.check_runs.some((c) => c.name === 'ci' && c.conclusion === 'success'))
  throw Error('Exact commit requires a green ci check.');
execFileSync('pnpm', ['install', '--frozen-lockfile'], { stdio: 'inherit' });
execFileSync('pnpm', ['run', 'build'], { stdio: 'inherit' });
execFileSync('pnpm', ['exec', 'wrangler', 'deploy'], { stdio: 'inherit' });
