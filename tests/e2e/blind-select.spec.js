import { test, expect } from '@playwright/test';

test.describe('Blind mode selection page (/blind/select)', () => {
    test('offers AI assistance and volunteer calling as separate paths', async ({ page }) => {
        await page.goto('/blind/select');

        await expect(page.getByRole('heading', { name: 'Nyeta' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'AI' })).toHaveAttribute('href', '/blind');
        await expect(page.getByRole('link', { name: 'Volunteer Call' })).toHaveAttribute('href', '/call');
    });
});
