require('dotenv').config();
const mongoose = require('mongoose');
const AdminUser = require('../models/AdminUser');

async function main() {
  const uri = process.env.MONGODB_URI;
  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log('Connected!');

  const filter = {
    isApproved: true,
    isActive: { $ne: false },
    hiddenFromLeaveTimesheet: { $ne: true },
  };

  const users = await AdminUser.find(filter)
    .select('name fullName empId crew role annualLeaveBalance bankLeaveBalance compensateDayBalance leaves isApproved isActive hiddenFromLeaveTimesheet')
    .lean();

  console.log('Active approved users:', users.length);

  const withLeaves = users.filter((u) => (u.leaves || []).length > 0);
  console.log('Users with leaves:', withLeaves.length);

  const sample = users[0];
  if (sample) {
    console.log('Sample user:', JSON.stringify({
      name: sample.fullName || sample.name,
      empId: sample.empId,
      crew: sample.crew,
      role: sample.role,
      annual: sample.annualLeaveBalance,
      bank: sample.bankLeaveBalance,
      compensate: sample.compensateDayBalance,
      leaves: (sample.leaves || []).slice(0, 2).map((l) => ({
        start: l.start,
        end: l.end,
        type: l.type,
        status: l.status,
      })),
    }, null, 2));
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
