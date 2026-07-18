import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('sidebar navigation buttons have accessible labels', async ({ page }) => {
    const navButtons = page.locator('.sidebar nav button');
    const count = await navButtons.count();
    expect(count).toBeGreaterThan(0);

    // Each button should have visible text content
    for (let i = 0; i < count; i++) {
      const text = await navButtons.nth(i).textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    }
  });

  test('notification button has aria-label', async ({ page }) => {
    const notificationButton = page.locator('[aria-label="Notifications"]');
    await expect(notificationButton).toBeVisible();
  });

  test('menu button has aria-label', async ({ page }) => {
    const menuButton = page.locator('[aria-label="Open navigation"]');
    await expect(menuButton).toBeVisible();
  });

  test('trace event dots have aria-labels', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);

    const eventDots = page.locator('.event-dot');
    const count = await eventDots.count();
    expect(count).toBeGreaterThan(0);

    // Each event dot should have an aria-label
    for (let i = 0; i < count; i++) {
      const ariaLabel = await eventDots.nth(i).getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel!.length).toBeGreaterThan(0);
    }
  });

  test('scrubber controls have aria-labels', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);

    await expect(page.locator('[aria-label="Previous event"]')).toBeVisible();
    await expect(page.locator('[aria-label="Next event"]')).toBeVisible();
    await expect(page.locator('[aria-label="Play trace"]')).toBeVisible();
    await expect(page.locator('[aria-label="Trace time"]')).toBeVisible();
  });

  test('debug tabs use tablist role', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);

    const tablist = page.locator('[role="tablist"]');
    await expect(tablist).toBeVisible();

    // Tabs should be buttons within the tablist
    const tabs = tablist.locator('button');
    await expect(tabs).toHaveCount(3);
  });

  test('agent input textarea has aria-label', async ({ page }) => {
    await page.click('[data-testid="nav-agent"]');
    await page.waitForTimeout(200);

    const textarea = page.locator('.agent-input textarea');
    await expect(textarea).toHaveAttribute('aria-label', 'Message agent');
  });

  test('search inputs have aria-labels', async ({ page }) => {
    // Run history search
    await page.click('[data-testid="nav-history"]');
    await page.waitForTimeout(200);

    await expect(page.locator('[aria-label="Search runs"]')).toBeVisible();
    await expect(page.locator('[aria-label="Status filter"]')).toBeVisible();
    await expect(page.locator('[aria-label="Board filter"]')).toBeVisible();
    await expect(page.locator('[aria-label="Branch filter"]')).toBeVisible();
  });

  test('trace search input has aria-label', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);

    await expect(page.locator('[aria-label="Search trace events"]')).toBeVisible();
  });

  test('board search input has aria-label', async ({ page }) => {
    await page.click('[data-testid="nav-dashboard"]');
    await page.click('[data-testid="new-project"]');
    await page.waitForTimeout(200);

    await expect(page.locator('[aria-label="Search boards"]')).toBeVisible();
  });

  test('keyboard navigation works through interactive elements', async ({ page }) => {
    // Navigate to history
    await page.click('[data-testid="nav-history"]');
    await page.waitForTimeout(200);

    // Tab through elements
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    // Something should be focused
    const focused = page.locator(':focus');
    const isFocused = await focused.count();
    expect(isFocused).toBeGreaterThan(0);
  });

  test('focus moves to visible element when tabbing', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.waitForTimeout(200);

    // Tab several times and verify focus stays in visible area
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(50);
    }

    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('confirmation modal has proper dialog role', async ({ page }) => {
    // Navigate to patch review
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);
    await page.click('[data-testid="generate-patch"]');
    await page.waitForTimeout(300);
    await page.click('[data-testid="approve-patch"]');
    await page.waitForTimeout(200);

    // Modal should have dialog role and aria-modal
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await expect(modal).toHaveAttribute('aria-label', 'Confirm agent change');
  });

  test('status icons have aria-hidden for decorative content', async ({ page }) => {
    await page.click('[data-testid="nav-dashboard"]');
    await page.waitForTimeout(200);

    // Status icons should be aria-hidden (decorative)
    const statusIcons = page.locator('.status-icon');
    const count = await statusIcons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const ariaHidden = await statusIcons.nth(i).getAttribute('aria-hidden');
      expect(ariaHidden).toBe('true');
    }
  });

  test('logo has accessible aria-label', async ({ page }) => {
    const logo = page.locator('[aria-label="TraceLoop"]');
    await expect(logo).toBeVisible();
  });

  test('FSM task ID input has associated label', async ({ page }) => {
    await page.click('[data-testid="nav-fsm"]');
    await page.waitForTimeout(200);

    const label = page.locator('label[for="taskId"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText('Task ID');

    // Input should be linked to label
    const input = page.locator('#taskId');
    await expect(input).toBeVisible();
  });

  test('scenario form inputs have aria-labels', async ({ page }) => {
    // Navigate to step 4 of wizard
    await page.click('[data-testid="nav-dashboard"]');
    await page.click('[data-testid="new-project"]');
    await page.waitForTimeout(200);
    await page.locator('.board-card').first().click();
    await page.click('[data-testid="wizard-next"]');
    await page.waitForTimeout(200);
    await page.click('[data-testid="wizard-next"]');
    await page.waitForTimeout(200);
    await page.click('[data-testid="wizard-next"]');
    await page.waitForTimeout(200);

    // Scenario form inputs should have aria-labels
    await expect(page.locator('[aria-label="Input time"]')).toBeVisible();
    await expect(page.locator('[aria-label="GPIO input"]')).toBeVisible();
    await expect(page.locator('[aria-label="GPIO value"]')).toBeVisible();
    await expect(page.locator('[aria-label="Assertion subject"]')).toBeVisible();
    await expect(page.locator('[aria-label="Assertion condition"]')).toBeVisible();
    await expect(page.locator('[aria-label="Assertion time"]')).toBeVisible();
  });

  test('patch review diff has accessible structure', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);
    await page.click('[data-testid="generate-patch"]');
    await page.waitForTimeout(300);

    // Diff panel should have proper heading
    const diffPanel = page.locator('.diff-panel');
    await expect(diffPanel).toBeVisible();

    // Added and removed lines should be distinguishable by class
    const addedLines = page.locator('.diff-line.added');
    const removedLines = page.locator('.diff-line.removed');
    await expect(addedLines).toHaveCount(1);
    await expect(removedLines).toHaveCount(1);
  });

  test('close button on wizard has aria-label', async ({ page }) => {
    await page.click('[data-testid="nav-dashboard"]');
    await page.click('[data-testid="new-project"]');
    await page.waitForTimeout(200);

    const closeButton = page.locator('[aria-label="Close project setup"]');
    await expect(closeButton).toBeVisible();
  });

  test('comparison time slider has aria-label', async ({ page }) => {
    // Navigate to comparison view
    await page.click('[data-testid="nav-dashboard"]');
    await page.waitForTimeout(200);
    await page.click('[data-testid="open-failed-run"]');
    await page.waitForTimeout(300);

    // Navigate to compare view
    await page.locator('.run-topbar button:has-text("Compare run")').click();
    await page.waitForTimeout(300);

    const timeSlider = page.locator('[aria-label="Comparison time"]');
    await expect(timeSlider).toBeVisible();
  });

  test('navigation backdrop has aria-label', async ({ page }) => {
    // Open mobile nav
    await page.locator('[aria-label="Open navigation"]').click();
    await page.waitForTimeout(200);

    // Backdrop should have aria-label
    const backdrop = page.locator('[aria-label="Close navigation"]');
    await expect(backdrop).toBeVisible();
  });

  test('platform search has aria-label', async ({ page }) => {
    await page.click('[data-testid="nav-platforms"]');
    await page.waitForTimeout(200);

    await expect(page.locator('[aria-label="Search platform library"]')).toBeVisible();
  });

  test('wizard close button is keyboard accessible', async ({ page }) => {
    await page.click('[data-testid="nav-dashboard"]');
    await page.click('[data-testid="new-project"]');
    await page.waitForTimeout(200);

    const closeButton = page.locator('[aria-label="Close project setup"]');
    await closeButton.focus();
    await expect(closeButton).toBeFocused();

    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Should return to dashboard
    await expect(page.locator('.dashboard-page')).toBeVisible();
  });
});
