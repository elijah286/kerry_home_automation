/**
 * Frees listeners on dev stack ports before `npm run dev` (npm `predev` hook).
 * Backend: PORT default 3000 (@ha/backend config), frontend: 3001, go2rtc: bin/go2rtc.yaml
 */
const { execSync } = require('child_process');

const PORTS = [3000, 3001, 1984, 8554, 8555];

function freePortUnix(port) {
  try {
    const out = execSync(`lsof -n -P -iTCP:${port} -sTCP:LISTEN -t`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    for (const line of out.trim().split('\n')) {
      const pid = parseInt(line, 10);
      if (Number.isFinite(pid)) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* no listener */
  }
}

function freePortWin32(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const pids = new Set();
    for (const line of out.split('\n')) {
      if (!/LISTENING/.test(line)) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[parts.length - 1], 10);
      if (Number.isFinite(pid)) pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* no listener or findstr miss */
  }
}

const freePort =
  process.platform === 'win32' ? freePortWin32 : freePortUnix;

for (const port of PORTS) {
  freePort(port);
}
