#!/usr/bin/env node
/** Copy empId → employeeExternalId where empty (idempotent). */
require('dotenv').config();
const mongoose = require('mongoose');
const { getMongoUri } = require('../config/database');
const AdminUser = require('../models/AdminUser');

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    console.error('Set MONGODB_URI or COSMOS_URI');
    process.exit(1);
  }
  await mongoose.connect(uri, { retryWrites: false });
  const users = await AdminUser.find({
    $or: [
      { employeeExternalId: { $exists: false } },
      { employeeExternalId: null },
      { employeeExternalId: '' },
    ],
  });
  let updated = 0;
  for (const u of users) {
    if (!u.empId) continue;
    u.employeeExternalId = String(u.empId);
    await u.save();
    updated += 1;
  }
  console.log(`[migrate-employee-external-ids] updated=${updated} scanned=${users.length}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[migrate-employee-external-ids] failed:', err.message);
  process.exit(1);
});
