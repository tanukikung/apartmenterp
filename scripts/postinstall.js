const { spawnSync } = require('child_process');

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npx, ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
});

if (result.status && result.status !== 0) {
  console.warn('[postinstall] prisma migrate deploy did not complete; continuing install.');
}
