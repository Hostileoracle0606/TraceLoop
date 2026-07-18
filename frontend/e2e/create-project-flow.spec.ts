import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

test.describe('Create Project Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('user can navigate to dashboard and see New Project button', async ({ page }) => {
    await page.click('[data-testid="nav-dashboard"]');
    await page.waitForTimeout(200);

    const newProjectButton = page.locator('[data-testid="new-project"]');
    await expect(newProjectButton).toBeVisible();
    await expect(newProjectButton).toContainText('New firmware project');
  });

  test('clicking New Project opens the create wizard', async ({ page }) => {
    await page.click('[data-testid="nav-dashboard"]');
    await page.click('[data-testid="new-project"]');
    await page.waitForTimeout(200);

    // Wizard heading should be visible
    await expect(page.locator('.wizard-page')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Create firmware project');

    // Step 1 should be active
    await expect(page.locator('.wizard-steps button.active')).toContainText('Choose board');
  });

  test('wizard shows board selection step with STM32F4 Discovery', async ({ page }) => {
    await page.click('[data-testid="nav-dashboard"]');
    await page.click('[data-testid="new-project"]');
    await page.waitForTimeout(200);

    // Board cards should be visible
    const boardCards = page.locator('.board-card');
    await expect(boardCards).toHaveCount(3);

    // STM32F4 Discovery should be available
    const stm32Board = page.locator('.board-card', { hasText: 'STM32F4 Discovery' });
    await expect(stm32Board).toBeVisible();
    await expect(stm32Board).toContainText('STM32F407VG');
    await expect(stm32Board).toContainText('ARM Cortex-M4F');
  });

  test('user can select a board and proceed to next step', async ({ page }) => {
    await page.click('[data-testid="nav-dashboard"]');
    await page.click('[data-testid="new-project"]');
    await page.waitForTimeout(200);

    // Select nRF52840 DK board
    const nrfBoard = page.locator('.board-card', { hasText: 'nRF52840 DK' });
    await nrfBoard.click();
    await page.waitForTimeout(100);
    await expect(nrfBoard).toHaveClass(/selected/);

    // Click next
    await page.click('[data-testid="wizard-next"]');
    await page.waitForTimeout(200);

    // Step 2 should now be active
    await expect(page.locator('.wizard-steps button.active')).toContainText('Firmware source');
  });

  test('firmware source step shows multiple source options', async ({ page }) => {
    await page.click('[data-testid="nav-dashboard"]');
    await page.click('[data-testid="new-project"]');
    await page.waitForTimeout(200);

    // Select board and proceed
    await page.locator('.board-card').first().click();
    await page.click('[data-testid="wizard-next"]');
    await page.waitForTimeout(200);

    // Source options should be visible
    const sourceOptions = page.locator('.source-option');
    await expect(sourceOptions).toHaveCount(5);

    // Default selection should be "Generate new firmware with AI"
    const defaultSource = page.locator('.source-option.selected');
    await expect(defaultSource).toContainText('Generate new firmware with AI');
  });

  test('user can navigate through all wizard steps', async ({ page }) => {
    await page.click('[data-testid="nav-dashboard"]');
    await page.click('[data-testid="new-project"]');
    await page.waitForTimeout(200);

    // Step 1: Choose board
    await expect(page.locator('.wizard-steps button.active')).toContainText('Choose board');
    await page.locator('.board-card').first().click();
    await page.click('[data-testid="wizard-next"]');
    await page.waitForTimeout(200);

    // Step 2: Firmware source
    await expect(page.locator('.wizard-steps button.active')).toContainText('Firmware source');
    await page.click('[data-testid="wizard-next"]');
    await page.waitForTimeout(200);

    // Step 3: Objective
    await expect(page.locator('.wizard-steps button.active')).toContainText('Objective');
    await page.click('[data-testid="wizard-next"]');
    await page.waitForTimeout(200);

    // Step 4: Test scenario
    await expect(page.locator('.wizard-steps button.active')).toContainText('Test scenario');
    await page.click('[data-testid="wizard-next"]');
    await page.waitForTimeout(200);

    // Step 5: Review & launch
    await expect(page.locator('.wizard-steps button.active')).toContainText('Review & launch');
  });

  test('review step shows project configuration summary', async ({ page }) => {
    // Navigate to step 5
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
    await page.click('[data-testid="wizard-next"]');
    await page.waitForTimeout(200);

    // Review grid should show configuration
    const reviewPanels = page.locator('.review-grid .panel');
    await expect(reviewPanels).toHaveCount(2);

    // Project configuration panel
    const configPanel = reviewPanels.first();
    await expect(configPanel).toContainText('Board platform');
    await expect(configPanel).toContainText('STM32F4 Discovery');
    await expect(configPanel).toContainText('Firmware source');

    // Test & permissions panel
    const testPanel = reviewPanels.nth(1);
    await expect(testPanel).toContainText('Simulation duration');
    await expect(testPanel).toContainText('Agent permissions');
  });

  test('user can go back to previous wizard steps', async ({ page }) => {
    await page.click('[data-testid="nav-dashboard"]');
    await page.click('[data-testid="new-project"]');
    await page.waitForTimeout(200);

    // Go to step 2
    await page.locator('.board-card').first().click();
    await page.click('[data-testid="wizard-next"]');
    await page.waitForTimeout(200);
    await expect(page.locator('.wizard-steps button.active')).toContainText('Firmware source');

    // Go back
    await page.click('button:has-text("← Back")');
    await page.waitForTimeout(200);
    await expect(page.locator('.wizard-steps button.active')).toContainText('Choose board');
  });

  test('completed wizard steps are marked as done', async ({ page }) => {
    await page.click('[data-testid="nav-dashboard"]');
    await page.click('[data-testid="new-project"]');
    await page.waitForTimeout(200);

    // Go to step 2
    await page.locator('.board-card').first().click();
    await page.click('[data-testid="wizard-next"]');
    await page.waitForTimeout(200);

    // Step 1 should be marked as done
    const doneStep = page.locator('.wizard-steps button.done');
    await expect(doneStep).toContainText('Choose board');
    await expect(doneStep).toContainText('✓');
  });

  test('submitting the wizard navigates to agent workspace', async ({ page }) => {
    // Navigate through all steps
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
    await page.click('[data-testid="wizard-next"]');
    await page.waitForTimeout(200);

    // Step 5 should show launch button
    const launchButton = page.locator('[data-testid="launch-agent"]');
    await expect(launchButton).toBeVisible();
    await expect(launchButton).toContainText('Generate and run firmware');

    // Click launch
    await launchButton.click();
    await page.waitForTimeout(300);

    // Should navigate to agent workspace
    await expect(page.locator('.agent-page')).toBeVisible();
  });

  test('wizard cancel returns to dashboard', async ({ page }) => {
    await page.click('[data-testid="nav-dashboard"]');
    await page.click('[data-testid="new-project"]');
    await page.waitForTimeout(200);

    // Click Cancel on step 1
    await page.click('button:has-text("Cancel")');
    await page.waitForTimeout(200);

    // Should be back on dashboard
    await expect(page.locator('.dashboard-page')).toBeVisible();
  });

  test('wizard step indicator shows current step number', async ({ page }) => {
    await page.click('[data-testid="nav-dashboard"]');
    await page.click('[data-testid="new-project"]');
    await page.waitForTimeout(200);

    // Footer should show "Step 1 of 5"
    await expect(page.locator('.wizard-footer')).toContainText('Step 1 of 5');

    // Navigate to step 3
    await page.locator('.board-card').first().click();
    await page.click('[data-testid="wizard-next"]');
    await page.waitForTimeout(200);
    await page.click('[data-testid="wizard-next"]');
    await page.waitForTimeout(200);

    await expect(page.locator('.wizard-footer')).toContainText('Step 3 of 5');
  });

  test('test scenario step shows timeline preview', async ({ page }) => {
    // Navigate to step 4
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

    // Scenario timeline panel should be visible
    const scenarioPreview = page.locator('.scenario-preview');
    await expect(scenarioPreview).toBeVisible();
    await expect(scenarioPreview).toContainText('Scenario timeline');

    // Timeline lanes should be present
    const lanes = page.locator('.scenario-lane');
    await expect(lanes).toHaveCount(3);
  });

  test('board search field is accessible', async ({ page }) => {
    await page.click('[data-testid="nav-dashboard"]');
    await page.click('[data-testid="new-project"]');
    await page.waitForTimeout(200);

    const searchInput = page.locator('input[aria-label="Search boards"]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('STM32');
    await expect(searchInput).toHaveValue('STM32');
  });
});
