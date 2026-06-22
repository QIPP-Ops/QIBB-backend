/**
 * Seed built-in PTW training quizzes into MongoDB.
 * Manual run only — never invoked on deploy/startup.
 *
 *   npm run seed:quizzes              # create missing built-in quizzes only
 *   npm run seed:quizzes -- --force   # also sync metadata from repo defaults
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { getMongoUri } = require('../config/database');
const { ensureBuiltinQuizzesSeeded } = require('../services/quizAutoSeed');

async function main() {
  const force = process.argv.includes('--force');
  const uri = getMongoUri();
  if (!uri) throw new Error('Set MONGODB_URI');

  await mongoose.connect(uri, { retryWrites: false });
  const result = await ensureBuiltinQuizzesSeeded({ force });
  await mongoose.disconnect();

  if (result.seeded) {
    console.log(`[quiz] seed complete: ${result.action}`);
  } else {
    console.log('[quiz] no changes — built-in quizzes already present (use --force to sync metadata)');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('[quiz] seed failed:', err.message);
  process.exit(1);
});
