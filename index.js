require('dotenv').config();
const mongoose = require('mongoose');
const { validateEnv } = require('./config/validateEnv');
const app = require('./app');
const { startShiftReportReminderScheduler } = require('./services/shiftReportReminderService');
const { startDailyDigestCron } = require('./jobs/dailyDigestCron');
const { startLeaveAccrualCron } = require('./jobs/leaveAccrualCron');
const { startMonthlyLeaveSummaryCron } = require('./jobs/monthlyLeaveSummaryCron');
const { startPtwExpiryReminderCron } = require('./jobs/ptwExpiryReminderJob');

validateEnv();

const PORT = process.env.PORT || 5000;

const { getMongoUri } = require('./config/database');

mongoose.connect(getMongoUri(), { retryWrites: false })
  .then(async () => {
    console.log('MongoDB connected');

    const { ensurePtwPersonnelSeeded } = require('./services/ptwAutoSeed');
    try {
      const forceReseed = process.env.PTW_FORCE_RESEED === '1';
      const ptw = await ensurePtwPersonnelSeeded({ force: forceReseed });
      if (ptw.seeded) {
        console.log(
          `[ptw] ${forceReseed ? 'force-' : ''}seeded ${ptw.count} authorization entries (was ${ptw.previousCount})`
        );
      }
    } catch (ptwErr) {
      console.warn('[ptw] startup auto-seed skipped:', ptwErr.message);
    }

    const { ensureBuiltinQuizzesSeeded } = require('./services/quizAutoSeed');
    try {
      const quizSeed = await ensureBuiltinQuizzesSeeded();
      if (quizSeed.seeded) {
        console.log(`[quiz] ${quizSeed.action} built-in quiz ${quizSeed.quizId}`);
      }
    } catch (quizErr) {
      console.warn('[quiz] startup auto-seed skipped:', quizErr.message);
    }

    startShiftReportReminderScheduler();
    startDailyDigestCron();
    startLeaveAccrualCron();
    startMonthlyLeaveSummaryCron();
    startPtwExpiryReminderCron();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
