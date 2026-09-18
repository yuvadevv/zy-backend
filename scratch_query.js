import { spawnSync } from 'child_process';
const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'blintzy-d1', '--command', 'SELECT * FROM roles', '--local'], { encoding: 'utf8' });
console.log(res.stdout);
console.log(res.stderr);
