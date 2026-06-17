const QuizAttempt = require('../models/QuizAttempt');
const { memberQuizStatus } = require('../utils/memberQuizStatus');

describe('memberQuizStatus integration', () => {
  test('failed score without completedAt is retryable', () => {
    expect(
      memberQuizStatus({
        completedAt: null,
        score: 72,
        passPercent: 90,
        latestAttempt: null,
      })
    ).toBe('Failed');
  });
});

describe('QuizAttempt model', () => {
  test('schema exports with required fields', () => {
    const paths = QuizAttempt.schema.paths;
    expect(paths.quizId).toBeDefined();
    expect(paths.userId).toBeDefined();
    expect(paths.score).toBeDefined();
    expect(paths.maxScore).toBeDefined();
    expect(paths.percent).toBeDefined();
    expect(paths.passed).toBeDefined();
    expect(paths.completedAt).toBeDefined();
    expect(paths.answers).toBeDefined();
    expect(paths.durationSeconds).toBeDefined();
  });
});
