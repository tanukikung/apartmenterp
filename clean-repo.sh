#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║         Apartment ERP — Clean Repo (Linux/Mac)               ║
# ║  ลบไฟล์ที่ไม่จำเป็น + เอาออกจาก git tracking                ║
# ║  รัน: bash clean-repo.sh                                      ║
# ╚══════════════════════════════════════════════════════════════╝

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m'

echo ""
echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     Apartment ERP — Clean Repo       ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

rm_safe() {
  local path="$1"
  local label="$2"
  if [ -e "$path" ]; then
    echo -e "  ${YELLOW}🗑  Removing $label...${NC}"
    rm -rf "$path"
    echo -e "  ${GREEN}    Done.${NC}"
  else
    echo -e "  ${GRAY}✓  $label not found (skip)${NC}"
  fi
}

# ── 1. node_modules & build output ──────────────────────────────
echo "[ 1/5 ] Removing node_modules & build output..."
rm_safe "node_modules"                    "root/node_modules"
rm_safe "tsconfig.tsbuildinfo"            "root/tsconfig.tsbuildinfo"
rm_safe "apps/erp/node_modules"           "apps/erp/node_modules"
rm_safe "apps/erp/.next"                  "apps/erp/.next"
rm_safe "apps/erp/dist"                   "apps/erp/dist"
rm_safe "apps/erp/tsconfig.tsbuildinfo"   "apps/erp/tsconfig.tsbuildinfo"

# ── 2. Test artifacts ────────────────────────────────────────────
echo ""
echo "[ 2/5 ] Removing test artifacts..."
rm_safe "apps/erp/test-results"           "apps/erp/test-results"
rm_safe "apps/erp/.data"                  "apps/erp/.data"

# ── 3. Temp / debug scripts ──────────────────────────────────────
echo ""
echo "[ 3/5 ] Removing temp/debug scripts..."
for f in \
  "apps/erp/check-port.ps1" \
  "apps/erp/check_db.cjs" \
  "apps/erp/create_fresh_db.cjs" \
  "apps/erp/create_fresh_db.mjs" \
  "apps/erp/create_fresh_proof3.cjs" \
  "apps/erp/create-admin.js" \
  "apps/erp/debug-lock-all.js" \
  "apps/erp/qa-billing-import.js" \
  "apps/erp/qa-browser-test.js" \
  "apps/erp/qa-test-fixed.js" \
  "apps/erp/verify-billing-flow.js" \
  "apps/erp/test-parser.mjs" \
  "apps/erp/build_output.txt" \
  "apps/erp/cookies.txt" \
  "apps/erp/.audit-server.log" \
  "apps/erp/.next-server.err.log" \
  "apps/erp/.next-server.out.log" \
  "apps/erp/.stabilize-server.log" \
  "cookies.txt" \
  "invoice_thai_test.pdf" \
  "thai_test.pdf" \
  "test-bank-statement.csv" \
  "floor_detail.txt" \
  "floor_summary.txt" \
  "sheet_detail1.txt" \
  "sheet_names.txt" \
  "xlsx_structure.json" \
  "make_billing_template.py"
do
  rm_safe "$f" "$f"
done

# ── 4. Large non-source folders ──────────────────────────────────
echo ""
echo "[ 4/5 ] Removing large non-source folders..."
rm_safe "stitch_apartment_erp_admin_prd"  "UI mockup screenshots"
rm_safe ".minimax"                         ".minimax (AI tool cache)"
rm_safe ".claude/worktrees"                ".claude/worktrees"

# ── 5. Untrack files that should be ignored ──────────────────────
echo ""
echo "[ 5/5 ] Removing git-tracked files that should be ignored..."
echo "  Running: git rm -r --cached ..."
git rm -r --cached . > /dev/null 2>&1 || true
git add . > /dev/null 2>&1
echo -e "  ${GREEN}Done — git index updated.${NC}"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Clean Complete! ✓           ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo "  1. git status        (ตรวจสอบว่าถูกต้อง)"
echo "  2. git commit -m 'chore: clean repo for deployment'"
echo "  3. git push"
echo ""
