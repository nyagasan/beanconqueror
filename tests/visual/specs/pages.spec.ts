import { expect, test } from '@playwright/test';

import { VISUAL_ROUTES } from '../helpers/routes';
import {
  installInitScripts,
  loadSeedData,
  seedStorage,
  waitForAppReady,
} from '../helpers/seed-storage';

test.describe('Beanconqueror visual regression — iPhone 13 light', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Install Date freeze + animation disable for every navigation.
    await installInitScripts(page);
    // 2. Synchronously seed IndexedDB on the dev-server origin BEFORE
    //    navigating to the app, so the SETTINGS row (with
    //    welcome_page_showed: true) exists by the time UISettingsStorage
    //    reads it. Otherwise the welcome popover covers every page.
    await seedStorage(page, loadSeedData());
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
