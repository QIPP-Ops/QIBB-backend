const {
  PORTAL_TAB_KEYS,
  defaultTabVisibility,
  mergeTabVisibility,
  resolveTabVisibilityForUser,
  sanitizeTabVisibilityPatch,
  pathnameToTabKey,
  isPathAllowedByTabVisibility,
  isTabVisibleForUser,
} = require('../utils/tabVisibility');

describe('tabVisibility utils', () => {
  it('defaults all tabs visible', () => {
    const defaults = defaultTabVisibility();
    expect(PORTAL_TAB_KEYS.every((k) => defaults[k] === true)).toBe(true);
  });

  it('merges stored false values', () => {
    const merged = mergeTabVisibility({ home: false, trendStudio: false });
    expect(merged.home).toBe(false);
    expect(merged.leave).toBe(true);
    expect(merged.trendStudio).toBe(false);
  });

  it('super admin always sees all tabs', () => {
    const user = { email: 'admin@acwaops.com', tabVisibility: { home: false } };
    expect(resolveTabVisibilityForUser(user).home).toBe(true);
    expect(isTabVisibleForUser('home', user)).toBe(true);
  });

  it('sanitizes patch keys only', () => {
    expect(sanitizeTabVisibilityPatch({ home: false, bogus: true })).toEqual({ home: false });
    expect(sanitizeTabVisibilityPatch({})).toBeNull();
  });

  it('maps pathnames to tab keys', () => {
    expect(pathnameToTabKey('/')).toBe('home');
    expect(pathnameToTabKey('/trend-studio')).toBe('trendStudio');
    expect(pathnameToTabKey('/historical-trends')).toBe('historicalTrends');
    expect(pathnameToTabKey('/daily-operation')).toBe('historicalTrends');
    expect(pathnameToTabKey('/leave')).toBe('leave');
    expect(pathnameToTabKey('/settings/leaves')).toBe('settings');
  });

  it('blocks hidden routes for regular users', () => {
    const user = { email: 'user@acwapower.com', tabVisibility: { trendStudio: false } };
    expect(isPathAllowedByTabVisibility('/trend-studio', user)).toBe(false);
    expect(isPathAllowedByTabVisibility('/leave', user)).toBe(true);
  });
});
