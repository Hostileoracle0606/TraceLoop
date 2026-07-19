import { expect, test, type Page } from '@playwright/test';

const healthy = {
  status: 'ok',
  checks: { supabase: 'ok', inngest: 'ok' },
  timestamp: '2026-07-19T00:00:00.000Z',
};

async function openDemo(page: Page, health = healthy) {
  await page.route('**/api/health', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(health),
  }));
  await page.goto('/?demo=1');
  await expect(page.locator('.workspace-shell')).toBeVisible();
}

test.describe('truthful modular workspace', () => {
  test('labels the sample and disables every unavailable authoring entry point', async ({ page }) => {
    await openDemo(page);

    await expect(page.locator('.demo-banner')).toHaveText(/Read-only sample/);
    await expect(page.locator('.conversation-header__title')).toContainText('Read-only sample project');

    const schematicImport = page.getByTestId('new-project');
    await expect(schematicImport).toBeDisabled();
    await expect(schematicImport).toContainText('Schematic import · later');
    await expect(schematicImport).toHaveAttribute('title', 'Schematic import is not connected yet');

    const composer = page.getByLabel('Describe your task');
    await expect(composer).toBeDisabled();
    await expect(composer).toHaveAttribute('placeholder', /Read-only sample/);
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Attachments are not connected yet/ })).toBeDisabled();
  });

  test('exposes the canvas only as an explicit read-only sample mode', async ({ page }) => {
    await openDemo(page);

    const sampleCanvas = page.getByRole('button', { name: /Sample canvas/ });
    await expect(sampleCanvas).toBeEnabled();
    await sampleCanvas.click();
    await expect(page.locator('.workbench-canvas')).toBeVisible();
    await expect(page.locator('.conversation-canvas--sidebar')).toBeVisible();
    await expect(page.locator('.workbench-header')).toContainText('vehicle_system.kicad_sch');
    await expect(page.locator('.partition-runtime')).toContainText('Renode · sample replay');
    await expect(page.getByText('Renode · live')).toHaveCount(0);

    await page.getByRole('button', { name: /^Chat$/ }).click();
    await expect(page.locator('.workbench-canvas')).toHaveCount(0);
    await expect(page.locator('.conversation-canvas')).toBeVisible();
  });

  test('shows sample failure evidence and patch without mutation controls', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: /Turn on green LED with Timer 2/ }).first().click();

    await expect(page.locator('.root-cause-card')).toContainText('Wrote the wrong GPIO pin');
    await expect(page.locator('.patch-card')).toContainText('Sample fix');
    await expect(page.locator('.patch-card')).toContainText('Read-only sample');
    await expect(page.getByRole('button', { name: /Approve & rerun/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Request changes/ })).toHaveCount(0);
  });

  test('derives the visible service status from the health endpoint', async ({ page }) => {
    await openDemo(page);
    await expect(page.locator('.topbar-runtime').first()).toContainText('Core services ready');
  });

  test('shows unavailable when a core health check is degraded', async ({ page }) => {
    await openDemo(page, {
      ...healthy,
      status: 'degraded',
      checks: { supabase: 'error', inngest: 'ok' },
    });
    await expect(page.locator('.topbar-runtime').first()).toContainText('Core services unavailable');
  });

  test('fits the fixed workspace shell at a desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDemo(page);

    const fit = await page.evaluate(() => {
      const shell = document.querySelector('.workspace-shell')!.getBoundingClientRect();
      return {
        shell: { top: shell.top, left: shell.left, right: shell.right, bottom: shell.bottom },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        verticalOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      };
    });

    expect(fit.horizontalOverflow).toBe(false);
    expect(fit.verticalOverflow).toBe(false);
    expect(fit.shell.left).toBeGreaterThanOrEqual(0);
    expect(fit.shell.top).toBeGreaterThanOrEqual(0);
    expect(fit.shell.right).toBeLessThanOrEqual(fit.viewport.width);
    expect(fit.shell.bottom).toBeLessThanOrEqual(fit.viewport.height);
  });

  test('keeps navigation and the primary conversation usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDemo(page);

    const openSidebar = page.getByRole('button', { name: 'Open sidebar' });
    await expect(openSidebar).toBeVisible();
    await openSidebar.click();
    await expect(page.locator('.workspace-sidebar')).toHaveClass(/is-open/);
    await page.keyboard.press('Escape');
    await expect(page.locator('.workspace-sidebar')).not.toHaveClass(/is-open/);
    await expect(page.locator('.conversation-composer-wrap')).toBeVisible();
  });
});
