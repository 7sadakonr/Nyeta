import { test, expect } from '@playwright/test';

test.describe('Nyeta blind app', () => {
    test('opens the blind shell with four bottom-navigation buttons', async ({ page }) => {
        await page.goto('/');

        const tabs = page.getByRole('navigation', { name: 'เมนูหลัก' });
        await expect(tabs).toBeVisible();
        await expect(tabs.getByRole('button', { name: 'AI' })).toHaveAttribute('aria-current', 'page');
        await expect(tabs.getByRole('button', { name: /สแกนธนบัตร|เงิน/ })).toBeVisible();
        await expect(tabs.getByRole('button', { name: 'อ่าน' })).toBeVisible();
        await expect(tabs.getByRole('button', { name: 'อาสา' })).toBeVisible();
    });
});
