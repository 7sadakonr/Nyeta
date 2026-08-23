import { test, expect } from '@playwright/test';

test.describe('Nyeta entry screen', () => {
    test('routes each primary role to its dedicated entry point', async ({ page }) => {
        await page.goto('/');

        await expect(page.getByRole('heading', { name: 'Nyeta' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Blind' })).toHaveAttribute('href', '/blind/select');
        await expect(page.getByRole('link', { name: 'Volunteer' })).toHaveAttribute('href', '/volunteer');
        const app = page.locator('main');
        await expect(app.getByRole('link')).toHaveCount(2);
        await expect(app.getByRole('button')).toHaveCount(0);
    });
});
