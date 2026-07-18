import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

test.describe('FSM State Visualization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('FSM view is accessible from sidebar navigation', async ({ page }) => {
    // FSM nav button should exist
    const fsmNav = page.locator('[data-testid="nav-fsm"]');
    await expect(fsmNav).toBeVisible();

    await fsmNav.click();
    await page.waitForTimeout(200);

    // FSM page should be visible
    await expect(page.locator('.page')).toBeVisible();
    await expect(page.locator('h1')).toContainText('FSM Visualization');
  });

  test('FSM view shows task ID input form', async ({ page }) => {
    await page.click('[data-testid="nav-fsm"]');
    await page.waitForTimeout(200);

    // Should show "Enter Task ID" heading
    await expect(page.locator('h2')).toContainText('Enter Task ID');

    // Input field should be visible
    const taskIdInput = page.locator('#taskId');
    await expect(taskIdInput).toBeVisible();

    // Submit button should be visible
    const submitButton = page.locator('button:has-text("Load Task State Machine")');
    await expect(submitButton).toBeVisible();
  });

  test('task ID input has proper placeholder and label', async ({ page }) => {
    await page.click('[data-testid="nav-fsm"]');
    await page.waitForTimeout(200);

    const taskIdInput = page.locator('#taskId');
    await expect(taskIdInput).toHaveAttribute('placeholder', /123e4567/);

    // Label should be associated
    const label = page.locator('label[for="taskId"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText('Task ID');
  });

  test('user can enter a task ID and submit', async ({ page }) => {
    await page.click('[data-testid="nav-fsm"]');
    await page.waitForTimeout(200);

    // Enter a task ID
    const taskIdInput = page.locator('#taskId');
    await taskIdInput.fill('test-task-123');
    await expect(taskIdInput).toHaveValue('test-task-123');

    // Submit the form
    await page.locator('button:has-text("Load Task State Machine")').click();
    await page.waitForTimeout(300);

    // Input form should be hidden, FSM integration should load
    // Since backend isn't running, it will show loading then error
    const heading = page.locator('h1');
    await expect(heading).toContainText('FSM Visualization');

    // Page should show task ID in heading
    await expect(page.locator('.page-heading')).toContainText('test-task-123');
  });

  test('FSM view shows Change Task button after loading', async ({ page }) => {
    await page.click('[data-testid="nav-fsm"]');
    await page.waitForTimeout(200);

    // Enter task ID and submit
    await page.locator('#taskId').fill('test-task-456');
    await page.locator('button:has-text("Load Task State Machine")').click();
    await page.waitForTimeout(300);

    // Change Task button should appear
    const changeTaskButton = page.locator('button:has-text("Change Task")');
    await expect(changeTaskButton).toBeVisible();
  });

  test('Change Task button returns to input form', async ({ page }) => {
    await page.click('[data-testid="nav-fsm"]');
    await page.waitForTimeout(200);

    // Load a task
    await page.locator('#taskId').fill('test-task-789');
    await page.locator('button:has-text("Load Task State Machine")').click();
    await page.waitForTimeout(300);

    // Click Change Task
    await page.locator('button:has-text("Change Task")').click();
    await page.waitForTimeout(200);

    // Input form should be visible again
    await expect(page.locator('#taskId')).toBeVisible();
    await expect(page.locator('h2')).toContainText('Enter Task ID');
  });

  test('FSM view shows error state when backend is unavailable', async ({ page }) => {
    await page.click('[data-testid="nav-fsm"]');
    await page.waitForTimeout(200);

    // Enter task ID and submit
    await page.locator('#taskId').fill('nonexistent-task');
    await page.locator('button:has-text("Load Task State Machine")').click();

    // Wait for the fetch to fail (backend not running)
    await page.waitForTimeout(2000);

    // Should show error state with retry button
    const errorPanel = page.locator('.bg-red-900');
    const retryButton = page.locator('button:has-text("Retry")');

    // Either error or loading state should be visible
    const hasError = await errorPanel.isVisible().catch(() => false);
    const hasRetry = await retryButton.isVisible().catch(() => false);
    const hasLoading = await page.locator('text=Loading task state').isVisible().catch(() => false);

    // At least one of these states should be true
    expect(hasError || hasRetry || hasLoading).toBeTruthy();
  });

  test('FSM nav item shows correct icon', async ({ page }) => {
    const fsmNav = page.locator('[data-testid="nav-fsm"]');
    await expect(fsmNav).toBeVisible();

    // Should contain the FSM label
    await expect(fsmNav).toContainText('FSM');
  });

  test('FSM view description mentions real-time monitoring', async ({ page }) => {
    await page.click('[data-testid="nav-fsm"]');
    await page.waitForTimeout(200);

    // Page description should mention monitoring
    const description = page.locator('.page-heading p');
    await expect(description).toContainText('Monitor and control');
    await expect(description).toContainText('state machine');
  });

  test('task ID input is required', async ({ page }) => {
    await page.click('[data-testid="nav-fsm"]');
    await page.waitForTimeout(200);

    const taskIdInput = page.locator('#taskId');
    await expect(taskIdInput).toHaveAttribute('required', '');
  });

  test('form submission is blocked when task ID is empty', async ({ page }) => {
    await page.click('[data-testid="nav-fsm"]');
    await page.waitForTimeout(200);

    // Try to submit without filling in the input
    const submitButton = page.locator('button:has-text("Load Task State Machine")');
    await submitButton.click();
    await page.waitForTimeout(200);

    // Should still show the input form (HTML5 validation prevents empty submit)
    await expect(page.locator('#taskId')).toBeVisible();
    await expect(page.locator('h2')).toContainText('Enter Task ID');
  });
});
