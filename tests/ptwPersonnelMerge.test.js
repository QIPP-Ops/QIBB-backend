const {
  normalizePtwName,
  namesFuzzyMatch,
  parseValidUntil,
  formatExpiryDate,
  computePtwExpiryInfo,
  findPtwPersonInList,
  findAdminUserForPtwPerson,
  mergePtwWithRosterMember,
} = require('../utils/ptwPersonnelMerge');

jest.mock('../services/personnelEmailLookup', () => ({
  resolveDeliverableEmail: jest.fn((user) => {
    const email = String(user?.email || '').trim();
    return email.includes('roster') ? '' : email.toLowerCase();
  }),
}));

describe('ptwPersonnelMerge', () => {
  const ptwList = [
    { name: 'Mustafa Al Ansari', empNo: '101', validUntil: '30.11.2027', authorizations: ['permitIssuer'] },
    { name: 'Abdullah Alamri', empId: '200', validUntil: '2027-12-31', authorizations: ['safetyCoordinator'] },
  ];

  const users = [
    { _id: 'u1', name: 'Mustafa Al Ansari', empId: '101', email: 'mustafa@acwaops.com', crew: 'A' },
    { _id: 'u2', name: 'Abdullah Alamri', empId: '200', email: 'abdullah@acwaops.com', crew: 'B' },
  ];

  test('normalizePtwName strips punctuation', () => {
    expect(normalizePtwName('M. Alhammadi')).toBe('m alhammadi');
  });

  test('namesFuzzyMatch handles abbreviated names', () => {
    expect(namesFuzzyMatch('Mustafa Al Ansari', 'Mustafa Al  Ansari')).toBe(true);
    expect(namesFuzzyMatch('K.K.N. Srinivasu', 'KKN Srinivasu')).toBe(true);
  });

  test('parseValidUntil accepts ISO and DMY', () => {
    expect(parseValidUntil('2026-06-15')?.toISOString().slice(0, 10)).toBe('2026-06-15');
    expect(parseValidUntil('15.06.2026')?.toISOString().slice(0, 10)).toBe('2026-06-15');
  });

  test('formatExpiryDate uses DD MMM YYYY', () => {
    expect(formatExpiryDate(new Date('2026-06-15T12:00:00.000Z'))).toBe('15 Jun 2026');
  });

  test('computePtwExpiryInfo flags 30/60 day windows', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    const within30 = computePtwExpiryInfo('2026-06-20', now);
    expect(within30.expiringWithin30).toBe(true);
    expect(within30.expiringWithin60).toBe(true);

    const within60 = computePtwExpiryInfo('2026-07-15', now);
    expect(within60.expiringWithin30).toBe(false);
    expect(within60.expiringWithin60).toBe(true);

    const expired = computePtwExpiryInfo('2026-05-01', now);
    expect(expired.expired).toBe(true);
  });

  test('findPtwPersonInList matches by empId then fuzzy name', () => {
    expect(findPtwPersonInList({ empId: '101' }, ptwList)?.name).toBe('Mustafa Al Ansari');
    expect(findPtwPersonInList({ name: 'Abdullah Alamri' }, ptwList)?.empId).toBe('200');
  });

  test('findAdminUserForPtwPerson matches roster user', () => {
    expect(findAdminUserForPtwPerson({ name: 'Mustafa Al Ansari', empNo: '101' }, users)?.email)
      .toBe('mustafa@acwaops.com');
  });

  test('mergePtwWithRosterMember combines auth and roster fields', () => {
    const merged = mergePtwWithRosterMember(ptwList[0], users[0], new Date('2026-01-01T12:00:00.000Z'));
    expect(merged.crew).toBe('A');
    expect(merged.authorizations).toContain('permitIssuer');
    expect(merged.validUntilFormatted).toBeTruthy();
    expect(merged.missingEmail).toBe(false);
    expect(merged.rosterMismatch).toBeNull();
  });
});
