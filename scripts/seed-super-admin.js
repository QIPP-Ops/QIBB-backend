/**
 * Upsert the designated super-admin account (default admin@acwaops.com).
 * Does not delete or modify other users.
 *
 *   SUPER_ADMIN_PASSWORD='…' npm run seed:super-admin
 *   node scripts/seed-super-admin.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const AdminUser = require('../models/AdminUser');
const { SUPER_ADMIN_EMAIL } = require('../config/superAdmin');

async function main() {
  const uri = process.env.COSMOS_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Set COSMOS_URI or MONGODB_URI');
    process.exit(1);
  }

  const password =
    process.env.SUPER_ADMIN_PASSWORD ||
    process.env.SEED_SUPER_ADMIN_PASSWORD;
  if (!password) {
    console.error(
      'Set SUPER_ADMIN_PASSWORD (or SEED_SUPER_ADMIN_PASSWORD) before running seed:super-admin'
    );
    process.exit(1);
  }

  await mongoose.connect(uri, { retryWrites: false });
  const passwordHash = await bcrypt.hash(password, 10);
  const email = SUPER_ADMIN_EMAIL;

  let user = await AdminUser.findOne({ email });
  if (user) {
    user.passwordHash = passwordHash;
    user.accessRole = 'admin';
    user.isApproved = true;
    user.isEmailVerified = true;
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
