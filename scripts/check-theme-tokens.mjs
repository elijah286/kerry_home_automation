#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Validate that every theme declares every required token.
//
// Parses `packages/shared/src/themes/tokens.ts` for the canonical token lists
// and `packages/frontend/src/lib/themes.ts` for each theme's declared tokens.
// Runs without a build step so CI can invoke it before `npm run build`.
// Exit 0 on success; exit 1 with a clear diff on missing tokens.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const SHARED_TOKENS = resolve(REPO_ROOT, 'packages/shared/src/themes/tokens.ts');
const THEMES_FILE  = resolve(REPO_ROOT, 'packages/frontend/src/lib/themes.ts');

const sharedSrc = readFileSync(SHARED_TOKENS, 'utf8');

function extractTokenList(blockName) {
  // Match: export const BLOCK_NAME ... = [ ... ]
  // We look for the named export and grab tokens until the matching ']'.
  const startRe = new RegExp('export const ' + blockName + '\\b');
  const startMatch = sharedSrc.match(startRe);
  if (!startMatch) return [];
  const start = startMatch.index + startMatch[0].length;
  const openBracket = sharedSrc.indexOf('[', start);
  const closeBracket = sharedSrc.indexOf(']', openBracket);
  if (openBracket === -1 || closeBracket === -1) return [];
  const body = sharedSrc.slice(openBracket, closeBracket);
  return [...body.matchAll(/'(--[a-z0-9-]+)'/g)].map(m => m[1]);
}

const SURFACE  = extractTokenList('SURFACE_TOKENS');
const TEXT     = extractTokenList('TEXT_TOKENS');
const BORDER   = extractTokenList('BORDER_TOKENS');
const ACCENT   = extractTokenList('ACCENT_TOKENS');
const SEVERITY = extractTokenList('SEVERITY_TOKENS');
const required = [...SURFACE, ...TEXT, ...BORDER, ...ACCENT, ...SEVERITY];

if (required.length === 0) {
  console.error('check-theme-tokens: could not extract token lists from shared/src/themes/tokens.ts');
  process.exit(2);
}

// -- Extract themes from frontend source ------------------------------------

const themesSrc = readFileSync(THEMES_FILE, 'utf8');
const themeEntries = [...themesSrc.matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]);

/**
 * Return the substring of the theme object literal that starts at `variables:`
 * and ends just before the next top-level theme entry (or end of file). Crude
 * but sufficient — we only look inside the returned block for `light: { ... }`
 * and `dark: { ... }` blobs.
 */
function variablesBlockForTheme(themeId) {
  const idMarker = `id: '${themeId}'`;
  const idIdx = themesSrc.indexOf(idMarker);
  if (idIdx === -1) return null;
  const nextIdMatch = themesSrc.slice(idIdx + idMarker.length).match(/id:\s*'[^']+'/);
  const blockEnd = nextIdMatch
    ? idIdx + idMarker.length + nextIdMatch.index
    : themesSrc.length;
  const varIdx = themesSrc.indexOf('variables:', idIdx);
  if (varIdx === -1 || varIdx >= blockEnd) return null;
  return themesSrc.slice(varIdx, blockEnd);
}

/** Extract the tokens declared under `light:` or `dark:` within a variables block. */
function tokensForMode(block, mode) {
  const marker = mode + ':';
  const modeIdx = block.indexOf(marker);
  if (modeIdx === -1) return null;
  // Walk braces to find the matching close for this mode's object.
  const openIdx = block.indexOf('{', modeIdx);
  if (openIdx === -1) return null;
  let depth = 0;
  let closeIdx = -1;
  for (let i = openIdx; i < block.length; i++) {
    const c = block[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { closeIdx = i; break; }
    }
  }
  if (closeIdx === -1) return null;
  const body = block.slice(openIdx, closeIdx);
  return new Set([...body.matchAll(/'(--[a-z0-9-]+)'/g)].map(m => m[1]));
}

const failures = [];

for (const id of themeEntries) {
  // `default` intentionally ships with `variables: {}` and relies on :root fallbacks.
  if (id === 'default') continue;

  const block = variablesBlockForTheme(id);
  if (!block) {
    failures.push({ id, mode: '(any)', missing: ['<could not locate variables block>'] });
    continue;
  }

  for (const mode of ['light', 'dark']) {
    const declared = tokensForMode(block, mode);
    if (!declared) {
      failures.push({ id, mode, missing: ['<mode block missing>'] });
      continue;
    }
    const missing = required.filter(t => !declared.has(t));
    if (missing.length) failures.push({ id, mode, missing });
  }
}

if (failures.length) {
  console.error('\ncheck-theme-tokens: FAIL\n');
  for (const f of failures) {
    console.error(`  theme=${f.id} mode=${f.mode} missing:`);
    for (const t of f.missing) console.error(`    - ${t}`);
  }
  console.error(`\n${failures.length} theme/mode combo(s) are missing required tokens.\n`);
  process.exit(1);
}

console.log(`check-theme-tokens: OK  (${themeEntries.length} themes, ${required.length} required tokens)`);
