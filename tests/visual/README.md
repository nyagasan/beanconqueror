# Visual Regression Tests

Beanconqueror visual regression suite based on [Playwright](https://playwright.dev/).

> ⚠️ This workflow is **fork-only**. Every job in
> `.github/workflows/visual-regression.yml` is guarded by
> `if: github.repository == 'nyagasan/beanconqueror'` so it never runs on the
> upstream `graphefruit/beanconqueror` repository.

## Scope

- **Base branch**: `develop`
- **Viewport**: iPhone 13 (390 × 844), light mode only
- **Coverage**: every navigable screen — see [`helpers/routes.ts`](helpers/routes.ts)
- **Determinism**:
  - Frozen `Date` (2024-01-15T12:00:00 UTC) and timezone (`UTC`)
  - All animations / transitions disabled
  - IndexedDB seeded with deterministic fixtures before app boot

## Layout

```
tests/visual/
├── fixtures/             # JSON dummy data injected into IndexedDB
├── helpers/
│   ├── routes.ts         # List of paths to capture
│   └── seed-storage.ts   # Init scripts for IndexedDB seeding & freezing
├── specs/
│   └── pages.spec.ts     # Single data-driven spec covering all routes
├── __screenshots__/      # Committed baseline PNGs (created on first run)
├── playwright.config.ts
└── tsconfig.json
```

## Local usage

```bash
pnpm install
pnpm exec playwright install --with-deps chromium

# Run the suite (will start `ng serve` automatically)
pnpm test:visual

# Regenerate / update baselines after intentional UI changes
pnpm test:visual:update
```

The dev server is started automatically. To run against an already-running
server set `PLAYWRIGHT_BASE_URL`:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:8100 pnpm test:visual
```

## Updating baselines

Two equivalent options are supported — pick whichever fits your workflow:

1. **CI (recommended)** — add the `update-visual-baselines` label to the PR.
   The `update-baselines` job will:
   - Run `pnpm test:visual:update`
   - Commit `chore(visual): update baselines` to the PR's head branch
   - Remove the label and comment on the PR
2. **Local** — run `pnpm test:visual:update` and commit the resulting changes
   under `tests/visual/__screenshots__/` yourself.

## Adding a new screen

1. Open [`helpers/routes.ts`](helpers/routes.ts).
2. Append a new entry:

   ```ts
   { name: 'my-new-screen', path: '/my-new-screen' },
   ```

   Use a filename-safe `name`. Set `settleMs` if the page needs extra time to
   stabilise (e.g. charts).
3. Run `pnpm test:visual:update` (or use the label flow above) to generate
   the baseline.
4. Commit the new file under `tests/visual/__screenshots__/`.

## Editing fixtures

Fixtures live under [`fixtures/`](fixtures/) and are written into
`indexedDB('__baristaDB').objectStore('_ionickv')` before the app boots.
The keys correspond to the storage classes in `src/services/`:

| File                | Storage key   | Source service                           |
| ------------------- | ------------- | ---------------------------------------- |
| `beans.json`        | `BEANS`       | `src/services/uiBeanStorage.ts`          |
| `brews.json`        | `BREWS`       | `src/services/uiBrewStorage.ts`          |
| `mills.json`        | `MILL`        | `src/services/uiMillStorage.ts`          |
| `preparations.json` | `PREPARATION` | `src/services/uiPreparationStorage.ts`   |
| `settings.json`     | `SETTINGS`    | `src/services/uiSettingsStorage.ts`      |

`settings.json` must keep `welcome_page_showed: true` so the first-launch
welcome popover does not obscure every page during snapshotting.

Always use the fixed UUIDs already in the JSON files (`00000000-...-0001`) so
that screenshots stay reproducible.

## CI workflow

`.github/workflows/visual-regression.yml` defines two jobs, both gated to the
fork only:

- **`visual-test`** — runs on every PR and every push to `develop`. On
  failure it pushes `*-actual.png` / `*-expected.png` / `*-diff.png` to the
  `visual-regression-reports` branch under
  `runs/<PR>/<run_id>/` and posts a summary comment with raw URLs. A GC step
  removes runs older than 30 days from that branch.
- **`update-baselines`** — runs only when a PR is labelled
  `update-visual-baselines`. Regenerates and commits baselines, then removes
  the label.

### Fork-safety guarantees

- Every job has `if: github.repository == 'nyagasan/beanconqueror'`, so the
  workflow is a no-op on upstream and other forks.
- The `visual-regression-reports` branch is created/used only inside this
  fork.
- The `update-visual-baselines` label only needs to exist on this fork.
