const AdminUser = require('../models/AdminUser');

function fmtDate(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

function parseDateOnly(str) {
  const d = new Date(str);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetweenInclusive(start, end) {
  const s = parseDateOnly(start);
  const e = parseDateOnly(end);
  if (e < s) return 0;
  return Math.floor((e - s) / 86400000) + 1;
}

function applyCap(balance, cap) {
  if (cap == null || cap === '' || Number.isNaN(Number(cap))) return balance;
  return Math.min(balance, Number(cap));
}

/**
 * Accrue annual + bank leave for one employee for dates (start..end inclusive).
 * Returns { annualAdded, bankAdded, days } or null if nothing to do.
 */
function accrueEmployeeForRange(emp, startDate, endDate) {
  const days = daysBetweenInclusive(startDate, endDate);
  if (days <= 0) return null;

  const annualRate = Number(emp.annualLeaveAccrualRate) || 0;
  const bankRate = Number(emp.bankLeaveAccrualRate) || 0;
  if (annualRate === 0 && bankRate === 0) return null;

  let annual = emp.annualLeaveBalance ?? 0;
  let bank = emp.bankLeaveBalance ?? 0;

  const annualAdded = annualRate * days;
  const bankAdded = bankRate * days;

  annual += annualAdded;
  bank += bankAdded;

  annual = applyCap(annual, emp.annualLeaveCap);
  bank = applyCap(bank, emp.bankLeaveCap);

  emp.annualLeaveBalance = Math.round(annual * 10000) / 10000;
  emp.bankLeaveBalance = Math.round(bank * 10000) / 10000;
  emp.lastLeaveAccrualDate = parseDateOnly(endDate);

  return { annualAdded, bankAdded, days };
}

/**
 * Run daily accrual for all approved employees (through yesterday UTC calendar day).
 */
async function runDailyLeaveAccrual(asOf = new Date()) {
  const end = new Date(asOf);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() - 1);
  if (Number.isNaN(end.getTime())) {
    return { processed: 0, updated: 0 };
  }

  const employees = await AdminUser.find({ isApproved: true });
  let updated = 0;

  for (const emp of employees) {
    const hire =
      emp.joiningDate ||
      emp.createdAt ||
      new Date();
    const hireDate = parseDateOnly(hire);

    let start = emp.lastLeaveAccrualDate
      ? parseDateOnly(emp.lastLeaveAccrualDate)
      : new Date(hireDate);
    start.setDate(start.getDate() + 1);

    if (start > end) continue;

    const result = accrueEmployeeForRange(emp, start, end);
    if (result) {
      await emp.save();
      updated += 1;
    } else if (!emp.lastLeaveAccrualDate && end >= hireDate) {
      emp.lastLeaveAccrualDate = end;
      await emp.save();
    }
  }

  return { processed: employees.length, updated, asOf: fmtDate(end) };
}

module.exports = {
  fmtDate,
  parseDateOnly,
  daysBetweenInclusive,
  applyCap,
  accrueEmployeeForRange,
  runDailyLeaveAccrual,
};
