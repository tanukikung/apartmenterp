#!/usr/bin/env python3
"""
Safe route update script - Updates API routes to use formatSuccess/formatPaginatedSuccess
"""

import os
import re
from pathlib import Path

PROJECT_ROOT = Path('/d/apartment_erp')
ROUTES_DIR = PROJECT_ROOT / 'src/app/api'

# Already manually updated routes
ALREADY_UPDATED = {
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
}

def update_route(file_path):
    """Update a single route file"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Skip if already updated
    if 'formatSuccess' in content or 'formatPaginatedSuccess' in content:
        return False, "already_updated"

    original = content
    changed = False

    # Pattern 1: NextResponse.json({ success: true, data: X } as ApiResponse...)
    # This pattern needs to become: formatSuccess(X)
    pattern1 = r'return NextResponse\.json\(\s*{\s*success:\s*true,\s*data:\s*([^}]+?)\s*}\s*as\s*ApiResponse[^)]*\)'
    matches1 = list(re.finditer(pattern1, content, re.MULTILINE))

    if matches1:
        for match in reversed(matches1):  # Reverse to maintain positions
            data = match.group(1).strip().rstrip(',')
            replacement = f'return NextResponse.json(\n      formatSuccess({data})\n    )'
            content = content[:match.start()] + replacement + content[match.end():]
        changed = True

    # Pattern 2: NextResponse.json({ success: true, data: X, message: "..." } as ApiResponse...)
    pattern2 = r"return NextResponse\.json\(\s*{\s*success:\s*true,\s*data:\s*([^,]+?),\s*message:\s*['\"]([^'\"]*)['\"]([^}]*)\}\s*as\s*ApiResponse[^)]*\)"
    matches2 = list(re.finditer(pattern2, content, re.MULTILINE))

    if matches2:
        for match in reversed(matches2):
            data = match.group(1).strip()
            message = match.group(2)
            replacement = f'return NextResponse.json(\n      formatSuccess({data}, \'{message}\')\n    )'
            content = content[:match.start()] + replacement + content[match.end():]
        changed = True

    # Add imports if changed
    if changed:
        # Remove old ApiResponse imports
        content = re.sub(r',\s*ApiResponse\s*(?=from|,|;)', ' ', content)
        content = re.sub(r',\s*type\s*ApiResponse\s*(?=from|,|;)', ' ', content)

        # Add formatSuccess import
        if 'from \'@/lib/api-response\'' not in content:
            # Find last import statement
            last_import_match = None
            for match in re.finditer(r"^import\s+[^;]+;\s*$", content, re.MULTILINE):
                last_import_match = match

            if last_import_match:
                import_pos = last_import_match.end()
                content = (content[:import_pos] + '\nimport { formatSuccess, formatPaginatedSuccess } from \'@/lib/api-response\';' +
                          content[import_pos:])

        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)

        return True, "updated"

    return False, "no_patterns"

def main():
    """Main entry point"""
    all_routes = sorted(ROUTES_DIR.rglob('route.ts'))
    stats = {'updated': 0, 'skipped': 0, 'no_patterns': 0, 'errors': 0}
    updated_files = []

    for route_path in all_routes:
        rel_path = str(route_path.relative_to(PROJECT_ROOT))

        if rel_path in ALREADY_UPDATED:
            print(f"⏭️  SKIP (manual) {rel_path}")
            stats['skipped'] += 1
            continue

        try:
            success, reason = update_route(route_path)
            if success:
                print(f"✅ UPDATED {rel_path}")
                stats['updated'] += 1
                updated_files.append(rel_path)
            elif reason == 'already_updated':
                print(f"⏭️  SKIP (already updated) {rel_path}")
                stats['skipped'] += 1
            else:
                print(f"⏭️  SKIP (no patterns) {rel_path}")
                stats['no_patterns'] += 1
        except Exception as e:
            print(f"❌ ERROR {rel_path}: {str(e)}")
            stats['errors'] += 1

    print('\n' + '='*80)
    print(f"📊 SUMMARY")
    print('='*80)
    print(f"Updated: {stats['updated']}")
    print(f"Skipped: {stats['skipped']}")
    print(f"No patterns: {stats['no_patterns']}")
    print(f"Errors: {stats['errors']}")
    print(f"Total: {sum(stats.values())}")

    # Save list of updated files
    with open(PROJECT_ROOT / 'scripts/updated.txt', 'w') as f:
        for file in updated_files:
            f.write(file + '\n')

    print(f"\n✅ Updated {stats['updated']} routes")

if __name__ == '__main__':
    main()
