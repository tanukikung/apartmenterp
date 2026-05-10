#!/usr/bin/env node
/**
 * Standardize all API routes to use formatSuccess/formatError.
 * Safe approach handling complex patterns.
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

function needsImport(content) {
  return !content.includes("from '@/lib/api-response'") && !content.includes('from "@/lib/api-response"');
}

function addImport(content) {
  if (!needsImport(content)) return content;

  const lines = content.split('\n');
  let lastImportIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('import ') && lines[i].endsWith(';')) {
      lastImportIdx = i;
    }
  }

  if (lastImportIdx >= 0) {
    lines.splice(lastImportIdx + 1, 0, "import { formatSuccess, formatError } from '@/lib/api-response';");
    return lines.join('\n');
  }

  return content;
}

function updateRoute(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');

    // Skip if already updated
    if (hasFormatSuccess(content)) {
      return { status: 'skipped', reason: 'already_updated' };
    }

    // Add import if needed
    if (content.includes('NextResponse.json') && !hasFormatSuccess(content)) {
      content = addImport(content);
    }

    // Pattern: NextResponse.json({ success: true, data: X } as ApiResponse)
    const pattern = /NextResponse\.json\s*\(\s*\{\s*success:\s*true,\s*data:\s*([^}]+?)\s*\}\s*as\s*ApiResponse[^)]*\)/g;
    let matched = false;

    content = content.replace(pattern, (match, data) => {
      matched = true;
      const cleanData = data.trim().replace(/,\s*$/, '');
      return `NextResponse.json(formatSuccess(${cleanData}))`;
    });

    if (matched) {
      // Remove old ApiResponse imports
      content = content.replace(/,\s*ApiResponse[^;\n]*/g, '');
      content = content.replace(/,\s*type\s*ApiResponse[^;\n]*/g, '');

      fs.writeFileSync(filePath, content, 'utf-8');
      return { status: 'updated' };
    }

    return { status: 'skipped', reason: 'no_patterns_matched' };
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
  console.log(`Total: ${Object.values(stats).reduce((a, b) => a + b, 0)}`);
}

main();
