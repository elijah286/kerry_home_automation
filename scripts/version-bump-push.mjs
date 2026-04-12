#!/usr/bin/env node
/**
 * Git pre-push: increment B (minor), reset C (patch) to 0.
 * Major (A) is never changed — edit packages/frontend/src/lib/app-version.json manually.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const VERSION_PATH = path.join(REPO_ROOT, 'packages/frontend/src/lib/app-version.json');

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

const v = readVersion();
if (typeof v.major !== 'number' || typeof v.minor !== 'number' || typeof v.patch !== 'number') {
  console.error('[version-bump-push] invalid app-version.json shape');
  process.exit(1);
}

v.minor += 1;
v.patch = 0;
writeVersion(v);
