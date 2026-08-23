import { test, expect } from '@playwright/test';

test.describe('Blind Assistance Page (/blind)', () => {
    test('renders main blind interface and switches modes', async ({ page }) => {
        await page.goto('/blind');

        // The blind shell deliberately does not add an extra landmark for VoiceOver.
        const shell = page.getByTestId('blind-assistant-shell');
        await expect(shell).toBeVisible();

        // Check mode switcher tabs
        const assistantTab = page.getByRole('tab', { name: 'ผู้ช่วย' });
        const currencyTab = page.getByRole('tab', { name: 'เงิน' });
        const readerTab = page.getByRole('tab', { name: 'เอกสาร' });

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
        await expect(page.getByTestId('blind-assistant-shell').locator('[aria-live], [role="status"], [role="alert"]')).toHaveCount(0);
        await expect(page.getByRole('tab', { name: 'ผู้ช่วย' })).toBeVisible();

        await page.goto('/call');
        await expect(page.locator('main').locator('[aria-live], [role="status"], [role="alert"]')).toHaveCount(0);
        await expect(page.getByRole('button', { name: /เรียกอาสาสมัคร/i })).toBeVisible();
    });

    test('returns to the Blind mode selection page from both assistance flows', async ({ page }) => {
        await page.goto('/blind');
        await expect(page.getByRole('link', { name: /กลับหน้าหลัก/i })).toHaveAttribute('href', '/blind/select');

        await page.goto('/call');
        await expect(page.getByRole('link', { name: /กลับหน้าหลัก/i })).toHaveAttribute('href', '/blind/select');
    });
});
