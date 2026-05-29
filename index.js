require('dotenv').config();
const mongoose = require('mongoose');
const { validateEnv } = require('./config/validateEnv');
const app = require('./app');
const { startPlantIngestScheduler } = require('./services/plantReports/ingestScheduler');
const { startShiftReportReminderScheduler } = require('./services/shiftReportReminderService');
const { startDailyDigestCron } = require('./jobs/dailyDigestCron');

validateEnv();

const PORT = process.env.PORT || 5000;

const { getMongoUri } = require('./config/database');

mongoose.connect(getMongoUri(), { retryWrites: false })
  .then(async () => {
    console.log('MongoDB connected');

    const { ensurePtwPersonnelSeeded } = require('./services/ptwAutoSeed');
    try {
      const ptw = await ensurePtwPersonnelSeeded();
      if (ptw.seeded) {
        console.log(`[ptw] auto-seeded ${ptw.count} authorization entries (was ${ptw.previousCount})`);
      }
    } catch (ptwErr) {
      console.warn('[ptw] startup auto-seed skipped:', ptwErr.message);
    }

    startPlantIngestScheduler();
    startShiftReportReminderScheduler();
    startDailyDigestCron();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

    const { blobIngestConfigured } = require('./services/plantReports/blobReports');
    if (blobIngestConfigured() && process.env.PLANT_INGEST_ON_STARTUP !== '0') {
      setTimeout(async () => {
        try {
          const { runPlantIngestion } = require('./services/plantReports/runIngestion');
          const PlantIngestionState = require('./models/PlantIngestionState');
          const state = await PlantIngestionState.findOne({ key: 'global' }).lean();
          const needsFullIngest =
            !state?.lastSuccessAt ||
            (state.pointsUpserted || 0) === 0 ||
            (state.filesProcessed || 0) === 0;
          const result = await runPlantIngestion({ forceAll: needsFullIngest });
          if (result.ok) {
            console.log(
              `[plant-ingest] startup: ${result.filesProcessed} files, ${result.pointsUpserted} points, trends snapshot: ${result.trendsSnapshot?.ok ? 'ok' : 'skipped'}`
            );
          } else {
            console.warn('[plant-ingest] startup:', result.message || 'not ok');
          }
        } catch (err) {
          console.error('[plant-ingest] startup failed:', err.message);
        }
      }, 12000);
    }
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
