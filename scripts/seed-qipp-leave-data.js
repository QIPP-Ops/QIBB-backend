/**
 * One-time QIPP leave balances + SAP planned annual leave seed.
 * Idempotent: safe to rerun (skips duplicate leaves, upserts employees by email).
 *
 *   npm run seed:qipp-leave-data
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { getMongoUri } = require('../config/database');
const AdminUser = require('../models/AdminUser');
const seedPayload = require('./qipp-seed-data.json');

const DEFAULT_PASSWORD = process.env.SEED_EMPLOYEE_PASSWORD || 'acwa_ops_2026';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function parseDateOnly(value) {
  const [y, m, d] = String(value).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function sameDay(a, b) {
  return a.getTime() === b.getTime();
}

function leaveKey(leave) {
  const start = leave.start instanceof Date ? leave.start : new Date(leave.start);
  const end = leave.end instanceof Date ? leave.end : new Date(leave.end);
  return `${String(leave.type || '').trim()}|${start.toISOString().slice(0, 10)}|${end.toISOString().slice(0, 10)}`;
}

function hasExistingLeave(leaves, candidate) {
  const key = leaveKey(candidate);
  return (leaves || []).some((lv) => leaveKey(lv) === key);
}

async function nextEmpId(email, taken) {
  const base = normalizeEmail(email).split('@')[0].replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase() || 'EMP';
  let candidate = base;
  let n = 1;
  while (taken.has(candidate)) {
    candidate = `${base}${n}`;
    n += 1;
  }
  taken.add(candidate);
  return candidate;
}

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    console.error('Set COSMOS_URI or MONGODB_URI');
    process.exit(1);
  }

  const summary = {
    employeesCreated: 0,
    employeesUpdated: 0,
    leavesInserted: 0,
    leavesSkippedExisting: 0,
    balancesUpdated: 0,
    ignoredNonAnnualLeaves: seedPayload.ignoredNonAnnualLeaves || 0,
    unmatchedEmails: [],
    errors: [],
  };

  await mongoose.connect(uri, { retryWrites: false, serverSelectionTimeoutMS: 20000 });
  console.log(`Connected to database "${mongoose.connection.db?.databaseName || 'unknown'}"`);

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const allUsers = await AdminUser.find({}).select('empId email name leaves annualLeaveBalance bankLeaveBalance');
  const byEmail = new Map(
    allUsers.map((u) => [normalizeEmail(u.email), u])
  );
  const takenEmpIds = new Set(allUsers.map((u) => u.empId));

  const balanceByEmail = new Map();
  for (const row of seedPayload.balances || []) {
    const email = normalizeEmail(row.email);
    if (!email) continue;
    const existing = balanceByEmail.get(email) || {
      email,
      name: row.name,
      annualLeaveBalance: 0,
      bankLeaveBalance: 0,
    };
    existing.name = row.name || existing.name;
    existing.annualLeaveBalance = row.annualLeaveBalance;
    if (row.bankLeaveBalance !== undefined) {
      existing.bankLeaveBalance = row.bankLeaveBalance;
    }
    balanceByEmail.set(email, existing);
  }

  const leavesByEmail = new Map();
  for (const row of seedPayload.leaves || []) {
    const email = normalizeEmail(row.email);
    if (!email) continue;
    if (!leavesByEmail.has(email)) leavesByEmail.set(email, []);
    leavesByEmail.get(email).push(row);
  }

  const touchedEmails = new Set([...balanceByEmail.keys(), ...leavesByEmail.keys()]);

  for (const email of touchedEmails) {
    const balanceRow = balanceByEmail.get(email);
    const leaveRows = leavesByEmail.get(email) || [];

    try {
      let user = byEmail.get(email);
      const isCreate = !user;

      if (!user) {
        const empId = await nextEmpId(email, takenEmpIds);
        user = new AdminUser({
          email,
          passwordHash,
          name: balanceRow?.name || email,
          empId,
          crew: 'General',
          role: 'Local Operator',
          color: 'crew-grey',
          accessRole: 'viewer',
          isApproved: true,
          isEmailVerified: true,
          leaves: [],
        });
        byEmail.set(email, user);
      } else if (balanceRow?.name) {
        user.name = balanceRow.name;
      }

      if (balanceRow) {
        user.annualLeaveBalance = balanceRow.annualLeaveBalance;
        if (balanceRow.bankLeaveBalance !== undefined) {
          user.bankLeaveBalance = balanceRow.bankLeaveBalance;
        }
        summary.balancesUpdated += 1;
      }

      for (const lv of leaveRows) {
        const candidate = {
          start: parseDateOnly(lv.start),
          end: parseDateOnly(lv.end),
          type: lv.type,
          appliedOnSap: true,
        };
        if (hasExistingLeave(user.leaves, candidate)) {
          summary.leavesSkippedExisting += 1;
          continue;
        }
        user.leaves.push(candidate);
        summary.leavesInserted += 1;
      }

      await user.save();

      if (isCreate) summary.employeesCreated += 1;
      else summary.employeesUpdated += 1;
    } catch (err) {
      summary.errors.push({ email, message: err.message });
    }
  }

  await mongoose.disconnect();
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.errors.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
