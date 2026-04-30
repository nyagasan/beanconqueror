import { expect, test } from '@playwright/test';

import { VISUAL_ROUTES } from '../helpers/routes';
import {
  installSeedScripts,
  loadSeedData,
  waitForAppReady,
} from '../helpers/seed-storage';

test.describe('Beanconqueror visual regression — iPhone 13 light', () => {
  test.beforeEach(async ({ page }) => {
    await installSeedScripts(page, loadSeedData());
  });

  for (const route of VISUAL_ROUTES) {
    test(`screenshot: ${route.name} (${route.path})`, async ({ page }) => {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      if (route.settleMs) {
        await page.waitForTimeout(route.settleMs);
      }
      await expect(page).toHaveScreenshot(`${route.name}.png`, {
        fullPage: true,
      });
    });
  }
});
