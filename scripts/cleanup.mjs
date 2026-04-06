import { execSync } from 'node:child_process';

const PORTS = [3000, 3001, 3002];

for (const port of PORTS) {
  try {
    const pids = execSync(`lsof -ti:${port}`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);

    if (pids.length) {
      console.log(`Killing process(es) on port ${port}: ${pids.join(', ')}`);
      execSync(`kill -9 ${pids.join(' ')}`);
    }
  } catch {
    // No process on this port — nothing to clean up
  }
}

console.log('Port cleanup complete — starting dev servers');
