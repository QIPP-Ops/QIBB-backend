/**
 * Seed default training reference items (run once: node scripts/seed-references.js)
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { getMongoUri } = require('../config/database');
const { ensureBuiltinReferencesSeeded } = require('../services/referenceAutoSeed');

async function seed() {
  const uri = getMongoUri();
  if (!uri) throw new Error('MONGODB_URI or COSMOS_URI required');
  await mongoose.connect(uri, { retryWrites: false });
  const force = process.argv.includes('--force');
  const result = await ensureBuiltinReferencesSeeded({ force });
  if (result.seeded) {
    console.log(`Seeded ${result.itemsCreated} reference item(s), ${result.categoriesCreated} new categor(ies).`);
  } else {
    console.log(`Skipped — ${result.reason || 'no changes'} (${result.count ?? 0} existing items).`);
  }
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
