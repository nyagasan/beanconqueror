import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Beanconqueror visual regression tests.
 *
 * - iPhone 13 (390x844) light mode only — see plan.
 * - Baselines are committed under `tests/visual/__screenshots__/` and used as
 *   the source of truth.
 * - The Angular dev server is started by `webServer` below; CI may also start
 *   the server externally and set `PLAYWRIGHT_BASE_URL` to skip this.
 */

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4200);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './specs',
  snapshotDir: './__screenshots__',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/visual/playwright-report', open: 'never' }],
  ],
  outputDir: 'tests/visual/test-results',
  timeout: 60_000,
  expect: {
    // Allow up to 1% of pixels to differ to keep the suite robust against
    // anti-aliasing / subpixel jitter while still catching real regressions.
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.01,
      scale: 'css',
    },
  },
  use: {
    baseURL: BASE_URL,
    ...devices['iPhone 13'],
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'iphone-13-light',
      use: {
        ...devices['iPhone 13'],
        colorScheme: 'light',
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // The `ci` configuration is defined in angular.json (`projects.app.architect.serve.configurations.ci`).
        // It currently inherits the default build target with `progress: false`.
        command: `pnpm exec ng serve --configuration=ci --port ${PORT} --host 127.0.0.1`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
