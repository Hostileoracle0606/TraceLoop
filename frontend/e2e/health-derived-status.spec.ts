import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

test.describe('D1 — Health-derived system status', () => {
  test('sidebar badge reads "Compute unavailable" when backend is down', async ({ page }) => {
    // Mock /api/health to simulate backend being unreachable
    await page.route('**/api/health', (route) => {
      route.abort('failed');
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // The sidebar status badge should NOT say "connected" or "Renode connected"
    const sidebarStatus = page.locator('.renode-status');
    await expect(sidebarStatus).toBeVisible();

    // The strong text inside should indicate unavailable, not connected
    const statusText = sidebarStatus.locator('strong');
    await expect(statusText).toContainText('Compute unavailable');

    // Should never contain "connected" when health fails
    const fullText = await sidebarStatus.textContent();
    expect(fullText?.toLowerCase()).not.toContain('connected');
  });

  test('sidebar badge reads "Simulator ready" when all health checks pass', async ({ page }) => {
    // Mock /api/health to return healthy
    await page.route('**/api/health', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          checks: { supabase: 'ok', inngest: 'ok' },
          timestamp: new Date().toISOString(),
        }),
      });
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const sidebarStatus = page.locator('.renode-status');
    await expect(sidebarStatus).toBeVisible();

    const statusText = sidebarStatus.locator('strong');
    await expect(statusText).toContainText('Simulator ready');
  });

  test('sidebar badge reads "Checking systems" while health is loading', async ({ page }) => {
    // Delay the health response to test loading state
    await page.route('**/api/health', async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          checks: { supabase: 'ok', inngest: 'ok' },
          timestamp: new Date().toISOString(),
        }),
      });
    });

    await page.goto(BASE_URL);
    // Don't wait for networkidle — we want to catch the loading state

    // The sidebar should show "Checking systems" initially
    const sidebarStatus = page.locator('.renode-status');
    const statusText = sidebarStatus.locator('strong');
    await expect(statusText).toContainText('Checking systems');
  });

  test('sidebar shows per-dependency status in popover/tooltip', async ({ page }) => {
    await page.route('**/api/health', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'degraded',
          checks: { supabase: 'error', inngest: 'ok' },
          timestamp: new Date().toISOString(),
        }),
      });
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // The sidebar status should show degraded state
    const sidebarStatus = page.locator('.renode-status');
    const statusText = sidebarStatus.locator('strong');
    await expect(statusText).toContainText('Compute unavailable');

    // The tooltip/title should contain per-dependency info
    const title = await sidebarStatus.getAttribute('title');
    expect(title).toBeTruthy();
    expect(title?.toLowerCase()).toContain('supabase');
    expect(title?.toLowerCase()).toContain('inngest');
  });

  test('Settings never shows "All core systems ready" when health is degraded', async ({ page }) => {
    await page.route('**/api/health', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'degraded',
          checks: { supabase: 'error', inngest: 'ok' },
          timestamp: new Date().toISOString(),
        }),
      });
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Navigate to Settings
    await page.click('[data-testid="nav-settings"]');
    await page.waitForTimeout(200);

    // Should NOT show "All core systems ready"
    const settingsPage = page.locator('.settings-page');
    await expect(settingsPage).toBeVisible();
    const settingsText = await settingsPage.textContent();
    expect(settingsText).not.toContain('All core systems ready');
  });

  test('Settings shows "All core systems ready" only when every check passes', async ({ page }) => {
    await page.route('**/api/health', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          checks: { supabase: 'ok', inngest: 'ok' },
          timestamp: new Date().toISOString(),
        }),
      });
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    await page.click('[data-testid="nav-settings"]');
    await page.waitForTimeout(200);

    // Should show "All core systems ready" only when all checks pass
    const settingsPage = page.locator('.settings-page');
    await expect(settingsPage).toBeVisible();
    await expect(settingsPage).toContainText('All core systems ready');
  });

  test('Settings integration rows reflect health status', async ({ page }) => {
    await page.route('**/api/health', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'degraded',
          checks: { supabase: 'error', inngest: 'ok' },
          timestamp: new Date().toISOString(),
        }),
      });
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    await page.click('[data-testid="nav-settings"]');
    await page.waitForTimeout(200);

    // Integration rows should not all show "Connected" / "Ready" when health is degraded
    const integrationRows = page.locator('.integration-row');
    const rowCount = await integrationRows.count();
    expect(rowCount).toBeGreaterThan(0);

    // At least one row should show an error/unavailable state
    const allBadges = integrationRows.locator('.badge');
    const badgeCount = await allBadges.count();
    let hasNonGreen = false;
    for (let i = 0; i < badgeCount; i++) {
      const badge = allBadges.nth(i);
      const classes = await badge.getAttribute('class');
      if (!classes?.includes('badge-green')) {
        hasNonGreen = true;
        break;
      }
    }
    expect(hasNonGreen).toBe(true);
  });
});
