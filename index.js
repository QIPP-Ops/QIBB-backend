require('dotenv').config();
const mongoose = require('mongoose');
const { validateEnv } = require('./config/validateEnv');
const app = require('./app');
const { startPlantIngestScheduler } = require('./services/plantReports/ingestScheduler');

validateEnv();

const PORT = process.env.PORT || 5000;

const { getMongoUri } = require('./config/database');

mongoose.connect(getMongoUri(), { retryWrites: false })
  .then(() => {
    console.log('MongoDB connected');
    startPlantIngestScheduler();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

    const { blobIngestConfigured } = require('./services/plantReports/blobReports');
    if (blobIngestConfigured() && process.env.PLANT_INGEST_ON_STARTUP !== '0') {
      setTimeout(async () => {
        try {
          const { runPlantIngestion } = require('./services/plantReports/runIngestion');
          const result = await runPlantIngestion({ forceAll: false });
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
