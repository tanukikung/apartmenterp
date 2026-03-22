# ╔══════════════════════════════════════════════════════════════╗
# ║         Apartment ERP — Clean Repo (Windows)                 ║
# ║  ลบไฟล์ที่ไม่จำเป็น + เอาออกจาก git tracking                ║
# ║  รัน: powershell -ExecutionPolicy Bypass -File clean-repo.ps1 ║
# ╚══════════════════════════════════════════════════════════════╝

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Apartment ERP — Clean Repo       ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Helper ────────────────────────────────────────────────────────
function Remove-Item-Safe($path, $label) {
    $full = Join-Path $root $path
    if (Test-Path $full) {
        Write-Host "  🗑  Removing $label..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force $full
        Write-Host "      Done." -ForegroundColor Green
    } else {
        Write-Host "  ✓  $label not found (skip)" -ForegroundColor DarkGray
    }
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write-Host "[ 1/5 ] Removing node_modules & build output..." -ForegroundColor White
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Remove-Item-Safe "node_modules"                  "root/node_modules"
Remove-Item-Safe "tsconfig.tsbuildinfo"          "root/tsconfig.tsbuildinfo"
Remove-Item-Safe "apps\erp\node_modules"         "apps/erp/node_modules"
Remove-Item-Safe "apps\erp\.next"                "apps/erp/.next"
Remove-Item-Safe "apps\erp\dist"                 "apps/erp/dist"
Remove-Item-Safe "apps\erp\tsconfig.tsbuildinfo" "apps/erp/tsconfig.tsbuildinfo"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write-Host ""
Write-Host "[ 2/5 ] Removing test artifacts..." -ForegroundColor White
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Remove-Item-Safe "apps\erp\test-results"         "apps/erp/test-results"
Remove-Item-Safe "apps\erp\.data"                "apps/erp/.data"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write-Host ""
Write-Host "[ 3/5 ] Removing temp/debug scripts..." -ForegroundColor White
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
$tempFiles = @(
    "apps\erp\check-port.ps1",
    "apps\erp\check_db.cjs",
    "apps\erp\create_fresh_db.cjs",
    "apps\erp\create_fresh_db.mjs",
    "apps\erp\create_fresh_proof3.cjs",
    "apps\erp\create-admin.js",
    "apps\erp\debug-lock-all.js",
    "apps\erp\qa-billing-import.js",
    "apps\erp\qa-browser-test.js",
    "apps\erp\qa-test-fixed.js",
    "apps\erp\verify-billing-flow.js",
    "apps\erp\test-parser.mjs",
    "apps\erp\build_output.txt",
    "apps\erp\cookies.txt",
    "apps\erp\.audit-server.log",
    "apps\erp\.next-server.err.log",
    "apps\erp\.next-server.out.log",
    "apps\erp\.stabilize-server.log",
    "cookies.txt",
    "invoice_thai_test.pdf",
    "thai_test.pdf",
    "test-bank-statement.csv",
    # AI analysis artifacts
    "floor_detail.txt",
    "floor_summary.txt",
    "sheet_detail1.txt",
    "sheet_names.txt",
    "xlsx_structure.json",
    "make_billing_template.py"
)
foreach ($f in $tempFiles) {
    Remove-Item-Safe $f $f
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write-Host ""
Write-Host "[ 4/5 ] Removing large non-source folders..." -ForegroundColor White
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Remove-Item-Safe "stitch_apartment_erp_admin_prd" "UI mockup screenshots"
Remove-Item-Safe ".minimax"                        ".minimax (AI tool cache)"
Remove-Item-Safe ".claude\worktrees"               ".claude/worktrees"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write-Host ""
Write-Host "[ 5/5 ] Removing git-tracked files that should be ignored..." -ForegroundColor White
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write-Host "  Running: git rm -r --cached (untrack ignored files)..." -ForegroundColor Yellow
git rm -r --cached . 2>&1 | Out-Null
git add . 2>&1 | Out-Null
Write-Host "  Done — git index updated." -ForegroundColor Green

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║           Clean Complete! ✓           ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. git status        (ตรวจสอบว่าถูกต้อง)"
Write-Host "  2. git commit -m 'chore: clean repo for deployment'"
Write-Host "  3. git push"
Write-Host ""
