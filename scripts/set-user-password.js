/**
 * Set or create a user password (e.g. recover admin access).
 *
 
 * Usage:
 *   node scripts/set-user-password.js admin@acwaops.com "YourNewPassword"
 *
 * Requires MONGODB_URI in .env or environment.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const AdminUser = require('../models/AdminUser');
const { getMongoUri } = require('../config/database');

const uri = getMongoUri();
const email = (process.argv[2] || process.env.SET_PASSWORD_EMAIL || '').trim().toLowerCase();
const password = process.argv[3] || process.env.SET_PASSWORD_VALUE;

if (!uri) {
  console.error('Missing database connection string.');
  console.error('');
  console.error('Create QIBB-backend-main/.env with one of:');
  console.error('  MONGODB_URI=mongodb+srv://...   (copy from Render dashboard → Environment)');
  console.error('');
  console.error('Or run once in PowerShell:');
  console.error('  $env:MONGODB_URI="mongodb+srv://YOUR_CONNECTION_STRING"');
  console.error('  node scripts/set-user-password.js admin@acwaops.com "YourNewPassword"');
  process.exit(1);
}
if (!email || !password) {
  console.error('Usage: node scripts/set-user-password.js <email> <new-password>');
  process.exit(1);
}
if (password.length < 6) {
  console.error('Password must be at least 6 characters.');
  process.exit(1);
}

async function run() {
  await mongoose.connect(uri, { retryWrites: false });
  const passwordHash = await bcrypt.hash(password, 10);

  let user = await AdminUser.findOne({ email });
  if (!user) {
    user = await AdminUser.findOne({
      email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
  }

  if (!user) {
    console.log(`No user found for ${email} — creating admin account.`);
    user = new AdminUser({
      email,
      passwordHash,
      name: 'System Administrator',
      empId: `ADMIN-${Date.now().toString().slice(-6)}`,
      crew: 'S',
      role: 'Management',
      accessRole: 'admin',
      color: 'crew-lightviolet',
      isApproved: true,
      isEmailVerified: true,
      leaves: [],
    });
  } else {
    user.email = email;
    user.passwordHash = passwordHash;
    user.isEmailVerified = true;
    user.isApproved = true;
    if (!user.accessRole) user.accessRole = 'admin';
  }

  await user.save();
  console.log(`Password updated for ${user.email} (accessRole: ${user.accessRole})`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
