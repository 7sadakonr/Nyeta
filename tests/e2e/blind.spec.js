import { test, expect } from '@playwright/test';

test.describe('Blind Assistance shell', () => {
    test('switches assistant modes from root bottom navigation', async ({ page }) => {
        await page.goto('/');
        const shell = page.getByTestId('blind-assistant-shell');
        await expect(shell).toBeVisible();
        const assistantTab = page.getByRole('button', { name: 'AI' });
        const currencyTab = page.getByRole('button', { name: /สแกนธนบัตร|เงิน/ });
        const readerTab = page.getByRole('button', { name: 'อ่าน' });

        await currencyTab.click();
        await expect(currencyTab).toHaveAttribute('aria-current', 'page');
        await expect(assistantTab).not.toHaveAttribute('aria-current', 'page');
        await readerTab.click();
        await expect(readerTab).toHaveAttribute('aria-current', 'page');
        await assistantTab.click();
        await expect(assistantTab).toHaveAttribute('aria-current', 'page');
    });

    test('keeps TTS-owned screens free of duplicate live regions', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByTestId('blind-assistant-shell').locator('[aria-live], [role="status"], [role="alert"]')).toHaveCount(0);

        await page.goto('/call');
        await expect(page).toHaveURL(/\?tab=volunteer$/);
        await expect(page.locator('main').locator('[aria-live], [role="status"], [role="alert"]')).toHaveCount(0);
        await expect(page.getByRole('button', { name: /เรียกอาสาสมัคร/i })).toBeVisible();
    });

    test('redirects legacy assistance routes to their shell destinations', async ({ page }) => {
        await page.goto('/blind');
        await expect(page).toHaveURL(/\/$/);
        await page.goto('/call');
        await expect(page).toHaveURL(/\?tab=volunteer$/);
    });
});
