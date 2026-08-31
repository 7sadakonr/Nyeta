import { test, expect } from '@playwright/test';

test.describe('Nyeta blind app', () => {
    test('opens the blind shell with four bottom-navigation tabs', async ({ page }) => {
        await page.goto('/');

        const tabs = page.getByRole('tablist', { name: 'เมนูหลักสำหรับผู้พิการทางสายตา' });
        await expect(tabs).toBeVisible();
        await expect(page.getByRole('tab', { name: 'AI' })).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('tab', { name: 'เงิน' })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'อ่าน' })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'อาสา' })).toBeVisible();
    });
});
