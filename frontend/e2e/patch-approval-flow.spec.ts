import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

test.describe('Patch Approval Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('patch review shows diff with before and after', async ({ page }) => {
    // Navigate to patch review via analysis
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);
    await page.click('[data-testid="generate-patch"]');
    await page.waitForTimeout(300);

    // Diff panel should be visible
    const diffPanel = page.locator('.diff-panel');
    await expect(diffPanel).toBeVisible();

    // Should show removed line (orange_led)
    const removedLine = page.locator('.diff-line.removed');
    await expect(removedLine).toBeVisible();
    await expect(removedLine).toContainText('orange_led');

    // Should show added line (green_led)
    const addedLine = page.locator('.diff-line.added');
    await expect(addedLine).toBeVisible();
    await expect(addedLine).toContainText('green_led');

    // Diff summary should show change count
    const diffSummary = page.locator('.diff-summary');
    await expect(diffSummary).toBeVisible();
    await expect(diffSummary).toContainText('1 file changed');
  });

  test('patch review shows agent reasoning and evidence', async ({ page }) => {
    // Navigate to patch review
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);
    await page.click('[data-testid="generate-patch"]');
    await page.waitForTimeout(300);

    // Reasoning panel should be visible
    const reasoningPanel = page.locator('.reasoning-panel');
    await expect(reasoningPanel).toBeVisible();

    // Should show causal path
    const reasonPath = page.locator('.reason-path');
    await expect(reasonPath).toBeVisible();
    await expect(reasonPath).toContainText('IRQ 28');
    await expect(reasonPath).toContainText('timer_isr');
    await expect(reasonPath).toContainText('GPIO 13');
    await expect(reasonPath).toContainText('GPIO 12');

    // Should show evidence-backed proposal
    const assurance = page.locator('.agent-assurance');
    await expect(assurance).toBeVisible();
    await expect(assurance).toContainText('Evidence-backed proposal');
  });

  test('patch review shows risk level and metadata', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);
    await page.click('[data-testid="generate-patch"]');
    await page.waitForTimeout(300);

    const reasonList = page.locator('.reason-list');
    await expect(reasonList).toBeVisible();

    // Should show risk level
    await expect(reasonList).toContainText('Risk level');
    await expect(reasonList).toContainText('Low');

    // Should show files changed
    await expect(reasonList).toContainText('Files changed');
    await expect(reasonList).toContainText('src/main.c');

    // Should show tests affected
    await expect(reasonList).toContainText('Tests affected');
    await expect(reasonList).toContainText('green_led_should_turn_on');
  });

  test('user can reject a patch', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);
    await page.click('[data-testid="generate-patch"]');
    await page.waitForTimeout(300);

    // Reject button should be visible
    const rejectButton = page.locator('.approval-bar button:has-text("Reject")');
    await expect(rejectButton).toBeVisible();

    // Click reject
    await rejectButton.click();
    await page.waitForTimeout(300);

    // Should navigate back to analysis
    await expect(page.locator('.analysis-page')).toBeVisible();
  });

  test('user can approve a patch and see confirmation modal', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);
    await page.click('[data-testid="generate-patch"]');
    await page.waitForTimeout(300);

    // Approve button should be visible
    const approveButton = page.locator('[data-testid="approve-patch"]');
    await expect(approveButton).toBeVisible();
    await expect(approveButton).toContainText('Approve and rerun');

    // Click approve
    await approveButton.click();
    await page.waitForTimeout(200);

    // Confirmation modal should appear
    const modal = page.locator('.confirm-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Apply patch and rerun?');

    // Modal should show summary
    await expect(modal).toContainText('1 line changed');
    await expect(modal).toContainText('Same test inputs');
  });

  test('confirmation modal shows rerun details', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);
    await page.click('[data-testid="generate-patch"]');
    await page.waitForTimeout(300);
    await page.click('[data-testid="approve-patch"]');
    await page.waitForTimeout(200);

    const modal = page.locator('.confirm-modal');

    // Should mention what will happen
    await expect(modal).toContainText('src/main.c');
    await expect(modal).toContainText('rebuild');
    await expect(modal).toContainText('rerun');

    // Should have preserve comparison checkbox
    const checkbox = modal.locator('input[type="checkbox"]');
    await expect(checkbox).toBeVisible();

    // Should have cancel and confirm buttons
    const cancelButton = modal.locator('button:has-text("Cancel")');
    const confirmButton = page.locator('[data-testid="confirm-rerun"]');
    await expect(cancelButton).toBeVisible();
    await expect(confirmButton).toBeVisible();
    await expect(confirmButton).toContainText('Apply patch & rerun');
  });

  test('after approval, system triggers rerun and shows success', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);
    await page.click('[data-testid="generate-patch"]');
    await page.waitForTimeout(300);
    await page.click('[data-testid="approve-patch"]');
    await page.waitForTimeout(200);

    // Confirm the rerun
    await page.click('[data-testid="confirm-rerun"]');
    await page.waitForTimeout(300);

    // Should navigate to success view
    await expect(page.locator('.success-page')).toBeVisible();

    // Breadcrumb should reflect completion
    await expect(page.locator('.breadcrumb span').first()).toContainText('Run complete');
  });

  test('user can cancel approval modal and stay on patch review', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);
    await page.click('[data-testid="generate-patch"]');
    await page.waitForTimeout(300);
    await page.click('[data-testid="approve-patch"]');
    await page.waitForTimeout(200);

    // Click cancel in modal
    const modal = page.locator('.confirm-modal');
    await modal.locator('button:has-text("Cancel")').click();
    await page.waitForTimeout(200);

    // Modal should close, still on patch page
    await expect(modal).not.toBeVisible();
    await expect(page.locator('.patch-page')).toBeVisible();
  });

  test('user can edit a patch inline', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);
    await page.click('[data-testid="generate-patch"]');
    await page.waitForTimeout(300);

    // Edit patch button should be visible
    const editButton = page.locator('.approval-bar button:has-text("Edit patch")');
    await expect(editButton).toBeVisible();

    // Click edit
    await editButton.click();
    await page.waitForTimeout(200);

    // Added line should now have an input field
    const editInput = page.locator('.diff-line.added input');
    await expect(editInput).toBeVisible();

    // Button text should change to "Save edit"
    await expect(editButton).toContainText('Save edit');
  });

  test('approval bar shows agent status', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);
    await page.click('[data-testid="generate-patch"]');
    await page.waitForTimeout(300);

    const approvalBar = page.locator('.approval-bar');
    await expect(approvalBar).toBeVisible();

    // Should show agent readiness message
    await expect(approvalBar).toContainText('Ready to apply and rerun');
    await expect(approvalBar).toContainText('TraceLoop will rebuild the ELF');
  });

  test('patch page header shows approval required badge', async ({ page }) => {
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);
    await page.click('[data-testid="generate-patch"]');
    await page.waitForTimeout(300);

    // Page heading should show approval badge
    const heading = page.locator('.patch-page .page-heading');
    await expect(heading).toContainText('Review evidence-backed patch');
    await expect(heading).toContainText('Approval required');
  });

  test('success view shows corrected execution path', async ({ page }) => {
    // Navigate through full flow to success
    await page.click('[data-testid="nav-history"]');
    await page.click('text=RUN-1042');
    await page.waitForTimeout(300);
    await page.click('[data-testid="generate-patch"]');
    await page.waitForTimeout(300);
    await page.click('[data-testid="approve-patch"]');
    await page.waitForTimeout(200);
    await page.click('[data-testid="confirm-rerun"]');
    await page.waitForTimeout(300);

    // Success page should show corrected path
    const successCausal = page.locator('.success-causal');
    await expect(successCausal).toBeVisible();
    await expect(successCausal).toContainText('GPIO pin 12 written');
    await expect(successCausal).toContainText('corrected');
    await expect(successCausal).toContainText('Green LED on');

    // Should show pass metrics
    const scoreRing = page.locator('.score-ring');
    await expect(scoreRing).toContainText('4/4');
  });
});
