const { memberQuizStatus } = require('../utils/memberQuizStatus');

describe('memberQuizStatus', () => {
  test('pending when no attempts', () => {
    expect(memberQuizStatus({ completedAt: null, score: null, passPercent: 90 })).toBe('Pending');
  });

  test('failed when latest attempt did not pass', () => {
    expect(
      memberQuizStatus({
        completedAt: null,
        score: 70,
        passPercent: 90,
        latestAttempt: { passed: false, percent: 70 },
      })
    ).toBe('Failed');
  });

  test('completed when latest attempt passed', () => {
    expect(
      memberQuizStatus({
        completedAt: new Date(),
        score: 95,
        passPercent: 90,
        latestAttempt: { passed: true, percent: 95 },
      })
    ).toBe('Completed');
  });

  test('failed for legacy assignment marked complete below threshold', () => {
    expect(
      memberQuizStatus({
        completedAt: new Date(),
        score: 65,
        passPercent: 90,
        latestAttempt: { passed: false, percent: 65 },
      })
    ).toBe('Failed');
  });

  test('completed from assignment score when no attempt row', () => {
    expect(
      memberQuizStatus({
        completedAt: new Date(),
        score: 92,
        passPercent: 90,
        latestAttempt: null,
      })
    ).toBe('Completed');
  });
});
