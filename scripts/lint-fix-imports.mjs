#!/usr/bin/env node
/**
 * Clean up the side-effect of scripts/lint-autofix.mjs on multi-line imports.
 * The original fixer prefixed unused identifiers with `_` — but when the identifier
 * was inside a multi-line import, that produced a dangling `_Foo` which doesn't
 * exist as an export. This script removes those dangling import specifiers.
 *
 * Heuristic: inside any `import { ... } from '...'` block (including multi-line),
 * drop any specifier whose local name starts with `_`. React hooks like `_useFoo`
 * get the same treatment — the original script shouldn't have touched them, so
 * removing is safe if the name really is unused in the file; we verify by grepping
 * the rest of the file for the un-prefixed name before removing.
 *
 * If the un-prefixed name IS referenced elsewhere in the file, we keep the
 * specifier and strip the leading `_`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const files = execSync(
  'git ls-files "src/**/*.ts" "src/**/*.tsx"',
  { cwd: root, encoding: 'utf8' },
).split(/\r?\n/).filter(Boolean);

let restored = 0;
let removed = 0;

for (const relPath of files) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) continue;
  const src = fs.readFileSync(abs, 'utf8');

  // Find each import block. Grab the block body between `{` and `}`.
  const importRe = /import\s+(?:type\s+)?(?:[\w$]+,\s*)?\{([^}]*)\}\s*from\s*(['"][^'"]+['"])/g;
  let changed = false;
  const newSrc = src.replace(importRe, (full, body, source) => {
    const items = body.split(',').map((s) => s.trim()).filter(Boolean);
    const keptItems = [];
    for (const it of items) {
      const asMatch = it.match(/^(.+?)\s+as\s+(.+)$/);
      const local = asMatch ? asMatch[2].trim() : it;
      if (!local.startsWith('_')) {
        keptItems.push(it);
        continue;
      }
      const plain = local.slice(1);
      // Check whether the un-prefixed name is used elsewhere in the file
      // (anywhere except inside this very import statement).
      const nameRe = new RegExp(`\\b${escapeRe(plain)}\\b`);
      const outside = src.replace(full, '');
      if (nameRe.test(outside)) {
        // Restore: strip the leading underscore
        if (asMatch) {
          keptItems.push(`${asMatch[1].trim()} as ${plain}`);
        } else {
          keptItems.push(plain);
        }
        restored++;
        changed = true;
      } else {
        // Drop it entirely
        removed++;
        changed = true;
      }
    }
    if (keptItems.length === 0) return '';
    // Preserve leading `import ` keyword and any default specifier
    const leading = full.match(/^import\s+(?:type\s+)?(?:([\w$]+),\s*)?\{/);
    const defaultSpec = leading && leading[1] ? `${leading[1]}, ` : '';
    const typePrefix = /^import\s+type\b/.test(full) ? 'type ' : '';
    return `import ${typePrefix}${defaultSpec}{ ${keptItems.join(', ')} } from ${source}`;
  });

  if (changed) {
    // Clean stray empty import lines
    const cleaned = newSrc.replace(/^\s*import\s+from\s+['"][^'"]+['"];?\s*$/gm, '');
    fs.writeFileSync(abs, cleaned, 'utf8');
  }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

console.log(`restored (name used elsewhere):  ${restored}`);
console.log(`removed (genuinely unused):      ${removed}`);
