#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Guard rail: no hard-coded colour in card components.
//
// Every card under `packages/frontend/src/components/cards/` must source colour
// from the token helpers (`token(...)` / `severityVar(...)`) or the `var(--...)`
// CSS variables. Raw hex, rgb(), rgba(), hsl(), named colours — all banned so
// theme switches "just work" without a React re-render.
//
// The "#fff" exception is allowed for the explicit white-on-accent text used
// in filled buttons (light-tile active, switch-tile on). If you find yourself
// adding more exceptions, stop and add a proper token instead.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CARDS_DIR = resolve(ROOT, 'packages/frontend/src/components/cards');

const ALLOW_WHITE_SENTINEL = /['"]#fff['"]/i;           // explicit allow for on-accent text
const BAD_HEX      = /#[0-9a-fA-F]{3,8}\b/;
const BAD_RGB      = /\brgba?\s*\(/;
const BAD_HSL      = /\bhsla?\s*\(/;
const NAMED_COLOURS = new Set([
  'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'cyan',
  'teal', 'magenta', 'lime', 'indigo', 'violet', 'brown', 'black', 'white',
  'gray', 'grey', 'silver', 'gold',
]);
const BAD_NAMED_COLOUR = new RegExp(
  `(?:background|backgroundColor|color|borderColor|fill|stroke)\\s*:\\s*['"](?:${[...NAMED_COLOURS].join('|')})['"]`,
  'i',
);

const offenders = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) { walk(full); continue; }
    if (!/\.tsx?$/.test(name)) continue;
    const src = readFileSync(full, 'utf8');
    src.split(/\r?\n/).forEach((line, i) => {
      // Strip line comments; keeps regex simple.
      const code = line.replace(/\/\/.*$/, '');
      if (!code.trim()) return;

      // Allowed literal whites — the only permitted hex in the file.
      const allowed = code.match(ALLOW_WHITE_SENTINEL);
      const stripped = allowed ? code.replace(ALLOW_WHITE_SENTINEL, '""') : code;

      if (BAD_HEX.test(stripped) || BAD_RGB.test(stripped) || BAD_HSL.test(stripped) || BAD_NAMED_COLOUR.test(stripped)) {
        offenders.push({ file: full.replace(ROOT + '/', ''), line: i + 1, text: line.trim() });
      }
    });
  }
}

walk(CARDS_DIR);

if (offenders.length) {
  console.error('\ncheck-card-tokens: FAIL — hard-coded colour in card component(s)\n');
  for (const o of offenders) {
    console.error(`  ${o.file}:${o.line}`);
    console.error(`    ${o.text}`);
  }
  console.error(`\n${offenders.length} violation(s). Use token('--color-...') or severityVar(level) instead.\n`);
  process.exit(1);
}

console.log('check-card-tokens: OK');
