const {
  buildPersonnelEmailIndex,
  resolvePersonEmail,
  rosterEmpId,
  resolveSuperAdminEmailFromEnv,
} = require('../scripts/lib/atlasSeedHelpers');

describe('atlasSeedHelpers', () => {
  test('resolvePersonEmail uses personnel-emails by empId', () => {
    const index = buildPersonnelEmailIndex([
      { name: 'Test User', email: 'test@nomac.com', empId: '2202' },
    ]);
    const email = resolvePersonEmail(
      { name: 'Abdulwahab', empId: '2202' },
      index
    );
    expect(email).toBe('test@nomac.com');
  });

  test('resolvePersonEmail prefers inline roster email', () => {
    const index = buildPersonnelEmailIndex([]);
    const email = resolvePersonEmail(
      { name: 'X', email: 'inline@nomac.com', empId: '1' },
      index
    );
    expect(email).toBe('inline@nomac.com');
  });

  test('rosterEmpId falls back to ROSTER-id', () => {
    expect(rosterEmpId({ id: 42, name: 'A' })).toBe('ROSTER-42');
    expect(rosterEmpId({ empId: '500', name: 'A' })).toBe('500');
  });

  test('resolveSuperAdminEmailFromEnv prefers SUPER_ADMIN_EMAIL', () => {
    const prev = process.env.SUPER_ADMIN_EMAIL;
    process.env.SUPER_ADMIN_EMAIL = 'admin@example.com';
    expect(resolveSuperAdminEmailFromEnv()).toBe('admin@example.com');
    process.env.SUPER_ADMIN_EMAIL = prev;
  });
});
