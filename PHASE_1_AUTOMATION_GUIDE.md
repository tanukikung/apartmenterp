# 🤖 PHASE 1 Automation Guide - Mass Update Script

Since PHASE 1 requires updating 120+ API routes with the new response format, this guide provides automated scripts to do bulk updates.

## Files Already Updated/Created

✅ Core Infrastructure:
- `src/lib/api-response.ts` - Standardized API response format
- `src/lib/utils/app-error.ts` - Enhanced error types
- `src/lib/utils/logger.ts` - Already has structured logging
- `src/hooks/useApi.ts` - Updated with new response format
- `src/components/error/ErrorBoundary.tsx` - Enhanced with better logging
- `src/app/api/invoices/route.ts` - Sample update (use as template)

## Step 1: Update All GET Routes (Listing/Pagination)

**Pattern to find:**
```typescript
return NextResponse.json({
  success: true,
  data: result,  // or { data: [], total: 10, ...}
});
```

**Pattern to replace with:**
```typescript
// At top of file:
import { formatPaginatedSuccess, formatSuccess } from '@/lib/api-response';

// In route handler:
return NextResponse.json(
  formatPaginatedSuccess(
    result.data,  // array of items
    result.page,  // page number
    result.pageSize,  // page size
    result.total  // total count
  )
);
```

### Script: Update All List/Pagination Routes

```bash
#!/bin/bash
# update-pagination-routes.sh

ROUTES_DIR="src/app/api"
COUNT=0

# Find all routes that return paginated data
for file in $(find "$ROUTES_DIR" -name "route.ts" | grep -E "(invoices|payments|rooms|contracts|tenants|maintenance|billing|deliveries|chat|documents)"); do
  echo "Processing: $file"
  
  # Check if already updated
  if ! grep -q "formatPaginatedSuccess" "$file"; then
    # Add import if not present
    if ! grep -q "import.*api-response" "$file"; then
      sed -i "1s/^/import { formatPaginatedSuccess, formatSuccess } from '@\/lib\/api-response';\n/" "$file"
    fi
    
    # Replace simple success responses
    sed -i "s/return NextResponse.json({$/return NextResponse.json(\n  formatPaginatedSuccess(/g" "$file"
    sed -i "s/success: true,//" "$file"
    sed -i "s/data: result,/result.data,/" "$file"
    sed -i "s/} as ApiResponse<typeof result>);//  result.page, result.pageSize, result.total\n  )\n);/g" "$file"
    
    COUNT=$((COUNT + 1))
    echo "✓ Updated $file"
  fi
done

echo "Updated $COUNT routes"
```

### Manual Template for Single Routes

For each list route that returns paginated data:

```typescript
// BEFORE
export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  // ... validation and service call ...
  const result = await service.listItems(validatedQuery);
  
  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});

// AFTER
import { formatPaginatedSuccess } from '@/lib/api-response';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  // ... validation and service call ...
  const result = await service.listItems(validatedQuery);
  
  return NextResponse.json(
    formatPaginatedSuccess(
      result.data || result,  // array of items
      result.page,
      result.pageSize,
      result.total
    )
  );
});
```

## Step 2: Update All POST/PATCH/DELETE Routes (Create/Update)

**Pattern to find:**
```typescript
return NextResponse.json({
  success: true,
  data: createdItem,
  message: 'Item created',
}, { status: 201 });
```

**Pattern to replace with:**
```typescript
import { formatSuccess } from '@/lib/api-response';

return NextResponse.json(
  formatSuccess(createdItem, 'Item created'),
  { status: 201 }
);
```

### Script: Update All Create/Update Routes

