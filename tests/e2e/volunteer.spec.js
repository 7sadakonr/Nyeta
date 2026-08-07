import { test, expect } from '@playwright/test';

test.describe('Volunteer Page (/volunteer)', () => {
    test('renders volunteer dashboard and toggles online status', async ({ page }) => {
        await page.goto('/volunteer');

        // Check header and initial offline state
        await expect(page.getByText('อาสาสมัคร')).toBeVisible();
        await expect(page.getByText('ออฟไลน์')).toBeVisible();

        const toggleBtn = page.getByRole('button', { name: /เปิดรับสาย/i });
        await expect(toggleBtn).toBeVisible();

        // Click to go online
        await toggleBtn.click();
        await expect(page.getByText('ออนไลน์')).toBeVisible();
        await expect(page.getByText('พร้อมรับสายช่วยเหลือ')).toBeVisible();

        // Click to go offline
        const offlineBtn = page.getByRole('button', { name: /ออฟไลน์/i });
        await offlineBtn.click();
        await expect(page.getByText('ออฟไลน์')).toBeVisible();
    });
});
