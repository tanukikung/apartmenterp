// Fix-guard-calls.js
//
// Walks src/app/api/**/*.ts and replaces sync guard calls with their async counterparts:
//   requireRole(       → await requireRole(
//   requireOperator(   → await requireOperator(
//   requireOwner(      → await requireOwner(
//   requireOwnerOrAdmin( → await requireOwnerOrAdmin(
//   getVerifiedActor(  → await getVerifiedActor(
//
// Only replaces in .ts files inside src/app/api/.
// Logs each file that was changed.

const fs = require('fs');
const path = require('path');

const API_DIR = path.join(__dirname, '..', 'src', 'app', 'api');

const GUARDS = [
  { from: /requireRole\(/g,          to: 'await requireRole(' },
  { from: /requireOperator\(/g,      to: 'await requireOperator(' },
  { from: /requireOwner\(/g,         to: 'await requireOwner(' },
  { from: /requireOwnerOrAdmin\(/g, to: 'await requireOwnerOrAdmin(' },
  { from: /getVerifiedActor\(/g,    to: 'await getVerifiedActor(' },
];

/**
 * Recursively collect all .ts file paths under `dir`.
 */
function collectTsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

function processFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  let content = original;
  let changed = false;

  for (const guard of GUARDS) {
    if (guard.from.test(content)) {
      content = content.replace(guard.from, guard.to);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    const rel = path.relative(path.join(__dirname, '..'), filePath);
    console.log(`Modified: ${rel}`);
  }
}

const files = collectTsFiles(API_DIR);
console.log(`Found ${files.length} .ts files in src/app/api/\n`);

let modifiedCount = 0;
for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  let content = original;
  let changed = false;

  for (const guard of GUARDS) {
    if (guard.from.test(content)) {
      content = content.replace(guard.from, guard.to);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    const rel = path.relative(path.join(__dirname, '..'), file);
    console.log(`Modified: ${rel}`);
    modifiedCount++;
  }
}

console.log(`\nDone. ${modifiedCount} file(s) modified out of ${files.length} scanned.`);
