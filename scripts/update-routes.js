#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = 'D:\\apartment_erp';
const ROUTES_DIR = path.join(PROJECT_ROOT, 'src', 'app', 'api');

// Already manually updated routes
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

function updateRoute(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');

    // Skip if already updated
    if (content.includes('formatSuccess') || content.includes('formatPaginatedSuccess')) {
      return { success: false, reason: 'already_updated' };
    }

    const original = content;
    let changed = false;

    // Pattern 1: NextResponse.json({ success: true, data: X } as ApiResponse...)
    const pattern1 = /return NextResponse\.json\(\s*{\s*success:\s*true,\s*data:\s*([^}]+?)\s*}\s*as\s*ApiResponse[^)]*\)/g;
    const matches1 = [...content.matchAll(pattern1)];

    if (matches1.length > 0) {
      // Process in reverse to maintain positions
      for (let i = matches1.length - 1; i >= 0; i--) {
        const match = matches1[i];
        const data = match[1].trim().replace(/,$/, '');
        const replacement = `return NextResponse.json(\n      formatSuccess(${data})\n    )`;
        content = content.slice(0, match.index) + replacement + content.slice(match.index + match[0].length);
      }
      changed = true;
    }

    // Pattern 2: NextResponse.json({ success: true, data: X, message: "..." } as ApiResponse...)
    const pattern2 = /return NextResponse\.json\(\s*{\s*success:\s*true,\s*data:\s*([^,]+?),\s*message:\s*['"]([^'"]*)['"](.*?)\}\s*as\s*ApiResponse[^)]*\)/g;
    const matches2 = [...content.matchAll(pattern2)];

    if (matches2.length > 0) {
      for (let i = matches2.length - 1; i >= 0; i--) {
        const match = matches2[i];
        const data = match[1].trim();
        const message = match[2];
        const replacement = `return NextResponse.json(\n      formatSuccess(${data}, '${message}')\n    )`;
        content = content.slice(0, match.index) + replacement + content.slice(match.index + match[0].length);
      }
      changed = true;
    }

    if (changed) {
      // Remove old ApiResponse imports
      content = content.replace(/,\s*ApiResponse\s*(?=from|,|;)/g, ' ');
      content = content.replace(/,\s*type\s*ApiResponse\s*(?=from|,|;)/g, ' ');

      // Add formatSuccess import if not present
      if (!content.includes("from '@/lib/api-response'")) {
        const lastImportMatch = content.match(/^import\s+[^;]+;\s*$/gm);
        if (lastImportMatch && lastImportMatch.length > 0) {
          const lastImport = lastImportMatch[lastImportMatch.length - 1];
          const lastImportPos = content.lastIndexOf(lastImport) + lastImport.length;
          content = content.slice(0, lastImportPos) +
                   "\nimport { formatSuccess, formatPaginatedSuccess } from '@/lib/api-response';" +
                   content.slice(lastImportPos);
        }
      }

      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true, reason: 'updated' };
    }

    return { success: false, reason: 'no_patterns' };
  } catch (error) {
    return { success: false, reason: 'error', error: error.message };
  }
}

function getAllRoutes(dir) {
  let routes = [];
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      routes = routes.concat(getAllRoutes(filePath));
    } else if (file === 'route.ts') {
      routes.push(filePath);
    }
  }

  return routes.sort();
}

function main() {
  const allRoutes = getAllRoutes(ROUTES_DIR);
  const stats = { updated: 0, skipped: 0, no_patterns: 0, errors: 0 };
  const updatedFiles = [];

  for (const routePath of allRoutes) {
    const relPath = path.relative(PROJECT_ROOT, routePath).replace(/\\/g, '/');

    if (ALREADY_UPDATED.has(relPath)) {
      console.log(`[SKIP] (manual) ${relPath}`);
      stats.skipped++;
      continue;
    }

    const result = updateRoute(routePath);

    if (result.success) {
      console.log(`[UPDATED] ${relPath}`);
      stats.updated++;
      updatedFiles.push(relPath);
    } else if (result.reason === 'already_updated') {
      console.log(`[SKIP] (already updated) ${relPath}`);
      stats.skipped++;
    } else if (result.reason === 'error') {
      console.log(`[ERROR] ${relPath}: ${result.error}`);
      stats.errors++;
    } else {
      console.log(`[SKIP] (no patterns) ${relPath}`);
      stats.no_patterns++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Updated: ${stats.updated}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`No patterns: ${stats.no_patterns}`);
  console.log(`Errors: ${stats.errors}`);
  console.log(`Total: ${Object.values(stats).reduce((a, b) => a + b, 0)}`);

  // Save list of updated files
  const outputPath = path.join(PROJECT_ROOT, 'scripts/updated.txt');
  fs.writeFileSync(outputPath, updatedFiles.join('\n'), 'utf-8');

  console.log(`\nCompleted: Updated ${stats.updated} routes`);
}

main();
