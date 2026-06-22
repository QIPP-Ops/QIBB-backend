/** Portal sidebar / route tab keys — personnel management focus. */
const PORTAL_TAB_KEYS = [
  'home',
  'leave',
  'admin',
  'management',
  'ptw',
  'maintenance',
  'trainings',
  'personnel',
  'chat',
  'settings',
];

const TAB_LABELS = {
  home: 'Home',
  leave: 'Leave Timesheet',
  admin: 'Admin Control',
  management: 'Management',
  ptw: 'PTW',
  maintenance: 'Maintenance',
  trainings: 'Training Hub',
  chat: 'Crew Chat',
  personnel: 'Operation Team',
  settings: 'Settings & Profile',
};

const PATH_PREFIX_TO_TAB = [
  { prefix: '/admin-portal', tab: 'admin' },
  { prefix: '/leave', tab: 'leave' },
  { prefix: '/my-leaves', tab: 'leave' },
  { prefix: '/management', tab: 'management' },
  { prefix: '/ptw', tab: 'ptw' },
  { prefix: '/maintenance', tab: 'maintenance' },
  { prefix: '/task-planner', tab: 'maintenance' },
  { prefix: '/trainings', tab: 'trainings' },
  { prefix: '/crew-chat', tab: 'chat' },
  { prefix: '/personnel', tab: 'personnel' },
  { prefix: '/settings', tab: 'settings' },
  { prefix: '/calendar', tab: 'leave' },
  { prefix: '/dashboard', tab: 'home' },
  { prefix: '/profile', tab: 'settings' },
];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isSuperAdminEmail(email) {
  const { SUPER_ADMIN_EMAIL } = require('../config/superAdmin');
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
