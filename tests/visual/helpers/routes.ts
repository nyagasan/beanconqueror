/**
 * Enumerates every navigable screen we want to capture for visual regression.
 *
 * Sources (kept in sync manually — when adding a new route, add it here too):
 *  - src/app/app.routes.ts
 *  - src/app/home/home.routes.ts
 *  - src/app/info/info.routes.ts
 *  - src/app/settings/settings.page.ts (single page)
 *  - src/app/statistic/statistic.page.ts (single page)
 *  - src/app/helper/helper.routes.ts
 *  - src/app/brew-parameter/brew-parameter.routes.ts
 *  - src/app/bean-parameter/bean-parameter.routes.ts
 *  - src/app/roasting-section/roasting-section.routes.ts
 *  - src/app/water-section/water-section.routes.ts
 *  - src/app/graph-section/graph-section.routes.ts
 *  - src/app/baristamode/baristamode.routes.ts
 */
export interface VisualRoute {
  /** Stable, filename-safe name used for the snapshot file. */
  name: string;
  /** Application path (must start with `/`). */
  path: string;
  /** Optional extra wait after navigation (ms) for slow-loading pages. */
  settleMs?: number;
}

export const VISUAL_ROUTES: VisualRoute[] = [
  // Home tabs
  { name: 'home-dashboard', path: '/home/dashboard' },
  { name: 'home-brews', path: '/home/brews' },
  { name: 'home-beans', path: '/home/beans' },
  { name: 'home-preparations', path: '/home/preparations' },
  { name: 'home-mills', path: '/home/mills' },

  // Top-level
  { name: 'settings', path: '/settings' },
  { name: 'statistic', path: '/statistic', settleMs: 500 },

  // Roasting section
  { name: 'roasting-dashboard', path: '/roasting-section/dashboard' },
  { name: 'roasting-machine', path: '/roasting-section/roasting-machine' },

  // Water section
  { name: 'water', path: '/water-section/water' },

  // Info pages
  { name: 'info', path: '/info' },
  { name: 'info-contact', path: '/info/contact' },
  { name: 'info-about', path: '/info/about' },
  { name: 'info-credits', path: '/info/credits' },
  { name: 'info-licences', path: '/info/licences' },
  { name: 'info-privacy', path: '/info/privacy' },
  { name: 'info-terms', path: '/info/terms' },
  { name: 'info-thanks', path: '/info/thanks' },
  { name: 'info-logs', path: '/info/logs' },
  { name: 'info-impressum', path: '/info/impressum' },
  { name: 'info-cookie', path: '/info/cookie' },

  // Helper
  { name: 'helper-brew-ratio', path: '/helper/brew-ratio' },
  { name: 'helper-water-hardness', path: '/helper/water-hardness' },

  // Brew parameter
  { name: 'brew-parameter', path: '/brew-parameter' },
  { name: 'brew-parameter-manage', path: '/brew-parameter/manage' },
  { name: 'brew-parameter-sort', path: '/brew-parameter/sort' },
  { name: 'brew-parameter-default', path: '/brew-parameter/default' },
  { name: 'brew-parameter-listview', path: '/brew-parameter/listview' },
  { name: 'brew-parameter-repeat', path: '/brew-parameter/repeat' },

  // Bean parameter
  { name: 'bean-parameter', path: '/bean-parameter' },
  { name: 'bean-parameter-manage', path: '/bean-parameter/manage' },
  { name: 'bean-parameter-listview', path: '/bean-parameter/listview' },

  // Graph section
  { name: 'graph', path: '/graph-section/graph', settleMs: 500 },

  // Barista mode
  { name: 'baristamode', path: '/baristamode/barista' },
];
