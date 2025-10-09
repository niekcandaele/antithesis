import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for tenant-aware CRUD E2E tests
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Run tests serially to avoid conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to avoid tenant conflicts
  reporter: 'html',
  timeout: 60000, // 60 second timeout per test
  use: {
    baseURL: process.env.PUBLIC_API_URL || 'http://127.0.0.1:13000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start dev server before running tests (if not already running)
  // Comment out if app is already running via docker compose
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://devbox:3000',
  //   reuseExistingServer: true,
  //   timeout: 120 * 1000,
  // },
});