```bash
#!/bin/bash
# update-mutation-routes.sh

ROUTES_DIR="src/app/api"
COUNT=0

for file in $(find "$ROUTES_DIR" -name "route.ts"); do
  # Check if it has POST/PATCH/DELETE handlers
  if grep -qE "export const (POST|PATCH|DELETE)" "$file"; then
    echo "Processing: $file"
    
    if ! grep -q "formatSuccess" "$file"; then
      # Add import if not present
      if ! grep -q "import.*api-response" "$file"; then
        sed -i "1s/^/import { formatSuccess } from '@\/lib\/api-response';\n/" "$file"
      fi
      
      # Replace mutation responses
      sed -i "s/success: true,//g" "$file"
      sed -i "s/data: \([^,]*\),/\1,/g" "$file"
      sed -i "s/return NextResponse.json({.*message: '\([^']*\)'.*/return NextResponse.json(\n    formatSuccess(data, '\1'),/" "$file"
      
      COUNT=$((COUNT + 1))
      echo "✓ Updated $file"
    fi
  fi
done

echo "Updated $COUNT routes"
```

## Step 3: List of All Routes to Update (120+ total)

### Critical Routes (Update First) - 10 files
```
src/app/api/invoices/route.ts ✓ (done)
src/app/api/payments/route.ts
src/app/api/rooms/route.ts
src/app/api/contracts/route.ts
src/app/api/billing/route.ts
src/app/api/tenants/route.ts
src/app/api/maintenance/route.ts
src/app/api/documents/route.ts
src/app/api/chat/route.ts
src/app/api/deliveries/route.ts
```

### Admin Routes - 15 files
```
src/app/api/admin/users/route.ts
src/app/api/admin/maintenance/route.ts
src/app/api/admin/registration-requests/route.ts
src/app/api/admin/audit-logs/verify-chain/route.ts
src/app/api/admin/dashboard-alerts/route.ts
src/app/api/admin/settings/route.ts
src/app/api/admin/jobs/route.ts
... (15 more)
```

### Detail Routes - 30 files
```
src/app/api/invoices/[id]/route.ts
src/app/api/payments/[paymentId]/route.ts
src/app/api/rooms/[roomId]/route.ts
src/app/api/contracts/[id]/route.ts
... (26 more)
```

### Specialized Routes - 65+ files
```
src/app/api/billing/periods/route.ts
src/app/api/billing/import/batches/route.ts
src/app/api/conversations/route.ts
src/app/api/auth/login/route.ts
src/app/api/auth/signup/route.ts
src/app/api/auth/logout/route.ts
... (59 more)
```

## Step 4: Verify Updates

After running scripts, verify:

```bash
# Check that all routes have the updated import
grep -r "api-response" src/app/api/ | grep import | wc -l
# Should show ~120

# Check for remaining old response format
grep -r "success: true," src/app/api/ | wc -l
# Should show 0 (or very few exceptions)

# Run type check
npm run type-check

# Run linting
npm run lint

# Run tests
npm run test
```

## Step 5: Manual Fixes for Edge Cases

Some routes may need manual fixes:

### For routes with custom response structure:
```typescript
// Check if result has different structure
if (result.items) {
  return NextResponse.json(
    formatSuccess(result.items)
  );
}
```

### For routes with metadata:
```typescript
// Preserve metadata
return NextResponse.json(
  formatPaginatedSuccess(data, page, size, total),
  {
    headers: { 'X-Custom-Header': value }
  }
);
```

### For routes with conditional responses:
```typescript
if (error) {
  return NextResponse.json(
    formatError('ERROR_CODE', 'Error message', 400),
    { status: 400 }
  );
}

return NextResponse.json(
  formatSuccess(data)
);
```

## Step 6: Timeline

- **Day 1-2**: Run scripts on critical 10 routes, test manually
- **Day 3-4**: Run scripts on admin 15 routes, verify
- **Day 5-7**: Run scripts on remaining 95 routes, bulk testing
- **Day 8-10**: Manual fixes and edge cases, full regression testing

## Rollback Plan

If something breaks:

```bash
# See git diff before committing
git diff src/app/api/ | head -500

# If needed, revert all changes
git checkout src/app/api/

# Then update routes one at a time manually
```

## Notes

- All changes are backward compatible with existing client code
- Error responses are handled separately by `asyncHandler` + `formatError`
- No database changes needed
- No breaking changes to route signatures

---

**Next**: After Phase 1 is complete, move to PHASE 2 (Color System & State Management)

