import { test, expect } from '@playwright/test';

test.describe('Nyeta entry screen', () => {
    test('offers exactly the two primary app modes without a call shortcut', async ({ page }) => {
        await page.goto('/');

        await expect(page.getByRole('heading', { name: 'Nyeta' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'ผู้ช่วย AI' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'โหมดอาสาสมัคร' })).toHaveAttribute('href', '/volunteer');
        await expect(page.getByRole('button')).toHaveCount(1);
        await expect(page.getByRole('button', { name: /โทรหาอาสา/i })).toHaveCount(0);
    });
});
