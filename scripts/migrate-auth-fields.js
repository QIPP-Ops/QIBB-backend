/**
 * One-time migration: legacy auth field names → AdminUser schema names.
 * Run: node scripts/migrate-auth-fields.js
 * Requires COSMOS_URI in environment.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const uri = process.env.COSMOS_URI || process.env.MONGODB_URI;
if (!uri) {
  console.error('Set COSMOS_URI (or MONGODB_URI) before running.');
  process.exit(1);
}

async function run() {
  await mongoose.connect(uri, { retryWrites: false });
  const col = mongoose.connection.collection('adminusers');

  const legacy = await col.find({
    $or: [
      { emailVerified: { $exists: true } },
      { otpExpiry: { $exists: true } },
      { resetTokenHash: { $exists: true } },
      { resetTokenExpiry: { $exists: true } },
    ],
  }).toArray();

  let updated = 0;
  for (const doc of legacy) {
    const $set = {};
    const $unset = {};

    if (doc.emailVerified !== undefined && doc.isEmailVerified === undefined) {
      $set.isEmailVerified = !!doc.emailVerified;
      $unset.emailVerified = '';
    }
    if (doc.otpExpiry && !doc.otpExpiresAt) {
      $set.otpExpiresAt = doc.otpExpiry;
      $unset.otpExpiry = '';
    }
    if (doc.resetTokenHash && !doc.resetToken) {
      $set.resetToken = doc.resetTokenHash;
      $unset.resetTokenHash = '';
    }
    if (doc.resetTokenExpiry && !doc.resetTokenExpires) {
      $set.resetTokenExpires = doc.resetTokenExpiry;
      $unset.resetTokenExpiry = '';
    }

    if (Object.keys($set).length || Object.keys($unset).length) {
      await col.updateOne({ _id: doc._id }, { $set, $unset });
      updated += 1;
    }
  }

  console.log(`Migration complete. Documents updated: ${updated}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
