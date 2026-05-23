const { isProtectedAccountEmail, filterProtectedAccounts } = require('../utils/protectedAccounts');

describe('protectedAccounts', () => {
  test('isProtectedAccountEmail matches super admin case-insensitively', () => {
    expect(isProtectedAccountEmail('admin@acwaops.com')).toBe(true);
    expect(isProtectedAccountEmail('Admin@AcwaOps.com')).toBe(true);
    expect(isProtectedAccountEmail('other@acwaops.com')).toBe(false);
  });

  test('filterProtectedAccounts removes super admin rows', () => {
    const rows = [
      { email: 'admin@acwaops.com', name: 'Super' },
      { email: 'user@example.com', name: 'User' },
    ];
    expect(filterProtectedAccounts(rows)).toEqual([{ email: 'user@example.com', name: 'User' }]);
  });
});
