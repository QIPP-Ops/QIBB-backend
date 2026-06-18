const { SUPER_ADMIN_EMAIL } = require('../config/superAdmin');

/** Portal sidebar / route tab keys — keep in sync with QIBB-frontend portal-access SidebarRouteKey + settings. */
const PORTAL_TAB_KEYS = [
  'home',
  'leave',
  'admin',
  'trendStudio',
  'historicalTrends',
  'reports',
  'management',
  'ptw',
  'chemistry',
  'trainings',
  'personnel',
  'settings',
];

const TAB_LABELS = {
  home: 'Home / Dashboard',
  leave: 'Leave Timesheet',
  admin: 'Admin Control',
  trendStudio: 'Trend Studio',
  historicalTrends: 'Historical Trends',
  reports: 'Reports',
  management: 'Management',
  ptw: 'PTW',
  chemistry: 'Chemistry & RO',
  trainings: 'Training Hub',
  personnel: 'Operation Team',
  settings: 'Settings & Profile',
};

const PATH_PREFIX_TO_TAB = [
  { prefix: '/admin-portal', tab: 'admin' },
  { prefix: '/trend-studio', tab: 'trendStudio' },
  { prefix: '/historical-trends', tab: 'historicalTrends' },
  { prefix: '/daily-operation', tab: 'historicalTrends' },
  { prefix: '/water-balance', tab: 'historicalTrends' },
  { prefix: '/gt-filter', tab: 'historicalTrends' },
  { prefix: '/environment', tab: 'historicalTrends' },
  { prefix: '/timers-counters', tab: 'historicalTrends' },
  { prefix: '/energy', tab: 'historicalTrends' },
  { prefix: '/chemistry/trends', tab: 'historicalTrends' },
  { prefix: '/leave', tab: 'leave' },
  { prefix: '/my-leaves', tab: 'leave' },
  { prefix: '/reports', tab: 'reports' },
  { prefix: '/trends', tab: 'reports' },
  { prefix: '/management', tab: 'management' },
  { prefix: '/ptw', tab: 'ptw' },
  { prefix: '/chemistry', tab: 'chemistry' },
  { prefix: '/trainings', tab: 'trainings' },
  { prefix: '/personnel', tab: 'personnel' },
  { prefix: '/settings', tab: 'settings' },
  { prefix: '/calendar', tab: 'home' },
  { prefix: '/dashboard', tab: 'home' },
  { prefix: '/profile', tab: 'settings' },
];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isSuperAdminEmail(email) {
  return normalizeEmail(email) === SUPER_ADMIN_EMAIL;
}

function defaultTabVisibility() {
  return Object.fromEntries(PORTAL_TAB_KEYS.map((k) => [k, true]));
}

function sanitizeTabVisibilityPatch(body) {
  if (!body || typeof body !== 'object') return null;
  const patch = {};
  for (const key of PORTAL_TAB_KEYS) {
    if (body[key] !== undefined) {
      patch[key] = Boolean(body[key]);
    }
  }
  return Object.keys(patch).length ? patch : null;
}

function mergeTabVisibility(stored) {
  const merged = defaultTabVisibility();
  if (!stored || typeof stored !== 'object') return merged;
  for (const key of PORTAL_TAB_KEYS) {
    if (stored[key] === false) merged[key] = false;
    else if (stored[key] === true) merged[key] = true;
  }
  return merged;
}

function resolveTabVisibilityForUser(user) {
  if (isSuperAdminEmail(user?.email)) return defaultTabVisibility();
  return mergeTabVisibility(user?.tabVisibility);
}

function isTabVisibleForUser(tabKey, user) {
  if (!tabKey) return true;
  if (isSuperAdminEmail(user?.email)) return true;
  const resolved = resolveTabVisibilityForUser(user);
  return resolved[tabKey] !== false;
}

function normalizePath(pathname) {
  if (!pathname || pathname === '/') return '/';
  return String(pathname).replace(/\/+$/, '') || '/';
}

function pathnameToTabKey(pathname) {
  const path = normalizePath(pathname);
  if (path === '/') return 'home';
  for (const { prefix, tab } of PATH_PREFIX_TO_TAB) {
    const base = normalizePath(prefix);
    if (path === base || path.startsWith(`${base}/`)) return tab;
  }
  return null;
}

function isPathAllowedByTabVisibility(pathname, user) {
  const tabKey = pathnameToTabKey(pathname);
  if (!tabKey) return true;
  return isTabVisibleForUser(tabKey, user);
}

module.exports = {
  PORTAL_TAB_KEYS,
  TAB_LABELS,
  defaultTabVisibility,
  sanitizeTabVisibilityPatch,
  mergeTabVisibility,
  resolveTabVisibilityForUser,
  isTabVisibleForUser,
  pathnameToTabKey,
  isPathAllowedByTabVisibility,
  isSuperAdminEmail,
};
