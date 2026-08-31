import { test, expect } from '@playwright/test';

test.describe('Legacy blind selection route', () => {
    test('redirects to the blind app shell', async ({ page }) => {
        await page.goto('/blind/select');
        await expect(page).toHaveURL(/\/$/);
        await expect(page.getByRole('tab', { name: 'AI' })).toHaveAttribute('aria-selected', 'true');
    });
});
