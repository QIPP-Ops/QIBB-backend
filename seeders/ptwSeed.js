const mongoose = require('mongoose');
require('dotenv').config();
const { getMongoUri } = require('../config/database');
const { ensurePtwPersonnelSeeded } = require('../services/ptwAutoSeed');

async function seed() {
  await mongoose.connect(getMongoUri(), { retryWrites: false });
  const result = await ensurePtwPersonnelSeeded({ force: true });
  console.log(
    result.seeded
      ? `✅ Replaced PTW authorization list with ${result.count} personnel from JSON.`
      : `PTW list already has ${result.count} entries (use force in API to replace).`
  );
  mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
