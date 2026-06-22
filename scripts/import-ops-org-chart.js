/**
 * Import qipp-ops-org-chart.json into AdminUser records.
 *
 * Sets opsTreeParentEmpId, opsTreeOrder, opsTreeRelation, position, maintenanceDepartment.
 *
 * Usage:
 *   node scripts/import-ops-org-chart.js [--dry-run] [--json path]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const AdminUser = require('../models/AdminUser');
const { getMongoUri } = require('../config/database');
const { namesMatch } = require('../utils/personnelNameMatch');
const { normalizeDepartment } = require('../utils/maintenanceDepartment');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const jsonFlag = args.indexOf('--json');
const jsonPath =
  jsonFlag >= 0
    ? args[jsonFlag + 1]
    : path.join(__dirname, '../data/qipp-ops-org-chart.json');

function findUser(users, member) {
  const email = String(member.email || '').trim().toLowerCase();
  if (email) {
    const byEmail = users.find((u) => String(u.email || '').trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }

  const empId = String(member.empId || '').trim();
  if (empId) {
    const byEmp = users.find((u) => String(u.empId || '').trim() === empId);
    if (byEmp) return byEmp;
  }

  const exact = users.find((u) => namesMatch(u.name, member.name) || namesMatch(u.name, member.displayName));
  if (exact) return exact;

  const fuzzy = users.filter(
    (u) => namesMatch(u.name, member.name) || namesMatch(u.name, member.displayName)
  );
  return fuzzy.length === 1 ? fuzzy[0] : null;
}

async function main() {
  if (!fs.existsSync(jsonPath)) {
    console.error('Missing JSON — run: node scripts/parse-ops-org-chart-html.js');
    process.exit(1);
  }

  const chart = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const uri = process.env.COSMOS_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Set COSMOS_URI or MONGODB_URI');
    process.exit(1);
  }

  await mongoose.connect(uri, { retryWrites: false });
  const users = await AdminUser.find({}).select(
    'empId name email role position maintenanceDepartment opsTreeParentEmpId opsTreeOrder opsTreeRelation'
  );

  let managerUser = findUser(users, chart.manager);
  let managerEmpId = managerUser?.empId || `SAP-${chart.manager.userId || 'MGR'}`;

  const updates = [];
  const notMatched = [];

  if (!managerUser && !dryRun) {
    console.log(`Note: manager ${chart.manager.name} not in AdminUser — members will reference empId ${managerEmpId}`);
  } else if (managerUser && !dryRun) {
    managerUser.position = chart.manager.title || managerUser.position;
    managerUser.opsTreeRelation = 'root';
    managerUser.opsTreeParentEmpId = '';
    await managerUser.save();
    updates.push({ empId: managerUser.empId, name: managerUser.name, action: 'manager-root' });
  }

  for (const member of chart.members || []) {
    const user = findUser(users, member);
    if (!user) {
      notMatched.push(member.name);
      continue;
    }

    const patch = {
      empId: user.empId,
      name: user.name,
      opsTreeParentEmpId: managerEmpId,
      opsTreeOrder: member.treeOrder,
      opsTreeRelation: 'child',
      opsGroupLabel: chart.manager.title || 'Operations',
    };

    if (member.role) patch.role = member.role;
    if (member.title) patch.position = member.title;
    if (member.crew) patch.crew = member.crew;
    if (member.email && !user.email) patch.email = member.email;
    if (member.empId && !user.empId) patch.empId = member.empId;

    const dept = normalizeDepartment(member.maintenanceDepartment);
    if (dept) patch.maintenanceDepartment = dept;

    if (!dryRun) {
      Object.assign(user, patch);
      await user.save();
    }
    updates.push(patch);
  }

  console.log('\n--- Import summary ---');
  console.log(`Dry run: ${dryRun}`);
  console.log(`Manager: ${chart.manager.name}`);
  console.log(`Updated: ${updates.length}`);
  console.log(`Not matched: ${notMatched.length}`);
  if (notMatched.length) {
    console.log('Unmatched:', notMatched.join(', '));
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
