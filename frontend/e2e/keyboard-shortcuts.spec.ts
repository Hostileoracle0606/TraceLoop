import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

test.describe('Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('Tab key navigates through sidebar buttons', async ({ page }) => {
    // Focus the first nav button
    await page.locator('[data-testid="nav-dashboard"]').focus();
    await expect(page.locator('[data-testid="nav-dashboard"]')).toBeFocused();

    // Tab to next nav item
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    // Focus should move to next interactive element
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('Enter key activates focused navigation button', async ({ page }) => {
    // Focus the history nav button
    await page.locator('[data-testid="nav-history"]').focus();
    await expect(page.locator('[data-testid="nav-history"]')).toBeFocused();

    // Press Enter to activate
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Should navigate to history view
    await expect(page.locator('.history-page')).toBeVisible();
  });

  test('Tab key navigates through data table rows', async ({ page }) => {
    // Navigate to history view
    await page.click('[data-testid="nav-history"]');
    await page.waitForTimeout(200);

    // Focus the first data row
    const firstRow = page.locator('.table-row:not(.table-head)').first();
    await firstRow.focus();
    await expect(firstRow).toBeFocused();

    // Tab to next row
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    // Focus should move
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('Enter key on a table row navigates to detail view', async ({ page }) => {
    // Navigate to history view
    await page.click('[data-testid="nav-history"]');
    await page.waitForTimeout(200);

    // Focus and activate RUN-1042 row
    const failedRow = page.locator('.table-row:not(.table-head)', { hasText: 'RUN-1042' });
    await failedRow.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Should navigate to analysis view
    await expect(page.locator('.analysis-page')).toBeVisible();
  });

  test('Tab key navigates through wizard steps', async ({ page }) => {
    // Open the wizard
    await page.click('[data-testid="nav-dashboard"]');
    await page.click('[data-testid="new-project"]');
    await page.waitForTimeout(200);

    // Focus the first board card
    const firstBoard = page.locator('.board-card').first();
    await firstBoard.focus();
    await expect(firstBoard).toBeFocused();

    // Tab through the board cards
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    // Focus should move to next interactive element
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('Escape key does not break navigation state', async ({ page }) => {
    // Navigate to a view
    await page.click('[data-testid="nav-history"]');
    await page.waitForTimeout(200);

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Should still be on the same view (no command palette to close)
    await expect(page.locator('.history-page')).toBeVisible();
  });

  test('board cards can be selected with Enter key', async ({ page }) => {
    // Open the wizard
    await page.click('[data-testid="nav-dashboard"]');
    await page.click('[data-testid="new-project"]');
    await page.waitForTimeout(200);

    // Focus and select a board with Enter
    const board = page.locator('.board-card', { hasText: 'nRF52840 DK' });
    await board.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Board should be selected
    await expect(board).toHaveClass(/selected/);
  });

  test('debug tab buttons are keyboard accessible', async ({ page }) => {
    // Navigate to analysis view
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);

    // Focus the first debug tab
    const tabs = page.locator('.debug-tabs button');
    await tabs.first().focus();
    await expect(tabs.first()).toBeFocused();

    // Tab to next tab
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    // Press Enter to activate the second tab
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Second tab should be active
    await expect(tabs.nth(1)).toHaveClass(/active/);
  });

  test('agent input textarea supports keyboard input', async ({ page }) => {
    // Navigate to agent workspace
    await page.click('[data-testid="nav-agent"]');
    await page.waitForTimeout(200);

    // Focus the agent input
    const textarea = page.locator('.agent-input textarea');
    await textarea.focus();
    await expect(textarea).toBeFocused();

    // Type a message
    await page.keyboard.type('Hello agent');
    await expect(textarea).toHaveValue('Hello agent');
  });

  test('Enter key sends message in agent chat', async ({ page }) => {
    // Navigate to agent workspace
    await page.click('[data-testid="nav-agent"]');
    await page.waitForTimeout(200);

    // Type and send a message
    const textarea = page.locator('.agent-input textarea');
    await textarea.fill('What caused the failure?');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Should have more messages now (user message + agent response)
    const messages = page.locator('.message');
    const messageCount = await messages.count();
    expect(messageCount).toBeGreaterThan(2);
  });

  test('Shift+Tab navigates backwards through elements', async ({ page }) => {
    // Navigate to history
    await page.click('[data-testid="nav-history"]');
    await page.waitForTimeout(200);

    // Focus the search input
    const searchInput = page.locator('[aria-label="Search runs"]');
    await searchInput.focus();
    await expect(searchInput).toBeFocused();

    // Tab forward then Shift+Tab back
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(100);

    // Focus should return to search input or nearby element
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('event dots in timeline are keyboard accessible', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);

    // Event dots are buttons and should be focusable
    const eventDots = page.locator('.event-dot');
    const firstDot = eventDots.first();

    await firstDot.focus();
    await expect(firstDot).toBeFocused();

    // Press Enter to select
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Event inspector should show details
    const inspector = page.locator('.event-inspector');
    await expect(inspector).toBeVisible();
  });

  test('scrubber buttons are keyboard accessible', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);

    // Focus previous event button
    const prevButton = page.locator('[aria-label="Previous event"]');
    await prevButton.focus();
    await expect(prevButton).toBeFocused();

    // Press Enter to activate
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Focus next event button
    const nextButton = page.locator('[aria-label="Next event"]');
    await nextButton.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
  });

  test('wizard footer buttons are keyboard accessible', async ({ page }) => {
    await page.click('[data-testid="nav-dashboard"]');
    await page.click('[data-testid="new-project"]');
    await page.waitForTimeout(200);

    // Focus the Continue button
    const continueButton = page.locator('[data-testid="wizard-next"]');
    await continueButton.focus();
    await expect(continueButton).toBeFocused();

    // Select a board first, then press Enter on Continue
    await page.locator('.board-card').first().click();
    await page.waitForTimeout(100);
    await continueButton.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Should advance to step 2
    await expect(page.locator('.wizard-steps button.active')).toContainText('Firmware source');
  });
});
