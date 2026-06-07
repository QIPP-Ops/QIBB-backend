const Quiz = require('../models/Quiz');

const PTW_QUIZ_SLUG = 'NCHSESP-040';

const PTW_QUIZ = {
  catalogSlug: PTW_QUIZ_SLUG,
  title: 'PTW & Location Safety Rules Quiz',
  prizeDescription: 'Complete this knowledge test to demonstrate PTW competency.',
  staticHtmlUrl: '/quizzes/NCHSESP-040-ptw-location-safety-quiz.html',
  hubAccessible: true,
  passPercent: 80,
  rewardQrEnabled: false,
  rewardTitle: 'Training Reward',
  rewardMessage: 'Scan to claim your completion reward.',
};

/**
 * Ensure built-in training hub quizzes exist (production has no manual seed step).
 */
async function ensureBuiltinQuizzesSeeded() {
  const existing = await Quiz.findOne({ catalogSlug: PTW_QUIZ_SLUG }).lean();
  if (existing) {
    const needsPatch =
      !existing.staticHtmlUrl ||
      !existing.hubAccessible ||
      existing.title !== PTW_QUIZ.title;
    if (needsPatch) {
      await Quiz.updateOne(
        { _id: existing._id },
        {
          $set: {
            title: PTW_QUIZ.title,
            staticHtmlUrl: PTW_QUIZ.staticHtmlUrl,
            hubAccessible: true,
            passPercent: PTW_QUIZ.passPercent,
            prizeDescription: PTW_QUIZ.prizeDescription,
          },
        }
      );
      return { seeded: true, quizId: existing._id, action: 'updated' };
    }
    return { seeded: false, quizId: existing._id, action: 'exists' };
  }

  const quiz = new Quiz({
    ...PTW_QUIZ,
    htmlStorageKey: '',
    uploadedAt: new Date(),
  });
  await quiz.save();
  return { seeded: true, quizId: quiz._id, action: 'created' };
}

module.exports = { ensureBuiltinQuizzesSeeded, PTW_QUIZ_SLUG, PTW_QUIZ };
