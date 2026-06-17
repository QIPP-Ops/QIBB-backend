const { matchesUser } = require('../services/trainingAchievementsService');

describe('trainingAchievementsService', () => {
  const user = { _id: 'user1', empId: '2237', name: 'Mark Ramirez' };

  test('matchesUser by empId', () => {
    expect(matchesUser({ empId: '2237', employeeName: 'Someone Else' }, user)).toBe(true);
  });

  test('matchesUser by normalized name', () => {
    expect(matchesUser({ employeeName: 'mark ramirez' }, user)).toBe(true);
  });

  test('matchesUser by userId', () => {
    expect(matchesUser({ userId: 'user1' }, user)).toBe(true);
  });

  test('matchesUser rejects unrelated records', () => {
    expect(matchesUser({ empId: '9999', employeeName: 'Other Person' }, user)).toBe(false);
  });
});
