#!/usr/bin/env node
/**
 * Targeted auto-fixer for lint errors that ESLint --fix cannot handle:
 *   - no-unused-vars: prefix with `_` (honours the argsIgnorePattern/varsIgnorePattern
 *     config in eslint.config.mjs) OR remove unused import specifiers.
 *   - no-explicit-any: replace `any` with `unknown` on the reported column.
 *   - no-require-imports: convert `require('x')` to dynamic `await import('x')` is
 *     too invasive — just logs for manual review.
 *
 * Reads lint-report.json produced by `npx next lint --format json -o lint-report.json`.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPORT_PATH = path.join(process.cwd(), 'lint-report.json');
const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));

let fixedAny = 0;
let fixedUnused = 0;
let removedImport = 0;
let manual = 0;

for (const file of report) {
  if (!file.messages.length) continue;
  let content = fs.readFileSync(file.filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  // Process messages from bottom up to keep offsets stable
  const msgs = [...file.messages].sort(
    (a, b) => b.line - a.line || b.column - a.column,
  );

  for (const m of msgs) {
    const idx = m.line - 1;
    if (idx < 0 || idx >= lines.length) continue;
    const line = lines[idx];

    if (m.ruleId === '@typescript-eslint/no-explicit-any') {
      // Replace the first `any` at/after column (1-based)
      const col = m.column - 1;
      const before = line.slice(0, col);
      const rest = line.slice(col);
      const replaced = rest.replace(/\bany\b/, 'unknown');
      if (replaced !== rest) {
        lines[idx] = before + replaced;
        fixedAny++;
      } else {
        manual++;
      }
      continue;
    }

    if (m.ruleId === '@typescript-eslint/no-unused-vars') {
      const match = m.message.match(/'([^']+)'/);
      if (!match) { manual++; continue; }
      const name = match[1];

      // Case 1: named import — remove the specifier
      const namedImportRe = new RegExp(
        `^(\\s*import\\s*(?:type\\s*)?\\{)([^}]*)\\}\\s*from\\s*['"][^'"]+['"];?\\s*$`,
      );
      if (namedImportRe.test(line)) {
        const parts = line.replace(namedImportRe, (_, head, body, tail) => {
          const items = body.split(',').map((s) => s.trim()).filter(Boolean);
          const kept = items.filter((s) => {
            // Handle `Foo as Bar` — only match against local binding
            const local = s.split(/\s+as\s+/).pop().trim();
            return local !== name;
          });
          if (kept.length === 0) return ''; // remove entire import line
          return `${head} ${kept.join(', ')} } from ${line.match(/from\s+(['"][^'"]+['"])/)[1]};`;
        });
        lines[idx] = parts;
        removedImport++;
        continue;
      }

      // Case 2: default import on its own line — remove line if default only
      const defaultImportRe = new RegExp(
        `^\\s*import\\s+${name}\\s+from\\s+['"][^'"]+['"];?\\s*$`,
      );
      if (defaultImportRe.test(line)) {
        lines[idx] = '';
        removedImport++;
        continue;
      }

      // Case 3: rename the declaration with underscore prefix (functions args,
      //   local `const`/`let` declarations).
      // Find the name AT the reported column (1-based) and prefix with `_`.
      const col = m.column - 1;
      const head = line.slice(0, col);
      const tail = line.slice(col);
      const nameRe = new RegExp(`^${escapeRe(name)}\\b`);
      if (nameRe.test(tail)) {
        lines[idx] = head + '_' + tail;
        fixedUnused++;
        continue;
      }

      manual++;
      continue;
    }

    manual++;
  }

  const updated = lines.join('\n');
  if (updated !== content) {
    fs.writeFileSync(file.filePath, updated, 'utf8');
  }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

console.log(`fixed any → unknown:       ${fixedAny}`);
console.log(`removed unused imports:    ${removedImport}`);
console.log(`prefixed unused with _:    ${fixedUnused}`);
console.log(`needs manual review:       ${manual}`);
