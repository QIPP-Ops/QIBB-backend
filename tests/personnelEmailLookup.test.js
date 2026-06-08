const {
  resolveDeliverableEmail,
  resetPersonnelEmailIndexes,
} = require('../services/personnelEmailLookup');

describe('personnelEmailLookup', () => {
  beforeEach(() => {
    resetPersonnelEmailIndexes();
  });

  test('returns real Mongo email when not a placeholder', () => {
    expect(
      resolveDeliverableEmail({
        name: 'Test User',
        email: 'real.user@nomac.com',
        empId: '9999',
      })
    ).toBe('real.user@nomac.com');
  });

  test('resolves @nomac.com from bundled roster when Mongo has placeholder', () => {
    expect(
      resolveDeliverableEmail({
        name: 'Juma Khan',
        email: '2028@roster.acwaops.local',
        empId: '2028',
      })
    ).toBe('juma.khan@nomac.com');
  });

  test('resolves by fuzzy name when empId missing in bundle', () => {
    const email = resolveDeliverableEmail({
      name: 'Syed Shahnawaz Ahmed',
      email: '2025@roster.acwaops.local',
      empId: '2025',
    });
    expect(email).toBe('syed.shahnawaz@nomac.com');
  });

  test('returns empty string when no deliverable email exists', () => {
    expect(
      resolveDeliverableEmail({
        name: 'Unknown Person',
        email: '99999@roster.acwaops.local',
        empId: '99999',
      })
    ).toBe('');
  });
});
