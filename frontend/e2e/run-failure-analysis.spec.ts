import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

test.describe('Run Failure Analysis', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('user can navigate to run history', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.waitForTimeout(200);

    await expect(page.locator('.history-page')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Simulation runs');
  });

  test('run history shows table with run data', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.waitForTimeout(200);

    // Table header should be visible
    const tableHead = page.locator('.table-head');
    await expect(tableHead).toBeVisible();
    await expect(tableHead).toContainText('Run ID');
    await expect(tableHead).toContainText('Status');
    await expect(tableHead).toContainText('Root cause');

    // Should have data rows
    const dataRows = page.locator('.table-row:not(.table-head)');
    const rowCount = await dataRows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('user can click on a failed run to view analysis', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.waitForTimeout(200);

    // Click on RUN-1042 (failed run)
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);

    // Analysis view should be visible
    await expect(page.locator('.analysis-page')).toBeVisible();
  });

  test('analysis view shows root cause evidence', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);

    // Evidence panel should be visible
    const evidencePanel = page.locator('.evidence-panel');
    await expect(evidencePanel).toBeVisible();

    // Root cause heading should mention pin 13
    const rootCauseHeading = page.locator('.evidence-heading h2');
    await expect(rootCauseHeading).toBeVisible();
    const rootCauseText = await rootCauseHeading.textContent();
    expect(rootCauseText).toContain('pin 13');

    // Explanation should mention timer_isr
    const explanation = page.locator('.explanation');
    await expect(explanation).toBeVisible();
    const explanationText = await explanation.textContent();
    expect(explanationText).toContain('timer_isr');
  });

  test('user can switch between timeline, board, and causal graph views', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);

    // Debug tabs should be visible
    const debugTabs = page.locator('.debug-tabs button');
    await expect(debugTabs).toHaveCount(3);

    // Timeline tab should be active by default
    await expect(debugTabs.nth(0)).toHaveClass(/active/);
    await expect(debugTabs.nth(0)).toContainText('Timeline');

    // Switch to board view
    await debugTabs.nth(1).click();
    await page.waitForTimeout(200);
    await expect(debugTabs.nth(1)).toHaveClass(/active/);
    await expect(debugTabs.nth(1)).toContainText('Virtual board');

    // Switch to causal graph view
    await debugTabs.nth(2).click();
    await page.waitForTimeout(200);
    await expect(debugTabs.nth(2)).toHaveClass(/active/);
    await expect(debugTabs.nth(2)).toContainText('Causal graph');
  });

  test('timeline view shows signal lanes with events', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);

    // Timeline panel should be visible
    const timelinePanel = page.locator('.timeline-panel');
    await expect(timelinePanel).toBeVisible();

    // Should have multiple lanes
    const lanes = page.locator('.timeline-lane');
    const laneCount = await lanes.count();
    expect(laneCount).toBeGreaterThan(5);

    // Event dots should be present
    const eventDots = page.locator('.event-dot');
    const dotCount = await eventDots.count();
    expect(dotCount).toBeGreaterThan(0);
  });

  test('user can inspect individual events in timeline', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);

    // Click on an event dot
    const eventDot = page.locator('.event-dot').first();
    await eventDot.click();
    await page.waitForTimeout(200);

    // Event inspector should show details
    const inspector = page.locator('.event-inspector');
    await expect(inspector).toBeVisible();

    // Inspector should show event details
    const eventTitle = page.locator('.event-title strong');
    await expect(eventTitle).toBeVisible();

    // Should show timestamp, source, register, value fields
    const eventFields = page.locator('.event-field');
    const fieldCount = await eventFields.count();
    expect(fieldCount).toBeGreaterThanOrEqual(4);
  });

  test('user can see causal chain explanation', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);

    // Evidence chain should be visible
    const evidenceRow = page.locator('.evidence-row');
    await expect(evidenceRow).toBeVisible();

    // Evidence chain text should mention the causal path
    const evidenceChain = page.locator('.evidence-row strong').first();
    await expect(evidenceChain).toContainText('Evidence chain');

    // Chain should include event references
    const chainSpan = page.locator('.evidence-row > div > span').first();
    const chainText = await chainSpan.textContent();
    expect(chainText).toContain('Timer 2');
    expect(chainText).toContain('IRQ 28');
  });

  test('causal graph view displays nodes and edges', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);

    // Graph panel should be visible (always rendered in debug grid)
    const graphPanel = page.locator('.graph-panel');
    await expect(graphPanel).toBeVisible();

    // Causal nodes should be present
    const causalNodes = page.locator('.causal-node');
    const nodeCount = await causalNodes.count();
    expect(nodeCount).toBeGreaterThan(0);

    // Nodes should have event labels
    const firstNode = causalNodes.first();
    await expect(firstNode).toBeVisible();
  });

  test('board diagram view shows hardware blocks', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);

    // Board panel should be visible
    const boardPanel = page.locator('.board-panel');
    await expect(boardPanel).toBeVisible();

    // Hardware blocks should be clickable
    const hwBlocks = page.locator('button.hw-block');
    const blockCount = await hwBlocks.count();
    expect(blockCount).toBeGreaterThan(0);

    // Click a hardware block to select it
    const timerBlock = boardPanel.locator('button.hw-block.timer');
    await timerBlock.click();
    await page.waitForTimeout(100);
    await expect(timerBlock).toHaveClass(/selected/);
  });

  test('user can click Generate Patch to proceed to patch review', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);

    // Generate patch button should be visible
    const generatePatch = page.locator('[data-testid="generate-patch"]');
    await expect(generatePatch).toBeVisible();
    await expect(generatePatch).toContainText('Generate patch');

    // Click it
    await generatePatch.click();
    await page.waitForTimeout(300);

    // Should navigate to patch review
    await expect(page.locator('.patch-page')).toBeVisible();
  });

  test('scrubber controls allow navigating between events', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);

    // Scrubber buttons should be visible
    const prevButton = page.locator('[aria-label="Previous event"]');
    const nextButton = page.locator('[aria-label="Next event"]');
    const playButton = page.locator('[aria-label="Play trace"]');

    await expect(prevButton).toBeVisible();
    await expect(nextButton).toBeVisible();
    await expect(playButton).toBeVisible();

    // Navigate forward and back
    await nextButton.click();
    await page.waitForTimeout(100);
    await prevButton.click();
    await page.waitForTimeout(100);
  });

  test('trace sidebar shows filter groups', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);

    // Sidebar should have trace groups
    const traceGroups = page.locator('.trace-group');
    const groupCount = await traceGroups.count();
    expect(groupCount).toBeGreaterThan(0);

    // Should show test assertions group
    const assertionGroup = page.locator('.trace-group', { hasText: 'Test assertions' });
    await expect(assertionGroup).toBeVisible();

    // Should show components group
    const componentGroup = page.locator('.trace-group', { hasText: 'Components' });
    await expect(componentGroup).toBeVisible();
  });

  test('run topbar shows run metadata', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);

    // Run topbar should be visible
    const topbar = page.locator('.run-topbar');
    await expect(topbar).toBeVisible();

    // Should show run identity
    const runIdentity = page.locator('.run-identity');
    await expect(runIdentity).toContainText('RUN-1042');
    await expect(runIdentity).toContainText('Failed');

    // Should show metadata
    const runMeta = page.locator('.run-meta');
    await expect(runMeta).toContainText('STM32F4 Discovery');
    await expect(runMeta).toContainText('1,284');
  });

  test('clicking event references in evidence chain selects that event', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);

    // Click on [e2] reference in evidence chain
    const e2Button = page.locator('.evidence-row button:has-text("[e2]")');
    await e2Button.click();
    await page.waitForTimeout(200);

    // Event inspector should update to show e2
    const eventTitle = page.locator('.event-title');
    await expect(eventTitle).toBeVisible();
  });

  test('run history can be filtered by status', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.waitForTimeout(200);

    // Filter by Failed status
    const statusFilter = page.locator('[aria-label="Status filter"]');
    await statusFilter.selectOption('Failed');
    await page.waitForTimeout(200);

    // All visible rows should show Failed
    const visibleRows = page.locator('.table-row:not(.table-head)');
    const rowCount = await visibleRows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Each row should contain "Failed" badge
    for (let i = 0; i < rowCount; i++) {
      await expect(visibleRows.nth(i)).toContainText('Failed');
    }
  });
});
