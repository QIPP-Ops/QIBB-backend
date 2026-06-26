process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config({ path: 'C:/Users/asus/Downloads/.env' });
const mongoose = require('mongoose');
const AdminUser = require('../models/AdminUser');

async function tryUri(label, uri) {
  let fixed = uri.replace(/^mongodb\+srv:\/\/mongodb\+srv:\/\//, 'mongodb+srv://');
  console.log(`\n=== ${label} ===`);
  console.log('Host:', fixed.split('@').pop()?.slice(0, 100));
  try {
    await mongoose.connect(fixed, { serverSelectionTimeoutMS: 25000 });
    const filter = {
      isApproved: true,
      isActive: { $ne: false },
      hiddenFromLeaveTimesheet: { $ne: true },
    };
    const users = await AdminUser.find(filter)
      .select('name fullName empId crew role annualLeaveBalance bankLeaveBalance compensateDayBalance leaves isApproved isActive')
      .lean();
    console.log('SUCCESS — users:', users.length);
    const s = users[0];
    if (s) {
      console.log('Sample:', {
        name: s.fullName || s.name,
        empId: s.empId,
        crew: s.crew,
        role: s.role,
        annual: s.annualLeaveBalance,
        bank: s.bankLeaveBalance,
        compensate: s.compensateDayBalance,
        leaves: (s.leaves || []).length,
      });
    }
    await mongoose.disconnect();
    return users;
  } catch (e) {
    console.error('FAIL:', e.message);
    try { await mongoose.disconnect(); } catch (_) {}
    return null;
  }
}

async function main() {
  require('dotenv').config(); // backend .env
  const backendUri = process.env.MONGODB_URI;
  const downloadsUri = require('dotenv').parse(
    require('fs').readFileSync('C:/Users/asus/Downloads/.env')
  ).MONGODB_URI;

  let users = await tryUri('Downloads .env (Azure)', downloadsUri);
  if (!users) {
    users = await tryUri('Backend .env (Atlas)', backendUri);
  }
  if (!users) process.exit(1);
}

main();
