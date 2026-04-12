#!/usr/bin/env node
/**
 * Cursor `stop` hook: increment C (patch) when an agent run finishes meaningfully.
 * Major (A) is never changed here — edit packages/frontend/src/lib/app-version.json manually.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const VERSION_PATH = path.join(REPO_ROOT, 'packages/frontend/src/lib/app-version.json');

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const s = Buffer.concat(chunks).toString('utf8').trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function readVersion() {
  const raw = fs.readFileSync(VERSION_PATH, 'utf8');
  return JSON.parse(raw);
}

function writeVersion(v) {
  const ordered = { major: v.major, minor: v.minor, patch: v.patch };
  const text = `${JSON.stringify(ordered, null, 2)}\n`;
  const tmp = `${VERSION_PATH}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, VERSION_PATH);
}

function bumpPatch() {
  const v = readVersion();
  if (typeof v.major !== 'number' || typeof v.minor !== 'number' || typeof v.patch !== 'number') {
    console.error('[version-bump-agent] invalid app-version.json shape');
    process.exit(1);
  }
  v.patch += 1;
  writeVersion(v);
}

async function main() {
  const force = process.argv.includes('--force');

  if (!force) {
    const input = await readStdinJson();
    if (!input || typeof input !== 'object') {
      process.stdout.write('{}\n');
      return;
    }
    const { status } = input;
    if (status === 'aborted') {
      process.stdout.write('{}\n');
      return;
    }
  }

  bumpPatch();
  process.stdout.write('{}\n');
}

main().catch((err) => {
  console.error('[version-bump-agent]', err);
  process.exit(1);
});
