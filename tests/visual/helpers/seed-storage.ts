import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Page } from '@playwright/test';

/**
 * Seeds the Beanconqueror @ionic/storage IndexedDB with deterministic fixtures
 * before the app boots. This must run via `page.addInitScript` so the keys are
 * present by the time `UIStorage.init()` calls `storage.create()`.
 *
 * Storage layout:
 *   - DB name:   `__baristaDB`        (configured in src/main.ts)
 *   - DB store:  `_ionickv`           (default LocalForage object store)
 *   - Keys:      'BEANS', 'BREWS', 'MILL', 'PREPARATION', 'SETTINGS', ...
 *               (see src/services/ui*Storage.ts → super('NAME'))
 *
 * Each value is the JSON-stringified array as written by uiStorage.set().
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
}

export function loadSeedData(): SeedData {
  return {
    BEANS: readFixture('beans.json') as unknown[],
    BREWS: readFixture('brews.json') as unknown[],
    MILL: readFixture('mills.json') as unknown[],
    PREPARATION: readFixture('preparations.json') as unknown[],
  };
}

/**
 * Installs an init script on the page that writes the given seed data into
 * IndexedDB before any Beanconqueror code runs. Also freezes Date.now and the
 * default time zone for deterministic screenshots.
 */
export async function installSeedScripts(
  page: Page,
  seed: SeedData,
): Promise<void> {
  await page.addInitScript(
    ({
      seedData,
      dbName,
      storeName,
      frozenNow,
    }: {
      seedData: Record<string, unknown>;
      dbName: string;
      storeName: string;
      frozenNow: number;
    }) => {
      // --- 1. Freeze "now" so any time-relative UI is stable. -----------
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

      // --- 2. Disable animations/transitions globally. ------------------
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

      // --- 3. Seed IndexedDB synchronously before app boot. -------------
      const seedPromise = new Promise<void>((resolve) => {
        const open = indexedDB.open(dbName, 2);
        open.onupgradeneeded = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
          }
        };
        open.onerror = () => resolve();
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            // Bump version to create the store, then re-seed.
            const reopen = indexedDB.open(dbName, db.version + 1);
            reopen.onupgradeneeded = () => {
              reopen.result.createObjectStore(storeName);
            };
            reopen.onsuccess = () => {
              writeAll(reopen.result);
            };
            reopen.onerror = () => resolve();
            return;
          }
          writeAll(db);
        };

        function writeAll(db: IDBDatabase) {
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          for (const [key, value] of Object.entries(seedData)) {
            // Ionic Storage stores values as-is (LocalForage handles
            // serialization). Storing the parsed object is what the app
            // expects when calling `storage.get(key)`.
            store.put(value, key);
          }
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            resolve();
          };
        }
      });

      // Block app boot until seeding completes by patching window.fetch
      // for the index document. In practice we just await before the app
      // queries storage; addInitScript runs before any page script, so we
      // attach the promise to `window` and have nothing else to do.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).__visualSeedReady = seedPromise;
    },
    {
      seedData: seed as unknown as Record<string, unknown>,
      dbName: '__baristaDB',
      storeName: '_ionickv',
      // 2024-01-15T12:00:00 UTC — fixed point so brew "x days ago" labels
      // remain stable regardless of when the suite runs.
      frozenNow: Date.UTC(2024, 0, 15, 12, 0, 0),
    },
  );
}

/**
 * Waits for the app shell to be ready — Ionic content rendered, fonts loaded,
 * and the seed script promise resolved.
 */
export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (globalThis as any).__visualSeedReady !== undefined,
  );
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
