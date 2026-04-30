import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Page } from '@playwright/test';

/**
 * Seeds the Beanconqueror @ionic/storage IndexedDB with deterministic fixtures
 * BEFORE the Angular app boots.
 *
 * Approach: `seedStorage()` first navigates to a same-origin static asset
 * (so no Angular bundle loads), then writes the fixtures into IndexedDB via
 * `page.evaluate(async ...)`. By awaiting that promise we guarantee the data
 * is committed before the test navigates to the real route under test, which
 * eliminates the race between our seed transaction and LocalForage's first
 * `getItem` call.
 *
 * Storage layout:
 *   - DB name:   `__baristaDB`        (configured in src/main.ts)
 *   - DB store:  `_ionickv`           (default @ionic/storage object store)
 *   - Keys:      'BEANS', 'BREWS', 'MILL', 'PREPARATION', 'SETTINGS'
 *               (see src/services/ui*Storage.ts → super('NAME'))
 *
 * Each value is stored as the parsed object — Ionic Storage / LocalForage
 * handle serialization internally.
 */

const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

function readFixture(name: string): unknown {
  const raw = readFileSync(join(FIXTURES_DIR, name), 'utf-8');
  return JSON.parse(raw);
}

export interface SeedData {
  BEANS: unknown[];
  BREWS: unknown[];
  MILL: unknown[];
  PREPARATION: unknown[];
  /**
   * Settings entries. Must be seeded with `welcome_page_showed: true` (and
   * `matomo_analytics: true`, etc.) so the first-launch welcome popover and
   * the analytics-consent popover do not obscure every page during the
   * snapshot run. Without this key, `UISettingsStorage` writes default
   * settings on boot and `app.component.ts → __checkWelcomePage()` presents
   * the full-screen welcome modal — which is what every page would end up
   * looking like.
   */
  SETTINGS: unknown[];
  /**
   * Version entries. Must be seeded so that:
   *   - `updatedDataVersions` contains every `UPDATE_n` from
   *     `uiUpdate.ts`, otherwise `__checkUpdate()` runs the data-version
   *     migrations on boot. In particular `UPDATE_8` resets
   *     `settings.matomo_analytics = undefined`, which then triggers the
   *     analytics-consent popover regardless of what we seeded into
   *     SETTINGS.
   *   - `alreadyDisplayedVersions` contains the current app version
   *     (returned from `Version.getUpdatedVersions()`) so the
   *     `UpdatePopoverComponent` "what's new" modal is not shown.
   */
  VERSION: unknown[];
}

export function loadSeedData(): SeedData {
  return {
    BEANS: readFixture('beans.json') as unknown[],
    BREWS: readFixture('brews.json') as unknown[],
    MILL: readFixture('mills.json') as unknown[],
    PREPARATION: readFixture('preparations.json') as unknown[],
    SETTINGS: readFixture('settings.json') as unknown[],
    VERSION: readFixture('version.json') as unknown[],
  };
}

/** Path to a same-origin static asset that does NOT bootstrap the Angular app.
 *  Visiting this first establishes the dev-server origin so we can write to
 *  IndexedDB before navigating to the actual route under test. `en.json` is
 *  always present because it is required by `provideTranslateHttpLoader`. */
const STATIC_ORIGIN_STUB = '/assets/i18n/en.json';

/** 2024-01-15T12:00:00 UTC — fixed "now" so brew "x days ago" labels remain
 *  stable regardless of when the suite runs. */
const FROZEN_NOW = Date.UTC(2024, 0, 15, 12, 0, 0);

/**
 * Installs init scripts that freeze `Date` and disable CSS animations on every
 * navigation in the page. This must run before any app code, so it uses
 * `addInitScript`. Storage seeding is intentionally NOT done here — see
 * `seedStorage` below.
 */
export async function installInitScripts(page: Page): Promise<void> {
  await page.addInitScript((frozenNow: number) => {
    // --- Freeze "now" so any time-relative UI is stable. ---------------
    const RealDate = Date;
    const FixedDate = class extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(frozenNow);
          return;
        }
        super(...(args as ConstructorParameters<typeof RealDate>));
      }
      static now(): number {
        return frozenNow;
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Date = FixedDate as unknown as DateConstructor;

    // --- Disable animations/transitions globally. ----------------------
    const style = document.createElement('style');
    style.id = 'visual-regression-no-animations';
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `;
    const inject = () => {
      if (document.head && !document.getElementById(style.id)) {
        document.head.appendChild(style);
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inject, { once: true });
    } else {
      inject();
    }
  }, FROZEN_NOW);
}

/**
 * Seeds the Beanconqueror Ionic Storage IndexedDB with the given fixtures.
 *
 * This is done by navigating to a static asset on the same origin (so no
 * Angular bundle boots) and then awaiting an IndexedDB write inside the page
 * via `page.evaluate`. Doing it this way — instead of via `addInitScript` —
 * eliminates the race between our seed transaction and LocalForage's first
 * `getItem` call: by the time the test navigates to the real route, the data
 * is already committed.
 *
 * Critically, this also seeds the `SETTINGS` key with `welcome_page_showed:
 * true`, otherwise `app.component.ts → __checkWelcomePage()` will display the
 * full-screen welcome popover over every captured page.
 */
export async function seedStorage(page: Page, seed: SeedData): Promise<void> {
  // Establish the dev-server origin without booting the Angular app.
  const response = await page.goto(STATIC_ORIGIN_STUB, {
    waitUntil: 'domcontentloaded',
  });
  if (!response || !response.ok()) {
    throw new Error(
      `Failed to load static origin stub at ${STATIC_ORIGIN_STUB}: ` +
        `${response ? response.status() : 'no response'}`,
    );
  }

  await page.evaluate(
    async ({
      seedData,
      dbName,
      storeName,
    }: {
      seedData: Record<string, unknown>;
      dbName: string;
      storeName: string;
    }) => {
      // Open (and create if needed) the LocalForage object store, then write
      // every seed key in a single readwrite transaction.
      function openWithStore(version?: number): Promise<IDBDatabase> {
        return new Promise<IDBDatabase>((resolve, reject) => {
          const req =
            version === undefined
              ? indexedDB.open(dbName)
              : indexedDB.open(dbName, version);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(storeName)) {
              db.createObjectStore(storeName);
            }
          };
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result);
          req.onblocked = () => reject(new Error('IDB open blocked'));
        });
      }

      let db = await openWithStore();
      if (!db.objectStoreNames.contains(storeName)) {
        const currentVersion = db.version;
        db.close();
        db = await openWithStore(currentVersion + 1);
      }

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        for (const [key, value] of Object.entries(seedData)) {
          // Ionic Storage stores values as-is (LocalForage handles
          // serialization). Storing the parsed object is what the app
          // expects when calling `storage.get(key)`.
          store.put(value, key);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    {
      seedData: seed as unknown as Record<string, unknown>,
      dbName: '__baristaDB',
      storeName: '_ionickv',
    },
  );
}

/**
 * Waits for the app shell to be ready — Ionic content rendered and fonts
 * loaded.
 */
export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  // Wait for fonts to settle so glyphs are stable across runs.
  await page.evaluate(() => document.fonts?.ready);
  // Wait for at least one Ionic page element to attach.
  await page
    .locator('ion-app, ion-router-outlet, ion-content')
    .first()
    .waitFor({ state: 'attached', timeout: 30_000 })
    .catch(() => undefined);
  // Allow Angular change detection / lazy loaded chunks to settle.
  await page.waitForLoadState('networkidle').catch(() => undefined);
}
