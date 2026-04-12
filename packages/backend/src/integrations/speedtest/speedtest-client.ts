// ---------------------------------------------------------------------------
// Speedtest CLI wrapper: runs Ookla Speedtest CLI and parses JSON output
// ---------------------------------------------------------------------------

import { execFile } from 'node:child_process';
import { logger } from '../../logger.js';

export interface SpeedtestResult {
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  server: string;
}

export class SpeedtestClient {
  private serverId: string | null;

  constructor(serverId?: string | null) {
    this.serverId = serverId ?? null;
  }

  runTest(): Promise<SpeedtestResult | null> {
    const args = ['--format=json'];
    if (this.serverId) {
      args.push(`--server-id=${this.serverId}`);
    }

    return new Promise((resolve) => {
      execFile('speedtest', args, { timeout: 120_000 }, (err, stdout, stderr) => {
        if (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            logger.error('Speedtest CLI not found — install via: https://www.speedtest.net/apps/cli');
          } else {
            logger.error({ err, stderr }, 'Speedtest CLI failed');
          }
          return resolve(null);
        }

        try {
          const data = JSON.parse(stdout);
          resolve({
            downloadMbps: (data.download.bandwidth * 8) / 1e6,
            uploadMbps: (data.upload.bandwidth * 8) / 1e6,
            pingMs: data.ping.latency,
            server: data.server.name,
          });
        } catch (parseErr) {
          logger.error({ err: parseErr, stdout }, 'Speedtest: failed to parse JSON output');
          resolve(null);
        }
      });
    });
  }
}
