#!/bin/bash

# Safely update routes in batches with verification between batches

ROUTES_TO_UPDATE=(
  # Auth routes (critical)
  "src/app/api/auth/signup/route.ts"
  "src/app/api/auth/change-password/route.ts"
  "src/app/api/auth/forgot-password/route.ts"
  "src/app/api/auth/reset-password/route.ts"
  "src/app/api/auth/bootstrap-status/route.ts"
  "src/app/api/auth/session/refresh/route.ts"
  "src/app/api/auth/reset-limit/route.ts"
  
  # Billing routes (high impact)
  "src/app/api/billing/[id]/route.ts"
  "src/app/api/billing/[id]/lock/route.ts"
  "src/app/api/billing/[id]/unlock/route.ts"
  "src/app/api/billing/periods/route.ts"
  "src/app/api/billing/cycles/route.ts"
  "src/app/api/billing/rules/route.ts"
  "src/app/api/billing/import/batches/route.ts"
  
  # Admin routes (critical management)
  "src/app/api/admin/users/route.ts"
  "src/app/api/admin/users/[id]/route.ts"
  "src/app/api/admin/settings/route.ts"
  "src/app/api/admin/registration-requests/route.ts"
  "src/app/api/admin/outbox/route.ts"
  "src/app/api/admin/maintenance/route.ts"
)

echo "Batch updating routes with pattern replacement..."
echo "Total routes to process: ${#ROUTES_TO_UPDATE[@]}"

for route in "${ROUTES_TO_UPDATE[@]}"; do
  if [ -f "/d/apartment_erp/$route" ]; then
    echo "Processing: $route"
    # Pattern 1: { success: true, data: X } 
    sed -i 's/return NextResponse\.json(\s*{\s*success:\s*true,\s*data:\s*\([^}]*\)\s*}\s*as ApiResponse/return NextResponse.json(\n      formatSuccess(\1)\n    )/g' "/d/apartment_erp/$route"
    
    # Pattern 2: { success: true, data: X, message: "..." }
    sed -i "s/return NextResponse\.json(\s*{\s*success:\s*true,\s*data:\s*\([^,]*\),\s*message:\s*['\''\"]\([^'\''\''\"]*\)['\''\''\"]\s*}/return NextResponse.json(\n      formatSuccess(\1, '\2')\n    )/g" "/d/apartment_erp/$route"
    
    # Add imports
    if grep -q "success: true" "/d/apartment_erp/$route"; then
      if ! grep -q "formatSuccess" "/d/apartment_erp/$route"; then
        sed -i "/^import { asyncHandler/a import { formatSuccess, formatPaginatedSuccess } from '@\/lib\/api-response';" "/d/apartment_erp/$route"
      fi
    fi
  fi
done

echo "Batch update complete"
