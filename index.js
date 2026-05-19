require('dotenv').config();
const mongoose = require('mongoose');
const { validateEnv } = require('./config/validateEnv');
const app = require('./app');
const { startPlantIngestScheduler } = require('./services/plantReports/ingestScheduler');

validateEnv();

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.COSMOS_URI, { retryWrites: false })
  .then(() => {
    console.log('MongoDB connected');
    startPlantIngestScheduler();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
