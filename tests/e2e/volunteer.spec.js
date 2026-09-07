import { test, expect } from '@playwright/test';

test.describe('Volunteer Page (/volunteer)', () => {
    test('renders volunteer dashboard and toggles online status', async ({ page }) => {
        await page.goto('/volunteer');

        // Check header and initial offline state
        await expect(page.getByText('อาสาสมัคร', { exact: true })).toBeVisible();
        await expect(page.getByRole('status').getByText('ออฟไลน์')).toBeVisible();
        await expect(page.getByRole('heading', { name: /เริ่มเป็นอาสาสมัคร/i })).toBeVisible();

        const toggleBtn = page.getByRole('button', { name: /เปิดรับสาย/i });
        await expect(toggleBtn).toBeVisible();

        // Click to go online
        await toggleBtn.click();
        await expect(page.getByRole('status').getByText('ออนไลน์')).toBeVisible();
        await expect(page.getByRole('heading', { name: /พร้อมช่วยเหลือ/i })).toBeVisible();

        // Click to go offline
        const offlineBtn = page.getByRole('button', { name: /หยุดรับสาย/i });
        await offlineBtn.click();
        await expect(page.getByRole('status').getByText('ออฟไลน์')).toBeVisible();
        await expect(page.getByRole('heading', { name: /เริ่มเป็นอาสาสมัคร/i })).toBeVisible();
    });

    test('renders dashboard KPI metrics and guidance cards', async ({ page }) => {
        await page.goto('/volunteer');

        // Dashboard KPI widgets
        await expect(page.getByText('อาสาสมัครออนไลน์', { exact: true })).toBeVisible();
        await expect(page.getByText('สถานะของคุณ', { exact: true })).toBeVisible();
        await expect(page.getByText('ความพร้อมของระบบ', { exact: true })).toBeVisible();

        // How assistance works guidance cards
        await expect(page.getByRole('heading', { name: /การช่วยเหลือทำงานอย่างไร/i })).toBeVisible();
        await expect(page.getByRole('heading', { name: /1\. เปิดรับสาย/i })).toBeVisible();
        await expect(page.getByRole('heading', { name: /2\. รับคำขอ/i })).toBeVisible();
        await expect(page.getByRole('heading', { name: /3\. ดูภาพและพูดแนะนำ/i })).toBeVisible();
    });

    test('allows vertical scrolling on mobile viewport', async ({ page }) => {
        // Set mobile viewport (iPhone SE dimensions)
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/volunteer');

        // Verify scrollable container exists and has vertical scroll capability
        const scrollContainer = page.locator('.overflow-y-auto');
        await expect(scrollContainer).toBeVisible();

        const isScrollable = await scrollContainer.evaluate((el) => {
            return el.scrollHeight > el.clientHeight;
        });
        expect(isScrollable).toBe(true);

        // Capture top screenshot
        await page.screenshot({
            path: 'C:/Users/ADMIN/.gemini/antigravity-cli/brain/551ba6cd-571f-4f28-8517-d1b053b41b90/volunteer_mobile_top_natural.png'
        });

        // Scroll down to the bottom
        await scrollContainer.evaluate((el) => {
            el.scrollTop = el.scrollHeight;
        });

        // Verify bottom elements are visible when scrolled
        await expect(page.getByText('NYETA', { exact: true })).toBeVisible();
        await expect(page.getByText('เปิดเสียงแจ้งเตือนไว้เสมอ')).toBeVisible();

        // Capture scrolled screenshot
        await page.screenshot({
            path: 'C:/Users/ADMIN/.gemini/antigravity-cli/brain/551ba6cd-571f-4f28-8517-d1b053b41b90/volunteer_mobile_scrolled_natural.png'
        });
    });

    test('ensures dark theme-color and background to eliminate mobile white borders', async ({ page }) => {
        await page.goto('/volunteer');

        const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content');
        expect(themeColor).toBe('#090909');

        const bodyBg = await page.evaluate(() => {
            return window.getComputedStyle(document.body).backgroundColor;
        });
        // rgb(9, 9, 9) corresponds to #090909
        expect(bodyBg).toBe('rgb(9, 9, 9)');

        await page.screenshot({
            path: 'C:/Users/ADMIN/.gemini/antigravity-cli/brain/551ba6cd-571f-4f28-8517-d1b053b41b90/volunteer_fullscreen_dark.png'
        });
    });
});
