/**
 * Upsert the designated super-admin account.
 * Uses SMTP_USER + SMTP_PASS by default (same mailbox as outbound email).
 *
 *   npm run seed:super-admin
 *   node scripts/seed-super-admin.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const AdminUser = require('../models/AdminUser');
const { getMongoUri } = require('../config/database');
const { resolveSuperAdminCredentials } = require('./lib/atlasSeedHelpers');

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    console.error('Set COSMOS_URI or MONGODB_URI');
    process.exit(1);
  }

  const { email, password, emailSource, passwordSource } = resolveSuperAdminCredentials();
  if (!password) {
    console.error('Set SMTP_PASS (or SUPER_ADMIN_PASSWORD override) before running seed:super-admin');
    process.exit(1);
  }
  if (!email) {
    console.error('Set SMTP_USER (or SUPER_ADMIN_EMAIL override) before running seed:super-admin');
    process.exit(1);
  }

  console.log(`Super admin email from ${emailSource}, password from ${passwordSource}`);

  await mongoose.connect(uri, { retryWrites: false });
  const passwordHash = await bcrypt.hash(password, 10);

  let user = await AdminUser.findOne({ email });
  if (user) {
    user.passwordHash = passwordHash;
    user.accessRole = 'admin';
    user.canOpsLead = true;
    user.isApproved = true;
    user.isEmailVerified = true;
    user.kpiEditingAllowed = true;
    user.name = user.name || 'System Super Admin';
    user.empId = user.empId || 'SUPER-ADMIN';
    user.crew = user.crew || 'S';
    user.role = user.role || 'Management';
    user.color = user.color || 'crew-lightviolet';
    await user.save();
    console.log(`Updated super admin: ${email}`);
  } else {
    user = await AdminUser.create({
      email,
      passwordHash,
      name: 'System Super Admin',
      empId: 'SUPER-ADMIN',
      crew: 'S',
      role: 'Management',
      color: 'crew-lightviolet',
      accessRole: 'admin',
      canOpsLead: true,
      kpiEditingAllowed: true,
      isApproved: true,
      isEmailVerified: true,
    });
    console.log(`Created super admin: ${email}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
