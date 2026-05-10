#!/usr/bin/env node
/**
 * Standardize API routes to use formatSuccess/formatError.
 * Conservative approach - only handles specific safe patterns.
 */

import fs from 'fs';
import path from 'path';

const ROUTES_DIR = 'src/app/api';

const ALREADY_UPDATED = new Set([
  'src/app/api/invoices/route.ts',
  'src/app/api/payments/route.ts',
  'src/app/api/rooms/route.ts',
  'src/app/api/tenants/route.ts',
  'src/app/api/contracts/route.ts',
  'src/app/api/maintenance/route.ts',
  'src/app/api/documents/route.ts',
  'src/app/api/conversations/route.ts',
  'src/app/api/deliveries/route.ts',
  'src/app/api/invoices/[id]/route.ts',
  'src/app/api/payments/[id]/route.ts',
  'src/app/api/rooms/[id]/route.ts',
  'src/app/api/contracts/[id]/route.ts',
  'src/app/api/tenants/[id]/route.ts',
  'src/app/api/admin/dashboard-alerts/route.ts',
  'src/app/api/admin/jobs/route.ts',
  'src/app/api/auth/login/route.ts',
  'src/app/api/auth/logout/route.ts',
  'src/app/api/auth/me/route.ts',
]);

function getAllRoutes(dir, basePath = '') {
  let routes = [];
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      const newBasePath = basePath ? `${basePath}/${file}` : file;
      routes = routes.concat(getAllRoutes(fullPath, newBasePath));
    } else if (file === 'route.ts') {
      const relPath = basePath ? `${basePath}/route.ts` : 'route.ts';
      routes.push(relPath);
    }
  }

  return routes;
}

function hasFormatSuccess(content) {
  return content.includes('formatSuccess') || content.includes('formatError');
}

function updateRoute(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const original = content;

    // Skip if already updated
    if (hasFormatSuccess(content)) {
      return { status: 'skipped', reason: 'already_updated' };
    }

    // Only update routes with the explicit pattern
    const hasPattern = /NextResponse\.json\s*\(\s*\{\s*success:\s*true,\s*data:\s*[^}]+\}\s*as\s*ApiResponse/.test(content);
    if (!hasPattern) {
      return { status: 'skipped', reason: 'no_patterns_matched' };
    }

    // Add the import only if needed
    const lines = content.split('\n');
    const hasImport = lines.some(l => l.includes("from '@/lib/api-response'"));

    if (!hasImport) {
      let lastImportIdx = -1;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].startsWith('import ') && lines[i].includes(' from ')) {
          lastImportIdx = i;
          break;
        }
      }

      if (lastImportIdx >= 0) {
        lines.splice(lastImportIdx + 1, 0, "import { formatSuccess, formatError } from '@/lib/api-response';");
        content = lines.join('\n');
      } else {
        return { status: 'skipped', reason: 'no_import_location' };
      }
    }

    // Single careful replacement
    let matched = false;
    content = content.replace(
      /NextResponse\.json\s*\(\s*\{\s*success:\s*true,\s*data:\s*([^}]+?)\s*\}\s*as\s*ApiResponse[^)]*\)/g,
      (match, data) => {
        matched = true;
        const cleanData = data.trim().replace(/,\s*$/, '');
        return `NextResponse.json(formatSuccess(${cleanData}))`;
      }
    );

    if (!matched) {
      return { status: 'skipped', reason: 'replacement_failed' };
    }

    // CAREFUL: Only remove ApiResponse from the specific import, not from elsewhere
    // Pattern: import { ..., type ApiResponse } from '@/lib/utils/errors';
    // or: import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
    content = content.replace(
      /import\s*\(\s*([^)]*),\s*type\s+ApiResponse\s*\)\s*from\s+['"]@\/lib\/utils\/errors['"]/,
      'import { $1 } from \'@/lib/utils/errors\''
    );

    content = content.replace(
      /import\s*\(\s*type\s+ApiResponse\s*,\s*([^)]+?)\s*\)\s*from\s+['"]@\/lib\/utils\/errors['"]/,
      'import { $1 } from \'@/lib/utils/errors\''
    );

    fs.writeFileSync(filePath, content, 'utf-8');
    return { status: 'updated' };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

function main() {
  const routes = getAllRoutes(ROUTES_DIR).map(r => `${ROUTES_DIR}/${r}`).sort();
  const stats = { updated: 0, skipped: 0, errors: 0 };

  console.log(`Processing ${routes.length} routes...\n`);

  for (const relPath of routes) {
    const normalizedPath = relPath.replace(/\\/g, '/');

    if (ALREADY_UPDATED.has(normalizedPath)) {
      console.log(`[SKIP] (manual) ${normalizedPath}`);
      stats.skipped++;
      continue;
    }

    const result = updateRoute(relPath);

    if (result.status === 'updated') {
      console.log(`[UPDATED] ${normalizedPath}`);
      stats.updated++;
    } else if (result.status === 'skipped') {
      console.log(`[SKIP] (${result.reason}) ${normalizedPath}`);
      stats.skipped++;
    } else {
      console.log(`[ERROR] ${normalizedPath}: ${result.error}`);
      stats.errors++;
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Updated: ${stats.updated}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Errors: ${stats.errors}`);
  console.log(`Total processed: ${Object.values(stats).reduce((a, b) => a + b, 0)}`);
}

main();
