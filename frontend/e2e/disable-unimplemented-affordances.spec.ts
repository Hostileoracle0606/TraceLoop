import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

test.describe('D2 — Disable/label unimplemented affordances', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('wizard step 2: Git/Upload/ELF options are disabled with "Not connected yet" reason', async ({ page }) => {
    await page.click('[data-testid="new-project"]');
    await page.waitForTimeout(200);

    const boardCard = page.locator('.board-card').first();
    await boardCard.click();
    await page.waitForTimeout(100);
    await page.click('[data-testid="wizard-next"]');
    await page.waitForTimeout(200);

    await expect(page.locator('.wizard-steps button.active')).toContainText('Firmware source');

    const gitOption = page.locator('.source-option', { hasText: 'Connect a Git repository' });
    await expect(gitOption).toBeVisible();
    await expect(gitOption).toBeDisabled();
    await expect(gitOption).toContainText('Not connected yet');

    const uploadOption = page.locator('.source-option', { hasText: 'Upload an existing project' });
    await expect(uploadOption).toBeVisible();
    await expect(uploadOption).toBeDisabled();
    await expect(uploadOption).toContainText('Not connected yet');

    const elfOption = page.locator('.source-option', { hasText: 'Upload a compiled ELF' });
    await expect(elfOption).toBeVisible();
    await expect(elfOption).toBeDisabled();
    await expect(elfOption).toContainText('Not connected yet');

    const aiOption = page.locator('.source-option', { hasText: 'Generate new firmware with AI' });
    await expect(aiOption).toBeEnabled();
  });

  test('Platforms page: Import custom Renode platform button is disabled with reason', async ({ page }) => {
    await page.click('[data-testid="nav-platforms"]');
    await page.waitForTimeout(200);

    const importButton = page.locator('button', { hasText: 'Import custom Renode platform' });
    await expect(importButton).toBeVisible();
    await expect(importButton).toBeDisabled();
    const title = await importButton.getAttribute('title');
    expect(title).toBeTruthy();
    expect(title!.toLowerCase()).toContain('not connected');
  });

  test('Project/Board/Branch selectors in topbar are non-interactive chips (not buttons)', async ({ page }) => {
    const projectContext = page.locator('.project-context');
    await expect(projectContext).toBeVisible();

    const buttons = projectContext.locator('button');
    const buttonCount = await buttons.count();
    expect(buttonCount).toBe(0);

    const chips = projectContext.locator('.context-chip, span, strong');
    const chipCount = await chips.count();
    expect(chipCount).toBeGreaterThan(0);

    const contextText = await projectContext.textContent();
    expect(contextText).toContain('Project');
    expect(contextText).toContain('Board');
    expect(contextText).toContain('Branch');
  });

  test('Settings Source control: GitHub is not shown as connected', async ({ page }) => {
    await page.click('[data-testid="nav-settings"]');
    await page.waitForTimeout(200);

    const sourceControlTab = page.locator('.settings-nav button', { hasText: 'Source control' });
    await sourceControlTab.click();
    await page.waitForTimeout(200);

    const githubRow = page.locator('.integration-row', { hasText: 'GitHub' });
    await expect(githubRow).toBeVisible();

    const greenBadges = githubRow.locator('.badge-green');
    const greenCount = await greenBadges.count();
    expect(greenCount).toBe(0);

    const githubText = await githubRow.textContent();
    expect(githubText).not.toContain('12 repositories');
  });

  test('disabled controls explain why with a title tooltip', async ({ page }) => {
    await page.click('[data-testid="nav-platforms"]');
    await page.waitForTimeout(200);

    const importButton = page.locator('button', { hasText: 'Import custom Renode platform' });
    await expect(importButton).toBeDisabled();
    const title = await importButton.getAttribute('title');
    expect(title).toBeTruthy();
  });
});
