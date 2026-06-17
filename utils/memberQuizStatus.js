/** Member-facing status: only passed quizzes count as Completed. */
function memberQuizStatus({ completedAt, score, passPercent, latestAttempt }) {
  const threshold = passPercent ?? 80;
  const passed = latestAttempt
    ? Boolean(latestAttempt.passed)
    : Boolean(completedAt && (score ?? 0) >= threshold);
  if (passed) return 'Completed';
  if (
    latestAttempt ||
    (completedAt && (score ?? 0) < threshold) ||
    (score != null && !completedAt)
  ) {
    return 'Failed';
  }
  return 'Pending';
}

module.exports = { memberQuizStatus };
