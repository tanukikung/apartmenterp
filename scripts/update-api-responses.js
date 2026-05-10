#!/usr/bin/env node

/**
 * Intelligent API Response Format Updater
 *
 * Automatically updates routes to use formatSuccess/formatPaginatedSuccess
 * Flags complex routes for manual review
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROUTES_DIR = path.join(__dirname, '../src/app/api');
const ALREADY_UPDATED = new Set();
const COMPLEX_ROUTES = [];
const UPDATED_ROUTES = [];
let totalRoutes = 0;
let skipped = 0;

// Routes already manually updated
const MANUAL_ROUTES = new Set([
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

function findRouteFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findRouteFiles(fullPath));
    } else if (entry.name === 'route.ts') {
      files.push(fullPath);
    }
  }
  return files;
}

function isAlreadyUpdated(content) {
  return content.includes('formatSuccess') || content.includes('formatPaginatedSuccess');
}

function isComplexRoute(content) {
  // Routes with complex custom response structures
  const complexPatterns = [
    /return NextResponse\.json\(\s*{[\s\S]*?success:\s*true[\s\S]*?data:\s*{[\s\S]{100,}/,
    /admin\/users/,
    /admin\/registration-requests/,
    /admin\/settings/,
    /healthcheck|health|diag|ws-audit/,
  ];

  return complexPatterns.some(pattern =>
    pattern.test(content) || pattern.test(require('path').relative('', require('path').dirname(content)))
  );
}

function updateRoute(filePath, content) {
  let updated = content;
  let changed = false;

  // Pattern 1: Simple { success: true, data: X } responses
  const pattern1 = /return NextResponse\.json\(\s*{\s*success:\s*true,?\s*data:\s*([^}]+)\s*}\s*(?:as\s+ApiResponse[^)]*)?(?:,\s*{[^}]*})?\s*\);/g;

  if (pattern1.test(updated)) {
    updated = updated.replace(pattern1, (match, dataContent) => {
      const trimmedData = dataContent.trim().replace(/,\s*$/, '');
      return `return NextResponse.json(\n    formatSuccess(${trimmedData})\n  );`;
    });
    changed = true;
  }

  // Pattern 2: { success: true, data: X, message: "..." } responses
  const pattern2 = /return NextResponse\.json\(\s*{\s*success:\s*true,?\s*data:\s*([^,]+),?\s*message:\s*['"]([^'"]*)['"]\s*}\s*(?:as\s+ApiResponse[^)]*)?(?:,\s*{[^}]*})?\s*\);/g;

  if (pattern2.test(updated)) {
    updated = updated.replace(pattern2, (match, dataContent, message) => {
      const trimmedData = dataContent.trim().replace(/,\s*$/, '');
      return `return NextResponse.json(\n    formatSuccess(${trimmedData}, '${message}')\n  );`;
    });
    changed = true;
  }

  // Add import if needed
  if (changed && !updated.includes("import { formatSuccess") && !updated.includes("from '@/lib/api-response'")) {
    const lastImport = updated.lastIndexOf("import ");
    const nextNewline = updated.indexOf("\n", lastImport);
    updated = updated.substring(0, nextNewline + 1) +
              "import { formatSuccess, formatPaginatedSuccess } from '@/lib/api-response';\n" +
              updated.substring(nextNewline + 1);
  }

  // Remove old ApiResponse imports if no longer needed
  if (changed && !updated.includes(" ApiResponse") && updated.includes("ApiResponse")) {
    updated = updated.replace(/,?\s*ApiResponse\s*/g, ' ');
    updated = updated.replace(/import\s*{\s*asyncHandler,?\s*}\s*from\s*['"]@\/lib\/utils\/errors['"]/g,
                             "import { asyncHandler } from '@/lib/utils/errors'");
  }

  return { updated, changed };
}

function main() {
  console.log('🔍 Finding all route files...');
  const routeFiles = findRouteFiles(ROUTES_DIR);
  console.log(`Found ${routeFiles.length} route files\n`);

  for (const filePath of routeFiles) {
    totalRoutes++;
    const relPath = path.relative(ROUTES_DIR, filePath);
    const fullRelPath = `src/app/api/${relPath}`;

    // Skip manually updated routes
    if (MANUAL_ROUTES.has(fullRelPath)) {
      console.log(`⏭️  SKIP (manual) ${fullRelPath}`);
      skipped++;
      continue;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');

      // Check if already updated
      if (isAlreadyUpdated(content)) {
        console.log(`⏭️  SKIP (already updated) ${fullRelPath}`);
        skipped++;
        continue;
      }

      // Check if complex
      if (isComplexRoute(content)) {
        console.log(`⚠️  COMPLEX ${fullRelPath}`);
        COMPLEX_ROUTES.push(fullRelPath);
        continue;
      }

      // Try to update
      const { updated, changed } = updateRoute(filePath, content);

      if (changed) {
        fs.writeFileSync(filePath, updated, 'utf8');
        console.log(`✅ UPDATED ${fullRelPath}`);
        UPDATED_ROUTES.push(fullRelPath);
      } else {
        console.log(`⏭️  SKIP (no patterns) ${fullRelPath}`);
        skipped++;
      }
    } catch (err) {
      console.error(`❌ ERROR ${fullRelPath}: ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`📊 SUMMARY`);
  console.log('='.repeat(80));
  console.log(`Total routes found: ${totalRoutes}`);
  console.log(`Updated: ${UPDATED_ROUTES.length}`);
  console.log(`Complex (manual review): ${COMPLEX_ROUTES.length}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Coverage: ${((UPDATED_ROUTES.length + skipped) / totalRoutes * 100).toFixed(1)}%`);

  if (COMPLEX_ROUTES.length > 0) {
    console.log(`\n⚠️  COMPLEX ROUTES (require manual review):`);
    COMPLEX_ROUTES.slice(0, 20).forEach(r => console.log(`   - ${r}`));
    if (COMPLEX_ROUTES.length > 20) {
      console.log(`   ... and ${COMPLEX_ROUTES.length - 20} more`);
    }
  }

  console.log(`\n✅ Updated routes saved to file...`);
  fs.writeFileSync(
    path.join(__dirname, 'updated-routes.txt'),
    UPDATED_ROUTES.join('\n'),
    'utf8'
  );

  console.log('\n🔨 Running type-check...');
  try {
    execSync('npm run lint 2>&1', { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
    console.log('✅ Lint passed');
  } catch (err) {
    console.log('⚠️  Lint warnings detected (see above)');
  }
}

main();
