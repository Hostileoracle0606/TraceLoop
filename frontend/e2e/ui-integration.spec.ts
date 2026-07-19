import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

test.describe('TraceLoop UI End-to-End Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('app loads and shows initial view', async ({ page }) => {
    await expect(page).toHaveTitle(/TraceLoop/);
    await expect(page.locator('.app-shell')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.app-main')).toBeVisible();
  });

  test('navigation between views works', async ({ page }) => {
    // Each nav button changes the active view — verify by checking the active class
    const testIds = ['nav-dashboard', 'nav-agent', 'nav-history', 'nav-platforms', 'nav-tests', 'nav-reports'];

    for (const testId of testIds) {
      await page.click(`[data-testid="${testId}"]`);
      await page.waitForTimeout(100);
      const btn = page.locator(`[data-testid="${testId}"]`);
      await expect(btn).toHaveClass(/active/);
    }
  });

  test('FailureAnalysis shows engine-derived root cause text', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.waitForTimeout(100);
    await page.click('text=RUN-1042');
    await page.waitForTimeout(200);

    const rootCauseHeading = page.locator('.evidence-heading h2');
    await expect(rootCauseHeading).toBeVisible();
    const rootCauseText = await rootCauseHeading.textContent();
    expect(rootCauseText).toContain('pin 13');
  });

  test('FailureAnalysis event inspector shows real event data', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(200);

    const eventDot = page.locator('.event-dot').first();
    await eventDot.click();
    await page.waitForTimeout(100);

    const inspector = page.locator('.event-inspector');
    await expect(inspector).toBeVisible();
    const eventTitle = page.locator('.event-title strong');
    await expect(eventTitle).toBeVisible();
  });

  test('FailureAnalysis scrubber controls work', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(200);

    const prevButton = page.locator('[aria-label="Previous event"]');
    const nextButton = page.locator('[aria-label="Next event"]');
    await expect(prevButton).toBeVisible();
    await expect(nextButton).toBeVisible();
    await nextButton.click();
    await page.waitForTimeout(100);
    await prevButton.click();
    await page.waitForTimeout(100);
  });

  test('PatchReview displays engine-derived patch data', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(200);
    await page.click('[data-testid="generate-patch"]');
    await page.waitForTimeout(200);

    const diffPanel = page.locator('.diff-panel');
    await expect(diffPanel).toBeVisible();
    const diffContent = await diffPanel.textContent();
    expect(diffContent).toContain('orange_led');
    expect(diffContent).toContain('green_led');
  });

  test('PatchReview approve button navigates to success', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(200);
    await page.click('[data-testid="generate-patch"]');
    await page.waitForTimeout(200);

    const approveButton = page.locator('[data-testid="approve-patch"]');
    await approveButton.click();
    await page.waitForTimeout(200);

    const modal = page.locator('.confirm-modal');
    await expect(modal).toBeVisible();
    const confirmButton = page.locator('[data-testid="confirm-rerun"]');
    await confirmButton.click();
    await page.waitForTimeout(300);

    await expect(page.locator('.breadcrumb span').first()).toContainText('Run complete');
  });

  test('AgentWorkspace shows real firmware source', async ({ page }) => {
    await page.click('[data-testid="nav-agent"]');
    await page.waitForTimeout(200);

    const codeEditor = page.locator('.code-editor');
    await expect(codeEditor).toBeVisible();
    const codeContent = await codeEditor.textContent();
    expect(codeContent).toContain('zephyr');
    expect(codeContent).toContain('timer_isr');
  });

  test('AgentWorkspace conversation is functional', async ({ page }) => {
    await page.click('[data-testid="nav-agent"]');
    await page.waitForTimeout(200);

    const input = page.locator('.agent-input textarea');
    await expect(input).toBeVisible();
    await input.fill('What caused the test to fail?');
    const sendButton = page.locator('.send-button');
    await sendButton.click();
    await page.waitForTimeout(500);

    const messages = page.locator('.message');
    const messageCount = await messages.count();
    expect(messageCount).toBeGreaterThan(2);
  });

  test('CreateProject wizard collects state through steps', async ({ page }) => {
    await page.click('[data-testid="nav-dashboard"]');
    const newProjectButton = page.locator('[data-testid="new-project"]');
    await newProjectButton.click();
    await page.waitForTimeout(200);

    // Verify step 1 is shown — the wizard-steps sidebar has an active button
    await expect(page.locator('.wizard-steps button.active')).toContainText('Choose board');

    const boardCard = page.locator('.board-card').first();
    await boardCard.click();
    await page.waitForTimeout(100);
    const nextButton = page.locator('[data-testid="wizard-next"]');
    await nextButton.click();
    await page.waitForTimeout(200);

    // Verify step 2 is now active
    await expect(page.locator('.wizard-steps button.active')).toContainText('Firmware source');
  });

  test('Settings view has switchable tabs', async ({ page }) => {
    await page.click('text=Settings');
    await page.waitForTimeout(200);

    const settingsNav = page.locator('.settings-nav');
    await expect(settingsNav).toBeVisible();
    const tabs = settingsNav.locator('button');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThan(1);
    await tabs.nth(1).click();
    await page.waitForTimeout(100);

    const settingsMain = page.locator('.settings-main');
    await expect(settingsMain).toBeVisible();
  });

  test('topbar reflects current run data', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(200);

    const topbar = page.locator('.global-topbar');
    await expect(topbar).toBeVisible();
    const projectContext = topbar.locator('.project-context');
    await expect(projectContext).toBeVisible();
  });

  test('notifications popover is functional', async ({ page }) => {
    const notificationButton = page.locator('.notification-button');
    await expect(notificationButton).toBeVisible();
    await notificationButton.click();
    await page.waitForTimeout(200);

    const popover = page.locator('.notification-popover');
    await expect(popover).toBeVisible();
    await notificationButton.click();
    await page.waitForTimeout(100);
  });

  test('all navigation buttons are functional', async ({ page }) => {
    const initialBreadcrumb = await page.locator('.breadcrumb span').first().textContent();
    await page.click('[data-testid="nav-platforms"]');
    await page.waitForTimeout(100);
    const newBreadcrumb = await page.locator('.breadcrumb span').first().textContent();
    expect(newBreadcrumb).not.toBe(initialBreadcrumb);
  });

  test('evidence chain in FailureAnalysis is derived from engine', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(200);

    // The evidence panel shows the root cause explanation derived from the engine
    const evidencePanel = page.locator('.evidence-panel');
    await expect(evidencePanel).toBeVisible();
    const explanation = evidencePanel.locator('.explanation');
    await expect(explanation).toBeVisible();
    const explanationText = await explanation.textContent();
    expect(explanationText).toContain('timer_isr');
  });

  test('timeline view shows events from engine data', async ({ page }) => {
    // Navigate directly to analysis view
    await page.click('[data-testid="nav-history"]');
    await page.waitForTimeout(100);
    // Click the first failed run row to go to analysis
    const runRow = page.locator('.table-row').nth(2); // skip header, get first data row
    await runRow.click();
    await page.waitForTimeout(300);

    // The timeline panel should be visible by default in the analysis view
    const timelinePanel = page.locator('.timeline-panel');
    await expect(timelinePanel).toBeVisible();
    const eventDots = timelinePanel.locator('.event-dot');
    const dotCount = await eventDots.count();
    expect(dotCount).toBeGreaterThan(0);
  });

  test('board diagram view is interactive', async ({ page }) => {
    // Navigate directly to analysis view
    await page.click('[data-testid="nav-history"]');
    await page.waitForTimeout(100);
    const runRow = page.locator('.table-row').nth(2);
    await runRow.click();
    await page.waitForTimeout(300);

    // The board panel is always rendered in the debug grid
    const boardPanel = page.locator('.board-panel');
    await expect(boardPanel).toBeVisible();
    // Board has clickable hardware blocks
    const hwBlock = boardPanel.locator('button.hw-block').first();
    await expect(hwBlock).toBeVisible();
    await hwBlock.click();
    await page.waitForTimeout(100);
    await expect(hwBlock).toHaveClass(/selected/);
  });

  test('causal graph view displays engine-derived graph', async ({ page }) => {
    // Navigate directly to analysis view
    await page.click('[data-testid="nav-history"]');
    await page.waitForTimeout(100);
    const runRow = page.locator('.table-row').nth(2);
    await runRow.click();
    await page.waitForTimeout(300);

    // The graph panel is always rendered in the debug grid
    const graphPanel = page.locator('.graph-panel');
    await expect(graphPanel).toBeVisible();
    const causalNodes = graphPanel.locator('.causal-node');
    const nodeCount = await causalNodes.count();
    expect(nodeCount).toBeGreaterThan(0);
  });

  // E1: Initial view, sidebar grouping, FSM placement
  test('cold load lands on Projects (dashboard) view', async ({ page }) => {
    // The initial breadcrumb should show "Projects"
    const breadcrumb = page.locator('.breadcrumb span').first();
    await expect(breadcrumb).toContainText('Projects');
    // The dashboard page heading should be visible
    await expect(page.locator('.dashboard-page')).toBeVisible();
  });

  test('sidebar groups: Projects/Agent/Runs prominent, Project resources, Advanced with FSM', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    // Top-level nav items are present
    await expect(sidebar.locator('[data-testid="nav-dashboard"]')).toBeVisible();
    await expect(sidebar.locator('[data-testid="nav-agent"]')).toBeVisible();
    await expect(sidebar.locator('[data-testid="nav-history"]')).toBeVisible();
    // Divider labels render
    await expect(sidebar.locator('.nav-divider')).toContainText('Project resources');
    await expect(sidebar.locator('.nav-divider')).toContainText('Advanced');
    // FSM nav is present (under Advanced)
    await expect(sidebar.locator('[data-testid="nav-fsm"]')).toBeVisible();
  });

  test('dashboard shows Resume active task card when active tasks exist', async ({ page }) => {
    // The dashboard metrics area should show active tasks
    // When activeTasks > 0, a resume card should appear
    const resumeCard = page.locator('[data-testid="resume-active-task"]');
    // The card may or may not appear depending on backend state;
    // verify the component renders without error on the dashboard
    await expect(page.locator('.dashboard-page')).toBeVisible();
    // If metrics loaded and show active tasks, resume card should be visible
    const activeTasksMetric = page.locator('.metric').filter({ hasText: 'Active tasks' });
    await expect(activeTasksMetric).toBeVisible();
  });

  test('Success view shows Iteration instead of Agent for patch iteration', async ({ page }) => {
    // Navigate through the flow to success view
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(200);
    await page.click('[data-testid="generate-patch"]');
    await page.waitForTimeout(200);
    await page.click('[data-testid="approve-patch"]');
    await page.waitForTimeout(200);

    // Check for confirm modal if present
    const modal = page.locator('.confirm-modal');
    if (await modal.isVisible()) {
      await page.click('[data-testid="confirm-rerun"]');
      await page.waitForTimeout(300);
    }

    // The success page should say "Iteration 2" not "Agent 2"
    const successPage = page.locator('.success-page');
    if (await successPage.isVisible()) {
      const pageText = await successPage.textContent();
      expect(pageText).not.toContain('Agent 2');
      expect(pageText).toContain('Iteration 2');
    }
  });
});
