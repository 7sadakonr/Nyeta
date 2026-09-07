import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: 'html',
    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://localhost:3000',
        ignoreHTTPSErrors: true,
        trace: 'on-first-retry',
        permissions: ['camera', 'microphone'],
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'npm run dev',
        url: 'https://localhost:3000',
        reuseExistingServer: true,
        ignoreHTTPSErrors: true,
        timeout: 120 * 1000,
    },
});
