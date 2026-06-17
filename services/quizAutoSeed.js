const Quiz = require('../models/Quiz');



const PTW_QUIZ_SLUG = 'NCHSESP-040';

const CE_PTW_AUTH_QUIZ_SLUG = 'CE-PTW-AUTH-25';



const BUILTIN_QUIZZES = [

  {

    catalogSlug: PTW_QUIZ_SLUG,

    title: 'PTW & Location Safety Rules Quiz',

    prizeDescription: 'Complete this knowledge test to demonstrate PTW competency.',

    staticHtmlUrl: '/quizzes/NCHSESP-040-ptw-location-safety-quiz.html',

    hubAccessible: true,

    passPercent: 80,

    rewardQrEnabled: false,

    rewardTitle: 'Training Reward',

    rewardMessage: 'Scan to claim your completion reward.',

  },

  {

    catalogSlug: CE_PTW_AUTH_QUIZ_SLUG,

    title: "C&E Plant's Safety Rules and PTW Authorization Test 25",

    prizeDescription:

      'Complete the C&E Plant safety rules and PTW authorization knowledge test.',

    staticHtmlUrl: '/quizzes/CE-plant-safety-rules-ptw-auth-test-25.html',

    hubAccessible: false,

    passPercent: 90,

    rewardQrEnabled: false,

    rewardTitle: 'Training Reward',

    rewardMessage: 'Scan to claim your completion reward.',

  },

];



async function ensureBuiltinQuiz(def) {

  const existing = await Quiz.findOne({ catalogSlug: def.catalogSlug }).lean();

  if (existing) {

    const needsPatch =

      !existing.staticHtmlUrl ||

      existing.staticHtmlUrl !== def.staticHtmlUrl ||

      existing.title !== def.title ||

      Boolean(existing.hubAccessible) !== Boolean(def.hubAccessible) ||

      (existing.passPercent ?? 80) !== def.passPercent;

    if (needsPatch) {

      await Quiz.updateOne(

        { _id: existing._id },

        {

          $set: {

            title: def.title,

            staticHtmlUrl: def.staticHtmlUrl,

            hubAccessible: def.hubAccessible,

            passPercent: def.passPercent,

            prizeDescription: def.prizeDescription,

          },

        }

      );

      return { seeded: true, quizId: existing._id, action: 'updated', slug: def.catalogSlug };

    }

    return { seeded: false, quizId: existing._id, action: 'exists', slug: def.catalogSlug };

  }



  const quiz = new Quiz({

    ...def,

    htmlStorageKey: '',

    uploadedAt: new Date(),

  });

  await quiz.save();

  return { seeded: true, quizId: quiz._id, action: 'created', slug: def.catalogSlug };

}



/**

 * Ensure built-in training hub quizzes exist (production has no manual seed step).

 */

async function ensureBuiltinQuizzesSeeded() {

  const results = [];

  for (const def of BUILTIN_QUIZZES) {

    results.push(await ensureBuiltinQuiz(def));

  }

  const changed = results.filter((r) => r.seeded);

  if (!changed.length) {

    return { seeded: false, quizzes: results };

  }

  return {

    seeded: true,

    quizzes: results,

    action: changed.map((r) => `${r.slug}:${r.action}`).join(', '),

  };

}



module.exports = {

  ensureBuiltinQuizzesSeeded,

  PTW_QUIZ_SLUG,

  CE_PTW_AUTH_QUIZ_SLUG,

  BUILTIN_QUIZZES,

};


