import { test, expect } from '@playwright/test';

test.describe('Blind Assistance Page (/blind)', () => {
    test('renders main blind interface and switches modes', async ({ page }) => {
        await page.goto('/blind');

        // Check main container and nav bar
        const main = page.locator('main');
        await expect(main).toBeVisible();

        // Check mode switcher buttons
        const assistantBtn = page.getByRole('button', { name: /ผู้ช่วย/i });
        const currencyBtn = page.getByRole('button', { name: /สกุลเงิน/i });
        const readerBtn = page.getByRole('button', { name: /อ่านเอกสาร/i });

        await expect(assistantBtn).toBeVisible();
        await expect(currencyBtn).toBeVisible();
        await expect(readerBtn).toBeVisible();

        // Switch to Currency mode
        await currencyBtn.click();
        await expect(page.getByRole('button', { name: /สกุลเงิน/i })).toHaveAttribute('aria-pressed', 'true');

        // Switch to Document Reader mode
        await readerBtn.click();
        await expect(page.getByRole('button', { name: /อ่านเอกสาร/i })).toHaveAttribute('aria-pressed', 'true');

        // Switch back to Assistant mode
        await assistantBtn.click();
        await expect(page.getByRole('button', { name: /ผู้ช่วย/i })).toHaveAttribute('aria-pressed', 'true');
    });
});
