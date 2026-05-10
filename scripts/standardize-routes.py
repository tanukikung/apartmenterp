#!/usr/bin/env python3
"""
Standardize all API routes to use formatSuccess/formatError.
Safe multi-pass approach that handles complex patterns.
"""

import os
import re
from pathlib import Path

PROJECT_ROOT = Path('D:/apartment_erp')
ROUTES_DIR = PROJECT_ROOT / 'src' / 'app' / 'api'

# Routes that were already manually verified (skip these)
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

def get_all_routes():
    """Find all route.ts files."""
    routes = []
    for root, dirs, files in os.walk(ROUTES_DIR):
        if 'route.ts' in files:
            rel_path = os.path.relpath(os.path.join(root, 'route.ts'), PROJECT_ROOT)
            rel_path = rel_path.replace('\\', '/')
            routes.append(rel_path)
    return sorted(routes)

def has_formatSuccess(content):
    """Check if file already uses new format."""
    return 'formatSuccess' in content or 'formatError' in content

def needs_import(content):
    """Check if formatSuccess/formatError need to be imported."""
    return not ('from \'@/lib/api-response\'' in content or 'from "@/lib/api-response"' in content)

def add_import(content):
    """Add import for formatSuccess/formatError if missing."""
    if not needs_import(content):
        return content

    # Find the last import line
    lines = content.split('\n')
    last_import_idx = -1
    for i, line in enumerate(lines):
        if line.startswith('import ') and line.endswith(';'):
            last_import_idx = i

    if last_import_idx >= 0:
        lines.insert(last_import_idx + 1, "import { formatSuccess, formatError } from '@/lib/api-response';")
        return '\n'.join(lines)

    return content

def update_route(file_path):
    """Update a single route file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        original = content

        # Skip if already updated
        if has_formatSuccess(content):
            return {'status': 'skipped', 'reason': 'already_updated'}

        # Add import if needed
        if 'NextResponse.json' in content and 'formatSuccess' not in content:
            content = add_import(content)

        # Pattern 1: NextResponse.json({ success: true, data: X } as ApiResponse)
        # This is the most common pattern
        pattern1 = r'NextResponse\.json\(\s*\{\s*success:\s*true,\s*data:\s*([^}]+?)\s*\}\s*as\s*ApiResponse[^)]*\)'

        def replace_pattern1(match):
            data = match.group(1).strip().rstrip(',')
            return f'NextResponse.json(formatSuccess({data}))'

        content_after = re.sub(pattern1, replace_pattern1, content)

        if content != content_after:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content_after)
            return {'status': 'updated', 'pattern': 1}

        return {'status': 'skipped', 'reason': 'no_patterns_matched'}

    except Exception as e:
        return {'status': 'error', 'error': str(e)}

def main():
    routes = get_all_routes()
    stats = {'updated': 0, 'skipped': 0, 'errors': 0}

    print(f"Processing {len(routes)} routes...\n")

    for route_path in routes:
        rel_path = route_path.replace('\\', '/')

        # Skip already-updated routes
        if rel_path in ALREADY_UPDATED:
            print(f"[SKIP] (manual) {rel_path}")
            stats['skipped'] += 1
            continue

        file_path = PROJECT_ROOT / route_path
        result = update_route(str(file_path))

        if result['status'] == 'updated':
            print(f"[UPDATED] {rel_path}")
            stats['updated'] += 1
        elif result['status'] == 'skipped':
            reason = result.get('reason', 'unknown')
            print(f"[SKIP] ({reason}) {rel_path}")
            stats['skipped'] += 1
        else:
            print(f"[ERROR] {rel_path}: {result.get('error', 'unknown')}")
            stats['errors'] += 1

    print(f"\n{'=' * 80}")
    print(f"Updated: {stats['updated']}")
    print(f"Skipped: {stats['skipped']}")
    print(f"Errors: {stats['errors']}")
    print(f"Total: {sum(stats.values())}")

if __name__ == '__main__':
    main()
