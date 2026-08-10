import { test, expect } from '@playwright/test';

test.describe('Blind Assistance Page (/blind)', () => {
    test('renders main blind interface and switches modes', async ({ page }) => {
        await page.goto('/blind');

        // Check main container
        const main = page.locator('main');
        await expect(main).toBeVisible();

        // Check mode switcher tabs
        const assistantTab = page.getByRole('tab', { name: /โหมดผู้ช่วย/i });
        const currencyTab = page.getByRole('tab', { name: /โหมดดูสกุลเงิน/i });
        const readerTab = page.getByRole('tab', { name: /โหมดอ่านเอกสาร/i });

        await expect(assistantTab).toBeVisible();
        await expect(currencyTab).toBeVisible();
        await expect(readerTab).toBeVisible();

        // Initial mode should be assistant
        await expect(assistantTab).toHaveAttribute('aria-selected', 'true');

        // Switch to Currency mode
        await currencyTab.click();
        await expect(currencyTab).toHaveAttribute('aria-selected', 'true');
        await expect(assistantTab).toHaveAttribute('aria-selected', 'false');

        // Switch to Document Reader mode
        await readerTab.click();
        await expect(readerTab).toHaveAttribute('aria-selected', 'true');
        await expect(currencyTab).toHaveAttribute('aria-selected', 'false');

        // Switch back to Assistant mode
        await assistantTab.click();
        await expect(assistantTab).toHaveAttribute('aria-selected', 'true');
    });

    test('uses no live region for realtime TTS-owned updates', async ({ page }) => {
        await page.goto('/blind');
        await expect(page.locator('[aria-live], [role="status"], [role="alert"]')).toHaveCount(0);
        await expect(page.getByRole('tab', { name: /โหมดผู้ช่วย/i })).toBeVisible();

        await page.goto('/call');
        await expect(page.locator('[aria-live], [role="status"], [role="alert"]')).toHaveCount(0);
        await expect(page.getByRole('button', { name: /เรียกอาสาสมัคร/i })).toBeVisible();
    });
});
