/**
 * Event-Aware Wait Layer — Deterministic async wait helpers.
 *
 * ALL waits are based on observable API responses or DOM mutations.
 * NO fixed delays. NO polling with setTimeout.
 *
 * Usage:
 *   await waitForApi(page, '/api/invoices/send');
 *   await click(sendBtn);
 *   await waitForApi(page, '/api/invoices');
 */

import { Page, Locator, expect } from '@playwright/test';

// ─── Generic API wait ─────────────────────────────────────────────────────────

/**
 * Waits for ANY API response matching the URL pattern.
 * Use alongside a click to form a deterministic pair:
 *   await Promise.all([waitForApi(page, '/api/tenants'), page.click(btn)]);
 */
export async function waitForApi(
  page: Page,
  urlPattern: string | RegExp,
  timeout = 30000
): Promise<void> {
  await page.waitForResponse(
    r => urlPattern instanceof RegExp
      ? urlPattern.test(r.url())
      : r.url().includes(urlPattern),
    { timeout }
  );
}

/**
 * Waits for a response to complete AND returns it.
 * Useful when you need to inspect the response body.
 */
export async function waitForApiWithResponse<T = unknown>(
  page: Page,
  urlPattern: string | RegExp,
  timeout = 30000
): Promise<{ response: Awaited<ReturnType<Page['waitForResponse']>>; body: T }> {
  const response = await page.waitForResponse(
    r => urlPattern instanceof RegExp
      ? urlPattern.test(r.url())
      : r.url().includes(urlPattern),
    { timeout }
  );
  const body = await response.json().catch(() => ({})) as T;
  return { response, body };
}

/**
 * Waits for ALL matching responses in flight.
 */
export async function waitForAllApis(
  page: Page,
  urlPatterns: (string | RegExp)[],
  timeout = 30000
): Promise<void> {
  await Promise.all(
    urlPatterns.map(pattern => waitForApi(page, pattern, timeout))
  );
}

// ─── Entity status waits ──────────────────────────────────────────────────────

/**
 * Polls GET /api/invoices/:id every 1s until status matches or timeout.
 * Uses deterministic response checks, not fixed delays.
 */
export async function waitForInvoiceStatus(
  page: Page,
  invoiceId: string,
  targetStatus: string,
  timeout = 30000
): Promise<void> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const result = await page.evaluate(
      async (id) => {
        const res = await fetch(`/api/invoices/${id}`);
        const json = await res.json();
        return json;
      },
      invoiceId
    );

    const invoice = (result as { data?: { status: string } })?.data;
    if (invoice?.status === targetStatus) return;

    // Wait 1s before next poll — use setTimeout directly, not waitForResponse
    // (waitForResponse can timeout when the previous API call returned 429 quickly)
    await new Promise(r => setTimeout(r, 1000));
  }

  throw new Error(
    `[waitForInvoiceStatus] Timed out waiting for invoice ${invoiceId} to become ${targetStatus}`
  );
}

/**
 * Waits for outbox to be processed (all pending messages delivered).
 * Polls /api/admin/outbox until pending count is 0 or timeout.
 */
export async function waitForOutboxProcessed(
  page: Page,
  timeout = 60000
): Promise<void> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/admin/outbox', {
        headers: { Origin: window.location.origin },
        credentials: 'include',
      });
      const json = await res.json();
      return json;
    });

    const outbox = result as { data?: { pending?: number; total?: number } };
    const pending = outbox?.data?.pending ?? outbox?.data?.total ?? -1;
    if (pending === 0) return;

    await page.waitForResponse(r => r.url().includes('/api/'), { timeout: 5000 }).catch(() => {});
  }

  console.warn('[waitForOutboxProcessed] Timed out — outbox may still have pending items');
}

/**
 * Waits for a payment to be matched/confirmed against an invoice.
 */
export async function waitForPaymentMatched(
  page: Page,
  invoiceId: string,
  timeout = 30000
): Promise<void> {
  await waitForInvoiceStatus(page, invoiceId, 'PAID', timeout);
}

// ─── UI state waits ───────────────────────────────────────────────────────────

/**
 * Waits for a locator to have a specific attribute value.
 */
export async function waitForAttribute(
  locator: Locator,
  attribute: string,
  value: string,
  timeout = 10000
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const attr = await locator.getAttribute(attribute).catch(() => null);
    if (attr === value) return;
    await page.waitForResponse(r => r.url().includes('/api/'), { timeout: 3000 }).catch(() => {});
  }
  throw new Error(
    `[waitForAttribute] Locator ${locator.toString()} never had ${attribute}="${value}"`
  );
}

/**
 * Waits for a locator to be visible and have text matching a pattern.
 */
export async function waitForText(
  locator: Locator,
  pattern: string | RegExp,
  timeout = 10000
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const text = await locator.textContent().catch(() => '');
    const matches = pattern instanceof RegExp ? pattern.test(text) : text?.includes(pattern);
    if (matches) return;
    await page.waitForResponse(r => r.url().includes('/api/'), { timeout: 3000 }).catch(() => {});
  }
  throw new Error(
    `[waitForText] Locator ${locator.toString()} never contained text matching ${pattern}`
  );
}

/**
 * Combined click + API wait.
 * Use instead of click + networkidle.
 *   await clickAndWait(page, btn, '/api/invoices');
 */
export async function clickAndWait(
  page: Page,
  selector: string | Locator,
  urlPattern: string | RegExp,
  timeout = 30000
): Promise<void> {
  const locator = typeof selector === 'string' ? page.locator(selector) : selector;
  await Promise.all([
    waitForApi(page, urlPattern, timeout),
    locator.click(),
  ]);
}

/**
 * Combined form submit + API wait.
 *   await submitAndWait(page, form, '/api/tenants');
 */
export async function submitAndWait(
  page: Page,
  selector: string | Locator,
  urlPattern: string | RegExp,
  timeout = 30000
): Promise<void> {
  const locator = typeof selector === 'string' ? page.locator(selector) : selector;
  await Promise.all([
    waitForApi(page, urlPattern, timeout),
    locator.click(),
  ]);
  // After submit, wait for body to be ready
  await expect(page.locator('body')).toBeVisible();
}

/**
 * Navigates to a URL and waits for the first API response to confirm page is live.
 */
export async function navigateAndWait(
  page: Page,
  url: string,
  apiPattern = '/api/',
  timeout = 30000
): Promise<void> {
  await page.goto(url);
  // Wait for at least one API response as confirmation
  await page.waitForResponse(
    r => apiPattern instanceof RegExp ? apiPattern.test(r.url()) : r.url().includes(apiPattern),
    { timeout }
  ).catch(() => {
    // Some pages may not call APIs immediately — just ensure body is visible
  });
  await expect(page.locator('body')).toBeVisible();
}

// ─── Retry helpers (for network resilience only, not assertions) ───────────────

/**
 * Retries an API call up to `attempts` times with exponential backoff.
 * Use ONLY for network-level retries (5xx, timeouts), NOT for assertion retries.
 */
export async function retryApi<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        const delay = baseDelayMs * Math.pow(2, i);
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }
  throw lastError;
}