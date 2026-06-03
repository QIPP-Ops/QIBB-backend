#!/usr/bin/env node
/** Rewrite Compensate Leave Balance → Compensate Off on all leave records (idempotent). */
require('dotenv').config();
const mongoose = require('mongoose');
const { getMongoUri } = require('../config/database');
const AdminUser = require('../models/AdminUser');

const LEGACY = 'Compensate Leave Balance';
const TARGET = 'Compensate Off';

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    console.error('Set MONGODB_URI or COSMOS_URI');
    process.exit(1);
  }
  await mongoose.connect(uri, { retryWrites: false });
  const users = await AdminUser.find({ 'leaves.type': LEGACY });
  let leavesUpdated = 0;
  for (const u of users) {
    let changed = false;
    for (const lv of u.leaves || []) {
      if (String(lv.type || '').trim() === LEGACY) {
        lv.type = TARGET;
        leavesUpdated += 1;
        changed = true;
      }
    }
    if (changed) await u.save();
  }
  console.log(
    `[migrate-compensate-leave-types] users=${users.length} leavesUpdated=${leavesUpdated}`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[migrate-compensate-leave-types] failed:', err.message);
  process.exit(1);
});
