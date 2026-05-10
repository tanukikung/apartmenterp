#!/usr/bin/env node
/**
 * Comprehensive route updater for all 219 API routes
 * Handles multiple response patterns safely
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = 'D:\\apartment_erp';
const ROUTES_DIR = path.join(PROJECT_ROOT, 'src', 'app', 'api');

// Routes that were already manually verified
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
    const original = content;

    // Skip if already updated
    if (content.includes('formatSuccess') || content.includes('formatError')) {
      return { success: false, reason: 'already_updated' };
    }

    let changed = false;

    // Pattern 1: { success: true, data: X } as ApiResponse
    // Single line or multi-line
    const pattern1 = /NextResponse\.json\s*\(\s*\{\s*success:\s*true,\s*data:\s*([^}]+?)\s*\}\s*as\s*ApiResponse[^)]*\)/g;
    const matches1 = [...content.matchAll(pattern1)];

    if (matches1.length > 0) {
      for (let i = matches1.length - 1; i >= 0; i--) {
        const match = matches1[i];
        const data = match[1].trim().replace(/,\s*$/, '');
        const replacement = `NextResponse.json(\n      formatSuccess(${data})\n    )`;
        content = content.slice(0, match.index) + replacement + content.slice(match.index + match[0].length);
      }
      changed = true;
    }

    // Pattern 2: { success: true, data: X, message: "..." } - handle multi-line
    const pattern2 = /NextResponse\.json\s*\(\s*\{\s*success:\s*true,\s*data:\s*([^,]+?),\s*message:\s*['"]([^'"]*)['"](.*?)\}\s*as\s*ApiResponse[^)]*\)/gs;
    const matches2 = [...content.matchAll(pattern2)];

    if (matches2.length > 0) {
      for (let i = matches2.length - 1; i >= 0; i--) {
        const match = matches2[i];
        const data = match[1].trim();
        const message = match[2];
        const replacement = `NextResponse.json(\n      formatSuccess(${data}, '${message}')\n    )`;
        content = content.slice(0, match.index) + replacement + content.slice(match.index + match[0].length);
      }
      changed = true;
    }

    // Pattern 3: { success: true, data } (shorthand)
    const pattern3 = /NextResponse\.json\s*\(\s*\{\s*success:\s*true,\s*data\s*\}\s*as\s*ApiResponse[^)]*\)/g;
    const matches3 = [...content.matchAll(pattern3)];

    if (matches3.length > 0) {
      for (let i = matches3.length - 1; i >= 0; i--) {
        const match = matches3[i];
        const replacement = `NextResponse.json(\n      formatSuccess(data)\n    )`;
        content = content.slice(0, match.index) + replacement + content.slice(match.index + match[0].length);
      }
      changed = true;
    }

    // Pattern 4: Just cast without NextResponse wrapper
    const pattern4 = /as\s+ApiResponse<[^>]*>/g;
    if (pattern4.test(content)) {
      // These need manual review
      return { success: false, reason: 'complex_pattern' };
    }

    if (changed) {
      // Ensure formatSuccess is imported
      if (!content.includes('formatSuccess') && !content.includes('formatError')) {
        // Find where to add import
        const lastImportMatch = content.match(/^import\s+[^;]+;\s*$/m);
        if (lastImportMatch) {
          const lastImportPos = content.lastIndexOf(lastImportMatch[0]) + lastImportMatch[0].length;
          content = content.slice(0, lastImportPos) +
                   "\nimport { formatSuccess, formatError } from '@/lib/api-response';" +
                   content.slice(lastImportPos);
        }
      }

      // Remove old ApiResponse type imports
      content = content.replace(/,\s*type\s*ApiResponse[^;\n]*/g, '');
      content = content.replace(/,\s*ApiResponse[^;\n]*(?=\s*from)/g, '');

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
  const stats = { updated: 0, skipped: 0, no_patterns: 0, complex: 0, errors: 0 };
  const updatedFiles = [];
  const complexFiles = [];

  console.log(`Processing ${allRoutes.length} routes...\n`);

  for (const routePath of allRoutes) {
    const relPath = routePath.replace(PROJECT_ROOT + '\\', '').replace(/\\/g, '/');

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
      console.log(`[SKIP] (already) ${relPath}`);
      stats.skipped++;
    } else if (result.reason === 'complex_pattern') {
      console.log(`[COMPLEX] ${relPath}`);
      stats.complex++;
      complexFiles.push(relPath);
    } else if (result.reason === 'error') {
      console.log(`[ERROR] ${relPath}: ${result.error}`);
      stats.errors++;
    } else {
      console.log(`[SKIP] (no match) ${relPath}`);
      stats.no_patterns++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Updated: ${stats.updated}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`No patterns: ${stats.no_patterns}`);
  console.log(`Complex (manual review): ${stats.complex}`);
  console.log(`Errors: ${stats.errors}`);
  console.log(`Total: ${Object.values(stats).reduce((a, b) => a + b, 0)}`);

  if (complexFiles.length > 0) {
    console.log('\nRoutes requiring manual review:');
    complexFiles.slice(0, 20).forEach(f => console.log(`  - ${f}`));
    if (complexFiles.length > 20) {
      console.log(`  ... and ${complexFiles.length - 20} more`);
    }
  }

  console.log(`\nCompleted: Updated ${stats.updated} routes`);
}

main();
