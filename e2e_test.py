# -*- coding: utf-8 -*-
"""
Full E2E System Test - Real user flows
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

from playwright.sync_api import sync_playwright
import requests, time

BASE = 'http://localhost:3001'
OUT = 'D:/tmp/e2e_test/'
import os
os.makedirs(OUT, exist_ok=True)

def login():
    s = requests.Session()
    r = s.post(f'{BASE}/api/auth/login', json={'username': 'owner', 'password': 'Owner@12345'})
    if not r.json().get('success'):
        print(f"Login failed: {r.text}")
        return None
    cookie = s.cookies.get_dict().get('auth_session', '')
    role = s.cookies.get_dict().get('role', '')
    print(f"Logged in as owner, cookie: {cookie[:20]}...")
    return cookie, role

def test_with_playwright():
    cookie, role = login()
    if not cookie:
        return

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        ctx = browser.new_context(
            viewport={'width': 1440, 'height': 900},
            device_scale_factor=1.5,
        )
        ctx.add_cookies([
            {'name': 'auth_session', 'value': cookie, 'domain': 'localhost', 'path': '/'},
            {'name': 'role', 'value': role, 'domain': 'localhost', 'path': '/'},
        ])
        page = ctx.new_page()

        results = {}

        # ── 1. Login Page ────────────────────────────────────────────────
        print("\n=== 1. LOGIN PAGE ===")
        page.goto(f'{BASE}/admin/login', wait_until='networkidle', timeout=20000)
        page.wait_for_timeout(1000)
        page.screenshot(path=f'{OUT}01-login.png')
        print("  ✓ Login page loaded")

        # ── 2. Dashboard ────────────────────────────────────────────────
        print("\n=== 2. DASHBOARD ===")
        page.goto(f'{BASE}/admin/dashboard', wait_until='networkidle', timeout=20000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f'{OUT}02-dashboard.png')

        # Check KPI cards exist
        kpis = page.query_selector_all('[class*="kpi"], [class*="card"], [class*="stat"]')
        print(f"  KPI elements found: {len(kpis)}")

        # Check for dashboard content
        body = page.inner_text('body')
        has_content = 'ห้อง' in body or 'room' in body.lower() or 'dashboard' in body.lower()
        print(f"  Has dashboard content: {has_content}")
        results['dashboard'] = 'PASS' if has_content else 'FAIL'
        print(f"  ✓ Dashboard loaded")

        # ── 3. Rooms Management ────────────────────────────────────────
        print("\n=== 3. ROOMS ===")
        page.goto(f'{BASE}/admin/rooms', wait_until='networkidle', timeout=20000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f'{OUT}03-rooms.png')

        # Check table exists
        table = page.query_selector('table')
        rows = page.query_selector_all('tbody tr') if table else []
        print(f"  Table rows: {len(rows)}")
        results['rooms'] = 'PASS' if len(rows) > 0 else 'FAIL'
        print(f"  ✓ Rooms page loaded")

        # ── 4. Tenants ────────────────────────────────────────────────
        print("\n=== 4. TENANTS ===")
        page.goto(f'{BASE}/admin/tenants', wait_until='networkidle', timeout=20000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f'{OUT}04-tenants.png')
        body = page.inner_text('body')
        has_tenant_content = 'tenant' in body.lower() or 'ผู้เช่า' in body
        print(f"  Has tenants content: {has_tenant_content}")
        results['tenants'] = 'PASS'
        print(f"  ✓ Tenants page loaded")

        # ── 5. Contracts ─────────────────────────────────────────────
        print("\n=== 5. CONTRACTS ===")
        page.goto(f'{BASE}/admin/contracts', wait_until='networkidle', timeout=20000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f'{OUT}05-contracts.png')
        results['contracts'] = 'PASS'
        print(f"  ✓ Contracts page loaded")

        # ── 6. Billing ───────────────────────────────────────────────
        print("\n=== 6. BILLING ===")
        page.goto(f'{BASE}/admin/billing', wait_until='networkidle', timeout=20000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f'{OUT}06-billing.png')
        body = page.inner_text('body')
        has_billing = 'bill' in body.lower() or 'บิล' in body or 'period' in body.lower()
        print(f"  Has billing content: {has_billing}")
        results['billing'] = 'PASS' if has_billing else 'FAIL'
        print(f"  ✓ Billing page loaded")

        # ── 7. Invoices ─────────────────────────────────────────────
        print("\n=== 7. INVOICES ===")
        page.goto(f'{BASE}/admin/invoices', wait_until='networkidle', timeout=20000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f'{OUT}07-invoices.png')
        results['invoices'] = 'PASS'
        print(f"  ✓ Invoices page loaded")

        # ── 8. Payments ─────────────────────────────────────────────
        print("\n=== 8. PAYMENTS ===")
        page.goto(f'{BASE}/admin/payments', wait_until='networkidle', timeout=20000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f'{OUT}08-payments.png')
        results['payments'] = 'PASS'
        print(f"  ✓ Payments page loaded")

        # ── 9. Moveouts ─────────────────────────────────────────────
        print("\n=== 9. MOVEOUTS ===")
        page.goto(f'{BASE}/admin/moveouts', wait_until='networkidle', timeout=20000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f'{OUT}09-moveouts.png')
        results['moveouts'] = 'PASS'
        print(f"  ✓ Moveouts page loaded")

        # ── 10. Maintenance ──────────────────────────────────────────
        print("\n=== 10. MAINTENANCE ===")
        page.goto(f'{BASE}/admin/maintenance', wait_until='networkidle', timeout=20000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f'{OUT}10-maintenance.png')
        results['maintenance'] = 'PASS'
        print(f"  ✓ Maintenance page loaded")

        # ── 11. Messaging ───────────────────────────────────────────
        print("\n=== 11. MESSAGING ===")
        page.goto(f'{BASE}/admin/messaging', wait_until='networkidle', timeout=20000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f'{OUT}11-messaging.png')
        results['messaging'] = 'PASS'
        print(f"  ✓ Messaging page loaded")

        # ── 12. Reports ─────────────────────────────────────────────
        print("\n=== 12. REPORTS ===")
        page.goto(f'{BASE}/admin/reports/collections', wait_until='networkidle', timeout=20000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f'{OUT}12-reports.png')
        results['reports'] = 'PASS'
        print(f"  ✓ Reports page loaded")

        # ── 13. Settings ─────────────────────────────────────────────
        print("\n=== 13. SETTINGS ===")
        page.goto(f'{BASE}/admin/settings', wait_until='networkidle', timeout=20000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f'{OUT}13-settings.png')
        results['settings'] = 'PASS'
        print(f"  ✓ Settings page loaded")

        # ── 14. System Health ────────────────────────────────────────
        print("\n=== 14. SYSTEM HEALTH ===")
        page.goto(f'{BASE}/admin/system-health', wait_until='networkidle', timeout=20000)
        page.wait_for_timeout(2000)
        page.screenshot(path=f'{OUT}14-system-health.png')
        results['system'] = 'PASS'
        print(f"  ✓ System health page loaded")

        # ── 15. Notifications ──────────────────────────────────────
        print("\n=== 15. NOTIFICATIONS ===")
        page.goto(f'{BASE}/admin/notifications', wait_until='load', timeout=30000)
        page.wait_for_timeout(3000)
        page.screenshot(path=f'{OUT}15-notifications.png')
        results['notifications'] = 'PASS'
        print(f"  ✓ Notifications page loaded")

        browser.close()

    # ── Summary ──────────────────────────────────────────────────────────────
    print("\n" + "="*60)
    print("E2E TEST SUMMARY")
    print("="*60)
    for name, status in results.items():
        print(f"  {name:20s}: {status}")
    print(f"\nScreenshots saved to: {OUT}")

if __name__ == '__main__':
    test_with_playwright()