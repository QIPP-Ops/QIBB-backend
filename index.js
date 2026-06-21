require('dotenv').config();
const mongoose = require('mongoose');
const { validateEnv } = require('./config/validateEnv');
const app = require('./app');
const { startShiftReportReminderScheduler } = require('./services/shiftReportReminderService');
const { startLeaveAccrualCron } = require('./jobs/leaveAccrualCron');
const { startMonthlyLeaveSummaryCron } = require('./jobs/monthlyLeaveSummaryCron');
const { startPtwExpiryReminderCron } = require('./jobs/ptwExpiryReminderJob');
const { startCourseReminderCron } = require('./jobs/courseReminderCron');

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
        console.log(`[quiz] built-in quizzes: ${quizSeed.action}`);
      }
    } catch (quizErr) {
      console.warn('[quiz] startup auto-seed skipped:', quizErr.message);
    }

    try {
      const AdminUser = require('./models/AdminUser');
      const adminCount = await AdminUser.countDocuments({ accessRole: 'admin', isActive: { $ne: false } });
      if (adminCount === 0) {
        console.log(
          '[seed] No admin users in database — run once: npm run seed:mongodb (super admin uses SMTP_USER + SMTP_PASS)'
        );
      }

      if (process.env.SEED_IF_EMPTY === '1') {
        const { filterProtectedAccounts } = require('./utils/protectedAccounts');
        const users = await AdminUser.find().select('email').lean();
        const rosterVisible = filterProtectedAccounts(users).length;
        if (rosterVisible < 10) {
          console.log(`[seed] SEED_IF_EMPTY — rosterVisible=${rosterVisible}, running atlas seed...`);
          const { runAtlasSeed } = require('./scripts/seed-mongodb');
          const result = await runAtlasSeed({ skipDisconnect: true });
          console.log(`[seed] SEED_IF_EMPTY complete — rosterVisible=${result.rosterCheck?.rosterVisible}`);
        }
      }
    } catch (seedHintErr) {
      console.warn('[seed] startup seed check skipped:', seedHintErr.message);
    }

    startShiftReportReminderScheduler();
    startLeaveAccrualCron();
    startMonthlyLeaveSummaryCron();
    startPtwExpiryReminderCron();
    startCourseReminderCron();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
